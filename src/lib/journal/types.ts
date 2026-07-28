import type { TrackRecordStats } from "@/lib/backtest/aggregator";

export type JournalVerdictSummary = {
  pair: string;
  direction: string;
  tier: string;
  outcome: string | null;
  rMultiple: number | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  createdAt: string;
};

export type JournalEntryRow = {
  id: string;
  verdictId: string;
  note: string | null;
  takenAt: string;
  exitedAt: string | null;
  exitPrice: number | null;
  exitRMultiple: number | null;
  verdict: JournalVerdictSummary | null;
};

export type JournalListResponse = {
  entries: JournalEntryRow[];
  count: number;
  personalStats: TrackRecordStats | null;
  error?: string;
};

/** Still open for the user: no personal exit, and Verdict not SL/TP/expired yet. */
export function isJournalTradeOpen(entry: JournalEntryRow): boolean {
  if (entry.exitedAt) return false;
  const outcome = entry.verdict?.outcome;
  return !outcome || outcome === "open";
}
