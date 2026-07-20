import type { Bias, Direction, LaneOutput, Tier } from "../types";

export type VerdictOutcome = "tp1_hit" | "tp2_hit" | "sl_hit" | "expired" | "open";

export interface LaneBiases {
  technical: Bias;
  flow: Bias;
  narrative: Bias;
  macro: Bias;
}

export interface StoredVerdict {
  id: string;
  pair: string;
  timeframe: string;
  direction: Direction;
  confidenceTier: Tier;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  laneBiases: LaneBiases;
  createdAt: string;
  outcome: VerdictOutcome | null;
  outcomePrice: number | null;
  outcomeAt: string | null;
  rMultiple: number | null;
}

export function laneBiasesFromLanes(lanes: LaneOutput[]): LaneBiases {
  const map: Record<string, Bias> = {};
  for (const lane of lanes) {
    map[lane.lane.toLowerCase()] = lane.bias;
  }
  return {
    technical: map.technical ?? "MIXED",
    flow: map.flow ?? "MIXED",
    narrative: map.narrative ?? "MIXED",
    macro: map.macro ?? "MIXED",
  };
}

export const TIER_ORDER: Record<Tier, number> = {
  HIGH: 3,
  MODERATE: 2,
  LOW: 1,
};

export const MIN_SIM_TRADES = 5;
