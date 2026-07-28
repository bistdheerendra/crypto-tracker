import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { closePortfolioPosition } from "@/lib/portfolio/closePosition";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, context: RouteContext) {
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
    if (position.exitedAt || position.status === "closed") {
      return NextResponse.json({ error: "Position already exited" }, { status: 409 });
    }

    const openQty = Math.max(position.amount - position.closedAmount, 0);
    const result = await closePortfolioPosition({ prisma, positionId: id, closeQty: openQty });

    return NextResponse.json({
      position: {
        id: result.position.id,
        exitedAt: result.position.exitedAt ? result.position.exitedAt.toISOString() : null,
        exitPrice: result.position.exitPrice,
        realizedPnl: result.position.realizedPnl,
        closedAmount: result.position.closedAmount,
        status: result.position.status,
      },
      wallet: result.wallet,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to exit position";
    console.error("[portfolio] POST [id]/exit failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
