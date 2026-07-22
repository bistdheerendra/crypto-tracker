import type { CalendarEvent } from "@/lib/types";

const BINANCE_CMS =
  "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query";

const CATALOGS = [
  { id: 48, category: "Listing" },
  { id: 161, category: "Delisting" },
  { id: 49, category: "News" },
  { id: 93, category: "Activity" },
] as const;

const PAPRIKA_COINS = [
  { id: "btc-bitcoin", symbol: "BTC" },
  { id: "eth-ethereum", symbol: "ETH" },
  { id: "sol-solana", symbol: "SOL" },
  { id: "bnb-binance-coin", symbol: "BNB" },
  { id: "xrp-xrp", symbol: "XRP" },
] as const;

const DATE_IN_TITLE =
  /(\d{4}-\d{2}-\d{2})(?:\s*&\s*(\d{4}-\d{2}-\d{2}))?/g;

interface BinanceArticle {
  id: number;
  code: string;
  title: string;
  releaseDate: number;
}

interface BinanceCatalogPayload {
  data?: {
    catalogs?: Array<{
      catalogId: number;
      catalogName: string;
      articles?: BinanceArticle[];
    }>;
  };
}

interface PaprikaEvent {
  id: string;
  date: string;
  date_to: string | null;
  name: string;
  link: string | null;
  is_conference: boolean;
}

function toMs(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000;
}

function formatIstParts(date: Date): { dateIst: string; timeIst: string } {
  const dateIst = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

  const timeIst = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(/\u202f/g, " ");

  return { dateIst, timeIst: `${timeIst} IST` };
}

function parseDatesFromTitle(title: string): Date[] {
  const dates: Date[] = [];
  DATE_IN_TITLE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DATE_IN_TITLE.exec(title)) !== null) {
    for (const part of [match[1], match[2]]) {
      if (!part) continue;
      const d = new Date(`${part}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) dates.push(d);
    }
  }
  return dates;
}

function startOfTodayIstMs(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return new Date(`${y}-${m}-${d}T00:00:00+05:30`).getTime();
}

async function fetchBinanceCatalog(
  catalogId: number,
  category: string
): Promise<CalendarEvent[]> {
  const url = `${BINANCE_CMS}?type=1&pageNo=1&pageSize=20&catalogId=${catalogId}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (compatible; DeepCurrent/1.0; +https://deepcurrent.app)",
      clienttype: "web",
      lang: "en",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Binance CMS ${catalogId} failed: ${res.status}`);

  const json = (await res.json()) as BinanceCatalogPayload;
  const articles = json.data?.catalogs?.[0]?.articles ?? [];
  const floor = startOfTodayIstMs();
  const events: CalendarEvent[] = [];

  for (const article of articles) {
    const titleDates = parseDatesFromTitle(article.title);
    const publishedAt = new Date(toMs(article.releaseDate));
    const eventDate = titleDates[0] ?? publishedAt;
    if (Number.isNaN(eventDate.getTime()) || eventDate.getTime() < floor) continue;

    const { dateIst, timeIst } = formatIstParts(eventDate);
    events.push({
      id: `binance-${article.id}`,
      title: article.title.trim(),
      category,
      eventAt: eventDate.toISOString(),
      dateIst,
      timeIst: titleDates[0] ? "All day IST" : timeIst,
      url: `https://www.binance.com/en/support/announcement/${article.code}`,
      source: "Binance",
    });
  }

  return events;
}

async function fetchPaprikaEvents(): Promise<CalendarEvent[]> {
  const floor = startOfTodayIstMs();
  const results = await Promise.allSettled(
    PAPRIKA_COINS.map(async (coin) => {
      const res = await fetch(
        `https://api.coinpaprika.com/v1/coins/${coin.id}/events`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        }
      );
      if (!res.ok) throw new Error(`CoinPaprika ${coin.id} failed`);
      const items = (await res.json()) as PaprikaEvent[];
      return items
        .map((item): CalendarEvent | null => {
          const eventDate = new Date(item.date);
          if (Number.isNaN(eventDate.getTime()) || eventDate.getTime() < floor) {
            return null;
          }
          const { dateIst, timeIst } = formatIstParts(eventDate);
          return {
            id: `paprika-${item.id}`,
            title: `[${coin.symbol}] ${item.name}`,
            category: item.is_conference ? "Conference" : "Event",
            eventAt: eventDate.toISOString(),
            dateIst,
            timeIst,
            url: item.link ?? undefined,
            source: "CoinPaprika",
          };
        })
        .filter((e): e is CalendarEvent => e !== null);
    })
  );

  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export async function fetchUpcomingEvents(limit = 20): Promise<CalendarEvent[]> {
  const binanceResults = await Promise.allSettled(
    CATALOGS.map((c) => fetchBinanceCatalog(c.id, c.category))
  );
  const paprikaResults = await Promise.allSettled([fetchPaprikaEvents()]);

  const merged = [
    ...binanceResults.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    ...paprikaResults.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
  ];

  const seen = new Set<string>();
  const unique = merged.filter((event) => {
    const key = `${event.title.toLowerCase()}|${event.dateIst}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort(
    (a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime()
  );

  if (unique.length === 0) {
    const failures = [...binanceResults, ...paprikaResults].filter(
      (r) => r.status === "rejected"
    );
    if (failures.length > 0) {
      throw new Error("Failed to load crypto calendar events");
    }
  }

  return unique.slice(0, limit);
}
