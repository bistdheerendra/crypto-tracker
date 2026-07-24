import { runAnalysis } from "@/lib/analysis/run-analysis";
import { buildMlFeatureVector } from "@/lib/ml/build-feature-vector";
import { getMlEdge } from "@/lib/ml/predict";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const pair = req.nextUrl.searchParams.get("pair") || "BTC/USDT";
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "1h";

  try {
    const result = await runAnalysis(pair, timeframe);

    // Display-only — never persisted. Failures → null (no badge).
    let mlEdge: { winProbability: number; modelVersion: string } | null = null;
    if (result.verdict.direction !== "NEUTRAL" && result.features) {
      try {
        const vector = buildMlFeatureVector(
          result.features,
          result.verdict.direction
        );
        mlEdge = await getMlEdge(vector);
      } catch (err) {
        console.warn(
          "[ml] getMlEdge threw:",
          err instanceof Error ? err.message : String(err)
        );
        mlEdge = null;
      }
    }

    return NextResponse.json({
      lanes: result.lanes,
      verdict: result.verdict,
      price: result.price,
      dataSources: result.dataSources,
      mlEdge,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
