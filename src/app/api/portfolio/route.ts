import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import type { PositionRow, SignalHint } from "@/lib/portfolio/types";

const POSITION_TYPES = new Set(["spot", "long", "short"]);
const TRACKED_SET = new Set<string>(TRACKED_PAIRS);

function serializePosition(row: {
  id: string;
  assetSymbol: string;
  amount: number;
  avgEntryPrice: number;
  positionType: string;
  leverage: number | null;
  entryDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PositionRow {
  return {
    id: row.id,
    assetSymbol: row.assetSymbol,
    amount: row.amount,
    avgEntryPrice: row.avgEntryPrice,
    positionType: row.positionType,
    leverage: row.leverage,
    entryDate: row.entryDate ? row.entryDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parsePositionBody(body: Record<string, unknown>, partial = false) {
  const errors: string[] = [];

  let assetSymbol: string | undefined;
  if (typeof body.assetSymbol === "string") {
    assetSymbol = body.assetSymbol.trim();
    if (!TRACKED_SET.has(assetSymbol)) {
      errors.push(`assetSymbol must be one of: ${TRACKED_PAIRS.join(", ")}`);
    }
  } else if (!partial) {
    errors.push("assetSymbol is required");
  }

  let amount: number | undefined;
  if (body.amount !== undefined) {
    amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push("amount must be a positive number");
    }
  } else if (!partial) {
    errors.push("amount is required");
  }

  let avgEntryPrice: number | undefined;
  if (body.avgEntryPrice !== undefined) {
    avgEntryPrice = Number(body.avgEntryPrice);
    if (!Number.isFinite(avgEntryPrice) || avgEntryPrice <= 0) {
      errors.push("avgEntryPrice must be a positive number");
    }
  } else if (!partial) {
    errors.push("avgEntryPrice is required");
  }

  let positionType: string | undefined;
  if (typeof body.positionType === "string") {
    positionType = body.positionType.trim().toLowerCase();
    if (!POSITION_TYPES.has(positionType)) {
      errors.push('positionType must be "spot", "long", or "short"');
    }
  } else if (!partial) {
    errors.push("positionType is required");
  }

  let leverage: number | null | undefined;
  if (body.leverage === null || body.leverage === "" || body.leverage === undefined) {
    if (!partial) leverage = null;
  } else {
    leverage = Number(body.leverage);
    if (!Number.isFinite(leverage) || leverage <= 0) {
      errors.push("leverage must be a positive number when set");
    }
  }

  let entryDate: Date | null | undefined;
  if (body.entryDate === null || body.entryDate === "") {
    if (!partial) entryDate = null;
  } else if (typeof body.entryDate === "string") {
    const d = new Date(body.entryDate);
    if (Number.isNaN(d.getTime())) errors.push("entryDate must be a valid date");
    else entryDate = d;
  } else if (!partial) {
    entryDate = null;
  }

  return { errors, assetSymbol, amount, avgEntryPrice, positionType, leverage, entryDate };
}

async function loadSignalsForPairs(
  prisma: NonNullable<ReturnType<typeof getPrisma>>,
  pairs: string[]
): Promise<Record<string, SignalHint>> {
  const signals: Record<string, SignalHint> = {};
  await Promise.all(
    pairs.map(async (pair) => {
      const latest = await prisma.verdict.findFirst({
        where: { pair },
        orderBy: { createdAt: "desc" },
        select: {
          direction: true,
          outcome: true,
          timeframe: true,
          createdAt: true,
        },
      });
      if (latest) {
        signals[pair] = {
          direction: latest.direction,
          outcome: latest.outcome,
          timeframe: latest.timeframe,
          createdAt: latest.createdAt.toISOString(),
        };
      }
    })
  );
  return signals;
}

export async function GET() {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json(
        { error: "Database not configured", positions: [], signals: {} },
        { status: 503 }
      );
    }

    const rows = await prisma.position.findMany({
      orderBy: { createdAt: "desc" },
    });
    const positions: PositionRow[] = rows.map(serializePosition);
    const pairs: string[] = [
      ...new Set(positions.map((p) => p.assetSymbol)),
    ];
    const signals = await loadSignalsForPairs(prisma, pairs);

    return NextResponse.json({ positions, signals, count: positions.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load portfolio";
    console.error("[portfolio] GET failed:", err);
    return NextResponse.json({ error: message, positions: [], signals: {} }, { status: 500 });
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

    const parsed = parsePositionBody(body, false);
    if (parsed.errors.length) {
      return NextResponse.json({ error: parsed.errors.join("; ") }, { status: 400 });
    }

    const row = await prisma.position.create({
      data: {
        assetSymbol: parsed.assetSymbol!,
        amount: parsed.amount!,
        avgEntryPrice: parsed.avgEntryPrice!,
        positionType: parsed.positionType!,
        leverage: parsed.leverage ?? null,
        entryDate: parsed.entryDate ?? null,
      },
    });

    return NextResponse.json({ position: serializePosition(row) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create position";
    console.error("[portfolio] POST failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
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

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const parsed = parsePositionBody(body, true);
  if (parsed.errors.length) {
    return NextResponse.json({ error: parsed.errors.join("; ") }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.assetSymbol !== undefined) data.assetSymbol = parsed.assetSymbol;
  if (parsed.amount !== undefined) data.amount = parsed.amount;
  if (parsed.avgEntryPrice !== undefined) data.avgEntryPrice = parsed.avgEntryPrice;
  if (parsed.positionType !== undefined) data.positionType = parsed.positionType;
  if (parsed.leverage !== undefined) data.leverage = parsed.leverage;
  if (parsed.entryDate !== undefined) data.entryDate = parsed.entryDate;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const row = await prisma.position.update({ where: { id }, data });
    return NextResponse.json({ position: serializePosition(row) });
  } catch {
    return NextResponse.json({ error: "Position not found" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest) {
  const prisma = getPrisma();
  if (!prisma) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  try {
    await prisma.position.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "Position not found" }, { status: 404 });
  }
}
