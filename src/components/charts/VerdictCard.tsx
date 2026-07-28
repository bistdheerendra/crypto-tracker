"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { BiasPill } from "@/components/ui/BiasPill";
import { TierPill } from "@/components/ui/TierPill";
import { MlEdgeBadge } from "@/components/ui/MlEdgeBadge";
import { JournalTakenControl } from "@/components/journal/JournalTakenControl";
import { intervalToApiTimeframe } from "@/lib/tradingview";
import type { LaneOutput, Verdict } from "@/lib/types";
import type { ChartLevels } from "@/components/charts/LiveCandleChart";

interface MlEdgePayload {
  winProbability: number;
  modelVersion: string;
}

interface StructurePayload {
  supports: number[];
  resistances: number[];
  swingLow: number;
  swingHigh: number;
}

export interface ChartAnalysisResult {
  verdict: Verdict | null;
  levels: ChartLevels | null;
}

interface VerdictCardProps {
  pair: string;
  interval: string;
  /** Live price from chart WebSocket (preferred over REST poll). */
  livePrice?: number | null;
  onAnalysisChange?: (result: ChartAnalysisResult) => void;
}

const badgeColors: Record<string, string> = {
  T: "bg-accent/20 text-accent border-accent/30",
  F: "bg-bull/20 text-bull border-bull/30",
  N: "bg-mixed/20 text-mixed border-mixed/30",
  M: "bg-bear/20 text-bear border-bear/30",
};

function levelsFromAnalysis(
  verdict: Verdict | null,
  structure: StructurePayload | null
): ChartLevels | null {
  const supports = structure?.supports ?? [];
  const resistances = structure?.resistances ?? [];
  const hasStructure = supports.length > 0 || resistances.length > 0;
  const hasTrade = verdict != null && verdict.direction !== "NEUTRAL";

  if (!hasTrade && !hasStructure) return null;

  return {
    ...(hasTrade
      ? {
          entry: verdict.entry,
          stopLoss: verdict.stopLoss,
          takeProfit1: verdict.takeProfit1,
          takeProfit2: verdict.takeProfit2,
        }
      : {}),
    supports,
    resistances,
  };
}

export function VerdictCard({
  pair,
  interval,
  livePrice = null,
  onAnalysisChange,
}: VerdictCardProps) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [verdictId, setVerdictId] = useState<string | null>(null);
  const [lanes, setLanes] = useState<LaneOutput[]>([]);
  const [structure, setStructure] = useState<StructurePayload | null>(null);
  const [mlEdge, setMlEdge] = useState<MlEdgePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | null>(null);
  const prevPriceRef = useRef<number | null>(null);
  const onAnalysisChangeRef = useRef(onAnalysisChange);
  const requestIdRef = useRef(0);

  useEffect(() => {
    onAnalysisChangeRef.current = onAnalysisChange;
  }, [onAnalysisChange]);

  // Reset results when pair/timeframe changes — require a fresh Analyzer click.
  useEffect(() => {
    requestIdRef.current += 1;
    setVerdict(null);
    setVerdictId(null);
    setLanes([]);
    setStructure(null);
    setMlEdge(null);
    setError(null);
    setLoading(false);
    setHasAnalyzed(false);
    onAnalysisChangeRef.current?.({ verdict: null, levels: null });
  }, [pair, interval]);

  const runAnalysis = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setMlEdge(null);
    setVerdictId(null);
    setHasAnalyzed(false);

    const timeframe = intervalToApiTimeframe(interval);

    try {
      const res = await fetch(
        `/api/analyze?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`
      );
      const data = await res.json();
      if (requestId !== requestIdRef.current) return;

      if (!res.ok) {
        setVerdict(null);
        setVerdictId(null);
        setLanes([]);
        setStructure(null);
        setMlEdge(null);
        setHasAnalyzed(true);
        setError(data.error ?? "Analysis failed.");
        onAnalysisChangeRef.current?.({ verdict: null, levels: null });
        return;
      }

      const next = (data.verdict as Verdict | undefined) ?? null;
      const nextLanes = (data.lanes as LaneOutput[] | undefined) ?? [];
      const nextStructure = (data.structure as StructurePayload | undefined) ?? null;
      const edge = data.mlEdge as MlEdgePayload | null | undefined;
      const nextId =
        typeof data.verdictId === "string" && data.verdictId.trim()
          ? data.verdictId.trim()
          : null;

      setVerdict(next);
      setVerdictId(nextId);
      setLanes(nextLanes);
      setStructure(nextStructure);
      setHasAnalyzed(true);
      setMlEdge(
        edge &&
          typeof edge.winProbability === "number" &&
          Number.isFinite(edge.winProbability)
          ? edge
          : null
      );
      onAnalysisChangeRef.current?.({
        verdict: next,
        levels: levelsFromAnalysis(next, nextStructure),
      });
    } catch {
      if (requestId !== requestIdRef.current) return;
      setVerdict(null);
      setVerdictId(null);
      setLanes([]);
      setStructure(null);
      setMlEdge(null);
      setHasAnalyzed(true);
      setError("Could not reach analysis service.");
      onAnalysisChangeRef.current?.({ verdict: null, levels: null });
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
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

  const isNeutral = verdict?.direction === "NEUTRAL";
  const hasTrade = verdict != null && !isNeutral;

  return (
    <GlassCard
      glow="accent"
      className="h-full min-h-0 flex flex-col overflow-hidden !p-0"
    >
      <div className="shrink-0 px-5 pt-5 pb-4 border-b border-white/8">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-xs tracking-[0.3em] text-accent uppercase">Chart Analyzer</p>
          <button
            type="button"
            onClick={() => void runAnalysis()}
            disabled={loading}
            className="px-3 py-1.5 bg-accent text-bg-primary rounded-lg text-xs font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyzer"}
          </button>
        </div>

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

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
        {loading && (
          <div className="space-y-3 mb-4">
            <div className="skeleton h-24" />
            <div className="skeleton h-32" />
          </div>
        )}

        {!loading && !hasAnalyzed && (
          <div className="rounded-lg border border-white/8 bg-white/3 p-4">
            <p className="text-sm font-semibold text-text-primary mb-1">Ready to analyze</p>
            <p className="text-xs text-text-muted leading-relaxed">
              Click <span className="text-accent font-semibold">Analyzer</span> to mark support /
              resistance, build the trade setup, and score Technical · Flow · Narrative · Macro.
            </p>
          </div>
        )}

        {error && <p className="text-sm text-bear mb-4">{error}</p>}

        {!loading && hasAnalyzed && verdict && (
          <div className="relative isolate mb-4">
            <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Trade Setup</p>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="font-mono-data text-sm font-semibold">
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
              {isNeutral && (
                <span className="px-2.5 py-0.5 rounded border border-mixed/30 bg-mixed/10 text-mixed text-xs font-bold font-mono-data">
                  WAIT
                </span>
              )}
              {mlEdge != null && <MlEdgeBadge winProbability={mlEdge.winProbability} />}
            </div>
            <p className="text-xs text-text-muted mb-3">{verdict.alignment}</p>

            {isNeutral ? (
              <div className="rounded-lg border border-mixed/30 bg-mixed/10 p-3 mb-4">
                <p className="text-sm font-semibold text-mixed mb-1">No trade yet — wait</p>
                <p className="text-xs text-text-muted leading-relaxed">
                  Lanes are not aligned for a clear LONG or SHORT. Support and resistance are
                  marked on the chart — wait for price reaction and lane consensus before sizing.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-accent/25 bg-accent/5 p-3 mb-4">
                  <p className="text-sm font-semibold text-accent mb-1">
                    Trade forms here · {verdict.direction}
                  </p>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Enter near $
                    {verdict.entry.toLocaleString(undefined, { maximumFractionDigits: 2 })} with
                    SL $
                    {verdict.stopLoss.toLocaleString(undefined, { maximumFractionDigits: 2 })} and
                    targets at TP1 / TP2. Levels are drawn on the chart.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-4 mb-4">
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
                      $
                      {verdict.takeProfit1.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-text-muted mb-1">TP 2</p>
                    <p className="font-mono-data text-lg text-bull">
                      $
                      {verdict.takeProfit2.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>
              </>
            )}

            {(structure?.supports.length || structure?.resistances.length) ? (
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-[10px] uppercase text-text-muted mb-1">Supports</p>
                  <ul className="space-y-0.5">
                    {(structure?.supports ?? []).map((level) => (
                      <li key={`s-${level}`} className="font-mono-data text-xs text-bull">
                        ${level.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </li>
                    ))}
                    {(structure?.supports.length ?? 0) === 0 && (
                      <li className="text-xs text-text-muted">—</li>
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-text-muted mb-1">Resistances</p>
                  <ul className="space-y-0.5">
                    {(structure?.resistances ?? []).map((level) => (
                      <li
                        key={`r-${level}`}
                        className="font-mono-data text-xs text-[#ff8a5c]"
                      >
                        ${level.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </li>
                    ))}
                    {(structure?.resistances.length ?? 0) === 0 && (
                      <li className="text-xs text-text-muted">—</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : null}

            <p className="text-sm text-text-muted mb-2">{verdict.rationale}</p>
            {hasTrade && (
              <p className="text-xs text-accent font-mono-data">
                Risk:Reward {verdict.riskReward}
              </p>
            )}
            {hasTrade && <JournalTakenControl verdictId={verdictId} />}
          </div>
        )}

        {!loading && hasAnalyzed && lanes.length > 0 && (
          <div className="pt-4 border-t border-white/8">
            <p className="text-xs tracking-[0.3em] text-text-muted uppercase mb-3">
              Technical · Flow · Narrative · Macro
            </p>
            <div className="grid grid-cols-2 gap-2">
              {lanes.map((lane) => (
                <div
                  key={lane.lane}
                  className="rounded-lg border border-white/8 bg-white/3 p-2.5"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold ${badgeColors[lane.badge]}`}
                    >
                      {lane.badge}
                    </div>
                    <h3 className="font-semibold text-xs">{lane.lane}</h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <BiasPill bias={lane.bias} />
                    <TierPill tier={lane.tier} />
                  </div>
                  <ul className="space-y-0.5">
                    {lane.reasoning.slice(0, 2).map((r, j) => (
                      <li
                        key={j}
                        className="text-[10px] text-text-muted font-mono-data leading-snug"
                      >
                        › {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
