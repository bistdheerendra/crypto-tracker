/**
 * SoSoValue ETF data provider (free Demo plan).
 * Isolated behind an interface so it can be swapped if pricing changes.
 *
 * All SoSoValue endpoints return a wrapper: { code, message, data }.
 * This client unwraps `data` and throws on non-zero `code`.
 */

const BASE_URL = "https://openapi.sosovalue.com/openapi/v1";

export interface SoSoValueEtfSnapshot {
  ticker: string;
  name: string;
  netFlow: number;
  date: string;
}

export interface SoSoValueClient {
  fetchEtfList(symbol: "BTC" | "ETH"): Promise<Array<{ ticker: string; name: string }>>;
  fetchEtfSnapshot(ticker: string, fallbackName: string): Promise<SoSoValueEtfSnapshot | null>;
}

interface EtfListItem {
  ticker?: string;
  name?: string;
}

interface EtfSnapshotResponse {
  date?: number | string;
  ticker?: string;
  net_inflow?: number;
}

interface SoSoValueEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

async function sosovalueFetch<T>(apiKey: string, path: string, timeoutMs = 6000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "x-soso-api-key": apiKey,
      },
    });

    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(`SoSoValue HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
    }

    let envelope: SoSoValueEnvelope<T>;
    try {
      envelope = JSON.parse(bodyText) as SoSoValueEnvelope<T>;
    } catch {
      throw new Error(`SoSoValue non-JSON body: ${bodyText.slice(0, 200)}`);
    }

    if (envelope.code != null && envelope.code !== 0) {
      throw new Error(
        `SoSoValue API error code=${envelope.code} message=${envelope.message ?? "unknown"} body=${bodyText.slice(0, 300)}`
      );
    }

    if (envelope.data === undefined) {
      throw new Error(`SoSoValue missing data field: ${bodyText.slice(0, 300)}`);
    }

    return envelope.data;
  } finally {
    clearTimeout(timer);
  }
}

function formatEtfDate(raw: number | string | undefined): string {
  if (raw == null) return "Today";
  if (typeof raw === "number") {
    return new Date(raw).toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return "Today";
}

export function createSoSoValueClient(apiKey: string): SoSoValueClient {
  return {
    async fetchEtfList(symbol) {
      const data = await sosovalueFetch<EtfListItem[]>(
        apiKey,
        `/etfs?symbol=${symbol}&country_code=US`
      );
      return (data ?? [])
        .filter((e) => e.ticker && e.name)
        .map((e) => ({ ticker: e.ticker!, name: e.name! }));
    },

    async fetchEtfSnapshot(ticker, fallbackName) {
      try {
        const snap = await sosovalueFetch<EtfSnapshotResponse>(
          apiKey,
          `/etfs/${encodeURIComponent(ticker)}/market-snapshot`
        );
        if (snap == null || snap.net_inflow == null) return null;
        return {
          ticker,
          name: fallbackName,
          netFlow: parseFloat((snap.net_inflow / 1_000_000).toFixed(1)),
          date: formatEtfDate(snap.date),
        };
      } catch (snapshotErr) {
        console.error(`[sosovalue] snapshot failed for ${ticker}:`, snapshotErr);
        // Fall back to history endpoint if snapshot unavailable
        try {
          const history = await sosovalueFetch<EtfSnapshotResponse[]>(
            apiKey,
            `/etfs/${encodeURIComponent(ticker)}/history?limit=1`
          );
          const latest = history?.[0];
          if (!latest || latest.net_inflow == null) return null;
          return {
            ticker,
            name: fallbackName,
            netFlow: parseFloat((latest.net_inflow / 1_000_000).toFixed(1)),
            date: formatEtfDate(latest.date),
          };
        } catch (historyErr) {
          console.error(`[sosovalue] history failed for ${ticker}:`, historyErr);
          return null;
        }
      }
    },
  };
}
