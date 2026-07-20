"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { BiasPill } from "@/components/ui/BiasPill";
import { TierPill } from "@/components/ui/TierPill";
import { MOCK_LANES } from "@/lib/mock-data";

const badgeColors: Record<string, string> = {
  T: "bg-accent/20 text-accent border-accent/30",
  F: "bg-bull/20 text-bull border-bull/30",
  N: "bg-mixed/20 text-mixed border-mixed/30",
  M: "bg-bear/20 text-bear border-bear/30",
};

export function Pipeline() {
  return (
    <section id="pipeline" className="py-24 px-6 bg-bg-secondary/50">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">The Pipeline</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Four independent lanes</h2>
          <p className="text-text-muted max-w-xl mb-12">
            Each lane analyzes a different dimension of the market with zero shared bias.
          </p>
        </ScrollReveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MOCK_LANES.map((lane, i) => (
            <ScrollReveal key={lane.lane} delay={i * 0.1}>
              <GlassCard className="h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold ${badgeColors[lane.badge]}`}
                  >
                    {lane.badge}
                  </div>
                  <h3 className="font-semibold">{lane.lane}</h3>
                </div>
                <div className="flex gap-2 mb-4">
                  <BiasPill bias={lane.bias} />
                  <TierPill tier={lane.tier} />
                </div>
                <ul className="space-y-2">
                  {lane.reasoning.map((r, j) => (
                    <li key={j} className="text-xs text-text-muted font-mono-data leading-relaxed">
                      › {r}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
