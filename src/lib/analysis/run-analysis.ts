import { getFlowMetrics, formatFlowSources } from "@/lib/flow/aggregate";
import { getMacroSnapshot } from "@/lib/macro";
import {
  WHALE_CHAIN_BY_PAIR,
  WHALE_LIQUIDATION_LOOKBACK_MS,
} from "@/lib/market/constants";
import { getNarrativeSnapshot } from "@/lib/narrative";
import { getLiquidationActivitySince } from "@/lib/radar/liquidations";
import {
  getWhaleActivitySince,
  isWhaleCaptureEnabled,
} from "@/lib/radar/whales";
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
  type VerdictFeaturePayload,
  type WhaleLiquidationRawFeatures,
} from "@/lib/verdicts/features";
import { saveVerdict } from "@/lib/verdicts/store";
import type { LaneOutput, Verdict } from "@/lib/types";
import { getKlines, getPrice, computeATR } from "@/lib/binance";

export type AnalysisResult = {
  lanes: LaneOutput[];
  verdict: Verdict;
  price: number;
  /** Point-in-time features (for ML display); not part of the public verdict DTO. */
  features: VerdictFeaturePayload;
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
  const sinceMs = Date.now() - WHALE_LIQUIDATION_LOOKBACK_MS;
  const whaleChain = WHALE_CHAIN_BY_PAIR[pair] ?? null;
  const whaleCaptureEnabled = isWhaleCaptureEnabled();

  // Whale/liq run in parallel with lane inputs; failures never block analyze.
  // Whale capture is opt-in (WHALE_CAPTURE_ENABLED=true) — default off to avoid
  // high-frequency Blockchair/Blockstream hits from the verdicts cron.
  // Liquidation capture always runs.
  const whaleLiqPromise = Promise.allSettled([
    whaleChain && whaleCaptureEnabled
      ? getWhaleActivitySince(whaleChain, sinceMs)
      : Promise.resolve(null),
    getLiquidationActivitySince(pair, sinceMs),
  ]);

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

  const [whaleSettled, liqSettled] = await whaleLiqPromise;
  const whaleLiquidation: WhaleLiquidationRawFeatures = {
    whaleNetFlowUsd: null,
    whaleTransactionCount: null,
    liquidationNetImbalanceUsd: null,
    liquidationVolumeUsd: null,
  };

  if (!whaleChain) {
    // BNB/XRP etc. — no whale tracker coverage; leave whale fields null.
  } else if (!whaleCaptureEnabled) {
    // Feature capture skipped (WHALE_CAPTURE_ENABLED≠true); leave whale fields null.
  } else if (whaleSettled.status === "fulfilled" && whaleSettled.value) {
    whaleLiquidation.whaleNetFlowUsd = whaleSettled.value.whaleNetFlowUsd;
    whaleLiquidation.whaleTransactionCount =
      whaleSettled.value.whaleTransactionCount;
  } else if (whaleSettled.status === "rejected") {
    console.warn(
      "[features] whale activity unavailable:",
      whaleSettled.reason instanceof Error
        ? whaleSettled.reason.message
        : String(whaleSettled.reason)
    );
  }
  // fulfilled + null (fetch failed) → leave whale fields null (unknown, not zero)

  if (liqSettled.status === "fulfilled") {
    whaleLiquidation.liquidationNetImbalanceUsd =
      liqSettled.value.liquidationNetImbalanceUsd;
    whaleLiquidation.liquidationVolumeUsd =
      liqSettled.value.liquidationVolumeUsd;
  } else {
    console.warn(
      "[features] liquidation activity unavailable:",
      liqSettled.reason instanceof Error
        ? liqSettled.reason.message
        : String(liqSettled.reason)
    );
  }

  const features = buildVerdictFeatures({
    pair,
    timeframe,
    confidenceTier: verdict.tier,
    lanes,
    technical: techRun.raw as TechnicalRawFeatures | null,
    flow: flowRun.raw as FlowRawFeatures | null,
    narrative: narrRun.raw as NarrativeRawFeatures | null,
    macro: macroRun.raw as MacroRawFeatures | null,
    whaleLiquidation,
  });

  let persisted = false;
  if (verdict.direction !== "NEUTRAL") {
    await saveVerdict(verdict, lanes, features);
    await invalidateCache("track-record");
    invalidateLaneWeightCache();
    persisted = true;
    // Telegram alert — never block analyze on notify failures
    void import("@/lib/alerts/notify")
      .then(({ notifyVerdictAlert }) => notifyVerdictAlert(verdict, lanes))
      .catch((err) => {
        console.warn(
          "[alerts] verdict notify failed",
          err instanceof Error ? err.message : String(err)
        );
      });
  }

  return {
    lanes,
    verdict,
    price,
    features,
    dataSources: {
      klines: "binance",
      price: "binance",
      flow: flow.available ? formatFlowSources(flow.sources) : "unavailable",
      narrative: narrative.available
        ? "alternative.me+coingecko+binance"
        : "unavailable",
      macro: macro.available ? "yahoo-finance" : "unavailable",
      stopLoss: "swing-structure",
    },
    persisted,
  };
}
