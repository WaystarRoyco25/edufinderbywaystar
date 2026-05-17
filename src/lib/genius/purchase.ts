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

// Spends one unused credit on the given board. Returns false when the
// user had no unused credit, so the caller can refuse to generate.
export async function consumeGeniusCredit(
  admin: SupabaseAdmin,
  userId: string,
  boardId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("genius_purchases")
    .select("id")
    .eq("user_id", userId)
    .is("consumed_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;

  const { error: updateError } = await admin
    .from("genius_purchases")
    .update({
      consumed_at: new Date().toISOString(),
      consumed_board_id: boardId,
    })
    .eq("id", data.id)
    .is("consumed_at", null);
  if (updateError) throw new Error(updateError.message);
  return true;
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
