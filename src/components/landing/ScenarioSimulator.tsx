"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { CORRELATION_MATRIX } from "@/lib/mock-data";

export function ScenarioSimulator() {
  const [shock, setShock] = useState(-5);
  const results = Object.entries(CORRELATION_MATRIX).map(([asset, beta]) => ({
    asset,
    move: shock * beta,
    fundingShift: shock * 0.15 * beta,
    oiChange: shock * 0.8 * beta,
    stopTriggered: Math.abs(shock * beta) > 3,
  }));

  return (
    <section id="scenarios" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Stress Test</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Scenario simulator</h2>
          <p className="text-text-muted mb-8">
            Model cascade effects from a BTC shock across correlated assets and your positions.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <GlassCard className="mb-6">
            <label className="text-sm text-text-muted mb-3 block">
              BTC shock scenario: <span className="text-accent font-mono-data">{shock > 0 ? "+" : ""}{shock}%</span> in 1h
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

          <GlassCard className="!p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-text-muted uppercase tracking-wider bg-white/3">
                  <th className="text-left py-3 px-4">Asset</th>
                  <th className="text-right py-3 px-4">% Move</th>
                  <th className="text-right py-3 px-4">Funding Δ</th>
                  <th className="text-right py-3 px-4">OI Δ</th>
                  <th className="text-center py-3 px-4">Stop Hit</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/5 bg-accent/5">
                  <td className="py-2.5 px-4 font-mono-data font-semibold">BTC/USDT</td>
                  <td className={`py-2.5 px-4 font-mono-data text-right ${shock >= 0 ? "text-bull" : "text-bear"}`}>
                    {shock > 0 ? "+" : ""}{shock.toFixed(1)}%
                  </td>
                  <td className="py-2.5 px-4 font-mono-data text-right">{(shock * 0.15).toFixed(2)}%</td>
                  <td className="py-2.5 px-4 font-mono-data text-right">{(shock * 0.8).toFixed(1)}%</td>
                  <td className="py-2.5 px-4 text-center">{Math.abs(shock) > 3 ? "⚠️" : "—"}</td>
                </tr>
                {results.map((r) => (
                  <tr key={r.asset} className="border-t border-white/5 hover:bg-white/3">
                    <td className="py-2.5 px-4 font-mono-data">{r.asset}</td>
                    <td className={`py-2.5 px-4 font-mono-data text-right ${r.move >= 0 ? "text-bull" : "text-bear"}`}>
                      {r.move > 0 ? "+" : ""}{r.move.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-4 font-mono-data text-right">{r.fundingShift.toFixed(3)}%</td>
                    <td className="py-2.5 px-4 font-mono-data text-right">{r.oiChange.toFixed(1)}%</td>
                    <td className="py-2.5 px-4 text-center">{r.stopTriggered ? "⚠️" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </ScrollReveal>
      </div>
    </section>
  );
}
