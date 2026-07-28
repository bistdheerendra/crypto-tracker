"use client";

import { useEffect, useMemo, useState } from "react";

const WS_PRIMARY = "wss://stream.binance.com:9443";
const WS_FALLBACK = "wss://data-stream.binance.vision";

function pairToStreamSymbol(pair: string): string {
  return pair.replace("/", "").toLowerCase();
}

function streamSymbolToPair(symbol: string, pairs: string[]): string | null {
  const upper = symbol.toUpperCase();
  return pairs.find((p) => p.replace("/", "").toUpperCase() === upper) ?? null;
}

function combinedMiniTickerUrl(base: string, pairs: string[]): string {
  const streams = pairs.map((p) => `${pairToStreamSymbol(p)}@miniTicker`).join("/");
  return `${base}/stream?streams=${streams}`;
}

type MiniTickerMsg = {
  s?: string;
  c?: string;
};

/**
 * Live mark prices via Binance miniTicker WebSocket (with REST seed + fallback endpoint).
 */
export function useBinanceLivePrices(pairs: string[]): {
  prices: Record<string, number | null>;
  live: boolean;
} {
  const stablePairs = useMemo(() => {
    const unique = [...new Set(pairs.filter(Boolean))].sort();
    return unique;
  }, [pairs]);

  const pairKey = stablePairs.join("|");

  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (stablePairs.length === 0) {
      setPrices({});
      setLive(false);
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let useFallback = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function seedFromRest() {
      const rows = await Promise.all(
        stablePairs.map(async (pair) => {
          try {
            const res = await fetch(`/api/market?symbol=${encodeURIComponent(pair)}`);
            const data = await res.json();
            return [pair, typeof data.price === "number" ? data.price : null] as const;
          } catch {
            return [pair, null] as const;
          }
        })
      );
      if (!cancelled) setPrices(Object.fromEntries(rows));
    }

    function applyTick(raw: MiniTickerMsg) {
      if (!raw.s || raw.c == null) return;
      const pair = streamSymbolToPair(raw.s, stablePairs);
      if (!pair) return;
      const price = Number(raw.c);
      if (!Number.isFinite(price)) return;
      setPrices((prev) =>
        prev[pair] === price ? prev : { ...prev, [pair]: price }
      );
    }

    function connect() {
      if (cancelled) return;
      const base = useFallback ? WS_FALLBACK : WS_PRIMARY;
      const url = combinedMiniTickerUrl(base, stablePairs);

      ws = new WebSocket(url);

      ws.onopen = () => {
        if (!cancelled) setLive(true);
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(event.data as string) as
            | { data?: MiniTickerMsg }
            | MiniTickerMsg;
          const tick =
            parsed && typeof parsed === "object" && "data" in parsed
              ? parsed.data
              : (parsed as MiniTickerMsg);
          if (tick) applyTick(tick);
        } catch {
          // ignore malformed ticks
        }
      };

      ws.onerror = () => {
        if (cancelled) return;
        setLive(false);
        if (!useFallback) {
          useFallback = true;
          ws?.close();
          connect();
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setLive(false);
        reconnectTimer = setTimeout(() => connect(), 2_000);
      };
    }

    void seedFromRest();
    connect();

    return () => {
      cancelled = true;
      setLive(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
    // pairKey keeps deps stable when array identity changes but contents don't
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairKey]);

  return { prices, live };
}
