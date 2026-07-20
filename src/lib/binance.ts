const BINANCE_BASE = "https://api.binance.com/api/v3";

export async function getPrice(symbol: string): Promise<number> {
  const pair = symbol.replace("/", "");
  const res = await fetch(`${BINANCE_BASE}/ticker/price?symbol=${pair}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Binance price fetch failed for ${pair}`);
  const data = await res.json();
  return parseFloat(data.price);
}

export async function getKlines(
  symbol: string,
  interval = "1h",
  limit = 100
): Promise<(string | number)[][]> {
  const pair = symbol.replace("/", "");
  const res = await fetch(
    `${BINANCE_BASE}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`,
    { next: { revalidate: 60 } }
  );
  if (!res.ok) throw new Error(`Binance klines fetch failed for ${pair}`);
  return res.json();
}

export async function get24hTicker(symbol: string) {
  const pair = symbol.replace("/", "");
  const res = await fetch(`${BINANCE_BASE}/ticker/24hr?symbol=${pair}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`Binance 24h ticker failed for ${pair}`);
  return res.json();
}

export function computeEMA(prices: number[], period: number): number {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

export function computeRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}
