"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { TierPill } from "@/components/ui/TierPill";
import type { TrackRecordStats } from "@/lib/backtest/aggregator";

const LANE_BADGES: Record<string, { badge: string; label: string; color: string }> = {
  technical: { badge: "T", label: "Technical", color: "bg-accent/20 text-accent border-accent/30" },
  flow: { badge: "F", label: "Flow", color: "bg-bull/20 text-bull border-bull/30" },
  narrative: { badge: "N", label: "Narrative", color: "bg-mixed/20 text-mixed border-mixed/30" },
  macro: { badge: "M", label: "Macro", color: "bg-bear/20 text-bear border-bear/30" },
};

interface TrackRecordSummaryProps {
  stats: TrackRecordStats | null;
  loading: boolean;
}

export function TrackRecordSummary({ stats, loading }: TrackRecordSummaryProps) {
  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassCard key={i}><div className="skeleton h-20" /></GlassCard>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="space-y-6 mb-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard glow="accent">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Win Rate</p>
          <p className="font-mono-data text-3xl sm:text-4xl font-bold text-bull">{stats.winRate}%</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Total Signals</p>
          <p className="font-mono-data text-3xl sm:text-4xl font-bold">{stats.totalSignals}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Avg R Achieved</p>
          <p className={`font-mono-data text-3xl sm:text-4xl font-bold ${stats.avgRMultiple >= 0 ? "text-bull" : "text-bear"}`}>
            {stats.avgRMultiple >= 0 ? "+" : ""}{stats.avgRMultiple}R
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Resolved</p>
          <p className="font-mono-data text-3xl sm:text-4xl font-bold text-accent">{stats.resolvedCount}</p>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <GlassCard>
          <h3 className="font-semibold text-sm mb-4">Win Rate by Confidence Tier</h3>
          <div className="space-y-3">
            {(["HIGH", "MODERATE", "LOW"] as const).map((tier) => {
              const t = stats.tierWinRates[tier];
              return (
                <div key={tier} className="flex items-center gap-3">
                  <TierPill tier={tier} />
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${tier === "HIGH" ? "bg-bull" : tier === "MODERATE" ? "bg-mixed" : "bg-text-muted"}`}
                      style={{ width: `${t.winRate}%` }}
                    />
                  </div>
                  <span className="font-mono-data text-sm w-16 text-right">{t.winRate.toFixed(1)}%</span>
                  <span className="text-xs text-text-muted w-12 text-right">{t.total}</span>
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="font-semibold text-sm mb-4">Lane Predictive Accuracy</h3>
          <div className="space-y-3">
            {Object.entries(LANE_BADGES).map(([key, lane]) => {
              const acc = stats.laneAccuracy[key as keyof typeof stats.laneAccuracy];
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${lane.color}`}>
                    {lane.badge}
                  </div>
                  <span className="text-sm w-24 shrink-0">{lane.label}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${acc.accuracy}%` }} />
                  </div>
                  <span className="font-mono-data text-sm w-16 text-right">{acc.accuracy.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
