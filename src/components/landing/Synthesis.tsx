"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { TierPill } from "@/components/ui/TierPill";

const verdict = {
  pair: "BTC/USDT",
  timeframe: "1h",
  tier: "HIGH" as const,
  direction: "LONG",
  alignment: "3/4 lanes aligned",
  entry: 94832.5,
  stopLoss: 93120.0,
  takeProfit1: 97200.0,
  takeProfit2: 99850.0,
  rationale: "Technical + Flow lanes support upside; macro headwinds noted but outweighed.",
  riskReward: "1:2.4",
};

export function Synthesis() {
  return (
    <section id="synthesis" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Synthesis</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">The verdict engine</h2>
          <p className="text-text-muted max-w-xl mb-12">
            Weighted synthesis across all four lanes produces a single actionable trade signal.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <GlassCard glow="accent" className="!p-4 sm:!p-6 lg:!p-8">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
              <span className="font-mono-data text-base sm:text-lg font-semibold">
                {verdict.pair} · {verdict.timeframe}
              </span>
              <TierPill tier={verdict.tier} />
              <span className="px-3 py-1 rounded bg-bull/15 text-bull border border-bull/30 text-sm font-bold font-mono-data">
                {verdict.direction}
              </span>
              <span className="text-xs text-text-muted sm:ml-auto w-full sm:w-auto">{verdict.alignment}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Entry</p>
                <p className="font-mono-data text-xl text-bull">${verdict.entry.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Stop Loss</p>
                <p className="font-mono-data text-xl text-bear">${verdict.stopLoss.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">TP 1</p>
                <p className="font-mono-data text-xl text-bull">${verdict.takeProfit1.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">TP 2</p>
                <p className="font-mono-data text-xl text-bull">${verdict.takeProfit2.toLocaleString()}</p>
              </div>
            </div>

            <p className="text-sm text-text-muted mb-2">{verdict.rationale}</p>
            <p className="text-xs text-accent font-mono-data">Risk:Reward {verdict.riskReward}</p>
          </GlassCard>
        </ScrollReveal>
      </div>
    </section>
  );
}
