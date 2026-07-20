import type { ETFFlow } from "@/lib/types";
import { fetchJsonWithTimeout } from "@/lib/fetch-utils";

const ETF_TICKERS = [
  { ticker: "IBIT", name: "iShares Bitcoin Trust" },
  { ticker: "FBTC", name: "Fidelity Wise Origin Bitcoin Fund" },
  { ticker: "GBTC", name: "Grayscale Bitcoin Trust" },
  { ticker: "ARKB", name: "ARK 21Shares Bitcoin ETF" },
  { ticker: "ETHA", name: "iShares Ethereum Trust" },
] as const;

async function fetchEtfDailyChange(ticker: string, name: string): Promise<ETFFlow | null> {
  try {
    const data = await fetchJsonWithTimeout<{
      chart?: {
        result?: {
          meta?: { regularMarketPrice?: number; chartPreviousClose?: number };
          indicators?: { quote?: { volume?: (number | null)[] }[] };
          timestamp?: number[];
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

    // Signed dollar activity proxy: daily volume × price × direction of move, in $M.
    const netFlow = parseFloat(((volume * price * (changePct / 100)) / 1_000_000).toFixed(1));

    return {
      ticker,
      name,
      netFlow,
      date: "Today",
    };
  } catch {
    return null;
  }
}

export async function fetchEtfFlows(): Promise<ETFFlow[]> {
  const results = await Promise.all(ETF_TICKERS.map((e) => fetchEtfDailyChange(e.ticker, e.name)));
  return results.filter((r): r is ETFFlow => r != null);
}
