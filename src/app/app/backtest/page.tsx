"use client";

import { useCallback, useEffect, useState } from "react";
import { TrackRecordSummary } from "@/components/backtest/TrackRecordSummary";
import { SimulatorPanel } from "@/components/backtest/SimulatorPanel";
import type { TrackRecordStats } from "@/lib/backtest/aggregator";
import type { SimulatorResult } from "@/lib/backtest/simulator";

export default function BacktestPage() {
  const [stats, setStats] = useState<TrackRecordStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/backtest/track-record")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const runSimulation = useCallback(
    async (params: {
      pair: string;
      dateRange: string;
      customFrom: string;
      customTo: string;
      minTier: string;
      startingCapital: number;
      riskPerTrade: number;
    }) => {
      const res = await fetch("/api/backtest/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Simulation failed");
      return res.json() as Promise<SimulatorResult & { pair: string }>;
    },
    []
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">Track Record</h1>
        <p className="text-text-muted text-sm">
          Provable signal accuracy — see how our verdicts have performed over time.
        </p>
      </div>

      <TrackRecordSummary stats={stats} loading={loading} />

      <SimulatorPanel onRun={runSimulation} />
    </div>
  );
}
