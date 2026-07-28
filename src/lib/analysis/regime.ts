import { computeATR } from "@/lib/binance";
import { computeSwingLevels } from "@/lib/analysis/structure";

/** Minimal OHLCV bar — pure input to detectMarketRegime (no I/O). */
export type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

export type MarketRegime = "TRENDING" | "CHOPPY";

export type RegimeDirection = "UP" | "DOWN" | "FLAT";

export type MarketRegimeResult = {
  regime: MarketRegime;
  /** Current short ATR / longer baseline ATR. ~1.0 = normal; >1 elevated; <1 compressed. */
  volatilityRatio: number;
  /** Fraction of lookback closes that stayed inside the tight band around mean price. */
  rangeBoundPct: number;
  /** Net close direction over the lookback window (for UI arrows). */
  direction: RegimeDirection;
};

// ── Tunable thresholds (documented for easy iteration) ──────────────────────

/** Window used for range-bound %, directional move, and swing-reversal counts. */
export const REGIME_LOOKBACK = 24;

/** Short ATR window — same default as analysis / computeATR elsewhere. */
export const ATR_SHORT_PERIOD = 14;

/**
 * Longer ATR baseline. Need ≥ this many bars of history.
 * Callers that already fetch 100–200 klines (analyze, /api/klines) cover this.
 */
export const ATR_BASELINE_PERIOD = 50;

/**
 * Band half-width as a fraction of the lookback mean close.
 * 1.5% is tight enough that sustained trends escape it, but chop usually stays inside.
 */
export const RANGE_BAND_PCT = 0.015;

/**
 * CHOPPY when this share of closes sit inside the band AND volatility is not
 * strongly expanding (see VOL_ELEVATED_THRESHOLD). 60% matches “mostly stuck”.
 */
export const RANGE_BOUND_CHOPPY_THRESHOLD = 0.6;

/**
 * Volatility ratio above this = “strongly elevated / expanding”.
 * In that case we do NOT label CHOPPY from range-bound alone — breakouts often
 * look range-bound mid-impulse while ATR is already expanding.
 */
export const VOL_ELEVATED_THRESHOLD = 1.25;

/**
 * Net |end−start| / (swingHigh−swingLow) over the lookback.
 * Above this → price used most of the window’s range in one direction → TRENDING.
 */
export const DIRECTIONAL_COVERAGE_TREND = 0.55;

/**
 * Closes that reverse near swing high/low count as “chop reversals”.
 * At or above this count → prefer CHOPPY unless directional coverage is strong.
 */
export const MAX_SWING_REVERSALS_FOR_TREND = 3;

/** How close a close must be to swing high/low (fraction of swing range) to count. */
export const SWING_TOUCH_PCT = 0.08;

/** Soft TRENDING fallback: clear direction covering this fraction of swing range. */
export const DIRECTIONAL_COVERAGE_SOFT = 0.35;

/** Net move below this fraction of mean price → direction FLAT. */
export const FLAT_MOVE_PCT = 0.002;

/**
 * Classify market regime from candles only.
 * Informational — does not feed synthesizeVerdict, tiers, or SL/TP.
 */
export function detectMarketRegime(candles: Candle[]): MarketRegimeResult {
  if (candles.length < Math.max(ATR_SHORT_PERIOD + 1, REGIME_LOOKBACK)) {
    return {
      regime: "CHOPPY",
      volatilityRatio: 1,
      rangeBoundPct: 1,
      direction: "FLAT",
    };
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const closes = candles.map((c) => c.close);

  const shortAtr = computeATR(highs, lows, closes, ATR_SHORT_PERIOD);
  const baselineLen = Math.min(ATR_BASELINE_PERIOD, closes.length - 1);
  const baselineAtr =
    baselineLen >= ATR_SHORT_PERIOD
      ? computeATR(highs, lows, closes, baselineLen)
      : shortAtr;

  const volatilityRatio = baselineAtr > 0 ? shortAtr / baselineAtr : 1;

  const window = candles.slice(-REGIME_LOOKBACK);
  const windowCloses = window.map((c) => c.close);
  const windowHighs = window.map((c) => c.high);
  const windowLows = window.map((c) => c.low);

  const meanClose =
    windowCloses.reduce((a, b) => a + b, 0) / windowCloses.length;
  const band = meanClose * RANGE_BAND_PCT;
  const insideCount = windowCloses.filter(
    (c) => Math.abs(c - meanClose) <= band
  ).length;
  const rangeBoundPct = insideCount / windowCloses.length;

  const swings = computeSwingLevels(windowHighs, windowLows, REGIME_LOOKBACK);
  const swingRange = Math.max(
    swings.swingHigh - swings.swingLow,
    meanClose * 0.001
  );
  const touchDist = swingRange * SWING_TOUCH_PCT;
  const swingReversals = countSwingReversals(
    windowCloses,
    swings.swingHigh,
    swings.swingLow,
    touchDist
  );

  const start = windowCloses[0]!;
  const end = windowCloses[windowCloses.length - 1]!;
  const netMove = end - start;
  const absMove = Math.abs(netMove);
  const directionalCoverage = absMove / swingRange;

  let direction: RegimeDirection = "FLAT";
  if (absMove / meanClose >= FLAT_MOVE_PCT) {
    direction = netMove > 0 ? "UP" : "DOWN";
  }

  const volElevated = volatilityRatio >= VOL_ELEVATED_THRESHOLD;
  const mostlyRangeBound = rangeBoundPct >= RANGE_BOUND_CHOPPY_THRESHOLD;
  const cleanTrend =
    directionalCoverage >= DIRECTIONAL_COVERAGE_TREND &&
    swingReversals < MAX_SWING_REVERSALS_FOR_TREND;

  // Classification (priority):
  // 1. Clean directional coverage + few swing reversals → TRENDING
  // 2. Mostly range-bound AND volatility not expanding → CHOPPY
  // 3. Many swing-level reversals without clean coverage → CHOPPY
  // 4. Else TRENDING if direction is clear, otherwise CHOPPY
  let regime: MarketRegime;
  if (cleanTrend) {
    regime = "TRENDING";
  } else if (mostlyRangeBound && !volElevated) {
    regime = "CHOPPY";
  } else if (
    swingReversals >= MAX_SWING_REVERSALS_FOR_TREND &&
    directionalCoverage < DIRECTIONAL_COVERAGE_TREND
  ) {
    regime = "CHOPPY";
  } else if (
    direction !== "FLAT" &&
    directionalCoverage >= DIRECTIONAL_COVERAGE_SOFT
  ) {
    regime = "TRENDING";
  } else {
    regime = "CHOPPY";
  }

  return {
    regime,
    volatilityRatio: round4(volatilityRatio),
    rangeBoundPct: round4(rangeBoundPct),
    direction,
  };
}

/** Count high↔low swing-extreme touches that alternate (classic range chop). */
function countSwingReversals(
  closes: number[],
  swingHigh: number,
  swingLow: number,
  touchDist: number
): number {
  let count = 0;
  let lastTouch: "high" | "low" | null = null;

  for (const c of closes) {
    const atHigh = Math.abs(c - swingHigh) <= touchDist;
    const atLow = Math.abs(c - swingLow) <= touchDist;

    if (atHigh && lastTouch === "low") {
      count += 1;
      lastTouch = "high";
    } else if (atLow && lastTouch === "high") {
      count += 1;
      lastTouch = "low";
    } else if (atHigh) {
      lastTouch = "high";
    } else if (atLow) {
      lastTouch = "low";
    }
  }

  return count;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
