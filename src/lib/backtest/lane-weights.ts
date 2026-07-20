import { computeTrackRecord } from "./aggregator";
import { getAllVerdicts } from "../verdicts/store";

const DEFAULT_WEIGHTS: Record<string, number> = {
  Technical: 0.3,
  Flow: 0.25,
  Narrative: 0.25,
  Macro: 0.2,
};

const LANE_KEY_MAP: Record<string, keyof ReturnType<typeof computeTrackRecord>["laneAccuracy"]> = {
  Technical: "technical",
  Flow: "flow",
  Narrative: "narrative",
  Macro: "macro",
};

let cachedWeights: { weights: Record<string, number>; updatedAt: string } | null = null;

export function getDynamicLaneWeights(): {
  weights: Record<string, number>;
  updatedAt: string;
  source: "dynamic" | "default";
} {
  if (cachedWeights) return { ...cachedWeights, source: "dynamic" };

  const stats = computeTrackRecord(getAllVerdicts());
  const resolved = stats.resolvedCount;

  if (resolved < 30) {
    return { weights: { ...DEFAULT_WEIGHTS }, updatedAt: stats.computedAt, source: "default" };
  }

  const raw: Record<string, number> = {};
  for (const [lane, key] of Object.entries(LANE_KEY_MAP)) {
    const accuracy = stats.laneAccuracy[key].accuracy;
    raw[lane] = Math.max(accuracy, 10) / 100;
  }

  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const weights: Record<string, number> = {};
  for (const [lane, val] of Object.entries(raw)) {
    weights[lane] = parseFloat((val / total).toFixed(3));
  }

  cachedWeights = { weights, updatedAt: stats.computedAt };
  return { ...cachedWeights, source: "dynamic" };
}

export function invalidateLaneWeightCache(): void {
  cachedWeights = null;
}

export { DEFAULT_WEIGHTS };
