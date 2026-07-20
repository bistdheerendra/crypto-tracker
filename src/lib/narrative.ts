import { get24hTicker } from "./binance";
import { fetchJsonWithTimeout } from "./fetch-utils";

export interface NarrativeSnapshot {
  fearGreed: number | null;
  fearGreedLabel: string | null;
  priceChange24hPct: number;
  volume24h: number;
  globalMarketCapChange24hPct: number | null;
  trendingCoins: string[];
  available: boolean;
}

async function getFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const data = await fetchJsonWithTimeout<{ data?: { value?: string; value_classification?: string }[] }>(
      "https://api.alternative.me/fng/?limit=1",
      4000
    );
    const entry = data?.data?.[0];
    if (!entry) return null;
    return {
      value: parseInt(String(entry.value), 10),
      label: String(entry.value_classification ?? ""),
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
  const [fearGreed, ticker, globalMarketCapChange24hPct, trendingCoins] = await Promise.all([
    getFearGreed(),
    get24hTicker(symbol).catch(() => null),
    getGlobalMarketCapChange(),
    getTrendingCoins(),
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
    priceChange24hPct,
    volume24h,
    globalMarketCapChange24hPct,
    trendingCoins,
    available: fearGreed != null || ticker != null || globalMarketCapChange24hPct != null,
  };
}
