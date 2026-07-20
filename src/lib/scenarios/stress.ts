import { CORRELATION_MATRIX } from "@/lib/mock-data";
import type {
  PortfolioPosition,
  PortfolioStressResult,
  PositionStressResult,
  ScenarioResult,
} from "@/lib/types";

const DEFAULT_BETA = 0.7;
const STOP_MOVE_THRESHOLD = 3;

export function getBeta(
  pair: string,
  matrix: Record<string, number> = CORRELATION_MATRIX
): number {
  if (pair === "BTC/USDT") return 1;
  return matrix[pair] ?? DEFAULT_BETA;
}

export function getMovePct(
  shock: number,
  pair: string,
  matrix: Record<string, number> = CORRELATION_MATRIX
): number {
  return shock * getBeta(pair, matrix);
}

export function getShockedPrice(markPrice: number, movePct: number): number {
  return markPrice * (1 + movePct / 100);
}

export function getPositionQuantity(pos: PortfolioPosition): number {
  return pos.sizeUnit === "usd" ? pos.size / pos.entry : pos.size;
}

export function stressPosition(
  pos: PortfolioPosition,
  shock: number,
  matrix: Record<string, number> = CORRELATION_MATRIX
): PositionStressResult {
  const beta = getBeta(pos.pair, matrix);
  const movePct = shock * beta;
  const shockedPrice = getShockedPrice(pos.markPrice, movePct);
  const qty = getPositionQuantity(pos);

  const markPnl =
    pos.side === "LONG"
      ? (shockedPrice - pos.entry) * qty
      : (pos.entry - shockedPrice) * qty;

  const stopHit =
    pos.side === "LONG"
      ? shockedPrice <= pos.stopLoss
      : shockedPrice >= pos.stopLoss;

  const realizedIfStopped =
    pos.side === "LONG"
      ? (pos.stopLoss - pos.entry) * qty
      : (pos.entry - pos.stopLoss) * qty;

  const distToStopPct =
    pos.side === "LONG"
      ? ((shockedPrice - pos.stopLoss) / shockedPrice) * 100
      : ((pos.stopLoss - shockedPrice) / shockedPrice) * 100;

  return {
    position: pos,
    beta,
    movePct,
    shockedPrice,
    pnl: stopHit ? realizedIfStopped : markPnl,
    stopHit,
    distToStopPct,
    fundingShift: shock * 0.15 * beta,
    oiChange: shock * 0.8 * beta,
  };
}

export function computeMarketCascade(
  shock: number,
  matrix: Record<string, number> = CORRELATION_MATRIX
): ScenarioResult[] {
  return Object.entries(matrix).map(([asset, beta]) => ({
    asset,
    move: shock * beta,
    fundingShift: shock * 0.15 * beta,
    oiChange: shock * 0.8 * beta,
    stopTriggered: Math.abs(shock * beta) > STOP_MOVE_THRESHOLD,
  }));
}

export function stressPortfolio(
  positions: PortfolioPosition[],
  shock: number,
  matrix: Record<string, number> = CORRELATION_MATRIX
): PortfolioStressResult {
  const positionResults = positions.map((p) => stressPosition(p, shock, matrix));
  const totalPnl = positionResults.reduce((sum, r) => sum + r.pnl, 0);
  const stopsHit = positionResults.filter((r) => r.stopHit).length;

  return {
    positions: positionResults,
    totalPnl,
    stopsHit,
    marketResults: computeMarketCascade(shock, matrix),
  };
}
