import { get24hTicker } from "./binance";
import {
  fetchErrorDetails,
  fetchJsonWithTimeout,
  HttpFetchError,
} from "./fetch-utils";
import { getRadarCache, setRadarCache } from "./radar/utils";
import { getNewsSentimentForPair } from "./radar/news";
import type { Sentiment } from "./types";

export interface NarrativeSnapshot {
  fearGreed: number | null;
  fearGreedLabel: string | null;
  /** Current F&G minus value ~24h ago (alternative.me daily series). */
  fearGreedRoc: number | null;
  priceChange24hPct: number;
  volume24h: number;
  globalMarketCapChange24hPct: number | null;
  trendingCoins: string[];
  /** Aggregated RSS headline NLP score (−1…1). */
  headlineSentimentScore: number | null;
  headlineSentiment: Sentiment | null;
  headlineSampleSize: number;
  available: boolean;
}

type FearGreedEntry = {
  value?: string;
  value_classification?: string;
};

/** Global mcap / trending change slowly — share across concurrent analyze jobs. */
const COINGECKO_CACHE_TTL_MS = 10 * 60 * 1000;
const GLOBAL_MCAP_CACHE_KEY = "narrative:coingecko:global-mcap-change";
const TRENDING_CACHE_KEY = "narrative:coingecko:trending-symbols";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCoinGeckoJsonWithRetry<T>(
  url: string,
  label: string,
  attempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJsonWithTimeout<T>(url, 4000);
    } catch (err) {
      lastErr = err;
      const details = fetchErrorDetails(err);
      const is429 =
        err instanceof HttpFetchError
          ? err.status === 429
          : details.status === 429 || /HTTP 429/.test(details.error);
      console.error(`[narrative] ${label} failed (attempt ${i + 1}/${attempts})`, {
        url,
        status: details.status,
        error: details.error,
        body: details.body,
      });
      if (!is429 || i === attempts - 1) break;
      // 1s, 2s backoff for transient CoinGecko free-tier 429s
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

async function getFearGreed(): Promise<{
  value: number;
  label: string;
  roc: number | null;
} | null> {
  try {
    // limit=2 → today + prior daily print (~24h lookback for RoC)
    const data = await fetchJsonWithTimeout<{ data?: FearGreedEntry[] }>(
      "https://api.alternative.me/fng/?limit=2",
      4000
    );
    const entries = data?.data ?? [];
    const entry = entries[0];
    if (!entry) return null;

    const value = parseInt(String(entry.value), 10);
    if (!Number.isFinite(value)) return null;

    let roc: number | null = null;
    const prior = entries[1];
    if (prior?.value != null) {
      const priorValue = parseInt(String(prior.value), 10);
      if (Number.isFinite(priorValue)) {
        roc = value - priorValue;
      } else {
        console.warn(
          "[narrative] fearGreedRoc unavailable: prior F&G value non-numeric"
        );
      }
    } else {
      console.warn(
        "[narrative] fearGreedRoc unavailable: alternative.me returned <2 daily points"
      );
    }

    return {
      value,
      label: String(entry.value_classification ?? ""),
      roc,
    };
  } catch (err) {
    const details = fetchErrorDetails(err);
    console.error("[narrative] getFearGreed failed", {
      status: details.status,
      error: details.error,
      body: details.body,
    });
    return null;
  }
}

async function getGlobalMarketCapChange(): Promise<number | null> {
  const cached = await getRadarCache<number | null>(GLOBAL_MCAP_CACHE_KEY);
  if (cached) {
    return cached.data;
  }

  const url = "https://api.coingecko.com/api/v3/global";
  try {
    const data = await fetchCoinGeckoJsonWithRetry<{
      data?: { market_cap_change_percentage_24h_usd?: number };
    }>(url, "getGlobalMarketCapChange");
    const change = data?.data?.market_cap_change_percentage_24h_usd;
    if (typeof change !== "number") {
      console.error("[narrative] getGlobalMarketCapChange: unexpected payload", {
        status: 200,
        body: JSON.stringify(data).slice(0, 500),
      });
      return null;
    }
    await setRadarCache(GLOBAL_MCAP_CACHE_KEY, change, COINGECKO_CACHE_TTL_MS);
    return change;
  } catch (err) {
    const details = fetchErrorDetails(err);
    console.error("[narrative] getGlobalMarketCapChange exhausted retries", {
      url,
      status: details.status,
      error: details.error,
      body: details.body,
    });
    return null;
  }
}

async function getTrendingCoins(): Promise<string[]> {
  const cached = await getRadarCache<string[]>(TRENDING_CACHE_KEY);
  if (cached) {
    return cached.data;
  }

  const url = "https://api.coingecko.com/api/v3/search/trending";
  try {
    const data = await fetchCoinGeckoJsonWithRetry<{
      coins?: { item?: { symbol?: string } }[];
    }>(url, "getTrendingCoins");
    const coins = (data?.coins ?? [])
      .slice(0, 3)
      .map((c) => String(c.item?.symbol ?? "").toUpperCase())
      .filter(Boolean);
    await setRadarCache(TRENDING_CACHE_KEY, coins, COINGECKO_CACHE_TTL_MS);
    return coins;
  } catch (err) {
    const details = fetchErrorDetails(err);
    console.error("[narrative] getTrendingCoins exhausted retries", {
      url,
      status: details.status,
      error: details.error,
      body: details.body,
    });
    return [];
  }
}

export async function getNarrativeSnapshot(symbol: string): Promise<NarrativeSnapshot> {
  const [fearGreed, ticker, globalMarketCapChange24hPct, trendingCoins, headlines] =
    await Promise.all([
      getFearGreed(),
      get24hTicker(symbol).catch(() => null),
      getGlobalMarketCapChange(),
      getTrendingCoins(),
      getNewsSentimentForPair(symbol).catch(() => ({
        score: 0,
        sentiment: "neutral" as const,
        sampleSize: 0,
      })),
    ]);

  const priceChange24hPct = ticker
    ? parseFloat(String((ticker as { priceChangePercent?: string }).priceChangePercent ?? 0))
    : 0;
  const volume24h = ticker
    ? parseFloat(String((ticker as { quoteVolume?: string }).quoteVolume ?? 0))
    : 0;

  return {
    fearGreed: fearGreed?.value ?? null,
    fearGreedLabel: fearGreed?.label ?? null,
    fearGreedRoc: fearGreed?.roc ?? null,
    priceChange24hPct,
    volume24h,
    globalMarketCapChange24hPct,
    trendingCoins,
    headlineSentimentScore:
      headlines.sampleSize > 0 ? headlines.score : null,
    headlineSentiment:
      headlines.sampleSize > 0 ? headlines.sentiment : null,
    headlineSampleSize: headlines.sampleSize,
    available:
      fearGreed != null ||
      ticker != null ||
      globalMarketCapChange24hPct != null ||
      headlines.sampleSize > 0,
  };
}
