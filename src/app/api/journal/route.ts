import { NextRequest, NextResponse } from "next/server";
import { computeTrackRecord } from "@/lib/backtest/aggregator";
import { getPrisma } from "@/lib/db";
import type { JournalEntryRow, JournalVerdictSummary } from "@/lib/journal/types";
import type { Bias, Direction, Tier } from "@/lib/types";
import type { StoredVerdict, VerdictOutcome } from "@/lib/verdicts/types";

type VerdictJoinRow = {
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

function toVerdictSummary(row: VerdictJoinRow): JournalVerdictSummary {
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

function toStoredVerdict(row: VerdictJoinRow): StoredVerdict {
  return {
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
}

function serializeEntry(
  entry: { id: string; verdictId: string; note: string | null; takenAt: Date },
  verdict: VerdictJoinRow | undefined
): JournalEntryRow {
  return {
    id: entry.id,
    verdictId: entry.verdictId,
    note: entry.note,
    takenAt: entry.takenAt.toISOString(),
    verdict: verdict ? toVerdictSummary(verdict) : null,
  };
}

export async function GET() {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json(
        { error: "Database not configured", entries: [], count: 0, personalStats: null },
        { status: 503 }
      );
    }

    const rows = await prisma.journalEntry.findMany({
      orderBy: { takenAt: "desc" },
    });

    const verdictIds = rows.map((r: { verdictId: string }) => r.verdictId);
    const verdictRows: VerdictJoinRow[] =
      verdictIds.length > 0
        ? await prisma.verdict.findMany({
            where: { id: { in: verdictIds } },
          })
        : [];

    const byId = new Map(verdictRows.map((v) => [v.id, v]));
    const entries: JournalEntryRow[] = rows.map(
      (row: { id: string; verdictId: string; note: string | null; takenAt: Date }) =>
        serializeEntry(row, byId.get(row.verdictId))
    );

    const personalStats =
      verdictRows.length > 0
        ? computeTrackRecord(verdictRows.map(toStoredVerdict))
        : null;

    return NextResponse.json({
      entries,
      count: entries.length,
      personalStats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load journal";
    console.error("[journal] GET failed:", err);
    return NextResponse.json(
      { error: message, entries: [], count: 0, personalStats: null },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const verdictId = typeof body.verdictId === "string" ? body.verdictId.trim() : "";
    if (!verdictId) {
      return NextResponse.json({ error: "verdictId is required" }, { status: 400 });
    }

    let note: string | null | undefined;
    if (body.note === null) {
      note = null;
    } else if (body.note === undefined) {
      note = undefined;
    } else if (typeof body.note === "string") {
      note = body.note.trim() || null;
    } else {
      return NextResponse.json({ error: "note must be a string" }, { status: 400 });
    }

    const verdict = await prisma.verdict.findUnique({ where: { id: verdictId } });
    if (!verdict) {
      return NextResponse.json({ error: "Verdict not found" }, { status: 404 });
    }

    const existing = await prisma.journalEntry.findUnique({ where: { verdictId } });

    let row: { id: string; verdictId: string; note: string | null; takenAt: Date };
    if (existing) {
      row = await prisma.journalEntry.update({
        where: { verdictId },
        data: note !== undefined ? { note } : {},
      });
    } else {
      row = await prisma.journalEntry.create({
        data: {
          verdictId,
          note: note ?? null,
        },
      });
    }

    return NextResponse.json(
      { entry: serializeEntry(row, verdict as VerdictJoinRow) },
      { status: existing ? 200 : 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save journal entry";
    console.error("[journal] POST failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
