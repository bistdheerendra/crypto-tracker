/**
 * Diagnostic: HIGH-tier win-rate degradation over time.
 * Steps 1–4 of the regime-shift vs gate-bug investigation.
 * Run: npx tsx scripts/debug-high-degradation.ts
 */
import "dotenv/config";
import { getPrisma } from "../src/lib/db";

type Bias = "BULL" | "BEAR" | "MIXED";
type Outcome = string | null;

interface Row {
  id: string;
  pair: string;
  timeframe: string;
  direction: string;
  confidenceTier: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit1: number;
  laneBiasTechnical: string;
  laneBiasFlow: string;
  laneBiasNarrative: string;
  laneBiasMacro: string;
  createdAt: Date;
  outcome: Outcome;
  outcomeAt: Date | null;
  rMultiple: number | null;
  features: { laneAgreementCount: number; volatilityRegime: number | null } | null;
}

function isWin(outcome: Outcome): boolean {
  return outcome === "tp1_hit" || outcome === "tp2_hit";
}

function isResolved(v: Row): boolean {
  return !!v.outcome && v.outcome !== "open" && v.rMultiple !== null;
}

function weekKey(d: Date): string {
  // ISO week: Monday start
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function laneAccuracy(
  rows: Row[],
  lane: "Technical" | "Flow" | "Narrative" | "Macro",
): { correct: number; total: number; pct: number } {
  const key =
    lane === "Technical"
      ? "laneBiasTechnical"
      : lane === "Flow"
        ? "laneBiasFlow"
        : lane === "Narrative"
          ? "laneBiasNarrative"
          : "laneBiasMacro";
  let correct = 0;
  let total = 0;
  for (const v of rows) {
    if (v.direction === "NEUTRAL") continue;
    const bias = v[key] as Bias;
    if (bias === "MIXED") continue;
    // Winning direction from outcome (same as aggregator)
    let winDir: "LONG" | "SHORT" | null = null;
    if (isWin(v.outcome)) {
      winDir = v.direction === "LONG" || v.direction === "SHORT" ? (v.direction as "LONG" | "SHORT") : null;
    } else if (v.outcome === "sl_hit") {
      winDir = v.direction === "LONG" ? "SHORT" : v.direction === "SHORT" ? "LONG" : null;
    } else if (v.rMultiple !== null && v.rMultiple > 0) {
      winDir = v.direction === "LONG" || v.direction === "SHORT" ? (v.direction as "LONG" | "SHORT") : null;
    } else if (v.rMultiple !== null && v.rMultiple < 0) {
      winDir = v.direction === "LONG" ? "SHORT" : v.direction === "SHORT" ? "LONG" : null;
    }
    if (!winDir) continue;
    total++;
    const match =
      (bias === "BULL" && winDir === "LONG") || (bias === "BEAR" && winDir === "SHORT");
    if (match) correct++;
  }
  return { correct, total, pct: total > 0 ? (correct / total) * 100 : 0 };
}

function tierStats(rows: Row[], tier: string) {
  const t = rows.filter((v) => v.confidenceTier === tier);
  const wins = t.filter((v) => isWin(v.outcome)).length;
  return {
    wins,
    total: t.length,
    pct: t.length > 0 ? (wins / t.length) * 100 : 0,
  };
}

function overallStats(rows: Row[]) {
  const wins = rows.filter((v) => isWin(v.outcome)).length;
  return {
    wins,
    total: rows.length,
    pct: rows.length > 0 ? (wins / rows.length) * 100 : 0,
  };
}

function fmt(pct: number, n = 1): string {
  return pct.toFixed(n);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function checkGate(v: Row): {
  agreement: number;
  target: string;
  narrOk: boolean;
  agreeOk: boolean;
  pass: boolean;
  storedAgree: number | null;
} {
  const target = v.direction === "LONG" ? "BULL" : "BEAR";
  const biases = [
    v.laneBiasTechnical,
    v.laneBiasFlow,
    v.laneBiasNarrative,
    v.laneBiasMacro,
  ];
  const agreement = biases.filter((b) => b === target).length;
  const narrOk =
    v.direction === "LONG"
      ? v.laneBiasNarrative !== "BEAR"
      : v.direction === "SHORT"
        ? v.laneBiasNarrative !== "BULL"
        : false;
  const agreeOk = agreement >= 3;
  return {
    agreement,
    target,
    narrOk,
    agreeOk,
    pass: agreeOk && narrOk && (v.direction === "LONG" || v.direction === "SHORT"),
    storedAgree: v.features?.laneAgreementCount ?? null,
  };
}

function countMap(items: string[]): Record<string, number> {
  const m = new Map<string, number>();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
}

async function fetchBinanceDaily(
  symbol: string,
  startMs: number,
  endMs: number,
): Promise<{ t: number; o: number; h: number; l: number; c: number }[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startMs}&endTime=${endMs}&limit=1000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${symbol}: ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({
    t: k[0] as number,
    o: parseFloat(k[1] as string),
    h: parseFloat(k[2] as string),
    l: parseFloat(k[3] as string),
    c: parseFloat(k[4] as string),
  }));
}

function regimeMetrics(
  candles: { t: number; o: number; h: number; l: number; c: number }[],
): {
  totalReturnPct: number;
  avgAbsDailyPct: number;
  trendiness: number; // |net move| / sum(|daily|) — ~1 trending, ~0 choppy
  maxDrawdownPct: number;
  upDays: number;
  downDays: number;
} {
  if (candles.length < 2) {
    return { totalReturnPct: 0, avgAbsDailyPct: 0, trendiness: 0, maxDrawdownPct: 0, upDays: 0, downDays: 0 };
  }
  const rets: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    rets.push((candles[i].c - candles[i - 1].c) / candles[i - 1].c);
  }
  const sumAbs = rets.reduce((s, r) => s + Math.abs(r), 0);
  const net = (candles[candles.length - 1].c - candles[0].c) / candles[0].c;
  let peak = candles[0].c;
  let maxDd = 0;
  for (const c of candles) {
    if (c.c > peak) peak = c.c;
    const dd = (peak - c.c) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  return {
    totalReturnPct: net * 100,
    avgAbsDailyPct: (sumAbs / rets.length) * 100,
    trendiness: sumAbs > 0 ? Math.abs(net) / sumAbs : 0,
    maxDrawdownPct: maxDd * 100,
    upDays: rets.filter((r) => r > 0).length,
    downDays: rets.filter((r) => r < 0).length,
  };
}

async function main(): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  const rows: Row[] = await prisma.verdict.findMany({
    where: {
      outcome: { not: null },
      NOT: { outcome: "open" },
      rMultiple: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      pair: true,
      timeframe: true,
      direction: true,
      confidenceTier: true,
      entryPrice: true,
      stopLoss: true,
      takeProfit1: true,
      laneBiasTechnical: true,
      laneBiasFlow: true,
      laneBiasNarrative: true,
      laneBiasMacro: true,
      createdAt: true,
      outcome: true,
      outcomeAt: true,
      rMultiple: true,
      features: { select: { laneAgreementCount: true, volatilityRegime: true } },
    },
  });

  const resolved = rows.filter(isResolved);
  console.log(`\n=== DATASET ===`);
  console.log(`Resolved verdicts: ${resolved.length}`);
  if (resolved.length === 0) {
    console.error("No resolved verdicts");
    process.exit(1);
  }
  console.log(
    `Date range: ${resolved[0].createdAt.toISOString()} → ${resolved[resolved.length - 1].createdAt.toISOString()}`,
  );

  const overall = overallStats(resolved);
  const high = tierStats(resolved, "HIGH");
  const mod = tierStats(resolved, "MODERATE");
  const low = tierStats(resolved, "LOW");
  console.log(
    `Overall: ${overall.wins}/${overall.total} (${fmt(overall.pct)}%) | HIGH ${high.wins}/${high.total} (${fmt(high.pct)}%) | MOD ${mod.wins}/${mod.total} (${fmt(mod.pct)}%) | LOW ${low.wins}/${low.total} (${fmt(low.pct)}%)`,
  );

  // ── STEP 1: time buckets ──────────────────────────────────────────
  const byWeek = new Map<string, Row[]>();
  const byDay = new Map<string, Row[]>();
  for (const v of resolved) {
    const wk = weekKey(v.createdAt);
    const dy = dayKey(v.createdAt);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    if (!byDay.has(dy)) byDay.set(dy, []);
    byWeek.get(wk)!.push(v);
    byDay.get(dy)!.push(v);
  }

  const weekKeys = [...byWeek.keys()].sort();
  const dayKeys = [...byDay.keys()].sort();
  const useWeeks = weekKeys.length >= 2;

  console.log(`\n=== STEP 1 — ${useWeeks ? "WEEK" : "DAY"}-BY-${useWeeks ? "WEEK" : "DAY"} BREAKDOWN ===`);
  console.log(
    `${pad("bucket", 10)} ${pad("n", 5)} ${pad("ovr%", 6)} ${pad("H_w/n", 10)} ${pad("H%", 6)} ${pad("M_w/n", 10)} ${pad("M%", 6)} ${pad("Narr%", 7)} ${pad("Macro%", 7)} ${pad("Flow%", 7)} ${pad("Tech%", 7)}`,
  );

  const buckets = useWeeks ? weekKeys : dayKeys;
  const bucketMap = useWeeks ? byWeek : byDay;
  const bucketRows: {
    key: string;
    overall: ReturnType<typeof overallStats>;
    high: ReturnType<typeof tierStats>;
    mod: ReturnType<typeof tierStats>;
    narr: ReturnType<typeof laneAccuracy>;
    macro: ReturnType<typeof laneAccuracy>;
    flow: ReturnType<typeof laneAccuracy>;
    tech: ReturnType<typeof laneAccuracy>;
  }[] = [];

  for (const key of buckets) {
    const b = bucketMap.get(key)!;
    const o = overallStats(b);
    const h = tierStats(b, "HIGH");
    const m = tierStats(b, "MODERATE");
    const narr = laneAccuracy(b, "Narrative");
    const macro = laneAccuracy(b, "Macro");
    const flow = laneAccuracy(b, "Flow");
    const tech = laneAccuracy(b, "Technical");
    bucketRows.push({ key, overall: o, high: h, mod: m, narr, macro, flow, tech });
    console.log(
      `${pad(key, 10)} ${pad(String(o.total), 5)} ${pad(fmt(o.pct), 6)} ${pad(`${h.wins}/${h.total}`, 10)} ${pad(fmt(h.pct), 6)} ${pad(`${m.wins}/${m.total}`, 10)} ${pad(fmt(m.pct), 6)} ${pad(fmt(narr.pct), 7)} ${pad(fmt(macro.pct), 7)} ${pad(fmt(flow.pct), 7)} ${pad(fmt(tech.pct), 7)}`,
    );
  }

  // Cumulative: find when HIGH wins froze at 169
  console.log(`\n--- Cumulative HIGH wins over time (find freeze point) ---`);
  let cumHWins = 0;
  let cumHTotal = 0;
  let freezeBucket: string | null = null;
  let lastWinAt: Date | null = null;
  const highChrono = resolved
    .filter((v) => v.confidenceTier === "HIGH")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const v of highChrono) {
    cumHTotal++;
    if (isWin(v.outcome)) {
      cumHWins++;
      lastWinAt = v.createdAt;
    }
  }
  // Walk buckets cumulatively
  let cW = 0;
  let cT = 0;
  for (const br of bucketRows) {
    cW += br.high.wins;
    cT += br.high.total;
    const line = `  ${br.key}: cum HIGH ${cW}/${cT} (${fmt(cT ? (cW / cT) * 100 : 0)}%)  Δthis=${br.high.wins}/${br.high.total}`;
    console.log(line);
    if (cW === 169 && br.high.wins === 0 && freezeBucket === null && cT >= 452) {
      freezeBucket = br.key;
    }
  }
  console.log(`Last HIGH win createdAt: ${lastWinAt?.toISOString() ?? "none"}`);
  console.log(`Final HIGH: ${cumHWins}/${cumHTotal}`);

  // Split early vs late at last HIGH win
  const splitAt = lastWinAt ?? highChrono[Math.floor(highChrono.length / 2)]?.createdAt;
  if (splitAt) {
    // Use outcome resolution of the 169th win as approximate checkpoint —
    // better: split HIGH at the moment cumulative wins hit 169
    let seenWins = 0;
    let checkpointCreated: Date | null = null;
    for (const v of highChrono) {
      if (isWin(v.outcome)) {
        seenWins++;
        if (seenWins === 169) {
          checkpointCreated = v.createdAt;
          break;
        }
      }
    }
    const cut = checkpointCreated ?? splitAt;
    console.log(`\n--- Split at 169th HIGH win (createdAt ${cut.toISOString()}) ---`);
    const early = resolved.filter((v) => v.createdAt <= cut);
    const late = resolved.filter((v) => v.createdAt > cut);
    const printSplit = (label: string, set: Row[]) => {
      const o = overallStats(set);
      const h = tierStats(set, "HIGH");
      const m = tierStats(set, "MODERATE");
      const narr = laneAccuracy(set, "Narrative");
      const macro = laneAccuracy(set, "Macro");
      const flow = laneAccuracy(set, "Flow");
      const tech = laneAccuracy(set, "Technical");
      console.log(
        `${label}: n=${o.total} ovr=${fmt(o.pct)}% HIGH=${h.wins}/${h.total}(${fmt(h.pct)}%) MOD=${m.wins}/${m.total}(${fmt(m.pct)}%) Narr=${fmt(narr.pct)} Macro=${fmt(macro.pct)} Flow=${fmt(flow.pct)} Tech=${fmt(tech.pct)}`,
      );
    };
    printSplit("EARLY (thru 169th HIGH win)", early);
    printSplit("LATE  (after 169th HIGH win)", late);

    // ── STEP 2 ────────────────────────────────────────────────────
    console.log(`\n=== STEP 2 — HIGH vs MODERATE DEGRADATION ===`);
    const eH = tierStats(early, "HIGH");
    const lH = tierStats(late, "HIGH");
    const eM = tierStats(early, "MODERATE");
    const lM = tierStats(late, "MODERATE");
    const eO = overallStats(early);
    const lO = overallStats(late);
    const dH = lH.pct - eH.pct;
    const dM = lM.pct - eM.pct;
    const dO = lO.pct - eO.pct;
    console.log(`Overall Δ:  ${fmt(eO.pct)}% → ${fmt(lO.pct)}%  (Δ ${fmt(dO)})`);
    console.log(`HIGH Δ:     ${fmt(eH.pct)}% → ${fmt(lH.pct)}%  (Δ ${fmt(dH)})`);
    console.log(`MODERATE Δ: ${fmt(eM.pct)}% → ${fmt(lM.pct)}%  (Δ ${fmt(dM)})`);
    console.log(
      `HIGH declined ${Math.abs(dH).toFixed(1)} pts; MOD declined ${Math.abs(dM).toFixed(1)} pts; ratio HIGH/MOD = ${dM !== 0 ? (dH / dM).toFixed(2) : "n/a"}`,
    );
    if (Math.abs(dH) > Math.abs(dM) * 1.5 + 5) {
      console.log("→ HIGH declined MUCH more sharply than MODERATE → points toward (b) gate-specific");
    } else if (Math.abs(dH - dM) < 8) {
      console.log("→ HIGH and MODERATE declined similarly → points toward (a) market regime");
    } else {
      console.log("→ Mixed: HIGH worse but not dramatically disproportionate → lean (a) with caution");
    }

    // Lane drops early→late
    for (const lane of ["Narrative", "Macro", "Flow", "Technical"] as const) {
      const e = laneAccuracy(early, lane);
      const l = laneAccuracy(late, lane);
      console.log(`  ${lane}: ${fmt(e.pct)}% → ${fmt(l.pct)}% (Δ ${fmt(l.pct - e.pct)})`);
    }

    // ── STEP 3 ────────────────────────────────────────────────────
    console.log(`\n=== STEP 3 — qualifiesAsHigh AUDIT ON NEWEST HIGH (post-checkpoint) ===`);
    const lateHigh = late.filter((v) => v.confidenceTier === "HIGH");
    const lateHighWins = lateHigh.filter((v) => isWin(v.outcome));
    const lateHighLosses = lateHigh.filter((v) => !isWin(v.outcome));
    console.log(`Late HIGH: ${lateHigh.length} total, ${lateHighWins.length} wins, ${lateHighLosses.length} non-wins`);

    let passGate = 0;
    let failAgree = 0;
    let failNarr = 0;
    let agreeDist: number[] = [];
    for (const v of lateHigh) {
      const g = checkGate(v);
      agreeDist.push(g.agreement);
      if (g.pass) passGate++;
      else {
        if (!g.agreeOk) failAgree++;
        if (!g.narrOk) failNarr++;
      }
    }
    console.log(`Would pass current gate (agree≥3 + narr not oppose): ${passGate}/${lateHigh.length}`);
    console.log(`Fail agreement: ${failAgree} | Fail narrative: ${failNarr}`);
    console.log(`Agreement distribution:`, countMap(agreeDist.map(String)));

    // Compare early HIGH gate compliance
    const earlyHigh = early.filter((v) => v.confidenceTier === "HIGH");
    let earlyPass = 0;
    for (const v of earlyHigh) {
      if (checkGate(v).pass) earlyPass++;
    }
    console.log(`Early HIGH would pass current gate: ${earlyPass}/${earlyHigh.length} (${fmt((earlyPass / Math.max(earlyHigh.length, 1)) * 100)}%)`);
    console.log(`Late  HIGH would pass current gate: ${passGate}/${lateHigh.length} (${fmt((passGate / Math.max(lateHigh.length, 1)) * 100)}%)`);

    // Among late HIGH that PASS the gate — what's their WR?
    const latePass = lateHigh.filter((v) => checkGate(v).pass);
    const latePassWins = latePass.filter((v) => isWin(v.outcome)).length;
    console.log(
      `Late HIGH that pass gate: WR ${latePassWins}/${latePass.length} (${fmt(latePass.length ? (latePassWins / latePass.length) * 100 : 0)}%)`,
    );
    const lateFail = lateHigh.filter((v) => !checkGate(v).pass);
    const lateFailWins = lateFail.filter((v) => isWin(v.outcome)).length;
    console.log(
      `Late HIGH that FAIL gate: WR ${lateFailWins}/${lateFail.length} (${fmt(lateFail.length ? (lateFailWins / lateFail.length) * 100 : 0)}%)`,
    );

    // Pair / TF clustering late HIGH
    console.log(`\nLate HIGH by pair:`, countMap(lateHigh.map((v) => v.pair)));
    console.log(`Late HIGH by TF:`, countMap(lateHigh.map((v) => v.timeframe)));
    console.log(`Early HIGH by pair:`, countMap(earlyHigh.map((v) => v.pair)));
    console.log(`Early HIGH by TF:`, countMap(earlyHigh.map((v) => v.timeframe)));

    // WR by pair in late HIGH
    console.log(`\nLate HIGH win rate by pair:`);
    const pairs = [...new Set(lateHigh.map((v) => v.pair))];
    for (const p of pairs.sort()) {
      const set = lateHigh.filter((v) => v.pair === p);
      const w = set.filter((v) => isWin(v.outcome)).length;
      console.log(`  ${p}: ${w}/${set.length} (${fmt(set.length ? (w / set.length) * 100 : 0)}%)`);
    }
    console.log(`Late HIGH win rate by TF:`);
    const tfs = [...new Set(lateHigh.map((v) => v.timeframe))];
    for (const tf of tfs.sort()) {
      const set = lateHigh.filter((v) => v.timeframe === tf);
      const w = set.filter((v) => isWin(v.outcome)).length;
      console.log(`  ${tf}: ${w}/${set.length} (${fmt(set.length ? (w / set.length) * 100 : 0)}%)`);
    }

    // Direction mix
    console.log(`Late HIGH direction:`, countMap(lateHigh.map((v) => v.direction)));
    console.log(`Early HIGH direction:`, countMap(earlyHigh.map((v) => v.direction)));
    console.log(`Late HIGH outcomes:`, countMap(lateHigh.map((v) => v.outcome!)));

    // Sample of newest non-winning HIGH
    console.log(`\n--- Sample of 20 newest non-winning HIGH ---`);
    const sample = [...lateHighLosses].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 20);
    for (const v of sample) {
      const g = checkGate(v);
      console.log(
        `  ${v.createdAt.toISOString().slice(0, 16)} ${v.pair} ${v.timeframe} ${v.direction} ${v.outcome} r=${v.rMultiple?.toFixed(2)} agree=${g.agreement} narr=${v.laneBiasNarrative} gate=${g.pass ? "PASS" : "FAIL"} lanes=${v.laneBiasTechnical}/${v.laneBiasFlow}/${v.laneBiasNarrative}/${v.laneBiasMacro}`,
      );
    }

    // Volatility regime if available
    const lateVol = lateHigh
      .map((v) => v.features?.volatilityRegime)
      .filter((x): x is number => x != null);
    const earlyVol = earlyHigh
      .map((v) => v.features?.volatilityRegime)
      .filter((x): x is number => x != null);
    if (lateVol.length && earlyVol.length) {
      const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      console.log(
        `\nAvg volatilityRegime: early HIGH ${avg(earlyVol).toFixed(3)} | late HIGH ${avg(lateVol).toFixed(3)}`,
      );
    }

    // Store cut for step 4
    (globalThis as unknown as { __cut: Date; __early: Row[]; __late: Row[] }).__cut = cut;
    (globalThis as unknown as { __early: Row[] }).__early = early;
    (globalThis as unknown as { __late: Row[] }).__late = late;
  }

  // ── STEP 4: market regime ───────────────────────────────────────
  console.log(`\n=== STEP 4 — MARKET REGIME (Binance daily) ===`);
  const startMs = resolved[0].createdAt.getTime();
  const endMs = resolved[resolved.length - 1].createdAt.getTime() + 86400000;
  const cut =
    (globalThis as unknown as { __cut?: Date }).__cut ??
    new Date((startMs + endMs) / 2);

  const symbols = [...new Set(resolved.map((v) => v.pair.replace("/", "")))];
  // Map common pairs
  const binanceSymbols = symbols.map((s) =>
    s.includes("USDT") ? s : `${s}USDT`,
  );
  // Prefer tracked majors
  const toFetch = [...new Set(["BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", ...binanceSymbols])].slice(0, 6);

  console.log(`Checkpoint (169th HIGH win): ${cut.toISOString()}`);
  console.log(`Fetching daily klines for: ${toFetch.join(", ")}`);

  for (const sym of toFetch) {
    try {
      const candles = await fetchBinanceDaily(sym, startMs - 3 * 86400000, endMs);
      const earlyC = candles.filter((c) => c.t <= cut.getTime());
      const lateC = candles.filter((c) => c.t > cut.getTime());
      const e = regimeMetrics(earlyC);
      const l = regimeMetrics(lateC);
      const all = regimeMetrics(candles);
      console.log(`\n${sym}:`);
      console.log(
        `  FULL:  ret=${fmt(all.totalReturnPct)}% avg|d|=${fmt(all.avgAbsDailyPct)}% trendiness=${all.trendiness.toFixed(3)} maxDD=${fmt(all.maxDrawdownPct)}% up/dn=${all.upDays}/${all.downDays}`,
      );
      console.log(
        `  EARLY: ret=${fmt(e.totalReturnPct)}% avg|d|=${fmt(e.avgAbsDailyPct)}% trendiness=${e.trendiness.toFixed(3)} maxDD=${fmt(e.maxDrawdownPct)}% up/dn=${e.upDays}/${e.downDays}`,
      );
      console.log(
        `  LATE:  ret=${fmt(l.totalReturnPct)}% avg|d|=${fmt(l.avgAbsDailyPct)}% trendiness=${l.trendiness.toFixed(3)} maxDD=${fmt(l.maxDrawdownPct)}% up/dn=${l.upDays}/${l.downDays}`,
      );
      // Week-by-week returns
      if (useWeeks) {
        for (const wk of weekKeys) {
          const wkRows = byWeek.get(wk)!;
          const wkStart = Math.min(...wkRows.map((v) => v.createdAt.getTime()));
          const wkEnd = Math.max(...wkRows.map((v) => v.createdAt.getTime())) + 86400000;
          const wc = candles.filter((c) => c.t >= wkStart - 86400000 && c.t <= wkEnd);
          if (wc.length < 2) continue;
          const m = regimeMetrics(wc);
          console.log(
            `    ${wk}: ret=${fmt(m.totalReturnPct)}% trendiness=${m.trendiness.toFixed(3)} avg|d|=${fmt(m.avgAbsDailyPct)}%`,
          );
        }
      }
    } catch (err) {
      console.log(`  ${sym}: fetch failed — ${(err as Error).message}`);
    }
  }

  // Outcome timing: are late HIGH resolving faster (whipsaw)?
  const holdHours = (v: Row) =>
    v.outcomeAt ? (v.outcomeAt.getTime() - v.createdAt.getTime()) / 3_600_000 : null;
  const earlyH = resolved.filter(
    (v) => v.confidenceTier === "HIGH" && v.createdAt <= cut,
  );
  const lateH = resolved.filter(
    (v) => v.confidenceTier === "HIGH" && v.createdAt > cut,
  );
  const avgHold = (set: Row[]) => {
    const hs = set.map(holdHours).filter((x): x is number => x != null);
    return hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 0;
  };
  console.log(`\nAvg hold hours HIGH: early=${avgHold(earlyH).toFixed(1)} late=${avgHold(lateH).toFixed(1)}`);

  console.log(`\n=== DONE (diagnostic only — no code changes) ===`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
