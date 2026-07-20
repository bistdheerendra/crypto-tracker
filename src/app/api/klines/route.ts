import { NextRequest, NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "BTC/USDT";
  const interval = req.nextUrl.searchParams.get("interval") || "1h";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 200), 500);

  try {
    const klines = await getKlines(symbol, interval, limit);
    const candles = klines.map((k) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(String(k[1])),
      high: parseFloat(String(k[2])),
      low: parseFloat(String(k[3])),
      close: parseFloat(String(k[4])),
    }));

    return NextResponse.json({ symbol, interval, candles });
  } catch {
    return NextResponse.json({ symbol, interval, candles: [], error: true }, { status: 502 });
  }
}
