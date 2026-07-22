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
import {
  buildVerdictFeatures,
  type FlowRawFeatures,
  type MacroRawFeatures,
  type NarrativeRawFeatures,
  type TechnicalRawFeatures,
} from "@/lib/verdicts/features";
import { saveVerdict } from "@/lib/verdicts/store";
import type { LaneOutput, Verdict } from "@/lib/types";

export type AnalysisResult = {
  lanes: LaneOutput[];
  verdict: Verdict;
  price: number;
  dataSources: {
    klines: string;
    price: string;
    flow: string;
    narrative: string;
    macro: string;
    stopLoss: string;
  };
  /** True when a non-NEUTRAL verdict was persisted. */
  persisted: boolean;
};

/**
 * Core analyze pipeline used by GET /api/analyze and the generate-verdicts cron.
 * Throws on hard failures (e.g. no klines).
 */
export async function runAnalysis(
  pair: string,
  timeframe: string
): Promise<AnalysisResult> {
  const [klines, price, flow, narrative, macro] = await Promise.all([
    getKlines(pair, timeframe, 200),
    getPrice(pair),
    getFlowMetrics(pair),
    getNarrativeSnapshot(pair),
    getMacroSnapshot(),
  ]);

  if (!klines.length) {
    throw new Error("Insufficient market data for analysis.");
  }

  const closes = klines.map((k) => parseFloat(String(k[4])));
  const highs = klines.map((k) => parseFloat(String(k[2])));
  const lows = klines.map((k) => parseFloat(String(k[3])));
  const atr = computeATR(highs, lows, closes);

  const techRun = runTechnicalLane(closes, highs, lows);
  const flowRun = runFlowLane(flow, narrative.priceChange24hPct);
  const narrRun = runNarrativeLane(narrative, pair);
  const macroRun = runMacroLane(macro);

  const lanes: LaneOutput[] = [
    techRun.output,
    flowRun.output,
    narrRun.output,
    macroRun.output,
  ];

  const verdict = await synthesizeVerdict(
    lanes,
    pair,
    timeframe,
    price,
    atr,
    highs,
    lows
  );

  const features = buildVerdictFeatures({
    pair,
    timeframe,
    confidenceTier: verdict.tier,
    lanes,
    technical: techRun.raw as TechnicalRawFeatures | null,
    flow: flowRun.raw as FlowRawFeatures | null,
    narrative: narrRun.raw as NarrativeRawFeatures | null,
    macro: macroRun.raw as MacroRawFeatures | null,
  });

  let persisted = false;
  if (verdict.direction !== "NEUTRAL") {
    await saveVerdict(verdict, lanes, features);
    await invalidateCache("track-record");
    invalidateLaneWeightCache();
    persisted = true;
  }

  return {
    lanes,
    verdict,
    price,
    dataSources: {
      klines: "binance",
      price: "binance",
      flow: flow.available ? "binance-futures" : "unavailable",
      narrative: narrative.available
        ? "alternative.me+coingecko+binance"
        : "unavailable",
      macro: macro.available ? "yahoo-finance" : "unavailable",
      stopLoss: "swing-structure",
    },
    persisted,
  };
}
