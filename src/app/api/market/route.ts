import { NextRequest, NextResponse } from "next/server";
import { getPrice, get24hTicker } from "@/lib/binance";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "BTC/USDT";
  try {
    const [price, ticker] = await Promise.all([
      getPrice(symbol),
      get24hTicker(symbol).catch(() => null),
    ]);
    const change24hPct = ticker
      ? parseFloat(
          String(
            (ticker as { priceChangePercent?: string }).priceChangePercent ?? 0
          )
        )
      : null;
    return NextResponse.json({ symbol, price, change24hPct });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Price fetch failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
