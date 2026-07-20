"use client";

import { ScenarioStressPanel } from "@/components/scenarios/ScenarioStressPanel";

export default function ScenariosPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Scenario Simulator</h1>
      <p className="text-text-muted text-sm mb-6 sm:mb-8">
        Stress-test portfolio impact from BTC shock scenarios.
      </p>
      <ScenarioStressPanel variant="app" />
    </div>
  );
}
