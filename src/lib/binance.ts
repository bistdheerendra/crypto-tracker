const BINANCE_ENDPOINTS = [
  "https://data-api.binance.vision/api/v3",
  "https://api.binance.com/api/v3",
];

const COINGECKO_IDS: Record<string, string> = {
  "BTC/USDT": "bitcoin",
  "ETH/USDT": "ethereum",
  "SOL/USDT": "solana",
  "BNB/USDT": "binancecoin",
  "XRP/USDT": "ripple",
  "PAXG/USDT": "pax-gold",
};

async function fetchBinance(path: string) {
  let lastError: Error | null = null;

  for (const base of BINANCE_ENDPOINTS) {
    try {
      const res = await fetch(`${base}${path}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Binance ${res.status} for ${path}`);
      return res.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Binance fetch failed");
}

async function getPriceFromCoinGecko(symbol: string): Promise<number> {
  const id = COINGECKO_IDS[symbol];
  if (!id) throw new Error(`No CoinGecko mapping for ${symbol}`);

  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`CoinGecko price fetch failed for ${symbol}`);

  const data = await res.json();
  const price = data[id]?.usd;
  if (typeof price !== "number") throw new Error(`CoinGecko price missing for ${symbol}`);
  return price;
}

export async function getPrice(symbol: string): Promise<number> {
  const pair = symbol.replace("/", "");

  try {
    const data = await fetchBinance(`/ticker/price?symbol=${pair}`);
    return parseFloat(data.price);
  } catch {
    return getPriceFromCoinGecko(symbol);
  }
}

export async function getKlines(
  symbol: string,
  interval = "1h",
  limit = 100
): Promise<(string | number)[][]> {
  const pair = symbol.replace("/", "");
  return fetchBinance(`/klines?symbol=${pair}&interval=${interval}&limit=${limit}`);
}

export async function get24hTicker(symbol: string) {
  const pair = symbol.replace("/", "");
  return fetchBinance(`/ticker/24hr?symbol=${pair}`);
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
