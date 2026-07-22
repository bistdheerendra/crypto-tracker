import { getKlines } from "../binance";
import { resolveVerdict, getOpenVerdicts } from "../verdicts/store";
import type { StoredVerdict, VerdictOutcome } from "../verdicts/types";

const MIN_AGE_MS = 5 * 60 * 1000;
const MAX_HOLD_MS = 48 * 60 * 60 * 1000;

export type ResolveVerdictsSummary = {
  totalOpen: number;
  resolved: number;
  skippedTooYoung: number;
  errored: number;
};

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

/** Cap concurrent Binance kline fetches to stay under public API rate limits. */
const KLINE_FETCH_BATCH_SIZE = 12;

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(fn));
    results.push(...settled);
  }
  return results;
}

export async function resolveOpenVerdicts(): Promise<ResolveVerdictsSummary> {
  const allOpen = await getOpenVerdicts();
  const totalOpen = allOpen.length;
  const eligible = allOpen.filter(
    (v) => Date.now() - new Date(v.createdAt).getTime() >= MIN_AGE_MS
  );
  const skippedTooYoung = totalOpen - eligible.length;

  console.log("[resolve-verdicts] start", {
    totalOpen,
    skippedTooYoung,
    eligible: eligible.length,
  });

  let resolved = 0;
  let errored = 0;
  const pairCache = new Map<string, Awaited<ReturnType<typeof getKlines>>>();

  // Prefetch unique pair:timeframe klines concurrently (batched) instead of
  // awaiting each fetch sequentially inside the per-verdict loop.
  const uniqueKeys = [
    ...new Set(eligible.map((v) => `${v.pair}:${v.timeframe}`)),
  ];
  const keyParts = uniqueKeys.map((key) => {
    const [pair, timeframe] = key.split(":");
    return { key, pair, timeframe };
  });

  const fetchResults = await mapInBatches(
    keyParts,
    KLINE_FETCH_BATCH_SIZE,
    async ({ key, pair, timeframe }) => {
      const klines = await getKlines(pair, timeframe, 200);
      return { key, klines };
    }
  );

  for (const result of fetchResults) {
    if (result.status === "fulfilled") {
      pairCache.set(result.value.key, result.value.klines);
    } else {
      console.error("[resolve-verdicts] kline prefetch failed", {
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
    }
  }

  const resolveResults = await Promise.allSettled(
    eligible.map(async (v) => {
      const cacheKey = `${v.pair}:${v.timeframe}`;
      const klines = pairCache.get(cacheKey);
      if (!klines) {
        throw new Error(`No klines available for ${cacheKey}`);
      }
      const highs = klines.map((k) => parseFloat(String(k[2])));
      const lows = klines.map((k) => parseFloat(String(k[3])));
      const closes = klines.map((k) => parseFloat(String(k[4])));
      const timestamps = klines.map((k) => Number(k[0]));

      const result = checkCandleOutcome(v, highs, lows, closes, timestamps);
      if (result) {
        await resolveVerdict(v.id, result);
        console.log("[resolve-verdicts] resolved", {
          verdictId: v.id,
          pair: v.pair,
          timeframe: v.timeframe,
          outcome: result.outcome,
          outcomePrice: result.outcomePrice,
          outcomeAt: result.outcomeAt,
          rMultiple: result.rMultiple,
        });
        return "resolved" as const;
      }
      console.log("[resolve-verdicts] notResolvedYet", {
        verdictId: v.id,
        pair: v.pair,
        timeframe: v.timeframe,
        createdAt: v.createdAt,
      });
      return "open" as const;
    })
  );

  for (let i = 0; i < resolveResults.length; i++) {
    const result = resolveResults[i];
    const v = eligible[i];
    if (result.status === "fulfilled") {
      if (result.value === "resolved") resolved++;
    } else {
      errored++;
      console.error("[resolve-verdicts] error resolving verdict", {
        verdictId: v.id,
        pair: v.pair,
        timeframe: v.timeframe,
        createdAt: v.createdAt,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        stack: result.reason instanceof Error ? result.reason.stack : undefined,
      });
    }
  }

  const summary: ResolveVerdictsSummary = {
    totalOpen,
    resolved,
    skippedTooYoung,
    errored,
  };
  console.log("[resolve-verdicts] summary", summary);

  return summary;
}
