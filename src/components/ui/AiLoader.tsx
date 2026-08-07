"use client";

import { useEffect, useId, useState } from "react";

const PIPELINE_STEPS = [
  "Technical",
  "Flow",
  "Narrative",
  "Macro",
  "Synthesis",
] as const;

type AiLoaderSize = "sm" | "md" | "lg";

interface AiLoaderProps {
  /** Override the rotating pipeline label. */
  label?: string;
  size?: AiLoaderSize;
  className?: string;
  /** Cycle through lane → synthesis labels when no custom label is set. */
  cycleSteps?: boolean;
}

const SIZE = {
  sm: {
    ring: 100,
    label: "text-xs",
    gap: "gap-3",
    pad: "py-6 px-3",
    eyebrow: "text-[9px]",
    showSteps: true,
  },
  md: {
    ring: 120,
    label: "text-sm",
    gap: "gap-4",
    pad: "py-8 px-4",
    eyebrow: "text-[10px]",
    showSteps: true,
  },
  lg: {
    ring: 148,
    label: "text-sm",
    gap: "gap-5",
    pad: "py-12 px-6",
    eyebrow: "text-[10px]",
    showSteps: true,
  },
} as const;

export function AiLoader({
  label,
  size = "md",
  className = "",
  cycleSteps = true,
}: AiLoaderProps) {
  const s = SIZE[size];
  const uid = useId().replace(/:/g, "");
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (label || !cycleSteps) return;
    const id = window.setInterval(() => {
      setStepIndex((i) => (i + 1) % PIPELINE_STEPS.length);
    }, 1100);
    return () => window.clearInterval(id);
  }, [label, cycleSteps]);

  const activeStep = PIPELINE_STEPS[stepIndex]!;
  const status =
    label ??
    (cycleSteps ? `Scanning ${activeStep} lane…` : "Running pipeline…");

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={`relative flex flex-col items-center justify-center overflow-hidden ${s.gap} ${s.pad} ${className}`}
    >
      {/* Ambient field */}
      <div
        className="pointer-events-none absolute inset-0 ai-loader-field"
        aria-hidden
      />

      <p
        className={`${s.eyebrow} uppercase tracking-[0.28em] text-accent font-semibold`}
      >
        AI Pipeline
      </p>

      <div
        className="relative ai-loader-stage"
        style={{ width: s.ring, height: s.ring }}
        aria-hidden
      >
        {/* Soft bloom */}
        <div className="absolute inset-[12%] rounded-full bg-accent/25 blur-2xl ai-bloom" />

        {/* Outer dashed scan ring */}
        <div className="absolute inset-0 rounded-full border border-dashed border-accent/50 ai-scan-ring" />

        {/* Mid solid glow ring */}
        <div className="absolute inset-[10%] rounded-full ai-glow-ring" />

        {/* Orbiting nodes */}
        <div className="absolute inset-[6%] ai-orbit-nodes">
          <span className="ai-node ai-node-a" />
          <span className="ai-node ai-node-b" />
          <span className="ai-node ai-node-c" />
          <span className="ai-node ai-node-d" />
        </div>

        {/* Neural SVG core — explicit size; global svg { height:auto } collapses absolute SVGs */}
        <svg
          viewBox="0 0 100 100"
          className="ai-loader-svg"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient
              id={`ai-grad-${uid}`}
              x1="10"
              y1="90"
              x2="90"
              y2="10"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#d1ff45" />
              <stop offset="0.5" stopColor="#e8ff8a" />
              <stop offset="1" stopColor="#d1ff45" />
            </linearGradient>
            <filter id={`ai-glow-${uid}`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Network links */}
          <g
            stroke={`url(#ai-grad-${uid})`}
            strokeWidth="1.1"
            opacity="0.85"
            className="ai-links"
          >
            <line x1="50" y1="22" x2="28" y2="42" />
            <line x1="50" y1="22" x2="72" y2="42" />
            <line x1="28" y1="42" x2="50" y2="50" />
            <line x1="72" y1="42" x2="50" y2="50" />
            <line x1="28" y1="42" x2="32" y2="68" />
            <line x1="72" y1="42" x2="68" y2="68" />
            <line x1="50" y1="50" x2="32" y2="68" />
            <line x1="50" y1="50" x2="68" y2="68" />
            <line x1="32" y1="68" x2="50" y2="80" />
            <line x1="68" y1="68" x2="50" y2="80" />
          </g>

          {/* Nodes */}
          <g fill={`url(#ai-grad-${uid})`} filter={`url(#ai-glow-${uid})`}>
            <circle className="ai-net-node" cx="50" cy="22" r="3.2" />
            <circle className="ai-net-node" cx="28" cy="42" r="2.6" style={{ animationDelay: "0.15s" }} />
            <circle className="ai-net-node" cx="72" cy="42" r="2.6" style={{ animationDelay: "0.3s" }} />
            <circle className="ai-net-node" cx="50" cy="50" r="4" style={{ animationDelay: "0.45s" }} />
            <circle className="ai-net-node" cx="32" cy="68" r="2.4" style={{ animationDelay: "0.6s" }} />
            <circle className="ai-net-node" cx="68" cy="68" r="2.4" style={{ animationDelay: "0.75s" }} />
            <circle className="ai-net-node" cx="50" cy="80" r="3" style={{ animationDelay: "0.9s" }} />
          </g>

          {/* Brand waveform spark */}
          <path
            d="M34 52C40 46 44 44 50 44C56 44 60 46 66 52"
            stroke={`url(#ai-grad-${uid})`}
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
            className="ai-wave"
            opacity="0.9"
          />
        </svg>

        {/* Sweep arc */}
        <div className="absolute inset-[4%] rounded-full ai-sweep" />
      </div>

      <div className="text-center space-y-1.5 max-w-xs">
        <p
          className={`${s.label} font-mono-data tracking-wide ai-shimmer-text`}
        >
          {status}
        </p>
        {!label && cycleSteps && (
          <p className="text-[10px] text-text-muted/80 font-mono-data">
            {PIPELINE_STEPS.map((step, i) => (
              <span key={step}>
                <span
                  className={
                    i === stepIndex ? "text-accent" : "text-text-muted/50"
                  }
                >
                  {step}
                </span>
                {i < PIPELINE_STEPS.length - 1 ? (
                  <span className="text-text-muted/30 mx-1">→</span>
                ) : null}
              </span>
            ))}
          </p>
        )}
      </div>

      {s.showSteps && !label && cycleSteps && (
        <div className="flex items-center gap-1.5" aria-hidden>
          {PIPELINE_STEPS.map((step, i) => (
            <span
              key={step}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? "w-5 bg-gradient-to-r from-accent to-[#e8ff8a]"
                  : i < stepIndex
                    ? "w-2.5 bg-accent/60"
                    : "w-2.5 bg-white/10"
              }`}
            />
          ))}
        </div>
      )}

      <span className="sr-only">Analysis pipeline running</span>
    </div>
  );
}
