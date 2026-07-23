import type { Bias, Direction, LaneOutput, Tier, Verdict } from "../types";
import { computeATR, computeVolatilityRegime } from "../binance";
import { getDynamicLaneWeights } from "../backtest/lane-weights";
import type { FlowMetrics } from "../binance-futures";
import type { MacroSnapshot } from "../macro";
import type { NarrativeSnapshot } from "../narrative";
import type {
  FlowRawFeatures,
  LaneRunResult,
  MacroRawFeatures,
  NarrativeRawFeatures,
  TechnicalRawFeatures,
} from "../verdicts/features";
import { computeStructureLevels, computeSwingLevels } from "./structure";

/** Candles back for RSI momentum (RSI now − RSI N ago); fits within 200-kline fetch. */
const RSI_MOMENTUM_LOOKBACK = 5;

const BIAS_SCORE: Record<Bias, number> = {
  BULL: 1,
  BEAR: -1,
  MIXED: 0,
};

const TIER_SCORE: Record<Tier, number> = {
  HIGH: 3,
  MODERATE: 2,
  LOW: 1,
};

/** Minimum lanes that must share the trade-direction bias for a HIGH verdict. */
const HIGH_MIN_DIRECTION_AGREEMENT = 3;

/**
 * HIGH requires strong score AND real consensus:
 * - |normalized| past the HIGH threshold
 * - ≥3 lanes biased with the trade (BULL for LONG, BEAR for SHORT)
 * - Narrative must not oppose the trade direction
 *
 * Score-alone HIGH was too easy (e.g. 4× MODERATE → 2.0) and produced
 * 0% win-rate HIGH batches with only 2/4 agreement or opposing Narrative.
 */
export function qualifiesAsHigh(
  normalized: number,
  direction: Direction,
  lanes: LaneOutput[]
): boolean {
  if (direction === "LONG") {
    if (!(normalized > 1.5)) return false;
  } else if (direction === "SHORT") {
    if (!(normalized < -1.5)) return false;
  } else {
    return false;
  }

  const targetBias: Bias = direction === "LONG" ? "BULL" : "BEAR";
  const agreement = lanes.filter((l) => l.bias === targetBias).length;
  if (agreement < HIGH_MIN_DIRECTION_AGREEMENT) return false;

  const narrative = lanes.find((l) => l.lane === "Narrative");
  if (narrative) {
    if (direction === "LONG" && narrative.bias === "BEAR") return false;
    if (direction === "SHORT" && narrative.bias === "BULL") return false;
  }

  return true;
}

export async function synthesizeVerdict(
  lanes: LaneOutput[],
  pair: string,
  timeframe: string,
  price: number,
  atr: number,
  highs: number[],
  lows: number[]
): Promise<Verdict> {
  let score = 0;
  let totalWeight = 0;
  let aligned = 0;
  const dominantBias = getDominantBias(lanes);
  const { weights: laneWeights } = await getDynamicLaneWeights();

  for (const lane of lanes) {
    const w = laneWeights[lane.lane] ?? 0.25;
    const laneScore = BIAS_SCORE[lane.bias] * TIER_SCORE[lane.tier];
    score += laneScore * w;
    totalWeight += w;
    if (lane.bias === dominantBias) aligned++;
  }

  const normalized = score / totalWeight;
  let direction: Direction = "NEUTRAL";
  let tier: Tier = "LOW";

  if (normalized > 0.8) {
    direction = "LONG";
    tier = qualifiesAsHigh(normalized, direction, lanes) ? "HIGH" : "MODERATE";
  } else if (normalized < -0.8) {
    direction = "SHORT";
    tier = qualifiesAsHigh(normalized, direction, lanes) ? "HIGH" : "MODERATE";
  } else {
    tier = "MODERATE";
  }

  const swings = computeSwingLevels(highs, lows);
  const levels = computeStructureLevels(direction, price, atr, swings);
  const risk = Math.abs(price - levels.stopLoss);
  const reward = Math.abs(levels.takeProfit1 - price);
  const rr = risk > 0 ? (reward / risk).toFixed(1) : "—";

  return {
    pair,
    timeframe,
    tier,
    direction,
    alignment: `${aligned}/4 lanes aligned`,
    entry: price,
    stopLoss: parseFloat(levels.stopLoss.toFixed(2)),
    takeProfit1: parseFloat(levels.takeProfit1.toFixed(2)),
    takeProfit2: parseFloat(levels.takeProfit2.toFixed(2)),
    rationale: buildRationale(lanes, direction, levels.slSource),
    riskReward: `1:${rr}`,
  };
}

function getDominantBias(lanes: LaneOutput[]): Bias {
  const counts: Record<Bias, number> = { BULL: 0, BEAR: 0, MIXED: 0 };
  for (const l of lanes) counts[l.bias]++;
  if (counts.BULL >= counts.BEAR && counts.BULL >= counts.MIXED) return "BULL";
  if (counts.BEAR >= counts.MIXED) return "BEAR";
  return "MIXED";
}

function buildRationale(
  lanes: LaneOutput[],
  direction: Direction,
  slSource: "structure" | "atr"
): string {
  const bullish = lanes.filter((l) => l.bias === "BULL").map((l) => l.lane);
  const bearish = lanes.filter((l) => l.bias === "BEAR").map((l) => l.lane);
  const slNote =
    slSource === "structure"
      ? "Stop anchored to recent swing structure."
      : "Stop capped by ATR risk limits.";

  if (direction === "LONG") {
    return `${bullish.join(" + ")} lanes support upside. ${slNote}`;
  }
  if (direction === "SHORT") {
    return `${bearish.join(" + ")} lanes flag downside risk. ${slNote}`;
  }
  return "Lanes diverge — wait for alignment before sizing a position.";
}

export function runTechnicalLane(
  closes: number[],
  highs: number[],
  lows: number[]
): LaneRunResult {
  const ema50 = closes.length >= 50 ? ema(closes, 50) : closes[closes.length - 1];
  const ema200 = closes.length >= 200 ? ema(closes, 200) : ema50;
  const rsi = computeRSI(closes);
  const rsiMomentum = computeRsiMomentum(closes, RSI_MOMENTUM_LOOKBACK);
  const volatilityRegime = computeVolatilityRegime(highs, lows, closes);
  if (rsiMomentum == null) {
    console.warn(
      `[technical] rsiMomentum unavailable: need ≥${14 + RSI_MOMENTUM_LOOKBACK + 1} closes`
    );
  }
  if (volatilityRegime == null) {
    console.warn(
      "[technical] volatilityRegime unavailable: insufficient candles for ATR series"
    );
  }
  const price = closes[closes.length - 1];
  const bullish = price > ema50 && ema50 > ema200;
  const bearish = price < ema50 && ema50 < ema200;
  const swings = computeSwingLevels(highs, lows);

  const distSwingHighPct = Math.abs((price - swings.swingHigh) / price) * 100;
  const distSwingLowPct = Math.abs((price - swings.swingLow) / price) * 100;
  const raw: TechnicalRawFeatures = {
    ema50,
    ema200,
    rsi14: rsi,
    priceDistanceToEma50Pct: ema50 !== 0 ? ((price - ema50) / ema50) * 100 : 0,
    distanceToNearestSwingPct: Math.min(distSwingHighPct, distSwingLowPct),
    rsiMomentum,
    volatilityRegime,
  };

  return {
    output: {
      lane: "Technical",
      badge: "T",
      bias: bullish ? "BULL" : bearish ? "BEAR" : "MIXED",
      tier: rsi > 70 || rsi < 30 ? "HIGH" : "MODERATE",
      reasoning: [
        `Price ${bullish ? "above" : bearish ? "below" : "near"} 50/200 EMA`,
        `RSI(14) at ${rsi.toFixed(0)}`,
        `Swing support ${swings.swingLow.toFixed(2)}, resistance ${swings.swingHigh.toFixed(2)}`,
      ],
    },
    raw,
  };
}

export function runFlowLane(
  flow: FlowMetrics & { sources?: string[] },
  priceChange24hPct: number
): LaneRunResult {
  const raw: FlowRawFeatures = {
    oiChangePct: flow.available ? flow.oiChange24hPct : null,
    fundingRate: flow.available ? flow.fundingRate : null,
    longShortRatio: flow.available ? flow.longShortRatio : null,
    price24hChangePct: priceChange24hPct,
    fundingRateRoc: flow.available ? flow.fundingRateRoc : null,
    oiRoc: flow.available ? flow.oiRoc : null,
  };

  if (!flow.available) {
    return {
      output: {
        lane: "Flow",
        badge: "F",
        bias: "MIXED",
        tier: "LOW",
        reasoning: ["Futures flow data unavailable for this pair"],
      },
      raw,
    };
  }

  const oiUp = flow.oiChange24hPct > 0;
  const priceUp = priceChange24hPct > 0;
  const crowdedLongs = flow.fundingRate > 0.03;
  const crowdedShorts = flow.fundingRate < -0.03;

  let bias: Bias = "MIXED";
  if (oiUp && priceUp && !crowdedLongs) bias = "BULL";
  else if (oiUp && !priceUp) bias = "BEAR";
  else if (!oiUp && priceUp) bias = "BULL";
  else if (crowdedLongs) bias = "BEAR";
  else if (crowdedShorts) bias = "BULL";

  const tier: Tier =
    Math.abs(flow.oiChange24hPct) > 5 || Math.abs(flow.fundingRate) > 0.05
      ? "HIGH"
      : "MODERATE";

  const venueSuffix =
    flow.sources && flow.sources.length > 1
      ? ` · ${flow.sources.join("+")}`
      : "";

  return {
    output: {
      lane: "Flow",
      badge: "F",
      bias,
      tier,
      reasoning: [
        `OI ${flow.oiChange24hPct >= 0 ? "+" : ""}${flow.oiChange24hPct.toFixed(1)}% (24h)${venueSuffix}`,
        `Funding ${flow.fundingRate.toFixed(4)}%`,
        `Long/short ratio ${flow.longShortRatio.toFixed(2)}`,
      ],
    },
    raw,
  };
}

export function runNarrativeLane(
  narrative: NarrativeSnapshot,
  pair = "BTC/USDT"
): LaneRunResult {
  const base = pair.split("/")[0]?.toUpperCase() ?? "";
  const inTrending = narrative.trendingCoins.some((c) => c.toUpperCase() === base);
  // 0–1 heat: base in trending list, plus mild lift from list size
  const trendingScore = Math.min(
    1,
    (inTrending ? 0.7 : 0) + narrative.trendingCoins.length * 0.1
  );

  const raw: NarrativeRawFeatures = {
    fearGreedIndex: narrative.fearGreed,
    globalMcapChangePct: narrative.globalMarketCapChange24hPct,
    trendingScore,
    fearGreedRoc: narrative.fearGreedRoc,
  };

  if (!narrative.available) {
    return {
      output: {
        lane: "Narrative",
        badge: "N",
        bias: "MIXED",
        tier: "LOW",
        reasoning: ["Narrative data sources unavailable"],
      },
      raw,
    };
  }

  let bullPoints = 0;
  let bearPoints = 0;

  if (narrative.fearGreed != null) {
    if (narrative.fearGreed >= 60) bullPoints += 1;
    else if (narrative.fearGreed <= 40) bearPoints += 1;
  }
  if (narrative.globalMarketCapChange24hPct != null) {
    if (narrative.globalMarketCapChange24hPct > 1) bullPoints += 1;
    else if (narrative.globalMarketCapChange24hPct < -1) bearPoints += 1;
  }
  if (narrative.priceChange24hPct > 2) bullPoints += 1;
  else if (narrative.priceChange24hPct < -2) bearPoints += 1;

  if (narrative.headlineSentimentScore != null) {
    if (narrative.headlineSentimentScore >= 0.15) bullPoints += 1;
    else if (narrative.headlineSentimentScore <= -0.15) bearPoints += 1;
  }

  let bias: Bias = "MIXED";
  if (bullPoints > bearPoints) bias = "BULL";
  else if (bearPoints > bullPoints) bias = "BEAR";

  const tier: Tier =
    narrative.fearGreed != null && (narrative.fearGreed >= 75 || narrative.fearGreed <= 25)
      ? "HIGH"
      : Math.abs(narrative.headlineSentimentScore ?? 0) >= 0.35
        ? "HIGH"
        : "MODERATE";

  const reasoning: string[] = [];
  if (narrative.fearGreed != null) {
    reasoning.push(
      `Fear & Greed ${narrative.fearGreed} (${narrative.fearGreedLabel ?? "index"})`
    );
  }
  if (narrative.headlineSentiment != null && narrative.headlineSampleSize > 0) {
    const s = narrative.headlineSentimentScore ?? 0;
    reasoning.push(
      `Headlines ${narrative.headlineSentiment} (${s >= 0 ? "+" : ""}${s.toFixed(2)}, n=${narrative.headlineSampleSize})`
    );
  }
  if (narrative.globalMarketCapChange24hPct != null) {
    reasoning.push(
      `Global mcap ${narrative.globalMarketCapChange24hPct >= 0 ? "+" : ""}${narrative.globalMarketCapChange24hPct.toFixed(1)}% (24h)`
    );
  }
  reasoning.push(
    `${narrative.priceChange24hPct >= 0 ? "+" : ""}${narrative.priceChange24hPct.toFixed(1)}% on ${narrative.volume24h > 0 ? "elevated" : "light"} volume`
  );
  if (narrative.trendingCoins.length > 0) {
    reasoning.push(`Trending: ${narrative.trendingCoins.join(", ")}`);
  }

  return {
    output: {
      lane: "Narrative",
      badge: "N",
      bias,
      tier,
      reasoning: reasoning.slice(0, 3),
    },
    raw,
  };
}

export function runMacroLane(macro: MacroSnapshot): LaneRunResult {
  const raw: MacroRawFeatures = {
    dxyChangePct: macro.dxyChange24hPct,
    spxChangePct: macro.spxChange24hPct,
    goldChangePct: macro.goldChange24hPct,
  };

  if (!macro.available) {
    return {
      output: {
        lane: "Macro",
        badge: "M",
        bias: "MIXED",
        tier: "LOW",
        reasoning: ["Macro market data unavailable"],
      },
      raw,
    };
  }

  let riskOffScore = 0;
  let riskOnScore = 0;

  if (macro.dxyChange24hPct != null) {
    if (macro.dxyChange24hPct > 0.15) riskOffScore += 1;
    else if (macro.dxyChange24hPct < -0.15) riskOnScore += 1;
  }
  if (macro.spxChange24hPct != null) {
    if (macro.spxChange24hPct > 0.3) riskOnScore += 1;
    else if (macro.spxChange24hPct < -0.3) riskOffScore += 1;
  }
  if (macro.goldChange24hPct != null) {
    if (macro.goldChange24hPct > 0.3) riskOffScore += 1;
    else if (macro.goldChange24hPct < -0.3) riskOnScore += 1;
  }

  let bias: Bias = "MIXED";
  if (riskOnScore > riskOffScore) bias = "BULL";
  else if (riskOffScore > riskOnScore) bias = "BEAR";

  const tier: Tier =
    Math.abs(riskOnScore - riskOffScore) >= 2 ? "HIGH" : "MODERATE";

  const fmt = (v: number | null) =>
    v == null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  return {
    output: {
      lane: "Macro",
      badge: "M",
      bias,
      tier,
      reasoning: [
        `DXY ${fmt(macro.dxyChange24hPct)}`,
        `S&P 500 ${fmt(macro.spxChange24hPct)}`,
        `Gold ${fmt(macro.goldChange24hPct)}`,
      ],
    },
    raw,
  };
}

function ema(prices: number[], period: number): number {
  const k = 2 / (period + 1);
  let val = prices[0];
  for (let i = 1; i < prices.length; i++) {
    val = prices[i] * k + val * (1 - k);
  }
  return val;
}

function computeRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** RSI(14) now minus RSI(14) from `lookback` candles ago. */
function computeRsiMomentum(
  closes: number[],
  lookback: number,
  period = 14
): number | null {
  const minLen = period + lookback + 1;
  if (closes.length < minLen) return null;
  const rsiNow = computeRSI(closes, period);
  const rsiPrior = computeRSI(closes.slice(0, closes.length - lookback), period);
  return rsiNow - rsiPrior;
}

export { computeATR };
