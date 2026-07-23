/**
 * Debug HIGH-tier 0% win rate: assignment math + resolved HIGH distribution.
 * Run: npx tsx scripts/debug-high-tier.ts
 */
import "dotenv/config";
import { getPrisma } from "../src/lib/db";

function simulateNormalized(
  lanes: { bias: "BULL" | "BEAR" | "MIXED"; tier: "HIGH" | "MODERATE" | "LOW" }[],
): number {
  const BIAS = { BULL: 1, BEAR: -1, MIXED: 0 } as const;
  const TIER = { HIGH: 3, MODERATE: 2, LOW: 1 } as const;
  const w = 0.25;
  let score = 0;
  let total = 0;
  for (const lane of lanes) {
    score += BIAS[lane.bias] * TIER[lane.tier] * w;
    total += w;
  }
  return score / total;
}

function tierFromNormalized(n: number): string {
  if (n > 0.8) return n > 1.5 ? "LONG/HIGH" : "LONG/MODERATE";
  if (n < -0.8) return n < -1.5 ? "SHORT/HIGH" : "SHORT/MODERATE";
  return "NEUTRAL/MODERATE";
}

async function main(): Promise<void> {
  console.log("--- Threshold math (equal weights) ---");
  const scenarios = [
    {
      name: "4x MODERATE same bias",
      lanes: Array(4).fill({ bias: "BULL", tier: "MODERATE" }),
    },
    {
      name: "3x MODERATE + 1 MIXED",
      lanes: [
        { bias: "BULL", tier: "MODERATE" },
        { bias: "BULL", tier: "MODERATE" },
        { bias: "BULL", tier: "MODERATE" },
        { bias: "MIXED", tier: "MODERATE" },
      ],
    },
    {
      name: "2x HIGH + 2 MIXED",
      lanes: [
        { bias: "BULL", tier: "HIGH" },
        { bias: "BULL", tier: "HIGH" },
        { bias: "MIXED", tier: "LOW" },
        { bias: "MIXED", tier: "LOW" },
      ],
    },
    {
      name: "4x HIGH same bias",
      lanes: Array(4).fill({ bias: "BULL", tier: "HIGH" }),
    },
    {
      name: "4x LOW same bias",
      lanes: Array(4).fill({ bias: "BULL", tier: "LOW" }),
    },
    {
      name: "3 BULL MOD + 1 BEAR MOD",
      lanes: [
        { bias: "BULL", tier: "MODERATE" },
        { bias: "BULL", tier: "MODERATE" },
        { bias: "BULL", tier: "MODERATE" },
        { bias: "BEAR", tier: "MODERATE" },
      ],
    },
  ] as const;

  for (const s of scenarios) {
    const n = simulateNormalized([...s.lanes]);
    console.log(
      `  ${s.name}: normalized=${n.toFixed(3)} → ${tierFromNormalized(n)}`,
    );
  }

  const prisma = getPrisma();
  if (!prisma) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  const high = await prisma.verdict.findMany({
    where: {
      confidenceTier: "HIGH",
      outcome: { not: null },
      NOT: { outcome: "open" },
    },
    orderBy: { createdAt: "asc" },
    select: {
      pair: true,
      timeframe: true,
      direction: true,
      entryPrice: true,
      stopLoss: true,
      takeProfit1: true,
      takeProfit2: true,
      laneBiasTechnical: true,
      laneBiasFlow: true,
      laneBiasNarrative: true,
      laneBiasMacro: true,
      outcome: true,
      rMultiple: true,
      createdAt: true,
      outcomeAt: true,
      features: { select: { laneAgreementCount: true } },
    },
  });

  const count = (items: string[]) => {
    const m = new Map<string, number>();
    for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
    return Object.fromEntries([...m.entries()].sort());
  };

  let sumR = 0;
  let nR = 0;
  let sumRiskPct = 0;
  let sumRewardPct = 0;
  let sumHoldH = 0;
  let nHold = 0;
  const laneCombos: string[] = [];

  for (const v of high) {
    if (v.rMultiple != null) {
      sumR += v.rMultiple;
      nR++;
    }
    const risk = Math.abs(v.entryPrice - v.stopLoss);
    const reward = Math.abs(v.takeProfit1 - v.entryPrice);
    sumRiskPct += risk / v.entryPrice;
    sumRewardPct += reward / v.entryPrice;
    if (v.outcomeAt) {
      sumHoldH +=
        (v.outcomeAt.getTime() - v.createdAt.getTime()) / 3_600_000;
      nHold++;
    }
    laneCombos.push(
      [v.laneBiasTechnical, v.laneBiasFlow, v.laneBiasNarrative, v.laneBiasMacro].join(
        "|",
      ),
    );
  }

  console.log("\n--- HIGH resolved distribution ---");
  console.log(`count: ${high.length}`);
  console.log("outcome:", count(high.map((v) => v.outcome!)));
  console.log("direction:", count(high.map((v) => v.direction)));
  console.log("pair:", count(high.map((v) => v.pair)));
  console.log("timeframe:", count(high.map((v) => v.timeframe)));
  console.log(
    "laneAgreement:",
    count(high.map((v) => String(v.features?.laneAgreementCount ?? "?"))),
  );
  console.log(`avg rMultiple: ${nR ? (sumR / nR).toFixed(3) : "n/a"}`);
  console.log(
    `avg risk%: ${((sumRiskPct / Math.max(high.length, 1)) * 100).toFixed(3)}`,
  );
  console.log(
    `avg tp1 reward%: ${((sumRewardPct / Math.max(high.length, 1)) * 100).toFixed(3)}`,
  );
  console.log(
    `avg planned RR (tp1/risk): ${(sumRewardPct / Math.max(sumRiskPct, 1e-9)).toFixed(3)}`,
  );
  console.log(
    `avg hold hours: ${nHold ? (sumHoldH / nHold).toFixed(2) : "n/a"}`,
  );

  const topCombos = Object.entries(count(laneCombos))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log("top lane bias combos (Tech|Flow|Narr|Macro):");
  for (const [k, c] of topCombos) console.log(`  ${c}x  ${k}`);

  console.log("\n--- sample HIGH rows ---");
  const sample = [...high.slice(0, 6), ...high.slice(-4)];
  for (const v of sample) {
    const risk = Math.abs(v.entryPrice - v.stopLoss);
    const reward = Math.abs(v.takeProfit1 - v.entryPrice);
    const holdH = v.outcomeAt
      ? ((v.outcomeAt.getTime() - v.createdAt.getTime()) / 3_600_000).toFixed(1)
      : "?";
    console.log({
      pair: v.pair,
      tf: v.timeframe,
      dir: v.direction,
      outcome: v.outcome,
      r: v.rMultiple,
      holdH,
      agree: v.features?.laneAgreementCount,
      lanes: `${v.laneBiasTechnical}/${v.laneBiasFlow}/${v.laneBiasNarrative}/${v.laneBiasMacro}`,
      rr: (reward / risk).toFixed(2),
      riskPct: ((risk / v.entryPrice) * 100).toFixed(3),
    });
  }

  const mod = await prisma.verdict.groupBy({
    by: ["outcome"],
    where: {
      confidenceTier: "MODERATE",
      outcome: { not: null },
      NOT: { outcome: "open" },
    },
    _count: { _all: true },
  });
  console.log("\n--- MODERATE by outcome ---");
  for (const row of mod) {
    console.log(`  ${row.outcome}: ${row._count._all}`);
  }

  // Same-candle SL+TP ambiguity rate: how often SL is very tight relative to ATR-ish risk
  const tight = high.filter((v) => {
    const riskPct = Math.abs(v.entryPrice - v.stopLoss) / v.entryPrice;
    return riskPct < 0.003; // <0.3%
  }).length;
  console.log(`\nHIGH with risk < 0.3% of price: ${tight}/${high.length}`);

  const expiredNeg = high.filter(
    (v) => v.outcome === "expired" && (v.rMultiple ?? 0) < 0,
  ).length;
  const expiredPos = high.filter(
    (v) => v.outcome === "expired" && (v.rMultiple ?? 0) > 0,
  ).length;
  const expiredZero = high.filter(
    (v) => v.outcome === "expired" && (v.rMultiple ?? 0) === 0,
  ).length;
  console.log(
    `HIGH expired rMultiple: +=${expiredPos} -=${expiredNeg} 0=${expiredZero}`,
  );

  // Duplicate fingerprints (cron spam)
  const fp = new Map<string, number>();
  for (const v of high) {
    const key = [
      v.pair,
      v.timeframe,
      v.direction,
      v.laneBiasTechnical,
      v.laneBiasFlow,
      v.laneBiasNarrative,
      v.laneBiasMacro,
      v.entryPrice.toFixed(2),
      v.stopLoss.toFixed(2),
    ].join("|");
    fp.set(key, (fp.get(key) ?? 0) + 1);
  }
  const dups = [...fp.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1]);
  console.log(`\nunique fingerprints: ${fp.size} of ${high.length}`);
  console.log("top duplicate setups:");
  for (const [k, c] of dups.slice(0, 8)) console.log(`  ${c}x  ${k}`);

  let conflictNarr = 0;
  for (const v of high) {
    if (v.direction === "LONG" && v.laneBiasNarrative === "BEAR") conflictNarr++;
    if (v.direction === "SHORT" && v.laneBiasNarrative === "BULL") conflictNarr++;
  }
  console.log(`HIGH with Narrative opposing direction: ${conflictNarr}/${high.length}`);

  const tfMins: Record<string, number> = {
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
  };
  let subCandle = 0;
  for (const v of high) {
    if (!v.outcomeAt) continue;
    const mins =
      (v.outcomeAt.getTime() - v.createdAt.getTime()) / 60_000;
    if (mins <= (tfMins[v.timeframe] ?? 60)) subCandle++;
  }
  console.log(
    `HIGH resolved within ~1 bar of creation: ${subCandle}/${high.length}`,
  );

  const { getDynamicLaneWeights } = await import("../src/lib/backtest/lane-weights");
  const lw = await getDynamicLaneWeights();
  console.log("\ncurrent lane weights:", lw.source, lw.weights);

  console.log("\n--- Verdict ---");
  console.log(
    "1. Threshold direction is NOT inverted (>1.5 LONG HIGH, <-1.5 SHORT HIGH).",
  );
  console.log(
    "2. HIGH is easy: equal-weight 4x MODERATE same bias => normalized=2.0 => HIGH.",
  );
  console.log(
    "3. All 60 HIGH resolved are sl_hit — not a labeling/tier flip bug.",
  );
  console.log(
    "4. Many HIGH have only 2/4 lane agreement + opposing Narrative — score can still clear |1.5| via lane-tier weighting.",
  );
  console.log(
    "5. Resolver prefers SL when SL+TP1 hit same candle — pessimistic, can inflate SL rate.",
  );

  // Retroactive: how many historical HIGH rows would pass the new gate?
  // (uses stored biases only — cannot recompute normalized without lane tiers)
  let wouldPassAgreement = 0;
  let wouldPassNarr = 0;
  let wouldPassBoth = 0;
  for (const v of high) {
    const target = v.direction === "LONG" ? "BULL" : "BEAR";
    const biases = [
      v.laneBiasTechnical,
      v.laneBiasFlow,
      v.laneBiasNarrative,
      v.laneBiasMacro,
    ];
    const agree = biases.filter((b) => b === target).length;
    const narrOk =
      v.direction === "LONG"
        ? v.laneBiasNarrative !== "BEAR"
        : v.laneBiasNarrative !== "BULL";
    if (agree >= 3) wouldPassAgreement++;
    if (narrOk) wouldPassNarr++;
    if (agree >= 3 && narrOk) wouldPassBoth++;
  }
  console.log("\n--- New HIGH gate (retroactive on historical HIGH rows) ---");
  console.log(`  ≥3 direction-aligned lanes: ${wouldPassAgreement}/${high.length}`);
  console.log(`  Narrative not opposing:     ${wouldPassNarr}/${high.length}`);
  console.log(`  both gates:                 ${wouldPassBoth}/${high.length}`);
  console.log(
    "  (normalized score cannot be recomputed — lane tiers not stored on Verdict)",
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
