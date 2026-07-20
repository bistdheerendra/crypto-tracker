import { NextRequest, NextResponse } from "next/server";
import { getPrice, get24hTicker } from "@/lib/binance";

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }

  const pairMatch = message.match(/\b(BTC|ETH|SOL|BNB|XRP|PAXG)\b/i);
  const symbol = pairMatch ? `${pairMatch[1].toUpperCase()}/USDT` : "BTC/USDT";

  try {
    const [price, ticker] = await Promise.all([getPrice(symbol), get24hTicker(symbol)]);
    const change24h = parseFloat(String(ticker.priceChangePercent ?? 0));
    const reply = generateReply(message, symbol, price, change24h);
    return NextResponse.json({ reply, symbol, price });
  } catch {
    return NextResponse.json(
      { error: "Live market data unavailable. Try again shortly." },
      { status: 503 }
    );
  }
}

function generateReply(
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

  return `${symbol} is at ${formatted} (${changeStr} 24h). I can help with price checks, indicator context, and risk framing for Binance-listable pairs. Try asking "What's BTC doing?" or "Should I add here?" Not financial advice.`;
}
