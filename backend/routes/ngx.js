/**
 * Nigerian Exchange (NGX) data.
 * Nigeria has no clean free API, so we:
 *   1. Try the NGX public data feed (the one ngxgroup.com uses) — live prices
 *   2. Fall back to a curated list of major NGX-listed companies
 * TradingView charts work for these via the "NSENG:" exchange prefix.
 */
import express from 'express';
import fetch from 'node-fetch';
import { getCached, setCache } from '../utils/cache.js';

const router = express.Router();

// ── Curated list of major NGX-listed companies (fallback + browse) ────────
const NGX_COMPANIES = [
  { symbol: 'DANGCEM',    name: 'Dangote Cement',                 sector: 'Industrial Goods' },
  { symbol: 'BUACEMENT',  name: 'BUA Cement',                     sector: 'Industrial Goods' },
  { symbol: 'WAPCO',      name: 'Lafarge Africa',                 sector: 'Industrial Goods' },
  { symbol: 'MTNN',       name: 'MTN Nigeria',                    sector: 'Telecoms' },
  { symbol: 'AIRTELAFRI', name: 'Airtel Africa',                  sector: 'Telecoms' },
  { symbol: 'GTCO',       name: 'Guaranty Trust Holding (GTCO)',  sector: 'Banking' },
  { symbol: 'ZENITHBANK', name: 'Zenith Bank',                    sector: 'Banking' },
  { symbol: 'UBA',        name: 'United Bank for Africa',         sector: 'Banking' },
  { symbol: 'ACCESSCORP', name: 'Access Holdings',                sector: 'Banking' },
  { symbol: 'FBNH',       name: 'FBN Holdings',                   sector: 'Banking' },
  { symbol: 'STANBIC',    name: 'Stanbic IBTC Holdings',          sector: 'Banking' },
  { symbol: 'FIDELITYBK', name: 'Fidelity Bank',                  sector: 'Banking' },
  { symbol: 'ZENITHBANK', name: 'Zenith Bank',                    sector: 'Banking' },
  { symbol: 'SEPLAT',     name: 'Seplat Energy',                  sector: 'Oil & Gas' },
  { symbol: 'OANDO',      name: 'Oando',                          sector: 'Oil & Gas' },
  { symbol: 'TOTAL',      name: 'TotalEnergies Marketing Nigeria',sector: 'Oil & Gas' },
  { symbol: 'NESTLE',     name: 'Nestlé Nigeria',                 sector: 'Consumer Goods' },
  { symbol: 'NB',         name: 'Nigerian Breweries',             sector: 'Consumer Goods' },
  { symbol: 'BUAFOODS',   name: 'BUA Foods',                      sector: 'Consumer Goods' },
  { symbol: 'DANGSUGAR',  name: 'Dangote Sugar Refinery',         sector: 'Consumer Goods' },
  { symbol: 'FLOURMILL',  name: 'Flour Mills of Nigeria',         sector: 'Consumer Goods' },
  { symbol: 'UNILEVER',   name: 'Unilever Nigeria',               sector: 'Consumer Goods' },
  { symbol: 'PRESCO',     name: 'Presco',                         sector: 'Agriculture' },
  { symbol: 'OKOMUOIL',   name: 'Okomu Oil Palm',                 sector: 'Agriculture' },
  { symbol: 'TRANSCORP',  name: 'Transnational Corporation',      sector: 'Conglomerates' },
  { symbol: 'GEREGU',     name: 'Geregu Power',                   sector: 'Power' },
  { symbol: 'TRANSPOWER', name: 'Transcorp Power',                sector: 'Power' },
  // Broader NGX coverage — banks, insurers, consumer goods, services
  { symbol: 'ETI',        name: 'Ecobank Transnational',          sector: 'Banking' },
  { symbol: 'FCMB',       name: 'FCMB Group',                     sector: 'Banking' },
  { symbol: 'WEMABANK',   name: 'Wema Bank',                      sector: 'Banking' },
  { symbol: 'STERLINGNG', name: 'Sterling Financial Holdings',    sector: 'Banking' },
  { symbol: 'JAIZBANK',   name: 'Jaiz Bank',                      sector: 'Banking' },
  { symbol: 'GUINNESS',   name: 'Guinness Nigeria',               sector: 'Consumer Goods' },
  { symbol: 'PZ',         name: 'PZ Cussons Nigeria',             sector: 'Consumer Goods' },
  { symbol: 'CADBURY',    name: 'Cadbury Nigeria',                sector: 'Consumer Goods' },
  { symbol: 'HONYFLOUR',  name: 'Honeywell Flour Mills',          sector: 'Consumer Goods' },
  { symbol: 'INTBREW',    name: 'International Breweries',         sector: 'Consumer Goods' },
  { symbol: 'NASCON',     name: 'NASCON Allied Industries',       sector: 'Consumer Goods' },
  { symbol: 'VITAFOAM',   name: 'Vitafoam Nigeria',               sector: 'Consumer Goods' },
  { symbol: 'MANSARD',    name: 'AXA Mansard Insurance',          sector: 'Insurance' },
  { symbol: 'AIICO',      name: 'AIICO Insurance',                sector: 'Insurance' },
  { symbol: 'CUSTODIAN',  name: 'Custodian Investment',           sector: 'Insurance' },
  { symbol: 'NAHCO',      name: 'Nigerian Aviation Handling',     sector: 'Services' },
  { symbol: 'TRANSCOHOT', name: 'Transcorp Hotels',               sector: 'Services' },
];

// De-dupe by symbol (curated list may have repeats)
const CURATED = Object.values(
  NGX_COMPANIES.reduce((acc, c) => { acc[c.symbol] = c; return acc; }, {})
);

// ── helpers ───────────────────────────────────────────────────────────────
const pick = (o, keys) => {
  for (const k of keys) if (o?.[k] !== undefined && o?.[k] !== null && o[k] !== '') return o[k];
  return null;
};

function normPct(v) {
  if (v === null || v === undefined) return null;
  const num = parseFloat(String(v).replace('%', ''));
  if (isNaN(num)) return null;
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
}

async function fetchNGXLive() {
  const url = 'https://doclib.ngxgroup.com/REST/api/statistics/equities/?market=&sector=&orderby=&pageSize=300&pageNo=0';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://ngxgroup.com/',
      'Accept': 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`NGX ${res.status}`);

  const data = await res.json();
  const arr  = Array.isArray(data) ? data : (data.data || data.Data || data.equities || []);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('NGX empty');

  // Map symbol → curated full name (the NGX feed only returns the ticker)
  const nameBySymbol = CURATED.reduce((acc, c) => { acc[c.symbol] = c.name; return acc; }, {});

  return arr.map(item => {
    const ticker = pick(item, ['Symbol', 'symbol', 'SecurityId', 'securitySymbol']);
    const price  = pick(item, ['ClosePrice', 'Last', 'Close', 'close', 'LastTradePrice', 'Price', 'price', 'closingPrice']);
    return {
      ticker,
      name:   nameBySymbol[ticker] || (typeof ticker === 'string' ? ticker : null),
      price:  price != null ? Number(price).toFixed(2) : null,
      change_amount:     pick(item, ['Change', 'change', 'priceChange']),
      change_percentage: normPct(pick(item, ['PercChange', 'PChange', 'CalculateChangePercent', 'ChangePercent', 'pChange'])),
      volume: pick(item, ['Volume', 'volume', 'TradeVolume', 'tradeVolume']),
      market: 'ngx',
    };
  }).filter(x => x.ticker);
}

// ── GET /api/ngx/list — curated companies (always works) ──────────────────
router.get('/list', (_, res) => {
  res.json({ companies: CURATED });
});

// ── GET /api/ngx/movers — live gainers/losers, with curated fallback ──────
router.get('/movers', async (_, res) => {
  const cacheKey = 'ngx_movers';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const equities = await fetchNGXLive();

    const withPct = equities.filter(e => e.change_percentage !== null);
    const byPct   = (a, b) =>
      parseFloat(b.change_percentage) - parseFloat(a.change_percentage);

    const gainers = [...withPct].filter(e => parseFloat(e.change_percentage) > 0).sort(byPct).slice(0, 10);
    const losers  = [...withPct].filter(e => parseFloat(e.change_percentage) < 0).sort((a, b) => parseFloat(a.change_percentage) - parseFloat(b.change_percentage)).slice(0, 10);
    const active  = [...equities].filter(e => e.volume).sort((a, b) => (parseInt(b.volume) || 0) - (parseInt(a.volume) || 0)).slice(0, 10);

    const result = {
      source: 'Nigerian Exchange (NGX)',
      live: true,
      last_updated: new Date().toISOString(),
      gainers, losers, active,
    };
    setCache(cacheKey, result, 10 * 60 * 1000); // 10 min
    res.json(result);
  } catch (err) {
    console.warn('NGX live feed unavailable:', err.message);
    // Graceful fallback — curated companies, no live prices
    res.json({
      source: 'Curated list',
      live: false,
      message: 'Live NGX prices are temporarily unavailable. Showing major listed companies — charts still work.',
      companies: CURATED,
    });
  }
});

export default router;
