export interface FlowMetrics {
  openInterest: number;
  oiChange24hPct: number;
  fundingRate: number;
  longShortRatio: number;
  available: boolean;
}

const FUTURES_API = "https://fapi.binance.com/fapi/v1";
const FUTURES_DATA = "https://fapi.binance.com/futures/data";
const FUTURES_TIMEOUT_MS = 5000;

type FuturesFetchResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number | null; body: string; error: string };

async function fetchFuturesRaw(url: string): Promise<FuturesFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FUTURES_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body: body.slice(0, 500),
        error: `HTTP ${res.status}`,
      };
    }
    try {
      return { ok: true, data: JSON.parse(body) as unknown };
    } catch {
      return {
        ok: false,
        status: res.status,
        body: body.slice(0, 500),
        error: "Invalid JSON response",
      };
    }
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof err === "object" &&
        err !== null &&
        "name" in err &&
        (err as { name: string }).name === "AbortError");
    return {
      ok: false,
      status: null,
      body: "",
      error: aborted
        ? `Timeout after ${FUTURES_TIMEOUT_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function getFlowMetrics(symbol: string): Promise<FlowMetrics> {
  const pair = symbol.replace("/", "");
  const endpoints = {
    openInterest: `${FUTURES_API}/openInterest?symbol=${pair}`,
    openInterestHist: `${FUTURES_DATA}/openInterestHist?symbol=${pair}&period=1h&limit=25`,
    premiumIndex: `${FUTURES_API}/premiumIndex?symbol=${pair}`,
    longShortRatio: `${FUTURES_DATA}/globalLongShortAccountRatio?symbol=${pair}&period=1h&limit=1`,
  } as const;

  try {
    const [oiResult, oiHistResult, premiumResult, lsResult] = await Promise.all([
      fetchFuturesRaw(endpoints.openInterest),
      fetchFuturesRaw(endpoints.openInterestHist),
      fetchFuturesRaw(endpoints.premiumIndex),
      fetchFuturesRaw(endpoints.longShortRatio),
    ]);

    const failed = (
      [
        ["openInterest", oiResult],
        ["openInterestHist", oiHistResult],
        ["premiumIndex", premiumResult],
        ["longShortRatio", lsResult],
      ] as const
    ).filter(([, r]) => !r.ok);

    if (
      !oiResult.ok ||
      !oiHistResult.ok ||
      !premiumResult.ok ||
      !lsResult.ok
    ) {
      for (const [name, result] of failed) {
        if (result.ok) continue;
        console.error("[binance-futures] endpoint failed", {
          symbol: pair,
          endpoint: name,
          url: endpoints[name],
          status: result.status,
          error: result.error,
          body: result.body || undefined,
        });
      }
      return {
        openInterest: 0,
        oiChange24hPct: 0,
        fundingRate: 0,
        longShortRatio: 1,
        available: false,
      };
    }

    const oiRes = oiResult.data;
    const oiHistRes = oiHistResult.data;
    const premiumRes = premiumResult.data;
    const lsRes = lsResult.data;

    const oi = parseFloat(
      String((oiRes as { openInterest?: string }).openInterest ?? 0)
    );
    const hist = oiHistRes as { sumOpenInterest?: string }[];
    const oldestOi = parseFloat(String(hist[0]?.sumOpenInterest ?? oi));
    const latestOi = parseFloat(
      String(hist[hist.length - 1]?.sumOpenInterest ?? oi)
    );
    const oiChange24hPct =
      oldestOi > 0 ? ((latestOi - oldestOi) / oldestOi) * 100 : 0;

    const fundingRate =
      parseFloat(
        String(
          (premiumRes as { lastFundingRate?: string }).lastFundingRate ?? 0
        )
      ) * 100;

    const lsRow = (lsRes as { longShortRatio?: string }[])[0];
    const longShortRatio = parseFloat(String(lsRow?.longShortRatio ?? 1));

    if (!(oi > 0)) {
      console.error("[binance-futures] openInterest missing or zero", {
        symbol: pair,
        oiRes,
      });
    }

    return {
      openInterest: oi,
      oiChange24hPct,
      fundingRate,
      longShortRatio,
      available: oi > 0,
    };
  } catch (err) {
    console.error("[binance-futures] getFlowMetrics unexpected error", {
      symbol: pair,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      openInterest: 0,
      oiChange24hPct: 0,
      fundingRate: 0,
      longShortRatio: 1,
      available: false,
    };
  }
}
