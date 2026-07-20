import type { StoredVerdict } from "../verdicts/types";
import { MIN_SIM_TRADES } from "../verdicts/types";

export interface SimTrade {
  id: string;
  entryTime: string;
  direction: string;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  outcome: string;
  rMultiple: number;
  pnl: number;
  equity: number;
}

export interface SimulatorResult {
  sufficientData: boolean;
  equityCurve: { date: string; equity: number }[];
  totalTrades: number;
  winRate: number;
  maxDrawdown: number;
  finalEquity: number;
  sharpeRatio: number;
  trades: SimTrade[];
}

function isWin(outcome: StoredVerdict["outcome"]): boolean {
  return outcome === "tp1_hit" || outcome === "tp2_hit";
}

export function runSimulator(
  verdicts: StoredVerdict[],
  startingCapital: number,
  riskPerTradePct: number
): SimulatorResult {
  const resolved = verdicts
    .filter((v) => v.outcome && v.outcome !== "open" && v.rMultiple !== null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (resolved.length < MIN_SIM_TRADES) {
    return {
      sufficientData: false,
      equityCurve: [],
      totalTrades: 0,
      winRate: 0,
      maxDrawdown: 0,
      finalEquity: startingCapital,
      sharpeRatio: 0,
      trades: [],
    };
  }

  let equity = startingCapital;
  let peak = startingCapital;
  let maxDrawdown = 0;
  const equityCurve: { date: string; equity: number }[] = [
    { date: resolved[0].createdAt, equity: startingCapital },
  ];
  const trades: SimTrade[] = [];
  const returns: number[] = [];

  for (const v of resolved) {
    const riskAmount = equity * (riskPerTradePct / 100);
    const pnl = riskAmount * (v.rMultiple ?? 0);
    const prevEquity = equity;
    equity += pnl;
    returns.push(prevEquity > 0 ? pnl / prevEquity : 0);

    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    trades.push({
      id: v.id,
      entryTime: v.createdAt,
      direction: v.direction,
      entry: v.entryPrice,
      stopLoss: v.stopLoss,
      takeProfit1: v.takeProfit1,
      outcome: v.outcome ?? "open",
      rMultiple: v.rMultiple ?? 0,
      pnl: parseFloat(pnl.toFixed(2)),
      equity: parseFloat(equity.toFixed(2)),
    });

    equityCurve.push({
      date: v.outcomeAt ?? v.createdAt,
      equity: parseFloat(equity.toFixed(2)),
    });
  }

  const wins = resolved.filter((v) => isWin(v.outcome)).length;
  const winRate = (wins / resolved.length) * 100;

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? parseFloat((avgReturn / stdDev).toFixed(2)) : 0;

  return {
    sufficientData: true,
    equityCurve,
    totalTrades: resolved.length,
    winRate: parseFloat(winRate.toFixed(1)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    finalEquity: parseFloat(equity.toFixed(2)),
    sharpeRatio,
    trades: trades.reverse(),
  };
}
