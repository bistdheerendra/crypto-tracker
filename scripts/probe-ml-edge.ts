/**
 * End-to-end ML edge probe (no browser).
 * Run: npx tsx scripts/probe-ml-edge.ts
 *
 * 1) Builds a feature vector from a real training CSV row (known encoding).
 * 2) Calls getMlEdge() directly.
 * 3) Optionally hits /api/analyze if BASE_URL is set.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MODEL_FEATURE_COLUMNS,
  type ModelFeatureColumn,
} from "../src/lib/ml/encoding";
import type { MlFeatureVector } from "../src/lib/ml/build-feature-vector";
import { getMlEdge } from "../src/lib/ml/predict";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function vectorFromTrainingRow(): MlFeatureVector {
  const csvPath = join(process.cwd(), "ml", "data", "training_dataset.csv");
  const text = readFileSync(csvPath, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]!);
  // Prefer a win row if present, else first data row
  let dataLine = lines[1]!;
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const labelIdx = header.indexOf("label");
    if (labelIdx >= 0 && cells[labelIdx] === "1") {
      dataLine = line;
      break;
    }
  }
  const cells = parseCsvLine(dataLine);
  const row: Record<string, string> = {};
  header.forEach((h, i) => {
    row[h] = cells[i] ?? "";
  });

  const vector = {} as MlFeatureVector;
  for (const col of MODEL_FEATURE_COLUMNS) {
    const raw = row[col];
    if (raw === undefined || raw === "") {
      vector[col as ModelFeatureColumn] = null;
    } else {
      const n = Number(raw);
      vector[col as ModelFeatureColumn] = Number.isFinite(n) ? n : null;
    }
  }

  console.log("--- Training-row probe (known encoding) ---");
  console.log({
    pair: row.pair,
    direction: row.direction,
    directionEncoded: row.directionEncoded,
    confidenceTier: row.confidenceTier,
    confidenceTierEncoded: row.confidenceTierEncoded,
    label: row.label,
  });
  return vector;
}

async function main(): Promise<void> {
  const vector = vectorFromTrainingRow();
  const edge = await getMlEdge(vector);
  console.log("--- getMlEdge(training row) ---");
  console.log(edge);

  if (!edge) {
    console.error("FAIL: getMlEdge returned null");
    process.exit(1);
  }
  if (edge.winProbability < 0.01 || edge.winProbability > 0.99) {
    console.error(
      `FAIL: winProbability ${edge.winProbability} looks extreme — encoding mismatch?`
    );
    process.exit(1);
  }
  console.log(
    `OK: winProbability=${(edge.winProbability * 100).toFixed(1)}% model=${edge.modelVersion}`
  );

  const base = process.env.BASE_URL?.replace(/\/$/, "");
  if (base) {
    const url = `${base}/api/analyze?pair=${encodeURIComponent("BTC/USDT")}&timeframe=1h`;
    console.log(`\n--- HTTP ${url} ---`);
    const res = await fetch(url);
    const json = (await res.json()) as {
      mlEdge?: { winProbability: number; modelVersion: string } | null;
      verdict?: { direction: string; tier: string };
      error?: string;
    };
    console.log({
      status: res.status,
      direction: json.verdict?.direction,
      tier: json.verdict?.tier,
      mlEdge: json.mlEdge ?? null,
      error: json.error,
    });
    if (json.mlEdge) {
      const p = json.mlEdge.winProbability;
      if (p < 0.01 || p > 0.99) {
        console.error(`FAIL: API mlEdge extreme (${p})`);
        process.exit(1);
      }
      console.log(`OK API: winProbability=${(p * 100).toFixed(1)}%`);
    } else if (json.verdict?.direction === "NEUTRAL") {
      console.log("NOTE: NEUTRAL verdict — mlEdge intentionally omitted");
    } else {
      console.warn("WARN: non-NEUTRAL but mlEdge null (python/model issue?)");
    }
  } else {
    console.log("\n(set BASE_URL=http://localhost:3000 to also hit /api/analyze)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
