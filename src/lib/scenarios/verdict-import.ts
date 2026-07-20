import type { StoredVerdict } from "@/lib/verdicts/types";
import type { PortfolioPosition } from "@/lib/types";
import { createPositionId } from "./positions-store";

export interface VerdictImportOptions {
  equity: number;
  riskPct: number;
  markPrices?: Record<string, number>;
}

export function sizeFromRisk(
  entry: number,
  stopLoss: number,
  equity: number,
  riskPct: number
): number {
  const riskAmount = equity * (riskPct / 100);
  const riskPerUnit = Math.abs(entry - stopLoss);
  if (riskPerUnit <= 0) return 0;
  return parseFloat((riskAmount / riskPerUnit).toFixed(6));
}

export function verdictToPosition(
  verdict: StoredVerdict,
  options: VerdictImportOptions
): PortfolioPosition | null {
  if (verdict.direction === "NEUTRAL" || verdict.outcome !== "open") return null;

  const size = sizeFromRisk(
    verdict.entryPrice,
    verdict.stopLoss,
    options.equity,
    options.riskPct
  );
  if (size <= 0) return null;

  return {
    id: createPositionId(),
    verdictId: verdict.id,
    pair: verdict.pair,
    side: verdict.direction,
    size,
    sizeUnit: "base",
    entry: verdict.entryPrice,
    stopLoss: verdict.stopLoss,
    markPrice: options.markPrices?.[verdict.pair] ?? verdict.entryPrice,
  };
}

export function importVerdictsAsPositions(
  verdicts: StoredVerdict[],
  existing: PortfolioPosition[],
  options: VerdictImportOptions
): PortfolioPosition[] {
  const importedVerdictIds = new Set(
    existing.map((p) => p.verdictId).filter(Boolean) as string[]
  );
  const next = [...existing];

  for (const verdict of verdicts) {
    if (importedVerdictIds.has(verdict.id)) continue;
    const position = verdictToPosition(verdict, options);
    if (!position) continue;
    next.push(position);
    importedVerdictIds.add(verdict.id);
  }

  return next;
}
