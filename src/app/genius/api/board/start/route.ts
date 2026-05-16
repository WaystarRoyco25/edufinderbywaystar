import { NextResponse, after } from "next/server";
import {
  stableGeniusInputHash,
  validateGeniusStartProfile,
} from "@/lib/genius/intake";
import {
  createQueuedGeniusBoard,
  findReusableGeniusBoard,
  geniusBoardUrl,
  loadGeniusDraftForUser,
  normalizeStoredGeniusPayload,
  processNextQueuedGeniusBoard,
} from "@/lib/genius/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// 800s is the Vercel Fluid compute ceiling. The start route kicks off board
// generation via after(), so it needs the same long runway as the worker.
export const maxDuration = 800;

async function getAuthenticatedUser() {
  const authed = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user;
}

export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  try {
    const draft = await loadGeniusDraftForUser(admin, user.id);
    if (!draft) {
      return NextResponse.json(
        { error: "Save the Genius draft before starting AI generation." },
        { status: 409 },
      );
    }

    const payload = normalizeStoredGeniusPayload(draft.payload);
    const issues = validateGeniusStartProfile(payload.signalProfile);
    if (issues.length > 0) {
      return NextResponse.json({ error: issues.join(" ") }, { status: 400 });
    }

    const inputHash = stableGeniusInputHash(payload.signalProfile);
    const reusable = await findReusableGeniusBoard(admin, draft.id, inputHash);
    const board = reusable ?? (await createQueuedGeniusBoard(admin, draft));

    after(() => processNextQueuedGeniusBoard());

    return NextResponse.json({
      boardId: board.id,
      status: board.status,
      boardUrl: geniusBoardUrl(board.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Genius AI board.";
    console.error("genius board start failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
