"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { EquityCurveChart } from "@/components/backtest/EquityCurveChart";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import type { SimulatorResult } from "@/lib/backtest/simulator";
import { Play, AlertCircle } from "lucide-react";

const DATE_RANGES = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "custom", label: "Custom" },
] as const;

const TIER_OPTIONS = [
  { value: "HIGH", label: "HIGH only" },
  { value: "MODERATE", label: "MODERATE+" },
  { value: "LOW", label: "All signals" },
] as const;

const OUTCOME_LABELS: Record<string, string> = {
  tp1_hit: "TP1 Hit",
  tp2_hit: "TP2 Hit",
  sl_hit: "SL Hit",
  expired: "Expired",
  open: "Open",
};

interface SimulatorPanelProps {
  onRun: (params: {
    pair: string;
    dateRange: string;
    customFrom: string;
    customTo: string;
    minTier: string;
    startingCapital: number;
    riskPerTrade: number;
  }) => Promise<SimulatorResult & { pair: string }>;
}

export function SimulatorPanel({ onRun }: SimulatorPanelProps) {
  const [pair, setPair] = useState("BTC/USDT");
  const [dateRange, setDateRange] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [minTier, setMinTier] = useState("LOW");
  const [startingCapital, setStartingCapital] = useState(10000);
  const [riskPerTrade, setRiskPerTrade] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(SimulatorResult & { pair: string }) | null>(null);

  async function handleRun() {
    setLoading(true);
    try {
      const data = await onRun({
        pair,
        dateRange,
        customFrom,
        customTo,
        minTier,
        startingCapital,
        riskPerTrade,
      });
      setResult(data);
    } catch {
      setResult(null);
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <GlassCard className="!p-4 sm:!p-6">
        <h2 className="font-semibold mb-4">Simulator</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Pair</label>
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm font-mono-data text-text-primary focus:outline-none focus:border-accent/40"
            >
              {TRACKED_PAIRS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/40"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Min Confidence</label>
            <select
              value={minTier}
              onChange={(e) => setMinTier(e.target.value)}
              className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/40"
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {dateRange === "custom" && (
            <>
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/40"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/40"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Starting Capital</label>
            <input
              type="number"
              min={100}
              value={startingCapital}
              onChange={(e) => setStartingCapital(Number(e.target.value))}
              className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm font-mono-data text-text-primary focus:outline-none focus:border-accent/40"
            />
          </div>
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Risk / Trade (%)</label>
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={riskPerTrade}
              onChange={(e) => setRiskPerTrade(Number(e.target.value))}
              className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm font-mono-data text-text-primary focus:outline-none focus:border-accent/40"
            />
          </div>
        </div>
        <button
          onClick={handleRun}
          disabled={loading}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-accent text-bg-primary rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          <Play className="w-4 h-4" />
          {loading ? "Running..." : "Run Simulation"}
        </button>
      </GlassCard>

      {result && !result.sufficientData && (
        <GlassCard className="!p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-mixed shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm mb-1">Not enough historical signals</p>
            <p className="text-sm text-text-muted">
              Not enough historical signals yet for this range — check back as more data accumulates.
            </p>
          </div>
        </GlassCard>
      )}

      {result?.sufficientData && (
        <>
          <GlassCard>
            <h3 className="font-semibold text-sm mb-4">Equity Curve — {result.pair}</h3>
            <EquityCurveChart data={result.equityCurve} startingCapital={startingCapital} />
          </GlassCard>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: "Total Trades", value: result.totalTrades.toString() },
              { label: "Win Rate", value: `${result.winRate}%`, color: "text-bull" },
              { label: "Max Drawdown", value: `${result.maxDrawdown}%`, color: "text-bear" },
              {
                label: "Final Equity",
                value: `$${result.finalEquity.toLocaleString()}`,
                color: result.finalEquity >= startingCapital ? "text-bull" : "text-bear",
              },
              { label: "Sharpe Ratio", value: result.sharpeRatio.toString(), color: "text-accent" },
            ].map((stat) => (
              <GlassCard key={stat.label}>
                <p className="text-[10px] uppercase text-text-muted mb-1">{stat.label}</p>
                <p className={`font-mono-data text-lg font-bold ${stat.color ?? ""}`}>{stat.value}</p>
              </GlassCard>
            ))}
          </div>

          <GlassCard className="!p-0 overflow-hidden">
            <div className="p-4 border-b border-white/8">
              <h3 className="font-semibold text-sm">Trade Log</h3>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="sticky top-0 bg-bg-card z-10">
                  <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                    <th className="text-left py-3 px-4">Entry Time</th>
                    <th className="text-left py-3 px-4">Dir</th>
                    <th className="text-right py-3 px-4">Entry</th>
                    <th className="text-right py-3 px-4">SL</th>
                    <th className="text-right py-3 px-4">TP1</th>
                    <th className="text-left py-3 px-4">Exit</th>
                    <th className="text-right py-3 px-4">R</th>
                    <th className="text-right py-3 px-4">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t) => (
                    <tr key={t.id} className="border-t border-white/5 hover:bg-white/3">
                      <td className="py-2.5 px-4 font-mono-data text-xs text-text-muted">
                        {new Date(t.entryTime).toLocaleString()}
                      </td>
                      <td className={`py-2.5 px-4 font-mono-data font-semibold ${t.direction === "LONG" ? "text-bull" : "text-bear"}`}>
                        {t.direction}
                      </td>
                      <td className="py-2.5 px-4 font-mono-data text-right">${t.entry.toFixed(0)}</td>
                      <td className="py-2.5 px-4 font-mono-data text-right text-bear">${t.stopLoss.toFixed(0)}</td>
                      <td className="py-2.5 px-4 font-mono-data text-right text-bull">${t.takeProfit1.toFixed(0)}</td>
                      <td className="py-2.5 px-4 text-xs">{OUTCOME_LABELS[t.outcome] ?? t.outcome}</td>
                      <td className={`py-2.5 px-4 font-mono-data text-right ${t.rMultiple >= 0 ? "text-bull" : "text-bear"}`}>
                        {t.rMultiple >= 0 ? "+" : ""}{t.rMultiple}R
                      </td>
                      <td className={`py-2.5 px-4 font-mono-data text-right font-semibold ${t.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                        {t.pnl >= 0 ? "+" : ""}${t.pnl.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
