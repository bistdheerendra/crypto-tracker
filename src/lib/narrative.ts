import { get24hTicker } from "./binance";
import { fetchJsonWithTimeout } from "./fetch-utils";
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
  } catch {
    return null;
  }
}

async function getGlobalMarketCapChange(): Promise<number | null> {
  try {
    const data = await fetchJsonWithTimeout<{ data?: { market_cap_change_percentage_24h_usd?: number } }>(
      "https://api.coingecko.com/api/v3/global",
      4000
    );
    const change = data?.data?.market_cap_change_percentage_24h_usd;
    return typeof change === "number" ? change : null;
  } catch {
    return null;
  }
}

async function getTrendingCoins(): Promise<string[]> {
  try {
    const data = await fetchJsonWithTimeout<{ coins?: { item?: { symbol?: string } }[] }>(
      "https://api.coingecko.com/api/v3/search/trending",
      4000
    );
    return (data?.coins ?? [])
      .slice(0, 3)
      .map((c) => String(c.item?.symbol ?? "").toUpperCase())
      .filter(Boolean);
  } catch {
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
