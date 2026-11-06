/**
 * explain.js — StockSense local explanation engine (Claude replacement).
 *
 * Turns live Finnhub data + the quant Intelligence scores into a full
 * plain-English analysis in the SAME shape the UI expected from Claude
 * (plain_summary, recommendation, risk_level, why_up/why_down, etc.), so it
 * drops straight into <AISummary> with NO external API call, NO cost, NO limit.
 *
 * It's a transparent rules + natural-language-generation engine (an expert
 * system), not a trained LLM — every sentence is built from real numbers.
 * These are EDUCATIONAL SIGNALS, not financial advice.
 */

const num = (v) => {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/[%$,]/g, '')) : Number(v);
  return Number.isFinite(n) ? n : null;
};
const money = (n) => {
  if (n == null) return null;
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)} trillion`;
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(1)} billion`;
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(0)} million`;
  return `$${n.toFixed(0)}`;
};
// deterministic per-symbol phrasing variety (stable across reloads → cache-friendly)
const hash = (s) => { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

export function explainStock({ symbol = '', profile = {}, metric = {}, quote = {}, intelligence = {}, news = [], analystRatings = [], earnings = [] } = {}) {
  const m = metric || {};
  const q = quote || {};
  const name = profile?.name || symbol;
  const industry = profile?.finnhubIndustry || null;
  const seed = hash(symbol);
  const pick = (arr, salt = 0) => arr[(seed + salt) % arr.length];

  const health   = intelligence?.healthScore ?? null;
  const pillars  = intelligence?.pillars || {};
  const weather  = intelligence?.weather || {};
  const trend    = intelligence?.trend || 'Stable';

  const cap   = num(m.marketCapitalization) != null ? money(num(m.marketCapitalization) * 1e6) : null;
  const pe    = num(m.peBasicExclExtraTTM) ?? num(m.peTTM);
  const beta  = num(m.beta);
  const revG  = num(m.revenueGrowthTTMYoy) ?? num(m.revenueGrowth5Y);
  const netM  = num(m.netProfitMarginTTM);
  const divY  = num(m.dividendYieldIndicatedAnnual);
  const hi    = num(m['52WeekHigh']);
  const lo    = num(m['52WeekLow']);
  const price = num(q.c);
  const dp    = num(q.dp);

  // ── analyst consensus ──
  const ar = Array.isArray(analystRatings) && analystRatings[0] ? analystRatings[0] : null;
  const buys  = ar ? (ar.strongBuy || 0) + (ar.buy || 0) : 0;
  const sells = ar ? (ar.sell || 0) + (ar.strongSell || 0) : 0;

  // ── earnings beat/miss record ──
  const eps = (earnings || []).filter((e) => e && e.beat != null).slice(0, 4);
  const beats = eps.filter((e) => e.beat).length;

  // ── low-data / obscure security fallback ──
  if (health == null) {
    return {
      engine: 'local', web_researched: false,
      plain_summary: `We don't have enough live fundamental data on ${name} (${symbol}) to score it confidently — this can happen with warrants, SPACs, newly listed, or thinly covered securities. The price chart below still works, and you can read any available news.`,
      recommendation: 'NEUTRAL', risk_level: 'HIGH',
      recommendation_reason: 'Not enough data to form a signal — treat with caution until fundamentals are available.',
      risk_reason: 'Low data coverage often means low liquidity or an unusual security type, both of which raise risk.',
      why_up: [], why_down: [],
      why_moving_today: 'null — not a top mover today',
      price_context: (price != null && hi != null && lo != null)
        ? `Trades at $${price.toFixed(2)}, within a 52-week range of $${lo.toFixed(2)} – $${hi.toFixed(2)}.` : null,
      earnings_trend: null,
      latest_developments: (news || []).slice(0, 3).map((n) => n.headline).filter(Boolean),
    };
  }

  // ── recommendation + risk from the quant signals ──
  const recommendation = health >= 62 ? 'BULLISH' : health >= 42 ? 'NEUTRAL' : 'BEARISH';
  let riskPts = 0;
  if (beta != null) riskPts += beta > 1.5 ? 2 : beta > 1.1 ? 1 : 0;
  if (pe != null && pe > 40) riskPts += 1;
  if (pe != null && pe <= 0) riskPts += 1;               // unprofitable
  if ((pillars.momentum?.score ?? 50) < 35) riskPts += 1;
  if (intelligence.confidence === 'low' || intelligence.confidence === 'none') riskPts += 1;
  const risk_level = riskPts >= 3 ? 'HIGH' : riskPts >= 1 ? 'MEDIUM' : 'LOW';

  // ── plain_summary ──
  const whatItIs = industry
    ? pick([`${name} is a ${industry} company`, `${name} operates in the ${industry} sector`, `${name}, a ${industry} business,`], 1)
    : `${name}`;
  const sizeBit = cap ? ` valued at roughly ${cap}` : '';
  const verdict = pick([
    `Our on-device model rates its overall health ${health}/100 — ${weather.label?.toLowerCase()}`,
    `The engine scores it ${health}/100 overall (${weather.label?.toLowerCase()})`,
    `On our 0–100 health scale it lands at ${health} — ${weather.label?.toLowerCase()}`,
  ], 2);
  const trendBit = trend === 'Improving' ? ', and the trend is improving'
    : trend === 'Declining' ? ', and the trend is weakening' : '';
  // strongest / weakest pillar for a specific hook
  const ranked = Object.entries(pillars).filter(([, v]) => v?.score != null).sort((a, b) => b[1].score - a[1].score);
  const top = ranked[0], low = ranked[ranked.length - 1];
  const hook = (top && low && top[0] !== low[0])
    ? ` Its strongest area is ${top[0]}${top[1].drivers?.[0] ? ` (${top[1].drivers[0]})` : ''}, while ${low[0]} is the softer spot${low[1].drivers?.[0] ? ` (${low[1].drivers[0]})` : ''}.`
    : '';
  const plain_summary = `${whatItIs}${sizeBit}. ${verdict}${trendBit}.${hook}`;

  // ── why_up ──
  const why_up = [];
  if ((pillars.momentum?.score ?? 0) >= 60 && pillars.momentum?.drivers?.[0]) why_up.push(`Positive price momentum — ${pillars.momentum.drivers[0]}.`);
  if (revG != null && revG > 5) why_up.push(`Revenue is growing about ${revG.toFixed(0)}% year over year.`);
  if (netM != null && netM > 12) why_up.push(`Solidly profitable, with a ${netM.toFixed(0)}% net margin.`);
  if ((pillars.value?.score ?? 0) >= 60 && pillars.value?.drivers?.[0]) why_up.push(`Reasonably valued — ${pillars.value.drivers[0]}.`);
  if (buys > sells && (buys + sells) > 0) why_up.push(`Analysts lean positive — ${buys} buy vs ${sells} sell ratings.`);
  if (beats >= 3) why_up.push(`Beat earnings estimates in ${beats} of the last ${eps.length} quarters.`);
  if (divY != null && divY > 0.5) why_up.push(`Pays a ${divY.toFixed(1)}% dividend while you hold it.`);

  // ── why_down ──
  const why_down = [];
  if (pe != null && pe > 35) why_down.push(`Expensive at a P/E of ${pe.toFixed(0)} — priced for strong growth, so misses hurt.`);
  if (pe != null && pe <= 0) why_down.push(`Not yet profitable, so it relies on future growth to justify the price.`);
  if (revG != null && revG < 0) why_down.push(`Revenue is shrinking (${revG.toFixed(0)}% YoY), a sign of a weakening business.`);
  if ((pillars.momentum?.score ?? 100) < 40) why_down.push(`Weak price momentum — the chart has been trending down.`);
  if (beta != null && beta > 1.3) why_down.push(`Volatile (beta ${beta.toFixed(1)}) — it swings more sharply than the overall market.`);
  if (sells >= buys && (buys + sells) > 0) why_down.push(`Analyst sentiment is cautious — ${sells} sell vs ${buys} buy ratings.`);
  if (beats === 0 && eps.length > 0) why_down.push(`Missed earnings estimates in each of the last ${eps.length} reported quarters.`);
  if (why_down.length === 0) why_down.push(`Even healthy stocks fall in broad market selloffs or on disappointing news.`);

  // ── price_context ──
  let price_context = null;
  if (price != null && hi != null && lo != null && hi > lo) {
    const posPct = Math.round(((price - lo) / (hi - lo)) * 100);
    const where = posPct >= 80 ? 'near the top of' : posPct <= 20 ? 'near the bottom of' : 'mid-way through';
    price_context = `At $${price.toFixed(2)}, it's ${posPct}% of the way up its 52-week range ($${lo.toFixed(2)}–$${hi.toFixed(2)}) — ${where} the range.`;
  }

  // ── earnings_trend ──
  let earnings_trend = null;
  if (eps.length > 0) {
    earnings_trend = beats >= Math.ceil(eps.length / 2)
      ? `Reliable performer — beat Wall Street estimates in ${beats} of the last ${eps.length} reported quarters.`
      : `Mixed track record — beat estimates in only ${beats} of the last ${eps.length} reported quarters.`;
  }

  // ── why_moving_today ──
  let why_moving_today = 'null — not a top mover today';
  if (dp != null && Math.abs(dp) >= 3) {
    const topNews = (news || [])[0]?.headline;
    why_moving_today = `${name} is ${dp > 0 ? 'up' : 'down'} ${Math.abs(dp).toFixed(1)}% today${topNews ? `. Recent headline: "${topNews}"` : '.'}`;
  }

  // ── recommendation + risk reasons ──
  const recWord = recommendation === 'BULLISH' ? 'leans positive' : recommendation === 'BEARISH' ? 'leans cautious' : 'is balanced';
  const recommendation_reason = `The signal ${recWord}: a health score of ${health}/100 driven mainly by ${top ? top[0] : 'its fundamentals'}${why_up[0] ? `, e.g. ${why_up[0].replace(/\.$/, '').toLowerCase()}` : ''}. You make the final call.`;
  const risk_reason = risk_level === 'HIGH'
    ? `Higher risk${beta != null ? ` — beta ${beta.toFixed(1)}` : ''}${pe != null && pe > 40 ? ', a rich valuation' : ''}${pe != null && pe <= 0 ? ', and no profits yet' : ''}.`
    : risk_level === 'MEDIUM'
    ? `Moderate risk — some volatility or valuation stretch, but nothing extreme.`
    : `Lower risk — steadier profile relative to the market.`;

  return {
    engine: 'local',
    web_researched: false,
    plain_summary,
    recommendation,
    risk_level,
    recommendation_reason,
    risk_reason,
    why_up: why_up.slice(0, 5),
    why_down: why_down.slice(0, 5),
    why_moving_today,
    price_context,
    earnings_trend,
    latest_developments: (news || []).slice(0, 3).map((n) => n.headline).filter(Boolean),
  };
}
