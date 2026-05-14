export type OwnedReportRow = {
  user_id: string;
};

export function canUserAccessReport(
  userId: string | null | undefined,
  report: OwnedReportRow | null | undefined,
): boolean {
  return Boolean(userId && report && report.user_id === userId);
}
