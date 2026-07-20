"use client";

import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";

const messages = [
  {
    role: "user" as const,
    text: "Should I add to my BTC position here?",
  },
  {
    role: "bot" as const,
    text: "BTC/USDT is at $94,832 (+1.2% 24h). RSI(14) at 58 — not overbought. Price sits above the 50 EMA ($93,400) with positive MACD momentum. Funding is mild at 0.008%. Risk: adding here with a stop below $93,120 (1.8% risk) aligns with the current LONG verdict. Not financial advice.",
  },
];

export function CopilotMock() {
  return (
    <section id="copilot" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <ScrollReveal>
          <p className="text-xs tracking-[0.3em] text-accent uppercase mb-3">Copilot</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Your trading assistant</h2>
          <p className="text-text-muted mb-12">
            Scope-locked to crypto. Every answer anchored to live price data — never stale numbers.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.15}>
          <GlassCard className="!p-6 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-accent/15 text-text-primary rounded-tr-sm"
                      : "bg-white/5 text-text-muted rounded-tl-sm"
                  }`}
                >
                  {msg.role === "bot" ? (
                    <p>
                      {msg.text.split(/(\$[\d,]+\.?\d*)/g).map((part, j) =>
                        part.startsWith("$") ? (
                          <span key={j} className="text-bull font-mono-data">
                            {part}
                          </span>
                        ) : (
                          part
                        )
                      )}
                    </p>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                type="text"
                placeholder="Ask about any Binance pair..."
                className="flex-1 bg-white/5 border border-white/8 rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40 min-w-0"
                readOnly
              />
              <button className="w-full sm:w-auto px-4 py-2.5 bg-accent text-bg-primary rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors shrink-0">
                Send
              </button>
            </div>
          </GlassCard>
        </ScrollReveal>
      </div>
    </section>
  );
}
