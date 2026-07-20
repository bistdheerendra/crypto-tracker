import type { Bias, Tier } from "../types";
import type { LaneBiases, StoredVerdict } from "../verdicts/types";

export interface TrackRecordStats {
  winRate: number;
  totalSignals: number;
  resolvedCount: number;
  avgRMultiple: number;
  tierWinRates: Record<Tier, { wins: number; total: number; winRate: number }>;
  laneAccuracy: Record<
    keyof LaneBiases,
    { correct: number; total: number; accuracy: number }
  >;
  computedAt: string;
}

function isWin(outcome: StoredVerdict["outcome"]): boolean {
  return outcome === "tp1_hit" || outcome === "tp2_hit";
}

function winningDirection(v: StoredVerdict): "LONG" | "SHORT" | null {
  if (!v.outcome || v.outcome === "open") return null;
  if (isWin(v.outcome)) return v.direction === "LONG" || v.direction === "SHORT" ? v.direction : null;
  if (v.outcome === "sl_hit") {
    return v.direction === "LONG" ? "SHORT" : v.direction === "SHORT" ? "LONG" : null;
  }
  if (v.rMultiple !== null && v.rMultiple > 0) return v.direction === "LONG" || v.direction === "SHORT" ? v.direction : null;
  if (v.rMultiple !== null && v.rMultiple < 0) {
    return v.direction === "LONG" ? "SHORT" : v.direction === "SHORT" ? "LONG" : null;
  }
  return null;
}

function laneMatches(bias: Bias, direction: "LONG" | "SHORT"): boolean {
  if (bias === "MIXED") return false;
  return (bias === "BULL" && direction === "LONG") || (bias === "BEAR" && direction === "SHORT");
}

export function computeTrackRecord(verdicts: StoredVerdict[]): TrackRecordStats {
  const resolved = verdicts.filter(
    (v) => v.outcome && v.outcome !== "open" && v.rMultiple !== null
  );

  const wins = resolved.filter((v) => isWin(v.outcome));
  const winRate = resolved.length > 0 ? (wins.length / resolved.length) * 100 : 0;
  const avgRMultiple =
    resolved.length > 0
      ? resolved.reduce((sum, v) => sum + (v.rMultiple ?? 0), 0) / resolved.length
      : 0;

  const tiers: Tier[] = ["HIGH", "MODERATE", "LOW"];
  const tierWinRates = Object.fromEntries(
    tiers.map((tier) => {
      const tierResolved = resolved.filter((v) => v.confidenceTier === tier);
      const tierWins = tierResolved.filter((v) => isWin(v.outcome));
      return [
        tier,
        {
          wins: tierWins.length,
          total: tierResolved.length,
          winRate: tierResolved.length > 0 ? (tierWins.length / tierResolved.length) * 100 : 0,
        },
      ];
    })
  ) as TrackRecordStats["tierWinRates"];

  const laneKeys: (keyof LaneBiases)[] = ["technical", "flow", "narrative", "macro"];
  const laneAccuracy = Object.fromEntries(
    laneKeys.map((lane) => {
      let correct = 0;
      let total = 0;
      for (const v of resolved) {
        const winDir = winningDirection(v);
        if (!winDir || v.direction === "NEUTRAL") continue;
        const bias = v.laneBiases[lane];
        if (bias === "MIXED") continue;
        total++;
        if (laneMatches(bias, winDir)) correct++;
      }
      return [
        lane,
        {
          correct,
          total,
          accuracy: total > 0 ? (correct / total) * 100 : 0,
        },
      ];
    })
  ) as TrackRecordStats["laneAccuracy"];

  return {
    winRate: parseFloat(winRate.toFixed(1)),
    totalSignals: verdicts.length,
    resolvedCount: resolved.length,
    avgRMultiple: parseFloat(avgRMultiple.toFixed(2)),
    tierWinRates,
    laneAccuracy,
    computedAt: new Date().toISOString(),
  };
}
