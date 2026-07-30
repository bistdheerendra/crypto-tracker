import {
  getBinanceFlowMetrics,
  isBinanceFuturesRegionBlocked,
  type FlowMetrics,
} from "@/lib/binance-futures";
import { getBybitFlowMetrics, isBybitFlowBlocked } from "./bybit";
import { getOkxFlowMetrics } from "./okx";

export type AggregatedFlowMetrics = FlowMetrics & {
  /** Exchanges that contributed (e.g. binance, bybit, okx). */
  sources: string[];
  /** Venues attempted this call (may include skipped region-blocked ones as "skipped"). */
  attempted: string[];
};

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function avgNullable(nums: Array<number | null | undefined>): number | null {
  const clean = nums.filter((n): n is number => n != null && Number.isFinite(n));
  return avg(clean);
}

/**
 * Multi-exchange flow: Binance + Bybit + OKX.
 * % metrics are averaged across available venues; absolute OI prefers Binance
 * (units differ across exchanges).
 *
 * Region-blocked venues (Binance 451 / Bybit 403 on some hosts) are skipped for
 * 30m after first detection so cron batches don't hammer dead endpoints.
 */
export async function getFlowMetrics(
  symbol: string
): Promise<AggregatedFlowMetrics> {
  const attempted: string[] = [];
  const skipBinance = isBinanceFuturesRegionBlocked();
  const skipBybit = isBybitFlowBlocked();

  const binancePromise = skipBinance
    ? Promise.resolve({
        available: false as const,
        openInterest: 0,
        oiChange24hPct: 0,
        oiRoc: null,
        fundingRate: 0,
        fundingRateRoc: null,
        longShortRatio: 1,
      })
    : getBinanceFlowMetrics(symbol);
  if (skipBinance) attempted.push("binance:skipped");
  else attempted.push("binance");

  const bybitPromise = skipBybit
    ? Promise.resolve({ available: false as const })
    : getBybitFlowMetrics(symbol);
  if (skipBybit) attempted.push("bybit:skipped");
  else attempted.push("bybit");

  attempted.push("okx");
  const [binance, bybit, okx] = await Promise.all([
    binancePromise,
    bybitPromise,
    getOkxFlowMetrics(symbol),
  ]);

  const parts: {
    name: string;
    m: FlowMetrics | (Partial<FlowMetrics> & { available: boolean });
  }[] = [
    { name: "binance", m: binance },
    { name: "bybit", m: bybit },
    { name: "okx", m: okx },
  ];

  const available = parts.filter((p) => p.m.available);
  if (!available.length) {
    console.error("[flow] all venues exhausted", {
      symbol,
      attempted,
      binanceBlocked: skipBinance,
      bybitBlocked: skipBybit,
    });
    return {
      openInterest: 0,
      oiChange24hPct: 0,
      oiRoc: null,
      fundingRate: 0,
      fundingRateRoc: null,
      longShortRatio: 1,
      available: false,
      sources: [],
      attempted,
    };
  }

  const sources = available.map((p) => p.name);
  const oiChange24hPct =
    avg(available.map((p) => p.m.oiChange24hPct ?? 0)) ?? 0;
  const fundingRate = avg(available.map((p) => p.m.fundingRate ?? 0)) ?? 0;
  const oiRoc = avgNullable(available.map((p) => p.m.oiRoc));
  const fundingRateRoc = avgNullable(available.map((p) => p.m.fundingRateRoc));
  const longShortRatio =
    avg(available.map((p) => p.m.longShortRatio ?? 1)) ?? 1;

  // Prefer Binance absolute OI when present (comparable units for our UI)
  const openInterest =
    binance.available && binance.openInterest > 0
      ? binance.openInterest
      : available[0].m.openInterest ?? 0;

  return {
    openInterest,
    oiChange24hPct,
    oiRoc,
    fundingRate,
    fundingRateRoc,
    longShortRatio,
    available: true,
    sources,
    attempted,
  };
}

export function formatFlowSources(sources: string[]): string {
  if (!sources.length) return "unavailable";
  return sources.join("+");
}
