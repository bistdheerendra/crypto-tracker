import { getCached, setCache } from "@/lib/backtest/cache";
import type { LaneOutput, Tier, Verdict } from "@/lib/types";
import { TIER_ORDER } from "@/lib/verdicts/types";
import { getAlertPrefs, resolveChatId } from "./prefs";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram";
import type { AlertSendResult } from "./types";

const DEDUPE_TTL_MS = 6 * 60 * 60 * 1000;

async function alreadySent(key: string): Promise<boolean> {
  const hit = await getCached<boolean>(`alert:sent:${key}`);
  return !!hit;
}

async function markSent(key: string): Promise<void> {
  await setCache(`alert:sent:${key}`, true, DEDUPE_TTL_MS);
}

function tierMeetsMin(tier: Tier, minTier: Tier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[minTier];
}

function formatVerdictMessage(verdict: Verdict, lanes: LaneOutput[]): string {
  const laneLine = lanes
    .map((l) => `${l.badge}:${l.bias}`)
    .join(" · ");

  return [
    `DeepCurrent ${verdict.tier} ${verdict.direction}`,
    `${verdict.pair} · ${verdict.timeframe}`,
    "",
    `Entry  ${verdict.entry}`,
    `SL     ${verdict.stopLoss}`,
    `TP1    ${verdict.takeProfit1}`,
    `TP2    ${verdict.takeProfit2}`,
    `R:R    ${verdict.riskReward}`,
    "",
    `Lanes  ${laneLine}`,
    "",
    verdict.rationale.slice(0, 280),
    "",
    "Not financial advice.",
  ].join("\n");
}

/** Fire-and-forget safe: never throws to callers. */
export async function notifyVerdictAlert(
  verdict: Verdict,
  lanes: LaneOutput[]
): Promise<AlertSendResult> {
  if (!isTelegramConfigured()) {
    return { ok: false, skipped: "Telegram not configured" };
  }
  if (verdict.direction === "NEUTRAL") {
    return { ok: false, skipped: "NEUTRAL" };
  }

  const prefs = await getAlertPrefs();
  if (!prefs.enabled) {
    return { ok: false, skipped: "alerts disabled" };
  }
  if (!tierMeetsMin(verdict.tier, prefs.minTier)) {
    return { ok: false, skipped: `tier below ${prefs.minTier}` };
  }
  if (prefs.watchlist.length > 0 && !prefs.watchlist.includes(verdict.pair)) {
    return { ok: false, skipped: "pair not on watchlist" };
  }

  const chatId = resolveChatId(prefs);
  if (!chatId) {
    return { ok: false, skipped: "no chat id" };
  }

  // Dedupe: same pair+tf+direction+tier within TTL
  const dedupeKey = `verdict:${verdict.pair}:${verdict.timeframe}:${verdict.direction}:${verdict.tier}`;
  if (await alreadySent(dedupeKey)) {
    return { ok: false, skipped: "duplicate" };
  }

  const result = await sendTelegramMessage(
    chatId,
    formatVerdictMessage(verdict, lanes)
  );
  if (result.ok) {
    await markSent(dedupeKey);
  }
  return result;
}

export async function notifyRadarAlert(
  dedupeKey: string,
  text: string
): Promise<AlertSendResult> {
  if (!isTelegramConfigured()) {
    return { ok: false, skipped: "Telegram not configured" };
  }

  const prefs = await getAlertPrefs();
  if (!prefs.enabled) {
    return { ok: false, skipped: "alerts disabled" };
  }

  const chatId = resolveChatId(prefs);
  if (!chatId) {
    return { ok: false, skipped: "no chat id" };
  }

  if (await alreadySent(dedupeKey)) {
    return { ok: false, skipped: "duplicate" };
  }

  const result = await sendTelegramMessage(chatId, text);
  if (result.ok) {
    await markSent(dedupeKey);
  }
  return result;
}
