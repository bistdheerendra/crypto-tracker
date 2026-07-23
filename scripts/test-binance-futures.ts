/**
 * Probe Binance / Bybit / OKX flow metrics for a few pairs.
 * Run: npx tsx scripts/test-binance-futures.ts
 */
import "dotenv/config";
import { getBinanceFlowMetrics } from "../src/lib/binance-futures";
import { getFlowMetrics } from "../src/lib/flow/aggregate";
import { getBybitFlowMetrics } from "../src/lib/flow/bybit";
import { getOkxFlowMetrics } from "../src/lib/flow/okx";

const PAIRS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;

async function probeRawFutures(symbol: string) {
  const pair = symbol.replace("/", "");
  const urls = [
    `https://fapi.binance.com/fapi/v1/openInterest?symbol=${pair}`,
    `https://fapi.binance.com/futures/data/openInterestHist?symbol=${pair}&period=1h&limit=3`,
    `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`,
    `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${pair}&period=1h&limit=1`,
  ];

  console.log(`\n--- Raw fapi.binance.com probes for ${pair} ---`);
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await res.text();
      console.log({
        url,
        status: res.status,
        body: body.slice(0, 300),
      });
    } catch (err) {
      console.log({
        url,
        status: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function main() {
  for (const pair of PAIRS) {
    console.log(`\n========== ${pair} ==========`);
    await probeRawFutures(pair);

    console.log("\ngetBinanceFlowMetrics:");
    const binance = await getBinanceFlowMetrics(pair);
    console.log(JSON.stringify(binance, null, 2));

    console.log("\ngetBybitFlowMetrics:");
    const bybit = await getBybitFlowMetrics(pair);
    console.log(JSON.stringify(bybit, null, 2));

    console.log("\ngetOkxFlowMetrics:");
    const okx = await getOkxFlowMetrics(pair);
    console.log(JSON.stringify(okx, null, 2));

    console.log("\ngetFlowMetrics (aggregated):");
    const agg = await getFlowMetrics(pair);
    console.log(JSON.stringify(agg, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
