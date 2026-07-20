import type { PortfolioPosition } from "@/lib/types";

const STORAGE_KEY = "dc_portfolio_positions";

export function createPositionId(): string {
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadStoredPositions(): PortfolioPosition[] | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PortfolioPosition[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveStoredPositions(positions: PortfolioPosition[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}
