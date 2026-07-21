/**
 * Stage 2 — flatten resolved verdicts + VerdictFeature rows into an ML-ready CSV.
 * Run: npm run extract-training-data
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPrisma } from "../src/lib/db";

const MIN_RESOLVED_VERDICTS = 300;
const PREFERRED_RESOLVED_VERDICTS = 500;
const NULL_DROP_THRESHOLD = 0.3;

const NUMERIC_FEATURE_KEYS = [
  "ema50",
  "ema200",
  "rsi14",
  "priceDistanceToEma50Pct",
  "distanceToNearestSwingPct",
  "oiChangePct",
  "fundingRate",
  "longShortRatio",
  "price24hChangePct",
  "fearGreedIndex",
  "globalMcapChangePct",
  "trendingScore",
  "dxyChangePct",
  "spxChangePct",
  "goldChangePct",
  "laneAgreementCount",
] as const;

type NumericFeatureKey = (typeof NUMERIC_FEATURE_KEYS)[number];

type FlatRow = Record<string, string | number>;

function encodeConfidenceTier(tier: string): number {
  switch (tier.toUpperCase()) {
    case "LOW":
      return 1;
    case "MODERATE":
      return 2;
    case "HIGH":
      return 3;
    default:
      return 0;
  }
}

function encodeDirection(direction: string): number {
  return direction.toUpperCase() === "LONG" ? 1 : -1;
}

function computeLabel(outcome: string): number {
  return outcome === "tp1_hit" || outcome === "tp2_hit" ? 1 : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(filePath: string, columns: string[], rows: FlatRow[]): void {
  const header = columns.map(escapeCsvCell).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCsvCell(row[col] ?? "")).join(","))
    .join("\n");
  writeFileSync(filePath, `${header}\n${body}\n`, "utf8");
}

async function main(): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    console.error(
      "DATABASE_URL is not configured. Set a real Postgres URL in .env before running this script.",
    );
    process.exit(1);
  }

  const resolvedWhere = {
    outcome: { not: null },
    NOT: { outcome: "open" },
  };

  const resolvedCount = await prisma.verdict.count({ where: resolvedWhere });

  if (resolvedCount < MIN_RESOLVED_VERDICTS) {
    console.warn(
      `Only ${resolvedCount} resolved verdicts found — aim for ${MIN_RESOLVED_VERDICTS}+, ideally ${PREFERRED_RESOLVED_VERDICTS}+, before training a model on this data.`,
    );
  }

  const verdicts = await prisma.verdict.findMany({
    where: resolvedWhere,
    include: { features: true },
    orderBy: { createdAt: "asc" },
  });

  const skippedNoFeatures = verdicts.filter((v) => v.features === null).length;
  if (skippedNoFeatures > 0) {
    console.warn(
      `Skipped ${skippedNoFeatures} resolved verdict(s) with no VerdictFeature row.`,
    );
  }

  const withFeatures = verdicts.filter(
    (v): v is typeof v & { features: NonNullable<typeof v.features> } =>
      v.features !== null,
  );

  if (withFeatures.length === 0) {
    console.error("No resolved verdicts with features found. Nothing to export.");
    process.exit(1);
  }

  const distinctPairs = [...new Set(withFeatures.map((v) => v.pair))].sort();
  const pairColumns = distinctPairs.map((p) => `pair_${p.replace(/[^a-zA-Z0-9]/g, "_")}`);

  const rawRows: FlatRow[] = withFeatures.map((verdict) => {
    const { features } = verdict;
    const row: FlatRow = {
      label: computeLabel(verdict.outcome!),
      outcome: verdict.outcome!,
      rMultiple: verdict.rMultiple ?? "",
      direction: verdict.direction,
      directionEncoded: encodeDirection(verdict.direction),
      confidenceTier: verdict.confidenceTier,
      confidenceTierEncoded: encodeConfidenceTier(verdict.confidenceTier),
      timeframe: verdict.timeframe,
      hourOfDay: features.hourOfDay,
      dayOfWeek: features.dayOfWeek,
      createdAt: verdict.createdAt.toISOString(),
    };

    for (const key of NUMERIC_FEATURE_KEYS) {
      const val = features[key];
      row[key] = val ?? "";
    }

    for (let i = 0; i < distinctPairs.length; i++) {
      row[pairColumns[i]!] = verdict.pair === distinctPairs[i] ? 1 : 0;
    }

    return row;
  });

  const numericColumns: string[] = ["rMultiple", ...NUMERIC_FEATURE_KEYS];
  const droppedColumns: string[] = [];
  const filledColumns: { column: string; filledCount: number; median: number }[] =
    [];

  const activeNumericColumns = numericColumns.filter((col) => {
    const nullCount = rawRows.filter(
      (row) => row[col] === "" || row[col] === null || row[col] === undefined,
    ).length;
    if (nullCount === 0) return true;

    const nullRate = nullCount / rawRows.length;
    if (nullRate > NULL_DROP_THRESHOLD) {
      droppedColumns.push(col);
      console.warn(
        `Dropping column "${col}": ${nullCount}/${rawRows.length} (${(nullRate * 100).toFixed(1)}%) null — exceeds ${NULL_DROP_THRESHOLD * 100}% threshold.`,
      );
      return false;
    }

    const presentValues = rawRows
      .map((row) => row[col])
      .filter((v): v is number => typeof v === "number");
    const colMedian = median(presentValues);
    let filledCount = 0;

    for (const row of rawRows) {
      if (row[col] === "" || row[col] === null || row[col] === undefined) {
        row[col] = colMedian;
        filledCount++;
      }
    }

    filledColumns.push({ column: col, filledCount, median: colMedian });
    console.log(
      `Filled ${filledCount} null(s) in "${col}" with median ${colMedian}`,
    );
    return true;
  });

  for (const col of droppedColumns) {
    for (const row of rawRows) {
      delete row[col];
    }
  }

  const columns: string[] = [
    "label",
    "outcome",
    ...activeNumericColumns.filter((c) => c === "rMultiple"),
    "direction",
    "directionEncoded",
    "confidenceTier",
    "confidenceTierEncoded",
    "timeframe",
    "hourOfDay",
    "dayOfWeek",
    ...activeNumericColumns.filter((c) => c !== "rMultiple"),
    ...pairColumns,
    "createdAt",
  ];

  const outputDir = join(process.cwd(), "ml", "data");
  mkdirSync(outputDir, { recursive: true });

  const fileName =
    resolvedCount < MIN_RESOLVED_VERDICTS
      ? "training_dataset_PREVIEW.csv"
      : "training_dataset.csv";
  const outputPath = join(outputDir, fileName);

  writeCsv(outputPath, columns, rawRows);

  const labels = rawRows.map((r) => r.label as number);
  const winRate = labels.reduce((a, b) => a + b, 0) / labels.length;

  const tierWinRates = new Map<string, { wins: number; total: number }>();
  for (const row of rawRows) {
    const tier = String(row.confidenceTier);
    const entry = tierWinRates.get(tier) ?? { wins: 0, total: 0 };
    entry.total++;
    if (row.label === 1) entry.wins++;
    tierWinRates.set(tier, entry);
  }

  const dates = withFeatures.map((v) => v.createdAt);
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));

  const pairCounts = new Map<string, number>();
  for (const v of withFeatures) {
    pairCounts.set(v.pair, (pairCounts.get(v.pair) ?? 0) + 1);
  }

  console.log("\n--- Training dataset summary ---");
  console.log(`Output file: ${outputPath}`);
  console.log(`Resolved verdicts included: ${rawRows.length}`);
  console.log(`Overall win rate: ${(winRate * 100).toFixed(1)}%`);
  console.log("Win rate by confidenceTier:");
  for (const [tier, stats] of [...tierWinRates.entries()].sort()) {
    console.log(
      `  ${tier}: ${((stats.wins / stats.total) * 100).toFixed(1)}% (${stats.wins}/${stats.total})`,
    );
  }
  console.log(
    `Date range: ${minDate.toISOString()} → ${maxDate.toISOString()}`,
  );
  console.log("Pair counts:");
  for (const [pair, count] of [...pairCounts.entries()].sort()) {
    console.log(`  ${pair}: ${count}`);
  }

  if (droppedColumns.length > 0) {
    console.log(`Dropped columns (>30% null): ${droppedColumns.join(", ")}`);
  } else {
    console.log("Dropped columns: none");
  }

  if (filledColumns.length > 0) {
    console.log("Median-filled columns:");
    for (const { column, filledCount, median: med } of filledColumns) {
      console.log(`  ${column}: ${filledCount} row(s), median=${med}`);
    }
  } else {
    console.log("Median-filled columns: none");
  }

  if (resolvedCount >= MIN_RESOLVED_VERDICTS) {
    console.log("\n✅ Ready for Stage 3");
  } else {
    const needed = MIN_RESOLVED_VERDICTS - resolvedCount;
    console.log(
      `\n⚠️ Not enough data yet, need ${needed} more resolved verdict(s) (have ${resolvedCount}, want ${MIN_RESOLVED_VERDICTS}+)`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
