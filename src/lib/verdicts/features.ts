import type { Bias, LaneOutput, Tier } from "../types";

/** Raw numeric inputs captured once at verdict-creation time for ML training. */
export interface VerdictFeaturePayload {
  // Technical
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  priceDistanceToEma50Pct: number | null;
  distanceToNearestSwingPct: number | null;

  // Flow
  oiChangePct: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  price24hChangePct: number | null;

  // Narrative
  fearGreedIndex: number | null;
  globalMcapChangePct: number | null;
  trendingScore: number | null;

  // Macro
  dxyChangePct: number | null;
  spxChangePct: number | null;
  goldChangePct: number | null;

  // Meta
  confidenceTier: Tier;
  laneAgreementCount: number;
  pair: string;
  timeframe: string;
  hourOfDay: number;
  dayOfWeek: number;
}

export interface TechnicalRawFeatures {
  ema50: number;
  ema200: number;
  rsi14: number;
  priceDistanceToEma50Pct: number;
  distanceToNearestSwingPct: number;
}

export interface FlowRawFeatures {
  oiChangePct: number | null;
  fundingRate: number | null;
  longShortRatio: number | null;
  price24hChangePct: number;
}

export interface NarrativeRawFeatures {
  fearGreedIndex: number | null;
  globalMcapChangePct: number | null;
  trendingScore: number;
}

export interface MacroRawFeatures {
  dxyChangePct: number | null;
  spxChangePct: number | null;
  goldChangePct: number | null;
}

/** Lane runner result: public LaneOutput + optional raw numerics (stripped from API). */
export interface LaneRunResult {
  output: LaneOutput;
  raw:
    | TechnicalRawFeatures
    | FlowRawFeatures
    | NarrativeRawFeatures
    | MacroRawFeatures
    | null;
}

export function laneAgreementCount(lanes: LaneOutput[]): number {
  const counts: Record<Bias, number> = { BULL: 0, BEAR: 0, MIXED: 0 };
  for (const l of lanes) counts[l.bias]++;
  return Math.max(counts.BULL, counts.BEAR, counts.MIXED);
}

export function buildVerdictFeatures(args: {
  pair: string;
  timeframe: string;
  confidenceTier: Tier;
  lanes: LaneOutput[];
  technical: TechnicalRawFeatures | null;
  flow: FlowRawFeatures | null;
  narrative: NarrativeRawFeatures | null;
  macro: MacroRawFeatures | null;
  at?: Date;
}): VerdictFeaturePayload {
  const at = args.at ?? new Date();
  return {
    ema50: args.technical?.ema50 ?? null,
    ema200: args.technical?.ema200 ?? null,
    rsi14: args.technical?.rsi14 ?? null,
    priceDistanceToEma50Pct: args.technical?.priceDistanceToEma50Pct ?? null,
    distanceToNearestSwingPct: args.technical?.distanceToNearestSwingPct ?? null,

    oiChangePct: args.flow?.oiChangePct ?? null,
    fundingRate: args.flow?.fundingRate ?? null,
    longShortRatio: args.flow?.longShortRatio ?? null,
    price24hChangePct: args.flow?.price24hChangePct ?? null,

    fearGreedIndex: args.narrative?.fearGreedIndex ?? null,
    globalMcapChangePct: args.narrative?.globalMcapChangePct ?? null,
    trendingScore: args.narrative?.trendingScore ?? null,

    dxyChangePct: args.macro?.dxyChangePct ?? null,
    spxChangePct: args.macro?.spxChangePct ?? null,
    goldChangePct: args.macro?.goldChangePct ?? null,

    confidenceTier: args.confidenceTier,
    laneAgreementCount: laneAgreementCount(args.lanes),
    pair: args.pair,
    timeframe: args.timeframe,
    hourOfDay: at.getUTCHours(),
    dayOfWeek: at.getUTCDay(),
  };
}
