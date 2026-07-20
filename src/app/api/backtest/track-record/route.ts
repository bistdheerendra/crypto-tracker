import { NextResponse } from "next/server";
import { computeTrackRecord } from "@/lib/backtest/aggregator";
import { getCached, setCache, TRACK_RECORD_TTL_MS } from "@/lib/backtest/cache";
import { getAllVerdicts } from "@/lib/verdicts/store";

const CACHE_KEY = "track-record:global";

export async function GET() {
  const cached = getCached<ReturnType<typeof computeTrackRecord>>(CACHE_KEY);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  const stats = computeTrackRecord(getAllVerdicts());
  setCache(CACHE_KEY, stats, TRACK_RECORD_TTL_MS);
  return NextResponse.json({ ...stats, cached: false });
}
