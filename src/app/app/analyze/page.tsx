"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { BiasPill } from "@/components/ui/BiasPill";
import { TierPill } from "@/components/ui/TierPill";
import { TRACKED_PAIRS } from "@/lib/mock-data";
import type { LaneOutput, Verdict } from "@/lib/types";

const badgeColors: Record<string, string> = {
  T: "bg-accent/20 text-accent border-accent/30",
  F: "bg-bull/20 text-bull border-bull/30",
  N: "bg-mixed/20 text-mixed border-mixed/30",
  M: "bg-bear/20 text-bear border-bear/30",
};

export default function AnalyzePage() {
  const [pair, setPair] = useState("BTC/USDT");
  const [timeframe, setTimeframe] = useState("1h");
  const [lanes, setLanes] = useState<LaneOutput[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyze?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`);
      const data = await res.json();
      if (!res.ok) {
        setLanes([]);
        setVerdict(null);
        setError(data.error ?? "Analysis failed.");
        return;
      }
      setLanes(data.lanes);
      setVerdict(data.verdict);
    } catch {
      setLanes([]);
      setVerdict(null);
      setError("Could not reach analysis service.");
    }
    setLoading(false);
  }

  useEffect(() => {
    runAnalysis();
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Analyze</h1>
      <p className="text-text-muted text-sm mb-6 sm:mb-8">Run the 4-lane pipeline for any tracked pair.</p>

      <GlassCard className="mb-6 sm:mb-8 !p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
          <div className="w-full sm:w-auto sm:flex-1 sm:max-w-xs">
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
          <div className="w-full sm:w-auto sm:flex-1 sm:max-w-xs">
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm font-mono-data text-text-primary focus:outline-none focus:border-accent/40"
            >
              {["15m", "1h", "4h", "1d"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 bg-accent text-bg-primary rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Running..." : "Run Pipeline"}
          </button>
        </div>
      </GlassCard>

      {error && (
        <GlassCard className="mb-6 border-bear/30 !p-4">
          <p className="text-sm text-bear">{error}</p>
        </GlassCard>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {lanes.map((lane) => (
          <GlassCard key={lane.lane}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold ${badgeColors[lane.badge]}`}>
                {lane.badge}
              </div>
              <h3 className="font-semibold text-sm">{lane.lane}</h3>
            </div>
            <div className="flex gap-2 mb-3">
              <BiasPill bias={lane.bias} />
              <TierPill tier={lane.tier} />
            </div>
            <ul className="space-y-1">
              {lane.reasoning.map((r, j) => (
                <li key={j} className="text-xs text-text-muted font-mono-data">› {r}</li>
              ))}
            </ul>
          </GlassCard>
        ))}
        {loading && lanes.length === 0 && Array.from({ length: 4 }).map((_, i) => (
          <GlassCard key={i}><div className="skeleton h-32" /></GlassCard>
        ))}
      </div>

      {verdict && (
        <GlassCard glow="accent" className="!p-4 sm:!p-6 lg:!p-8">
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-4">Synthesized Verdict</p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
            <span className="font-mono-data text-lg sm:text-xl font-semibold">{verdict.pair} · {verdict.timeframe}</span>
            <TierPill tier={verdict.tier} />
            <span className={`px-3 py-1 rounded border text-sm font-bold font-mono-data ${
              verdict.direction === "LONG" ? "bg-bull/15 text-bull border-bull/30" :
              verdict.direction === "SHORT" ? "bg-bear/15 text-bear border-bear/30" :
              "bg-mixed/15 text-mixed border-mixed/30"
            }`}>
              {verdict.direction}
            </span>
            <span className="text-xs text-text-muted sm:ml-auto w-full sm:w-auto">{verdict.alignment}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div><p className="text-[10px] uppercase text-text-muted mb-1">Entry</p><p className="font-mono-data text-xl text-bull">${verdict.entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
            <div><p className="text-[10px] uppercase text-text-muted mb-1">Stop Loss</p><p className="font-mono-data text-xl text-bear">${verdict.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
            <div><p className="text-[10px] uppercase text-text-muted mb-1">TP 1</p><p className="font-mono-data text-xl text-bull">${verdict.takeProfit1.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
            <div><p className="text-[10px] uppercase text-text-muted mb-1">TP 2</p><p className="font-mono-data text-xl text-bull">${verdict.takeProfit2.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p></div>
          </div>
          <p className="text-sm text-text-muted">{verdict.rationale}</p>
          <p className="text-xs text-accent font-mono-data mt-2">Risk:Reward {verdict.riskReward}</p>
        </GlassCard>
      )}
    </div>
  );
}
