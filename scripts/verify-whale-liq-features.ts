/**
 * Verify whale/liquidation feature capture for BTC (covered) and XRP (no whales).
 * Run: npx tsx scripts/verify-whale-liq-features.ts
 *
 * Live analyze often returns NEUTRAL (no feature row). This script also does a
 * temporary LONG save → query → delete so we can confirm DB persistence.
 */
import "dotenv/config";
import {
  WHALE_CHAIN_BY_PAIR,
  WHALE_LIQUIDATION_LOOKBACK_MS,
} from "../src/lib/market/constants";
import { getLiquidationActivitySince } from "../src/lib/radar/liquidations";
import { getWhaleActivitySince } from "../src/lib/radar/whales";
import { runAnalysis } from "../src/lib/analysis/run-analysis";
import { getPrisma } from "../src/lib/db";
import {
  buildVerdictFeatures,
  type WhaleLiquidationRawFeatures,
} from "../src/lib/verdicts/features";
import { saveVerdict } from "../src/lib/verdicts/store";
import type { LaneOutput, Verdict } from "../src/lib/types";

const PAIRS = ["BTC/USDT", "ETH/USDT", "XRP/USDT"] as const;

const stubLanes: LaneOutput[] = [
  {
    lane: "Technical",
    badge: "T",
    bias: "BULL",
    tier: "MODERATE",
    reasoning: ["verify"],
  },
  {
    lane: "Flow",
    badge: "F",
    bias: "BULL",
    tier: "MODERATE",
    reasoning: ["verify"],
  },
  {
    lane: "Narrative",
    badge: "N",
    bias: "MIXED",
    tier: "LOW",
    reasoning: ["verify"],
  },
  {
    lane: "Macro",
    badge: "M",
    bias: "MIXED",
    tier: "LOW",
    reasoning: ["verify"],
  },
];

async function captureWhaleLiq(
  pair: (typeof PAIRS)[number]
): Promise<WhaleLiquidationRawFeatures> {
  const sinceMs = Date.now() - WHALE_LIQUIDATION_LOOKBACK_MS;
  const chain = WHALE_CHAIN_BY_PAIR[pair] ?? null;
  const t0 = Date.now();

  const [whaleSettled, liqSettled] = await Promise.allSettled([
    chain ? getWhaleActivitySince(chain, sinceMs) : Promise.resolve(null),
    getLiquidationActivitySince(pair, sinceMs),
  ]);

  const out: WhaleLiquidationRawFeatures = {
    whaleNetFlowUsd: null,
    whaleTransactionCount: null,
    liquidationNetImbalanceUsd: null,
    liquidationVolumeUsd: null,
  };

  if (whaleSettled.status === "fulfilled" && whaleSettled.value) {
    out.whaleNetFlowUsd = whaleSettled.value.whaleNetFlowUsd;
    out.whaleTransactionCount = whaleSettled.value.whaleTransactionCount;
  } else if (whaleSettled.status === "rejected") {
    console.warn(`[probe] whale failed for ${pair}:`, String(whaleSettled.reason));
  }

  if (liqSettled.status === "fulfilled") {
    out.liquidationNetImbalanceUsd =
      liqSettled.value.liquidationNetImbalanceUsd;
    out.liquidationVolumeUsd = liqSettled.value.liquidationVolumeUsd;
  } else {
    console.warn(`[probe] liq failed for ${pair}:`, String(liqSettled.reason));
  }

  console.log(`\n[probe] ${pair} (${Date.now() - t0}ms)`, { chain, ...out });
  return out;
}

async function main() {
  const captures: Record<string, WhaleLiquidationRawFeatures> = {};
  for (const pair of PAIRS) {
    captures[pair] = await captureWhaleLiq(pair);
  }

  // Live analyze timing check (may be NEUTRAL → no persist)
  for (const pair of PAIRS) {
    const t0 = Date.now();
    console.log(`\nAnalyzing ${pair} 1h...`);
    const result = await runAnalysis(pair, "1h");
    console.log({
      direction: result.verdict.direction,
      persisted: result.persisted,
      tier: result.verdict.tier,
      elapsedMs: Date.now() - t0,
    });
  }

  const prisma = getPrisma();
  if (!prisma) {
    console.error("No DB — cannot inspect VerdictFeature rows");
    process.exit(1);
  }

  const tempIds: string[] = [];
  for (const pair of PAIRS) {
    const features = buildVerdictFeatures({
      pair,
      timeframe: "1h",
      confidenceTier: "MODERATE",
      lanes: stubLanes,
      technical: null,
      flow: null,
      narrative: null,
      macro: null,
      whaleLiquidation: captures[pair],
    });

    const verdict: Verdict = {
      pair,
      timeframe: "1h",
      tier: "MODERATE",
      direction: "LONG",
      alignment: "verify-whale-liq",
      entry: 1,
      stopLoss: 0.9,
      takeProfit1: 1.1,
      takeProfit2: 1.2,
      rationale: "temporary verify row — delete after",
      riskReward: "1:1",
    };

    const stored = await saveVerdict(verdict, stubLanes, features);
    tempIds.push(stored.id);
  }

  const features = await prisma.verdictFeature.findMany({
    where: { verdictId: { in: tempIds } },
    orderBy: { pair: "asc" },
    select: {
      pair: true,
      timeframe: true,
      createdAt: true,
      whaleNetFlowUsd: true,
      whaleTransactionCount: true,
      liquidationNetImbalanceUsd: true,
      liquidationVolumeUsd: true,
    },
  });

  console.log("\n=== Persisted whale/liquidation VerdictFeature rows (temp) ===");
  for (const f of features) {
    console.log({
      pair: f.pair,
      tf: f.timeframe,
      at: f.createdAt.toISOString(),
      whaleNetFlowUsd: f.whaleNetFlowUsd,
      whaleTransactionCount: f.whaleTransactionCount,
      liquidationNetImbalanceUsd: f.liquidationNetImbalanceUsd,
      liquidationVolumeUsd: f.liquidationVolumeUsd,
    });
  }

  // Clean up so we don't pollute the ~280/300 resolve pipeline
  await prisma.verdict.deleteMany({ where: { id: { in: tempIds } } });
  console.log(`\nDeleted ${tempIds.length} temporary verify verdict(s).`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
