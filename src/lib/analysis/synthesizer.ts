import type { Bias, Direction, LaneOutput, Tier, Verdict } from "../types";
import { computeATR } from "../binance";
import { getDynamicLaneWeights } from "../backtest/lane-weights";

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

export function synthesizeVerdict(
  lanes: LaneOutput[],
  pair: string,
  timeframe: string,
  price: number,
  atr: number
): Verdict {
  let score = 0;
  let totalWeight = 0;
  let aligned = 0;
  const dominantBias = getDominantBias(lanes);
  const { weights: laneWeights } = getDynamicLaneWeights();

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
    tier = normalized > 1.5 ? "HIGH" : "MODERATE";
  } else if (normalized < -0.8) {
    direction = "SHORT";
    tier = normalized < -1.5 ? "HIGH" : "MODERATE";
  } else {
    tier = "MODERATE";
  }

  const isLong = direction === "LONG";
  const isShort = direction === "SHORT";
  const sl = isLong ? price - atr * 1.5 : isShort ? price + atr * 1.5 : price;
  const tp1 = isLong ? price + atr * 2 : isShort ? price - atr * 2 : price;
  const tp2 = isLong ? price + atr * 3.5 : isShort ? price - atr * 3.5 : price;
  const risk = Math.abs(price - sl);
  const reward = Math.abs(tp1 - price);
  const rr = risk > 0 ? (reward / risk).toFixed(1) : "—";

  return {
    pair,
    timeframe,
    tier,
    direction,
    alignment: `${aligned}/4 lanes aligned`,
    entry: price,
    stopLoss: sl,
    takeProfit1: tp1,
    takeProfit2: tp2,
    rationale: buildRationale(lanes, direction),
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

function buildRationale(lanes: LaneOutput[], direction: Direction): string {
  const bullish = lanes.filter((l) => l.bias === "BULL").map((l) => l.lane);
  const bearish = lanes.filter((l) => l.bias === "BEAR").map((l) => l.lane);
  if (direction === "LONG") {
    return `${bullish.join(" + ")} lanes support upside; macro headwinds noted but outweighed.`;
  }
  if (direction === "SHORT") {
    return `${bearish.join(" + ")} lanes flag downside risk; technical support may limit depth.`;
  }
  return "Lanes diverge — wait for alignment before sizing a position.";
}

export function runTechnicalLane(
  closes: number[],
  highs: number[],
  lows: number[]
): LaneOutput {
  const ema50 = closes.length >= 50 ? ema(closes, 50) : closes[closes.length - 1];
  const ema200 = closes.length >= 200 ? ema(closes, 200) : ema50;
  const rsi = computeRSI(closes);
  const price = closes[closes.length - 1];
  const bullish = price > ema50 && ema50 > ema200;
  const bearish = price < ema50 && ema50 < ema200;

  return {
    lane: "Technical",
    badge: "T",
    bias: bullish ? "BULL" : bearish ? "BEAR" : "MIXED",
    tier: rsi > 70 || rsi < 30 ? "HIGH" : "MODERATE",
    reasoning: [
      `Price ${bullish ? "above" : bearish ? "below" : "near"} 50/200 EMA`,
      `RSI(14) at ${rsi.toFixed(0)}`,
      `Support at ${Math.min(...lows.slice(-20)).toFixed(2)}`,
    ],
  };
}

export function runFlowLane(): LaneOutput {
  const oiChange = (Math.random() * 8 - 2).toFixed(1);
  const funding = (Math.random() * 0.02).toFixed(4);
  const ratio = (1 + Math.random() * 0.4).toFixed(2);
  const bullish = parseFloat(oiChange) > 0;

  return {
    lane: "Flow",
    badge: "F",
    bias: bullish ? "BULL" : "BEAR",
    tier: Math.abs(parseFloat(oiChange)) > 3 ? "HIGH" : "MODERATE",
    reasoning: [
      `OI ${parseFloat(oiChange) > 0 ? "+" : ""}${oiChange}% in 24h`,
      `Funding rate ${funding}%`,
      `Long/short ratio ${ratio}`,
    ],
  };
}

export function runNarrativeLane(): LaneOutput {
  return {
    lane: "Narrative",
    badge: "N",
    bias: "MIXED",
    tier: "MODERATE",
    reasoning: [
      "ETF inflows positive but slowing",
      "Fed rhetoric hawkish-leaning",
      "Social sentiment 62% bullish",
    ],
  };
}

export function runMacroLane(): LaneOutput {
  return {
    lane: "Macro",
    badge: "M",
    bias: "BEAR",
    tier: "LOW",
    reasoning: [
      "DXY strengthening +0.3%",
      "S&P 500 flat — risk-off undertone",
      "Gold +0.8% — hedge demand rising",
    ],
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

export { computeATR };
