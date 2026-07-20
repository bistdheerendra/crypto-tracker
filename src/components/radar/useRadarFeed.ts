"use client";

import { useCallback, useEffect, useState } from "react";

export function useRadarFeed<T>(type: string, pollMs = 60_000) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/radar?type=${encodeURIComponent(type)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to load data");
        return;
      }
      setData(json.data ?? []);
      setError(null);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchData();
    if (pollMs <= 0) return;
    const interval = setInterval(fetchData, pollMs);
    return () => clearInterval(interval);
  }, [fetchData, pollMs]);

  return { data, loading, error, refresh: fetchData };
}
