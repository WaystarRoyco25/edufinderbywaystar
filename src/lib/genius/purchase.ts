import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Genius! Editor purchase credits. Each row in `genius_purchases` with a
 * NULL `consumed_at` is one unused editor-run credit. Generating an AI
 * idea board spends one credit; scrapping a board never refunds it.
 */

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

// How many paid-but-unused editor credits the user currently holds.
export async function countAvailableGeniusCredits(
  admin: SupabaseAdmin,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("genius_purchases")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("consumed_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

// Atomically claims one unused editor credit for the user. Returns the
// claimed genius_purchases.id, or null when the user holds no unused credit.
//
// `UPDATE ... WHERE id = ? AND consumed_at IS NULL` is atomic per row, so two
// concurrent claims of the same row can never both win. The loop lets a user
// holding several credits fall through to the next free row when a concurrent
// request grabs the one this call pre-selected, instead of a spurious refusal.
export async function claimGeniusCredit(
  admin: SupabaseAdmin,
  userId: string,
): Promise<string | null> {
  // Bounded so a pathological storm of concurrent requests cannot spin
  // forever; far beyond any realistic per-user credit count.
  for (let attempt = 0; attempt < 25; attempt++) {
    const { data: candidate, error: selectError } = await admin
      .from("genius_purchases")
      .select("id")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (selectError) throw new Error(selectError.message);
    if (!candidate) return null;

    const { data: claimed, error: claimError } = await admin
      .from("genius_purchases")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", candidate.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (claimed) return claimed.id;
    // A concurrent request claimed this row first — retry with the next one.
  }
  return null;
}

// Links a freshly claimed credit to the board it paid for. Best-effort: the
// credit is already spent, so a failure here is logged but never fails the
// caller's generation flow.
export async function linkGeniusCreditToBoard(
  admin: SupabaseAdmin,
  creditId: string,
  boardId: string,
): Promise<void> {
  const { error } = await admin
    .from("genius_purchases")
    .update({ consumed_board_id: boardId })
    .eq("id", creditId);
  if (error) {
    console.error("linkGeniusCreditToBoard failed", { creditId, boardId, error });
  }
}

// Returns a claimed credit to the unused pool when board creation failed
// after the claim. Guards on consumed_board_id IS NULL so a credit already
// linked to a board can never be released out from under it.
export async function releaseGeniusCredit(
  admin: SupabaseAdmin,
  creditId: string,
): Promise<void> {
  const { error } = await admin
    .from("genius_purchases")
    .update({ consumed_at: null })
    .eq("id", creditId)
    .is("consumed_board_id", null);
  if (error) {
    console.error("releaseGeniusCredit failed", { creditId, error });
  }
}

// True once the user has at least one generated board. Used to tell a
// first-time buyer apart from a returning buyer who is starting over.
export async function userHasGeneratedBoard(
  admin: SupabaseAdmin,
  userId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from("genius_editor_boards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// Deletes the user's Genius editor draft so a returning buyer starts from a
// blank editor. The `genius_editor_boards.draft_id` foreign key is ON DELETE
// SET NULL, so previously generated boards are kept and stay visible in the
// dashboard; only the draft is scrapped.
export async function scrapUserGeniusData(
  admin: SupabaseAdmin,
  userId: string,
): Promise<void> {
  const { error } = await admin
    .from("genius_editor_drafts")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
