/**
 * Personal journal R-multiple at an exit/mark price.
 * Same formula as journal unrealized PnL and resolver expired branch:
 * risk = |entry − SL| (fallback 1% of entry); R = directional move / risk.
 */
export function computeExitRMultiple(
  direction: string,
  entryPrice: number,
  stopLoss: number,
  exitPrice: number
): number | null {
  if (direction !== "LONG" && direction !== "SHORT") return null;
  const risk = Math.abs(entryPrice - stopLoss) || entryPrice * 0.01;
  if (!(risk > 0)) return null;
  const move =
    direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return parseFloat((move / risk).toFixed(2));
}
