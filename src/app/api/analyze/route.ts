import { NextRequest, NextResponse } from "next/server";
import { getKlines, getPrice, getFallbackPrice } from "@/lib/binance";
import {
  runTechnicalLane,
  runFlowLane,
  runNarrativeLane,
  runMacroLane,
  synthesizeVerdict,
  computeATR,
} from "@/lib/analysis/synthesizer";

export async function GET(req: NextRequest) {
  const pair = req.nextUrl.searchParams.get("pair") || "BTC/USDT";
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "1h";

  try {
    const [klines, price] = await Promise.all([
      getKlines(pair, timeframe, 200),
      getPrice(pair),
    ]);

    const closes = klines.map((k) => parseFloat(String(k[4])));
    const highs = klines.map((k) => parseFloat(String(k[2])));
    const lows = klines.map((k) => parseFloat(String(k[3])));
    const atr = computeATR(highs, lows, closes);

    const lanes = [
      runTechnicalLane(closes, highs, lows),
      runFlowLane(),
      runNarrativeLane(),
      runMacroLane(),
    ];

    const verdict = synthesizeVerdict(lanes, pair, timeframe, price, atr);

    return NextResponse.json({ lanes, verdict, price });
  } catch {
    const price = getFallbackPrice(pair);
    const atr = price * 0.02;
    const closes = Array.from({ length: 200 }, (_, i) => price - 2000 + i * 15);
    const highs = closes.map((c) => c + 100);
    const lows = closes.map((c) => c - 100);

    const lanes = [
      runTechnicalLane(closes, highs, lows),
      runFlowLane(),
      runNarrativeLane(),
      runMacroLane(),
    ];
    const verdict = synthesizeVerdict(lanes, pair, timeframe, price, atr);
    return NextResponse.json({ lanes, verdict, price, mock: true });
  }
}
