"use client";

import { useEffect, useState } from "react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { MOCK_NEWS } from "@/lib/mock-data";
import type { NewsItem } from "@/lib/types";

const sentimentColors = {
  bullish: "text-bull bg-bull/10 border-bull/20",
  bearish: "text-bear bg-bear/10 border-bear/20",
  neutral: "text-mixed bg-mixed/10 border-mixed/20",
};

function GlobeSVG({ dots }: { dots: NewsItem[] }) {
  return (
    <div className="relative w-full max-w-md mx-auto aspect-square">
      <svg viewBox="0 0 400 400" className="w-full h-full animate-spin-slow">
        <defs>
          <radialGradient id="globeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0d1224" />
            <stop offset="100%" stopColor="#03060f" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="160" fill="url(#globeGrad)" stroke="rgba(62,166,255,0.2)" strokeWidth="1" />
        {[0, 30, 60, 90, 120, 150].map((angle) => (
          <ellipse
            key={angle}
            cx="200"
            cy="200"
            rx="160"
            ry={60}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="0.5"
            transform={`rotate(${angle} 200 200)`}
          />
        ))}
        <ellipse cx="200" cy="200" rx="160" ry="160" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        {dots.map((item) => {
          const x = 200 + (item.lng / 180) * 140;
          const y = 200 - (item.lat / 90) * 120;
          const color =
            item.sentiment === "bullish" ? "#2ee6a8" : item.sentiment === "bearish" ? "#ff5c72" : "#f5b94a";
          return (
            <g key={item.id}>
              <circle cx={x} cy={y} r="8" fill={color} opacity="0.2" className="pulse-dot" />
              <circle cx={x} cy={y} r="3" fill={color} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function EarthRadar() {
  const [news, setNews] = useState(MOCK_NEWS);

  useEffect(() => {
    const interval = setInterval(() => {
      setNews((prev) => {
        const rotated = [...prev.slice(1), { ...prev[0], timeAgo: "just now" }];
        return rotated;
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="radar" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Earth Radar</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">Live geolocated signals</h2>
          <p className="text-text-muted max-w-xl mb-8 sm:mb-12">
            Crypto news events mapped to their origin. Each pulse connects to our analysis pipeline.
          </p>
        </ScrollReveal>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <ScrollReveal delay={0.1}>
            <GlobeSVG dots={news} />
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="space-y-3">
              {news.map((item) => (
                <GlassCard key={item.id} className="!p-4 hover:border-accent/20 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <span className="text-xs text-text-muted font-mono-data">
                      {item.location} · {item.country} · {item.timeAgo}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border uppercase tracking-wider ${sentimentColors[item.sentiment]}`}
                    >
                      {item.sentiment}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed mb-2">{item.headline}</p>
                  <div className="flex items-center gap-3 text-xs text-text-muted">
                    <span className="px-2 py-0.5 bg-white/5">{item.source}</span>
                    <span className="px-2 py-0.5 bg-white/5">{item.marketTag}</span>
                    <span className="text-accent font-mono-data">{item.connected} connected</span>
                  </div>
                </GlassCard>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
