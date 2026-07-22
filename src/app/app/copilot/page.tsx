"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";

const AI_MODELS = [
  { id: "gemini-flash", label: "Gemini 2.5 Flash (free)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 4.5" },
] as const;

interface Message {
  role: "user" | "bot";
  text: string;
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "I'm your Dheerendra Intelligence copilot. Ask about BTC/ETH/SOL… — set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY for LLM answers with live price, verdicts & headlines. Not financial advice.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(AI_MODELS[0].id);

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
        body: JSON.stringify({ message: userMsg, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: "bot", text: data.error ?? "Could not get a response." },
        ]);
        return;
      }
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
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col min-h-[calc(100dvh-3.5rem)] lg:min-h-screen">
      <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold mb-1">Copilot</h1>
          <p className="text-text-muted text-sm">Crypto-trading Q&amp;A with live price context.</p>
        </div>
        <div className="w-full sm:w-auto">
          <label
            htmlFor="copilot-model"
            className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5 block"
          >
            AI model
          </label>
          <select
            id="copilot-model"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={loading}
            className="w-full sm:min-w-48 bg-bg-card border border-white/8 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {AI_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <GlassCard className="flex-1 flex flex-col !p-0 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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

        <form onSubmit={sendMessage} className="p-3 sm:p-4 border-t border-white/8 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about BTC, ETH, SOL..."
            className="flex-1 bg-white/5 border border-white/8 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent/40 min-w-0"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-5 py-2.5 bg-accent text-bg-primary rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors disabled:opacity-50 shrink-0"
          >
            Send
          </button>
        </form>
      </GlassCard>
    </div>
  );
}
