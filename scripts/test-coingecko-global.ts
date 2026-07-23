/**
 * Probe CoinGecko global + trending endpoints (narrative mcap source).
 * Run: npx tsx scripts/test-coingecko-global.ts
 */
import "dotenv/config";
import { HttpFetchError } from "../src/lib/fetch-utils";

async function probe(url: string) {
  console.log(`\n=== GET ${url} ===`);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = await res.text();
    console.log(`status: ${res.status}`);
    console.log(
      `headers: retry-after=${res.headers.get("retry-after")} x-ratelimit-remaining=${res.headers.get("x-ratelimit-remaining")}`
    );
    console.log(`body: ${body.slice(0, 800)}`);
    if (res.ok) {
      try {
        const json = JSON.parse(body) as {
          data?: { market_cap_change_percentage_24h_usd?: number };
          coins?: unknown[];
        };
        if (json.data?.market_cap_change_percentage_24h_usd != null) {
          console.log(
            `market_cap_change_percentage_24h_usd: ${json.data.market_cap_change_percentage_24h_usd}`
          );
        }
        if (Array.isArray(json.coins)) {
          console.log(`trending coins count: ${json.coins.length}`);
        }
      } catch {
        console.log("(parse failed)");
      }
    }
  } catch (err) {
    console.log(
      "network error:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function main() {
  // Sequential probes to see if first succeeds then subsequent rate-limit
  await probe("https://api.coingecko.com/api/v3/global");
  await probe("https://api.coingecko.com/api/v3/search/trending");
  await probe("https://api.coingecko.com/api/v3/global");

  // Exercise the app helper twice — 2nd call should hit the 10m cache
  const { getNarrativeSnapshot } = await import("../src/lib/narrative");
  console.log("\n=== getNarrativeSnapshot('BTC/USDT') #1 (live or cache fill) ===");
  const t0 = Date.now();
  const snap1 = await getNarrativeSnapshot("BTC/USDT");
  console.log(
    JSON.stringify(
      {
        ms: Date.now() - t0,
        fearGreed: snap1.fearGreed,
        fearGreedRoc: snap1.fearGreedRoc,
        globalMarketCapChange24hPct: snap1.globalMarketCapChange24hPct,
        trendingCoins: snap1.trendingCoins,
        available: snap1.available,
      },
      null,
      2
    )
  );

  console.log("\n=== getNarrativeSnapshot('ETH/USDT') #2 (should reuse CoinGecko cache) ===");
  const t1 = Date.now();
  const snap2 = await getNarrativeSnapshot("ETH/USDT");
  console.log(
    JSON.stringify(
      {
        ms: Date.now() - t1,
        globalMarketCapChange24hPct: snap2.globalMarketCapChange24hPct,
        trendingCoins: snap2.trendingCoins,
        available: snap2.available,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  if (err instanceof HttpFetchError) {
    console.error({ status: err.status, body: err.body, url: err.url });
  } else {
    console.error(err);
  }
  process.exit(1);
});
