"use client";

import { useEffect, useState } from "react";
import { LiveCandleChart } from "@/components/charts/LiveCandleChart";
import { VerdictCard } from "@/components/charts/VerdictCard";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import {
  TIMEFRAME_OPTIONS,
  getStoredPair,
  setStoredPair,
  type ChartInterval,
} from "@/lib/tradingview";

export default function ChartsPage() {
  const [pair, setPair] = useState("BTC/USDT");
  const [chartInterval, setChartInterval] = useState<ChartInterval>("60");

  useEffect(() => {
    setPair(getStoredPair());
  }, []);

  function handlePairChange(next: string) {
    setPair(next);
    setStoredPair(next);
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-screen p-4 sm:p-6 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-0.5">Charts</h1>
          <p className="text-text-muted text-sm">Live candlestick chart with AI verdict context.</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:ml-auto w-full sm:w-auto">
          <select
            value={pair}
            onChange={(e) => handlePairChange(e.target.value)}
            className="w-full sm:w-auto bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm font-mono-data text-text-primary focus:outline-none focus:border-accent/40"
          >
            {TRACKED_PAIRS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {TIMEFRAME_OPTIONS.map((tf) => (
              <button
                key={tf.interval}
                type="button"
                onClick={() => setChartInterval(tf.interval)}
                className={`px-3 py-2 rounded-lg text-sm font-mono-data whitespace-nowrap transition-colors ${
                  chartInterval === tf.interval
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "text-text-muted hover:text-text-primary bg-white/5 border border-transparent"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 gap-4 min-h-0">
        <div className="flex-1 min-h-[500px] lg:min-h-0 rounded-xl border border-white/8 overflow-hidden bg-bg-card">
          <LiveCandleChart pair={pair} interval={chartInterval} />
        </div>

        <div className="w-full lg:w-80 shrink-0 lg:overflow-y-auto">
          <VerdictCard pair={pair} interval={chartInterval} />
        </div>
      </div>
    </div>
  );
}
