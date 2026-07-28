"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MarketRegime,
  MarketRegimeResult,
  RegimeDirection,
} from "@/lib/analysis/regime";

export type RegimeState = MarketRegimeResult & {
  pair: string;
  timeframe: string;
};

/**
 * Poll /api/regime for each pair. Default ~2.5 min — regime is slow-moving.
 */
export function useMarketRegimes(
  pairs: readonly string[],
  timeframe: string,
  pollMs = 150_000
) {
  const [regimes, setRegimes] = useState<Record<string, RegimeState | null>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const pairsKey = pairs.join(",");

  const fetchAll = useCallback(async () => {
    const list = pairsKey.split(",").filter(Boolean);
    try {
      const results = await Promise.all(
        list.map(async (pair) => {
          try {
            const res = await fetch(
              `/api/regime?pair=${encodeURIComponent(pair)}&timeframe=${encodeURIComponent(timeframe)}`
            );
            const json = await res.json();
            if (!res.ok) return [pair, null] as const;
            return [
              pair,
              {
                pair,
                timeframe: json.timeframe as string,
                regime: json.regime as MarketRegime,
                volatilityRatio: json.volatilityRatio as number,
                rangeBoundPct: json.rangeBoundPct as number,
                direction: (json.direction as RegimeDirection) ?? "FLAT",
              } satisfies RegimeState,
            ] as const;
          } catch {
            return [pair, null] as const;
          }
        })
      );
      setRegimes(Object.fromEntries(results));
    } finally {
      setLoading(false);
    }
  }, [pairsKey, timeframe]);

  useEffect(() => {
    setLoading(true);
    void fetchAll();
    if (pollMs <= 0) return;
    const interval = setInterval(() => void fetchAll(), pollMs);
    return () => clearInterval(interval);
  }, [fetchAll, pollMs]);

  return { regimes, loading };
}

/** Single-pair regime fetch (Analyze / Charts). */
export function useMarketRegime(
  pair: string,
  timeframe: string,
  pollMs = 150_000
) {
  const pairs = useMemo(() => [pair] as const, [pair]);
  const { regimes, loading } = useMarketRegimes(pairs, timeframe, pollMs);
  return { regime: regimes[pair] ?? null, loading };
}
