import type { Tier } from "@/lib/types";

const styles: Record<Tier, string> = {
  HIGH: "bg-accent/15 text-accent border-accent/30",
  MODERATE: "bg-white/5 text-text-muted border-white/10",
  LOW: "bg-white/5 text-text-muted/60 border-white/8",
};

export function TierPill({ tier }: { tier: Tier }) {
  const label = tier === "MODERATE" ? "MOD" : tier;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider border uppercase ${styles[tier]}`}
    >
      {label}
    </span>
  );
}
