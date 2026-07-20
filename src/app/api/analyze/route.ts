import { NextRequest, NextResponse } from "next/server";
import { getKlines, getPrice, computeATR } from "@/lib/binance";
import { getFlowMetrics } from "@/lib/binance-futures";
import { getMacroSnapshot } from "@/lib/macro";
import { getNarrativeSnapshot } from "@/lib/narrative";
import {
  runTechnicalLane,
  runFlowLane,
  runNarrativeLane,
  runMacroLane,
  synthesizeVerdict,
} from "@/lib/analysis/synthesizer";
import { invalidateCache } from "@/lib/backtest/cache";
import { invalidateLaneWeightCache } from "@/lib/backtest/lane-weights";
import { saveVerdict } from "@/lib/verdicts/store";
import type { LaneOutput, Verdict } from "@/lib/types";

function persistVerdict(verdict: Verdict, lanes: LaneOutput[]) {
  if (verdict.direction !== "NEUTRAL") {
    saveVerdict(verdict, lanes);
    invalidateCache("track-record");
    invalidateLaneWeightCache();
  }
}

export async function GET(req: NextRequest) {
  const pair = req.nextUrl.searchParams.get("pair") || "BTC/USDT";
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "1h";

  try {
    const [klines, price, flowResult, narrativeResult, macroResult] = await Promise.all([
      getKlines(pair, timeframe, 200),
      getPrice(pair),
      getFlowMetrics(pair),
      getNarrativeSnapshot(pair),
      getMacroSnapshot(),
    ]);

    const flow = flowResult;
    const narrative = narrativeResult;
    const macro = macroResult;

    if (!klines.length) {
      return NextResponse.json(
        { error: "Insufficient market data for analysis." },
        { status: 503 }
      );
    }

    const closes = klines.map((k) => parseFloat(String(k[4])));
    const highs = klines.map((k) => parseFloat(String(k[2])));
    const lows = klines.map((k) => parseFloat(String(k[3])));
    const atr = computeATR(highs, lows, closes);

    const lanes = [
      runTechnicalLane(closes, highs, lows),
      runFlowLane(flow, narrative.priceChange24hPct),
      runNarrativeLane(narrative),
      runMacroLane(macro),
    ];

    const verdict = synthesizeVerdict(lanes, pair, timeframe, price, atr, highs, lows);
    persistVerdict(verdict, lanes);

    return NextResponse.json({
      lanes,
      verdict,
      price,
      dataSources: {
        klines: "binance",
        price: "binance",
        flow: flow.available ? "binance-futures" : "unavailable",
        narrative: narrative.available ? "alternative.me+coingecko+binance" : "unavailable",
        macro: macro.available ? "yahoo-finance" : "unavailable",
        stopLoss: "swing-structure",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
