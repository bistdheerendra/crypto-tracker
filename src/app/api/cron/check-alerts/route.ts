import { NextRequest, NextResponse } from "next/server";
import { runRadarAlertCheck } from "@/lib/alerts/engine";

/**
 * Scan radar feeds for whale / liquidation / ETF spikes and Telegram-notify.
 *
 * Scheduling: external cron every ~10–15 min (same CRON_SECRET as other jobs).
 * Vercel Hobby fallback: daily in vercel.json.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runRadarAlertCheck();
    console.log("[check-alerts] summary", {
      sent: summary.sent,
      skipped: summary.skipped,
      errors: summary.errors,
      at: summary.at,
    });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[check-alerts] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
