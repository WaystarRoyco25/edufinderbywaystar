import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  normalizeGeniusDraftPayload,
  stableGeniusInputHash,
  validateGeniusStartProfile,
} from "./intake";
import { generateGeniusBoard } from "./pipeline";
import type {
  GeniusAiBoard,
  GeniusBoardFeedback,
  GeniusBoardStatus,
  GeniusDraftPayload,
  GeniusModelSelection,
  GeniusSignalProfile,
  GeniusVerificationResult,
} from "./types";

export const GENIUS_DRAFT_COLUMNS =
  "id, user_id, payload, created_at, updated_at";

export const GENIUS_BOARD_COLUMNS =
  "id, user_id, draft_id, status, input_hash, signal_profile, board_json, verification_json, model_usage, feedback_json, error_message, created_at, updated_at, started_at, completed_at";

export type GeniusDraftRow = {
  id: string;
  user_id: string;
  payload: unknown;
  created_at: string;
  updated_at: string;
};

export type GeniusBoardRow = {
  id: string;
  user_id: string;
  // Null once the editor draft is scrapped on re-purchase; the board row and
  // its snapshotted signal_profile/board_json survive (history is kept).
  draft_id: string | null;
  status: GeniusBoardStatus;
  input_hash: string;
  signal_profile: unknown;
  board_json: unknown;
  verification_json: unknown;
  model_usage: unknown;
  feedback_json: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export function geniusBoardUrl(boardId: string): string {
  return `/genius?boardId=${encodeURIComponent(boardId)}`;
}

export async function loadGeniusDraftForUser(
  admin: SupabaseAdmin,
  userId: string,
): Promise<GeniusDraftRow | null> {
  const { data, error } = await admin
    .from("genius_editor_drafts")
    .select(GENIUS_DRAFT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as GeniusDraftRow | null) ?? null;
}

export async function upsertGeniusDraftForUser(
  admin: SupabaseAdmin,
  userId: string,
  payload: unknown,
): Promise<GeniusDraftRow> {
  const now = new Date();
  const normalized = normalizeGeniusDraftPayload(payload, now);
  const { data, error } = await admin
    .from("genius_editor_drafts")
    .upsert(
      {
        user_id: userId,
        payload: normalized,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select(GENIUS_DRAFT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not save Genius draft.");
  }
  return data as GeniusDraftRow;
}

export async function findReusableGeniusBoard(
  admin: SupabaseAdmin,
  draftId: string,
  inputHash: string,
): Promise<GeniusBoardRow | null> {
  const { data, error } = await admin
    .from("genius_editor_boards")
    .select(GENIUS_BOARD_COLUMNS)
    .eq("draft_id", draftId)
    .eq("input_hash", inputHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as GeniusBoardRow | null) ?? null;
}

export async function createQueuedGeniusBoard(
  admin: SupabaseAdmin,
  draft: GeniusDraftRow,
): Promise<GeniusBoardRow> {
  const payload = normalizeGeniusDraftPayload(draft.payload);
  const profileIssues = validateGeniusStartProfile(payload.signalProfile);
  if (profileIssues.length) throw new Error(profileIssues.join(" "));

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("genius_editor_boards")
    .insert({
      user_id: draft.user_id,
      draft_id: draft.id,
      status: "queued",
      input_hash: stableGeniusInputHash(payload.signalProfile),
      signal_profile: payload.signalProfile,
      feedback_json: payload.signalProfile.feedback,
      updated_at: now,
    })
    .select(GENIUS_BOARD_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create Genius board.");
  }
  return data as GeniusBoardRow;
}

export async function loadGeniusBoardById(
  admin: SupabaseAdmin,
  boardId: string,
): Promise<GeniusBoardRow | null> {
  const { data, error } = await admin
    .from("genius_editor_boards")
    .select(GENIUS_BOARD_COLUMNS)
    .eq("id", boardId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as GeniusBoardRow | null) ?? null;
}

// Every board the user has generated, newest first, for the dashboard.
export async function listGeniusBoardsForUser(
  admin: SupabaseAdmin,
  userId: string,
): Promise<GeniusBoardRow[]> {
  const { data, error } = await admin
    .from("genius_editor_boards")
    .select(GENIUS_BOARD_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data as GeniusBoardRow[] | null) ?? [];
}

async function loadOldestQueuedGeniusBoard(
  admin: SupabaseAdmin,
): Promise<GeniusBoardRow | null> {
  const { data, error } = await admin
    .from("genius_editor_boards")
    .select(GENIUS_BOARD_COLUMNS)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as GeniusBoardRow | null) ?? null;
}

async function markGeniusBoardProcessing(
  admin: SupabaseAdmin,
  boardId: string,
): Promise<GeniusBoardRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("genius_editor_boards")
    .update({
      status: "processing",
      started_at: now,
      updated_at: now,
      error_message: null,
    })
    .eq("id", boardId)
    .eq("status", "queued")
    .select(GENIUS_BOARD_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as GeniusBoardRow | null) ?? null;
}

async function loadGeniusDraftById(
  admin: SupabaseAdmin,
  draftId: string,
): Promise<GeniusDraftRow> {
  const { data, error } = await admin
    .from("genius_editor_drafts")
    .select(GENIUS_DRAFT_COLUMNS)
    .eq("id", draftId)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Genius draft not found.");
  return data as GeniusDraftRow;
}

async function markGeniusBoardDone(
  admin: SupabaseAdmin,
  boardId: string,
  result: {
    status: Extract<GeniusBoardStatus, "completed" | "needs_review">;
    signalProfile: GeniusSignalProfile;
    board: GeniusAiBoard;
    verification: GeniusVerificationResult;
    modelSelection: GeniusModelSelection;
  },
) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("genius_editor_boards")
    .update({
      status: result.status,
      signal_profile: result.signalProfile,
      board_json: result.board,
      verification_json: result.verification,
      model_usage: result.modelSelection,
      completed_at: now,
      updated_at: now,
      error_message: null,
    })
    .eq("id", boardId);
  if (error) throw new Error(error.message);
}

async function markGeniusBoardFailed(
  admin: SupabaseAdmin,
  boardId: string,
  error: unknown,
) {
  const now = new Date().toISOString();
  const message = error instanceof Error ? error.message : "Unknown Genius generation error.";
  const { error: updateError } = await admin
    .from("genius_editor_boards")
    .update({
      status: "failed",
      error_message: message,
      completed_at: now,
      updated_at: now,
    })
    .eq("id", boardId);
  if (updateError) throw new Error(updateError.message);
}

export async function processNextQueuedGeniusBoard(): Promise<{
  processed: boolean;
  boardId: string | null;
  status: GeniusBoardStatus | null;
}> {
  const admin = createSupabaseAdminClient();
  const queued = await loadOldestQueuedGeniusBoard(admin);
  if (!queued) return { processed: false, boardId: null, status: null };

  const board = await markGeniusBoardProcessing(admin, queued.id);
  if (!board) return { processed: false, boardId: queued.id, status: null };

  try {
    if (!board.draft_id) {
      throw new Error(
        "The board's editor draft was removed before generation could start.",
      );
    }
    const draft = await loadGeniusDraftById(admin, board.draft_id);
    const result = await generateGeniusBoard(draft.payload);
    await markGeniusBoardDone(admin, board.id, result);
    return { processed: true, boardId: board.id, status: result.status };
  } catch (error) {
    await markGeniusBoardFailed(admin, board.id, error);
    return { processed: true, boardId: board.id, status: "failed" };
  }
}

export async function updateGeniusBoardFeedback(
  admin: SupabaseAdmin,
  boardId: string,
  feedback: GeniusBoardFeedback,
): Promise<void> {
  const { error } = await admin
    .from("genius_editor_boards")
    .update({
      feedback_json: feedback,
      updated_at: new Date().toISOString(),
    })
    .eq("id", boardId);
  if (error) throw new Error(error.message);
}

export function normalizeStoredGeniusPayload(value: unknown): GeniusDraftPayload {
  return normalizeGeniusDraftPayload(value);
}
