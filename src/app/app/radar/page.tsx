"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useRadarFeed } from "@/components/radar/useRadarFeed";
import { EtfSourceBadge } from "@/components/radar/EtfSourceBadge";
import { RadarTabMeta } from "@/components/radar/RadarTabMeta";
import { whaleDirectionClass, whaleDirectionLabel } from "@/components/radar/whaleDirection";
import type { ETFFlow, Liquidation, WhaleTransaction } from "@/lib/types";

const TABS = ["Whales", "ETF Flows", "Liquidations"] as const;

const TAB_TYPE: Record<(typeof TABS)[number], string> = {
  Whales: "whales",
  "ETF Flows": "etf",
  Liquidations: "liquidations",
};

export default function RadarPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Whales");
  const whales = useRadarFeed<WhaleTransaction>("whales", 120_000);
  const etf = useRadarFeed<ETFFlow>("etf", 300_000);
  const liquidations = useRadarFeed<Liquidation>("liquidations", 30_000);

  const active =
    activeTab === "Whales" ? whales : activeTab === "ETF Flows" ? etf : liquidations;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Institutional Radar</h1>
      <p className="text-text-muted text-sm mb-6 sm:mb-8">
        Whale movements, ETF activity, and liquidation events from live APIs.
      </p>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === tab
                ? "bg-accent/15 text-accent border border-accent/30"
                : "text-text-muted hover:text-text-primary bg-white/5"
            }`}
          >
            {tab}
            {tab === "ETF Flows" && <EtfSourceBadge source={etf.meta.source} />}
          </button>
        ))}
      </div>

      <div className="flex justify-end mb-3">
        <RadarTabMeta
          meta={active.meta}
          onRefresh={active.refresh}
          loading={active.loading}
        />
      </div>

      {active.error && (
        <GlassCard className="mb-4 !p-3">
          <p className="text-sm text-bear">{active.error}</p>
        </GlassCard>
      )}

      <GlassCard className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {active.loading && (
            <p className="text-sm text-text-muted p-6 skeleton h-32" />
          )}

          {!active.loading && activeTab === "Whales" && (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                  <th className="text-left py-3 px-4">Address</th>
                  <th className="text-left py-3 px-4">Chain</th>
                  <th className="text-left py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">USD Value</th>
                  <th className="text-left py-3 px-4">Direction</th>
                  <th className="text-left py-3 px-4">Time</th>
                </tr>
              </thead>
              <tbody>
                {whales.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 px-4 text-center text-text-muted">
                      No whale transactions found.
                    </td>
                  </tr>
                ) : (
                  whales.data.map((w) => (
                    <tr key={w.id} className="border-t border-white/5 hover:bg-white/3">
                      <td className="py-3 px-4 font-mono-data text-xs">{w.address}</td>
                      <td className="py-3 px-4">{w.chain}</td>
                      <td className="py-3 px-4 font-mono-data">{w.amount}</td>
                      <td className="py-3 px-4 font-mono-data">{w.usdValue}</td>
                      <td className={`py-3 px-4 font-mono-data font-semibold ${whaleDirectionClass(w.direction)}`}>
                        {whaleDirectionLabel(w.direction)}
                      </td>
                      <td className="py-3 px-4 text-text-muted">{w.timeAgo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {!active.loading && activeTab === "ETF Flows" && (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                  <th className="text-left py-3 px-4">Ticker</th>
                  <th className="text-left py-3 px-4">Name</th>
                  <th className="text-right py-3 px-4">
                    {etf.meta.source === "sosovalue" ? "Net Flow ($M)" : "Activity ($M)"}
                  </th>
                  <th className="text-left py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {etf.data.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 px-4 text-center text-text-muted">
                      No ETF data available.
                    </td>
                  </tr>
                ) : (
                  etf.data.map((e) => (
                    <tr key={e.ticker} className="border-t border-white/5 hover:bg-white/3">
                      <td className="py-3 px-4 font-mono-data font-semibold">{e.ticker}</td>
                      <td className="py-3 px-4 text-text-muted">{e.name}</td>
                      <td className={`py-3 px-4 font-mono-data text-right font-semibold ${e.netFlow >= 0 ? "text-bull" : "text-bear"}`}>
                        {e.netFlow >= 0 ? "+" : ""}{e.netFlow.toFixed(1)}
                      </td>
                      <td className="py-3 px-4 text-text-muted">{e.date}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {!active.loading && activeTab === "Liquidations" && (
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                  <th className="text-left py-3 px-4">Exchange</th>
                  <th className="text-left py-3 px-4">Pair</th>
                  <th className="text-left py-3 px-4">Side</th>
                  <th className="text-right py-3 px-4">Amount</th>
                  <th className="text-left py-3 px-4">Time</th>
                </tr>
              </thead>
              <tbody>
                {liquidations.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 px-4 text-center text-text-muted">
                      No recent liquidations found.
                    </td>
                  </tr>
                ) : (
                  liquidations.data.map((l) => (
                    <tr key={l.id} className="border-t border-white/5 hover:bg-white/3">
                      <td className="py-3 px-4">{l.exchange}</td>
                      <td className="py-3 px-4 font-mono-data">{l.pair}</td>
                      <td className={`py-3 px-4 font-mono-data ${l.side === "long" ? "text-bear" : "text-bull"}`}>{l.side}</td>
                      <td className="py-3 px-4 font-mono-data text-right">{l.amount}</td>
                      <td className="py-3 px-4 text-text-muted">{l.timeAgo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>

      <p className="text-xs text-text-muted mt-3">
        Source: {active.meta.source ?? TAB_TYPE[activeTab]} · auto-refreshes
      </p>
    </div>
  );
}
