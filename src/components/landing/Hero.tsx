"use client";

import { ChevronDown } from "lucide-react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export function Hero() {
  return (
    <section id="hero" className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(62,166,255,0.08)_0%,transparent_70%)]" />
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full bg-accent/30 pulse-dot"
            style={{
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 53 + 7) % 100}%`,
              animationDelay: `${(i % 5) * 0.4}s`,
            }}
          />
        ))}
        <svg className="absolute inset-0 w-full h-full opacity-10 animate-spin-slow" viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="180" fill="none" stroke="#3ea6ff" strokeWidth="0.5" strokeDasharray="4 8" />
          <circle cx="200" cy="200" r="140" fill="none" stroke="#2ee6a8" strokeWidth="0.5" strokeDasharray="2 12" />
          <circle cx="200" cy="200" r="100" fill="none" stroke="#3ea6ff" strokeWidth="0.5" />
        </svg>
      </div>

      <ScrollReveal className="relative z-10 text-center max-w-4xl">
        <p className="text-xs tracking-[0.3em] text-accent uppercase mb-6">Dheerendra Intelligence</p>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          The market
          <br />
          <span className="bg-gradient-to-r from-accent to-bull bg-clip-text text-transparent">
            runs deep.
          </span>
        </h1>
        <p className="text-lg md:text-xl text-text-muted max-w-2xl mx-auto mb-12 leading-relaxed">
          See the cause behind every market move, not just the effect. Four independent
          analysis lanes. One synthesized verdict. Delivered where you trade.
        </p>
        <a
          href="#radar"
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-accent transition-colors animate-float"
        >
          Scroll to descend
          <ChevronDown className="w-4 h-4" />
        </a>
      </ScrollReveal>
    </section>
  );
}
