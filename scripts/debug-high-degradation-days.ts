/**
 * Day-level + direction/regime follow-up for HIGH degradation.
 * Run: npx tsx scripts/debug-high-degradation-days.ts
 */
import "dotenv/config";
import { getPrisma } from "../src/lib/db";

function isWin(outcome: string | null): boolean {
  return outcome === "tp1_hit" || outcome === "tp2_hit";
}

async function main(): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  const rows = await prisma.verdict.findMany({
    where: {
      outcome: { not: null },
      NOT: { outcome: "open" },
      rMultiple: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      pair: true,
      timeframe: true,
      direction: true,
      confidenceTier: true,
      createdAt: true,
      outcome: true,
      rMultiple: true,
      laneBiasTechnical: true,
      laneBiasFlow: true,
      laneBiasNarrative: true,
      laneBiasMacro: true,
    },
  });

  // Day buckets
  const byDay = new Map<string, typeof rows>();
  for (const v of rows) {
    const d = v.createdAt.toISOString().slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(v);
  }

  console.log("=== DAY-BY-DAY ===");
  console.log(
    "date       n    ovr%   H_w/n     H%    M_w/n     M%   H_LONG H_SHORT  M_LONG M_SHORT",
  );
  for (const day of [...byDay.keys()].sort()) {
    const b = byDay.get(day)!;
    const wins = b.filter((v) => isWin(v.outcome)).length;
    const h = b.filter((v) => v.confidenceTier === "HIGH");
    const m = b.filter((v) => v.confidenceTier === "MODERATE");
    const hw = h.filter((v) => isWin(v.outcome)).length;
    const mw = m.filter((v) => isWin(v.outcome)).length;
    const hL = h.filter((v) => v.direction === "LONG").length;
    const hS = h.filter((v) => v.direction === "SHORT").length;
    const mL = m.filter((v) => v.direction === "LONG").length;
    const mS = m.filter((v) => v.direction === "SHORT").length;
    console.log(
      `${day} ${String(b.length).padStart(4)}  ${(b.length ? (wins / b.length) * 100 : 0).toFixed(1).padStart(5)}  ${String(hw).padStart(3)}/${String(h.length).padStart(3)}  ${(h.length ? (hw / h.length) * 100 : 0).toFixed(1).padStart(5)}  ${String(mw).padStart(3)}/${String(m.length).padStart(3)}  ${(m.length ? (mw / m.length) * 100 : 0).toFixed(1).padStart(5)}  ${String(hL).padStart(6)} ${String(hS).padStart(7)}  ${String(mL).padStart(6)} ${String(mS).padStart(7)}`,
    );
  }

  // 12h buckets around the cliff
  console.log("\n=== 12-HOUR BUCKETS (Jul 23–27) ===");
  const start = new Date("2026-07-23T00:00:00Z").getTime();
  const end = new Date("2026-07-28T00:00:00Z").getTime();
  for (let t = start; t < end; t += 12 * 3600_000) {
    const a = new Date(t);
    const b = new Date(t + 12 * 3600_000);
    const slice = rows.filter(
      (v) => v.createdAt >= a && v.createdAt < b,
    );
    if (!slice.length) continue;
    const h = slice.filter((v) => v.confidenceTier === "HIGH");
    const m = slice.filter((v) => v.confidenceTier === "MODERATE");
    const hw = h.filter((v) => isWin(v.outcome)).length;
    const mw = m.filter((v) => isWin(v.outcome)).length;
    const ow = slice.filter((v) => isWin(v.outcome)).length;
    const hS = h.filter((v) => v.direction === "SHORT").length;
    console.log(
      `${a.toISOString().slice(0, 13)}  n=${String(slice.length).padStart(3)} ovr=${(ow / slice.length * 100).toFixed(1).padStart(5)}%  H=${hw}/${h.length}(${h.length ? ((hw / h.length) * 100).toFixed(0) : "-"}%) SHORT=${hS}/${h.length}  M=${mw}/${m.length}(${m.length ? ((mw / m.length) * 100).toFixed(0) : "-"}%)`,
    );
  }

  // WR by direction overall early/late
  const cut = new Date("2026-07-24T12:01:20.807Z");
  console.log("\n=== WIN RATE BY DIRECTION (early vs late) ===");
  for (const [label, set] of [
    ["EARLY", rows.filter((v) => v.createdAt <= cut)],
    ["LATE", rows.filter((v) => v.createdAt > cut)],
  ] as const) {
    for (const dir of ["LONG", "SHORT"] as const) {
      for (const tier of ["HIGH", "MODERATE"] as const) {
        const s = set.filter((v) => v.direction === dir && v.confidenceTier === tier);
        const w = s.filter((v) => isWin(v.outcome)).length;
        if (!s.length) continue;
        console.log(
          `  ${label} ${tier} ${dir}: ${w}/${s.length} (${((w / s.length) * 100).toFixed(1)}%)`,
        );
      }
    }
  }

  // Cumulative SHORT bias among HIGH over days
  console.log("\n=== HIGH SHORT share by day ===");
  for (const day of [...byDay.keys()].sort()) {
    const h = byDay.get(day)!.filter((v) => v.confidenceTier === "HIGH");
    if (!h.length) continue;
    const shorts = h.filter((v) => v.direction === "SHORT").length;
    const hw = h.filter((v) => isWin(v.outcome)).length;
    console.log(
      `  ${day}: HIGH SHORT ${shorts}/${h.length} (${((shorts / h.length) * 100).toFixed(0)}%)  WR ${hw}/${h.length}`,
    );
  }

  // BTC hourly around cliff for bounce timing
  console.log("\n=== BTCUSDT 4h around cliff ===");
  const url =
    "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&startTime=" +
    new Date("2026-07-21T00:00:00Z").getTime() +
    "&endTime=" +
    new Date("2026-07-28T00:00:00Z").getTime() +
    "&limit=1000";
  const res = await fetch(url);
  const kl = (await res.json()) as unknown[][];
  for (const k of kl) {
    const t = new Date(k[0] as number).toISOString().slice(0, 16);
    const o = parseFloat(k[1] as string);
    const h = parseFloat(k[2] as string);
    const l = parseFloat(k[3] as string);
    const c = parseFloat(k[4] as string);
    const chg = (((c - o) / o) * 100).toFixed(2);
    console.log(`  ${t}  o=${o.toFixed(0)} h=${h.toFixed(0)} l=${l.toFixed(0)} c=${c.toFixed(0)}  Δ=${chg}%`);
  }

  // ETH too
  console.log("\n=== ETHUSDT 4h around cliff ===");
  const url2 =
    "https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=4h&startTime=" +
    new Date("2026-07-21T00:00:00Z").getTime() +
    "&endTime=" +
    new Date("2026-07-28T00:00:00Z").getTime() +
    "&limit=1000";
  const res2 = await fetch(url2);
  const kl2 = (await res2.json()) as unknown[][];
  for (const k of kl2) {
    const t = new Date(k[0] as number).toISOString().slice(0, 16);
    const o = parseFloat(k[1] as string);
    const c = parseFloat(k[4] as string);
    const chg = (((c - o) / o) * 100).toFixed(2);
    console.log(`  ${t}  o=${o.toFixed(1)} c=${c.toFixed(1)}  Δ=${chg}%`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
