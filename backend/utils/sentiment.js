/**
 * sentiment.js — financial news sentiment, two tiers:
 *
 *   1. FinBERT — a real pretrained financial-sentiment transformer, run
 *      in-process via Transformers.js (ONNX, no Python). Loaded lazily and
 *      guarded by a timeout so it never blocks a page load; the model
 *      downloads once on first use, then is cached.
 *   2. Lexicon fallback — a weighted finance word-list (Loughran-McDonald
 *      inspired) with negation + intensifier handling. Instant, dependency-free,
 *      and used whenever FinBERT isn't installed / not yet warm / errors.
 *
 * `@xenova/transformers` is an OPTIONAL dependency: it's imported dynamically,
 * so the app runs fine without it — you just get the (still solid) lexicon.
 */

// ── weighted finance lexicon ────────────────────────────────────────────────
const POS = {
  beat: 2, beats: 2, beaten: 2, surpass: 2, surpassed: 2, surge: 2, surged: 2, soar: 2, soars: 2, soared: 2,
  jump: 2, jumps: 2, jumped: 2, rally: 2, rallied: 2, rallies: 2, record: 2, upgrade: 2, upgraded: 2, upgrades: 2,
  outperform: 2, outperformed: 2, exceed: 2, exceeds: 2, exceeded: 2, rebound: 2, rebounds: 2, bullish: 2,
  breakthrough: 2, approval: 2, buyback: 2, raise: 1, raised: 1, raises: 1, boost: 1, boosts: 1, boosted: 1,
  growth: 1, grow: 1, grows: 1, grew: 1, profit: 1, profits: 1, profitable: 2, gain: 1, gains: 1, gained: 1,
  strong: 1, stronger: 1, strength: 1, robust: 1, expansion: 1, expand: 1, tops: 1, optimistic: 1, upbeat: 1,
  momentum: 1, approved: 1, wins: 1, win: 1, awarded: 1, dividend: 1, accelerate: 1, accelerating: 1,
  higher: 1, climb: 1, climbs: 1, advance: 1, advances: 1, rise: 1, rises: 1,
};
const NEG = {
  miss: 2, misses: 2, missed: 2, plunge: 2, plunges: 2, plunged: 2, plummet: 3, plummets: 3, tumble: 2, tumbles: 2,
  tumbled: 2, slump: 2, slumps: 2, sink: 2, sinks: 2, sank: 2, downgrade: 2, downgraded: 2, downgrades: 2, slash: 2,
  slashed: 2, warn: 2, warns: 2, warning: 2, warned: 2, lawsuit: 2, sued: 2, probe: 2, investigation: 2, fraud: 3,
  scandal: 3, bankruptcy: 3, bankrupt: 3, default: 2, layoff: 2, layoffs: 2, recall: 2, halt: 2, halted: 2,
  suspend: 2, suspended: 2, bearish: 2, disappoint: 2, disappointing: 2, disappointed: 2, shortfall: 2, crash: 3,
  selloff: 2, underperform: 2, drop: 1, drops: 1, dropped: 1, fall: 1, falls: 1, fell: 1, decline: 1, declines: 1,
  declined: 1, cut: 1, cuts: 1, loss: 1, losses: 1, weak: 1, weaker: 1, weakness: 1, slowdown: 2, slowing: 1,
  concern: 1, concerns: 1, fears: 1, fear: 1, deficit: 1, delay: 1, delayed: 1, lower: 1, pessimistic: 1,
};
const NEGATORS = new Set(['not', 'no', 'never', "n't", 'without', 'fails', 'failed', 'fail', 'unable', 'lacks', 'lack', 'denies', 'denied']);
const INTENS = { very: 1.5, sharply: 1.6, significantly: 1.5, massively: 1.8, steeply: 1.6, deeply: 1.5, hugely: 1.7 };

export function lexiconNewsScore(news) {
  if (!Array.isArray(news) || news.length === 0) return null;
  let score = 0, hits = 0;
  for (const n of news.slice(0, 15)) {
    const toks = `${n.headline || ''} ${n.summary || ''}`.toLowerCase().split(/[^a-z']+/).filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      let base = POS[toks[i]] ? POS[toks[i]] : NEG[toks[i]] ? -NEG[toks[i]] : 0;
      if (base === 0) continue;
      let mult = 1, negate = false;
      for (let j = Math.max(0, i - 3); j < i; j++) {         // look back 3 tokens
        if (NEGATORS.has(toks[j])) negate = true;
        if (INTENS[toks[j]]) mult *= INTENS[toks[j]];
      }
      if (negate) base = -base * 0.8;                         // flip & slightly dampen
      score += base * mult;
      hits++;
    }
  }
  if (hits === 0) return 50;                                  // no signal → neutral
  const avg = score / hits;                                   // ~ -2..2
  return Math.round(Math.max(0, Math.min(100, 50 + avg * 22)));
}

// ── FinBERT via Transformers.js (optional, lazy, timeout-guarded) ───────────
const FINBERT_MODEL = 'Xenova/finbert';
let pipePromise = null;

function loadFinbert() {
  if (pipePromise === null) {
    pipePromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = false;      // pull from the HF hub
      return pipeline('text-classification', FINBERT_MODEL);
    })().catch((e) => { pipePromise = null; throw e; }); // allow a later retry
  }
  return pipePromise;
}

async function finbertScore(news, { timeoutMs = 4000 } = {}) {
  const texts = (news || [])
    .map((n) => `${n.headline || ''}. ${n.summary || ''}`.trim())
    .filter(Boolean)
    .slice(0, 12);
  if (texts.length === 0) return null;

  // Race the model load against a timeout so first-view page loads never hang.
  // If the timeout wins, the model keeps loading in the background for next time.
  const clf = await Promise.race([
    loadFinbert(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('finbert warm-up timeout')), timeoutMs)),
  ]);

  const out = await clf(texts);                 // [{ label, score }, ...]
  const arr = Array.isArray(out) ? out : [out];
  let sum = 0, n = 0;
  for (const r of arr) {
    const label = String(r?.label || '').toLowerCase();
    const s = label === 'positive' ? 1 : label === 'negative' ? -1 : 0;
    sum += s * (typeof r?.score === 'number' ? r.score : 1);
    n++;
  }
  if (n === 0) return null;
  return Math.round(Math.max(0, Math.min(100, (sum / n) * 50 + 50)));
}

/**
 * Best-available news sentiment. Tries FinBERT, falls back to the lexicon.
 * @returns {Promise<{score:number|null, model:'finbert'|'lexicon'|'none'}>}
 */
export async function newsSentiment(news) {
  try {
    const s = await finbertScore(news);
    if (s != null) return { score: s, model: 'finbert' };
  } catch (e) {
    if (process.env.DEBUG_SENTIMENT) console.warn('FinBERT unavailable, using lexicon:', e.message);
  }
  const s = lexiconNewsScore(news);
  return { score: s, model: s == null ? 'none' : 'lexicon' };
}
