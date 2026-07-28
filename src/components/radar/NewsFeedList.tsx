"use client";

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { BiasPill } from "@/components/ui/BiasPill";
import { aggregateHeadlineScores } from "@/lib/nlp/headline-sentiment";
import type { Bias, NewsItem, Sentiment } from "@/lib/types";

function sentimentToBias(sentiment: Sentiment): Bias {
  if (sentiment === "bullish") return "BULL";
  if (sentiment === "bearish") return "BEAR";
  return "MIXED";
}

function biasLabel(bias: Bias): string {
  if (bias === "BULL") return "Bullish";
  if (bias === "BEAR") return "Bearish";
  return "Mixed";
}

function buildSummaryText(
  items: NewsItem[],
  overall: Bias,
  counts: { bullish: number; bearish: number; neutral: number }
): string {
  const total = items.length;
  const topBull = items.filter((i) => i.sentiment === "bullish").slice(0, 2);
  const topBear = items.filter((i) => i.sentiment === "bearish").slice(0, 2);
  const tags = [...new Set(items.map((i) => i.marketTag).filter(Boolean))].slice(0, 4);

  const themeLine =
    tags.length > 0
      ? ` Themes in focus: ${tags.join(", ")}.`
      : "";

  if (overall === "BULL") {
    const lead = topBull[0]?.headline;
    return (
      `Across ${total} headlines, bullish stories lead (${counts.bullish} bull / ${counts.bearish} bear / ${counts.neutral} neutral).` +
      (lead ? ` Notable: “${lead}”.` : "") +
      themeLine
    );
  }

  if (overall === "BEAR") {
    const lead = topBear[0]?.headline;
    return (
      `Across ${total} headlines, bearish stories lead (${counts.bullish} bull / ${counts.bearish} bear / ${counts.neutral} neutral).` +
      (lead ? ` Notable: “${lead}”.` : "") +
      themeLine
    );
  }

  const mixLead = topBull[0]?.headline ?? topBear[0]?.headline;
  return (
    `Across ${total} headlines, sentiment is mixed (${counts.bullish} bull / ${counts.bearish} bear / ${counts.neutral} neutral).` +
    (mixLead ? ` Example: “${mixLead}”.` : "") +
    themeLine
  );
}

export function NewsFeedList({
  items,
  loading,
  error,
}: {
  items: NewsItem[];
  loading?: boolean;
  error?: string | null;
}) {
  const [showSummary, setShowSummary] = useState(false);

  const pulse = useMemo(() => {
    if (!items.length) return null;
    const aggregated = aggregateHeadlineScores(items.map((i) => i.headline));
    const overall = sentimentToBias(aggregated.sentiment);
    const counts = {
      bullish: items.filter((i) => i.sentiment === "bullish").length,
      bearish: items.filter((i) => i.sentiment === "bearish").length,
      neutral: items.filter((i) => i.sentiment === "neutral").length,
    };
    return {
      overall,
      score: aggregated.score,
      counts,
      text: buildSummaryText(items, overall, counts),
    };
  }, [items]);

  return (
    <>
      {error && (
        <GlassCard className="mb-3 !p-3">
          <p className="text-sm text-bear">{error}</p>
        </GlassCard>
      )}

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setShowSummary((v) => !v)}
          disabled={loading || !items.length}
          className="min-h-11 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-accent/30 bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {showSummary ? "Hide market pulse" : "Market pulse"}
        </button>
        {showSummary && pulse && (
          <BiasPill bias={pulse.overall} />
        )}
      </div>

      {showSummary && pulse && (
        <GlassCard className="mb-3 !p-4">
          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted mb-1">
                Overall market from news
              </p>
              <p
                className={`text-lg font-semibold font-mono-data ${
                  pulse.overall === "BULL"
                    ? "text-bull"
                    : pulse.overall === "BEAR"
                      ? "text-bear"
                      : "text-mixed"
                }`}
              >
                {biasLabel(pulse.overall)}
              </p>
            </div>
            <div className="flex gap-3 text-xs font-mono-data text-text-muted">
              <span className="text-bull">{pulse.counts.bullish} bull</span>
              <span className="text-bear">{pulse.counts.bearish} bear</span>
              <span>{pulse.counts.neutral} neutral</span>
            </div>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">{pulse.text}</p>
        </GlassCard>
      )}

      <div className="max-h-[min(60dvh,26rem)] sm:max-h-[min(64dvh,30rem)] overflow-y-auto space-y-2 pr-1">
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
              <BiasPill bias={sentimentToBias(item.sentiment)} />
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
