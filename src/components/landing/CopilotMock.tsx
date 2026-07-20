"use client";

import { useState } from "react";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { GlassCard } from "@/components/ui/GlassCard";

interface Message {
  role: "user" | "bot";
  text: string;
}

export function CopilotMock() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "Ask me about any Binance-listable pair — every answer uses live price data. Not financial advice.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: data.reply ?? data.error ?? "Could not get a response." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Sorry, I couldn't reach the copilot service." },
      ]);
    }
    setLoading(false);
  }

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
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-text-muted">
                  Thinking…
                </div>
              </div>
            )}
            <form onSubmit={sendMessage} className="flex flex-col sm:flex-row gap-2 pt-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about any Binance pair..."
                className="flex-1 bg-white/5 border border-white/8 rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent/40 min-w-0"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto px-4 py-2.5 bg-accent text-bg-primary rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors shrink-0 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </GlassCard>
        </ScrollReveal>
      </div>
    </section>
  );
}
