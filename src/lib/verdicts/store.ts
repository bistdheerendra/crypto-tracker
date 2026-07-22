import type { Direction, LaneOutput, Tier, Verdict } from "../types";
import { getPrisma, isDatabaseConfigured } from "../db";
import type { VerdictFeaturePayload } from "./features";
import { laneBiasesFromLanes, TIER_ORDER, type StoredVerdict, type VerdictOutcome } from "./types";

/** In-memory fallback when DATABASE_URL is not configured. */
let memoryVerdicts: StoredVerdict[] = [];

type QueryFilters = {
  pair?: string;
  from?: Date;
  to?: Date;
  minTier?: "HIGH" | "MODERATE" | "LOW";
  resolvedOnly?: boolean;
};

function filterVerdicts(list: StoredVerdict[], filters: QueryFilters): StoredVerdict[] {
  const minTierLevel = filters.minTier ? TIER_ORDER[filters.minTier] : 0;

  return list.filter((v) => {
    if (filters.pair && v.pair !== filters.pair) return false;
    const created = new Date(v.createdAt);
    if (filters.from && created < filters.from) return false;
    if (filters.to && created > filters.to) return false;
    if (minTierLevel > 0 && TIER_ORDER[v.confidenceTier] < minTierLevel) return false;
    if (filters.resolvedOnly && (!v.outcome || v.outcome === "open" || v.rMultiple === null)) {
      return false;
    }
    return true;
  });
}

function rowToStored(row: {
  id: string;
  pair: string;
  timeframe: string;
  direction: string;
  confidenceTier: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  laneBiasTechnical: string;
  laneBiasFlow: string;
  laneBiasNarrative: string;
  laneBiasMacro: string;
  createdAt: Date;
  outcome: string | null;
  outcomePrice: number | null;
  outcomeAt: Date | null;
  rMultiple: number | null;
  features?: {
    ema50: number | null;
    ema200: number | null;
    rsi14: number | null;
    priceDistanceToEma50Pct: number | null;
    distanceToNearestSwingPct: number | null;
    rsiMomentum: number | null;
    volatilityRegime: number | null;
    oiChangePct: number | null;
    fundingRate: number | null;
    longShortRatio: number | null;
    price24hChangePct: number | null;
    fundingRateRoc: number | null;
    oiRoc: number | null;
    fearGreedIndex: number | null;
    globalMcapChangePct: number | null;
    trendingScore: number | null;
    fearGreedRoc: number | null;
    dxyChangePct: number | null;
    spxChangePct: number | null;
    goldChangePct: number | null;
    confidenceTier: string;
    laneAgreementCount: number;
    pair: string;
    timeframe: string;
    hourOfDay: number;
    dayOfWeek: number;
  } | null;
}): StoredVerdict {
  const features: VerdictFeaturePayload | null = row.features
    ? {
        ema50: row.features.ema50,
        ema200: row.features.ema200,
        rsi14: row.features.rsi14,
        priceDistanceToEma50Pct: row.features.priceDistanceToEma50Pct,
        distanceToNearestSwingPct: row.features.distanceToNearestSwingPct,
        rsiMomentum: row.features.rsiMomentum,
        volatilityRegime: row.features.volatilityRegime,
        oiChangePct: row.features.oiChangePct,
        fundingRate: row.features.fundingRate,
        longShortRatio: row.features.longShortRatio,
        price24hChangePct: row.features.price24hChangePct,
        fundingRateRoc: row.features.fundingRateRoc,
        oiRoc: row.features.oiRoc,
        fearGreedIndex: row.features.fearGreedIndex,
        globalMcapChangePct: row.features.globalMcapChangePct,
        trendingScore: row.features.trendingScore,
        fearGreedRoc: row.features.fearGreedRoc,
        dxyChangePct: row.features.dxyChangePct,
        spxChangePct: row.features.spxChangePct,
        goldChangePct: row.features.goldChangePct,
        confidenceTier: row.features.confidenceTier as Tier,
        laneAgreementCount: row.features.laneAgreementCount,
        pair: row.features.pair,
        timeframe: row.features.timeframe,
        hourOfDay: row.features.hourOfDay,
        dayOfWeek: row.features.dayOfWeek,
      }
    : null;

  return {
    id: row.id,
    pair: row.pair,
    timeframe: row.timeframe,
    direction: row.direction as Direction,
    confidenceTier: row.confidenceTier as Tier,
    entryPrice: row.entryPrice,
    stopLoss: row.stopLoss,
    takeProfit1: row.takeProfit1,
    takeProfit2: row.takeProfit2,
    laneBiases: {
      technical: row.laneBiasTechnical as StoredVerdict["laneBiases"]["technical"],
      flow: row.laneBiasFlow as StoredVerdict["laneBiases"]["flow"],
      narrative: row.laneBiasNarrative as StoredVerdict["laneBiases"]["narrative"],
      macro: row.laneBiasMacro as StoredVerdict["laneBiases"]["macro"],
    },
    createdAt: row.createdAt.toISOString(),
    outcome: (row.outcome as VerdictOutcome | null) ?? null,
    outcomePrice: row.outcomePrice,
    outcomeAt: row.outcomeAt?.toISOString() ?? null,
    rMultiple: row.rMultiple,
    features,
  };
}

export async function getAllVerdicts(): Promise<StoredVerdict[]> {
  const prisma = getPrisma();
  if (!prisma) return [...memoryVerdicts];

  const rows = await prisma.verdict.findMany({
    include: { features: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(rowToStored);
}

export async function getVerdictById(id: string): Promise<StoredVerdict | undefined> {
  const prisma = getPrisma();
  if (!prisma) return memoryVerdicts.find((v) => v.id === id);

  const row = await prisma.verdict.findUnique({
    where: { id },
    include: { features: true },
  });
  return row ? rowToStored(row) : undefined;
}

export async function getOpenVerdicts(): Promise<StoredVerdict[]> {
  const prisma = getPrisma();
  if (!prisma) return memoryVerdicts.filter((v) => v.outcome === "open");

  const rows = await prisma.verdict.findMany({
    where: { outcome: "open" },
    include: { features: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(rowToStored);
}

export async function queryVerdicts(filters: QueryFilters): Promise<StoredVerdict[]> {
  const all = await getAllVerdicts();
  return filterVerdicts(all, filters);
}

export async function saveVerdict(
  verdict: Verdict,
  lanes: LaneOutput[],
  features?: VerdictFeaturePayload | null
): Promise<StoredVerdict> {
  const biases = laneBiasesFromLanes(lanes);
  const outcome: VerdictOutcome = verdict.direction === "NEUTRAL" ? "expired" : "open";
  const createdAt = new Date();

  const prisma = getPrisma();
  if (!prisma) {
    const stored: StoredVerdict = {
      id: `v-live-${Date.now()}`,
      pair: verdict.pair,
      timeframe: verdict.timeframe,
      direction: verdict.direction,
      confidenceTier: verdict.tier,
      entryPrice: verdict.entry,
      stopLoss: verdict.stopLoss,
      takeProfit1: verdict.takeProfit1,
      takeProfit2: verdict.takeProfit2,
      laneBiases: biases,
      createdAt: createdAt.toISOString(),
      outcome,
      outcomePrice: null,
      outcomeAt: null,
      rMultiple: null,
      features: features ?? null,
    };
    memoryVerdicts.push(stored);
    return stored;
  }

  const row = await prisma.verdict.create({
    data: {
      pair: verdict.pair,
      timeframe: verdict.timeframe,
      direction: verdict.direction,
      confidenceTier: verdict.tier,
      entryPrice: verdict.entry,
      stopLoss: verdict.stopLoss,
      takeProfit1: verdict.takeProfit1,
      takeProfit2: verdict.takeProfit2,
      laneBiasTechnical: biases.technical,
      laneBiasFlow: biases.flow,
      laneBiasNarrative: biases.narrative,
      laneBiasMacro: biases.macro,
      createdAt,
      outcome,
      features: features
        ? {
            create: {
              ema50: features.ema50,
              ema200: features.ema200,
              rsi14: features.rsi14,
              priceDistanceToEma50Pct: features.priceDistanceToEma50Pct,
              distanceToNearestSwingPct: features.distanceToNearestSwingPct,
              rsiMomentum: features.rsiMomentum,
              volatilityRegime: features.volatilityRegime,
              oiChangePct: features.oiChangePct,
              fundingRate: features.fundingRate,
              longShortRatio: features.longShortRatio,
              price24hChangePct: features.price24hChangePct,
              fundingRateRoc: features.fundingRateRoc,
              oiRoc: features.oiRoc,
              fearGreedIndex: features.fearGreedIndex,
              globalMcapChangePct: features.globalMcapChangePct,
              trendingScore: features.trendingScore,
              fearGreedRoc: features.fearGreedRoc,
              dxyChangePct: features.dxyChangePct,
              spxChangePct: features.spxChangePct,
              goldChangePct: features.goldChangePct,
              confidenceTier: features.confidenceTier,
              laneAgreementCount: features.laneAgreementCount,
              pair: features.pair,
              timeframe: features.timeframe,
              hourOfDay: features.hourOfDay,
              dayOfWeek: features.dayOfWeek,
            },
          }
        : undefined,
    },
    include: { features: true },
  });

  return rowToStored(row);
}

export async function resolveVerdict(
  id: string,
  update: {
    outcome: VerdictOutcome;
    outcomePrice: number;
    outcomeAt: string;
    rMultiple: number;
  }
): Promise<StoredVerdict | null> {
  const prisma = getPrisma();
  if (!prisma) {
    const idx = memoryVerdicts.findIndex((v) => v.id === id);
    if (idx === -1) return null;
    memoryVerdicts[idx] = { ...memoryVerdicts[idx], ...update };
    return memoryVerdicts[idx];
  }

  try {
    const row = await prisma.verdict.update({
      where: { id },
      data: {
        outcome: update.outcome,
        outcomePrice: update.outcomePrice,
        outcomeAt: new Date(update.outcomeAt),
        rMultiple: update.rMultiple,
      },
      include: { features: true },
    });
    return rowToStored(row);
  } catch {
    return null;
  }
}

/** Expose backend mode for ops / health checks. */
export function getVerdictStoreMode(): "postgres" | "memory" {
  return isDatabaseConfigured() ? "postgres" : "memory";
}
