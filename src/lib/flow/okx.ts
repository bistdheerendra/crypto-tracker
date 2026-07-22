import type { FlowMetrics } from "@/lib/binance-futures";
import { fetchJsonWithTimeout } from "@/lib/fetch-utils";

type PartialFlow = Partial<FlowMetrics> & { available: boolean };

function toOkxSwapId(pair: string): string {
  const [base, quote] = pair.toUpperCase().split("/");
  return `${base}-${quote}-SWAP`;
}

/**
 * OKX SWAP OI + funding (+ long/short account ratio when available).
 */
export async function getOkxFlowMetrics(pair: string): Promise<PartialFlow> {
  const instId = toOkxSwapId(pair);
  try {
    const [oiRes, oiHistRes, fundRes, fundHistRes, lsRes] = await Promise.all([
      fetchJsonWithTimeout<{
        code?: string;
        data?: { oi?: string; oiCcy?: string }[];
      }>(
        `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`,
        5000
      ),
      fetchJsonWithTimeout<{
        code?: string;
        data?: [string, string, string, string][];
      }>(
        // [ts, oi, oiCcy, oiUsd] — period 1H
        `https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${instId}&period=1H`,
        5000
      ).catch(() => null),
      fetchJsonWithTimeout<{
        code?: string;
        data?: { fundingRate?: string }[];
      }>(
        `https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`,
        5000
      ),
      fetchJsonWithTimeout<{
        code?: string;
        data?: { fundingRate?: string }[];
      }>(
        `https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=3`,
        5000
      ).catch(() => null),
      fetchJsonWithTimeout<{
        code?: string;
        data?: [string, string][];
      }>(
        // [ts, ratio] long/short account ratio
        `https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?instId=${instId}&period=1H`,
        5000
      ).catch(() => null),
    ]);

    if (oiRes.code !== "0" || !oiRes.data?.[0]) {
      return { available: false };
    }

    const oi = parseFloat(String(oiRes.data[0].oi ?? oiRes.data[0].oiCcy ?? 0));
    if (!(oi > 0)) return { available: false };

    let oiChange24hPct = 0;
    let oiRoc: number | null = null;

    const hist = oiHistRes?.code === "0" ? oiHistRes.data ?? [] : [];
    // OKX rubik history is typically oldest→newest or newest→first; normalize by ts
    const sorted = [...hist]
      .map((row) => ({
        ts: parseInt(String(row[0]), 10),
        oi: parseFloat(String(row[1] ?? 0)),
      }))
      .filter((r) => r.oi > 0 && Number.isFinite(r.ts))
      .sort((a, b) => a.ts - b.ts)
      .slice(-25);

    if (sorted.length >= 2) {
      const oldest = sorted[0].oi;
      const latest = sorted[sorted.length - 1].oi;
      oiChange24hPct = ((latest - oldest) / oldest) * 100;
      if (sorted.length >= 3) {
        const mid = sorted[Math.floor(sorted.length / 2)].oi;
        const recentPct = ((latest - mid) / mid) * 100;
        const priorPct = ((mid - oldest) / oldest) * 100;
        oiRoc = recentPct - priorPct;
      }
    }

    let fundingRate = 0;
    if (fundRes.code === "0" && fundRes.data?.[0]?.fundingRate != null) {
      const fr = parseFloat(String(fundRes.data[0].fundingRate));
      if (Number.isFinite(fr)) fundingRate = fr * 100;
    }

    let fundingRateRoc: number | null = null;
    const fundHist =
      fundHistRes?.code === "0" ? fundHistRes.data ?? [] : [];
    if (fundHist.length >= 2) {
      const latestFr = parseFloat(String(fundHist[0]?.fundingRate ?? NaN));
      const priorFr = parseFloat(String(fundHist[1]?.fundingRate ?? NaN));
      if (Number.isFinite(latestFr) && Number.isFinite(priorFr)) {
        fundingRateRoc = (latestFr - priorFr) * 100;
        if (!fundingRate) fundingRate = latestFr * 100;
      }
    }

    let longShortRatio = 1;
    const ls = lsRes?.code === "0" ? lsRes.data ?? [] : [];
    if (ls.length > 0) {
      // Take newest by ts
      const sortedLs = [...ls].sort(
        (a, b) => parseInt(String(b[0]), 10) - parseInt(String(a[0]), 10)
      );
      const ratio = parseFloat(String(sortedLs[0]?.[1] ?? NaN));
      if (Number.isFinite(ratio) && ratio > 0) longShortRatio = ratio;
    }

    return {
      openInterest: oi,
      oiChange24hPct,
      oiRoc,
      fundingRate,
      fundingRateRoc,
      longShortRatio,
      available: true,
    };
  } catch (err) {
    console.warn(
      "[okx-flow]",
      instId,
      err instanceof Error ? err.message : String(err)
    );
    return { available: false };
  }
}
