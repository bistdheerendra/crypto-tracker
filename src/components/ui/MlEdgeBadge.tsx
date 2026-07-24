type MlEdgeBadgeProps = {
  winProbability: number;
  className?: string;
};

/**
 * Display-only experimental ML win-probability chip.
 * Colorful so it reads as a distinct ML signal, not a muted meta tag.
 */
export function MlEdgeBadge({ winProbability, className = "" }: MlEdgeBadgeProps) {
  const pct = Math.round(winProbability * 100);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono-data font-semibold cursor-help shadow-[0_0_12px_rgba(62,166,255,0.25)] bg-gradient-to-r from-accent/25 via-accent/10 to-bull/15 border-accent/45 text-accent ${className}`}
      title="Experimental ML win probability (walk-forward AUC ~0.57, unstable across folds). Not a validated trading signal — display only."
    >
      <span
        className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 animate-pulse"
        aria-hidden
      />
      <span className="tracking-wide uppercase text-[9px] text-accent/80 font-bold">
        ML
      </span>
      <span className="text-text-primary">
        edge: <span className="text-accent tabular-nums">{pct}%</span>
      </span>
      <span className="text-[9px] text-mixed/90 font-medium normal-case tracking-normal">
        experimental
      </span>
    </span>
  );
}
