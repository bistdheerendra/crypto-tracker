import { NextRequest, NextResponse } from "next/server";
import { getPrice } from "@/lib/binance";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") || "BTC/USDT";
  try {
    const price = await getPrice(symbol);
    return NextResponse.json({ symbol, price });
  } catch {
    return NextResponse.json({ symbol, price: 94832.5, mock: true });
  }
}
