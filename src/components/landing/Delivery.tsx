"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";
import { Send } from "lucide-react";

export function Delivery() {
  return (
    <section id="delivery" className="py-16 sm:py-24 px-4 sm:px-6 bg-bg-secondary/50">
      <div className="max-w-2xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Delivery</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Telegram alerts</h2>
          <p className="text-text-muted mb-12">
            High-confidence signals pushed to your Telegram the moment they&apos;re generated.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <GlassCard className="!p-0 overflow-hidden max-w-sm mx-auto">
            <div className="bg-[#1a2332] px-4 py-3 flex items-center gap-3 border-b border-white/8">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
                <Send className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold">Dheerendra Intelligence Bot</p>
                <p className="text-xs text-text-muted">bot</p>
              </div>
            </div>
            <div className="p-4">
              <div className="bg-[#1e2a3a] rounded-2xl rounded-tl-sm p-4 max-w-[90%]">
                <p className="text-sm mb-3">
                  🟢 <strong>BTC/USDT · 1h · LONG</strong>
                </p>
                <div className="space-y-1 text-xs font-mono-data">
                  <p>
                    Entry: <span className="text-bull">$94,832.50</span>
                  </p>
                  <p>
                    SL: <span className="text-bear">$93,120.00</span>
                  </p>
                  <p>
                    TP1: <span className="text-bull">$97,200.00</span> · TP2:{" "}
                    <span className="text-bull">$99,850.00</span>
                  </p>
                  <p className="text-text-muted mt-2">3/4 lanes aligned · HIGH confidence</p>
                  <p className="text-text-muted/60 mt-1">12:34 UTC · Not financial advice</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </ScrollReveal>
      </div>
    </section>
  );
}
