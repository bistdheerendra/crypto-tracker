"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
import type { PositionRow, SignalHint } from "@/lib/portfolio/types";

type PositionForm = {
  assetSymbol: string;
  amount: string;
  avgEntryPrice: string;
  positionType: "spot" | "long" | "short";
  leverage: string;
  entryDate: string;
};

const EMPTY_FORM: PositionForm = {
  assetSymbol: TRACKED_PAIRS[0],
  amount: "",
  avgEntryPrice: "",
  positionType: "spot",
  leverage: "",
  entryDate: "",
};

type MarketQuote = { price: number | null; change24hPct: number | null };

function alignmentFor(
  positionType: string,
  signal: SignalHint | undefined
): "aligned" | "conflicting" | "none" {
  if (!signal || signal.direction === "NEUTRAL") return "none";
  const bullishPos = positionType === "spot" || positionType === "long";
  const bearishPos = positionType === "short";
  if (bullishPos && signal.direction === "LONG") return "aligned";
  if (bearishPos && signal.direction === "SHORT") return "aligned";
  if (bullishPos && signal.direction === "SHORT") return "conflicting";
  if (bearishPos && signal.direction === "LONG") return "conflicting";
  return "none";
}

function AlignmentPill({ kind }: { kind: "aligned" | "conflicting" | "none" }) {
  if (kind === "aligned") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono-data border border-bull/30 bg-bull/15 text-bull">
        ✅ Aligned
      </span>
    );
  }
  if (kind === "conflicting") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono-data border border-bear/30 bg-bear/15 text-bear">
        ⚠️ Conflicting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono-data border border-white/10 bg-white/5 text-text-muted">
      — No active signal
    </span>
  );
}

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}

function unrealizedPnL(
  position: PositionRow,
  price: number
): number {
  const lev = position.leverage && position.leverage > 0 ? position.leverage : 1;
  const delta = price - position.avgEntryPrice;
  if (position.positionType === "short") {
    return -delta * position.amount * lev;
  }
  return delta * position.amount * lev;
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [signals, setSignals] = useState<Record<string, SignalHint>>({});
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PositionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadPositions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio");
      const text = await res.text();
      let data: {
        error?: string;
        positions?: PositionRow[];
        signals?: Record<string, SignalHint>;
      } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Invalid response from portfolio API"
            : `Portfolio API error (${res.status})`
        );
      }
      if (!res.ok) throw new Error(data.error ?? "Failed to load portfolio");
      setPositions(data.positions ?? []);
      setSignals(data.signals ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPositions();
  }, [loadPositions]);

  useEffect(() => {
    const symbols = [...new Set(positions.map((p) => p.assetSymbol))];
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }
    let cancelled = false;
    Promise.all(
      symbols.map((symbol) =>
        fetch(`/api/market?symbol=${encodeURIComponent(symbol)}`)
          .then((r) => r.json())
          .then((d) =>
            [
              symbol,
              {
                price: typeof d.price === "number" ? d.price : null,
                change24hPct:
                  typeof d.change24hPct === "number" ? d.change24hPct : null,
              } satisfies MarketQuote,
            ] as const
          )
          .catch(
            () =>
              [symbol, { price: null, change24hPct: null } as MarketQuote] as const
          )
      )
    ).then((rows) => {
      if (!cancelled) setQuotes(Object.fromEntries(rows));
    });
    return () => {
      cancelled = true;
    };
  }, [positions]);

  const summary = (() => {
    let totalValue = 0;
    let change24hUsd = 0;
    let alignedValue = 0;
    let conflictingValue = 0;
    let bullAlignedValue = 0;
    let bearAlignedValue = 0;

    for (const p of positions) {
      const price = quotes[p.assetSymbol]?.price;
      const changePct = quotes[p.assetSymbol]?.change24hPct;
      if (price == null) continue;
      const value = p.amount * price;
      totalValue += value;

      if (changePct != null) {
        const sign = p.positionType === "short" ? -1 : 1;
        change24hUsd += value * (changePct / 100) * sign;
      }

      const align = alignmentFor(p.positionType, signals[p.assetSymbol]);
      if (align === "aligned") {
        alignedValue += value;
        if (p.positionType === "short") bearAlignedValue += value;
        else bullAlignedValue += value;
      } else if (align === "conflicting") {
        conflictingValue += value;
      }
    }

    const alignedPct = totalValue > 0 ? (alignedValue / totalValue) * 100 : 0;
    const bullPct = totalValue > 0 ? (bullAlignedValue / totalValue) * 100 : 0;
    const bearPct = totalValue > 0 ? (bearAlignedValue / totalValue) * 100 : 0;

    return {
      totalValue,
      change24hUsd,
      change24hPct: totalValue > 0 ? (change24hUsd / totalValue) * 100 : 0,
      alignedPct,
      conflictingPct: totalValue > 0 ? (conflictingValue / totalValue) * 100 : 0,
      bullPct,
      bearPct,
    };
  })();

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(p: PositionRow) {
    setEditingId(p.id);
    setForm({
      assetSymbol: p.assetSymbol,
      amount: String(p.amount),
      avgEntryPrice: String(p.avgEntryPrice),
      positionType: p.positionType as PositionForm["positionType"],
      leverage: p.leverage != null ? String(p.leverage) : "",
      entryDate: p.entryDate ? p.entryDate.slice(0, 10) : "",
    });
    setModalOpen(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(editingId ? { id: editingId } : {}),
        assetSymbol: form.assetSymbol,
        amount: Number(form.amount),
        avgEntryPrice: Number(form.avgEntryPrice),
        positionType: form.positionType,
        leverage: form.leverage === "" ? null : Number(form.leverage),
        entryDate: form.entryDate === "" ? null : form.entryDate,
      };
      const res = await fetch("/api/portfolio", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setModalOpen(false);
      await loadPositions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removePosition(id: string) {
    if (!confirm("Remove this position?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/portfolio?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await loadPositions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Portfolio</h1>
          <p className="text-text-muted text-sm">
            Track holdings alongside DeepCurrent signal alignment.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Position
        </button>
      </div>

      {error && (
        <GlassCard className="mb-4 !p-3">
          <p className="text-sm text-bear">{error}</p>
        </GlassCard>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
            Total value
          </p>
          <p className="font-mono-data text-2xl sm:text-3xl font-bold">
            {loading ? "—" : formatUsd(summary.totalValue)}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
            24h change
          </p>
          <p
            className={`font-mono-data text-2xl sm:text-3xl font-bold ${
              summary.change24hUsd >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {loading
              ? "—"
              : `${summary.change24hUsd >= 0 ? "+" : ""}${formatUsd(summary.change24hUsd)}`}
          </p>
          <p
            className={`font-mono-data text-xs mt-1 ${
              summary.change24hPct >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {loading
              ? ""
              : `${summary.change24hPct >= 0 ? "+" : ""}${summary.change24hPct.toFixed(2)}%`}
          </p>
        </GlassCard>
        <GlassCard glow="accent">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
            Signal alignment
          </p>
          <p className="text-sm text-text-muted mb-2">
            Portfolio value aligned with current signals
          </p>
          <p className="font-mono-data text-xl font-bold text-accent">
            {loading ? "—" : `${summary.alignedPct.toFixed(0)}% aligned`}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-mono-data">
            <span className="text-bull">Bullish {summary.bullPct.toFixed(0)}%</span>
            <span className="text-bear">Bearish {summary.bearPct.toFixed(0)}%</span>
            <span className="text-text-muted">
              Conflict {summary.conflictingPct.toFixed(0)}%
            </span>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-text-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading positions…
            </div>
          ) : (
            <table className="w-full text-sm min-w-[880px]">
              <thead>
                <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                  <th className="text-left py-3 px-4">Asset</th>
                  <th className="text-left py-3 px-4">Type</th>
                  <th className="text-right py-3 px-4">Amount</th>
                  <th className="text-right py-3 px-4">Entry</th>
                  <th className="text-right py-3 px-4">Price</th>
                  <th className="text-right py-3 px-4">Value</th>
                  <th className="text-right py-3 px-4">Unrealized</th>
                  <th className="text-left py-3 px-4">Signal</th>
                  <th className="text-right py-3 px-4"> </th>
                </tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 px-4 text-center text-text-muted">
                      No positions yet. Add one to start tracking.
                    </td>
                  </tr>
                ) : (
                  positions.map((p) => {
                    const price = quotes[p.assetSymbol]?.price ?? null;
                    const value = price != null ? p.amount * price : null;
                    const pnl = price != null ? unrealizedPnL(p, price) : null;
                    const align = alignmentFor(p.positionType, signals[p.assetSymbol]);
                    return (
                      <tr key={p.id} className="border-t border-white/5 hover:bg-white/3">
                        <td className="py-3 px-4 font-mono-data font-semibold">
                          {p.assetSymbol}
                        </td>
                        <td className="py-3 px-4 capitalize text-text-muted">
                          {p.positionType}
                          {p.leverage != null ? (
                            <span className="font-mono-data text-xs ml-1">
                              {p.leverage}x
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right">
                          {p.amount}
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right">
                          {formatUsd(p.avgEntryPrice)}
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right">
                          {price != null ? formatUsd(price) : "—"}
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right">
                          {value != null ? formatUsd(value) : "—"}
                        </td>
                        <td
                          className={`py-3 px-4 font-mono-data text-right font-semibold ${
                            pnl == null
                              ? "text-text-muted"
                              : pnl >= 0
                                ? "text-bull"
                                : "text-bear"
                          }`}
                        >
                          {pnl == null
                            ? "—"
                            : `${pnl >= 0 ? "+" : ""}${formatUsd(pnl)}`}
                        </td>
                        <td className="py-3 px-4">
                          <AlignmentPill kind={align} />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-white/5"
                              aria-label="Edit position"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removePosition(p.id)}
                              className="p-2 rounded-lg text-text-muted hover:text-bear hover:bg-bear/5"
                              aria-label="Delete position"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setModalOpen(false)}
            aria-label="Close modal"
          />
          <div className="relative w-full sm:max-w-md bg-[#0d1224] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingId ? "Edit position" : "Add position"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void submitForm(e)} className="space-y-4">
              <label className="block text-sm">
                <span className="text-text-muted text-xs uppercase tracking-wider">
                  Asset
                </span>
                <select
                  value={form.assetSymbol}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, assetSymbol: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                  required
                >
                  {TRACKED_PAIRS.map((pair) => (
                    <option key={pair} value={pair}>
                      {pair}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-text-muted text-xs uppercase tracking-wider">
                    Amount
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono-data"
                    required
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-text-muted text-xs uppercase tracking-wider">
                    Avg entry
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.avgEntryPrice}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, avgEntryPrice: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono-data"
                    required
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-text-muted text-xs uppercase tracking-wider">
                  Position type
                </span>
                <select
                  value={form.positionType}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      positionType: e.target.value as PositionForm["positionType"],
                    }))
                  }
                  className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                >
                  <option value="spot">Spot</option>
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-text-muted text-xs uppercase tracking-wider">
                    Leverage (optional)
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.leverage}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, leverage: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono-data"
                    placeholder="1"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-text-muted text-xs uppercase tracking-wider">
                    Entry date (optional)
                  </span>
                  <input
                    type="date"
                    value={form.entryDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, entryDate: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? "Save changes" : "Add position"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
