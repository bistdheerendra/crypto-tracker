import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { getOrCreatePaperWallet } from "@/lib/paperWallet";

function serializeWallet(row: {
  id: string;
  startingBalance: number;
  cashBalance: number;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    startingBalance: row.startingBalance,
    cashBalance: row.cashBalance,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const wallet = await getOrCreatePaperWallet(prisma);
    return NextResponse.json({ wallet: serializeWallet(wallet) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load paper wallet";
    console.error("[paper-wallet] GET failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
