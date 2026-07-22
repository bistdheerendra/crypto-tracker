import { NextRequest, NextResponse } from "next/server";
import { runAnalysis } from "@/lib/analysis/run-analysis";

export async function GET(req: NextRequest) {
  const pair = req.nextUrl.searchParams.get("pair") || "BTC/USDT";
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "1h";

  try {
    const result = await runAnalysis(pair, timeframe);
    return NextResponse.json({
      lanes: result.lanes,
      verdict: result.verdict,
      price: result.price,
      dataSources: result.dataSources,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
