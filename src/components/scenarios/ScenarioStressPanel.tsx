"use client";

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PositionControls } from "@/components/scenarios/PositionControls";
import { useScenarioPortfolio } from "@/components/scenarios/useScenarioPortfolio";
import { useCorrelationMatrix } from "@/hooks/useCorrelationMatrix";
import { stressPortfolio } from "@/lib/scenarios/stress";
import type { PortfolioPosition } from "@/lib/types";

interface ScenarioStressPanelProps {
  variant?: "app" | "landing";
}

function formatUsd(value: number, maxFractionDigits = 0): string {
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix}$${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: maxFractionDigits > 0 ? 2 : 0,
  })}`;
}

function formatPrice(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatTime(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface StressTablesProps {
  positions: PortfolioPosition[];
  shock: number;
  isApp: boolean;
  pricesLoading: boolean;
  lastPriceUpdate: Date | null;
  correlationMatrix: Record<string, number>;
  onRemove?: (id: string) => void;
}

function StressTables({
  positions,
  shock,
  isApp,
  pricesLoading,
  lastPriceUpdate,
  correlationMatrix,
  onRemove,
}: StressTablesProps) {
  const result = useMemo(
    () => stressPortfolio(positions, shock, correlationMatrix),
    [positions, shock, correlationMatrix]
  );
  const cellPad = isApp ? "py-3 px-4" : "py-2.5 px-4";

  return (
    <>
      <div className={`grid gap-4 mb-6 ${isApp ? "sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-3"}`}>
        <GlassCard className="!py-4">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Portfolio PnL</p>
          <p
            className={`font-mono-data text-xl font-semibold ${
              result.totalPnl >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {formatUsd(result.totalPnl)}
          </p>
        </GlassCard>
        <GlassCard className="!py-4">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Stops Hit</p>
          <p className="font-mono-data text-xl font-semibold">
            {result.stopsHit}{" "}
            <span className="text-sm text-text-muted font-normal">/ {positions.length}</span>
          </p>
        </GlassCard>
        <GlassCard className="!py-4">
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Worst Position</p>
          <p className="font-mono-data text-sm font-semibold truncate">
            {result.positions.length > 0
              ? (() => {
                  const worst = result.positions.reduce((a, b) => (a.pnl < b.pnl ? a : b));
                  return `${worst.position.pair} (${formatUsd(worst.pnl)})`;
                })()
              : "—"}
          </p>
        </GlassCard>
      </div>

      <GlassCard className="!p-0 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Your Positions</h3>
            <p className="text-xs text-text-muted mt-0.5">
              Modeled impact using live marks, entry, size, and stop levels.
            </p>
          </div>
          <p className="text-xs text-text-muted">
            {pricesLoading ? "Updating marks…" : `Marks @ ${formatTime(lastPriceUpdate)}`}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[980px]">
            <thead>
              <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                <th className={`text-left ${cellPad}`}>Pair</th>
                <th className={`text-center ${cellPad}`}>Side</th>
                <th className={`text-right ${cellPad}`}>Size</th>
                <th className={`text-right ${cellPad}`}>Entry</th>
                <th className={`text-right ${cellPad}`}>Mark</th>
                <th className={`text-right ${cellPad}`}>Shocked</th>
                <th className={`text-right ${cellPad}`}>Move</th>
                <th className={`text-right ${cellPad}`}>PnL</th>
                <th className={`text-right ${cellPad}`}>Stop</th>
                <th className={`text-center ${cellPad}`}>Status</th>
                {onRemove && <th className={`text-center ${cellPad}`} />}
              </tr>
            </thead>
            <tbody>
              {result.positions.length === 0 ? (
                <tr>
                  <td colSpan={onRemove ? 11 : 10} className={`${cellPad} text-center text-text-muted`}>
                    No positions yet. Add manually or import open verdicts.
                  </td>
                </tr>
              ) : (
                result.positions.map((r) => (
                  <tr
                    key={r.position.id}
                    className={`border-t border-white/5 hover:bg-white/3 ${
                      r.stopHit ? "bg-bear/5" : ""
                    }`}
                  >
                    <td className={`${cellPad} font-mono-data font-semibold`}>
                      {r.position.pair}
                      {r.position.verdictId && (
                        <span className="ml-1.5 text-[10px] text-accent uppercase">v</span>
                      )}
                    </td>
                    <td
                      className={`${cellPad} text-center text-xs font-semibold ${
                        r.position.side === "LONG" ? "text-bull" : "text-bear"
                      }`}
                    >
                      {r.position.side}
                    </td>
                    <td className={`${cellPad} font-mono-data text-right`}>
                      {r.position.size}
                      {r.position.sizeUnit === "base" ? "" : " USD"}
                    </td>
                    <td className={`${cellPad} font-mono-data text-right`}>
                      {formatPrice(r.position.entry)}
                    </td>
                    <td className={`${cellPad} font-mono-data text-right`}>
                      {formatPrice(r.position.markPrice)}
                    </td>
                    <td className={`${cellPad} font-mono-data text-right`}>
                      {formatPrice(r.shockedPrice)}
                    </td>
                    <td
                      className={`${cellPad} font-mono-data text-right ${
                        r.movePct >= 0 ? "text-bull" : "text-bear"
                      }`}
                    >
                      {r.movePct > 0 ? "+" : ""}
                      {r.movePct.toFixed(1)}%
                    </td>
                    <td
                      className={`${cellPad} font-mono-data text-right font-semibold ${
                        r.pnl >= 0 ? "text-bull" : "text-bear"
                      }`}
                    >
                      {formatUsd(r.pnl)}
                    </td>
                    <td className={`${cellPad} font-mono-data text-right text-bear`}>
                      {formatPrice(r.position.stopLoss)}
                    </td>
                    <td className={`${cellPad} text-center`}>
                      {r.stopHit ? (
                        <span className="text-bear text-xs font-semibold">Stop hit</span>
                      ) : (
                        <span className="text-text-muted text-xs">
                          {r.distToStopPct.toFixed(1)}% to stop
                        </span>
                      )}
                    </td>
                    {onRemove && (
                      <td className={`${cellPad} text-center`}>
                        <button
                          type="button"
                          onClick={() => onRemove(r.position.id)}
                          className="text-xs text-text-muted hover:text-bear"
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard className="!p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5">
          <h3 className="text-sm font-semibold">Market Cascade</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Correlated asset moves, funding, and open interest shifts.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                <th className={`text-left ${cellPad}`}>Asset</th>
                <th className={`text-right ${cellPad}`}>{isApp ? "Modeled % Move" : "% Move"}</th>
                <th className={`text-right ${cellPad}`}>{isApp ? "Funding Shift" : "Funding Δ"}</th>
                <th className={`text-right ${cellPad}`}>{isApp ? "OI Change" : "OI Δ"}</th>
                <th className={`text-center ${cellPad}`}>{isApp ? "Stop Triggered" : "Stop Hit"}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/5 bg-accent/5">
                <td className={`${cellPad} font-mono-data font-semibold`}>BTC/USDT</td>
                <td
                  className={`${cellPad} font-mono-data text-right ${
                    shock >= 0 ? "text-bull" : "text-bear"
                  }`}
                >
                  {shock > 0 ? "+" : ""}
                  {shock.toFixed(1)}%
                </td>
                <td className={`${cellPad} font-mono-data text-right`}>
                  {(shock * 0.15).toFixed(isApp ? 3 : 2)}%
                </td>
                <td className={`${cellPad} font-mono-data text-right`}>
                  {(shock * 0.8).toFixed(1)}%
                </td>
                <td className={`${cellPad} text-center`}>{Math.abs(shock) > 3 ? "⚠️" : "—"}</td>
              </tr>
              {result.marketResults.map((r) => (
                <tr key={r.asset} className="border-t border-white/5 hover:bg-white/3">
                  <td className={`${cellPad} font-mono-data`}>{r.asset}</td>
                  <td
                    className={`${cellPad} font-mono-data text-right ${
                      r.move >= 0 ? "text-bull" : "text-bear"
                    }`}
                  >
                    {r.move > 0 ? "+" : ""}
                    {r.move.toFixed(1)}%
                  </td>
                  <td className={`${cellPad} font-mono-data text-right`}>
                    {r.fundingShift.toFixed(3)}%
                  </td>
                  <td className={`${cellPad} font-mono-data text-right`}>
                    {r.oiChange.toFixed(1)}%
                  </td>
                  <td className={`${cellPad} text-center`}>{r.stopTriggered ? "⚠️" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </>
  );
}

function AppScenarioStressPanel() {
  const [shock, setShock] = useState(-5);
  const portfolio = useScenarioPortfolio(true);
  const { matrix, loading: matrixLoading, error: matrixError } = useCorrelationMatrix();

  if (!portfolio.hydrated) {
    return <p className="text-sm text-text-muted">Loading portfolio…</p>;
  }

  return (
    <>
      <PositionControls
        positions={portfolio.positions}
        onAdd={portfolio.addPosition}
        onRemove={portfolio.removePosition}
        onImportVerdicts={portfolio.importOpenVerdicts}
        onClearAll={portfolio.clearAll}
        pricesLoading={portfolio.pricesLoading}
        onRefreshPrices={portfolio.refreshPrices}
      />

      {matrixError && (
        <GlassCard className="mb-4 !p-3">
          <p className="text-sm text-bear">{matrixError}</p>
        </GlassCard>
      )}

      <GlassCard className="mb-6 max-w-lg">
        <label className="text-sm text-text-muted mb-3 block">
          BTC shock:{" "}
          <span className="text-accent font-mono-data text-lg">
            {shock > 0 ? "+" : ""}
            {shock}%
          </span>{" "}
          in 1 hour
        </label>
        <input
          type="range"
          min={-15}
          max={15}
          step={1}
          value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-xs text-text-muted mt-1">
          <span>-15%</span>
          <span>0%</span>
          <span>+15%</span>
        </div>
      </GlassCard>

      <StressTables
        positions={portfolio.positions}
        shock={shock}
        isApp
        pricesLoading={portfolio.pricesLoading || matrixLoading}
        lastPriceUpdate={portfolio.lastPriceUpdate}
        correlationMatrix={matrix}
        onRemove={portfolio.removePosition}
      />
    </>
  );
}

function LandingScenarioStressPanel() {
  const [shock, setShock] = useState(-5);
  const { matrix, loading: matrixLoading } = useCorrelationMatrix();
  const emptyPositions: PortfolioPosition[] = [];

  return (
    <>
      <GlassCard className="mb-6">
        <label className="text-sm text-text-muted mb-3 block">
          BTC shock scenario:{" "}
          <span className="text-accent font-mono-data">{shock > 0 ? "+" : ""}{shock}%</span> in 1h
        </label>
        <input
          type="range"
          min={-15}
          max={15}
          step={1}
          value={shock}
          onChange={(e) => setShock(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-xs text-text-muted mt-1">
          <span>-15%</span>
          <span>0%</span>
          <span>+15%</span>
        </div>
      </GlassCard>

      <StressTables
        positions={emptyPositions}
        shock={shock}
        isApp={false}
        pricesLoading={matrixLoading}
        lastPriceUpdate={null}
        correlationMatrix={matrix}
      />
    </>
  );
}

export function ScenarioStressPanel({ variant = "app" }: ScenarioStressPanelProps) {
  if (variant === "landing") {
    return <LandingScenarioStressPanel />;
  }
  return <AppScenarioStressPanel />;
}
