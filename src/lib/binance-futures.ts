import { fetchJsonWithTimeout } from "./fetch-utils";

export interface FlowMetrics {
  openInterest: number;
  oiChange24hPct: number;
  fundingRate: number;
  longShortRatio: number;
  available: boolean;
}

const FUTURES_API = "https://fapi.binance.com/fapi/v1";
const FUTURES_DATA = "https://fapi.binance.com/futures/data";

async function fetchFuturesJson(path: string): Promise<unknown> {
  return fetchJsonWithTimeout(`${FUTURES_API}${path}`, 5000);
}

async function fetchFuturesDataJson(path: string): Promise<unknown> {
  return fetchJsonWithTimeout(`${FUTURES_DATA}${path}`, 5000);
}

export async function getFlowMetrics(symbol: string): Promise<FlowMetrics> {
  const pair = symbol.replace("/", "");

  try {
    const [oiRes, oiHistRes, premiumRes, lsRes] = await Promise.all([
      fetchFuturesJson(`/openInterest?symbol=${pair}`),
      fetchFuturesDataJson(
        `/openInterestHist?symbol=${pair}&period=1h&limit=25`
      ),
      fetchFuturesJson(`/premiumIndex?symbol=${pair}`),
      fetchFuturesDataJson(
        `/globalLongShortAccountRatio?symbol=${pair}&period=1h&limit=1`
      ),
    ]);

    const oi = parseFloat(String((oiRes as { openInterest?: string }).openInterest ?? 0));
    const hist = oiHistRes as { sumOpenInterest?: string }[];
    const oldestOi = parseFloat(String(hist[0]?.sumOpenInterest ?? oi));
    const latestOi = parseFloat(String(hist[hist.length - 1]?.sumOpenInterest ?? oi));
    const oiChange24hPct =
      oldestOi > 0 ? ((latestOi - oldestOi) / oldestOi) * 100 : 0;

    const fundingRate =
      parseFloat(String((premiumRes as { lastFundingRate?: string }).lastFundingRate ?? 0)) *
      100;

    const lsRow = (lsRes as { longShortRatio?: string }[])[0];
    const longShortRatio = parseFloat(String(lsRow?.longShortRatio ?? 1));

    return {
      openInterest: oi,
      oiChange24hPct,
      fundingRate,
      longShortRatio,
      available: oi > 0,
    };
  } catch {
    return {
      openInterest: 0,
      oiChange24hPct: 0,
      fundingRate: 0,
      longShortRatio: 1,
      available: false,
    };
  }
}
