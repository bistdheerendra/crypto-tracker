interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: "bull" | "bear" | "accent" | "none";
}

export function GlassCard({ children, className = "", glow = "none" }: GlassCardProps) {
  const glowClass =
    glow === "bull" ? "glow-bull" : glow === "bear" ? "glow-bear" : glow === "accent" ? "glow-accent" : "";
  return (
    <div className={`glass-card p-5 ${glowClass} ${className}`}>{children}</div>
  );
}
