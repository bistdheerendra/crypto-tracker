export type Bias = "BULL" | "BEAR" | "MIXED";
export type Tier = "HIGH" | "MODERATE" | "LOW";
export type Direction = "LONG" | "SHORT" | "NEUTRAL";
export type Sentiment = "bullish" | "bearish" | "neutral";

export interface LaneOutput {
  lane: "Technical" | "Flow" | "Narrative" | "Macro";
  badge: "T" | "F" | "N" | "M";
  bias: Bias;
  tier: Tier;
  reasoning: string[];
}

export interface Verdict {
  pair: string;
  timeframe: string;
  tier: Tier;
  direction: Direction;
  alignment: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  rationale: string;
  riskReward: string;
}

export interface NewsItem {
  id: string;
  location: string;
  country: string;
  timeAgo: string;
  headline: string;
  source: string;
  sentiment: Sentiment;
  marketTag: string;
  connected: number;
  lat: number;
  lng: number;
}

export interface WhaleTransaction {
  id: string;
  address: string;
  amount: string;
  usdValue: string;
  direction: "in" | "out";
  timeAgo: string;
  chain: string;
}

export interface ETFFlow {
  ticker: string;
  name: string;
  netFlow: number;
  date: string;
}

export interface Liquidation {
  id: string;
  exchange: string;
  pair: string;
  side: "long" | "short";
  amount: string;
  timeAgo: string;
}

export interface ScenarioResult {
  asset: string;
  move: number;
  fundingShift: number;
  oiChange: number;
  stopTriggered: boolean;
}

export interface PortfolioPosition {
  id: string;
  pair: string;
  side: "LONG" | "SHORT";
  size: number;
  sizeUnit: "base" | "usd";
  entry: number;
  stopLoss: number;
  markPrice: number;
  verdictId?: string;
}

export interface PositionStressResult {
  position: PortfolioPosition;
  beta: number;
  movePct: number;
  shockedPrice: number;
  pnl: number;
  stopHit: boolean;
  distToStopPct: number;
  fundingShift: number;
  oiChange: number;
}

export interface PortfolioStressResult {
  positions: PositionStressResult[];
  totalPnl: number;
  stopsHit: number;
  marketResults: ScenarioResult[];
}
