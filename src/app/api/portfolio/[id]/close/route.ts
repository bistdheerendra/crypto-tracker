import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { closePortfolioPosition } from "@/lib/portfolio/closePosition";

type RouteContext = { params: Promise<{ id: string }> };

function getCloseQty(body: Record<string, unknown>, openQty: number): number {
  if (body.closeQty !== undefined) {
    const closeQty = Number(body.closeQty);
    if (Number.isFinite(closeQty) && closeQty > 0) return closeQty;
    throw new Error("closeQty must be a positive number");
  }
  if (body.closePercent !== undefined) {
    const closePercent = Number(body.closePercent);
    if (!Number.isFinite(closePercent) || closePercent <= 0 || closePercent > 100) {
      throw new Error("closePercent must be between 0 and 100");
    }
    return (openQty * closePercent) / 100;
  }
  return openQty;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { id: rawId } = await context.params;
    const id = rawId?.trim();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const position = await prisma.position.findUnique({ where: { id } });
    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }
    const openQty = Math.max(position.amount - position.closedAmount, 0);
    if (openQty <= 0 || position.status === "closed" || position.exitedAt) {
      return NextResponse.json({ error: "Position already closed" }, { status: 409 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // optional body; defaults to full close
    }
    const closeQty = getCloseQty(body, openQty);

    const result = await closePortfolioPosition({ prisma, positionId: id, closeQty });
    return NextResponse.json({
      position: result.position,
      wallet: result.wallet,
      closeQty: result.closeQty,
      closePrice: result.currentPrice,
      realizedPnlDelta: result.pnlDelta,
      cashCredit: result.cashCredit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to close position";
    if (
      message === "closeQty must be a positive number" ||
      message === "closePercent must be between 0 and 100" ||
      message === "closeQty exceeds remaining open amount"
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message === "Position not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message === "Position already closed") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[portfolio] POST [id]/close failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
