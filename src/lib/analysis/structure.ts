import type { Direction } from "../types";

export interface SwingLevels {
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
