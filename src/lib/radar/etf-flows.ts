import type { ETFFlow } from "@/lib/types";
import { fetchJsonWithTimeout } from "@/lib/fetch-utils";
import { createSoSoValueClient } from "./providers/sosovalue";

export type EtfFlowSource = "sosovalue" | "yahoo-proxy";

export interface EtfFlowsResult {
  flows: ETFFlow[];
  source: EtfFlowSource;
}

const ETF_TICKERS = [
  { ticker: "IBIT", name: "iShares Bitcoin Trust" },
  { ticker: "FBTC", name: "Fidelity Wise Origin Bitcoin Fund" },
  { ticker: "GBTC", name: "Grayscale Bitcoin Trust" },
  { ticker: "ARKB", name: "ARK 21Shares Bitcoin ETF" },
  { ticker: "ETHA", name: "iShares Ethereum Trust" },
] as const;

async function fetchEtfDailyChangeYahoo(ticker: string, name: string): Promise<ETFFlow | null> {
  try {
    const data = await fetchJsonWithTimeout<{
      chart?: {
        result?: {
          meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
          indicators?: { quote?: { volume?: (number | null)[] }[] };
        }[];
      };
    }>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`,
      5000
    );

    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const volumes = result?.indicators?.quote?.[0]?.volume?.filter(
      (v): v is number => typeof v === "number" && v > 0
    );
    const volume = volumes?.[volumes.length - 1] ?? 0;
    const price = meta?.regularMarketPrice ?? 0;
    const prevClose = meta?.chartPreviousClose ?? price;
    const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

    const netFlow = parseFloat(((volume * price * (changePct / 100)) / 1_000_000).toFixed(1));

    return { ticker, name, netFlow, date: "Today" };
  } catch {
    return null;
  }
}

async function fetchEtfFlowsYahoo(): Promise<ETFFlow[]> {
  const results = await Promise.all(ETF_TICKERS.map((e) => fetchEtfDailyChangeYahoo(e.ticker, e.name)));
  return results.filter((r): r is ETFFlow => r != null);
}

async function fetchEtfFlowsSoSoValue(apiKey: string): Promise<ETFFlow[]> {
  const client = createSoSoValueClient(apiKey);

  const [btcList, ethList] = await Promise.all([
    client.fetchEtfList("BTC").catch(() => [] as Array<{ ticker: string; name: string }>),
    client.fetchEtfList("ETH").catch(() => [] as Array<{ ticker: string; name: string }>),
  ]);

  const tickerMap = new Map<string, string>();
  for (const e of ETF_TICKERS) tickerMap.set(e.ticker, e.name);
  for (const e of [...btcList, ...ethList]) tickerMap.set(e.ticker, e.name);

  const tickers = [...tickerMap.entries()].map(([ticker, name]) => ({ ticker, name }));
  const results = await Promise.all(
    tickers.map(({ ticker, name }) => client.fetchEtfSnapshot(ticker, name))
  );

  return results
    .filter((r): r is NonNullable<typeof r> => r != null)
    .map(({ ticker, name, netFlow, date }) => ({ ticker, name, netFlow, date }));
}

export async function fetchEtfFlows(): Promise<EtfFlowsResult> {
  const apiKey = process.env.SOSOVALUE_API_KEY?.trim();
  // Temporary runtime check — boolean only, never log the key value
  console.log(`[etf-flows] SOSOVALUE_API_KEY present: ${!!apiKey}`);

  if (apiKey) {
    try {
      const flows = await fetchEtfFlowsSoSoValue(apiKey);
      if (flows.length > 0) return { flows, source: "sosovalue" };
      console.error(
        "[etf-flows] SoSoValue returned 0 flows after successful key check — falling back to Yahoo proxy"
      );
    } catch (err) {
      console.error("[etf-flows] SoSoValue fetch failed — falling back to Yahoo proxy:", err);
    }
  }

  const flows = await fetchEtfFlowsYahoo();
  return { flows, source: "yahoo-proxy" };
}
