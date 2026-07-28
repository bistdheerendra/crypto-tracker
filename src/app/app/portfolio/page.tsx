"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { CoinIcon, pairBaseSymbol } from "@/components/ui/CoinIcon";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import { Loader2, Plus, Pencil, Trash2, X } from "lucide-react";
import type { PaperWallet, PositionRow, SignalHint } from "@/lib/portfolio/types";

type PositionForm = {
  assetSymbol: string;
  usdAmount: string;
  amount: string; // edit-only
  avgEntryPrice: string; // edit-only
  stopLoss: string;
  takeProfit: string;
  positionType: "spot" | "long" | "short";
  leverage: string;
  entryDate: string;
};

const EMPTY_FORM: PositionForm = {
  assetSymbol: TRACKED_PAIRS[0],
  usdAmount: "",
  amount: "",
  avgEntryPrice: "",
  stopLoss: "",
  takeProfit: "",
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

function formatAmount(n: number): string {
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumSignificantDigits: 6 });
}

function openAmount(position: PositionRow): number {
  return Math.max(position.amount - position.closedAmount, 0);
}

function isOpen(position: PositionRow): boolean {
  return position.status !== "closed" && openAmount(position) > 0;
}

function unrealizedPnL(position: PositionRow, price: number): number {
  const qty = openAmount(position);
  const delta = price - position.avgEntryPrice;
  return position.positionType === "short" ? -delta * qty : delta * qty;
}

function StatusPill({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono-data border ${
        open
          ? "border-bull/30 bg-bull/15 text-bull"
          : "border-white/15 bg-white/5 text-text-muted"
      }`}
    >
      {open ? "Open" : "Closed"}
    </span>
  );
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [signals, setSignals] = useState<Record<string, SignalHint>>({});
  const [wallet, setWallet] = useState<PaperWallet | null>(null);
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PositionForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [closeTarget, setCloseTarget] = useState<PositionRow | null>(null);
  const [closePercent, setClosePercent] = useState("100");
  const [closeQty, setCloseQty] = useState("");
  const [closing, setClosing] = useState(false);

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
        wallet?: PaperWallet;
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
      setWallet(data.wallet ?? null);
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
    const symbols = [
      ...new Set([
        ...positions.map((p) => p.assetSymbol),
        ...(modalOpen && !editingId ? [form.assetSymbol] : []),
      ]),
    ];
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }

    let cancelled = false;

    async function fetchQuotes() {
      const rows = await Promise.all(
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
      );
      if (!cancelled) setQuotes(Object.fromEntries(rows));
    }

    void fetchQuotes();
    const interval = window.setInterval(() => {
      void fetchQuotes();
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [positions, modalOpen, editingId, form.assetSymbol]);

  const previewPrice = quotes[form.assetSymbol]?.price ?? null;
  const previewQty =
    previewPrice != null && Number(form.usdAmount) > 0
      ? Number(form.usdAmount) / previewPrice
      : null;

  const summary = (() => {
    let openPositionsValue = 0;
    let realizedPnl = 0;
    for (const p of positions) {
      realizedPnl += p.realizedPnl;
      if (!isOpen(p)) continue;
      const price = quotes[p.assetSymbol]?.price;
      if (price == null) continue;
      openPositionsValue += openAmount(p) * price;
    }
    const starting = wallet?.startingBalance ?? 1000;
    const cashBalance = wallet?.cashBalance ?? 0;
    const totalPortfolioValue = cashBalance + openPositionsValue;
    const totalPnl = totalPortfolioValue - starting;
    const totalPnlPct = starting > 0 ? (totalPnl / starting) * 100 : 0;
    return {
      cashBalance,
      openPositionsValue,
      totalPortfolioValue,
      totalPnl,
      totalPnlPct,
      realizedPnl,
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
      usdAmount: "",
      avgEntryPrice: String(p.avgEntryPrice),
      stopLoss: p.stopLoss != null ? String(p.stopLoss) : "",
      takeProfit: p.takeProfit != null ? String(p.takeProfit) : "",
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
        ...(editingId
          ? {
              amount: Number(form.amount),
              avgEntryPrice: Number(form.avgEntryPrice),
            }
          : {
              usdAmount: Number(form.usdAmount),
            }),
        stopLoss: form.stopLoss === "" ? null : Number(form.stopLoss),
        takeProfit: form.takeProfit === "" ? null : Number(form.takeProfit),
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

  async function submitClose() {
    if (!closeTarget) return;
    const openQty = openAmount(closeTarget);
    if (openQty <= 0) return;
    setClosing(true);
    setError(null);
    try {
      const body =
        closeQty.trim() !== ""
          ? { closeQty: Number(closeQty) }
          : { closePercent: Number(closePercent) };
      const res = await fetch(`/api/portfolio/${encodeURIComponent(closeTarget.id)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Close failed");
      setCloseTarget(null);
      setClosePercent("100");
      setCloseQty("");
      await loadPositions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Close failed");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 2xl:px-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Portfolio</h1>
          <p className="text-text-muted text-sm">
            Paper trading account with virtual cash + live mark-to-market.
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

      <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
            Cash balance
          </p>
          <p className="font-mono-data text-2xl sm:text-3xl font-bold">
            {loading ? "—" : formatUsd(summary.cashBalance)}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
            Open positions value
          </p>
          <p className="font-mono-data text-2xl sm:text-3xl font-bold">
            {loading ? "—" : formatUsd(summary.openPositionsValue)}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">
            Total portfolio value
          </p>
          <p className="font-mono-data text-2xl sm:text-3xl font-bold">
            {loading ? "—" : formatUsd(summary.totalPortfolioValue)}
          </p>
        </GlassCard>
        <GlassCard glow="accent">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Total P&amp;L</p>
          <p
            className={`font-mono-data text-2xl sm:text-3xl font-bold ${
              summary.totalPnl >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {loading
              ? "—"
              : `${summary.totalPnl >= 0 ? "+" : ""}${formatUsd(summary.totalPnl)}`}
          </p>
          <p
            className={`font-mono-data text-xs mt-1 ${
              summary.totalPnlPct >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {loading ? "" : `${summary.totalPnlPct >= 0 ? "+" : ""}${summary.totalPnlPct.toFixed(2)}%`}
          </p>
        </GlassCard>
        <GlassCard>
          <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Realized P&amp;L</p>
          <p
            className={`font-mono-data text-2xl sm:text-3xl font-bold ${
              summary.realizedPnl >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {loading
              ? "—"
              : `${summary.realizedPnl >= 0 ? "+" : ""}${formatUsd(summary.realizedPnl)}`}
          </p>
        </GlassCard>
      </div>

      <GlassCard className="!p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading positions…
          </div>
        ) : positions.length === 0 ? (
          <p className="py-8 px-4 text-center text-text-muted text-sm">
            No positions yet. Add one to start tracking.
          </p>
        ) : (
          <>
            {/* Mobile: card view */}
            <div className="md:hidden divide-y divide-white/5">
              {positions.map((p) => {
                const open = isOpen(p);
                const livePrice = quotes[p.assetSymbol]?.price ?? null;
                const changePct = quotes[p.assetSymbol]?.change24hPct ?? null;
                const openQty = openAmount(p);
                const price = open ? livePrice : p.exitPrice;
                const value = open && price != null ? openQty * price : null;
                const pnl = open
                  ? price != null
                    ? unrealizedPnL(p, price)
                    : null
                  : p.realizedPnl;
                const align = alignmentFor(p.positionType, signals[p.assetSymbol]);
                return (
                  <div key={p.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <CoinIcon
                          symbol={pairBaseSymbol(p.assetSymbol)}
                          size={36}
                          className="ring-1 ring-white/10"
                        />
                        <div className="min-w-0">
                          <p className="font-mono-data font-semibold truncate">
                            {p.assetSymbol}
                          </p>
                          <p className="text-xs text-text-muted capitalize">
                            {p.positionType}
                            {p.leverage != null ? ` · ${p.leverage}x` : ""}
                          </p>
                        </div>
                      </div>
                      <StatusPill open={open} />
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">
                          Live price
                        </p>
                        <p className="font-mono-data">
                          {price != null ? formatUsd(price) : "—"}
                          {open && changePct != null && (
                            <span
                              className={`ml-1.5 text-xs ${
                                changePct >= 0 ? "text-bull" : "text-bear"
                              }`}
                            >
                              {changePct >= 0 ? "+" : ""}
                              {changePct.toFixed(2)}%
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">
                          Entry
                        </p>
                        <p className="font-mono-data">{formatUsd(p.avgEntryPrice)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">
                          Amount
                        </p>
                        <p className="font-mono-data">{formatAmount(open ? openQty : p.amount)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">
                          Value
                        </p>
                        <p className="font-mono-data">
                          {value != null ? formatUsd(value) : open ? "—" : "Closed"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">
                          Stop loss
                        </p>
                        <p className="font-mono-data">
                          {p.stopLoss != null ? formatUsd(p.stopLoss) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">
                          Take profit
                        </p>
                        <p className="font-mono-data">
                          {p.takeProfit != null ? formatUsd(p.takeProfit) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">
                          P&amp;L
                        </p>
                        <p
                          className={`font-mono-data font-semibold ${
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
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-text-muted">
                          Signal
                        </p>
                        <div className="mt-0.5">
                          {open ? (
                            <AlignmentPill kind={align} />
                          ) : (
                            <span className="text-xs text-text-muted font-mono-data">
                              Closed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {open && (
                        <button
                          type="button"
                          onClick={() => setCloseTarget(p)}
                          className="flex-1 min-h-11 inline-flex items-center justify-center px-3 rounded-lg text-sm text-mixed border border-mixed/30 bg-mixed/10 hover:bg-mixed/20"
                        >
                          Close
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-white/5 border border-white/10"
                        aria-label="Edit position"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removePosition(p.id)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-bear hover:bg-bear/5 border border-white/10"
                        aria-label="Delete position"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[980px]">
                <thead>
                  <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                    <th className="text-left py-3 px-4">Asset</th>
                    <th className="text-left py-3 px-4">Type</th>
                    <th className="text-right py-3 px-4">Amount</th>
                    <th className="text-right py-3 px-4">Entry</th>
                    <th className="text-right py-3 px-4">Live price</th>
                    <th className="text-right py-3 px-4">SL</th>
                    <th className="text-right py-3 px-4">TP</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Value</th>
                    <th className="text-right py-3 px-4">P&amp;L</th>
                    <th className="text-left py-3 px-4">Signal</th>
                    <th className="text-right py-3 px-4"> </th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const open = isOpen(p);
                    const livePrice = quotes[p.assetSymbol]?.price ?? null;
                    const changePct = quotes[p.assetSymbol]?.change24hPct ?? null;
                    const openQty = openAmount(p);
                    const price = open ? livePrice : p.exitPrice;
                    const value = open && price != null ? openQty * price : null;
                    const pnl = open
                      ? price != null
                        ? unrealizedPnL(p, price)
                        : null
                      : p.realizedPnl;
                    const align = alignmentFor(p.positionType, signals[p.assetSymbol]);
                    return (
                      <tr key={p.id} className="border-t border-white/5 hover:bg-white/3">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <CoinIcon
                              symbol={pairBaseSymbol(p.assetSymbol)}
                              size={28}
                              className="ring-1 ring-white/10"
                            />
                            <span className="font-mono-data font-semibold">
                              {p.assetSymbol}
                            </span>
                          </div>
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
                          {formatAmount(open ? openQty : p.amount)}
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right">
                          {formatUsd(p.avgEntryPrice)}
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{price != null ? formatUsd(price) : "—"}</span>
                            {open && changePct != null && (
                              <span
                                className={`text-[10px] ${
                                  changePct >= 0 ? "text-bull" : "text-bear"
                                }`}
                              >
                                {changePct >= 0 ? "+" : ""}
                                {changePct.toFixed(2)}% 24h
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right text-text-muted">
                          {p.stopLoss != null ? formatUsd(p.stopLoss) : "—"}
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right text-text-muted">
                          {p.takeProfit != null ? formatUsd(p.takeProfit) : "—"}
                        </td>
                        <td className="py-3 px-4">
                          <StatusPill open={open} />
                        </td>
                        <td className="py-3 px-4 font-mono-data text-right">
                          {value != null ? formatUsd(value) : open ? "—" : "Closed"}
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
                          {open ? (
                            <AlignmentPill kind={align} />
                          ) : (
                            <span className="text-xs text-text-muted font-mono-data">
                              Closed
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex gap-1.5">
                            {open && (
                              <button
                                type="button"
                                onClick={() => setCloseTarget(p)}
                                className="inline-flex min-h-11 items-center px-3 rounded-lg text-text-muted hover:text-mixed hover:bg-mixed/10 disabled:opacity-50"
                                aria-label="Close position"
                                title="Close position"
                              >
                                Close
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-white/5"
                              aria-label="Edit position"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void removePosition(p.id)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-bear hover:bg-bear/5"
                              aria-label="Delete position"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassCard>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setModalOpen(false)}
            aria-label="Close modal"
          />
          <div className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-[#0d1224] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-text-muted text-xs uppercase tracking-wider">
                    USD to spend
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={editingId ? form.amount : form.usdAmount}
                    onChange={(e) =>
                      setForm((f) =>
                        editingId
                          ? { ...f, amount: e.target.value }
                          : { ...f, usdAmount: e.target.value }
                      )
                    }
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono-data"
                    required
                  />
                </label>
                {editingId && (
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
                )}
              </div>
              {!editingId && (
                <p className="text-xs text-text-muted font-mono-data">
                  {previewPrice != null && previewQty != null
                    ? `≈ ${previewQty.toFixed(8)} ${form.assetSymbol.split("/")[0]} at current price ${formatUsd(previewPrice)}`
                    : "Live quantity preview appears when market price and USD amount are available."}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-text-muted text-xs uppercase tracking-wider">
                    Stop Loss (optional)
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.stopLoss}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stopLoss: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono-data"
                    placeholder="e.g. 62000"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-text-muted text-xs uppercase tracking-wider">
                    Take Profit (optional)
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={form.takeProfit}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, takeProfit: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono-data"
                    placeholder="e.g. 70000"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {closeTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => setCloseTarget(null)}
            aria-label="Close modal"
          />
          <div className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-[#0d1224] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Close position</h2>
              <button
                type="button"
                onClick={() => setCloseTarget(null)}
                className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-text-muted mb-4">
              {closeTarget.assetSymbol} open amount:{" "}
              <span className="font-mono-data">{openAmount(closeTarget).toFixed(8)}</span>
            </p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {["25", "50", "75", "100"].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setClosePercent(pct);
                    setCloseQty("");
                  }}
                  className={`min-h-11 px-2 py-2 rounded-lg text-xs border ${
                    closePercent === pct && closeQty === ""
                      ? "bg-accent/20 border-accent/40 text-accent"
                      : "bg-white/5 border-white/10 text-text-muted"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <label className="block text-sm mb-4">
              <span className="text-text-muted text-xs uppercase tracking-wider">
                Custom close amount (optional)
              </span>
              <input
                type="number"
                step="any"
                min="0"
                value={closeQty}
                onChange={(e) => setCloseQty(e.target.value)}
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm font-mono-data"
                placeholder="Leave blank to use selected %"
              />
            </label>
            <button
              type="button"
              onClick={() => void submitClose()}
              disabled={closing}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 disabled:opacity-50 transition-colors"
            >
              {closing && <Loader2 className="w-4 h-4 animate-spin" />}
              Confirm close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
