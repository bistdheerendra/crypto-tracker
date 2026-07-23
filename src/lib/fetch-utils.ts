export class HttpFetchError extends Error {
  readonly status: number;
  readonly body: string;
  readonly url: string;

  constructor(status: number, url: string, body: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpFetchError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  timeoutMs = 5000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const body = await res.text();
    if (!res.ok) {
      throw new HttpFetchError(res.status, url, body.slice(0, 500));
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new HttpFetchError(res.status, url, body.slice(0, 500));
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Structured log fields for any thrown fetch failure. */
export function fetchErrorDetails(err: unknown): {
  status: number | null;
  body: string | undefined;
  error: string;
} {
  if (err instanceof HttpFetchError) {
    return {
      status: err.status,
      body: err.body || undefined,
      error: err.message,
    };
  }
  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: string }).name === "AbortError"
  ) {
    return { status: null, body: undefined, error: "Timeout / AbortError" };
  }
  return {
    status: null,
    body: undefined,
    error: err instanceof Error ? err.message : String(err),
  };
}
