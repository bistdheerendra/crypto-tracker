import { NextRequest, NextResponse } from "next/server";
import { generateText, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getPrice, get24hTicker } from "@/lib/binance";
import { fetchLiveNews } from "@/lib/radar/news";
import { getOpenVerdicts } from "@/lib/verdicts/store";

type ProviderId = "gemini" | "anthropic";

const SYSTEM_PROMPT = [
  "You are Dheerendra Intelligence Copilot inside DeepCurrent, a crypto market intelligence app.",
  "Be concise, practical, and risk-aware. Never claim certainty. Always end with: Not financial advice.",
  "Use the live market snapshot and optional verdict/news context. If data is missing, say so.",
  "Do not invent indicator values that are not provided.",
].join(" ");

function extractSymbol(message: string): string {
  const pairMatch = message.match(/\b(BTC|ETH|SOL|BNB|XRP|PAXG)\b/i);
  return pairMatch ? `${pairMatch[1].toUpperCase()}/USDT` : "BTC/USDT";
}

function geminiApiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    undefined
  );
}

function hasGemini(): boolean {
  return !!geminiApiKey();
}

function hasAnthropic(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

function isLlmConfigured(): boolean {
  return hasGemini() || hasAnthropic();
}

/** Resolve which provider + model to use from UI selection + available keys. */
function resolveModel(requested?: string): {
  provider: ProviderId;
  modelId: string;
  model: LanguageModel;
} | null {
  const wantGemini =
    !requested ||
    requested.startsWith("gemini") ||
    requested === "gemini-flash";
  const wantClaude =
    requested?.startsWith("claude") || requested === "claude-sonnet-5";

  if (wantGemini && hasGemini()) {
    const google = createGoogleGenerativeAI({ apiKey: geminiApiKey() });
    // Free-tier friendly Flash model
    const modelId = "gemini-2.5-flash";
    return { provider: "gemini", modelId, model: google(modelId) };
  }

  if ((wantClaude || !hasGemini()) && hasAnthropic()) {
    const modelId = "claude-sonnet-4-5";
    return { provider: "anthropic", modelId, model: anthropic(modelId) };
  }

  // Claude requested but only Gemini available
  if (hasGemini()) {
    const google = createGoogleGenerativeAI({ apiKey: geminiApiKey() });
    const modelId = "gemini-2.5-flash";
    return { provider: "gemini", modelId, model: google(modelId) };
  }

  return null;
}

function templateReply(
  message: string,
  symbol: string,
  price: number,
  change24h: number
): string {
  const lower = message.toLowerCase();
  const formatted = `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const changeStr = `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`;

  if (lower.includes("price") || lower.includes("at")) {
    return `${symbol} is currently at ${formatted} (${changeStr} 24h). Price is ${change24h >= 0 ? "trending up" : "trending down"} on the day. Check the Analyze page for full lane breakdown. Not financial advice.`;
  }

  if (lower.includes("add") || lower.includes("buy") || lower.includes("should i")) {
    const rsi = 50 + change24h * 3;
    return `${symbol} at ${formatted} (${changeStr} 24h). RSI estimate ~${rsi.toFixed(0)}. ${change24h > 0 ? "Momentum is positive but consider waiting for a pullback to add." : "Downside pressure present — wait for support confirmation before adding."} Use the scenario simulator to stress-test your position. Not financial advice.`;
  }

  if (lower.includes("rsi") || lower.includes("indicator")) {
    const rsi = 50 + change24h * 3;
    return `${symbol} at ${formatted}. Estimated RSI(14): ${rsi.toFixed(0)}. MACD momentum is ${change24h > 0 ? "positive" : "negative"}. Run the full Technical lane on the Analyze page for precise indicator values. Not financial advice.`;
  }

  return `${symbol} is at ${formatted} (${changeStr} 24h). I can help with price checks, indicator context, and risk framing. Set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY for full LLM answers. Not financial advice.`;
}

async function buildContext(symbol: string): Promise<string> {
  const parts: string[] = [];

  try {
    const open = await getOpenVerdicts();
    const forPair = open
      .filter((v) => v.pair === symbol)
      .slice(0, 3)
      .map(
        (v) =>
          `${v.direction} ${v.confidenceTier} ${v.timeframe} entry=${v.entryPrice} sl=${v.stopLoss} tp1=${v.takeProfit1}`
      );
    if (forPair.length) {
      parts.push(`Open DeepCurrent verdicts for ${symbol}:\n- ${forPair.join("\n- ")}`);
    } else {
      const any = open.slice(0, 3).map(
        (v) =>
          `${v.pair} ${v.direction} ${v.confidenceTier} ${v.timeframe}`
      );
      if (any.length) {
        parts.push(`Recent open verdicts (any pair):\n- ${any.join("\n- ")}`);
      }
    }
  } catch {
    // optional context
  }

  try {
    const news = await fetchLiveNews();
    const headlines = news.slice(0, 5).map((n) => `[${n.sentiment}] ${n.headline}`);
    if (headlines.length) {
      parts.push(`Recent crypto headlines:\n- ${headlines.join("\n- ")}`);
    }
  } catch {
    // optional context
  }

  return parts.join("\n\n");
}

export async function POST(req: NextRequest) {
  let body: { message?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const symbol = extractSymbol(message);

  try {
    const [price, ticker] = await Promise.all([
      getPrice(symbol),
      get24hTicker(symbol),
    ]);
    const change24h = parseFloat(String(ticker.priceChangePercent ?? 0));
    const formatted = `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    const changeStr = `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`;

    if (!isLlmConfigured()) {
      return NextResponse.json({
        reply: templateReply(message, symbol, price, change24h),
        symbol,
        price,
        mode: "template",
      });
    }

    const resolved = resolveModel(body.model);
    if (!resolved) {
      return NextResponse.json({
        reply: templateReply(message, symbol, price, change24h),
        symbol,
        price,
        mode: "template",
      });
    }

    const extraContext = await buildContext(symbol);

    const { text } = await generateText({
      model: resolved.model,
      system: SYSTEM_PROMPT,
      prompt: [
        `User question: ${message}`,
        "",
        `Live market: ${symbol} at ${formatted} (${changeStr} 24h).`,
        extraContext || "No extra verdict/news context available.",
      ].join("\n"),
      maxOutputTokens: 700,
    });

    return NextResponse.json({
      reply: text.trim() || templateReply(message, symbol, price, change24h),
      symbol,
      price,
      mode: "llm",
      provider: resolved.provider,
      model: resolved.modelId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[copilot]", msg);

    try {
      const [price, ticker] = await Promise.all([
        getPrice(symbol),
        get24hTicker(symbol),
      ]);
      const change24h = parseFloat(String(ticker.priceChangePercent ?? 0));
      return NextResponse.json({
        reply: templateReply(message, symbol, price, change24h),
        symbol,
        price,
        mode: "template-fallback",
        warning: msg,
      });
    } catch {
      return NextResponse.json(
        { error: "Live market data unavailable. Try again shortly." },
        { status: 503 }
      );
    }
  }
}
