import { NextResponse } from "next/server";
import { getTrackRecordStats } from "@/lib/backtest/track-record";
import { getPrisma, isDatabaseConfigured } from "@/lib/db";
import { getVerdictStoreMode } from "@/lib/verdicts/store";

type CheckResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function settled<T>(
  fn: () => Promise<T>
): Promise<CheckResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const startedAt = Date.now();

  const [dbCheck, backtestCheck] = await Promise.allSettled([
    settled(async () => {
      if (!isDatabaseConfigured()) {
        return { connected: false as const, verdictCount: null as number | null };
      }
      const prisma = getPrisma();
      if (!prisma) {
        return { connected: false as const, verdictCount: null as number | null };
      }
      const verdictCount = await prisma.verdict.count();
      return { connected: true as const, verdictCount: verdictCount as number };
    }),
    settled(async () => {
      const { stats } = await getTrackRecordStats();
      return {
        resolvedCount: stats.resolvedCount,
        totalSignals: stats.totalSignals,
      };
    }),
  ]);

  const db =
    dbCheck.status === "fulfilled"
      ? dbCheck.value
      : {
          ok: false as const,
          error:
            dbCheck.reason instanceof Error
              ? dbCheck.reason.message
              : String(dbCheck.reason),
        };

  const backtest =
    backtestCheck.status === "fulfilled"
      ? backtestCheck.value
      : {
          ok: false as const,
          error:
            backtestCheck.reason instanceof Error
              ? backtestCheck.reason.message
              : String(backtestCheck.reason),
        };

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    database:
      db.ok
        ? {
            connected: db.data.connected,
            verdictCount: db.data.verdictCount,
          }
        : {
            connected: false,
            verdictCount: null,
            error: db.error,
          },
    verdictStoreMode: getVerdictStoreMode(),
    backtest:
      backtest.ok
        ? backtest.data
        : {
            resolvedCount: null,
            totalSignals: null,
            error: backtest.error,
          },
    radarCache: {
      upstashConfigured: !!(
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
      ),
    },
    env: {
      SOSOVALUE_API_KEY: !!process.env.SOSOVALUE_API_KEY,
      UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
      CRON_SECRET: !!process.env.CRON_SECRET,
    },
  });
}
