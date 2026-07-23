import type { WhaleTransaction } from "@/lib/types";
import type { WhaleChain } from "@/lib/market/constants";
import {
  fetchErrorDetails,
  fetchJsonWithTimeout,
  HttpFetchError,
} from "@/lib/fetch-utils";
import {
  formatTimeAgo,
  formatUsdCompact,
  getRadarCache,
  setRadarCache,
  truncateAddress,
} from "./utils";
import { getPrice } from "@/lib/binance";
import { inferBtcDirection } from "./exchange-addresses";

export const WHALE_THRESHOLDS = {
  BTC: 50,
  ETH: 500,
  SOL: 5_000,
  perChainLimit: 5,
  totalLimit: 10,
  /** Higher limit for feature aggregation over the lookback window. */
  activityLimit: 50,
} as const;

/** Shared across Radar UI + VerdictFeature capture to cut duplicate Blockchair hits. */
const BLOCKCHAIR_CACHE_TTL_MS = 7 * 60 * 1000;

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

/** Unformatted whale tx for feature capture and Radar formatting. */
export interface RawWhaleTx {
  id: string;
  hash: string;
  amountNative: number;
  usdValue: number;
  direction: "in" | "out" | "unknown";
  timestampMs: number;
  chain: WhaleChain;
}

export interface WhaleActivitySummary {
  whaleNetFlowUsd: number;
  whaleTransactionCount: number;
}

/**
 * Feature-capture only. Radar UI (`fetchWhaleTransactions`) is unaffected.
 * Default false — Blockchair 430 / Blockstream 429 make high-frequency capture
 * poison the IP blacklist; set WHALE_CAPTURE_ENABLED=true to re-enable.
 */
export function isWhaleCaptureEnabled(): boolean {
  return process.env.WHALE_CAPTURE_ENABLED === "true";
}

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const BLOCKCHAIR_COOLDOWN_KEY = "blockchair:ip-cooldown:v1";
const BLOCKCHAIR_COOLDOWN_TTL_MS = 5 * 60 * 1000;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function withBlockchairKey(url: string): string {
  const key = process.env.BLOCKCHAIR_API_KEY?.trim();
  if (!key) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}key=${encodeURIComponent(key)}`;
}

function statusOf(err: unknown, details: ReturnType<typeof fetchErrorDetails>): number | null {
  if (err instanceof HttpFetchError) return err.status;
  return details.status;
}

/** 429 is transient — retry. 430 is IP blacklist — skip retries, cool down, fall back. */
function isRetryableRateLimit(err: unknown, details: ReturnType<typeof fetchErrorDetails>): boolean {
  const status = statusOf(err, details);
  return status === 429 || /HTTP 429/.test(details.error);
}

function isBlockchairBlacklist(err: unknown, details: ReturnType<typeof fetchErrorDetails>): boolean {
  const status = statusOf(err, details);
  return status === 430 || /HTTP 430/.test(details.error);
}

async function markBlockchairCooldown(): Promise<void> {
  await setRadarCache(BLOCKCHAIR_COOLDOWN_KEY, true, BLOCKCHAIR_COOLDOWN_TTL_MS);
}

async function isBlockchairInCooldown(): Promise<boolean> {
  const cached = await getRadarCache<boolean>(BLOCKCHAIR_COOLDOWN_KEY);
  return cached?.data === true;
}

/** Mirror CoinGecko retry in narrative.ts — only retry transient 429s, not 430 blacklists. */
async function fetchBlockchairJsonWithRetry<T>(
  url: string,
  label: string,
  attempts = 3
): Promise<T> {
  if (await isBlockchairInCooldown()) {
    throw new HttpFetchError(
      430,
      url,
      "Blockchair cooldown active after prior 430 blacklist"
    );
  }

  const keyedUrl = withBlockchairKey(url);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchJsonWithTimeout<T>(keyedUrl, 8000);
    } catch (err) {
      lastErr = err;
      const details = fetchErrorDetails(err);
      console.error(`[whales] Blockchair ${label} failed (attempt ${i + 1}/${attempts})`, {
        url: keyedUrl.replace(/key=[^&]+/, "key=***"),
        status: details.status,
        error: details.error,
        body: details.body,
      });
      if (isBlockchairBlacklist(err, details)) {
        await markBlockchairCooldown();
        break;
      }
      if (!isRetryableRateLimit(err, details) || i === attempts - 1) break;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

/**
 * Shared RawWhaleTx cache for Radar UI + feature capture (7m TTL).
 * Populated by Blockchair when available, otherwise Blockstream/Blockscout fallbacks.
 */
async function getSharedBtcWhales(limit: number): Promise<RawWhaleTx[]> {
  const cacheKey = `whales:btc:shared-raw:v1:${WHALE_THRESHOLDS.BTC}`;
  const cached = await getRadarCache<RawWhaleTx[]>(cacheKey);
  if (cached) return cached.data.slice(0, limit);

  const rows = await fetchBtcWhalesRaw(
    WHALE_THRESHOLDS.BTC,
    WHALE_THRESHOLDS.activityLimit
  );
  // Cache hits (incl. empty) so Radar + feature capture don't re-hit upstream twice
  await setRadarCache(cacheKey, rows, BLOCKCHAIR_CACHE_TTL_MS);
  return rows.slice(0, limit);
}

async function getSharedEthWhales(limit: number): Promise<RawWhaleTx[]> {
  const cacheKey = `whales:eth:shared-raw:v1:${WHALE_THRESHOLDS.ETH}`;
  const cached = await getRadarCache<RawWhaleTx[]>(cacheKey);
  if (cached) return cached.data.slice(0, limit);

  const rows = await fetchEthWhalesRaw(
    WHALE_THRESHOLDS.ETH,
    WHALE_THRESHOLDS.activityLimit
  );
  await setRadarCache(cacheKey, rows, BLOCKCHAIR_CACHE_TTL_MS);
  return rows.slice(0, limit);
}

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

function chainAssetSymbol(chain: WhaleChain): string {
  if (chain === "Bitcoin") return "BTC";
  if (chain === "Ethereum") return "ETH";
  return "SOL";
}

function toWhaleTransaction(raw: RawWhaleTx): WhaleTransaction {
  return {
    id: raw.id,
    address: truncateAddress(raw.hash, 6),
    amount: `${raw.amountNative.toFixed(0)} ${chainAssetSymbol(raw.chain)}`,
    usdValue: formatUsdCompact(raw.usdValue),
    direction: raw.direction,
    timeAgo: formatTimeAgo(new Date(raw.timestampMs)),
    chain: raw.chain,
  };
}

async function fetchBtcWhaleDirections(hashes: string[]): Promise<Map<string, "in" | "out" | "unknown">> {
  const directions = new Map<string, "in" | "out" | "unknown">();
  if (hashes.length === 0) return directions;

  try {
    const data = await fetchBlockchairJsonWithRetry<{
      data?: Record<string, BlockchairTxDashboard>;
    }>(
      `https://api.blockchair.com/bitcoin/dashboards/transactions/${hashes.join(",")}`,
      "BTC directions"
    );

    for (const [hash, dashboard] of Object.entries(data.data ?? {})) {
      const inputs = (dashboard.inputs ?? []).map((i) => i.recipient ?? "");
      const outputs = (dashboard.outputs ?? []).map((o) => o.recipient ?? "");
      directions.set(hash, inferBtcDirection(inputs, outputs));
    }
  } catch (err) {
    const details = fetchErrorDetails(err);
    console.error("[whales] Blockchair BTC directions exhausted retries", {
      status: details.status,
      error: details.error,
      body: details.body,
      hashCount: hashes.length,
    });
    for (const hash of hashes) directions.set(hash, "unknown");
  }

  return directions;
}

/**
 * Always fetch activityLimit rows and cache raw Blockchair list so Radar (limit=5)
 * and feature capture (limit=50) share one upstream call within the TTL window.
 */
async function getCachedBlockchairBtcTxs(minBtc: number): Promise<BlockchairTx[]> {
  const cacheKey = `blockchair:btc:whale-txs:v1:${minBtc}`;
  const cached = await getRadarCache<BlockchairTx[]>(cacheKey);
  if (cached) return cached.data;

  const minSats = minBtc * 100_000_000;
  const limit = WHALE_THRESHOLDS.activityLimit;
  const data = await fetchBlockchairJsonWithRetry<{ data?: BlockchairTx[] }>(
    `https://api.blockchair.com/bitcoin/transactions?q=output_total(${minSats}..)&s=time(desc)&limit=${limit}`,
    "BTC txs"
  );
  const txs = data.data ?? [];
  await setRadarCache(cacheKey, txs, BLOCKCHAIR_CACHE_TTL_MS);
  return txs;
}

async function getCachedBlockchairEthTxs(minEth: number): Promise<BlockchairTx[]> {
  const cacheKey = `blockchair:eth:whale-txs:v1:${minEth}`;
  const cached = await getRadarCache<BlockchairTx[]>(cacheKey);
  if (cached) return cached.data;

  const minWei = minEth * 1e18;
  const limit = WHALE_THRESHOLDS.activityLimit;
  const data = await fetchBlockchairJsonWithRetry<{ data?: BlockchairTx[] }>(
    `https://api.blockchair.com/ethereum/transactions?q=value(${minWei}..)&s=time(desc)&limit=${limit}`,
    "ETH txs"
  );
  const txs = data.data ?? [];
  await setRadarCache(cacheKey, txs, BLOCKCHAIR_CACHE_TTL_MS);
  return txs;
}

async function fetchBtcWhalesBlockchair(minBtc: number, limit: number): Promise<RawWhaleTx[]> {
  const txs = (await getCachedBlockchairBtcTxs(minBtc)).slice(0, limit);
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
      hash,
      amountNative: btc,
      usdValue: usd,
      direction: directions.get(hash) ?? "unknown",
      timestampMs: time.getTime(),
      chain: "Bitcoin" as const,
    };
  });
}

async function fetchBtcWhalesBlockstream(minBtc: number, limit: number): Promise<RawWhaleTx[]> {
  const minSats = minBtc * 100_000_000;
  const blocks = await fetchJsonWithTimeout<BlockstreamBlock[]>(`${BLOCKSTREAM_API}/blocks`, 8000);
  const btcPrice = await getPrice("BTC/USDT");
  const results: RawWhaleTx[] = [];

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
          hash: tx.txid,
          amountNative: btc,
          usdValue: usd,
          direction: "unknown",
          timestampMs: time.getTime(),
          chain: "Bitcoin",
        });

        if (results.length >= limit) break;
      }
    }
  }

  return results;
}

async function fetchBtcWhalesRaw(minBtc: number, limit: number): Promise<RawWhaleTx[]> {
  try {
    const rows = await fetchBtcWhalesBlockchair(minBtc, limit);
    if (rows.length > 0) return rows;
  } catch (err) {
    const details = fetchErrorDetails(err);
    console.error("[whales] Blockchair BTC failed:", {
      status: details.status,
      error: details.error,
      body: details.body,
    });
  }

  try {
    return await fetchBtcWhalesBlockstream(minBtc, limit);
  } catch (err) {
    console.error("[whales] Blockstream BTC fallback failed:", err);
    // Must throw — returning [] would become whaleNetFlowUsd/Count = 0 (false "no activity"
    // signal for ML). Callers treat rejection / null as unknown.
    throw err;
  }
}

async function fetchEthWhalesBlockchair(minEth: number, limit: number): Promise<RawWhaleTx[]> {
  const txs = (await getCachedBlockchairEthTxs(minEth)).slice(0, limit);
  const ethPrice = await getPrice("ETH/USDT");

  return txs.map((tx, i) => {
    const eth = (tx.output_total ?? tx.input_total ?? 0) / 1e18;
    const usd = eth * ethPrice;
    const time = tx.time ? new Date(tx.time) : new Date();
    const direction = (tx.balance_change ?? 0) >= 0 ? ("in" as const) : ("out" as const);
    const hash = tx.hash ?? `unknown-${i}`;
    return {
      id: `eth-${hash}`,
      hash,
      amountNative: eth,
      usdValue: usd,
      direction,
      timestampMs: time.getTime(),
      chain: "Ethereum" as const,
    };
  });
}

async function fetchEthWhalesBlockscout(minEth: number, limit: number): Promise<RawWhaleTx[]> {
  const minWei = minEth * 1e18;
  const ethPrice = await getPrice("ETH/USDT");
  const results: RawWhaleTx[] = [];

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
        hash: tx.hash,
        amountNative: eth,
        usdValue: usd,
        direction: "unknown",
        timestampMs: time.getTime(),
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

async function fetchEthWhalesRaw(minEth: number, limit: number): Promise<RawWhaleTx[]> {
  try {
    const rows = await fetchEthWhalesBlockchair(minEth, limit);
    if (rows.length > 0) return rows;
  } catch (err) {
    const details = fetchErrorDetails(err);
    console.error("[whales] Blockchair ETH failed:", {
      status: details.status,
      error: details.error,
      body: details.body,
    });
  }

  try {
    return await fetchEthWhalesBlockscout(minEth, limit);
  } catch (err) {
    console.error("[whales] Blockscout ETH fallback failed:", err);
    // Must throw — returning [] would become whaleNetFlowUsd/Count = 0 (false "no activity"
    // signal for ML). Callers treat rejection / null as unknown.
    throw err;
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

async function fetchSolWhalesRaw(minSol: number, limit: number): Promise<RawWhaleTx[]> {
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
      hash: tx.signature,
      amountNative: sol,
      usdValue: usd,
      direction: "unknown" as const,
      timestampMs: time.getTime(),
      chain: "Solana" as const,
    };
  });
}

/**
 * Fast path for feature capture. Prefers shared cache / Blockchair; falls back to
 * Blockstream/Blockscout when Blockchair is rate-limited (same as Radar UI).
 */
async function fetchWhalesForChainActivity(
  chain: WhaleChain,
  limit: number
): Promise<RawWhaleTx[]> {
  if (chain === "Bitcoin") return getSharedBtcWhales(limit);
  if (chain === "Ethereum") return getSharedEthWhales(limit);
  return fetchSolWhalesRaw(WHALE_THRESHOLDS.SOL, limit);
}

/**
 * Aggregate whale activity since `sinceMs` for a single chain.
 * Net flow: in = +usd, out = −usd, unknown excluded from net but counted.
 *
 * Returns `null` when upstream fetch fails (unknown) — never `{0,0}`, which would
 * be a false "confirmed zero activity" signal for ML training.
 * A successful fetch with no txs in-window still returns zeros (confirmed quiet).
 */
export async function getWhaleActivitySince(
  chain: WhaleChain,
  sinceMs: number
): Promise<WhaleActivitySummary | null> {
  let rows: RawWhaleTx[];
  try {
    rows = await fetchWhalesForChainActivity(
      chain,
      WHALE_THRESHOLDS.activityLimit
    );
  } catch (err) {
    const details = fetchErrorDetails(err);
    console.error("[whales] activity fetch failed — leaving features null:", {
      chain,
      status: details.status,
      error: details.error,
    });
    return null;
  }

  const inWindow = rows.filter((tx) => tx.timestampMs >= sinceMs);

  let whaleNetFlowUsd = 0;
  for (const tx of inWindow) {
    if (tx.direction === "in") whaleNetFlowUsd += tx.usdValue;
    else if (tx.direction === "out") whaleNetFlowUsd -= tx.usdValue;
  }

  return {
    whaleNetFlowUsd,
    whaleTransactionCount: inWindow.length,
  };
}

/** Radar UI feed — same shape/limits as before; formatting applied on top of raw fetch. */
export async function fetchWhaleTransactions(): Promise<WhaleTransaction[]> {
  const { SOL, perChainLimit, totalLimit } = WHALE_THRESHOLDS;

  // Soft-fail per chain for UI: empty rows on error (not ML features — zeros OK here).
  const [btc, eth, sol] = await Promise.allSettled([
    getSharedBtcWhales(perChainLimit),
    getSharedEthWhales(perChainLimit),
    fetchSolWhalesRaw(SOL, perChainLimit),
  ]);

  if (btc.status === "rejected") {
    console.error("[whales] Radar BTC fetch failed:", btc.reason);
  }
  if (eth.status === "rejected") {
    console.error("[whales] Radar ETH fetch failed:", eth.reason);
  }
  if (sol.status === "rejected") {
    console.error("[whales] Radar SOL fetch failed:", sol.reason);
  }

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

  return merged.slice(0, totalLimit).map(toWhaleTransaction);
}
