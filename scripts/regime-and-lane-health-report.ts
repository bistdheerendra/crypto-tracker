/**
 * Query RegimeSnapshot + LaneHealthLog for a date range.
 *
 * Usage:
 *   npx tsx scripts/regime-and-lane-health-report.ts
 *   npx tsx scripts/regime-and-lane-health-report.ts 2026-07-24 2026-07-31
 */
import "dotenv/config";
import { getPrisma } from "../src/lib/db";

function parseArgs(): { from: Date; to: Date } {
  const fromArg = process.argv[2];
  const toArg = process.argv[3];
  const to = toArg ? new Date(`${toArg}T00:00:00.000Z`) : new Date();
  const from = fromArg
    ? new Date(`${fromArg}T00:00:00.000Z`)
    : new Date(to.getTime() - 7 * 24 * 3600_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    console.error("Invalid dates. Use YYYY-MM-DD YYYY-MM-DD");
    process.exit(1);
  }
  return { from, to };
}

function pct(n: number, d: number): string {
  if (!d) return "n/a";
  return `${((n / d) * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const { from, to } = parseArgs();
  const prisma = getPrisma();
  if (!prisma) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  console.log(
    `=== Regime + Lane Health Report ===\nRange: ${from.toISOString()} → ${to.toISOString()}\n`
  );

  const regimes = await prisma.regimeSnapshot.findMany({
    where: { computedAt: { gte: from, lt: to } },
    select: { pair: true, regime: true },
  });

  console.log(`Regime snapshots: ${regimes.length}`);
  if (!regimes.length) {
    console.log("  (none — detector history starts after instrumentation deploy)\n");
  } else {
    const byPair = new Map<string, { trending: number; choppy: number }>();
    for (const r of regimes) {
      if (!byPair.has(r.pair)) byPair.set(r.pair, { trending: 0, choppy: 0 });
      const b = byPair.get(r.pair)!;
      if (r.regime === "TRENDING") b.trending++;
      else b.choppy++;
    }
    console.log("pair         n    TRENDING%   CHOPPY%");
    for (const pair of [...byPair.keys()].sort()) {
      const b = byPair.get(pair)!;
      const n = b.trending + b.choppy;
      console.log(
        `${pair.padEnd(12)} ${String(n).padStart(4)}  ${pct(b.trending, n).padStart(9)}  ${pct(b.choppy, n).padStart(7)}`
      );
    }
    console.log();
  }

  const health = await prisma.laneHealthLog.findMany({
    where: { recordedAt: { gte: from, lt: to } },
    select: { lane: true, status: true, source: true },
  });

  console.log(`Lane health rows: ${health.length}`);
  if (!health.length) {
    console.log("  (none — lane health history starts after instrumentation deploy)");
  } else {
    const lanes = ["technical", "flow", "narrative", "macro"] as const;
    console.log("lane         n    ok%      degraded%  failed%");
    for (const lane of lanes) {
      const rows = health.filter((h: { lane: string }) => h.lane === lane);
      const n = rows.length;
      const ok = rows.filter((h: { status: string }) => h.status === "ok").length;
      const deg = rows.filter(
        (h: { status: string }) => h.status === "degraded"
      ).length;
      const fail = rows.filter(
        (h: { status: string }) => h.status === "failed"
      ).length;
      console.log(
        `${lane.padEnd(12)} ${String(n).padStart(4)}  ${pct(ok, n).padStart(6)}  ${pct(deg, n).padStart(9)}  ${pct(fail, n).padStart(7)}`
      );
    }

    console.log("\nFlow sources (when status != failed):");
    const flowSources = new Map<string, number>();
    for (const h of health) {
      if (h.lane !== "flow" || h.status === "failed" || !h.source) continue;
      flowSources.set(h.source, (flowSources.get(h.source) ?? 0) + 1);
    }
    if (!flowSources.size) {
      console.log("  (none)");
    } else {
      for (const [src, n] of [...flowSources.entries()].sort(
        (a, b) => b[1] - a[1]
      )) {
        console.log(`  ${src}: ${n}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
