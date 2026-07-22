import type { Tier } from "@/lib/types";
import { TRACKED_PAIRS } from "@/lib/market/constants";

export type AlertPrefs = {
  enabled: boolean;
  minTier: Tier;
  watchlist: string[];
  /** Telegram chat id (numeric string). Falls back to TELEGRAM_CHAT_ID env. */
  chatId: string;
  radarWhales: boolean;
  radarLiquidations: boolean;
  radarEtf: boolean;
};

export const DEFAULT_ALERT_PREFS: AlertPrefs = {
  enabled: true,
  minTier: "HIGH",
  watchlist: [...TRACKED_PAIRS],
  chatId: "",
  radarWhales: true,
  radarLiquidations: true,
  radarEtf: true,
};

export type AlertSendResult = {
  ok: boolean;
  skipped?: string;
  error?: string;
  messageId?: number;
};
