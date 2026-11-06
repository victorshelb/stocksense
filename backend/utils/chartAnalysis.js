/**
 * chartAnalysis.js — the "chart-reading" engine.
 *
 * Given daily price candles, it works out what the chart is DOING — trend,
 * position vs moving averages, recent momentum, volatility, and the biggest
 * up/down days — and explains it in plain English. A transparent technical-
 * analysis + NLG engine (no LLM / Claude). Educational signals, not advice.
 */

const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);
const fmtPct = (v) => (v == null ? null : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);
const sma = (arr, n) => (arr.length >= n ? arr.slice(-n).reduce((s, x) => s + x, 0) / n : null);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export function analyzeChart(candles, symbol = '') {
  const cs = (candles || []).filter((c) => c && c.close != null);
  if (cs.length < 5) return null; // not enough history to read

  const closes = cs.map((c) => c.close);
  const first = closes[0], last = closes[closes.length - 1];
  const periodReturn = pct(last, first);

  // daily % returns
  const rets = [];
  for (let i = 1; i < closes.length; i++) rets.push(pct(closes[i], closes[i - 1]) ?? 0);

  // moving average (prefer 50-day, fall back to 20-day)
  const sma20 = sma(closes, 20), sma50 = sma(closes, 50);
  const maVal = sma50 ?? sma20;
  const maRef = sma50 != null ? 50 : 20;
  const aboveMA = maVal != null ? last > maVal : null;

  // recent momentum: last 10 sessions vs the 10 before
  let momentum = null;
  if (closes.length >= 20) momentum = pct(mean(closes.slice(-10)), mean(closes.slice(-20, -10)));

  // biggest single-day up & down moves
  let bigUp = null, bigDown = null;
  for (let i = 1; i < cs.length; i++) {
    const r = pct(cs[i].close, cs[i - 1].close);
    if (r == null) continue;
    if (!bigUp || r > bigUp.pct) bigUp = { date: cs[i].date, pct: r };
    if (!bigDown || r < bigDown.pct) bigDown = { date: cs[i].date, pct: r };
  }

  // range / position
  const hi = Math.max(...cs.map((c) => c.high ?? c.close));
  const lo = Math.min(...cs.map((c) => c.low ?? c.close));
  const positionPct = hi > lo ? Math.round(((last - lo) / (hi - lo)) * 100) : null;

  // volatility = stdev of daily returns
  const mu = mean(rets);
  const vol = Math.sqrt(mean(rets.map((r) => (r - mu) ** 2)));
  const volLabel = vol < 1.5 ? 'Low' : vol < 3 ? 'Moderate' : 'High';

  // current up/down streak
  let streak = 0, dir = 0;
  for (let i = rets.length - 1; i >= 0; i--) {
    const s = rets[i] > 0 ? 1 : rets[i] < 0 ? -1 : 0;
    if (s === 0) break;
    if (dir === 0) { dir = s; streak = 1; }
    else if (s === dir) streak++;
    else break;
  }

  // trend
  const trend = periodReturn > 8 ? 'Uptrend' : periodReturn < -8 ? 'Downtrend' : 'Sideways';
  const trendClass = trend === 'Uptrend' ? 'up' : trend === 'Downtrend' ? 'down' : 'flat';

  // duration in plain terms
  const months = Math.round(cs.length / 21);
  const dur = months >= 1 ? `${months} month${months > 1 ? 's' : ''}` : `${cs.length} days`;

  // ── plain-English narrative ──
  const parts = [];
  parts.push(`Over the past ${dur}, ${symbol} has ${periodReturn >= 0 ? 'climbed' : 'fallen'} ${fmtPct(periodReturn)} — that's ${trend === 'Sideways' ? 'a sideways, range-bound market' : `a clear ${trend.toLowerCase()}`}.`);
  if (aboveMA != null) parts.push(`It's currently trading ${aboveMA ? 'above' : 'below'} its ${maRef}-day average price, which technical traders read as ${aboveMA ? 'bullish (buyers in control)' : 'bearish (sellers in control)'}.`);
  if (momentum != null) parts.push(`In the last two weeks it's ${momentum > 1.5 ? 'been accelerating higher' : momentum < -1.5 ? 'been losing steam' : 'moved mostly sideways'}.`);
  if ((bigUp && bigUp.pct > 3) || (bigDown && bigDown.pct < -3)) {
    const bits = [];
    if (bigUp && bigUp.pct > 3) bits.push(`jumped ${fmtPct(bigUp.pct)} on ${bigUp.date}`);
    if (bigDown && bigDown.pct < -3) bits.push(`dropped ${fmtPct(bigDown.pct)} on ${bigDown.date}`);
    parts.push(`The sharpest moves: it ${bits.join(' and ')} — big single-day swings like these usually line up with an earnings report or major news that day.`);
  }
  const summary = parts.join(' ');

  const signals = [
    { label: 'Trend', value: trend, detail: `${fmtPct(periodReturn)} over ${dur}` },
    aboveMA != null && { label: `vs ${maRef}-day avg`, value: aboveMA ? 'Above · bullish' : 'Below · bearish', detail: `avg ≈ $${maVal.toFixed(2)}` },
    momentum != null && { label: '2-week momentum', value: momentum > 1.5 ? 'Accelerating' : momentum < -1.5 ? 'Cooling off' : 'Steady', detail: fmtPct(momentum) },
    { label: 'Volatility', value: volLabel, detail: `±${vol.toFixed(1)}% per day` },
    streak >= 2 && { label: 'Current streak', value: `${streak} ${dir > 0 ? 'up' : 'down'} days`, detail: dir > 0 ? 'buyers in control' : 'sellers in control' },
  ].filter(Boolean);

  const keyMoves = [
    bigUp && bigUp.pct > 3 && { date: bigUp.date, direction: 'up', pct: fmtPct(bigUp.pct) },
    bigDown && bigDown.pct < -3 && { date: bigDown.date, direction: 'down', pct: fmtPct(bigDown.pct) },
  ].filter(Boolean);

  return {
    symbol,
    trend,
    trendClass,
    periodReturn: fmtPct(periodReturn),
    headline: `${trend} · ${fmtPct(periodReturn)} over ${dur}`,
    summary,
    signals,
    keyMoves,
    range: { low: +lo.toFixed(2), high: +hi.toFixed(2), current: +last.toFixed(2), positionPct },
    disclaimer: 'Read from live price history — educational, not financial advice.',
  };
}
