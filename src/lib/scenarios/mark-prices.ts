import type { PortfolioPosition } from "@/lib/types";

export async function fetchMarkPrices(pairs: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(pairs)];
  if (unique.length === 0) return {};

  const results = await Promise.all(
    unique.map(async (pair) => {
      try {
        const res = await fetch(`/api/market?symbol=${encodeURIComponent(pair)}`);
        if (!res.ok) return [pair, null] as const;
        const data = (await res.json()) as { price?: number };
        return [pair, typeof data.price === "number" ? data.price : null] as const;
      } catch {
        return [pair, null] as const;
      }
    })
  );

  return Object.fromEntries(
    results.filter((entry): entry is [string, number] => entry[1] != null)
  );
}

export function applyMarkPrices(
  positions: PortfolioPosition[],
  prices: Record<string, number>
): PortfolioPosition[] {
  return positions.map((p) => ({
    ...p,
    markPrice: prices[p.pair] ?? p.markPrice,
  }));
}
