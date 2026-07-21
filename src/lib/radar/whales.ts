import type { WhaleTransaction } from "@/lib/types";
import { fetchJsonWithTimeout } from "@/lib/fetch-utils";
import { formatTimeAgo, formatUsdCompact, truncateAddress } from "./utils";
import { getPrice } from "@/lib/binance";
import { inferBtcDirection } from "./exchange-addresses";

export const WHALE_THRESHOLDS = {
  BTC: 50,
  ETH: 500,
  SOL: 5_000,
  perChainLimit: 5,
  totalLimit: 10,
} as const;

const BLOCKSTREAM_API = "https://blockstream.info/api";
const BLOCKSCOUT_API = "https://eth.blockscout.com/api/v2";

interface BlockchairTx {
  hash?: string;
  time?: string;
  output_total?: number;
  input_total?: number;
  balance_change?: number;
}

interface BlockchairTxDashboard {
  inputs?: Array<{ recipient?: string }>;
  outputs?: Array<{ recipient?: string }>;
}

interface BlockstreamBlock {
  id: string;
  timestamp: number;
}

interface BlockstreamTx {
  txid: string;
  status?: { block_time?: number };
  vout?: Array<{ value?: number }>;
}

interface BlockscoutTx {
  hash?: string;
  value?: string;
  timestamp?: string;
}

interface BlockscoutPage {
  items?: BlockscoutTx[];
  next_page_params?: {
    block_number?: number;
    index?: number;
    items_count?: number;
  };
}

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: unknown };
  if (json.error) throw new Error(`Solana RPC error: ${JSON.stringify(json.error)}`);
  return json.result as T;
}

async function fetchBtcWhaleDirections(hashes: string[]): Promise<Map<string, "in" | "out" | "unknown">> {
  const directions = new Map<string, "in" | "out" | "unknown">();
  if (hashes.length === 0) return directions;

  try {
    const data = await fetchJsonWithTimeout<{
      data?: Record<string, BlockchairTxDashboard>;
    }>(
      `https://api.blockchair.com/bitcoin/dashboards/transactions/${hashes.join(",")}`,
      8000
    );

    for (const [hash, dashboard] of Object.entries(data.data ?? {})) {
      const inputs = (dashboard.inputs ?? []).map((i) => i.recipient ?? "");
      const outputs = (dashboard.outputs ?? []).map((o) => o.recipient ?? "");
      directions.set(hash, inferBtcDirection(inputs, outputs));
    }
  } catch {
    for (const hash of hashes) directions.set(hash, "unknown");
  }

  return directions;
}

async function fetchBtcWhalesBlockchair(minBtc: number, limit: number): Promise<WhaleTransaction[]> {
  const minSats = minBtc * 100_000_000;
  const data = await fetchJsonWithTimeout<{ data?: BlockchairTx[] }>(
    `https://api.blockchair.com/bitcoin/transactions?q=output_total(${minSats}..)&s=time(desc)&limit=${limit}`,
    8000
  );

  const txs = data.data ?? [];
  const hashes = txs.map((tx) => tx.hash).filter((h): h is string => !!h);
  const [btcPrice, directions] = await Promise.all([
    getPrice("BTC/USDT"),
    fetchBtcWhaleDirections(hashes),
  ]);

  return txs.map((tx, i) => {
    const btc = (tx.output_total ?? 0) / 100_000_000;
    const usd = btc * btcPrice;
    const time = tx.time ? new Date(tx.time) : new Date();
    const hash = tx.hash ?? "unknown";
    return {
      id: `btc-${hash}-${i}`,
      address: truncateAddress(hash, 6),
      amount: `${btc.toFixed(0)} BTC`,
      usdValue: formatUsdCompact(usd),
      direction: directions.get(hash) ?? "unknown",
      timeAgo: formatTimeAgo(time),
      chain: "Bitcoin",
    };
  });
}

async function fetchBtcWhalesBlockstream(minBtc: number, limit: number): Promise<WhaleTransaction[]> {
  const minSats = minBtc * 100_000_000;
  const blocks = await fetchJsonWithTimeout<BlockstreamBlock[]>(`${BLOCKSTREAM_API}/blocks`, 8000);
  const btcPrice = await getPrice("BTC/USDT");
  const results: WhaleTransaction[] = [];

  for (const block of blocks.slice(0, 8)) {
    if (results.length >= limit) break;

    for (let start = 0; start < 300 && results.length < limit; start += 25) {
      const txs = await fetchJsonWithTimeout<BlockstreamTx[]>(
        `${BLOCKSTREAM_API}/block/${block.id}/txs/${start}`,
        8000
      );
      if (!txs.length) break;

      for (const tx of txs) {
        const outputSats = tx.vout?.reduce((sum, o) => sum + (o.value ?? 0), 0) ?? 0;
        if (outputSats < minSats) continue;

        const btc = outputSats / 100_000_000;
        const usd = btc * btcPrice;
        const time = tx.status?.block_time
          ? new Date(tx.status.block_time * 1000)
          : new Date(block.timestamp * 1000);

        results.push({
          id: `btc-bs-${tx.txid}`,
          address: truncateAddress(tx.txid, 6),
          amount: `${btc.toFixed(0)} BTC`,
          usdValue: formatUsdCompact(usd),
          direction: "unknown",
          timeAgo: formatTimeAgo(time),
          chain: "Bitcoin",
        });

        if (results.length >= limit) break;
      }
    }
  }

  return results;
}

async function fetchBtcWhales(minBtc: number, limit: number): Promise<WhaleTransaction[]> {
  try {
    const rows = await fetchBtcWhalesBlockchair(minBtc, limit);
    if (rows.length > 0) return rows;
  } catch (err) {
    console.error("[whales] Blockchair BTC failed:", err);
  }

  try {
    return await fetchBtcWhalesBlockstream(minBtc, limit);
  } catch (err) {
    console.error("[whales] Blockstream BTC fallback failed:", err);
    return [];
  }
}

async function fetchEthWhalesBlockchair(minEth: number, limit: number): Promise<WhaleTransaction[]> {
  const minWei = minEth * 1e18;
  const data = await fetchJsonWithTimeout<{ data?: BlockchairTx[] }>(
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

async function fetchEthWhalesBlockscout(minEth: number, limit: number): Promise<WhaleTransaction[]> {
  const minWei = minEth * 1e18;
  const ethPrice = await getPrice("ETH/USDT");
  const results: WhaleTransaction[] = [];

  let url: string | null = `${BLOCKSCOUT_API}/transactions?filter=validated`;

  for (let page = 0; page < 12 && results.length < limit && url; page++) {
    const pageData: BlockscoutPage = await fetchJsonWithTimeout<BlockscoutPage>(url, 8000);

    for (const tx of pageData.items ?? []) {
      const wei = parseFloat(tx.value ?? "0");
      if (wei < minWei || !tx.hash) continue;

      const eth = wei / 1e18;
      const usd = eth * ethPrice;
      const time = tx.timestamp ? new Date(tx.timestamp) : new Date();

      results.push({
        id: `eth-bs-${tx.hash}`,
        address: truncateAddress(tx.hash, 6),
        amount: `${eth.toFixed(0)} ETH`,
        usdValue: formatUsdCompact(usd),
        direction: "unknown",
        timeAgo: formatTimeAgo(time),
        chain: "Ethereum",
      });

      if (results.length >= limit) break;
    }

    const next: BlockscoutPage["next_page_params"] = pageData.next_page_params;
    url =
      next?.block_number != null && next.index != null
        ? `${BLOCKSCOUT_API}/transactions?filter=validated&block_number=${next.block_number}&index=${next.index}&items_count=${next.items_count ?? 50}`
        : null;
  }

  return results;
}

async function fetchEthWhales(minEth: number, limit: number): Promise<WhaleTransaction[]> {
  try {
    const rows = await fetchEthWhalesBlockchair(minEth, limit);
    if (rows.length > 0) return rows;
  } catch (err) {
    console.error("[whales] Blockchair ETH failed:", err);
  }

  try {
    return await fetchEthWhalesBlockscout(minEth, limit);
  } catch (err) {
    console.error("[whales] Blockscout ETH fallback failed:", err);
    return [];
  }
}

interface SolanaParsedTransfer {
  signature: string;
  lamports: number;
  blockTime: number | null;
}

function extractSolTransfersFromBlock(
  block: {
    blockTime?: number | null;
    transactions?: Array<{
      transaction?: {
        signatures?: string[];
        message?: {
          instructions?: Array<{
            program?: string;
            programId?: string;
            parsed?: { type?: string; info?: { lamports?: number } };
          }>;
        };
      };
      meta?: { err?: unknown; preBalances?: number[]; postBalances?: number[] };
    }>;
  },
  minLamports: number
): SolanaParsedTransfer[] {
  const transfers: SolanaParsedTransfer[] = [];
  const blockTime = block.blockTime ?? null;

  for (const entry of block.transactions ?? []) {
    if (entry.meta?.err) continue;
    const signature = entry.transaction?.signatures?.[0];
    if (!signature) continue;

    let maxLamports = 0;
    for (const ix of entry.transaction?.message?.instructions ?? []) {
      const program = ix.program ?? ix.programId ?? "";
      if (program !== "system" && !program.endsWith("11111111111111111111111111111111")) continue;
      const lamports = ix.parsed?.info?.lamports;
      if (typeof lamports === "number" && lamports > maxLamports) {
        maxLamports = lamports;
      }
    }

    if (maxLamports === 0 && entry.meta?.preBalances && entry.meta?.postBalances) {
      for (let i = 0; i < entry.meta.preBalances.length; i++) {
        const delta = Math.abs((entry.meta.postBalances[i] ?? 0) - (entry.meta.preBalances[i] ?? 0));
        if (delta > maxLamports) maxLamports = delta;
      }
    }

    if (maxLamports >= minLamports) {
      transfers.push({ signature, lamports: maxLamports, blockTime });
    }
  }

  return transfers;
}

async function fetchSolWhales(minSol: number, limit: number): Promise<WhaleTransaction[]> {
  const minLamports = minSol * 1_000_000_000;
  const slot = await solanaRpc<number>("getSlot", []);
  const solPrice = await getPrice("SOL/USDT");

  const transfers: SolanaParsedTransfer[] = [];
  const blocksToScan = 8;

  for (let offset = 0; offset < blocksToScan && transfers.length < limit * 2; offset++) {
    try {
      const block = await solanaRpc<{
        blockTime?: number | null;
        transactions?: Array<{
          transaction?: {
            signatures?: string[];
            message?: {
              instructions?: Array<{
                program?: string;
                programId?: string;
                parsed?: { type?: string; info?: { lamports?: number } };
              }>;
            };
          };
          meta?: { err?: unknown; preBalances?: number[]; postBalances?: number[] };
        }>;
      }>("getBlock", [
        slot - offset,
        {
          encoding: "jsonParsed",
          transactionDetails: "full",
          maxSupportedTransactionVersion: 0,
          rewards: false,
        },
      ]);

      if (!block) continue;
      transfers.push(...extractSolTransfersFromBlock(block, minLamports));
    } catch (err) {
      console.error(`[whales] Solana block ${slot - offset} failed:`, err);
    }
  }

  return transfers.slice(0, limit).map((tx, i) => {
    const sol = tx.lamports / 1_000_000_000;
    const usd = sol * solPrice;
    const time = tx.blockTime ? new Date(tx.blockTime * 1000) : new Date();
    return {
      id: `sol-${tx.signature.slice(0, 12)}-${i}`,
      address: truncateAddress(tx.signature, 6),
      amount: `${sol.toFixed(0)} SOL`,
      usdValue: formatUsdCompact(usd),
      direction: "unknown" as const,
      timeAgo: formatTimeAgo(time),
      chain: "Solana",
    };
  });
}

export async function fetchWhaleTransactions(): Promise<WhaleTransaction[]> {
  const { BTC, ETH, SOL, perChainLimit, totalLimit } = WHALE_THRESHOLDS;

  const [btc, eth, sol] = await Promise.allSettled([
    fetchBtcWhales(BTC, perChainLimit),
    fetchEthWhales(ETH, perChainLimit),
    fetchSolWhales(SOL, perChainLimit),
  ]);

  const merged = [
    ...(btc.status === "fulfilled" ? btc.value : []),
    ...(eth.status === "fulfilled" ? eth.value : []),
    ...(sol.status === "fulfilled" ? sol.value : []),
  ];

  if (merged.length === 0) {
    console.error("[whales] All chains returned 0 transactions", {
      btc: btc.status === "rejected" ? btc.reason : btc.value.length,
      eth: eth.status === "rejected" ? eth.reason : eth.value.length,
      sol: sol.status === "rejected" ? sol.reason : sol.value.length,
    });
  }

  return merged.slice(0, totalLimit);
}
