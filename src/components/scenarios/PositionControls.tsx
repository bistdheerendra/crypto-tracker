"use client";

import { useState } from "react";
import { Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import type { PortfolioPosition } from "@/lib/types";

const PAIR_OPTIONS = [...TRACKED_PAIRS];

interface PositionControlsProps {
  onAdd: (position: Omit<PortfolioPosition, "id">) => void;
  onRemove: (id: string) => void;
  onImportVerdicts: (equity: number, riskPct: number) => Promise<{ imported: number; total: number }>;
  onClearAll: () => void;
  positions: PortfolioPosition[];
  pricesLoading: boolean;
  onRefreshPrices: () => void;
}

const emptyForm: {
  pair: string;
  side: "LONG" | "SHORT";
  size: string;
  sizeUnit: "base" | "usd";
  entry: string;
  stopLoss: string;
} = {
  pair: "BTC/USDT",
  side: "LONG",
  size: "",
  sizeUnit: "base",
  entry: "",
  stopLoss: "",
};

export function PositionControls({
  onAdd,
  onRemove,
  onImportVerdicts,
  onClearAll,
  positions,
  pricesLoading,
  onRefreshPrices,
}: PositionControlsProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [equity, setEquity] = useState("10000");
  const [riskPct, setRiskPct] = useState("1");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const size = parseFloat(form.size);
    const entry = parseFloat(form.entry);
    const stopLoss = parseFloat(form.stopLoss);

    if (!size || size <= 0) {
      setFormError("Enter a valid position size.");
      return;
    }
    if (!entry || entry <= 0) {
      setFormError("Enter a valid entry price.");
      return;
    }
    if (!stopLoss || stopLoss <= 0) {
      setFormError("Enter a valid stop loss.");
      return;
    }
    if (form.side === "LONG" && stopLoss >= entry) {
      setFormError("Long stop must be below entry.");
      return;
    }
    if (form.side === "SHORT" && stopLoss <= entry) {
      setFormError("Short stop must be above entry.");
      return;
    }

    onAdd({
      pair: form.pair,
      side: form.side,
      size,
      sizeUnit: form.sizeUnit,
      entry,
      stopLoss,
      markPrice: entry,
    });
    setForm(emptyForm);
    setShowForm(false);
  }

  async function handleImport() {
    setImportMessage(null);
    const equityNum = parseFloat(equity);
    const riskNum = parseFloat(riskPct);
    if (!equityNum || equityNum <= 0 || !riskNum || riskNum <= 0) {
      setImportMessage("Enter valid equity and risk %.");
      return;
    }

    setImporting(true);
    try {
      const result = await onImportVerdicts(equityNum, riskNum);
      setImportMessage(
        result.imported > 0
          ? `Imported ${result.imported} new position${result.imported === 1 ? "" : "s"} from ${result.total} open verdict${result.total === 1 ? "" : "s"}.`
          : `No new positions — all ${result.total} open verdict${result.total === 1 ? "" : "s"} already imported.`
      );
    } catch {
      setImportMessage("Could not import open verdicts.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4 mb-6">
      <GlassCard>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/15 text-accent text-sm font-medium hover:bg-accent/25 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add position
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {importing ? "Importing…" : "Import open verdicts"}
          </button>
          <button
            type="button"
            onClick={onRefreshPrices}
            disabled={pricesLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-4 h-4 ${pricesLoading ? "animate-spin" : ""}`} />
            Refresh marks
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-sm text-text-muted hover:bg-white/10 transition-colors"
          >
            Clear all
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <label className="text-sm">
            <span className="text-text-muted block mb-1">Equity for verdict sizing</span>
            <input
              type="number"
              min={1}
              value={equity}
              onChange={(e) => setEquity(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono-data text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-text-muted block mb-1">Risk per verdict (%)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono-data text-sm"
            />
          </label>
        </div>

        {importMessage && <p className="text-xs text-text-muted mb-3">{importMessage}</p>}

        {showForm && (
          <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-white/10">
            <label className="text-sm">
              <span className="text-text-muted block mb-1">Pair</span>
              <select
                value={form.pair}
                onChange={(e) => setForm((f) => ({ ...f, pair: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                {PAIR_OPTIONS.map((pair) => (
                  <option key={pair} value={pair} className="bg-bg">
                    {pair}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-text-muted block mb-1">Side</span>
              <select
                value={form.side}
                onChange={(e) =>
                  setForm((f) => ({ ...f, side: e.target.value as "LONG" | "SHORT" }))
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                <option value="LONG" className="bg-bg">LONG</option>
                <option value="SHORT" className="bg-bg">SHORT</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-text-muted block mb-1">Size unit</span>
              <select
                value={form.sizeUnit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sizeUnit: e.target.value as "base" | "usd" }))
                }
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                <option value="base" className="bg-bg">Base asset</option>
                <option value="usd" className="bg-bg">USD notional</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-text-muted block mb-1">Size</span>
              <input
                type="number"
                min={0}
                step="any"
                value={form.size}
                onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono-data text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="text-text-muted block mb-1">Entry</span>
              <input
                type="number"
                min={0}
                step="any"
                value={form.entry}
                onChange={(e) => setForm((f) => ({ ...f, entry: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono-data text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="text-text-muted block mb-1">Stop loss</span>
              <input
                type="number"
                min={0}
                step="any"
                value={form.stopLoss}
                onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono-data text-sm"
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-semibold hover:opacity-90"
              >
                Save position
              </button>
              {formError && <p className="text-xs text-bear">{formError}</p>}
            </div>
          </form>
        )}
      </GlassCard>

      {positions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {positions.map((p) => (
            <div
              key={p.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 text-xs font-mono-data"
            >
              <span>
                {p.pair} {p.side} ×{p.size}
              </span>
              {p.verdictId && <span className="text-accent">verdict</span>}
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="text-text-muted hover:text-bear transition-colors"
                aria-label={`Remove ${p.pair}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
