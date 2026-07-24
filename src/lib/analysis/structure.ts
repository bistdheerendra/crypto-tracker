import type { Direction } from "../types";

export interface SwingLevels {
  swingLow: number;
  swingHigh: number;
}

export interface SupportResistanceLevels {
  supports: number[];
  resistances: number[];
  swingLow: number;
  swingHigh: number;
}

export function computeSwingLevels(
  highs: number[],
  lows: number[],
  lookback = 20
): SwingLevels {
  const recentHighs = highs.slice(-lookback);
  const recentLows = lows.slice(-lookback);
  return {
    swingLow: Math.min(...recentLows),
    swingHigh: Math.max(...recentHighs),
  };
}

/**
 * Pivot-based multi-level support / resistance for chart overlays.
 * Local swing highs → resistance; local swing lows → support; nearby levels clustered.
 */
export function computeSupportResistanceLevels(
  highs: number[],
  lows: number[],
  price: number,
  options?: {
    pivotStrength?: number;
    maxLevels?: number;
    clusterPct?: number;
  }
): SupportResistanceLevels {
  const strength = options?.pivotStrength ?? 3;
  const maxLevels = options?.maxLevels ?? 5;
  const clusterPct = options?.clusterPct ?? 0.004;
  const swings = computeSwingLevels(highs, lows);

  const pivotHighs: number[] = [];
  const pivotLows: number[] = [];

  for (let i = strength; i < highs.length - strength; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (highs[i] < highs[i - j] || highs[i] < highs[i + j]) isHigh = false;
      if (lows[i] > lows[i - j] || lows[i] > lows[i + j]) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivotHighs.push(highs[i]);
    if (isLow) pivotLows.push(lows[i]);
  }

  // Always include recent swing extremes so the chart has at least one of each.
  pivotHighs.push(swings.swingHigh);
  pivotLows.push(swings.swingLow);

  const clusteredHighs = clusterPriceLevels(pivotHighs, clusterPct);
  const clusteredLows = clusterPriceLevels(pivotLows, clusterPct);

  const resistances = clusteredHighs
    .filter((level) => level > price)
    .sort((a, b) => a - b)
    .slice(0, maxLevels)
    .map((n) => roundLevel(n));

  const supports = clusteredLows
    .filter((level) => level < price)
    .sort((a, b) => b - a)
    .slice(0, maxLevels)
    .map((n) => roundLevel(n));

  // If price sits on a cluster, still show nearest opposite side from swings.
  if (supports.length === 0 && swings.swingLow < price) {
    supports.push(roundLevel(swings.swingLow));
  }
  if (resistances.length === 0 && swings.swingHigh > price) {
    resistances.push(roundLevel(swings.swingHigh));
  }

  return {
    supports,
    resistances,
    swingLow: roundLevel(swings.swingLow),
    swingHigh: roundLevel(swings.swingHigh),
  };
}

function clusterPriceLevels(levels: number[], clusterPct: number): number[] {
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const level = sorted[i];
    const cluster = clusters[clusters.length - 1];
    const anchor = cluster[0];
    if (Math.abs(level - anchor) / anchor <= clusterPct) {
      cluster.push(level);
    } else {
      clusters.push([level]);
    }
  }

  return clusters.map((group) => group.reduce((s, n) => s + n, 0) / group.length);
}

function roundLevel(n: number): number {
  return parseFloat(n.toFixed(2));
}

export interface StructureLevels {
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  slSource: "structure" | "atr";
}

export function computeStructureLevels(
  direction: Direction,
  price: number,
  atr: number,
  swings: SwingLevels
): StructureLevels {
  if (direction === "NEUTRAL") {
    return {
      stopLoss: price,
      takeProfit1: price,
      takeProfit2: price,
      slSource: "atr",
    };
  }

  const minRisk = atr * 0.8;
  const maxRisk = atr * 2.5;
  const buffer = price * 0.001;

  if (direction === "LONG") {
    const structureSl = swings.swingLow - buffer;
    let stopLoss = structureSl;
    let slSource: "structure" | "atr" = "structure";
    let risk = price - stopLoss;

    if (risk < minRisk) {
      stopLoss = price - minRisk;
      slSource = "atr";
      risk = minRisk;
    } else if (risk > maxRisk) {
      stopLoss = price - maxRisk;
      slSource = "atr";
      risk = maxRisk;
    }

    return {
      stopLoss,
      takeProfit1: price + risk * 2,
      takeProfit2: price + risk * 3.5,
      slSource,
    };
  }

  const structureSl = swings.swingHigh + buffer;
  let stopLoss = structureSl;
  let slSource: "structure" | "atr" = "structure";
  let risk = stopLoss - price;

  if (risk < minRisk) {
    stopLoss = price + minRisk;
    slSource = "atr";
    risk = minRisk;
  } else if (risk > maxRisk) {
    stopLoss = price + maxRisk;
    slSource = "atr";
    risk = maxRisk;
  }

  return {
    stopLoss,
    takeProfit1: price - risk * 2,
    takeProfit2: price - risk * 3.5,
    slSource,
  };
}
