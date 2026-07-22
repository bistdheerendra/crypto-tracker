import { getCached, setCache } from "@/lib/backtest/cache";
import { TRACKED_PAIRS } from "@/lib/market/constants";
import type { Tier } from "@/lib/types";
import { DEFAULT_ALERT_PREFS, type AlertPrefs } from "./types";

const PREFS_KEY = "alerts:prefs";
/** Long TTL — prefs are also mirrored in memory for cold-start gaps. */
const PREFS_TTL_MS = 365 * 24 * 60 * 60 * 1000;

const VALID_TIERS = new Set<Tier>(["HIGH", "MODERATE", "LOW"]);

function normalizePrefs(raw: Partial<AlertPrefs> | null | undefined): AlertPrefs {
  const watchlist =
    Array.isArray(raw?.watchlist) && raw.watchlist.length > 0
      ? raw.watchlist.filter((p): p is string => typeof p === "string")
      : [...TRACKED_PAIRS];

  const minTier =
    raw?.minTier && VALID_TIERS.has(raw.minTier) ? raw.minTier : DEFAULT_ALERT_PREFS.minTier;

  return {
    enabled: raw?.enabled !== false,
    minTier,
    watchlist,
    chatId: typeof raw?.chatId === "string" ? raw.chatId.trim() : "",
    radarWhales: raw?.radarWhales !== false,
    radarLiquidations: raw?.radarLiquidations !== false,
    radarEtf: raw?.radarEtf !== false,
  };
}

export async function getAlertPrefs(): Promise<AlertPrefs> {
  const stored = await getCached<AlertPrefs>(PREFS_KEY);
  const prefs = normalizePrefs(stored ?? undefined);

  // Env chat id fills empty UI value (solo-user default).
  if (!prefs.chatId && process.env.TELEGRAM_CHAT_ID) {
    prefs.chatId = process.env.TELEGRAM_CHAT_ID.trim();
  }

  return prefs;
}

export async function saveAlertPrefs(
  patch: Partial<AlertPrefs>
): Promise<AlertPrefs> {
  const current = await getAlertPrefs();
  const next = normalizePrefs({ ...current, ...patch });
  await setCache(PREFS_KEY, next, PREFS_TTL_MS);
  return next;
}

export function resolveChatId(prefs: AlertPrefs): string | null {
  const id = (prefs.chatId || process.env.TELEGRAM_CHAT_ID || "").trim();
  return id || null;
}
