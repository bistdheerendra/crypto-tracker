import { getPrice } from "@/lib/binance";
import { getPrisma } from "@/lib/db";
import { getOrCreatePaperWallet } from "@/lib/paperWallet";

function round(n: number, digits: number): number {
  return Number(n.toFixed(digits));
}

export async function closePortfolioPosition(args: {
  prisma: NonNullable<ReturnType<typeof getPrisma>>;
  positionId: string;
  closeQty: number;
}) {
  const position = await args.prisma.position.findUnique({ where: { id: args.positionId } });
  if (!position) throw new Error("Position not found");
  if (position.status === "closed" || position.exitedAt) throw new Error("Position already closed");

  const openQty = Math.max(position.amount - position.closedAmount, 0);
  if (!(args.closeQty > 0)) throw new Error("closeQty must be a positive number");
  if (args.closeQty - openQty > 1e-12) {
    throw new Error("closeQty exceeds remaining open amount");
  }

  const currentPrice = await getPrice(position.assetSymbol);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
    throw new Error("Failed to fetch a valid market price");
  }

  const rawPnl =
    position.positionType === "short"
      ? (position.avgEntryPrice - currentPrice) * args.closeQty
      : (currentPrice - position.avgEntryPrice) * args.closeQty;
  const pnlDelta = round(rawPnl, 2);
  const cashCredit = round(position.avgEntryPrice * args.closeQty + pnlDelta, 2);
  const nextClosedAmount = round(position.closedAmount + args.closeQty, 12);
  const fullyClosed = position.amount - nextClosedAmount <= 1e-10;

  const result = await args.prisma.$transaction(async (tx: any) => {
    const wallet = await getOrCreatePaperWallet(tx);
    const nextCashBalance = round(wallet.cashBalance + cashCredit, 2);
    const updatedWallet = await tx.paperWallet.update({
      where: { id: wallet.id },
      data: { cashBalance: nextCashBalance },
    });

    const updatedPosition = await tx.position.update({
      where: { id: position.id },
      data: {
        closedAmount: fullyClosed ? position.amount : nextClosedAmount,
        realizedPnl: round(position.realizedPnl + pnlDelta, 2),
        status: fullyClosed ? "closed" : "open",
        exitedAt: fullyClosed ? new Date() : null,
        exitPrice: currentPrice,
      },
    });

    return { updatedWallet, updatedPosition };
  });

  return {
    position: result.updatedPosition,
    wallet: result.updatedWallet,
    closeQty: args.closeQty,
    currentPrice,
    pnlDelta,
    cashCredit,
  };
}
