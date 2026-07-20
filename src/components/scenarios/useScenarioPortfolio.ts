"use client";

import { useCallback, useEffect, useState } from "react";
import { applyMarkPrices, fetchMarkPrices } from "@/lib/scenarios/mark-prices";
import {
  createPositionId,
  loadStoredPositions,
  saveStoredPositions,
} from "@/lib/scenarios/positions-store";
import { importVerdictsAsPositions } from "@/lib/scenarios/verdict-import";
import type { StoredVerdict } from "@/lib/verdicts/types";
import type { PortfolioPosition } from "@/lib/types";

export function useScenarioPortfolio(enabled: boolean) {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setPositions(loadStoredPositions() ?? []);
    setHydrated(true);
  }, [enabled]);

  const persist = useCallback((next: PortfolioPosition[]) => {
    setPositions(next);
    saveStoredPositions(next);
  }, []);

  const refreshPrices = useCallback(async (current: PortfolioPosition[]) => {
    if (current.length === 0) {
      setLastPriceUpdate(new Date());
      return;
    }
    setPricesLoading(true);
    try {
      const prices = await fetchMarkPrices(current.map((p) => p.pair));
      setPositions((prev) => {
        const updated = applyMarkPrices(prev, prices);
        saveStoredPositions(updated);
        return updated;
      });
      setLastPriceUpdate(new Date());
    } finally {
      setPricesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !hydrated) return;
    refreshPrices(positions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hydrated]);

  const addPosition = useCallback(
    (input: Omit<PortfolioPosition, "id">) => {
      const next = [...positions, { ...input, id: createPositionId() }];
      persist(next);
      void refreshPrices(next);
    },
    [positions, persist, refreshPrices]
  );

  const removePosition = useCallback(
    (id: string) => {
      const next = positions.filter((p) => p.id !== id);
      persist(next);
    },
    [positions, persist]
  );

  const clearAll = useCallback(() => {
    persist([]);
  }, [persist]);

  const importOpenVerdicts = useCallback(
    async (equity: number, riskPct: number) => {
      const res = await fetch("/api/verdicts/open");
      if (!res.ok) throw new Error("Failed to load open verdicts");
      const data = (await res.json()) as { verdicts: StoredVerdict[] };
      const prices = await fetchMarkPrices(data.verdicts.map((v) => v.pair));
      const next = importVerdictsAsPositions(data.verdicts, positions, {
        equity,
        riskPct,
        markPrices: prices,
      });
      persist(next);
      void refreshPrices(next);
      return {
        imported: next.length - positions.length,
        total: data.verdicts.length,
      };
    },
    [positions, persist, refreshPrices]
  );

  return {
    positions,
    hydrated,
    pricesLoading,
    lastPriceUpdate,
    addPosition,
    removePosition,
    clearAll,
    importOpenVerdicts,
    refreshPrices: () => refreshPrices(positions),
  };
}

export function useLiveMarkPrices(positions: PortfolioPosition[], enabled: boolean) {
  const [livePositions, setLivePositions] = useState(positions);
  const [loading, setLoading] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);

  useEffect(() => {
    setLivePositions(positions);
  }, [positions]);

  useEffect(() => {
    if (!enabled || positions.length === 0) return;
    let cancelled = false;
    setLoading(true);
    fetchMarkPrices(positions.map((p) => p.pair))
      .then((prices) => {
        if (cancelled) return;
        setLivePositions(applyMarkPrices(positions, prices));
        setLastPriceUpdate(new Date());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, positions]);

  return { livePositions, loading, lastPriceUpdate };
}
