export const TRACKED_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
  "PAXG/USDT",
] as const;

/** Timeframes used for analyze / dashboard / DB-persisted verdicts. */
export const TRACKED_TIMEFRAMES = ["15m", "30m", "1h", "4h", "1d"] as const;

export type TrackedTimeframe = (typeof TRACKED_TIMEFRAMES)[number];

export const DASHBOARD_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "PAXG/USDT",
] as const;
