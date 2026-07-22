"use client";

import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import type { AlertPrefs } from "@/lib/alerts/types";
import type { Tier } from "@/lib/types";
import { Send, Bell, User, Loader2 } from "lucide-react";

type SettingsResponse = {
  prefs: AlertPrefs;
  telegram: { botConfigured: boolean; chatIdSet: boolean };
};

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [telegramMeta, setTelegramMeta] = useState({
    botConfigured: false,
    chatIdSet: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings");
      const data = (await res.json()) as SettingsResponse;
      if (!res.ok) throw new Error("Failed to load settings");
      setPrefs(data.prefs);
      setTelegramMeta(data.telegram);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<AlertPrefs>) {
    if (!prefs) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as SettingsResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setPrefs(data.prefs);
      setTelegramMeta(data.telegram);
      setStatus("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function testTelegram() {
    setTesting(true);
    setStatus(null);
    setError(null);
    try {
      // Persist chat id first if edited
      if (prefs) {
        await save({ chatId: prefs.chatId });
      }
      const res = await fetch("/api/settings/test-telegram", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      setStatus("Test alert sent — check Telegram.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  if (loading || !prefs) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-2xl flex items-center gap-2 text-text-muted">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading settings…
      </div>
    );
  }

  const linked = telegramMeta.botConfigured && telegramMeta.chatIdSet;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-bold mb-1">Settings</h1>
      <p className="text-text-muted text-sm mb-6 sm:mb-8">
        Telegram alerts and watchlist for your solo DeepCurrent setup.
      </p>

      {(status || error) && (
        <p
          className={`text-sm mb-4 ${error ? "text-bear" : "text-bull"}`}
          role="status"
        >
          {error ?? status}
        </p>
      )}

      <GlassCard className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Account</h2>
        </div>
        <p className="text-sm text-text-muted">
          Solo mode — no auth. Alert prefs persist server-side (Redis or memory).
        </p>
      </GlassCard>

      <GlassCard className="mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Send className="w-5 h-5 text-accent" />
          <h2 className="font-semibold">Telegram</h2>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            1. Create a bot with{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              @BotFather
            </a>
            , put token in <code className="font-mono-data text-xs">TELEGRAM_BOT_TOKEN</code>.
            <br />
            2. Message your bot once, then get your chat id from{" "}
            <a
              href="https://t.me/userinfobot"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              @userinfobot
            </a>{" "}
            (or set <code className="font-mono-data text-xs">TELEGRAM_CHAT_ID</code>).
          </p>

          <p className={`text-sm ${linked ? "text-bull" : "text-text-muted"}`}>
            {telegramMeta.botConfigured
              ? linked
                ? "✓ Bot configured · chat id set"
                : "Bot configured — add your chat id below"
              : "TELEGRAM_BOT_TOKEN not set in env"}
          </p>

          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
              Chat ID
            </label>
            <input
              type="text"
              value={prefs.chatId}
              onChange={(e) =>
                setPrefs((p) => (p ? { ...p, chatId: e.target.value } : p))
              }
              placeholder="e.g. 123456789"
              className="w-full bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm font-mono-data text-text-primary focus:outline-none focus:border-accent/40"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save({ chatId: prefs.chatId })}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent/15 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"
            >
              Save chat ID
            </button>
            <button
              type="button"
              disabled={testing || !telegramMeta.botConfigured}
              onClick={() => void testTelegram()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#2AABEE]/15 text-[#2AABEE] border border-[#2AABEE]/30 rounded-lg text-sm font-medium hover:bg-[#2AABEE]/25 transition-colors disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send test alert
            </button>
          </div>
        </div>
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
              checked={prefs.enabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setPrefs((p) => (p ? { ...p, enabled } : p));
                void save({ enabled });
              }}
              className="accent-accent w-4 h-4"
            />
            <span className="text-sm">Enable Telegram alerts</span>
          </label>

          <div>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-1.5 block">
              Minimum confidence tier (verdicts)
            </label>
            <select
              value={prefs.minTier}
              onChange={(e) => {
                const minTier = e.target.value as Tier;
                setPrefs((p) => (p ? { ...p, minTier } : p));
                void save({ minTier });
              }}
              className="w-full sm:w-auto bg-bg-card border border-white/8 rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent/40"
            >
              <option value="HIGH">HIGH only</option>
              <option value="MODERATE">MODERATE and above</option>
              <option value="LOW">All signals</option>
            </select>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/8">
            <p className="text-xs text-text-muted uppercase tracking-wider">
              Radar spikes
            </p>
            {(
              [
                ["radarWhales", "Whale transfers (≥ ~$5M)"],
                ["radarLiquidations", "Liquidations (≥ ~$1M)"],
                ["radarEtf", "ETF net flows (≥ ~$50M)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setPrefs((p) => (p ? { ...p, [key]: value } : p));
                    void save({ [key]: value });
                  }}
                  className="accent-accent w-4 h-4"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="font-semibold mb-4">Watchlist</h2>
        <p className="text-xs text-text-muted mb-3">
          Verdict alerts only fire for checked pairs.
        </p>
        <div className="space-y-2">
          {TRACKED_PAIRS.map((pair) => (
            <label key={pair} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.watchlist.includes(pair)}
                onChange={(e) => {
                  const watchlist = e.target.checked
                    ? [...prefs.watchlist, pair]
                    : prefs.watchlist.filter((p) => p !== pair);
                  setPrefs((p) => (p ? { ...p, watchlist } : p));
                  void save({ watchlist });
                }}
                className="accent-accent w-4 h-4"
              />
              <span className="text-sm font-mono-data">{pair}</span>
            </label>
          ))}
        </div>
        {saving && (
          <p className="text-xs text-text-muted mt-3 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving…
          </p>
        )}
      </GlassCard>
    </div>
  );
}
