import { NextResponse } from "next/server";
import { getAlertPrefs, resolveChatId } from "@/lib/alerts/prefs";
import { isTelegramConfigured, sendTelegramMessage } from "@/lib/alerts/telegram";

export async function POST() {
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { error: "Set TELEGRAM_BOT_TOKEN in env first." },
      { status: 400 }
    );
  }

  const prefs = await getAlertPrefs();
  const chatId = resolveChatId(prefs);
  if (!chatId) {
    return NextResponse.json(
      {
        error:
          "Set your Telegram chat id in Settings (or TELEGRAM_CHAT_ID in env).",
      },
      { status: 400 }
    );
  }

  const result = await sendTelegramMessage(
    chatId,
    [
      "DeepCurrent test alert ✓",
      "Telegram is linked. You will get HIGH verdict + radar spike alerts when enabled.",
      new Date().toISOString(),
    ].join("\n")
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? result.skipped ?? "Send failed" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
