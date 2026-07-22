"use client";

import { useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CoinIcon, pairBaseSymbol } from "@/components/ui/CoinIcon";
import { BiasPill } from "@/components/ui/BiasPill";
import { TierPill } from "@/components/ui/TierPill";
import { useRadarFeed } from "@/components/radar/useRadarFeed";
import type { NewsItem, Verdict } from "@/lib/types";

import { DASHBOARD_PAIRS, TRACKED_PAIRS, TRACKED_TIMEFRAMES } from "@/lib/market/constants";

export default function DashboardPage() {
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [loadingVerdicts, setLoadingVerdicts] = useState(true);
  const {
    data: news,
    loading: loadingNews,
    error: newsError,
  } = useRadarFeed<NewsItem>("news", 60_000);

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
  }, []);

  useEffect(() => {
    setLoadingVerdicts(true);
    Promise.all(
      DASHBOARD_PAIRS.map((pair) =>
        fetch(`/api/analyze?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`)
          .then((r) => r.json())
          .then((d) => d.verdict as Verdict)
          .catch(() => null)
      )
    ).then((results) => {
      setVerdicts(results.filter((v): v is Verdict => v !== null));
      setLoadingVerdicts(false);
    });
  }, [timeframe]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-text-muted text-sm">Live market intelligence at a glance.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        {DASHBOARD_PAIRS.map((pair) => (
          <GlassCard key={pair}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-text-muted uppercase tracking-wider mb-2">{pair}</p>
                <p className="font-mono-data text-2xl sm:text-3xl font-bold">
                  {prices[pair] != null
                    ? `$${prices[pair]!.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : "—"}
                </p>
              </div>
              <CoinIcon symbol={pairBaseSymbol(pair)} size={40} className="ring-1 ring-white/10" />
            </div>
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
          <p className="font-mono-data text-2xl sm:text-3xl font-bold">{TRACKED_PAIRS.length} pairs</p>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold">Latest Verdicts</h2>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {TRACKED_TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono-data whitespace-nowrap transition-colors ${
                    timeframe === tf
                      ? "bg-accent/15 text-accent border border-accent/30"
                      : "text-text-muted hover:text-text-primary bg-white/5 border border-transparent"
                  }`}
                >
                  {tf === "1d" ? "1D" : tf}
                </button>
              ))}
            </div>
          </div>
          {loadingVerdicts && (
            <>
              {DASHBOARD_PAIRS.map((pair) => (
                <GlassCard key={pair} className="mb-3">
                  <p className="text-text-muted text-sm skeleton h-20" />
                </GlassCard>
              ))}
            </>
          )}
          {!loadingVerdicts && verdicts.map((v) => (
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
          {!loadingVerdicts && verdicts.length === 0 && (
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Live News Feed</h2>
            <span className="text-xs text-text-muted">Updates every 60s</span>
          </div>
          {newsError && (
            <GlassCard className="mb-3 !p-3">
              <p className="text-sm text-bear">{newsError}</p>
            </GlassCard>
          )}
          <div className="max-h-[400px] overflow-y-auto space-y-2 pr-1">
            {loadingNews && (
              <GlassCard className="!p-3">
                <p className="text-sm text-text-muted skeleton h-16" />
              </GlassCard>
            )}
            {!loadingNews && news.length === 0 && !newsError && (
              <GlassCard className="!p-3">
                <p className="text-sm text-text-muted">No news available right now.</p>
              </GlassCard>
            )}
            {news.map((item) => (
              <GlassCard key={item.id} className="!p-3 !rounded-none">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs text-text-muted font-mono-data">{item.location} · {item.timeAgo}</span>
                  <BiasPill bias={item.sentiment === "bullish" ? "BULL" : item.sentiment === "bearish" ? "BEAR" : "MIXED"} />
                  <span className="text-[10px] uppercase tracking-wider text-accent ml-auto">{item.source}</span>
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
