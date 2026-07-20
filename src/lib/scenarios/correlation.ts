import { getKlines } from "@/lib/binance";
import { TRACKED_PAIRS } from "@/lib/market/constants";

function pctReturns(closes: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] === 0) continue;
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0.7;
  const xs = a.slice(-n);
  const ys = b.slice(-n);
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return parseFloat((num / den).toFixed(3));
}

export async function computeCorrelationMatrix(
  pairs: readonly string[] = TRACKED_PAIRS,
  benchmark = "BTC/USDT"
): Promise<Record<string, number>> {
  const unique = [...new Set([benchmark, ...pairs.filter((p) => p !== benchmark)])];
  const klineMap = new Map<string, number[]>();

  await Promise.all(
    unique.map(async (pair) => {
      try {
        const klines = await getKlines(pair, "1h", 168);
        klineMap.set(
          pair,
          klines.map((k) => parseFloat(String(k[4])))
        );
      } catch {
        klineMap.set(pair, []);
      }
    })
  );

  const btcReturns = pctReturns(klineMap.get(benchmark) ?? []);
  const matrix: Record<string, number> = {};

  for (const pair of unique) {
    if (pair === benchmark) continue;
    const returns = pctReturns(klineMap.get(pair) ?? []);
    matrix[pair] = pearson(btcReturns, returns);
  }

  return matrix;
}
