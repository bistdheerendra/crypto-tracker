import type { JournalEntryRow, JournalVerdictSummary } from "@/lib/journal/types";
import type { Bias, Direction, Tier } from "@/lib/types";
import type { StoredVerdict, VerdictOutcome } from "@/lib/verdicts/types";

export type VerdictJoinRow = {
  id: string;
  pair: string;
  timeframe: string;
  direction: string;
  confidenceTier: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  laneBiasTechnical: string;
  laneBiasFlow: string;
  laneBiasNarrative: string;
  laneBiasMacro: string;
  createdAt: Date;
  outcome: string | null;
  outcomePrice: number | null;
  outcomeAt: Date | null;
  rMultiple: number | null;
};

export type JournalDbRow = {
  id: string;
  verdictId: string;
  note: string | null;
  takenAt: Date;
  exitedAt: Date | null;
  exitPrice: number | null;
  exitRMultiple: number | null;
};

export function toVerdictSummary(row: VerdictJoinRow): JournalVerdictSummary {
  return {
    pair: row.pair,
    direction: row.direction,
    tier: row.confidenceTier,
    outcome: row.outcome,
    rMultiple: row.rMultiple,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfit1: row.takeProfit1,
    takeProfit2: row.takeProfit2,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toStoredVerdict(
  row: VerdictJoinRow,
  journal?: Pick<JournalDbRow, "exitedAt" | "exitPrice" | "exitRMultiple">
): StoredVerdict {
  const base: StoredVerdict = {
    id: row.id,
    pair: row.pair,
    timeframe: row.timeframe,
    direction: row.direction as Direction,
    confidenceTier: row.confidenceTier as Tier,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfit1: row.takeProfit1,
    takeProfit2: row.takeProfit2,
    laneBiases: {
      technical: row.laneBiasTechnical as Bias,
      flow: row.laneBiasFlow as Bias,
      narrative: row.laneBiasNarrative as Bias,
      macro: row.laneBiasMacro as Bias,
    },
    createdAt: row.createdAt.toISOString(),
    outcome: (row.outcome as VerdictOutcome | null) ?? null,
    outcomePrice: row.outcomePrice,
    outcomeAt: row.outcomeAt ? row.outcomeAt.toISOString() : null,
    rMultiple: row.rMultiple,
  };

  if (journal?.exitedAt && journal.exitRMultiple != null) {
    return {
      ...base,
      outcome: "manual_exit",
      outcomePrice: journal.exitPrice,
      outcomeAt: journal.exitedAt.toISOString(),
      rMultiple: journal.exitRMultiple,
    };
  }

  return base;
}

export function serializeJournalEntry(
  entry: JournalDbRow,
  verdict: VerdictJoinRow | undefined
): JournalEntryRow {
  return {
    id: entry.id,
    verdictId: entry.verdictId,
    note: entry.note,
    takenAt: entry.takenAt.toISOString(),
    exitedAt: entry.exitedAt ? entry.exitedAt.toISOString() : null,
    exitPrice: entry.exitPrice,
    exitRMultiple: entry.exitRMultiple,
    verdict: verdict ? toVerdictSummary(verdict) : null,
  };
}
