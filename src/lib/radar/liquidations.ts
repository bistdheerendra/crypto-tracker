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

const OKX_PAIRS = [
  { uly: "BTC-USDT", pair: "BTC/USDT" },
  { uly: "ETH-USDT", pair: "ETH/USDT" },
  { uly: "SOL-USDT", pair: "SOL/USDT" },
] as const;

const BINANCE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
const BYBIT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;

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

function parseTimeAgoSortKey(timeAgo: string): number {
  const m = timeAgo.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 0;
  if (timeAgo.includes("just now")) return 0;
  if (timeAgo.includes("m")) return n;
  if (timeAgo.includes("h")) return n * 60;
  return n * 1440;
}

function sortByRecency(merged: Liquidation[]): Liquidation[] {
  return merged.sort(
    (a, b) => parseTimeAgoSortKey(a.timeAgo) - parseTimeAgoSortKey(b.timeAgo)
  );
}

async function fetchOkxLiquidations(uly: string, pair: string): Promise<Liquidation[]> {
  const data = await fetchJsonWithTimeout<{ data?: OkxLiquidationGroup[] }>(
    `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&uly=${uly}&state=filled&limit=20`,
    6000
  );

  const liquidations: Liquidation[] = [];
  for (const group of data.data ?? []) {
    for (const row of group.details ?? []) {
      const size = parseFloat(row.sz ?? "0");
      const price = parseFloat(row.bkPx ?? "0");
      const usd = size * price;
      const ts = row.ts ? new Date(parseInt(row.ts, 10)) : new Date();
      liquidations.push({
        id: `okx-${uly}-${row.ts ?? liquidations.length}`,
        exchange: "OKX",
        pair,
        side: mapOkxSide(row.side ?? "sell"),
        amount: formatUsdCompact(usd),
        timeAgo: formatTimeAgo(ts),
      });
    }
  }
  return liquidations;
}

async function fetchBinanceLiquidations(): Promise<Liquidation[]> {
  const rows = await collectWebSocketMessages<BinanceForceOrder>({
    url: "wss://fstream.binance.com/ws/!forceOrder@arr",
    waitMs: 4500,
    parseMessage: (data) => {
      if (Array.isArray(data)) return data;
      if (data && typeof data === "object" && "o" in data) return [data];
      return [];
    },
  });

  const liquidations: Liquidation[] = [];
  for (const row of rows) {
    const o = row.o;
    if (!o?.s || !BINANCE_SYMBOLS.includes(o.s as (typeof BINANCE_SYMBOLS)[number])) continue;
    const qty = parseFloat(o.q ?? "0");
    const price = parseFloat(o.ap ?? o.p ?? "0");
    const usd = qty * price;
    const ts = o.T ? new Date(o.T) : new Date();
    liquidations.push({
      id: `binance-${o.s}-${o.T ?? liquidations.length}`,
      exchange: "Binance",
      pair: mapBinanceSymbol(o.s),
      side: mapBinanceSide(o.S ?? "SELL"),
      amount: formatUsdCompact(usd),
      timeAgo: formatTimeAgo(ts),
    });
  }
  return liquidations;
}

async function fetchBybitLiquidations(): Promise<Liquidation[]> {
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

  const liquidations: Liquidation[] = [];
  for (const row of rows) {
    if (!row.s || !BYBIT_SYMBOLS.includes(row.s as (typeof BYBIT_SYMBOLS)[number])) continue;
    const qty = parseFloat(row.v ?? "0");
    const price = parseFloat(row.p ?? "0");
    const usd = qty * price;
    const ts = row.T ? new Date(row.T) : new Date();
    liquidations.push({
      id: `bybit-${row.s}-${row.T ?? liquidations.length}`,
      exchange: "Bybit",
      pair: mapBinanceSymbol(row.s),
      side: mapBybitSide(row.S ?? "Sell"),
      amount: formatUsdCompact(usd),
      timeAgo: formatTimeAgo(ts),
    });
  }
  return liquidations;
}

export async function fetchLiquidations(): Promise<Liquidation[]> {
  const [okxBatches, binance, bybit] = await Promise.allSettled([
    Promise.allSettled(OKX_PAIRS.map((p) => fetchOkxLiquidations(p.uly, p.pair))),
    fetchBinanceLiquidations(),
    fetchBybitLiquidations(),
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

  return sortByRecency([...okxRows, ...binanceRows, ...bybitRows]).slice(0, 15);
}
