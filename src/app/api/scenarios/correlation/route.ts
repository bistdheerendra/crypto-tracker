import { NextResponse } from "next/server";
import { computeCorrelationMatrix } from "@/lib/scenarios/correlation";
import { getRadarCache, setRadarCache } from "@/lib/radar/utils";

const CACHE_KEY = "scenarios:correlation";
const TTL_MS = 300_000;

export async function GET() {
  const cached = getRadarCache<Record<string, number>>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ matrix: cached, cached: true, source: "binance-klines" });
  }

  try {
    const matrix = await computeCorrelationMatrix();
    setRadarCache(CACHE_KEY, matrix, TTL_MS);
    return NextResponse.json({ matrix, cached: false, source: "binance-klines" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Correlation fetch failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
