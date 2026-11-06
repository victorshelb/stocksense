/**
 * StockSense Intelligence Engine — a local, rules-based quant model.
 *
 * Turns live Finnhub data into four 0–100 pillar scores (momentum, growth,
 * sentiment, value), a blended 0–100 health score, a trend label, a "weather"
 * classification, and a plain-English summary — with NO LLM / external AI call.
 * This is what powers the health dial, weather pill, and metric bars.
 *
 * It is intentionally transparent and explainable (every score lists its
 * drivers). These are EDUCATIONAL SIGNALS, not predictions or financial advice.
 */

import { lexiconNewsScore } from './sentiment.js';

// ── small numeric helpers ────────────────────────────────────────────────────
const num = (v) => {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/[%$,]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const round = (x) => (x == null ? null : Math.round(x));
const avg = (xs) => {
  const a = xs.filter((x) => x != null);
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
};
// map v∈[lo,hi] → 0..100 (higher input = higher score)
const scale = (v, lo, hi) => (v == null ? null : clamp(((v - lo) / (hi - lo)) * 100));
// inverse: lower input = higher score (used for valuation — cheaper is "better")
const scaleInv = (v, lo, hi) => (v == null ? null : clamp(100 - ((v - lo) / (hi - lo)) * 100));

// News sentiment now lives in sentiment.js (FinBERT + weighted lexicon). The
// caller may pass a precomputed `newsSentimentScore` (e.g. FinBERT, which is
// async); if absent we fall back to the synchronous lexicon here.

// ── classification helpers ───────────────────────────────────────────────────
const PILLAR_LABEL = {
  momentum:  (s) => (s >= 67 ? 'Strong'     : s >= 40 ? 'Steady'  : 'Weak'),
  growth:    (s) => (s >= 67 ? 'Fast'       : s >= 40 ? 'Steady'  : 'Slow'),
  sentiment: (s) => (s >= 60 ? 'Positive'   : s >= 40 ? 'Neutral' : 'Negative'),
  value:     (s) => (s >= 60 ? 'Attractive' : s >= 40 ? 'Fair'    : 'Expensive'),
};

function weatherFor(h) {
  if (h == null) return { icon: '❓', label: 'Not enough data', band: 'unknown' };
  if (h >= 67)   return { icon: '☀️', label: 'Doing well',      band: 'good'  };
  if (h >= 40)   return { icon: '⛅', label: 'Mixed',           band: 'mixed' };
  return            { icon: '🌧️', label: 'Struggling',       band: 'weak'  };
}

// ── main ─────────────────────────────────────────────────────────────────────
export function computeIntelligence({ metric = {}, quote = {}, analystRatings = [], news = [], earnings = [], symbol = '', newsSentimentScore = null } = {}) {
  const m = metric || {};

  // ---- MOMENTUM: multi-horizon returns + position in the 52-week range ----
  const r3m = num(m['13WeekPriceReturnDaily']);
  const r1y = num(m['52WeekPriceReturnDaily']);
  const high = num(m['52WeekHigh']);
  const low  = num(m['52WeekLow']);
  const price = num(quote?.c);
  let rangePos = null;
  if (high != null && low != null && price != null && high > low) {
    rangePos = clamp(((price - low) / (high - low)) * 100);
  }
  const momentum = avg([scale(r3m, -20, 20), scale(r1y, -40, 40), rangePos]);
  const mDrivers = [];
  if (r3m != null) mDrivers.push(`${r3m >= 0 ? '+' : ''}${r3m.toFixed(1)}% over 3 months`);
  if (rangePos != null) mDrivers.push(rangePos >= 70 ? 'near its 52-week high' : rangePos <= 30 ? 'near its 52-week low' : 'mid 52-week range');
  if (r1y != null && mDrivers.length < 2) mDrivers.push(`${r1y >= 0 ? '+' : ''}${r1y.toFixed(1)}% over 1 year`);

  // ---- GROWTH: revenue & EPS growth, supported by profitability ----
  const revG = num(m['revenueGrowthTTMYoy']) ?? num(m['revenueGrowth5Y']);
  const epsG = num(m['epsGrowthTTMYoy']) ?? num(m['epsGrowth5Y']);
  const netMargin = num(m['netProfitMarginTTM']);
  const growth = avg([scale(revG, -10, 30), scale(epsG, -10, 30), scale(netMargin, 0, 25)]);
  const gDrivers = [];
  if (revG != null) gDrivers.push(`revenue ${revG >= 0 ? '+' : ''}${revG.toFixed(1)}% YoY`);
  if (netMargin != null) gDrivers.push(`${netMargin.toFixed(0)}% net margin`);
  if (epsG != null && gDrivers.length < 2) gDrivers.push(`EPS ${epsG >= 0 ? '+' : ''}${epsG.toFixed(1)}% YoY`);

  // ---- VALUE: cheaper multiples score higher; small dividend bonus ----
  const pe = num(m['peBasicExclExtraTTM']) ?? num(m['peTTM']);
  const pb = num(m['pbQuarterly']) ?? num(m['pbAnnual']);
  const ps = num(m['psTTM']);
  const dy = num(m['dividendYieldIndicatedAnnual']);
  const peScore = pe == null ? null : (pe <= 0 ? 25 : scaleInv(pe, 10, 40)); // unprofitable = poor value
  let value = avg([peScore, scaleInv(pb, 1, 8), scaleInv(ps, 1, 12)]);
  if (value != null && dy != null && dy > 0) value = clamp(value + Math.min(dy, 5) * 2);
  const vDrivers = [];
  if (pe != null) vDrivers.push(pe <= 0 ? 'no earnings (P/E n/a)' : `P/E ${pe.toFixed(0)} (${pe < 15 ? 'cheap' : pe > 35 ? 'rich' : 'fair'})`);
  if (dy != null && dy > 0) vDrivers.push(`${dy.toFixed(1)}% dividend yield`);
  if (ps != null && vDrivers.length < 2) vDrivers.push(`P/S ${ps.toFixed(1)}`);

  // ---- SENTIMENT: analyst consensus + news tone + earnings beats + today's move ----
  const ar = Array.isArray(analystRatings) && analystRatings[0] ? analystRatings[0] : null;
  let analystScore = null;
  if (ar && ar.total > 0) {
    analystScore = clamp(((ar.strongBuy * 100 + ar.buy * 75 + ar.hold * 50 + ar.sell * 25 + ar.strongSell * 0) / ar.total));
  }
  const newsScore = newsSentimentScore != null ? newsSentimentScore : lexiconNewsScore(news);
  const surprises = (earnings || []).map((e) => num(e.surprisePct)).filter((x) => x != null).slice(0, 4);
  const surpriseAvg = surprises.length ? avg(surprises) : null;
  const earnScore = surpriseAvg == null ? null : clamp(50 + surpriseAvg * 5);
  const dp = num(quote?.dp);
  const moveScore = dp == null ? null : clamp(50 + dp * 5);
  const sentiment = avg([analystScore, newsScore, earnScore, moveScore]);
  const sDrivers = [];
  if (ar && ar.total > 0) sDrivers.push(`${ar.strongBuy + ar.buy} buy vs ${ar.sell + ar.strongSell} sell (analysts)`);
  if (newsScore != null) sDrivers.push(newsScore >= 60 ? 'positive news tone' : newsScore <= 40 ? 'negative news tone' : 'mixed news tone');
  if (earnScore != null && surpriseAvg > 0 && sDrivers.length < 2) sDrivers.push('recent earnings beats');

  // ---- HEALTH: weighted blend over whatever pillars we have ----
  const pillars = { momentum, growth, sentiment, value };
  const WEIGHTS = { momentum: 0.30, growth: 0.25, sentiment: 0.20, value: 0.25 };
  let acc = 0, wsum = 0;
  for (const k of Object.keys(WEIGHTS)) {
    if (pillars[k] != null) { acc += pillars[k] * WEIGHTS[k]; wsum += WEIGHTS[k]; }
  }
  const healthScore = wsum > 0 ? round(acc / wsum) : null;

  // ---- TREND classification ----
  let trend = 'Stable';
  if (healthScore != null) {
    if ((momentum ?? 50) >= 60 && healthScore >= 55) trend = 'Improving';
    else if ((momentum ?? 50) <= 40 || healthScore <= 40) trend = 'Declining';
  }

  const weather = weatherFor(healthScore);
  const present = [momentum, growth, sentiment, value].filter((x) => x != null).length;
  const confidence = present >= 4 ? 'high' : present >= 3 ? 'medium' : present >= 1 ? 'low' : 'none';

  const driversFor = { momentum: mDrivers, growth: gDrivers, sentiment: sDrivers, value: vDrivers };
  const pillarOut = {};
  for (const k of Object.keys(pillars)) {
    const s = round(pillars[k]);
    pillarOut[k] = { score: s, label: s == null ? '—' : PILLAR_LABEL[k](s), drivers: driversFor[k].slice(0, 2) };
  }

  // ---- plain-English summary, templated from the numbers (no LLM) ----
  let summary;
  if (healthScore == null) {
    summary = `Not enough live data to score ${symbol} yet.`;
  } else {
    const ranked = Object.entries(pillars).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
    const [topK] = ranked[0];
    const [lowK] = ranked[ranked.length - 1];
    const topD = driversFor[topK][0];
    const lowD = driversFor[lowK][0];
    const lead = `${symbol} scores ${healthScore}/100 — ${weather.label.toLowerCase()}.`;
    const extra = [];
    if (topD) extra.push(`strongest on ${topK} (${topD})`);
    if (lowD && lowK !== topK) extra.push(`weakest on ${lowK} (${lowD})`);
    const tail = extra.length ? ` ${extra.join(', ').replace(/^./, (c) => c.toUpperCase())}.` : '';
    summary = lead + tail;
  }

  return {
    symbol,
    healthScore,
    trend,
    weather,
    confidence,
    pillars: pillarOut,
    summary,
    disclaimer: 'Educational signal generated from live data — not financial advice.',
    model: 'rules-quant-v1',
  };
}
