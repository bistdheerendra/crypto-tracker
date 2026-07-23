import { GlassCard } from "@/components/ui/GlassCard";
import { BiasPill } from "@/components/ui/BiasPill";
import type { NewsItem } from "@/lib/types";

export function NewsFeedList({
  items,
  loading,
  error,
}: {
  items: NewsItem[];
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <>
      {error && (
        <GlassCard className="mb-3 !p-3">
          <p className="text-sm text-bear">{error}</p>
        </GlassCard>
      )}
      <div className="max-h-[418px] overflow-y-auto space-y-2 pr-1">
        {loading && (
          <GlassCard className="!p-3">
            <p className="text-sm text-text-muted skeleton h-16" />
          </GlassCard>
        )}
        {!loading && items.length === 0 && !error && (
          <GlassCard className="!p-3">
            <p className="text-sm text-text-muted">No news available right now.</p>
          </GlassCard>
        )}
        {items.map((item) => (
          <GlassCard key={item.id} className="!p-3 !rounded-none">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs text-text-muted font-mono-data">
                {item.location} · {item.timeAgo}
              </span>
              <BiasPill
                bias={
                  item.sentiment === "bullish"
                    ? "BULL"
                    : item.sentiment === "bearish"
                      ? "BEAR"
                      : "MIXED"
                }
              />
              <span className="text-[10px] uppercase tracking-wider text-accent ml-auto">
                {item.source}
              </span>
            </div>
            <p className="text-sm">{item.headline}</p>
          </GlassCard>
        ))}
      </div>
    </>
  );
}
