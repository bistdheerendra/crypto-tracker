/**
 * Training/inference encoding shared with scripts/extract-training-data.ts.
 *
 * Source of truth for *which* columns the live model uses:
 *   joblib.load("ml/models/baseline_classifier.joblib")["feature_columns"]
 * (printed 2026-07-24 from baseline_classifier.joblib).
 *
 * Pair one-hot naming matches extract-training-data.ts:
 *   `pair_${pair.replace(/[^a-zA-Z0-9]/g, "_")}`
 */

/** Exact column list & order from the saved model bundle. */
export const MODEL_FEATURE_COLUMNS = [
  "directionEncoded",
  "confidenceTierEncoded",
  "hourOfDay",
  "dayOfWeek",
  "ema50",
  "ema200",
  "rsi14",
  "priceDistanceToEma50Pct",
  "distanceToNearestSwingPct",
  "rsiMomentum",
  "volatilityRegime",
  "price24hChangePct",
  "fearGreedIndex",
  "trendingScore",
  "fearGreedRoc",
  "dxyChangePct",
  "spxChangePct",
  "goldChangePct",
  "laneAgreementCount",
  "pair_BNB_USDT",
  "pair_BTC_USDT",
  "pair_ETH_USDT",
  "pair_PAXG_USDT",
  "pair_SOL_USDT",
  "pair_XRP_USDT",
] as const;

export type ModelFeatureColumn = (typeof MODEL_FEATURE_COLUMNS)[number];

/** Pair one-hot columns present in the trained model (subset of MODEL_FEATURE_COLUMNS). */
export const MODEL_PAIR_COLUMNS = [
  "pair_BNB_USDT",
  "pair_BTC_USDT",
  "pair_ETH_USDT",
  "pair_PAXG_USDT",
  "pair_SOL_USDT",
  "pair_XRP_USDT",
] as const;

/** Same encoding as scripts/extract-training-data.ts encodeConfidenceTier. */
export function encodeConfidenceTier(tier: string): number {
  switch (tier.toUpperCase()) {
    case "LOW":
      return 1;
    case "MODERATE":
      return 2;
    case "HIGH":
      return 3;
    default:
      return 0;
  }
}

/** Same encoding as scripts/extract-training-data.ts encodeDirection. */
export function encodeDirection(direction: string): number {
  return direction.toUpperCase() === "LONG" ? 1 : -1;
}

/** Same slug as scripts/extract-training-data.ts pairColumns. */
export function pairColumnName(pair: string): string {
  return `pair_${pair.replace(/[^a-zA-Z0-9]/g, "_")}`;
}
