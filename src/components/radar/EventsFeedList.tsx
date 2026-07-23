import { GlassCard } from "@/components/ui/GlassCard";
import type { CalendarEvent } from "@/lib/types";

export function EventsFeedList({
  items,
  loading,
  error,
}: {
  items: CalendarEvent[];
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
      <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
        {loading && (
          <>
            {[0, 1, 2].map((i) => (
              <GlassCard key={i} className="!p-3">
                <p className="text-sm text-text-muted skeleton h-14" />
              </GlassCard>
            ))}
          </>
        )}
        {!loading && items.length === 0 && !error && (
          <GlassCard className="!p-3">
            <p className="text-sm text-text-muted">No upcoming crypto events right now.</p>
          </GlassCard>
        )}
        {items.map((event) => (
          <GlassCard key={event.id} className="!p-3 !rounded-none">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-mono-data text-xs text-accent">
                {event.dateIst} · {event.timeIst}
              </span>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-text-muted">
                {event.category}
              </span>
              <span className="text-[10px] uppercase tracking-wider text-text-muted ml-auto">
                {event.source}
              </span>
            </div>
            {event.url ? (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-accent transition-colors"
              >
                {event.title}
              </a>
            ) : (
              <p className="text-sm">{event.title}</p>
            )}
          </GlassCard>
        ))}
      </div>
    </>
  );
}
