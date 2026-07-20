"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { ScenarioStressPanel } from "@/components/scenarios/ScenarioStressPanel";

export function ScenarioSimulator() {
  return (
    <section id="scenarios" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Stress Test</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Scenario simulator</h2>
          <p className="text-text-muted mb-8">
            Model cascade effects from a BTC shock across correlated assets and your positions.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <ScenarioStressPanel variant="landing" />
        </ScrollReveal>
      </div>
    </section>
  );
}
