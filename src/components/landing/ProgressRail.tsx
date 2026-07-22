"use client";

import { useEffect, useState } from "react";

const STAGES = [
  { id: "surface", label: "SURFACE" },
  { id: "evaluate", label: "EVALUATE" },
  { id: "examine", label: "EXAMINE" },
  { id: "execute", label: "EXECUTE" },
  { id: "depth", label: "DEPTH" },
];

const SECTION_IDS = ["hero", "radar", "pipeline", "synthesis", "delivery", "copilot", "drawer", "scenarios", "cta"];

export function ProgressRail() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTION_IDS.forEach((id, index) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            const stageIndex = Math.min(Math.floor(index / 2), STAGES.length - 1);
            setActive(stageIndex);
          }
        },
        { threshold: 0.3 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <>
      {/* Desktop side rail */}
      <div className="fixed right-6 top-1/2 z-40 hidden h-[calc(100dvh-8rem)] -translate-y-1/2 flex-col items-end justify-between lg:flex">
        <div className="absolute right-[3px] top-1 bottom-1 w-px bg-white/8" />
        {STAGES.map((stage, i) => (
          <div key={stage.id} className="relative z-10 flex items-center gap-3">
            <span
              className={`text-[10px] tracking-[0.2em] transition-colors duration-300 ${
                i <= active ? "text-mixed" : "text-text-muted/40"
              }`}
            >
              {stage.label}
            </span>
            <div
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i <= active ? "bg-mixed shadow-[0_0_12px_rgba(245,185,74,0.45)]" : "bg-white/10"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-40 lg:hidden bg-bg-primary/90 backdrop-blur-sm border-b border-white/8">
        <div className="flex justify-between px-4 py-2">
          {STAGES.map((stage, i) => (
            <span
              key={stage.id}
              className={`text-[8px] tracking-wider transition-colors ${
                i <= active ? "text-mixed" : "text-text-muted/40"
              }`}
            >
              {stage.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
