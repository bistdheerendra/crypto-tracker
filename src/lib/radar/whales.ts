import type { WhaleTransaction } from "@/lib/types";
import { fetchJsonWithTimeout } from "@/lib/fetch-utils";
import { formatTimeAgo, formatUsdCompact, truncateAddress } from "./utils";
import { getPrice } from "@/lib/binance";

interface BlockchairTx {
  hash?: string;
  time?: string;
  output_total?: number;
  input_total?: number;
  balance_change?: number;
}

async function fetchBtcWhales(minBtc: number, limit: number): Promise<WhaleTransaction[]> {
  const minSats = minBtc * 100_000_000;
  const data = await fetchJsonWithTimeout<{
    data?: BlockchairTx[];
  }>(
    `https://api.blockchair.com/bitcoin/transactions?q=output_total(${minSats}..)&s=time(desc)&limit=${limit}`,
    8000
  );

  const btcPrice = await getPrice("BTC/USDT");

  return (data.data ?? []).map((tx, i) => {
    const btc = (tx.output_total ?? 0) / 100_000_000;
    const usd = btc * btcPrice;
    const time = tx.time ? new Date(tx.time) : new Date();
    return {
      id: `btc-${tx.hash ?? i}`,
      address: truncateAddress(tx.hash ?? "unknown", 6),
      amount: `${btc.toFixed(0)} BTC`,
      usdValue: formatUsdCompact(usd),
      direction: "in" as const,
      timeAgo: formatTimeAgo(time),
      chain: "Bitcoin",
    };
  });
}

async function fetchEthWhales(minEth: number, limit: number): Promise<WhaleTransaction[]> {
  const minWei = minEth * 1e18;
  const data = await fetchJsonWithTimeout<{
    data?: BlockchairTx[];
  }>(
    `https://api.blockchair.com/ethereum/transactions?q=value(${minWei}..)&s=time(desc)&limit=${limit}`,
    8000
  );

  const ethPrice = await getPrice("ETH/USDT");

  return (data.data ?? []).map((tx, i) => {
    const eth = (tx.output_total ?? tx.input_total ?? 0) / 1e18;
    const usd = eth * ethPrice;
    const time = tx.time ? new Date(tx.time) : new Date();
    const direction = (tx.balance_change ?? 0) >= 0 ? ("in" as const) : ("out" as const);
    return {
      id: `eth-${tx.hash ?? i}`,
      address: truncateAddress(tx.hash ?? "unknown", 6),
      amount: `${eth.toFixed(0)} ETH`,
      usdValue: formatUsdCompact(usd),
      direction,
      timeAgo: formatTimeAgo(time),
      chain: "Ethereum",
    };
  });
}

export async function fetchWhaleTransactions(): Promise<WhaleTransaction[]> {
  const [btc, eth] = await Promise.allSettled([
    fetchBtcWhales(50, 5),
    fetchEthWhales(500, 5),
  ]);

  const merged = [
    ...(btc.status === "fulfilled" ? btc.value : []),
    ...(eth.status === "fulfilled" ? eth.value : []),
  ];

  return merged.slice(0, 10);
}
