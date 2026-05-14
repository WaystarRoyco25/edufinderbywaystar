import { NextResponse } from "next/server";
import { canUserAccessGeniusBoard } from "@/lib/genius/access";
import {
  geniusBoardUrl,
  loadGeniusBoardById,
} from "@/lib/genius/server";
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

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const boardId = new URL(request.url).searchParams.get("boardId");
  if (!boardId) {
    return NextResponse.json({ error: "boardId is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  try {
    const board = await loadGeniusBoardById(admin, boardId);
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }
    if (!canUserAccessGeniusBoard(user.id, board)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      boardId: board.id,
      status: board.status,
      boardUrl: geniusBoardUrl(board.id),
      board: board.board_json,
      verification: board.verification_json,
      feedback: board.feedback_json,
      modelUsage: board.model_usage,
      error: board.error_message,
      updatedAt: board.updated_at,
      completedAt: board.completed_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Genius board.";
    console.error("genius board status lookup failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
