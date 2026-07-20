import type { Liquidation } from "@/lib/types";
import { fetchJsonWithTimeout } from "@/lib/fetch-utils";
import { formatTimeAgo, formatUsdCompact } from "./utils";

interface OkxLiquidation {
  instId?: string;
  side?: string;
  sz?: string;
  bkPx?: string;
  ts?: string;
}

const PAIRS = ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP"] as const;

function mapInstId(instId: string): string {
  return instId.replace("-SWAP", "").replace("-", "/");
}

function mapSide(side: string): "long" | "short" {
  // OKX sell-side liquidation order closes a long position.
  return side === "sell" ? "long" : "short";
}

async function fetchOkxLiquidations(instId: string): Promise<Liquidation[]> {
  const data = await fetchJsonWithTimeout<{
    data?: OkxLiquidation[];
  }>(
    `https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instId=${instId}&state=filled&limit=20`,
    6000
  );

  return (data.data ?? []).map((row, i) => {
    const size = parseFloat(row.sz ?? "0");
    const price = parseFloat(row.bkPx ?? "0");
    const usd = size * price;
    const ts = row.ts ? new Date(parseInt(row.ts, 10)) : new Date();
    return {
      id: `okx-${instId}-${row.ts ?? i}`,
      exchange: "OKX",
      pair: mapInstId(instId),
      side: mapSide(row.side ?? "sell"),
      amount: formatUsdCompact(usd),
      timeAgo: formatTimeAgo(ts),
    };
  });
}

export async function fetchLiquidations(): Promise<Liquidation[]> {
  const batches = await Promise.allSettled(PAIRS.map((p) => fetchOkxLiquidations(p)));
  const merged = batches
    .flatMap((b) => (b.status === "fulfilled" ? b.value : []))
    .sort((a, b) => {
      const parse = (s: string) => {
        const m = s.match(/(\d+)/);
        const n = m ? parseInt(m[1], 10) : 0;
        if (s.includes("just now")) return 0;
        if (s.includes("m")) return n;
        if (s.includes("h")) return n * 60;
        return n * 1440;
      };
      return parse(a.timeAgo) - parse(b.timeAgo);
    });

  return merged.slice(0, 15);
}
