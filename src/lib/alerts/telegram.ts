import type { AlertSendResult } from "./types";

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN?.trim();
}

/**
 * Send a plain-text Telegram message via Bot API.
 * Requires TELEGRAM_BOT_TOKEN. chatId from prefs or TELEGRAM_CHAT_ID.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<AlertSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, skipped: "TELEGRAM_BOT_TOKEN not set" };
  }
  if (!chatId) {
    return { ok: false, skipped: "Telegram chat id not set" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    const data = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number };
    };

    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data.description ?? `Telegram HTTP ${res.status}`,
      };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
