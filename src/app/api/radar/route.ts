import { NextRequest, NextResponse } from "next/server";
import { fetchLiveNews } from "@/lib/radar/news";
import { fetchWhaleTransactions } from "@/lib/radar/whales";
import { fetchLiquidations } from "@/lib/radar/liquidations";
import { fetchEtfFlows } from "@/lib/radar/etf-flows";
import { getRadarCache, setRadarCache } from "@/lib/radar/utils";

const TTL_MS: Record<string, number> = {
  news: 60_000,
  whales: 120_000,
  liquidations: 30_000,
  etf: 300_000,
};

interface CachedRadarPayload {
  data: unknown;
  source?: string;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "news";
  const cacheKey = `radar:${type}`;
  const cached = await getRadarCache<CachedRadarPayload>(cacheKey);
  if (cached) {
    return NextResponse.json({
      type,
      data: cached.data.data,
      source: cached.data.source,
      cached: true,
      fetchedAt: cached.fetchedAt,
    });
  }

  try {
    let data: unknown;
    let source: string;

    switch (type) {
      case "news":
        data = await fetchLiveNews();
        source = "coindesk+cointelegraph+decrypt-rss";
        break;
      case "whales":
        data = await fetchWhaleTransactions();
        source = "blockchair+solana-rpc";
        break;
      case "liquidations":
        data = await fetchLiquidations();
        source = "okx+binance+bybit";
        break;
      case "etf": {
        const etfResult = await fetchEtfFlows();
        data = etfResult.flows;
        source = etfResult.source;
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown radar type" }, { status: 400 });
    }

    const fetchedAt = Date.now();
    await setRadarCache(cacheKey, { data, source }, TTL_MS[type] ?? 60_000);
    return NextResponse.json({ type, data, cached: false, source, fetchedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Radar fetch failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
