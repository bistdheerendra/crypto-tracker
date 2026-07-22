import type { Sentiment } from "@/lib/types";

export type HeadlineSentimentResult = {
  sentiment: Sentiment;
  /** Signed score roughly in [-1, 1]. */
  score: number;
  /** 0–1 confidence from |score| magnitude. */
  confidence: number;
};

/** Phrase patterns checked first (higher weight). */
const BULL_PHRASES: Array<[RegExp, number]> = [
  [/\ball[-\s]?time high\b/i, 2.2],
  [/\brecord high\b/i, 2.0],
  [/\betf (approval|inflow|approved)\b/i, 2.0],
  [/\bspot etf\b/i, 1.4],
  [/\binstitutional (buying|demand|inflow)\b/i, 1.8],
  [/\bbreaks? (above|out)\b/i, 1.5],
  [/\bsurge[sd]?\b/i, 1.6],
  [/\bralli(?:y|es|ed)\b/i, 1.5],
  [/\bsoar(?:s|ed|ing)?\b/i, 1.6],
  [/\bpumps?\b/i, 1.2],
  [/\bbull(?:ish|run)?\b/i, 1.4],
  [/\badoption\b/i, 1.2],
  [/\binflows?\b/i, 1.3],
  [/\bgains?\b/i, 1.0],
  [/\bjumps?\b/i, 1.1],
  [/\brises?\b/i, 0.9],
  [/\brebound(?:s|ed|ing)?\b/i, 1.2],
  [/\brecovery\b/i, 1.1],
  [/\baccumulat(?:e|ion|ing)\b/i, 1.3],
];

const BEAR_PHRASES: Array<[RegExp, number]> = [
  [/\bflash crash\b/i, 2.2],
  [/\bexchange hack\b/i, 2.0],
  [/\bsec (charges|sues|lawsuit)\b/i, 1.9],
  [/\bclass[-\s]?action\b/i, 1.6],
  [/\bforced liquidat/i, 1.8],
  [/\bmass liquidat/i, 1.8],
  [/\bcrashes?\b/i, 1.8],
  [/\bplunges?\b/i, 1.7],
  [/\bsell[-\s]?off\b/i, 1.6],
  [/\boutflows?\b/i, 1.4],
  [/\bbear(?:ish|market)?\b/i, 1.4],
  [/\bhack(?:ed|ing)?\b/i, 1.7],
  [/\bfraud\b/i, 1.6],
  [/\blawsuit\b/i, 1.4],
  [/\bban(?:ned|s)?\b/i, 1.5],
  [/\bdrops?\b/i, 1.0],
  [/\bfalls?\b/i, 0.9],
  [/\bdecline[sd]?\b/i, 1.0],
  [/\bloss(?:es)?\b/i, 0.9],
  [/\bdumps?\b/i, 1.2],
  [/\bliquidation(?:s)?\b/i, 1.1],
  [/\bdefault\b/i, 1.5],
  [/\binsolvent/i, 1.8],
];

const NEGATION =
  /\b(not|no|never|without|fails? to|unable to|despite|avoids?|denies|denied)\b/i;

const INTENSIFIER = /\b(sharp(?:ly)?|steep(?:ly)?|massive|huge|major|dramatic(?:ally)?|sudden(?:ly)?|record)\b/i;

function tokenize(headline: string): string[] {
  return headline.toLowerCase().split(/[^a-z0-9+$%]+/).filter(Boolean);
}

/**
 * Lightweight lexicon + phrase NLP for crypto headlines.
 * No external API — deterministic and free.
 */
export function scoreHeadlineSentiment(
  headline: string
): HeadlineSentimentResult {
  if (!headline.trim()) {
    return { sentiment: "neutral", score: 0, confidence: 0 };
  }

  let raw = 0;

  for (const [re, w] of BULL_PHRASES) {
    if (re.test(headline)) raw += w;
  }
  for (const [re, w] of BEAR_PHRASES) {
    if (re.test(headline)) raw -= w;
  }

  // Negation flips nearby signal within ~6 tokens of a polarity word
  const tokens = tokenize(headline);
  for (let i = 0; i < tokens.length; i++) {
    if (!NEGATION.test(tokens[i]!)) continue;
    const window = tokens.slice(i, i + 6).join(" ");
    if (/\b(bull|rally|surge|gain|approval|inflow|high|rise|soar)\b/.test(window)) {
      raw -= 1.2;
    }
    if (/\b(crash|drop|ban|hack|bear|loss|plunge|selloff|outflow)\b/.test(window)) {
      raw += 1.0;
    }
  }

  if (INTENSIFIER.test(headline) && Math.abs(raw) > 0.3) {
    raw *= 1.25;
  }

  // Soft squash to [-1, 1]
  const score = Math.tanh(raw / 3.5);
  const confidence = Math.min(1, Math.abs(score) * 1.15);

  let sentiment: Sentiment = "neutral";
  if (score >= 0.18) sentiment = "bullish";
  else if (score <= -0.18) sentiment = "bearish";

  return { sentiment, score, confidence };
}

/** Average signed score across headlines (−1…1). */
export function aggregateHeadlineScores(
  headlines: string[]
): { score: number; sentiment: Sentiment; sampleSize: number } {
  if (!headlines.length) {
    return { score: 0, sentiment: "neutral", sampleSize: 0 };
  }
  const scores = headlines.map((h) => scoreHeadlineSentiment(h).score);
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  let sentiment: Sentiment = "neutral";
  if (score >= 0.12) sentiment = "bullish";
  else if (score <= -0.12) sentiment = "bearish";
  return { score, sentiment, sampleSize: headlines.length };
}
