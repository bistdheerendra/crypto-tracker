import type { Liquidation } from "@/lib/types";
import { fetchJsonWithTimeout } from "@/lib/fetch-utils";
import { formatTimeAgo, formatUsdCompact } from "./utils";
import { collectWebSocketMessages } from "./websocket-utils";

interface OkxLiquidationDetail {
  side?: string;
  sz?: string;
  bkPx?: string;
  ts?: string;
}

interface OkxLiquidationGroup {
  instId?: string;
  details?: OkxLiquidationDetail[];
}

interface BinanceForceOrder {
  e?: string;
  o?: {
    s?: string;
    S?: string;
    q?: string;
    ap?: string;
    p?: string;
    T?: number;
  };
}

interface BybitLiquidation {
  T?: number;
  s?: string;
  S?: string;
  v?: string;
  p?: string;
}

/** Unformatted liquidation for feature capture and Radar formatting. */
export interface RawLiquidation {
  id: string;
  exchange: string;
  pair: string;
  side: "long" | "short";
  usdValue: number;
  timestampMs: number;
}

export interface LiquidationActivitySummary {
  liquidationNetImbalanceUsd: number;
  liquidationVolumeUsd: number;
}

const OKX_PAIRS = [
  { uly: "BTC-USDT", pair: "BTC/USDT" },
  { uly: "ETH-USDT", pair: "ETH/USDT" },
  { uly: "SOL-USDT", pair: "SOL/USDT" },
  { uly: "BNB-USDT", pair: "BNB/USDT" },
  { uly: "XRP-USDT", pair: "XRP/USDT" },
] as const;

const BINANCE_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
] as const;

const BYBIT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
] as const;

/** Higher OKX page size for lookback aggregation (Radar still uses 20). */
const OKX_ACTIVITY_LIMIT = 100;

function mapOkxSide(side: string): "long" | "short" {
  return side === "sell" ? "long" : "short";
}

function mapBinanceSide(side: string): "long" | "short" {
  return side === "SELL" ? "long" : "short";
}

function mapBybitSide(side: string): "long" | "short" {
  return side === "Sell" ? "long" : "short";
}

function mapBinanceSymbol(symbol: string): string {
  return symbol.replace("USDT", "/USDT");
}

function toLiquidation(raw: RawLiquidation): Liquidation {
  return {
    id: raw.id,
    exchange: raw.exchange,
    pair: raw.pair,
    side: raw.side,
    amount: formatUsdCompact(raw.usdValue),
    timeAgo: formatTimeAgo(new Date(raw.timestampMs)),
  };
}

function sortRawByRecency(merged: RawLiquidation[]): RawLiquidation[] {
  return merged.sort((a, b) => b.timestampMs - a.timestampMs);
}

async function fetchOkxLiquidationsRaw(
  uly: string,
  pair: string,
  limit = 20
): Promise<RawLiquidation[]> {
  const data = await fetchJsonWithTimeout<{ data?: OkxLiquidationGroup[] }>(
    `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=${uly}&state=filled&limit=${limit}`,
    6000
  );

  const liquidations: RawLiquidation[] = [];
  for (const group of data.data ?? []) {
    for (const row of group.details ?? []) {
      const size = parseFloat(row.sz ?? "0");
      const price = parseFloat(row.bkPx ?? "0");
      const usd = size * price;
      const ts = row.ts ? parseInt(row.ts, 10) : Date.now();
      liquidations.push({
        id: `okx-${uly}-${row.ts ?? liquidations.length}`,
        exchange: "OKX",
        pair,
        side: mapOkxSide(row.side ?? "sell"),
        usdValue: usd,
        timestampMs: ts,
      });
    }
  }
  return liquidations;
}

async function fetchBinanceLiquidationsRaw(): Promise<RawLiquidation[]> {
  const rows = await collectWebSocketMessages<BinanceForceOrder>({
    url: "wss://fstream.binance.com/ws/!forceOrder@arr",
    waitMs: 4500,
    parseMessage: (data) => {
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object" && "o" in data) return [data];
      return [];
    },
  });

  const liquidations: RawLiquidation[] = [];
  for (const row of rows) {
    const o = row.o;
    if (!o?.s || !BINANCE_SYMBOLS.includes(o.s as (typeof BINANCE_SYMBOLS)[number])) continue;
    const qty = parseFloat(o.q ?? "0");
    const price = parseFloat(o.ap ?? o.p ?? "0");
    const usd = qty * price;
    const ts = o.T ?? Date.now();
    liquidations.push({
      id: `binance-${o.s}-${o.T ?? liquidations.length}`,
      exchange: "Binance",
      pair: mapBinanceSymbol(o.s),
      side: mapBinanceSide(o.S ?? "SELL"),
      usdValue: usd,
      timestampMs: ts,
    });
  }
  return liquidations;
}

async function fetchBybitLiquidationsRaw(): Promise<RawLiquidation[]> {
  const rows = await collectWebSocketMessages<BybitLiquidation>({
    url: "wss://stream.bybit.com/v5/public/linear",
    waitMs: 4500,
    onOpen: (ws) => {
      ws.send(
        JSON.stringify({
          op: "subscribe",
          args: BYBIT_SYMBOLS.map((s) => `allLiquidation.${s}`),
        })
      );
    },
    parseMessage: (data) => {
      if (!data || typeof data !== "object") return [];
      const msg = data as { topic?: string; data?: BybitLiquidation[] };
      if (msg.topic?.startsWith("allLiquidation.") && Array.isArray(msg.data)) {
        return msg.data;
      }
      return [];
    },
  });

  const liquidations: RawLiquidation[] = [];
  for (const row of rows) {
    if (!row.s || !BYBIT_SYMBOLS.includes(row.s as (typeof BYBIT_SYMBOLS)[number])) continue;
    const qty = parseFloat(row.v ?? "0");
    const price = parseFloat(row.p ?? "0");
    const usd = qty * price;
    const ts = row.T ?? Date.now();
    liquidations.push({
      id: `bybit-${row.s}-${row.T ?? liquidations.length}`,
      exchange: "Bybit",
      pair: mapBinanceSymbol(row.s),
      side: mapBybitSide(row.S ?? "Sell"),
      usdValue: usd,
      timestampMs: ts,
    });
  }
  return liquidations;
}

/**
 * Pair-specific liquidation activity since `sinceMs`.
 * Uses OKX REST only (historical + fast) — Binance/Bybit Radar feeds are
 * short live WebSocket windows and would add ~4.5s latency to analyze.
 */
export async function getLiquidationActivitySince(
  pair: string,
  sinceMs: number
): Promise<LiquidationActivitySummary> {
  const okxPair = OKX_PAIRS.find((p) => p.pair === pair);
  if (!okxPair) {
    return { liquidationNetImbalanceUsd: 0, liquidationVolumeUsd: 0 };
  }

  const rows = await fetchOkxLiquidationsRaw(
    okxPair.uly,
    okxPair.pair,
    OKX_ACTIVITY_LIMIT
  );
  const inWindow = rows.filter((row) => row.timestampMs >= sinceMs);

  let longUsd = 0;
  let shortUsd = 0;
  for (const row of inWindow) {
    if (row.side === "long") longUsd += row.usdValue;
    else shortUsd += row.usdValue;
  }

  return {
    liquidationNetImbalanceUsd: longUsd - shortUsd,
    liquidationVolumeUsd: longUsd + shortUsd,
  };
}

/** Radar UI feed — same multi-exchange merge; formatting applied on top of raw fetch. */
export async function fetchLiquidations(): Promise<Liquidation[]> {
  const [okxBatches, binance, bybit] = await Promise.allSettled([
    Promise.allSettled(OKX_PAIRS.map((p) => fetchOkxLiquidationsRaw(p.uly, p.pair))),
    fetchBinanceLiquidationsRaw(),
    fetchBybitLiquidationsRaw(),
  ]);

  const okxRows =
    okxBatches.status === "fulfilled"
      ? okxBatches.value.flatMap((b) => (b.status === "fulfilled" ? b.value : []))
      : [];

  const binanceRows = binance.status === "fulfilled" ? binance.value : [];
  const bybitRows = bybit.status === "fulfilled" ? bybit.value : [];

  if (okxRows.length === 0 && binanceRows.length === 0 && bybitRows.length === 0) {
    console.error("[liquidations] All sources returned 0 rows");
  }

  return sortRawByRecency([...okxRows, ...binanceRows, ...bybitRows])
    .slice(0, 15)
    .map(toLiquidation);
}
