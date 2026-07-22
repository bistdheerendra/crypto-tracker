"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { useRadarFeed } from "@/components/radar/useRadarFeed";
import { GlobeStatic } from "@/components/landing/GlobeStatic";
import type { NewsItem } from "@/lib/types";

const GlobeScene = dynamic(
  () =>
    import("@/components/landing/GlobeScene").then((m) => m.GlobeScene),
  { ssr: false, loading: () => <GlobeStatic /> }
);

const sentimentColors = {
  bullish: "text-bull bg-bull/10 border-bull/20",
  bearish: "text-bear bg-bear/10 border-bear/20",
  neutral: "text-mixed bg-mixed/10 border-mixed/20",
};

/** Prefer static globe on small viewports or when the user asks for less motion. */
function usePreferStaticGlobe() {
  // Start static to avoid loading Three.js before we know the viewport / a11y prefs.
  const [preferStatic, setPreferStatic] = useState(true);

  useEffect(() => {
    const mqWidth = window.matchMedia("(max-width: 767px)");
    const mqMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setPreferStatic(mqWidth.matches || mqMotion.matches);
    };
    update();
    mqWidth.addEventListener("change", update);
    mqMotion.addEventListener("change", update);
    return () => {
      mqWidth.removeEventListener("change", update);
      mqMotion.removeEventListener("change", update);
    };
  }, []);

  return preferStatic;
}

export function EarthRadar() {
  const { data: news, loading, error } = useRadarFeed<NewsItem>("news", 60_000);
  const preferStatic = usePreferStaticGlobe();
  const dots = news.slice(0, 8);

  return (
    <section id="radar" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Earth Radar</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">Live geolocated signals</h2>
          <p className="text-text-muted max-w-xl mb-8 sm:mb-12">
            Crypto news from CoinDesk, CoinTelegraph, and Decrypt — refreshed every 60 seconds.
          </p>
        </ScrollReveal>

        {error && (
          <GlassCard className="mb-6 !p-4">
            <p className="text-sm text-bear">{error}</p>
          </GlassCard>
        )}

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <ScrollReveal delay={0.1}>
            <div
              className="relative mx-auto aspect-square w-full max-w-xl"
              role="img"
              aria-label="Interactive live global crypto news map"
            >
              {preferStatic ? (
                <GlobeStatic />
              ) : (
                <GlobeScene dots={dots} />
              )}
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="space-y-3">
              {loading && (
                <GlassCard className="!p-4">
                  <p className="text-sm text-text-muted skeleton h-16" />
                </GlassCard>
              )}
              {!loading && news.length === 0 && (
                <GlassCard className="!p-4">
                  <p className="text-sm text-text-muted">No live news available.</p>
                </GlassCard>
              )}
              {news.slice(0, 6).map((item) => (
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
