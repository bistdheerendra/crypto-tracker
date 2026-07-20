import type { NewsItem, Sentiment } from "@/lib/types";
import { formatTimeAgo } from "./utils";

const RSS_FEEDS = [
  {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    source: "CoinDesk",
    location: "New York",
    country: "US",
    lat: 40.7128,
    lng: -74.006,
  },
  {
    url: "https://cointelegraph.com/rss",
    source: "CoinTelegraph",
    location: "New York",
    country: "US",
    lat: 40.7128,
    lng: -74.006,
  },
  {
    url: "https://decrypt.co/feed",
    source: "Decrypt",
    location: "San Francisco",
    country: "US",
    lat: 37.7749,
    lng: -122.4194,
  },
] as const;

const BULLISH = [
  "surge",
  "rally",
  "record",
  "approval",
  "inflow",
  "bullish",
  "gains",
  "soar",
  "rise",
  "jump",
  "high",
  "breakout",
  "adoption",
];
const BEARISH = [
  "crash",
  "drop",
  "ban",
  "hack",
  "outflow",
  "bearish",
  "plunge",
  "fall",
  "selloff",
  "fraud",
  "lawsuit",
  "decline",
  "loss",
];

function decodeHtml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseRssItems(xml: string): { title: string; pubDate: string; link: string }[] {
  const items: { title: string; pubDate: string; link: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = decodeHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? "";
    const link = decodeHtml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? "");
    if (title) items.push({ title, pubDate, link });
  }

  return items;
}

function inferSentiment(headline: string): Sentiment {
  const lower = headline.toLowerCase();
  let bull = 0;
  let bear = 0;
  for (const word of BULLISH) if (lower.includes(word)) bull += 1;
  for (const word of BEARISH) if (lower.includes(word)) bear += 1;
  if (bull > bear) return "bullish";
  if (bear > bull) return "bearish";
  return "neutral";
}

function inferMarketTag(headline: string): string {
  const lower = headline.toLowerCase();
  if (lower.includes("bitcoin") || lower.includes("btc")) return "BTC";
  if (lower.includes("ethereum") || lower.includes("eth")) return "ETH";
  if (lower.includes("solana") || lower.includes(" sol ")) return "SOL";
  if (lower.includes("etf")) return "ETF";
  if (lower.includes("regulation") || lower.includes("sec")) return "Regulation";
  return "Crypto";
}

async function fetchFeedXml(url: string): Promise<string> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${url}`);
  return res.text();
}

export async function fetchLiveNews(limit = 12): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map(async (feed) => {
      const xml = await fetchFeedXml(feed.url);
      return parseRssItems(xml).slice(0, 6).map((item, index) => {
        const published = item.pubDate ? new Date(item.pubDate) : new Date();
        const sentiment = inferSentiment(item.title);
        return {
          id: `${feed.source}-${index}-${item.link.slice(-12)}`,
          location: feed.location,
          country: feed.country,
          timeAgo: formatTimeAgo(published),
          headline: item.title,
          source: feed.source,
          sentiment,
          marketTag: inferMarketTag(item.title),
          connected: sentiment === "neutral" ? 1 : 2,
          lat: feed.lat,
          lng: feed.lng,
          _publishedAt: published.getTime(),
        };
      });
    })
  );

  type NewsWithTs = NewsItem & { _publishedAt: number };

  const merged = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => (b as NewsWithTs)._publishedAt - (a as NewsWithTs)._publishedAt)
    .slice(0, limit)
    .map(({ _publishedAt, ...item }) => item as NewsItem);

  return merged;
}
