import { getPrisma } from "@/lib/db";

export type LaneHealthStatus = "ok" | "degraded" | "failed";
export type LaneName = "technical" | "flow" | "narrative" | "macro";

export type LaneHealthEntry = {
  lane: LaneName;
  status: LaneHealthStatus;
  source?: string | null;
  errorDetail?: string | null;
};

/**
 * Fire-and-forget LaneHealthLog writes (one row per lane). Never throws to callers.
 */
export function recordLaneHealthLogs(
  pair: string,
  timeframe: string,
  entries: LaneHealthEntry[]
): void {
  void (async () => {
    try {
      const prisma = getPrisma();
      if (!prisma?.laneHealthLog?.createMany) return;
      await prisma.laneHealthLog.createMany({
        data: entries.map((e) => ({
          pair,
          timeframe,
          lane: e.lane,
          status: e.status,
          source: e.source ?? null,
          errorDetail: e.errorDetail ?? null,
        })),
      });
    } catch (err) {
      console.error(
        "[instrumentation] LaneHealthLog write failed",
        err instanceof Error ? err.message : String(err)
      );
    }
  })();
}

/**
 * Map existing analyze dataSources + availability flags → health rows.
 * Does not invent new detection — reuses the same strings/availability used in API responses.
 */
export function buildLaneHealthFromAnalysis(args: {
  dataSources: {
    klines: string;
    flow: string;
    narrative: string;
    macro: string;
  };
  flowAvailable: boolean;
  narrativeAvailable: boolean;
  /** True when CoinGecko global mcap resolved (partial narrative signal). */
  narrativeMcapOk: boolean;
  macroAvailable: boolean;
}): LaneHealthEntry[] {
  const { dataSources } = args;

  const flowStatus: LaneHealthStatus = !args.flowAvailable
    ? "failed"
    : dataSources.flow === "okx"
      ? "degraded" // OKX-only after Binance/Bybit region blocks
      : "ok";

  const narrativeStatus: LaneHealthStatus = !args.narrativeAvailable
    ? "failed"
    : args.narrativeMcapOk
      ? "ok"
      : "degraded";

  return [
    {
      lane: "technical",
      status: "ok",
      source: dataSources.klines,
    },
    {
      lane: "flow",
      status: flowStatus,
      source: args.flowAvailable ? dataSources.flow : null,
      errorDetail: args.flowAvailable ? null : "all venues unavailable",
    },
    {
      lane: "narrative",
      status: narrativeStatus,
      source: args.narrativeAvailable ? dataSources.narrative : null,
      errorDetail: args.narrativeMcapOk
        ? null
        : "coingecko global mcap unavailable",
    },
    {
      lane: "macro",
      status: args.macroAvailable ? "ok" : "failed",
      source: args.macroAvailable ? dataSources.macro : null,
      errorDetail: args.macroAvailable ? null : "yahoo-finance unavailable",
    },
  ];
}
