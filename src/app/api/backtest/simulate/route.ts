import { NextRequest, NextResponse } from "next/server";
import { runSimulator } from "@/lib/backtest/simulator";
import { queryVerdicts } from "@/lib/verdicts/store";
import type { Tier } from "@/lib/types";

function parseDateRange(
  range: string,
  customFrom?: string | null,
  customTo?: string | null
): { from: Date; to: Date } {
  const to = customTo ? new Date(customTo) : new Date();
  if (range === "custom" && customFrom) {
    return { from: new Date(customFrom), to };
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const from = new Date(to.getTime() - days * 86400000);
  return { from, to };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    pair = "BTC/USDT",
    dateRange = "30d",
    customFrom,
    customTo,
    minTier = "LOW",
    startingCapital = 10000,
    riskPerTrade = 1,
  } = body;

  const { from, to } = parseDateRange(dateRange, customFrom, customTo);
  const verdicts = queryVerdicts({
    pair,
    from,
    to,
    minTier: minTier as Tier,
    resolvedOnly: true,
  });

  const result = runSimulator(verdicts, Number(startingCapital), Number(riskPerTrade));
  return NextResponse.json({
    ...result,
    pair,
    dateRange,
    from: from.toISOString(),
    to: to.toISOString(),
    minTier,
  });
}
