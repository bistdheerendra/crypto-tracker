import type {
  NewsItem,
  WhaleTransaction,
  ETFFlow,
  Liquidation,
  LaneOutput,
} from "./types";

export const MOCK_NEWS: NewsItem[] = [
  {
    id: "1",
    location: "Mumbai",
    country: "India",
    timeAgo: "12m ago",
    headline: "RBI signals cautious stance on crypto regulation framework",
    sentiment: "bearish",
    marketTag: "INR markets",
    connected: 4,
    lat: 19.076,
    lng: 72.8777,
  },
  {
    id: "2",
    location: "New York",
    country: "USA",
    timeAgo: "28m ago",
    headline: "BlackRock IBIT records $420M net inflow — largest single-day since launch",
    sentiment: "bullish",
    marketTag: "ETF flows",
    connected: 7,
    lat: 40.7128,
    lng: -74.006,
  },
  {
    id: "3",
    location: "Singapore",
    country: "Singapore",
    timeAgo: "45m ago",
    headline: "Major exchange adds SOL staking products for institutional clients",
    sentiment: "bullish",
    marketTag: "SOL ecosystem",
    connected: 3,
    lat: 1.3521,
    lng: 103.8198,
  },
  {
    id: "4",
    location: "Frankfurt",
    country: "Germany",
    timeAgo: "1h ago",
    headline: "ECB minutes hint at extended pause on rate cuts amid inflation stickiness",
    sentiment: "neutral",
    marketTag: "Macro / EUR",
    connected: 5,
    lat: 50.1109,
    lng: 8.6821,
  },
  {
    id: "5",
    location: "Seoul",
    country: "South Korea",
    timeAgo: "1h ago",
    headline: "Upbit volume surges 38% as altcoin rotation accelerates",
    sentiment: "bullish",
    marketTag: "KRW markets",
    connected: 2,
    lat: 37.5665,
    lng: 126.978,
  },
  {
    id: "6",
    location: "London",
    country: "UK",
    timeAgo: "2h ago",
    headline: "FCA issues warning on unregistered DeFi yield platforms",
    sentiment: "bearish",
    marketTag: "DeFi regulation",
    connected: 6,
    lat: 51.5074,
    lng: -0.1278,
  },
];

export const MOCK_LANES: LaneOutput[] = [
  {
    lane: "Technical",
    badge: "T",
    bias: "BULL",
    tier: "HIGH",
    reasoning: [
      "Price above 50/200 EMA crossover",
      "RSI(14) at 58 — room to run",
      "MACD histogram turning positive",
    ],
  },
  {
    lane: "Flow",
    badge: "F",
    bias: "BULL",
    tier: "MODERATE",
    reasoning: [
      "OI +4.2% in 24h with price rising",
      "Funding rate 0.008% — mild long bias",
      "Long/short ratio 1.18",
    ],
  },
  {
    lane: "Narrative",
    badge: "N",
    bias: "MIXED",
    tier: "MODERATE",
    reasoning: [
      "ETF inflows positive but slowing",
      "Fed rhetoric hawkish-leaning",
      "Social sentiment 62% bullish",
    ],
  },
  {
    lane: "Macro",
    badge: "M",
    bias: "BEAR",
    tier: "LOW",
    reasoning: [
      "DXY strengthening +0.3%",
      "S&P 500 flat — risk-off undertone",
      "Gold +0.8% — hedge demand rising",
    ],
  },
];

export const MOCK_WHALES: WhaleTransaction[] = [
  {
    id: "w1",
    address: "0x7a2...f3c9",
    amount: "1,250 BTC",
    usdValue: "$118.4M",
    direction: "out",
    timeAgo: "8m ago",
    chain: "Bitcoin",
  },
  {
    id: "w2",
    address: "0x3b1...a8e2",
    amount: "45,000 ETH",
    usdValue: "$142.2M",
    direction: "in",
    timeAgo: "22m ago",
    chain: "Ethereum",
  },
  {
    id: "w3",
    address: "bc1q...9xk2",
    amount: "890 BTC",
    usdValue: "$84.3M",
    direction: "out",
    timeAgo: "41m ago",
    chain: "Bitcoin",
  },
  {
    id: "w4",
    address: "0x9f4...c1d7",
    amount: "2.1M SOL",
    usdValue: "$312.6M",
    direction: "in",
    timeAgo: "1h ago",
    chain: "Solana",
  },
];

export const MOCK_ETF_FLOWS: ETFFlow[] = [
  { ticker: "IBIT", name: "iShares Bitcoin Trust", netFlow: 420.5, date: "Today" },
  { ticker: "FBTC", name: "Fidelity Wise Origin", netFlow: 128.3, date: "Today" },
  { ticker: "GBTC", name: "Grayscale Bitcoin Trust", netFlow: -45.2, date: "Today" },
  { ticker: "ARKB", name: "ARK 21Shares Bitcoin", netFlow: 67.8, date: "Today" },
  { ticker: "BITB", name: "Bitwise Bitcoin ETF", netFlow: 34.1, date: "Today" },
  { ticker: "ETHA", name: "iShares Ethereum Trust", netFlow: 89.6, date: "Today" },
];

export const MOCK_LIQUIDATIONS: Liquidation[] = [
  {
    id: "l1",
    exchange: "Binance",
    pair: "BTC/USDT",
    side: "long",
    amount: "$12.4M",
    timeAgo: "3m ago",
  },
  {
    id: "l2",
    exchange: "Bybit",
    pair: "ETH/USDT",
    side: "short",
    amount: "$8.7M",
    timeAgo: "11m ago",
  },
  {
    id: "l3",
    exchange: "OKX",
    pair: "SOL/USDT",
    side: "long",
    amount: "$4.2M",
    timeAgo: "18m ago",
  },
  {
    id: "l4",
    exchange: "Binance",
    pair: "BTC/USDT",
    side: "short",
    amount: "$22.1M",
    timeAgo: "34m ago",
  },
];

export const TRACKED_PAIRS = [
  "BTC/USDT",
  "ETH/USDT",
  "SOL/USDT",
  "BNB/USDT",
  "XRP/USDT",
];

export const CORRELATION_MATRIX: Record<string, number> = {
  "ETH/USDT": 0.88,
  "SOL/USDT": 0.82,
  "BNB/USDT": 0.75,
  "XRP/USDT": 0.71,
  "PAXG/USDT": -0.35,
};
