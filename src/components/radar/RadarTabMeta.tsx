"use client";

import { RefreshCw } from "lucide-react";
import { formatTimeAgoFromTimestamp } from "@/lib/radar/format";
import type { RadarFeedMeta } from "./useRadarFeed";

interface RadarTabMetaProps {
  meta: RadarFeedMeta;
  onRefresh: () => void;
  loading?: boolean;
}

export function RadarTabMeta({ meta, onRefresh, loading }: RadarTabMetaProps) {
  const updatedLabel = meta.fetchedAt
    ? `Updated ${formatTimeAgoFromTimestamp(meta.fetchedAt)}`
    : null;

  return (
    <div className="flex items-center gap-2 text-xs text-text-muted">
      {updatedLabel && <span>{updatedLabel}</span>}
      {meta.cached && updatedLabel && (
        <span className="text-[10px] px-1 py-0.5 rounded bg-white/5 border border-white/10">
          cached
        </span>
      )}
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh data"
        className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-40"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
