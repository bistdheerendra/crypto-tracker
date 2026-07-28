import { NextRequest, NextResponse } from "next/server";
import { getPrice } from "@/lib/binance";
import { getPrisma } from "@/lib/db";
import { computeExitRMultiple } from "@/lib/journal/pnl";
import {
  serializeJournalEntry,
  type VerdictJoinRow,
} from "@/lib/journal/serialize";

type RouteContext = { params: Promise<{ verdictId: string }> };

/**
 * POST /api/journal/[verdictId]/exit
 * Books a personal exit at live (or client-provided) price.
 * Does NOT mutate Verdict — system SL/TP resolution stays independent.
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { verdictId: rawId } = await context.params;
    const verdictId = rawId?.trim();
    if (!verdictId) {
      return NextResponse.json({ error: "verdictId is required" }, { status: 400 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine — we'll fetch live price
    }

    const entry = await prisma.journalEntry.findUnique({ where: { verdictId } });
    if (!entry) {
      return NextResponse.json(
        { error: "Journal entry not found — mark the verdict as taken first." },
        { status: 404 }
      );
    }
    if (entry.exitedAt) {
      return NextResponse.json(
        { error: "Trade already exited", entry: serializeJournalEntry(entry, undefined) },
        { status: 409 }
      );
    }

    const verdict = (await prisma.verdict.findUnique({
      where: { id: verdictId },
    })) as VerdictJoinRow | null;
    if (!verdict) {
      return NextResponse.json({ error: "Verdict not found" }, { status: 404 });
    }

    let exitPrice: number;
    if (
      typeof body.exitPrice === "number" &&
      Number.isFinite(body.exitPrice) &&
      body.exitPrice > 0
    ) {
      exitPrice = body.exitPrice;
    } else {
      exitPrice = await getPrice(verdict.pair);
    }

    const exitRMultiple = computeExitRMultiple(
      verdict.direction,
      verdict.entryPrice,
      verdict.stopLoss,
      exitPrice
    );
    if (exitRMultiple == null) {
      return NextResponse.json(
        { error: "Cannot compute R-multiple for this direction." },
        { status: 400 }
      );
    }

    const updated = await prisma.journalEntry.update({
      where: { verdictId },
      data: {
        exitedAt: new Date(),
        exitPrice,
        exitRMultiple,
      },
    });

    return NextResponse.json({
      entry: serializeJournalEntry(updated, verdict),
      exitPrice,
      exitRMultiple,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to exit trade";
    console.error("[journal] POST exit failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
