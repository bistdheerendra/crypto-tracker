import type { Bias, Direction, Tier } from "../types";
import type { LaneBiases, StoredVerdict, VerdictOutcome } from "./types";

const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;
const BASE_PRICES: Record<string, number> = {
  "BTC/USDT": 94000,
  "ETH/USDT": 3400,
  "SOL/USDT": 175,
};

const BIASES: Bias[] = ["BULL", "BEAR", "MIXED"];
const LANES = ["technical", "flow", "narrative", "macro"] as const;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickBias(rand: () => number): Bias {
  return BIASES[Math.floor(rand() * BIASES.length)];
}

function randomLaneBiases(rand: () => number): LaneBiases {
  return {
    technical: pickBias(rand),
    flow: pickBias(rand),
    narrative: pickBias(rand),
    macro: pickBias(rand),
  };
}

function outcomeForTier(tier: Tier, rand: () => number): VerdictOutcome {
  const r = rand();
  if (tier === "HIGH") {
    if (r < 0.58) return rand() < 0.72 ? "tp1_hit" : "tp2_hit";
    if (r < 0.86) return "sl_hit";
    return "expired";
  }
  if (tier === "MODERATE") {
    if (r < 0.46) return rand() < 0.78 ? "tp1_hit" : "tp2_hit";
    if (r < 0.81) return "sl_hit";
    return "expired";
  }
  if (r < 0.36) return rand() < 0.85 ? "tp1_hit" : "tp2_hit";
  if (r < 0.78) return "sl_hit";
  return "expired";
}

function computeRMultiple(
  direction: Direction,
  entry: number,
  sl: number,
  tp1: number,
  tp2: number,
  outcome: VerdictOutcome,
  rand: () => number
): { rMultiple: number; outcomePrice: number } {
  const risk = Math.abs(entry - sl) || entry * 0.01;

  if (outcome === "sl_hit") {
    return { rMultiple: -1, outcomePrice: sl };
  }
  if (outcome === "tp1_hit") {
    const price = tp1;
    const reward = Math.abs(price - entry);
    return { rMultiple: parseFloat((reward / risk).toFixed(2)), outcomePrice: price };
  }
  if (outcome === "tp2_hit") {
    const price = tp2;
    const reward = Math.abs(price - entry);
    return { rMultiple: parseFloat((reward / risk).toFixed(2)), outcomePrice: price };
  }

  const drift = (rand() - 0.45) * risk * 0.6;
  const price = direction === "LONG" ? entry + drift : entry - drift;
  const reward = direction === "LONG" ? price - entry : entry - price;
  return {
    rMultiple: parseFloat((reward / risk).toFixed(2)),
    outcomePrice: parseFloat(price.toFixed(2)),
  };
}

export function generateSeedVerdicts(): StoredVerdict[] {
  const rand = mulberry32(42);
  const verdicts: StoredVerdict[] = [];
  const now = Date.now();
  const daysBack = 90;
  let id = 1;

  for (const pair of PAIRS) {
    const basePrice = BASE_PRICES[pair];
    let price = basePrice;

    for (let day = daysBack; day >= 0; day -= 1) {
      const signalsPerDay = 2 + Math.floor(rand() * 2);
      for (let s = 0; s < signalsPerDay; s++) {
        const hour = Math.floor(rand() * 24);
        const createdAt = new Date(now - day * 86400000 - hour * 3600000);
        if (createdAt.getTime() > now - 3600000) continue;

        price *= 1 + (rand() - 0.5) * 0.02;
        const tierRoll = rand();
        const tier: Tier = tierRoll > 0.65 ? "HIGH" : tierRoll > 0.35 ? "MODERATE" : "LOW";
        const direction: Direction =
          rand() > 0.55 ? "LONG" : rand() > 0.25 ? "SHORT" : "NEUTRAL";

        if (direction === "NEUTRAL") continue;

        const atr = price * (0.012 + rand() * 0.008);
        const isLong = direction === "LONG";
        const entry = price;
        const sl = isLong ? entry - atr * 1.5 : entry + atr * 1.5;
        const tp1 = isLong ? entry + atr * 2 : entry - atr * 2;
        const tp2 = isLong ? entry + atr * 3.5 : entry - atr * 3.5;

        const laneBiases = randomLaneBiases(rand);
        for (const lane of LANES) {
          if (rand() < 0.12) {
            laneBiases[lane] = isLong ? "BULL" : "BEAR";
          }
        }

        const isRecent = day <= 1 && s === 0;
        let outcome: VerdictOutcome;
        let outcomePrice: number | null = null;
        let outcomeAt: string | null = null;
        let rMultiple: number | null = null;

        if (isRecent && rand() < 0.3) {
          outcome = "open";
        } else {
          outcome = outcomeForTier(tier, rand);
          const resolved = computeRMultiple(direction, entry, sl, tp1, tp2, outcome, rand);
          rMultiple = resolved.rMultiple;
          outcomePrice = resolved.outcomePrice;
          const holdHours = 2 + Math.floor(rand() * 36);
          outcomeAt = new Date(createdAt.getTime() + holdHours * 3600000).toISOString();
        }

        verdicts.push({
          id: `v-${id++}`,
          pair,
          timeframe: "1h",
          direction,
          confidenceTier: tier,
          entryPrice: parseFloat(entry.toFixed(2)),
          stopLoss: parseFloat(sl.toFixed(2)),
          takeProfit1: parseFloat(tp1.toFixed(2)),
          takeProfit2: parseFloat(tp2.toFixed(2)),
          laneBiases,
          createdAt: createdAt.toISOString(),
          outcome,
          outcomePrice,
          outcomeAt,
          rMultiple,
        });
      }
    }
  }

  return verdicts.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
