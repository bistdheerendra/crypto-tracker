"use client";

import { useEffect, useState } from "react";
import { LiveCandleChart, type ChartLevels } from "@/components/charts/LiveCandleChart";
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
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [levels, setLevels] = useState<ChartLevels | null>(null);
  const [showDrawings, setShowDrawings] = useState(true);

  useEffect(() => {
    setPair(getStoredPair());
  }, []);

  useEffect(() => {
    setLivePrice(null);
    setLevels(null);
  }, [pair, chartInterval]);

  function handlePairChange(next: string) {
    setPair(next);
    setStoredPair(next);
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-screen p-4 sm:p-6 gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-0.5">Charts</h1>
          <p className="text-text-muted text-sm">
            Live candles with Analyzer support/resistance and trade levels.
          </p>
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

          <button
            type="button"
            onClick={() => setShowDrawings((prev) => !prev)}
            aria-pressed={showDrawings}
            title={showDrawings ? "Hide chart drawings" : "Show chart drawings"}
            className={`px-3 py-2 rounded-lg text-sm font-mono-data whitespace-nowrap transition-colors ${
              showDrawings
                ? "bg-accent/15 text-accent border border-accent/30"
                : "text-text-muted hover:text-text-primary bg-white/5 border border-white/8"
            }`}
          >
            {showDrawings ? "Hide Levels" : "Show Levels"}
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 gap-4 min-h-0">
        <div className="flex-1 min-h-[500px] lg:min-h-0 rounded-xl border border-white/8 overflow-hidden bg-bg-card">
          <LiveCandleChart
            pair={pair}
            interval={chartInterval}
            levels={showDrawings ? levels : null}
            onPriceUpdate={setLivePrice}
          />
        </div>

        <div className="w-full lg:w-96 shrink-0 min-h-0 max-h-[70vh] lg:max-h-none self-stretch flex flex-col overflow-hidden">
          <VerdictCard
            pair={pair}
            interval={chartInterval}
            livePrice={livePrice}
            onAnalysisChange={(result) => setLevels(result.levels)}
          />
        </div>
      </div>
    </div>
  );
}
