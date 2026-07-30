import { getPrisma } from "@/lib/db";
import type { MarketRegimeResult } from "@/lib/analysis/regime";

/**
 * Fire-and-forget RegimeSnapshot write. Never throws to callers.
 */
export function recordRegimeSnapshot(
  pair: string,
  timeframe: string,
  result: MarketRegimeResult
): void {
  void (async () => {
    try {
      const prisma = getPrisma();
      if (!prisma?.regimeSnapshot?.create) return;
      await prisma.regimeSnapshot.create({
        data: {
          pair,
          timeframe,
          regime: result.regime,
          volatilityRatio: result.volatilityRatio,
          rangeBoundPct: result.rangeBoundPct,
        },
      });
    } catch (err) {
      console.error(
        "[instrumentation] RegimeSnapshot write failed",
        err instanceof Error ? err.message : String(err)
      );
    }
  })();
}
