import { NextRequest, NextResponse } from "next/server";
import { runAnalysis } from "@/lib/analysis/run-analysis";
import {
  TRACKED_PAIRS,
  TRACKED_TIMEFRAMES,
} from "@/lib/market/constants";

/**
 * Auto-analyze all tracked pairs × timeframes to accumulate verdicts for ML.
 *
 * Scheduling (dual setup — see README “Cron scheduling”):
 * - Primary: external cron / GitHub Actions every ~3 hours
 * - Fallback: Vercel Hobby cron daily (`0 1 * * *` in vercel.json)
 * Overlapping hits are safe (idempotent; NEUTRAL results are not persisted).
 */

/** Cap concurrent analyzes — each run hits several external APIs. */
const ANALYZE_BATCH_SIZE = 6;

export type GenerateVerdictsSummary = {
  attempted: number;
  verdictsCreated: number;
  neutralSkipped: number;
  errored: number;
  at: string;
};

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    results.push(...settled);
  }
  return results;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobs = TRACKED_PAIRS.flatMap((pair) =>
    TRACKED_TIMEFRAMES.map((timeframe) => ({ pair, timeframe }))
  );

  console.log("[generate-verdicts] start", {
    attempted: jobs.length,
    pairs: TRACKED_PAIRS.length,
    timeframes: TRACKED_TIMEFRAMES.length,
  });

  const results = await mapInBatches(jobs, ANALYZE_BATCH_SIZE, async (job) => {
    const result = await runAnalysis(job.pair, job.timeframe);
    return {
      pair: job.pair,
      timeframe: job.timeframe,
      direction: result.verdict.direction,
      persisted: result.persisted,
    };
  });

  let verdictsCreated = 0;
  let neutralSkipped = 0;
  let errored = 0;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const job = jobs[i];
    if (result.status === "fulfilled") {
      if (result.value.persisted) {
        verdictsCreated++;
        console.log("[generate-verdicts] created", result.value);
      } else {
        neutralSkipped++;
        console.log("[generate-verdicts] neutralSkipped", {
          pair: job.pair,
          timeframe: job.timeframe,
          direction: result.value.direction,
        });
      }
    } else {
      errored++;
      console.error("[generate-verdicts] error", {
        pair: job.pair,
        timeframe: job.timeframe,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  }

  const summary: GenerateVerdictsSummary = {
    attempted: jobs.length,
    verdictsCreated,
    neutralSkipped,
    errored,
    at: new Date().toISOString(),
  };

  console.log("[generate-verdicts] summary", summary);
  return NextResponse.json(summary);
}

export async function POST(req: NextRequest) {
  return GET(req);
}
