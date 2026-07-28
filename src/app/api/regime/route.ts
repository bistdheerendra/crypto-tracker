import { NextRequest, NextResponse } from "next/server";
import { getKlines } from "@/lib/binance";
import {
  ATR_BASELINE_PERIOD,
  detectMarketRegime,
  type MarketRegimeResult,
} from "@/lib/analysis/regime";
import { getRadarCache, setRadarCache } from "@/lib/radar/utils";

/** Regime is slow-moving; 90s keeps load light without feeling stale. */
const REGIME_CACHE_TTL_MS = 90_000;

/** Enough history for baseline ATR (50) + lookback cushion. */
const KLINES_LIMIT = Math.max(100, ATR_BASELINE_PERIOD + 30);

type RegimePayload = MarketRegimeResult & {
  pair: string;
  timeframe: string;
};

export async function GET(req: NextRequest) {
  const pair = req.nextUrl.searchParams.get("pair") || "BTC/USDT";
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "1h";
  const cacheKey = `regime:${pair}:${timeframe}`;

  const cached = await getRadarCache<RegimePayload>(cacheKey);
  if (cached) {
    return NextResponse.json({
      ...cached.data,
      cached: true,
      fetchedAt: cached.fetchedAt,
    });
  }

  try {
    const klines = await getKlines(pair, timeframe, KLINES_LIMIT);
    if (!klines.length) {
      return NextResponse.json(
        { error: "Insufficient candle data for regime detection." },
        { status: 502 }
      );
    }

    const candles = klines.map((k) => ({
      open: parseFloat(String(k[1])),
      high: parseFloat(String(k[2])),
      low: parseFloat(String(k[3])),
      close: parseFloat(String(k[4])),
    }));

    const result = detectMarketRegime(candles);
    const payload: RegimePayload = { pair, timeframe, ...result };
    const fetchedAt = Date.now();
    await setRadarCache(cacheKey, payload, REGIME_CACHE_TTL_MS);

    return NextResponse.json({
      ...payload,
      cached: false,
      fetchedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Regime detection failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
