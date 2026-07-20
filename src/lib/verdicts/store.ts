import type { LaneOutput, Verdict } from "../types";
import { generateSeedVerdicts } from "./seed";
import { laneBiasesFromLanes, TIER_ORDER, type StoredVerdict, type VerdictOutcome } from "./types";

let verdicts: StoredVerdict[] | null = null;

function ensureLoaded(): StoredVerdict[] {
  if (!verdicts) {
    verdicts = generateSeedVerdicts();
  }
  return verdicts;
}

export function getAllVerdicts(): StoredVerdict[] {
  return [...ensureLoaded()];
}

export function getVerdictById(id: string): StoredVerdict | undefined {
  return ensureLoaded().find((v) => v.id === id);
}

export function getOpenVerdicts(): StoredVerdict[] {
  return ensureLoaded().filter((v) => v.outcome === "open");
}

export function queryVerdicts(filters: {
  pair?: string;
  from?: Date;
  to?: Date;
  minTier?: "HIGH" | "MODERATE" | "LOW";
  resolvedOnly?: boolean;
}): StoredVerdict[] {
  const minTierLevel = filters.minTier ? TIER_ORDER[filters.minTier] : 0;

  return ensureLoaded().filter((v) => {
    if (filters.pair && v.pair !== filters.pair) return false;
    const created = new Date(v.createdAt);
    if (filters.from && created < filters.from) return false;
    if (filters.to && created > filters.to) return false;
    if (minTierLevel > 0 && TIER_ORDER[v.confidenceTier] < minTierLevel) return false;
    if (filters.resolvedOnly && (!v.outcome || v.outcome === "open" || v.rMultiple === null)) {
      return false;
    }
    return true;
  });
}

export function saveVerdict(verdict: Verdict, lanes: LaneOutput[]): StoredVerdict {
  const list = ensureLoaded();
  const stored: StoredVerdict = {
    id: `v-live-${Date.now()}`,
    pair: verdict.pair,
    timeframe: verdict.timeframe,
    direction: verdict.direction,
    confidenceTier: verdict.tier,
    entryPrice: verdict.entry,
    stopLoss: verdict.stopLoss,
    takeProfit1: verdict.takeProfit1,
    takeProfit2: verdict.takeProfit2,
    laneBiases: laneBiasesFromLanes(lanes),
    createdAt: new Date().toISOString(),
    outcome: verdict.direction === "NEUTRAL" ? "expired" : "open",
    outcomePrice: null,
    outcomeAt: null,
    rMultiple: null,
  };
  list.push(stored);
  return stored;
}

export function resolveVerdict(
  id: string,
  update: {
    outcome: VerdictOutcome;
    outcomePrice: number;
    outcomeAt: string;
    rMultiple: number;
  }
): StoredVerdict | null {
  const list = ensureLoaded();
  const idx = list.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...update };
  return list[idx];
}
