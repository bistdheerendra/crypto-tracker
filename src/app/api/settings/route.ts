import { NextRequest, NextResponse } from "next/server";
import { getAlertPrefs, saveAlertPrefs } from "@/lib/alerts/prefs";
import type { AlertPrefs } from "@/lib/alerts/types";
import { isTelegramConfigured } from "@/lib/alerts/telegram";
import type { Tier } from "@/lib/types";

const VALID_TIERS = new Set<Tier>(["HIGH", "MODERATE", "LOW"]);

export async function GET() {
  const prefs = await getAlertPrefs();
  return NextResponse.json({
    prefs,
    telegram: {
      botConfigured: isTelegramConfigured(),
      chatIdSet: !!prefs.chatId,
    },
  });
}

export async function PUT(req: NextRequest) {
  let body: Partial<AlertPrefs>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AlertPrefs> = {};

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.chatId === "string") patch.chatId = body.chatId.trim();
  if (typeof body.radarWhales === "boolean") patch.radarWhales = body.radarWhales;
  if (typeof body.radarLiquidations === "boolean") {
    patch.radarLiquidations = body.radarLiquidations;
  }
  if (typeof body.radarEtf === "boolean") patch.radarEtf = body.radarEtf;
  if (Array.isArray(body.watchlist)) {
    patch.watchlist = body.watchlist.filter((p): p is string => typeof p === "string");
  }
  if (body.minTier && VALID_TIERS.has(body.minTier)) {
    patch.minTier = body.minTier;
  }

  const prefs = await saveAlertPrefs(patch);
  return NextResponse.json({
    prefs,
    telegram: {
      botConfigured: isTelegramConfigured(),
      chatIdSet: !!prefs.chatId,
    },
  });
}
