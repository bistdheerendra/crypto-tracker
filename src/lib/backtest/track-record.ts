import { getCached, setCache, TRACK_RECORD_TTL_MS } from "./cache";
import { computeTrackRecord, type TrackRecordStats } from "./aggregator";
import { getAllVerdicts } from "../verdicts/store";

export const TRACK_RECORD_CACHE_KEY = "track-record:global";

/**
 * Returns track-record aggregates, using the shared cache when warm.
 * `fromCache` is true when the value was already cached before this call.
 */
export async function getTrackRecordStats(): Promise<{
  stats: TrackRecordStats;
  fromCache: boolean;
}> {
  const cached = await getCached<TrackRecordStats>(TRACK_RECORD_CACHE_KEY);
  if (cached) {
    return { stats: cached, fromCache: true };
  }

  const stats = computeTrackRecord(await getAllVerdicts());
  await setCache(TRACK_RECORD_CACHE_KEY, stats, TRACK_RECORD_TTL_MS);
  return { stats, fromCache: false };
}
