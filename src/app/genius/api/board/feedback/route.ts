import { NextResponse } from "next/server";
import { canUserAccessGeniusBoard } from "@/lib/genius/access";
import {
  loadGeniusBoardById,
  updateGeniusBoardFeedback,
} from "@/lib/genius/server";
import type { GeniusBoardFeedback } from "@/lib/genius/types";
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

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 50)
    : [];
}

function normalizeFeedback(value: unknown): GeniusBoardFeedback {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return {
    likedAngleIds: cleanStringArray(row.likedAngleIds),
    dismissedAngleIds: cleanStringArray(row.dismissedAngleIds),
    refreshedAngleIds: cleanStringArray(row.refreshedAngleIds),
    notes: typeof row.notes === "string" ? row.notes.trim().slice(0, 1000) : "",
  };
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { boardId?: unknown; feedback?: unknown }
    | null;
  const boardId = typeof body?.boardId === "string" ? body.boardId : "";
  if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  try {
    const board = await loadGeniusBoardById(admin, boardId);
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    if (!canUserAccessGeniusBoard(user.id, board)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const feedback = normalizeFeedback(body?.feedback);
    await updateGeniusBoardFeedback(admin, board.id, feedback);
    return NextResponse.json({ ok: true, feedback });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save Genius feedback.";
    console.error("genius feedback save failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
