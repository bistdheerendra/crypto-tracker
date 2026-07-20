"use client";

import { useEffect, useState } from "react";

export function useCorrelationMatrix() {
  const [matrix, setMatrix] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/scenarios/correlation")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setMatrix(data.matrix ?? {});
      })
      .catch(() => {
        if (!cancelled) setError("Could not load correlation matrix.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { matrix, loading, error };
}
