/**
 * Create a few real analyses and print persisted VerdictFeature key fields.
 * Run: npx tsx scripts/verify-feature-population.ts
 */
import "dotenv/config";
import { runAnalysis } from "../src/lib/analysis/run-analysis";
import { getPrisma } from "../src/lib/db";

const JOBS = [
  { pair: "BTC/USDT", timeframe: "1h" },
  { pair: "ETH/USDT", timeframe: "4h" },
  { pair: "SOL/USDT", timeframe: "1h" },
  { pair: "BNB/USDT", timeframe: "1h" },
  { pair: "XRP/USDT", timeframe: "1h" },
] as const;

async function main() {
  const startedAt = new Date();

  for (const job of JOBS) {
    console.log(`\nAnalyzing ${job.pair} ${job.timeframe}...`);
    const result = await runAnalysis(job.pair, job.timeframe);
    const flowLane = result.lanes.find((l) => l.lane === "Flow");
    console.log({
      direction: result.verdict.direction,
      persisted: result.persisted,
      confidenceTier: result.verdict.confidenceTier,
      flowBias: flowLane?.bias,
      flowSource: result.dataSources.flow,
      narrativeSource: result.dataSources.narrative,
    });
  }

  const prisma = getPrisma();
  if (!prisma) {
    console.error("No DB — cannot inspect VerdictFeature rows");
    process.exit(1);
  }

  const features = await prisma.verdictFeature.findMany({
    where: { createdAt: { gte: startedAt } },
    orderBy: { createdAt: "desc" },
    select: {
      pair: true,
      timeframe: true,
      createdAt: true,
      oiChangePct: true,
      fundingRate: true,
      longShortRatio: true,
      fundingRateRoc: true,
      oiRoc: true,
      globalMcapChangePct: true,
      fearGreedIndex: true,
    },
  });

  console.log("\n=== Persisted VerdictFeature rows (this run) ===");
  for (const f of features) {
    console.log({
      pair: f.pair,
      tf: f.timeframe,
      at: f.createdAt.toISOString(),
      oiChangePct: f.oiChangePct,
      fundingRate: f.fundingRate,
      longShortRatio: f.longShortRatio,
      fundingRateRoc: f.fundingRateRoc,
      oiRoc: f.oiRoc,
      globalMcapChangePct: f.globalMcapChangePct,
      fearGreedIndex: f.fearGreedIndex,
    });
  }

  const nullFlow = features.filter((f) => f.oiChangePct == null).length;
  const nullMcap = features.filter((f) => f.globalMcapChangePct == null).length;
  console.log(
    `\nSummary: ${features.length} features, flowNull=${nullFlow}, mcapNull=${nullMcap}`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
