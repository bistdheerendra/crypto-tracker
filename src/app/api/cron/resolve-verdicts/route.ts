import { NextRequest, NextResponse } from "next/server";
import { resolveOpenVerdicts } from "@/lib/backtest/resolver";
import { invalidateCache } from "@/lib/backtest/cache";
import { invalidateLaneWeightCache } from "@/lib/backtest/lane-weights";

/**
 * Resolve open verdicts.
 *
 * Scheduling (dual setup — see README “Cron scheduling”):
 * - Primary: external cron-job.org every ~15 minutes
 * - Fallback: Vercel Hobby cron daily (`0 0 * * *` in vercel.json)
 * Overlapping hits are safe (idempotent).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveOpenVerdicts();
  await invalidateCache("track-record");
  invalidateLaneWeightCache();

  return NextResponse.json({ ...resolved, at: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
