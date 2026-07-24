/**
 * Live-path ML probe: runAnalysis → buildMlFeatureVector → getMlEdge.
 * Also tries a few /api/analyze URLs when BASE_URL is set.
 * Run: npx tsx scripts/probe-ml-edge-live.ts
 */
import "dotenv/config";
import { runAnalysis } from "../src/lib/analysis/run-analysis";
import { buildMlFeatureVector } from "../src/lib/ml/build-feature-vector";
import { getMlEdge } from "../src/lib/ml/predict";

const CANDIDATES = [
  ["BTC/USDT", "1h"],
  ["ETH/USDT", "1h"],
  ["SOL/USDT", "4h"],
  ["XRP/USDT", "1h"],
  ["BNB/USDT", "4h"],
] as const;

async function main(): Promise<void> {
  let sawSane = false;

  for (const [pair, timeframe] of CANDIDATES) {
    console.log(`\n=== ${pair} ${timeframe} ===`);
    const result = await runAnalysis(pair, timeframe);
    const dir =
      result.verdict.direction === "NEUTRAL"
        ? "LONG"
        : result.verdict.direction;
    const vector = buildMlFeatureVector(result.features, dir);
    console.log({
      direction: result.verdict.direction,
      tier: result.verdict.tier,
      directionEncoded: vector.directionEncoded,
      confidenceTierEncoded: vector.confidenceTierEncoded,
      pair_BTC_USDT: vector.pair_BTC_USDT,
      pair_ETH_USDT: vector.pair_ETH_USDT,
      rsi14: vector.rsi14,
      laneAgreementCount: vector.laneAgreementCount,
    });

    const edge = await getMlEdge(vector);
    console.log("mlEdge", edge);

    if (edge) {
      const pct = edge.winProbability * 100;
      if (edge.winProbability > 0.01 && edge.winProbability < 0.99) {
        console.log(`OK sane live winProbability=${pct.toFixed(1)}%`);
        sawSane = true;
        break;
      }
      console.warn(`WARN extreme probability ${pct.toFixed(1)}% — check encoding`);
    }
  }

  if (!sawSane) {
    console.error("FAIL: no sane live winProbability observed");
    process.exit(1);
  }

  const base = (process.env.BASE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );
  console.log(`\n--- HTTP probe ${base} ---`);
  for (const [pair, timeframe] of CANDIDATES) {
    const url = `${base}/api/analyze?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`;
    try {
      const res = await fetch(url);
      const json = (await res.json()) as {
        mlEdge?: { winProbability: number; modelVersion: string } | null;
        verdict?: { direction: string; tier: string };
        error?: string;
      };
      console.log({
        pair,
        timeframe,
        status: res.status,
        direction: json.verdict?.direction,
        tier: json.verdict?.tier,
        mlEdge: json.mlEdge ?? null,
      });
      if (
        json.mlEdge &&
        json.mlEdge.winProbability > 0.01 &&
        json.mlEdge.winProbability < 0.99
      ) {
        console.log(
          `OK API mlEdge=${(json.mlEdge.winProbability * 100).toFixed(1)}%`
        );
        break;
      }
    } catch (err) {
      console.warn(
        `HTTP failed for ${pair}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
