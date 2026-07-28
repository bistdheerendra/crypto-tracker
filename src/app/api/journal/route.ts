import { NextRequest, NextResponse } from "next/server";
import { computeTrackRecord } from "@/lib/backtest/aggregator";
import { getPrisma } from "@/lib/db";
import {
  serializeJournalEntry,
  toStoredVerdict,
  type JournalDbRow,
  type VerdictJoinRow,
} from "@/lib/journal/serialize";
import type { JournalEntryRow } from "@/lib/journal/types";
import type { StoredVerdict } from "@/lib/verdicts/types";

export async function GET() {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json(
        { error: "Database not configured", entries: [], count: 0, personalStats: null },
        { status: 503 }
      );
    }

    const rows: JournalDbRow[] = await prisma.journalEntry.findMany({
      orderBy: { takenAt: "desc" },
    });

    const verdictIds = rows.map((r) => r.verdictId);
    const verdictRows: VerdictJoinRow[] =
      verdictIds.length > 0
        ? await prisma.verdict.findMany({
            where: { id: { in: verdictIds } },
          })
        : [];

    const byId = new Map(verdictRows.map((v) => [v.id, v]));
    const entries: JournalEntryRow[] = rows.map((row) =>
      serializeJournalEntry(row, byId.get(row.verdictId))
    );

    const personalStats =
      verdictRows.length > 0
        ? computeTrackRecord(
            rows
              .map((row) => {
                const v = byId.get(row.verdictId);
                return v ? toStoredVerdict(v, row) : null;
              })
              .filter((v): v is StoredVerdict => v != null)
          )
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

    let row: JournalDbRow;
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
      { entry: serializeJournalEntry(row, verdict as VerdictJoinRow) },
      { status: existing ? 200 : 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save journal entry";
    console.error("[journal] POST failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
