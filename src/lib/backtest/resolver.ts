import { getKlines } from "../binance";
import { resolveVerdict, getOpenVerdicts } from "../verdicts/store";
import type { StoredVerdict, VerdictOutcome } from "../verdicts/types";

const MIN_AGE_MS = 5 * 60 * 1000;
const MAX_HOLD_MS = 48 * 60 * 60 * 1000;

function checkCandleOutcome(
  v: StoredVerdict,
  highs: number[],
  lows: number[],
  closes: number[],
  timestamps: number[]
): {
  outcome: VerdictOutcome;
  outcomePrice: number;
  outcomeAt: string;
  rMultiple: number;
} | null {
  const isLong = v.direction === "LONG";
  const isShort = v.direction === "SHORT";
  if (!isLong && !isShort) return null;

  const risk = Math.abs(v.entryPrice - v.stopLoss) || v.entryPrice * 0.01;
  const created = new Date(v.createdAt).getTime();
  const expiry = created + MAX_HOLD_MS;

  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] < created) continue;
    const high = highs[i];
    const low = lows[i];
    const ts = timestamps[i];

    if (isLong) {
      const slHit = low <= v.stopLoss;
      const tp2Hit = high >= v.takeProfit2;
      const tp1Hit = high >= v.takeProfit1;
      if (slHit && (!tp1Hit || v.stopLoss >= v.entryPrice)) {
        return {
          outcome: "sl_hit",
          outcomePrice: v.stopLoss,
          outcomeAt: new Date(ts).toISOString(),
          rMultiple: -1,
        };
      }
      if (tp2Hit) {
        return {
          outcome: "tp2_hit",
          outcomePrice: v.takeProfit2,
          outcomeAt: new Date(ts).toISOString(),
          rMultiple: parseFloat((Math.abs(v.takeProfit2 - v.entryPrice) / risk).toFixed(2)),
        };
      }
      if (tp1Hit) {
        return {
          outcome: "tp1_hit",
          outcomePrice: v.takeProfit1,
          outcomeAt: new Date(ts).toISOString(),
          rMultiple: parseFloat((Math.abs(v.takeProfit1 - v.entryPrice) / risk).toFixed(2)),
        };
      }
      if (slHit) {
        return {
          outcome: "sl_hit",
          outcomePrice: v.stopLoss,
          outcomeAt: new Date(ts).toISOString(),
          rMultiple: -1,
        };
      }
    }

    if (isShort) {
      const slHit = high >= v.stopLoss;
      const tp2Hit = low <= v.takeProfit2;
      const tp1Hit = low <= v.takeProfit1;
      if (slHit && (!tp1Hit || v.stopLoss <= v.entryPrice)) {
        return {
          outcome: "sl_hit",
          outcomePrice: v.stopLoss,
          outcomeAt: new Date(ts).toISOString(),
          rMultiple: -1,
        };
      }
      if (tp2Hit) {
        return {
          outcome: "tp2_hit",
          outcomePrice: v.takeProfit2,
          outcomeAt: new Date(ts).toISOString(),
          rMultiple: parseFloat((Math.abs(v.entryPrice - v.takeProfit2) / risk).toFixed(2)),
        };
      }
      if (tp1Hit) {
        return {
          outcome: "tp1_hit",
          outcomePrice: v.takeProfit1,
          outcomeAt: new Date(ts).toISOString(),
          rMultiple: parseFloat((Math.abs(v.entryPrice - v.takeProfit1) / risk).toFixed(2)),
        };
      }
      if (slHit) {
        return {
          outcome: "sl_hit",
          outcomePrice: v.stopLoss,
          outcomeAt: new Date(ts).toISOString(),
          rMultiple: -1,
        };
      }
    }

    if (ts >= expiry) {
      const price = closes[i];
      const reward = isLong ? price - v.entryPrice : v.entryPrice - price;
      return {
        outcome: "expired",
        outcomePrice: price,
        outcomeAt: new Date(ts).toISOString(),
        rMultiple: parseFloat((reward / risk).toFixed(2)),
      };
    }
  }

  const lastClose = closes[closes.length - 1];
  const lastTs = timestamps[timestamps.length - 1];
  if (lastTs >= expiry) {
    const reward = isLong ? lastClose - v.entryPrice : v.entryPrice - lastClose;
    return {
      outcome: "expired",
      outcomePrice: lastClose,
      outcomeAt: new Date(lastTs).toISOString(),
      rMultiple: parseFloat((reward / risk).toFixed(2)),
    };
  }

  return null;
}

export async function resolveOpenVerdicts(): Promise<number> {
  const open = getOpenVerdicts().filter(
    (v) => Date.now() - new Date(v.createdAt).getTime() >= MIN_AGE_MS
  );

  let resolved = 0;
  const pairCache = new Map<string, Awaited<ReturnType<typeof getKlines>>>();

  for (const v of open) {
    try {
      if (!pairCache.has(v.pair)) {
        pairCache.set(v.pair, await getKlines(v.pair, v.timeframe, 200));
      }
      const klines = pairCache.get(v.pair)!;
      const highs = klines.map((k) => parseFloat(String(k[2])));
      const lows = klines.map((k) => parseFloat(String(k[3])));
      const closes = klines.map((k) => parseFloat(String(k[4])));
      const timestamps = klines.map((k) => Number(k[0]));

      const result = checkCandleOutcome(v, highs, lows, closes, timestamps);
      if (result) {
        resolveVerdict(v.id, result);
        resolved++;
      }
    } catch {
      // Skip verdicts we can't resolve without candle data
    }
  }

  return resolved;
}
