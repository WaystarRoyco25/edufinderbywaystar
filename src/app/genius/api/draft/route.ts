import { NextResponse } from "next/server";
import { normalizeGeniusDraftPayload } from "@/lib/genius/intake";
import {
  loadGeniusDraftForUser,
  upsertGeniusDraftForUser,
} from "@/lib/genius/server";
import { countAvailableGeniusCredits } from "@/lib/genius/purchase";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser() {
  const authed = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authed.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  try {
    const draft = await loadGeniusDraftForUser(admin, user.id);
    // The editor is paywalled: it only opens for a user holding an unused
    // editor credit, so the Genius page can route an unpaid user to
    // checkout before revealing any questions.
    const credits = await countAvailableGeniusCredits(admin, user.id);
    return NextResponse.json({ draft, canStartEditor: credits > 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Genius draft.";
    console.error("genius draft lookup failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { payload?: unknown } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  try {
    const payload = normalizeGeniusDraftPayload(body.payload);
    const draft = await upsertGeniusDraftForUser(admin, user.id, payload);
    return NextResponse.json({ draft });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save Genius draft.";
    console.error("genius draft save failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
