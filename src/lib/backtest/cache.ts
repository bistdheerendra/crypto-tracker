type MemoryEntry = { data: unknown; expiresAt: number };

const globalForCache = globalThis as unknown as {
  __dcBacktestCache?: Map<string, MemoryEntry>;
};

function memoryStore(): Map<string, MemoryEntry> {
  if (!globalForCache.__dcBacktestCache) {
    globalForCache.__dcBacktestCache = new Map();
  }
  return globalForCache.__dcBacktestCache;
}

/** Track-record aggregates don't need to be real-time; 60s is enough. */
export const TRACK_RECORD_TTL_MS = 60 * 1000;

function useUpstash(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function getUpstashClient() {
  const { Redis } = await import("@upstash/redis");
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (useUpstash()) {
    try {
      const redis = await getUpstashClient();
      const raw = await redis.get<string | T>(key);
      if (raw == null) return null;
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return raw as T;
        }
      }
      return raw as T;
    } catch {
      // Fall through to memory store
    }
  }

  const store = memoryStore();
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export async function setCache<T>(
  key: string,
  data: T,
  ttlMs: number
): Promise<void> {
  if (useUpstash()) {
    try {
      const redis = await getUpstashClient();
      const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      await redis.set(key, JSON.stringify(data), { ex: ttlSeconds });
      // Also mirror into memory so same-process reads stay fast.
      memoryStore().set(key, { data, expiresAt: Date.now() + ttlMs });
      return;
    } catch {
      // Fall through to memory store
    }
  }

  memoryStore().set(key, { data, expiresAt: Date.now() + ttlMs });
}

export async function invalidateCache(prefix?: string): Promise<void> {
  if (useUpstash()) {
    try {
      const redis = await getUpstashClient();
      if (!prefix || prefix === "track-record" || prefix.startsWith("track-record")) {
        await redis.del("track-record:global");
      }
    } catch {
      // Fall through to memory store
    }
  }

  const store = memoryStore();
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
