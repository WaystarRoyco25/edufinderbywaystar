import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Which EduFinder services a user has engaged with. Drives the sidebar's
 * "Explore" treatment and the per-tab cross-sell cards. A service counts as
 * owned once the user has either paid for it or has a generated artifact.
 */
export type ServiceOwnership = {
  challenge: boolean;
  insight: boolean;
  genius: boolean;
};

async function hasAnyRow(
  admin: SupabaseAdmin,
  table: string,
  userId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export async function loadServiceOwnership(
  admin: SupabaseAdmin,
  userId: string,
): Promise<ServiceOwnership> {
  const [
    challengePurchases,
    modules,
    reportPurchases,
    reports,
    geniusPurchases,
    boards,
  ] = await Promise.all([
    hasAnyRow(admin, "purchases", userId),
    hasAnyRow(admin, "modules", userId),
    hasAnyRow(admin, "report_purchases", userId),
    hasAnyRow(admin, "prediction_reports", userId),
    hasAnyRow(admin, "genius_purchases", userId),
    hasAnyRow(admin, "genius_editor_boards", userId),
  ]);

  return {
    challenge: challengePurchases || modules,
    insight: reportPurchases || reports,
    genius: geniusPurchases || boards,
  };
}
