/**
 * Calculates the new ELO ratings for two parks after a head-to-head matchup
 * 
 * @param winnerRating Current ELO rating of the winning park
 * @param loserRating Current ELO rating of the losing park
 * @param kFactor The K-factor determines how much ratings can change (default: 32)
 * @returns New ratings for both parks
 */
export function calculateEloRating(
  winnerRating: number,
  loserRating: number,
  kFactor: number = 32
): { winnerNewRating: number; loserNewRating: number } {
  // Calculate expected outcome for both players
  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));

  // Calculate new ratings
  const winnerNewRating = Math.round(winnerRating + kFactor * (1 - expectedWinner));
  const loserNewRating = Math.round(loserRating + kFactor * (0 - expectedLoser));

  return { winnerNewRating, loserNewRating };
}
