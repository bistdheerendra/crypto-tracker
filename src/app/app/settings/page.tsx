"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import { Send, Bell, User } from "lucide-react";

export default function SettingsPage() {
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([...TRACKED_PAIRS]);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [minTier, setMinTier] = useState("HIGH");

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Settings</h1>
      <p className="text-text-muted text-sm mb-6 sm:mb-8">Manage your account, Telegram, and alert preferences.</p>

      <GlassCard className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Account</h2>
        </div>
        <p className="text-sm text-text-muted">Full access enabled — no plans or usage limits.</p>
      </GlassCard>

      <GlassCard className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Send className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Telegram</h2>
        </div>
        {telegramLinked ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="text-sm text-bull">✓ Connected to @your_username</p>
            <button
              onClick={() => setTelegramLinked(false)}
              className="text-xs text-bear hover:underline"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-text-muted mb-3">
              Link your Telegram to receive signal alerts in real time.
            </p>
            <a
              href="https://t.me/DeepCurrentBot?start=link_token"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setTelegramLinked(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#2AABEE]/15 text-[#2AABEE] border border-[#2AABEE]/30 rounded-lg text-sm font-medium hover:bg-[#2AABEE]/25 transition-colors"
            >
              <Send className="w-4 h-4" />
              Link Telegram Bot
            </a>
          </div>
        )}
      </GlassCard>

      <GlassCard className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Alert Preferences</h2>
        </div>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              className="accent-accent w-4 h-4"
            />
            <span className="text-sm">Enable Telegram alerts</span>
          </label>
          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
              Minimum confidence tier
            </label>
            <select
              value={minTier}
              onChange={(e) => setMinTier(e.target.value)}
              className="w-full sm:w-auto bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/40"
            >
              <option value="HIGH">HIGH only</option>
              <option value="MODERATE">MODERATE and above</option>
              <option value="LOW">All signals</option>
            </select>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-semibold mb-4">Watchlist</h2>
        <div className="space-y-2">
          {TRACKED_PAIRS.map((pair) => (
            <label key={pair} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={watchlist.includes(pair)}
                onChange={(e) => {
                  if (e.target.checked) setWatchlist((prev) => [...prev, pair]);
                  else setWatchlist((prev) => prev.filter((p) => p !== pair));
                }}
                className="accent-accent w-4 h-4"
              />
              <span className="text-sm font-mono-data">{pair}</span>
            </label>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
