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
  verdict: JournalVerdictSummary | null;
};

export type JournalListResponse = {
  entries: JournalEntryRow[];
  count: number;
  personalStats: TrackRecordStats | null;
  error?: string;
};
