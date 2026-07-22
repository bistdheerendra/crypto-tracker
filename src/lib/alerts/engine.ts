import { fetchWhaleTransactions } from "@/lib/radar/whales";
import { fetchLiquidations } from "@/lib/radar/liquidations";
import { fetchEtfFlows } from "@/lib/radar/etf-flows";
import type { ETFFlow, Liquidation, WhaleTransaction } from "@/lib/types";
import { getAlertPrefs } from "./prefs";
import { notifyRadarAlert } from "./notify";
import type { AlertSendResult } from "./types";

/** USD thresholds for radar spike alerts (solo-trader defaults). */
export const RADAR_ALERT_THRESHOLDS = {
  whaleUsd: 5_000_000,
  liquidationUsd: 1_000_000,
  etfNetFlowUsd: 50_000_000,
} as const;

export type RadarAlertSummary = {
  checked: { whales: boolean; liquidations: boolean; etf: boolean };
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{ type: string; result: AlertSendResult; preview: string }>;
  at: string;
};

/** Parse compact USD strings like "$5.2M", "$800K", "$1.1B". */
export function parseUsdCompact(value: string): number {
  const cleaned = value.replace(/[$,\s]/g, "").toUpperCase();
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)([KMB])?$/);
  if (!match) return NaN;
  const n = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === "B") return n * 1_000_000_000;
  if (suffix === "M") return n * 1_000_000;
  if (suffix === "K") return n * 1_000;
  return n;
}

function whaleAlertText(w: WhaleTransaction, usd: number): string {
  return [
    "DeepCurrent Whale spike",
    `${w.chain} · ${w.direction}`,
    `${w.amount} (~$${Math.round(usd).toLocaleString()})`,
    `Addr ${w.address}`,
    w.timeAgo,
    "",
    "Not financial advice.",
  ].join("\n");
}

function liqAlertText(l: Liquidation, usd: number): string {
  return [
    "DeepCurrent Liquidation spike",
    `${l.exchange} · ${l.pair} · ${l.side.toUpperCase()}`,
    `~$${Math.round(usd).toLocaleString()}`,
    l.timeAgo,
    "",
    "Not financial advice.",
  ].join("\n");
}

function etfAlertText(f: ETFFlow): string {
  const sign = f.netFlow >= 0 ? "+" : "";
  return [
    "DeepCurrent ETF flow spike",
    `${f.ticker} · ${f.name}`,
    `Net ${sign}$${Math.round(f.netFlow).toLocaleString()}`,
    `As of ${f.date}`,
    "",
    "Not financial advice.",
  ].join("\n");
}

export async function runRadarAlertCheck(): Promise<RadarAlertSummary> {
  const prefs = await getAlertPrefs();
  const details: RadarAlertSummary["details"] = [];
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const checked = {
    whales: prefs.radarWhales,
    liquidations: prefs.radarLiquidations,
    etf: prefs.radarEtf,
  };

  if (!prefs.enabled) {
    return {
      checked,
      sent: 0,
      skipped: 1,
      errors: 0,
      details: [{ type: "prefs", result: { ok: false, skipped: "alerts disabled" }, preview: "" }],
      at: new Date().toISOString(),
    };
  }

  if (prefs.radarWhales) {
    try {
      const whales = await fetchWhaleTransactions();
      for (const w of whales) {
        const usd = parseUsdCompact(w.usdValue);
        if (!Number.isFinite(usd) || usd < RADAR_ALERT_THRESHOLDS.whaleUsd) continue;
        const result = await notifyRadarAlert(
          `whale:${w.id}`,
          whaleAlertText(w, usd)
        );
        details.push({ type: "whale", result, preview: w.usdValue });
        if (result.ok) sent++;
        else if (result.error) errors++;
        else skipped++;
      }
    } catch (err) {
      errors++;
      details.push({
        type: "whale",
        result: {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
        preview: "",
      });
    }
  }

  if (prefs.radarLiquidations) {
    try {
      const liqs = await fetchLiquidations();
      for (const l of liqs) {
        const usd = parseUsdCompact(l.amount);
        if (!Number.isFinite(usd) || usd < RADAR_ALERT_THRESHOLDS.liquidationUsd) {
          continue;
        }
        const result = await notifyRadarAlert(
          `liq:${l.id}`,
          liqAlertText(l, usd)
        );
        details.push({ type: "liquidation", result, preview: l.amount });
        if (result.ok) sent++;
        else if (result.error) errors++;
        else skipped++;
      }
    } catch (err) {
      errors++;
      details.push({
        type: "liquidation",
        result: {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
        preview: "",
      });
    }
  }

  if (prefs.radarEtf) {
    try {
      const { flows } = await fetchEtfFlows();
      for (const f of flows) {
        if (Math.abs(f.netFlow) < RADAR_ALERT_THRESHOLDS.etfNetFlowUsd) continue;
        const result = await notifyRadarAlert(
          `etf:${f.ticker}:${f.date}:${Math.round(f.netFlow)}`,
          etfAlertText(f)
        );
        details.push({
          type: "etf",
          result,
          preview: String(f.netFlow),
        });
        if (result.ok) sent++;
        else if (result.error) errors++;
        else skipped++;
      }
    } catch (err) {
      errors++;
      details.push({
        type: "etf",
        result: {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
        preview: "",
      });
    }
  }

  return {
    checked,
    sent,
    skipped,
    errors,
    details: details.slice(0, 40),
    at: new Date().toISOString(),
  };
}
