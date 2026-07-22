import { NextResponse } from "next/server";
import { getTrackRecordStats } from "@/lib/backtest/track-record";

export async function GET() {
  const { stats, fromCache } = await getTrackRecordStats();
  return NextResponse.json({ ...stats, cached: fromCache });
}
