/**
 * Build the inference feature dict the model expects.
 * Encoding mirrors scripts/extract-training-data.ts; column set mirrors
 * ml/models/baseline_classifier.joblib["feature_columns"].
 */
import type { VerdictFeaturePayload } from "@/lib/verdicts/features";
import {
  encodeConfidenceTier,
  encodeDirection,
  MODEL_FEATURE_COLUMNS,
  MODEL_PAIR_COLUMNS,
  pairColumnName,
  type ModelFeatureColumn,
} from "./encoding";

export type MlFeatureVector = Record<ModelFeatureColumn, number | null>;

export function buildMlFeatureVector(
  features: VerdictFeaturePayload,
  direction: string
): MlFeatureVector {
  const activePairCol = pairColumnName(features.pair);

  const base: Record<string, number | null> = {
    directionEncoded: encodeDirection(direction),
    confidenceTierEncoded: encodeConfidenceTier(features.confidenceTier),
    hourOfDay: features.hourOfDay,
    dayOfWeek: features.dayOfWeek,
    ema50: features.ema50,
    ema200: features.ema200,
    rsi14: features.rsi14,
    priceDistanceToEma50Pct: features.priceDistanceToEma50Pct,
    distanceToNearestSwingPct: features.distanceToNearestSwingPct,
    rsiMomentum: features.rsiMomentum,
    volatilityRegime: features.volatilityRegime,
    oiChangePct: features.oiChangePct,
    fundingRate: features.fundingRate,
    longShortRatio: features.longShortRatio,
    price24hChangePct: features.price24hChangePct,
    fearGreedIndex: features.fearGreedIndex,
    trendingScore: features.trendingScore,
    fearGreedRoc: features.fearGreedRoc,
    dxyChangePct: features.dxyChangePct,
    spxChangePct: features.spxChangePct,
    goldChangePct: features.goldChangePct,
    laneAgreementCount: features.laneAgreementCount,
  };

  for (const col of MODEL_PAIR_COLUMNS) {
    base[col] = col === activePairCol ? 1 : 0;
  }

  const out = {} as MlFeatureVector;
  for (const col of MODEL_FEATURE_COLUMNS) {
    out[col] = base[col] ?? null;
  }
  return out;
}
