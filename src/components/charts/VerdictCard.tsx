"use client";

import { useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { TierPill } from "@/components/ui/TierPill";
import { MlEdgeBadge } from "@/components/ui/MlEdgeBadge";
import { intervalToApiTimeframe } from "@/lib/tradingview";
import type { Verdict } from "@/lib/types";

interface MlEdgePayload {
  winProbability: number;
  modelVersion: string;
}

interface VerdictCardProps {
  pair: string;
  interval: string;
  /** Live price from chart WebSocket (preferred over REST poll). */
  livePrice?: number | null;
  onVerdictChange?: (verdict: Verdict | null) => void;
}

export function VerdictCard({
  pair,
  interval,
  livePrice = null,
  onVerdictChange,
}: VerdictCardProps) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [mlEdge, setMlEdge] = useState<MlEdgePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const onVerdictChangeRef = useRef(onVerdictChange);

  useEffect(() => {
    onVerdictChangeRef.current = onVerdictChange;
  }, [onVerdictChange]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMlEdge(null);
    const timeframe = intervalToApiTimeframe(interval);

    fetch(`/api/analyze?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const next = (d.verdict as Verdict | undefined) ?? null;
        setVerdict(next);
        onVerdictChangeRef.current?.(next);
        const edge = d.mlEdge as MlEdgePayload | null | undefined;
        if (
          edge &&
          typeof edge.winProbability === "number" &&
          Number.isFinite(edge.winProbability)
        ) {
          setMlEdge(edge);
        } else {
          setMlEdge(null);
        }
      })
      .catch(() => {
        if (!active) return;
        setVerdict(null);
        setMlEdge(null);
        onVerdictChangeRef.current?.(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [pair, interval]);

  useEffect(() => {
    if (livePrice == null) return;

    const prev = prevPriceRef.current;
    if (prev !== null && livePrice !== prev) {
      setPriceFlash(livePrice > prev ? "up" : "down");
      const timer = setTimeout(() => setPriceFlash(null), 600);
      prevPriceRef.current = livePrice;
      return () => clearTimeout(timer);
    }

    prevPriceRef.current = livePrice;
  }, [livePrice]);

  if (loading) {
    return (
      <GlassCard className="h-full">
        <div className="skeleton h-48" />
      </GlassCard>
    );
  }

  if (!verdict) {
    return (
      <GlassCard>
        <p className="text-sm text-text-muted">Unable to load verdict for {pair}.</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard glow="accent" className="h-full">
      <div className="mb-4 pb-4 border-b border-white/8">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-text-muted uppercase tracking-wider">Current Price</p>
          {livePrice != null ? (
            <span className="flex items-center gap-1.5 text-[10px] text-bull uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-dot" />
              Live
            </span>
          ) : (
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Syncing</span>
          )}
        </div>
        <p
          className={`font-mono-data text-2xl sm:text-3xl font-bold transition-colors duration-300 ${
            priceFlash === "up" ? "text-bull" : priceFlash === "down" ? "text-bear" : "text-text-primary"
          }`}
        >
          {livePrice != null
            ? `$${livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : "—"}
        </p>
        <p className="text-xs text-text-muted font-mono-data mt-1">{pair}</p>
      </div>

      <p className="text-xs tracking-[0.3em] text-accent uppercase mb-4">Synthesized Verdict</p>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="font-mono-data text-base font-semibold">
          {verdict.pair} · {verdict.timeframe}
        </span>
        <TierPill tier={verdict.tier} />
        <span
          className={`px-2.5 py-0.5 rounded border text-xs font-bold font-mono-data ${
            verdict.direction === "LONG"
              ? "bg-bull/15 text-bull border-bull/30"
              : verdict.direction === "SHORT"
                ? "bg-bear/15 text-bear border-bear/30"
                : "bg-mixed/15 text-mixed border-mixed/30"
          }`}
        >
          {verdict.direction}
        </span>
        {mlEdge != null && <MlEdgeBadge winProbability={mlEdge.winProbability} />}
      </div>
      <p className="text-xs text-text-muted mb-4">{verdict.alignment}</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-[10px] uppercase text-text-muted mb-1">Entry</p>
          <p className="font-mono-data text-lg text-bull">
            ${verdict.entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-text-muted mb-1">Stop Loss</p>
          <p className="font-mono-data text-lg text-bear">
            ${verdict.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-text-muted mb-1">TP 1</p>
          <p className="font-mono-data text-lg text-bull">
            ${verdict.takeProfit1.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-text-muted mb-1">TP 2</p>
          <p className="font-mono-data text-lg text-bull">
            ${verdict.takeProfit2.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <p className="text-sm text-text-muted mb-2">{verdict.rationale}</p>
      <p className="text-xs text-accent font-mono-data">Risk:Reward {verdict.riskReward}</p>
    </GlassCard>
  );
}
