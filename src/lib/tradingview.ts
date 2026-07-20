export const TIMEFRAME_OPTIONS = [
  { label: "15m", interval: "15", apiTimeframe: "15m" },
  { label: "1h", interval: "60", apiTimeframe: "1h" },
  { label: "4h", interval: "240", apiTimeframe: "4h" },
  { label: "1D", interval: "D", apiTimeframe: "1d" },
] as const;

export type ChartInterval = (typeof TIMEFRAME_OPTIONS)[number]["interval"];

const PAIR_STORAGE_KEY = "dc_selected_pair";

export function toTradingViewSymbol(pair: string, exchange = "BINANCE"): string {
  const normalized = pair.replace("/", "").toUpperCase();
  return `${exchange}:${normalized}`;
}

export function intervalToApiTimeframe(interval: string): string {
  const match = TIMEFRAME_OPTIONS.find((t) => t.interval === interval);
  return match?.apiTimeframe ?? "1h";
}

export function apiTimeframeToInterval(timeframe: string): ChartInterval {
  const match = TIMEFRAME_OPTIONS.find((t) => t.apiTimeframe === timeframe);
  return match?.interval ?? "60";
}

export function getStoredPair(): string {
  if (typeof window === "undefined") return "BTC/USDT";
  return localStorage.getItem(PAIR_STORAGE_KEY) ?? "BTC/USDT";
}

export function setStoredPair(pair: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PAIR_STORAGE_KEY, pair);
}

const BINANCE_WS_ENDPOINTS = [
  "wss://stream.binance.com:9443/ws",
  "wss://data-stream.binance.vision/ws",
];

export function getBinanceKlineWsUrl(pair: string, interval: string): string {
  const symbol = pair.replace("/", "").toLowerCase();
  const timeframe = intervalToApiTimeframe(interval);
  return `${BINANCE_WS_ENDPOINTS[0]}/${symbol}@kline_${timeframe}`;
}

export function getBinanceKlineWsFallbackUrl(pair: string, interval: string): string {
  const symbol = pair.replace("/", "").toLowerCase();
  const timeframe = intervalToApiTimeframe(interval);
  return `${BINANCE_WS_ENDPOINTS[1]}/${symbol}@kline_${timeframe}`;
}
