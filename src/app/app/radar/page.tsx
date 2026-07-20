"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { MOCK_WHALES, MOCK_ETF_FLOWS, MOCK_LIQUIDATIONS } from "@/lib/mock-data";

const TABS = ["Whales", "ETF Flows", "Liquidations"] as const;

export default function RadarPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Whales");

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-1">Institutional Radar</h1>
      <p className="text-text-muted text-sm mb-8">Whale movements, ETF flows, and liquidation events.</p>

      <div className="flex gap-2 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-accent/15 text-accent border border-accent/30"
                : "text-text-muted hover:text-text-primary bg-white/5"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <GlassCard className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {activeTab === "Whales" && (
            <table className="w-full text-sm">
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
                {MOCK_WHALES.map((w) => (
                  <tr key={w.id} className="border-t border-white/5 hover:bg-white/3">
                    <td className="py-3 px-4 font-mono-data text-xs">{w.address}</td>
                    <td className="py-3 px-4">{w.chain}</td>
                    <td className="py-3 px-4 font-mono-data">{w.amount}</td>
                    <td className="py-3 px-4 font-mono-data">{w.usdValue}</td>
                    <td className={`py-3 px-4 font-mono-data font-semibold ${w.direction === "in" ? "text-bull" : "text-bear"}`}>
                      {w.direction.toUpperCase()}
                    </td>
                    <td className="py-3 px-4 text-text-muted">{w.timeAgo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "ETF Flows" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                  <th className="text-left py-3 px-4">Ticker</th>
                  <th className="text-left py-3 px-4">Name</th>
                  <th className="text-right py-3 px-4">Net Flow ($M)</th>
                  <th className="text-left py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_ETF_FLOWS.map((e) => (
                  <tr key={e.ticker} className="border-t border-white/5 hover:bg-white/3">
                    <td className="py-3 px-4 font-mono-data font-semibold">{e.ticker}</td>
                    <td className="py-3 px-4 text-text-muted">{e.name}</td>
                    <td className={`py-3 px-4 font-mono-data text-right font-semibold ${e.netFlow >= 0 ? "text-bull" : "text-bear"}`}>
                      {e.netFlow >= 0 ? "+" : ""}{e.netFlow.toFixed(1)}
                    </td>
                    <td className="py-3 px-4 text-text-muted">{e.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {activeTab === "Liquidations" && (
            <table className="w-full text-sm">
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
                {MOCK_LIQUIDATIONS.map((l) => (
                  <tr key={l.id} className="border-t border-white/5 hover:bg-white/3">
                    <td className="py-3 px-4">{l.exchange}</td>
                    <td className="py-3 px-4 font-mono-data">{l.pair}</td>
                    <td className={`py-3 px-4 font-mono-data ${l.side === "long" ? "text-bear" : "text-bull"}`}>{l.side}</td>
                    <td className="py-3 px-4 font-mono-data text-right">{l.amount}</td>
                    <td className="py-3 px-4 text-text-muted">{l.timeAgo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
