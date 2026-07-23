/**
 * Actively scheduled / UI-tracked USDT pairs.
 * PAXG/USDT was removed: no OKX perp (Flow fallback after Binance/Bybit
 * geo-block on Vercel), so auto-generated Flow features were chronically null.
 * Manual Copilot queries for PAXG still work; historical DB rows are kept.
 */
export const TRACKED_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
] as const;

/** Timeframes used for analyze / dashboard / DB-persisted verdicts. */
export const TRACKED_TIMEFRAMES = ["15m", "30m", "1h", "4h", "1d"] as const;

export type TrackedTimeframe = (typeof TRACKED_TIMEFRAMES)[number];

export const DASHBOARD_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
] as const;

/** Whale-tracker chains covered by Radar (Blockchair / Blockscout / Solana RPC). */
export type WhaleChain = "Bitcoin" | "Ethereum" | "Solana";

/**
 * Pair → on-chain whale tracker. BNB/XRP have no whale coverage — leave null.
 */
export const WHALE_CHAIN_BY_PAIR: Partial<Record<string, WhaleChain>> = {
  "BTC/USDT": "Bitcoin",
  "ETH/USDT": "Ethereum",
  "SOL/USDT": "Solana",
};

/**
 * Fixed lookback for whale / liquidation point-in-time features.
 * Independent of verdict timeframe — these are short-horizon activity signals.
 */
export const WHALE_LIQUIDATION_LOOKBACK_MS = 2 * 60 * 60 * 1000; // 2 hours
