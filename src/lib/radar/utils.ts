const memoryStore = new Map<string, { data: unknown; fetchedAt: number; expiresAt: number }>();

export interface RadarCacheEntry<T> {
  data: T;
  fetchedAt: number;
}

function useUpstash(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function getUpstashClient() {
  const { Redis } = await import("@upstash/redis");
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export async function getRadarCache<T>(key: string): Promise<RadarCacheEntry<T> | null> {
  if (useUpstash()) {
    try {
      const redis = await getUpstashClient();
      const raw = await redis.get<string>(key);
      if (!raw) return null;
      const entry = typeof raw === "string" ? (JSON.parse(raw) as RadarCacheEntry<T>) : (raw as RadarCacheEntry<T>);
      return entry ?? null;
    } catch {
      // Fall through to memory store
    }
  }

  const entry = memoryStore.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return { data: entry.data as T, fetchedAt: entry.fetchedAt };
}

export async function setRadarCache(key: string, data: unknown, ttlMs: number): Promise<void> {
  const fetchedAt = Date.now();
  const entry: RadarCacheEntry<unknown> = { data, fetchedAt };

  if (useUpstash()) {
    try {
      const redis = await getUpstashClient();
      const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      await redis.set(key, JSON.stringify(entry), { ex: ttlSeconds });
      return;
    } catch {
      // Fall through to memory store
    }
  }

  memoryStore.set(key, { data, fetchedAt, expiresAt: fetchedAt + ttlMs });
}

export { formatTimeAgo, formatTimeAgoFromTimestamp, truncateAddress, formatUsdCompact } from "./format";
