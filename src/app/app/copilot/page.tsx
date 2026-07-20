"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";

interface Message {
  role: "user" | "bot";
  text: string;
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "I'm your DeepCurrent copilot. Ask me about any Binance-listable crypto pair — I'll anchor every answer to live price data. Not financial advice.",
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
      setMessages((prev) => [...prev, { role: "bot", text: data.reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Sorry, I couldn't process that request. Please try again." },
      ]);
    }
    setLoading(false);
  }

  return (
    <div className="p-8 flex flex-col h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Copilot</h1>
        <p className="text-text-muted text-sm">Crypto-trading Q&A with live price context.</p>
      </div>

      <GlassCard className="flex-1 flex flex-col !p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-accent/15 text-text-primary rounded-tr-sm"
                    : "bg-white/5 text-text-muted rounded-tl-sm"
                }`}
              >
                {msg.text.split(/(\$[\d,]+\.?\d*)/g).map((part, j) =>
                  part.startsWith("$") ? (
                    <span key={j} className="text-bull font-mono-data">{part}</span>
                  ) : (
                    <span key={j}>{part}</span>
                  )
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white/5 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-accent/50 pulse-dot" style={{ animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t border-white/8 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about BTC, ETH, SOL..."
            className="flex-1 bg-white/5 border border-white/8 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent/40"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-accent text-bg-primary rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </GlassCard>
    </div>
  );
}
