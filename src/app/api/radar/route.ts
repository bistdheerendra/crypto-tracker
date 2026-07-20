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

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") ?? "news";
  const cacheKey = `radar:${type}`;
  const cached = getRadarCache<unknown>(cacheKey);
  if (cached) {
    return NextResponse.json({ type, data: cached, cached: true });
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
        source = "blockchair";
        break;
      case "liquidations":
        data = await fetchLiquidations();
        source = "okx";
        break;
      case "etf":
        data = await fetchEtfFlows();
        source = "yahoo-finance";
        break;
      default:
        return NextResponse.json({ error: "Unknown radar type" }, { status: 400 });
    }

    setRadarCache(cacheKey, data, TTL_MS[type] ?? 60_000);
    return NextResponse.json({ type, data, cached: false, source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Radar fetch failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
