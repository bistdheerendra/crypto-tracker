"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { MOCK_WHALES, MOCK_ETF_FLOWS, MOCK_LIQUIDATIONS } from "@/lib/mock-data";

const TABS = ["Whales", "ETF Flows", "Liquidations", "Scenarios"] as const;

export function RadarDrawer() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("Whales");

  return (
    <section id="drawer" className="py-16 sm:py-24 px-4 sm:px-6 bg-bg-secondary/50">
      <div className="max-w-4xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Institutional Radar</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Whales, flows & liquidations</h2>
          <p className="text-text-muted mb-8">
            Deep institutional data in a slide-up drawer. Four tabs, zero noise.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <GlassCard className="!p-0 overflow-hidden">
            <div className="flex border-b border-white/8 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? "text-accent border-b-2 border-accent"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-3 sm:p-4 overflow-x-auto">
              {activeTab === "Whales" && (
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-xs text-text-muted uppercase tracking-wider">
                      <th className="text-left py-2 px-3">Address</th>
                      <th className="text-left py-2 px-3">Amount</th>
                      <th className="text-left py-2 px-3">USD</th>
                      <th className="text-left py-2 px-3">Dir</th>
                      <th className="text-left py-2 px-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_WHALES.map((w) => (
                      <tr key={w.id} className="border-t border-white/5 hover:bg-white/3">
                        <td className="py-2.5 px-3 font-mono-data text-xs">{w.address}</td>
                        <td className="py-2.5 px-3 font-mono-data">{w.amount}</td>
                        <td className="py-2.5 px-3 font-mono-data">{w.usdValue}</td>
                        <td className={`py-2.5 px-3 font-mono-data ${w.direction === "in" ? "text-bull" : "text-bear"}`}>
                          {w.direction.toUpperCase()}
                        </td>
                        <td className="py-2.5 px-3 text-text-muted">{w.timeAgo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === "ETF Flows" && (
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="text-xs text-text-muted uppercase tracking-wider">
                      <th className="text-left py-2 px-3">Ticker</th>
                      <th className="text-left py-2 px-3">Name</th>
                      <th className="text-right py-2 px-3">Net Flow ($M)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_ETF_FLOWS.map((e) => (
                      <tr key={e.ticker} className="border-t border-white/5 hover:bg-white/3">
                        <td className="py-2.5 px-3 font-mono-data font-semibold">{e.ticker}</td>
                        <td className="py-2.5 px-3 text-text-muted">{e.name}</td>
                        <td className={`py-2.5 px-3 font-mono-data text-right ${e.netFlow >= 0 ? "text-bull" : "text-bear"}`}>
                          {e.netFlow >= 0 ? "+" : ""}{e.netFlow.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === "Liquidations" && (
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-xs text-text-muted uppercase tracking-wider">
                      <th className="text-left py-2 px-3">Exchange</th>
                      <th className="text-left py-2 px-3">Pair</th>
                      <th className="text-left py-2 px-3">Side</th>
                      <th className="text-right py-2 px-3">Amount</th>
                      <th className="text-left py-2 px-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_LIQUIDATIONS.map((l) => (
                      <tr key={l.id} className="border-t border-white/5 hover:bg-white/3">
                        <td className="py-2.5 px-3">{l.exchange}</td>
                        <td className="py-2.5 px-3 font-mono-data">{l.pair}</td>
                        <td className={`py-2.5 px-3 font-mono-data ${l.side === "long" ? "text-bear" : "text-bull"}`}>
                          {l.side}
                        </td>
                        <td className="py-2.5 px-3 font-mono-data text-right">{l.amount}</td>
                        <td className="py-2.5 px-3 text-text-muted">{l.timeAgo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeTab === "Scenarios" && (
                <p className="text-sm text-text-muted p-4 text-center">
                  Jump to the scenario simulator below to stress-test your portfolio.
                </p>
              )}
            </div>
          </GlassCard>
        </ScrollReveal>
      </div>
    </section>
  );
}
