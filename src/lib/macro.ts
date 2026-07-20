import { fetchJsonWithTimeout } from "./fetch-utils";

export interface MacroSnapshot {
  dxyChange24hPct: number | null;
  spxChange24hPct: number | null;
  goldChange24hPct: number | null;
  available: boolean;
}

async function getYahooDailyChange(yahooSymbol: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;
    const data = await fetchJsonWithTimeout<{
      chart?: { result?: { indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
    }>(url, 4000);
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((v): v is number => typeof v === "number" && v > 0);
    if (valid.length < 2) return null;

    const prev = valid[valid.length - 2];
    const last = valid[valid.length - 1];
    return ((last - prev) / prev) * 100;
  } catch {
    return null;
  }
}

export async function getMacroSnapshot(): Promise<MacroSnapshot> {
  const [dxyChange24hPct, spxChange24hPct, goldChange24hPct] = await Promise.all([
    getYahooDailyChange("DX-Y.NYB"),
    getYahooDailyChange("^GSPC"),
    getYahooDailyChange("GC=F"),
  ]);

  return {
    dxyChange24hPct,
    spxChange24hPct,
    goldChange24hPct,
    available: [dxyChange24hPct, spxChange24hPct, goldChange24hPct].some((v) => v != null),
  };
}
