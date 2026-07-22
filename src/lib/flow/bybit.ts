import type { FlowMetrics } from "@/lib/binance-futures";
import { fetchJsonWithTimeout } from "@/lib/fetch-utils";

type PartialFlow = Partial<FlowMetrics> & { available: boolean };

function toBybitSymbol(pair: string): string {
  return pair.replace("/", "").toUpperCase();
}

/**
 * Bybit linear perpetual OI + funding (+ account long/short when available).
 */
export async function getBybitFlowMetrics(pair: string): Promise<PartialFlow> {
  const symbol = toBybitSymbol(pair);
  try {
    const [oiRes, fundRes, ratioRes] = await Promise.all([
      fetchJsonWithTimeout<{
        retCode?: number;
        result?: { list?: { openInterest?: string; timestamp?: string }[] };
      }>(
        `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=25`,
        5000
      ),
      fetchJsonWithTimeout<{
        retCode?: number;
        result?: { list?: { fundingRate?: string }[] };
      }>(
        `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=3`,
        5000
      ),
      fetchJsonWithTimeout<{
        retCode?: number;
        result?: { list?: { buyRatio?: string; sellRatio?: string }[] };
      }>(
        `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1h&limit=1`,
        5000
      ).catch(() => null),
    ]);

    if (oiRes.retCode !== 0 || !oiRes.result?.list?.length) {
      return { available: false };
    }

    // Bybit returns newest-first
    const list = [...oiRes.result.list].reverse();
    const oldest = parseFloat(String(list[0]?.openInterest ?? 0));
    const latest = parseFloat(String(list[list.length - 1]?.openInterest ?? 0));
    if (!(oldest > 0 && latest > 0)) return { available: false };

    const oiChange24hPct = ((latest - oldest) / oldest) * 100;

    let oiRoc: number | null = null;
    if (list.length >= 3) {
      const mid = Math.floor(list.length / 2);
      const midOi = parseFloat(String(list[mid]?.openInterest ?? 0));
      if (midOi > 0) {
        const recentPct = ((latest - midOi) / midOi) * 100;
        const priorPct = ((midOi - oldest) / oldest) * 100;
        oiRoc = recentPct - priorPct;
      }
    }

    let fundingRate = 0;
    let fundingRateRoc: number | null = null;
    const funds = fundRes.retCode === 0 ? fundRes.result?.list ?? [] : [];
    // Funding history also newest-first
    if (funds.length > 0) {
      const latestFr = parseFloat(String(funds[0]?.fundingRate ?? NaN));
      if (Number.isFinite(latestFr)) fundingRate = latestFr * 100;
      if (funds.length >= 2) {
        const priorFr = parseFloat(String(funds[1]?.fundingRate ?? NaN));
        if (Number.isFinite(latestFr) && Number.isFinite(priorFr)) {
          fundingRateRoc = (latestFr - priorFr) * 100;
        }
      }
    }

    let longShortRatio = 1;
    const ratioRow = ratioRes?.result?.list?.[0];
    if (ratioRow?.buyRatio != null && ratioRow?.sellRatio != null) {
      const buy = parseFloat(String(ratioRow.buyRatio));
      const sell = parseFloat(String(ratioRow.sellRatio));
      if (sell > 0 && Number.isFinite(buy)) longShortRatio = buy / sell;
    }

    return {
      openInterest: latest,
      oiChange24hPct,
      oiRoc,
      fundingRate,
      fundingRateRoc,
      longShortRatio,
      available: true,
    };
  } catch (err) {
    console.warn(
      "[bybit-flow]",
      symbol,
      err instanceof Error ? err.message : String(err)
    );
    return { available: false };
  }
}
