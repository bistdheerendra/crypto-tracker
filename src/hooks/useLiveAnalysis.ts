"use client";

import { useEffect, useState } from "react";
import type { LaneOutput, Verdict } from "@/lib/types";

export function useLiveAnalysis(pair = "BTC/USDT", timeframe = "1h") {
  const [lanes, setLanes] = useState<LaneOutput[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/analyze?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          setLanes([]);
          setVerdict(null);
          return;
        }
        setLanes(data.lanes ?? []);
        setVerdict(data.verdict ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load live analysis.");
          setLanes([]);
          setVerdict(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pair, timeframe]);

  return { lanes, verdict, loading, error };
}
