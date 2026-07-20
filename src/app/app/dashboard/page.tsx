"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { BiasPill } from "@/components/ui/BiasPill";
import { TierPill } from "@/components/ui/TierPill";
import { MOCK_NEWS } from "@/lib/mock-data";
import type { Verdict } from "@/lib/types";

const DASHBOARD_PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;

export default function DashboardPage() {
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});

  useEffect(() => {
    Promise.all(
      DASHBOARD_PAIRS.map((pair) =>
        fetch(`/api/market?symbol=${encodeURIComponent(pair)}`)
          .then((r) => r.json())
          .then((d) => [pair, d.price as number] as const)
          .catch(() => [pair, null] as const)
      )
    ).then((results) => {
      setPrices(Object.fromEntries(results));
    });

    Promise.all(
      DASHBOARD_PAIRS.map((pair) =>
        fetch(`/api/analyze?pair=${encodeURIComponent(pair)}&timeframe=1h`)
          .then((r) => r.json())
          .then((d) => d.verdict as Verdict)
          .catch(() => null)
      )
    ).then((results) => {
      setVerdicts(results.filter((v): v is Verdict => v !== null));
    });
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-text-muted text-sm">Live market intelligence at a glance.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {DASHBOARD_PAIRS.map((pair) => (
          <GlassCard key={pair}>
            <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{pair}</p>
            <p className="font-mono-data text-2xl sm:text-3xl font-bold">
              {prices[pair] != null
                ? `$${prices[pair]!.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                : "—"}
            </p>
          </GlassCard>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-6 mb-8">
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Active Signals</p>
          <p className="font-mono-data text-2xl sm:text-3xl font-bold text-accent">{verdicts.length}</p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Watchlist</p>
          <p className="font-mono-data text-2xl sm:text-3xl font-bold">5 pairs</p>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-4">Latest Verdicts</h2>
          {verdicts.map((v) => (
            <GlassCard key={v.pair} className="mb-3" glow="accent">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                <span className="font-mono-data font-semibold text-sm sm:text-base">{v.pair} · {v.timeframe}</span>
                <TierPill tier={v.tier} />
                <span className={`font-mono-data text-sm font-bold ${v.direction === "LONG" ? "text-bull" : v.direction === "SHORT" ? "text-bear" : "text-mixed"}`}>
                  {v.direction}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-data">
                <div><span className="text-text-muted">Entry </span><span className="text-bull">${v.entry.toFixed(0)}</span></div>
                <div><span className="text-text-muted">SL </span><span className="text-bear">${v.stopLoss.toFixed(0)}</span></div>
                <div><span className="text-text-muted">TP1 </span><span className="text-bull">${v.takeProfit1.toFixed(0)}</span></div>
                <div><span className="text-text-muted">R:R </span><span className="text-accent">{v.riskReward}</span></div>
              </div>
            </GlassCard>
          ))}
          {verdicts.length === 0 && (
            <>
              {DASHBOARD_PAIRS.map((pair) => (
                <GlassCard key={pair} className="mb-3">
                  <p className="text-text-muted text-sm skeleton h-20" />
                </GlassCard>
              ))}
            </>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4">Live News Feed</h2>
          <div className="space-y-2">
            {MOCK_NEWS.slice(0, 4).map((item) => (
              <GlassCard key={item.id} className="!p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-text-muted font-mono-data">{item.location} · {item.timeAgo}</span>
                  <BiasPill bias={item.sentiment === "bullish" ? "BULL" : item.sentiment === "bearish" ? "BEAR" : "MIXED"} />
                </div>
                <p className="text-sm">{item.headline}</p>
              </GlassCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
