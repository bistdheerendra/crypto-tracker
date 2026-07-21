import "dotenv/config";
import { getOpenVerdicts } from "../src/lib/verdicts/store";
import { getKlines } from "../src/lib/binance";
import { resolveOpenVerdicts } from "../src/lib/backtest/resolver";

const MIN_AGE_MS = 5 * 60 * 1000;
const MAX_HOLD_MS = 48 * 60 * 60 * 1000;

function timeframeMs(tf: string): number {
  const m = tf.match(/^(\d+)([mhdw])$/);
  if (!m) return 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  if (unit === "w") return n * 7 * 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

async function main() {
  const all = await getOpenVerdicts();
  console.log("Total open verdicts:", all.length);

  const pairCache = new Map<string, Awaited<ReturnType<typeof getKlines>>>();
  let wouldResolve = 0;
  let wouldResolveWithCreationCandle = 0;

  for (const v of all) {
    const ageH = ((Date.now() - new Date(v.createdAt).getTime()) / 3600000).toFixed(1);
    const cacheKey = `${v.pair}:${v.timeframe}`;
    if (!pairCache.has(cacheKey)) {
      pairCache.set(cacheKey, await getKlines(v.pair, v.timeframe, 200));
    }
    const klines = pairCache.get(cacheKey)!;
    const timestamps = klines.map((k) => Number(k[0]));
    const created = new Date(v.createdAt).getTime();
    const candleMs = timeframeMs(v.timeframe);
    const highs = klines.map((k) => parseFloat(String(k[2])));
    const lows = klines.map((k) => parseFloat(String(k[3])));

    const check = (includeCreationCandle: boolean) => {
      let slHit = false;
      let tp1Hit = false;
      let tp2Hit = false;
      for (let i = 0; i < timestamps.length; i++) {
        const candleOpen = timestamps[i];
        const candleClose = candleOpen + candleMs;
        if (includeCreationCandle) {
          if (candleClose <= created) continue;
        } else if (candleOpen < created) {
          continue;
        }
        if (v.direction === "LONG") {
          if (lows[i] <= v.stopLoss) slHit = true;
          if (highs[i] >= v.takeProfit1) tp1Hit = true;
          if (highs[i] >= v.takeProfit2) tp2Hit = true;
        } else if (v.direction === "SHORT") {
          if (highs[i] >= v.stopLoss) slHit = true;
          if (lows[i] <= v.takeProfit1) tp1Hit = true;
          if (lows[i] <= v.takeProfit2) tp2Hit = true;
        }
      }
      return { slHit, tp1Hit, tp2Hit };
    };

    const strict = check(false);
    const withCreation = check(true);
    const hitStrict = strict.slHit || strict.tp1Hit || strict.tp2Hit;
    const hitCreation = withCreation.slHit || withCreation.tp1Hit || withCreation.tp2Hit;
    if (hitStrict) wouldResolve++;
    if (hitCreation) wouldResolveWithCreationCandle++;

    console.log(
      `${v.id.slice(0, 10)} ${v.pair} ${v.direction} ${ageH}h strict=${JSON.stringify(strict)} creation=${JSON.stringify(withCreation)}`
    );
  }

  console.log("\nWould resolve (strict):", wouldResolve);
  console.log("Would resolve (incl creation candle):", wouldResolveWithCreationCandle);

  const resolved = await resolveOpenVerdicts();
  console.log("\nresolveOpenVerdicts returned:", resolved);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
