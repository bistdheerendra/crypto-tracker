import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";

type RouteContext = { params: Promise<{ verdictId: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Database not configured", entry: null }, { status: 503 });
    }

    const { verdictId } = await context.params;
    const id = verdictId?.trim();
    if (!id) {
      return NextResponse.json({ error: "verdictId is required", entry: null }, { status: 400 });
    }

    const row = await prisma.journalEntry.findUnique({ where: { verdictId: id } });
    if (!row) {
      return NextResponse.json({ entry: null });
    }

    return NextResponse.json({
      entry: {
        id: row.id,
        verdictId: row.verdictId,
        note: row.note,
        takenAt: row.takenAt.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load journal entry";
    console.error("[journal] GET [verdictId] failed:", err);
    return NextResponse.json({ error: message, entry: null }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { verdictId } = await context.params;
    const id = verdictId?.trim();
    if (!id) {
      return NextResponse.json({ error: "verdictId is required" }, { status: 400 });
    }

    try {
      await prisma.journalEntry.delete({ where: { verdictId: id } });
      return NextResponse.json({ ok: true, verdictId: id });
    } catch {
      return NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete journal entry";
    console.error("[journal] DELETE failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
