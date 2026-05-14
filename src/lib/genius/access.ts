export type OwnedGeniusBoardRow = {
  user_id: string;
};

export function canUserAccessGeniusBoard(
  userId: string,
  board: OwnedGeniusBoardRow | null,
): boolean {
  return Boolean(board && board.user_id === userId);
}
