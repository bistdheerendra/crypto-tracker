import type { MarketRegime, RegimeDirection } from "@/lib/analysis/regime";

type RegimeBadgeProps = {
  regime: MarketRegime;
  direction?: RegimeDirection;
  className?: string;
};

/**
 * Display-only market regime chip. Does not gate trades or verdicts.
 */
export function RegimeBadge({
  regime,
  direction = "FLAT",
  className = "",
}: RegimeBadgeProps) {
  if (regime === "CHOPPY") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono-data font-semibold uppercase tracking-wider bg-mixed/15 text-mixed border-mixed/30 ${className}`}
        title="Range-bound / choppy conditions — treat trend-following signals with extra skepticism."
      >
        Choppy ⚠️
      </span>
    );
  }

  const arrow =
    direction === "UP" ? " ↑" : direction === "DOWN" ? " ↓" : "";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono-data font-semibold uppercase tracking-wider bg-bull/15 text-bull border-bull/30 ${className}`}
      title="Trending conditions — directional moves covering most of the recent range."
    >
      Trending{arrow}
    </span>
  );
}
