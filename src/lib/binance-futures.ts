export interface FlowMetrics {
  openInterest: number;
  oiChange24hPct: number;
  /** Acceleration of OI % change: recent-window Δ% minus prior-window Δ%. */
  oiRoc: number | null;
  fundingRate: number;
  /** Funding rate delta vs ~8h prior (same %-scale units as fundingRate). */
  fundingRateRoc: number | null;
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

function pctChange(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

/** Recent-window OI Δ% minus prior-window OI Δ% (acceleration). */
function computeOiRoc(hist: { sumOpenInterest?: string }[]): number | null {
  if (hist.length < 3) {
    console.warn(
      "[binance-futures] oiRoc unavailable: need ≥3 openInterestHist points"
    );
    return null;
  }
  const mid = Math.floor(hist.length / 2);
  const oldest = parseFloat(String(hist[0]?.sumOpenInterest ?? 0));
  const midOi = parseFloat(String(hist[mid]?.sumOpenInterest ?? 0));
  const latest = parseFloat(
    String(hist[hist.length - 1]?.sumOpenInterest ?? 0)
  );
  if (!(oldest > 0 && midOi > 0 && latest > 0)) {
    console.warn(
      "[binance-futures] oiRoc unavailable: zero/missing OI in history"
    );
    return null;
  }
  const recentPct = pctChange(midOi, latest);
  const priorPct = pctChange(oldest, midOi);
  return recentPct - priorPct;
}

/** Latest funding − funding ~8h prior, in same % units as fundingRate (*100). */
function computeFundingRateRoc(
  rows: { fundingRate?: string }[]
): number | null {
  if (rows.length < 2) {
    console.warn(
      "[binance-futures] fundingRateRoc unavailable: need ≥2 fundingRate history rows"
    );
    return null;
  }
  const latest = parseFloat(String(rows[rows.length - 1]?.fundingRate ?? NaN));
  // Prefer ~8h prior (second-to-last); funding settles every 8h on most pairs.
  const prior = parseFloat(String(rows[rows.length - 2]?.fundingRate ?? NaN));
  if (!Number.isFinite(latest) || !Number.isFinite(prior)) {
    console.warn(
      "[binance-futures] fundingRateRoc unavailable: non-numeric fundingRate"
    );
    return null;
  }
  return (latest - prior) * 100;
}

export async function getBinanceFlowMetrics(symbol: string): Promise<FlowMetrics> {
  const pair = symbol.replace("/", "");
  const endpoints = {
    openInterest: `${FUTURES_API}/openInterest?symbol=${pair}`,
    openInterestHist: `${FUTURES_DATA}/openInterestHist?symbol=${pair}&period=1h&limit=25`,
    premiumIndex: `${FUTURES_API}/premiumIndex?symbol=${pair}`,
    fundingRateHist: `${FUTURES_API}/fundingRate?symbol=${pair}&limit=3`,
    longShortRatio: `${FUTURES_DATA}/globalLongShortAccountRatio?symbol=${pair}&period=1h&limit=1`,
  } as const;

  try {
    const [oiResult, oiHistResult, premiumResult, fundingHistResult, lsResult] =
      await Promise.all([
        fetchFuturesRaw(endpoints.openInterest),
        fetchFuturesRaw(endpoints.openInterestHist),
        fetchFuturesRaw(endpoints.premiumIndex),
        fetchFuturesRaw(endpoints.fundingRateHist),
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
        oiRoc: null,
        fundingRate: 0,
        fundingRateRoc: null,
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
    const oiRoc = computeOiRoc(hist);

    const fundingRate =
      parseFloat(
        String(
          (premiumRes as { lastFundingRate?: string }).lastFundingRate ?? 0
        )
      ) * 100;

    let fundingRateRoc: number | null = null;
    if (!fundingHistResult.ok) {
      console.warn(
        "[binance-futures] fundingRateRoc unavailable: fundingRate history fetch failed",
        {
          symbol: pair,
          status: fundingHistResult.status,
          error: fundingHistResult.error,
        }
      );
    } else {
      fundingRateRoc = computeFundingRateRoc(
        fundingHistResult.data as { fundingRate?: string }[]
      );
    }

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
      oiRoc,
      fundingRate,
      fundingRateRoc,
      longShortRatio,
      available: oi > 0,
    };
  } catch (err) {
    console.error("[binance-futures] getBinanceFlowMetrics unexpected error", {
      symbol: pair,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return {
      openInterest: 0,
      oiChange24hPct: 0,
      oiRoc: null,
      fundingRate: 0,
      fundingRateRoc: null,
      longShortRatio: 1,
      available: false,
    };
  }
}
