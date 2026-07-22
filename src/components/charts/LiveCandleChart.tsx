"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  getBinanceKlineWsFallbackUrl,
  getBinanceKlineWsUrl,
  intervalToApiTimeframe,
} from "@/lib/tradingview";

export interface ChartLevels {
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
}

interface LiveCandleChartProps {
  pair: string;
  interval: string;
  levels?: ChartLevels | null;
  onPriceUpdate?: (price: number) => void;
}

interface BinanceKlineMessage {
  k?: {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    x: boolean;
  };
}

const LEVEL_LINES: {
  key: keyof ChartLevels;
  title: string;
  color: string;
  lineStyle: LineStyle;
}[] = [
  { key: "entry", title: "Entry", color: "#3ea6ff", lineStyle: LineStyle.Solid },
  { key: "stopLoss", title: "SL", color: "#ff5c72", lineStyle: LineStyle.Dashed },
  { key: "takeProfit1", title: "TP1", color: "#2ee6a8", lineStyle: LineStyle.Dotted },
  { key: "takeProfit2", title: "TP2", color: "#2ee6a8", lineStyle: LineStyle.SparseDotted },
];

function parseKline(k: NonNullable<BinanceKlineMessage["k"]>): CandlestickData<UTCTimestamp> {
  return {
    time: Math.floor(k.t / 1000) as UTCTimestamp,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
  };
}

function applyLevelLines(
  series: ISeriesApi<"Candlestick">,
  levels: ChartLevels | null | undefined,
  existing: IPriceLine[]
): IPriceLine[] {
  for (const line of existing) {
    series.removePriceLine(line);
  }
  if (!levels) return [];

  return LEVEL_LINES.map((def) =>
    series.createPriceLine({
      price: levels[def.key],
      color: def.color,
      lineWidth: 1,
      lineStyle: def.lineStyle,
      axisLabelVisible: true,
      title: def.title,
    })
  );
}

export function LiveCandleChart({
  pair,
  interval,
  levels = null,
  onPriceUpdate,
}: LiveCandleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const levelsRef = useRef(levels);
  const onPriceUpdateRef = useRef(onPriceUpdate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    onPriceUpdateRef.current = onPriceUpdate;
  }, [onPriceUpdate]);

  useEffect(() => {
    levelsRef.current = levels;
    const series = seriesRef.current;
    if (!series) return;
    priceLinesRef.current = applyLevelLines(series, levels, priceLinesRef.current);
  }, [levels]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#03060f" },
        textColor: "#8b93a7",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      crosshair: {
        vertLine: { color: "rgba(62,166,255,0.4)" },
        horzLine: { color: "rgba(62,166,255,0.4)" },
      },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#2ee6a8",
      downColor: "#ff5c72",
      borderUpColor: "#2ee6a8",
      borderDownColor: "#ff5c72",
      wickUpColor: "#2ee6a8",
      wickDownColor: "#ff5c72",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    priceLinesRef.current = applyLevelLines(series, levelsRef.current, priceLinesRef.current);

    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      priceLinesRef.current = [];
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let useFallback = false;
    const timeframe = intervalToApiTimeframe(interval);

    async function loadHistory() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(
          `/api/klines?symbol=${encodeURIComponent(pair)}&interval=${timeframe}&limit=200`
        );
        const data = await res.json();
        if (!active) return false;

        if (!data.candles?.length) {
          setError(true);
          return false;
        }

        const candles: CandlestickData<UTCTimestamp>[] = data.candles.map(
          (c: { time: number; open: number; high: number; low: number; close: number }) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })
        );

        seriesRef.current?.setData(candles);
        chartRef.current?.timeScale().fitContent();

        if (seriesRef.current) {
          priceLinesRef.current = applyLevelLines(
            seriesRef.current,
            levelsRef.current,
            priceLinesRef.current
          );
        }

        const last = candles[candles.length - 1];
        if (last) onPriceUpdateRef.current?.(last.close);

        setError(false);
        return true;
      } catch {
        if (active) setError(true);
        return false;
      } finally {
        if (active) setLoading(false);
      }
    }

    function connectWs() {
      if (!active) return;

      const url = useFallback
        ? getBinanceKlineWsFallbackUrl(pair, interval)
        : getBinanceKlineWsUrl(pair, interval);

      ws = new WebSocket(url);

      ws.onopen = () => {
        if (active) setLive(true);
      };

      ws.onmessage = (event) => {
        if (!active || !seriesRef.current) return;
        try {
          const msg = JSON.parse(event.data as string) as BinanceKlineMessage;
          if (!msg.k) return;
          const candle = parseKline(msg.k);
          seriesRef.current.update(candle);
          onPriceUpdateRef.current?.(candle.close);
        } catch {
          // ignore malformed ticks
        }
      };

      ws.onerror = () => {
        if (!active) return;
        setLive(false);
        if (!useFallback) {
          useFallback = true;
          ws?.close();
          connectWs();
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setLive(false);
        reconnectTimer = setTimeout(connectWs, 3000);
      };
    }

    loadHistory().then((ok) => {
      if (ok && active) connectWs();
    });

    return () => {
      active = false;
      setLive(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [pair, interval]);

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-card z-10">
          <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="absolute top-3 left-3 z-10 text-xs text-mixed bg-bg-card/90 px-3 py-1.5 rounded-lg border border-white/8">
          Chart data unavailable
        </div>
      )}
      {live && !loading && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 text-[10px] text-bull uppercase tracking-wider bg-bg-card/90 px-2.5 py-1 rounded-lg border border-white/8">
          <span className="w-1.5 h-1.5 rounded-full bg-bull pulse-dot" />
          Live
        </div>
      )}
      {levels && !loading && !error && (
        <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-2 text-[10px] font-mono-data bg-bg-card/90 px-2.5 py-1.5 rounded-lg border border-white/8">
          <span className="text-accent">Entry</span>
          <span className="text-bear">SL</span>
          <span className="text-bull">TP1 / TP2</span>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
