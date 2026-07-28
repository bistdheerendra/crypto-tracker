"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { TierPill } from "@/components/ui/TierPill";
import { useBinanceLivePrices } from "@/hooks/useBinanceLivePrices";
import type { TrackRecordStats } from "@/lib/backtest/aggregator";
import { computeExitRMultiple } from "@/lib/journal/pnl";
import {
  isJournalTradeOpen,
  type JournalEntryRow,
  type JournalVerdictSummary,
} from "@/lib/journal/types";
import type { Tier } from "@/lib/types";
import { Loader2 } from "lucide-react";

function outcomeLabel(
  entry: JournalEntryRow,
  verdict: JournalVerdictSummary | null | undefined
): { text: string; className: string } {
  if (entry.exitedAt) {
    return { text: "Exited", className: "text-accent border-accent/30 bg-accent/10" };
  }
  const outcome = verdict?.outcome;
  if (!outcome || outcome === "open") {
    return { text: "Open", className: "text-mixed border-mixed/30 bg-mixed/10" };
  }
  if (outcome === "tp1_hit" || outcome === "tp2_hit") {
    return {
      text: outcome === "tp2_hit" ? "TP2" : "TP1",
      className: "text-bull border-bull/30 bg-bull/10",
    };
  }
  if (outcome === "sl_hit") {
    return { text: "SL", className: "text-bear border-bear/30 bg-bear/10" };
  }
  return {
    text: outcome ?? "—",
    className: "text-text-muted border-white/10 bg-white/5",
  };
}

function formatTakenAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatPrice(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Unrealized P&L — R uses |entry − SL|; usd is P&L for 1 base unit. */
function unrealizedPnl(
  v: JournalVerdictSummary,
  livePrice: number
): { rMultiple: number; pct: number; usdPerUnit: number } | null {
  const rMultiple = computeExitRMultiple(
    v.direction,
    v.entryPrice,
    v.stopLoss,
    livePrice
  );
  if (rMultiple == null) return null;
  const move =
    v.direction === "LONG" ? livePrice - v.entryPrice : v.entryPrice - livePrice;
  const pct = parseFloat(((move / v.entryPrice) * 100).toFixed(2));
  const usdPerUnit = parseFloat(move.toFixed(2));
  return { rMultiple, pct, usdPerUnit };
}

function formatUsdPnl(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n >= 0 ? "+" : "−"}$${abs}`;
}

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntryRow[]>([]);
  const [personalStats, setPersonalStats] = useState<TrackRecordStats | null>(null);
  const [systemStats, setSystemStats] = useState<TrackRecordStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exitingId, setExitingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [journalRes, systemRes] = await Promise.all([
        fetch("/api/journal"),
        fetch("/api/backtest/track-record"),
      ]);

      const journalData = await journalRes.json();
      if (!journalRes.ok) {
        throw new Error(journalData.error ?? "Failed to load journal");
      }
      setEntries(journalData.entries ?? []);
      setPersonalStats(journalData.personalStats ?? null);

      if (systemRes.ok) {
        const sys = await systemRes.json();
        setSystemStats(sys);
      } else {
        setSystemStats(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPairs = useMemo(() => {
    const pairs = new Set<string>();
    for (const e of entries) {
      if (e.verdict && isJournalTradeOpen(e)) {
        pairs.add(e.verdict.pair);
      }
    }
    return [...pairs];
  }, [entries]);

  const { prices, live: pricesLive } = useBinanceLivePrices(openPairs);

  async function handleExit(entry: JournalEntryRow) {
    const v = entry.verdict;
    if (!v || !isJournalTradeOpen(entry)) return;

    const livePrice = prices[v.pair];
    const preview =
      livePrice != null ? unrealizedPnl(v, livePrice) : null;
    const confirmMsg = preview
      ? `Exit ${v.pair} at ~${formatPrice(livePrice!)}?\nBook ${preview.rMultiple >= 0 ? "+" : ""}${preview.rMultiple.toFixed(2)}R (${formatUsdPnl(preview.usdPerUnit)}/unit)`
      : `Exit ${v.pair} at the current market price and book your P&L?`;

    if (!window.confirm(confirmMsg)) return;

    setExitingId(entry.verdictId);
    setError(null);
    try {
      const res = await fetch(`/api/journal/${encodeURIComponent(entry.verdictId)}/exit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          livePrice != null && Number.isFinite(livePrice)
            ? { exitPrice: livePrice }
            : {}
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Exit failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exit failed");
    } finally {
      setExitingId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold mb-1">Verdict Journal</h1>
        <p className="text-text-muted text-sm">
          Personal track record — only verdicts you marked as taken. Separate from the
          system-wide backtest.
        </p>
      </div>

      {error && (
        <GlassCard className="mb-6 border-bear/30 !p-4">
          <p className="text-sm text-bear">{error}</p>
        </GlassCard>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-text-muted text-sm mb-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading journal…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <GlassCard glow="accent">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Your win rate
              </p>
              <p className="font-mono-data text-3xl sm:text-4xl font-bold text-bull">
                {personalStats ? `${personalStats.winRate}%` : "—"}
              </p>
              <p className="text-[10px] text-text-muted mt-1">
                {personalStats
                  ? `${personalStats.resolvedCount} resolved of ${personalStats.totalSignals} taken`
                  : "No taken trades yet"}
              </p>
            </GlassCard>
            <GlassCard>
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Total taken
              </p>
              <p className="font-mono-data text-3xl sm:text-4xl font-bold">
                {personalStats?.totalSignals ?? entries.length}
              </p>
            </GlassCard>
            <GlassCard>
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Avg R (taken)
              </p>
              <p
                className={`font-mono-data text-3xl sm:text-4xl font-bold ${
                  (personalStats?.avgRMultiple ?? 0) >= 0 ? "text-bull" : "text-bear"
                }`}
              >
                {personalStats
                  ? `${personalStats.avgRMultiple >= 0 ? "+" : ""}${personalStats.avgRMultiple}R`
                  : "—"}
              </p>
            </GlassCard>
            <GlassCard>
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
                Resolved
              </p>
              <p className="font-mono-data text-3xl sm:text-4xl font-bold text-accent">
                {personalStats?.resolvedCount ?? 0}
              </p>
            </GlassCard>
          </div>

          {(personalStats || systemStats) && (
            <GlassCard className="mb-8 !p-4">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-3">
                Personal vs system (different populations)
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-lg border border-accent/20 bg-accent/5 p-3">
                  <p className="text-xs text-accent mb-1">Your win rate</p>
                  <p className="font-mono-data text-2xl font-bold text-bull">
                    {personalStats ? `${personalStats.winRate}%` : "—"}
                  </p>
                  <p className="text-[10px] text-text-muted mt-1">
                    n={personalStats?.totalSignals ?? 0} taken
                    {personalStats
                      ? ` · ${personalStats.resolvedCount} resolved`
                      : ""}
                  </p>
                </div>
                <div className="rounded-lg border border-white/8 bg-white/3 p-3">
                  <p className="text-xs text-text-muted mb-1">System win rate</p>
                  <p className="font-mono-data text-2xl font-bold">
                    {systemStats ? `${systemStats.winRate}%` : "—"}
                  </p>
                  <p className="text-[10px] text-text-muted mt-1">
                    n={systemStats?.totalSignals ?? 0} all verdicts
                    {systemStats
                      ? ` · ${systemStats.resolvedCount} resolved`
                      : ""}
                  </p>
                </div>
              </div>
              <p className="text-[10px] text-text-muted mt-3 leading-relaxed">
                These are two different sets: your discretionary picks vs every automated
                verdict. A higher personal rate suggests filtering adds value; it does not
                prove causation.
              </p>
            </GlassCard>
          )}

          <h2 className="text-sm font-semibold mb-3">Taken verdicts</h2>
          {entries.length === 0 ? (
            <GlassCard className="!p-6">
              <p className="text-sm text-text-muted">
                No taken verdicts yet. Run Analyze or Charts, then use{" "}
                <span className="text-accent">Mark as taken</span> on a trade setup.
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const v = entry.verdict;
                const outcome = outcomeLabel(entry, v);
                const open = isJournalTradeOpen(entry);
                const livePrice = v && open ? prices[v.pair] : null;
                const live =
                  v && open && livePrice != null
                    ? unrealizedPnl(v, livePrice)
                    : null;
                const bookedR = entry.exitRMultiple;
                const systemR = !entry.exitedAt ? v?.rMultiple : null;
                const displayR = bookedR ?? systemR;

                return (
                  <GlassCard key={entry.id} className="!p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-mono-data text-sm font-semibold">
                        {v?.pair ?? "Unknown pair"}
                      </span>
                      {v?.direction && (
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-bold font-mono-data ${
                            v.direction === "LONG"
                              ? "bg-bull/15 text-bull border-bull/30"
                              : v.direction === "SHORT"
                                ? "bg-bear/15 text-bear border-bear/30"
                                : "bg-mixed/15 text-mixed border-mixed/30"
                          }`}
                        >
                          {v.direction}
                        </span>
                      )}
                      {v?.tier && <TierPill tier={v.tier as Tier} />}
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono-data ${outcome.className}`}
                      >
                        {outcome.text}
                      </span>
                      {!open && displayR != null && (
                        <span
                          className={`font-mono-data text-xs ${
                            displayR >= 0 ? "text-bull" : "text-bear"
                          }`}
                        >
                          {displayR >= 0 ? "+" : ""}
                          {displayR.toFixed(2)}R
                          {entry.exitedAt ? " booked" : ""}
                        </span>
                      )}
                      {live && (
                        <span
                          className={`font-mono-data text-sm font-semibold inline-block tabular-nums break-words sm:min-w-[28ch] ${
                            live.rMultiple >= 0 ? "text-bull" : "text-bear"
                          }`}
                        >
                          {live.rMultiple >= 0 ? "+" : ""}
                          {live.rMultiple.toFixed(2)}R live
                          <span className="text-text-muted font-normal ml-1">
                            ({live.pct >= 0 ? "+" : ""}
                            {live.pct}%)
                          </span>
                          <span className="ml-1.5">
                            · {formatUsdPnl(live.usdPerUnit)}/unit
                          </span>
                        </span>
                      )}
                      <span className="text-xs text-text-muted sm:ml-auto">
                        Taken {formatTakenAt(entry.takenAt)}
                      </span>
                    </div>
                    {v && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        <div>
                          <p className="text-xs uppercase text-text-muted mb-0.5">Entry</p>
                          <p className="font-mono-data text-base text-bull">
                            {formatPrice(v.entryPrice)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-text-muted mb-0.5">Stop Loss</p>
                          <p className="font-mono-data text-base text-bear">
                            {formatPrice(v.stopLoss)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-text-muted mb-0.5">TP 1</p>
                          <p className="font-mono-data text-base text-bull">
                            {formatPrice(v.takeProfit1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-text-muted mb-0.5">TP 2</p>
                          <p className="font-mono-data text-base text-bull">
                            {formatPrice(v.takeProfit2)}
                          </p>
                        </div>
                      </div>
                    )}
                    {open && livePrice != null && (
                      <p className="text-xs text-text-muted font-mono-data mb-2">
                        <span className="inline-flex items-center gap-1.5">
                          {pricesLive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-dot shrink-0" />
                          )}
                          <span className="shrink-0">Mark</span>
                          <span className="inline-block tabular-nums text-left sm:min-w-[11ch]">
                            {formatPrice(livePrice)}
                          </span>
                          {pricesLive ? (
                            <span className="text-bull uppercase tracking-wider text-[10px] shrink-0">
                              Live
                            </span>
                          ) : (
                            <span className="text-text-muted/60 text-[10px] shrink-0">
                              Connecting…
                            </span>
                          )}
                        </span>
                        {live && (
                          <span
                            className={`ml-2 font-semibold inline-block tabular-nums break-words sm:min-w-[22ch] ${
                              live.rMultiple >= 0 ? "text-bull" : "text-bear"
                            }`}
                          >
                            · unrealized {live.rMultiple >= 0 ? "+" : ""}
                            {live.rMultiple.toFixed(2)}R ({live.pct >= 0 ? "+" : ""}
                            {live.pct}%) · {formatUsdPnl(live.usdPerUnit)} / 1 unit
                          </span>
                        )}
                      </p>
                    )}
                    {entry.exitedAt && entry.exitPrice != null && (
                      <p className="text-xs text-text-muted font-mono-data mb-2">
                        Exited {formatTakenAt(entry.exitedAt)} @{" "}
                        {formatPrice(entry.exitPrice)}
                        {entry.exitRMultiple != null && (
                          <span
                            className={`ml-1 font-semibold ${
                              entry.exitRMultiple >= 0 ? "text-bull" : "text-bear"
                            }`}
                          >
                            · {entry.exitRMultiple >= 0 ? "+" : ""}
                            {entry.exitRMultiple.toFixed(2)}R booked
                          </span>
                        )}
                      </p>
                    )}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {entry.note ? (
                          <p className="text-sm text-text-muted leading-relaxed">
                            <span className="uppercase text-text-muted/80 font-semibold tracking-wide">
                              Note :{" "}
                            </span>
                            {entry.note}
                          </p>
                        ) : (
                          <p className="text-xs text-text-muted/60 italic">
                            <span className="uppercase text-text-muted/80 font-semibold tracking-wide not-italic">
                              Note :{" "}
                            </span>
                            No note
                          </p>
                        )}
                      </div>
                      {open && (
                        <button
                          type="button"
                          onClick={() => void handleExit(entry)}
                          disabled={exitingId === entry.verdictId}
                          className="shrink-0 min-h-11 px-3 py-1.5 rounded-lg border border-bear/40 bg-bear/10 text-bear text-xs font-semibold hover:bg-bear/20 transition-colors disabled:opacity-50"
                          title="Book P&L at the current market price without waiting for SL/TP"
                        >
                          {exitingId === entry.verdictId ? "Exiting…" : "Exit trade"}
                        </button>
                      )}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
