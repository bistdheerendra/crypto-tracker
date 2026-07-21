export function EtfSourceBadge({ source }: { source?: string }) {
  if (source === "sosovalue") {
    return (
      <span className="ml-2 text-[10px] font-normal normal-case tracking-normal px-1.5 py-0.5 rounded bg-bull/10 text-bull border border-bull/20">
        Real flows
      </span>
    );
  }
  if (source === "yahoo-proxy") {
    return (
      <span className="ml-2 text-[10px] font-normal normal-case tracking-normal px-1.5 py-0.5 rounded bg-white/5 text-text-muted border border-white/10">
        Estimate
      </span>
    );
  }
  return null;
}
