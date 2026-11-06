import express from 'express';
import fetch from 'node-fetch';
import { getCached, setCache } from '../utils/cache.js';

const router = express.Router();

// Built-in name → ticker map so common searches work instantly, no API call needed
const NAME_MAP = {
  apple: [{ symbol: 'AAPL', name: 'Apple Inc' }],
  amazon: [{ symbol: 'AMZN', name: 'Amazon.com Inc' }],
  google: [{ symbol: 'GOOGL', name: 'Alphabet Inc (Google)' }],
  alphabet: [{ symbol: 'GOOGL', name: 'Alphabet Inc (Google)' }],
  microsoft: [{ symbol: 'MSFT', name: 'Microsoft Corporation' }],
  tesla: [{ symbol: 'TSLA', name: 'Tesla Inc' }],
  meta: [{ symbol: 'META', name: 'Meta Platforms Inc' }],
  facebook: [{ symbol: 'META', name: 'Meta Platforms Inc' }],
  nvidia: [{ symbol: 'NVDA', name: 'NVIDIA Corporation' }],
  netflix: [{ symbol: 'NFLX', name: 'Netflix Inc' }],
  disney: [{ symbol: 'DIS', name: 'The Walt Disney Company' }],
  walmart: [{ symbol: 'WMT', name: 'Walmart Inc' }],
  jpmorgan: [{ symbol: 'JPM', name: 'JPMorgan Chase & Co' }],
  'jp morgan': [{ symbol: 'JPM', name: 'JPMorgan Chase & Co' }],
  'coca cola': [{ symbol: 'KO', name: 'The Coca-Cola Company' }],
  cocacola: [{ symbol: 'KO', name: 'The Coca-Cola Company' }],
  coke: [{ symbol: 'KO', name: 'The Coca-Cola Company' }],
  ford: [{ symbol: 'F', name: 'Ford Motor Company' }],
  'general motors': [{ symbol: 'GM', name: 'General Motors Company' }],
  boeing: [{ symbol: 'BA', name: 'The Boeing Company' }],
  intel: [{ symbol: 'INTC', name: 'Intel Corporation' }],
  amd: [{ symbol: 'AMD', name: 'Advanced Micro Devices Inc' }],
  salesforce: [{ symbol: 'CRM', name: 'Salesforce Inc' }],
  uber: [{ symbol: 'UBER', name: 'Uber Technologies Inc' }],
  airbnb: [{ symbol: 'ABNB', name: 'Airbnb Inc' }],
  spotify: [{ symbol: 'SPOT', name: 'Spotify Technology SA' }],
  coinbase: [{ symbol: 'COIN', name: 'Coinbase Global Inc' }],
  shopify: [{ symbol: 'SHOP', name: 'Shopify Inc' }],
  paypal: [{ symbol: 'PYPL', name: 'PayPal Holdings Inc' }],
  visa: [{ symbol: 'V', name: 'Visa Inc' }],
  mastercard: [{ symbol: 'MA', name: 'Mastercard Incorporated' }],
  pfizer: [{ symbol: 'PFE', name: 'Pfizer Inc' }],
  johnson: [{ symbol: 'JNJ', name: 'Johnson & Johnson' }],
  exxon: [{ symbol: 'XOM', name: 'Exxon Mobil Corporation' }],
  chevron: [{ symbol: 'CVX', name: 'Chevron Corporation' }],
  'bank of america': [{ symbol: 'BAC', name: 'Bank of America Corp' }],
  'goldman sachs': [{ symbol: 'GS', name: 'Goldman Sachs Group Inc' }],
  'morgan stanley': [{ symbol: 'MS', name: 'Morgan Stanley' }],
  oracle: [{ symbol: 'ORCL', name: 'Oracle Corporation' }],
  adobe: [{ symbol: 'ADBE', name: 'Adobe Inc' }],
  zoom: [{ symbol: 'ZM', name: 'Zoom Video Communications Inc' }],
  palantir: [{ symbol: 'PLTR', name: 'Palantir Technologies Inc' }],
  robinhood: [{ symbol: 'HOOD', name: 'Robinhood Markets Inc' }],
  snap: [{ symbol: 'SNAP', name: 'Snap Inc' }],
  lyft: [{ symbol: 'LYFT', name: 'Lyft Inc' }],
  doordash: [{ symbol: 'DASH', name: 'DoorDash Inc' }],
  square: [{ symbol: 'SQ', name: 'Block Inc (formerly Square)' }],
  block: [{ symbol: 'SQ', name: 'Block Inc' }],
  roblox: [{ symbol: 'RBLX', name: 'Roblox Corporation' }],
  amc: [{ symbol: 'AMC', name: 'AMC Entertainment Holdings' }],
  gamestop: [{ symbol: 'GME', name: 'GameStop Corp' }],
  berkshire: [{ symbol: 'BRK.B', name: 'Berkshire Hathaway Inc' }],
  buffett: [{ symbol: 'BRK.B', name: 'Berkshire Hathaway Inc' }],
  'at&t': [{ symbol: 'T', name: 'AT&T Inc' }],
  verizon: [{ symbol: 'VZ', name: 'Verizon Communications Inc' }],
  arm: [{ symbol: 'ARM', name: 'Arm Holdings plc' }],
  qualcomm: [{ symbol: 'QCOM', name: 'Qualcomm Incorporated' }],
  'western digital': [{ symbol: 'WDC', name: 'Western Digital Corp' }],
  micron: [{ symbol: 'MU', name: 'Micron Technology Inc' }],
  broadcom: [{ symbol: 'AVGO', name: 'Broadcom Inc' }],
  ibm: [{ symbol: 'IBM', name: 'International Business Machines' }],
  dell: [{ symbol: 'DELL', name: 'Dell Technologies Inc' }],
  hp: [{ symbol: 'HPQ', name: 'HP Inc' }],
  'hewlett packard': [{ symbol: 'HPQ', name: 'HP Inc' }],
  starbucks: [{ symbol: 'SBUX', name: 'Starbucks Corporation' }],
  mcdonalds: [{ symbol: 'MCD', name: "McDonald's Corporation" }],
  nike: [{ symbol: 'NKE', name: 'Nike Inc' }],
  target: [{ symbol: 'TGT', name: 'Target Corporation' }],
  'home depot': [{ symbol: 'HD', name: 'The Home Depot Inc' }],
  costco: [{ symbol: 'COST', name: 'Costco Wholesale Corporation' }],
  blackrock: [{ symbol: 'BLK', name: 'BlackRock Inc' }],
  'american express': [{ symbol: 'AXP', name: 'American Express Company' }],
  amex: [{ symbol: 'AXP', name: 'American Express Company' }],
  unitedhealth: [{ symbol: 'UNH', name: 'UnitedHealth Group Inc' }],
  moderna: [{ symbol: 'MRNA', name: 'Moderna Inc' }],
  abbvie: [{ symbol: 'ABBV', name: 'AbbVie Inc' }],
  'eli lilly': [{ symbol: 'LLY', name: 'Eli Lilly and Company' }],
  lilly: [{ symbol: 'LLY', name: 'Eli Lilly and Company' }],
};

// GET /api/search?q=amazon
router.get('/', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 1) return res.json([]);

  const query = q.trim();
  const lower = query.toLowerCase();

  const cacheKey = `search_v2_${lower}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  // 1. Instant local matches by company name (e.g. "apple" → AAPL)
  const localHits = [];
  const seen = new Set();
  for (const [key, results] of Object.entries(NAME_MAP)) {
    if (key.includes(lower)) {
      for (const r of results) {
        if (!seen.has(r.symbol)) { seen.add(r.symbol); localHits.push(r); }
      }
    }
  }

  // 2. Finnhub symbol search — free, reliable, no daily limit
  let fhHits = [];
  try {
    const FH = process.env.FINNHUB_API_KEY;
    if (FH) {
      const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FH}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await r.json();
      fhHits = (data.result || [])
        // keep clean US tickers (skip foreign suffixes like .SS / .T and odd symbols)
        .filter(m => m.symbol && !m.symbol.includes('.') && !m.symbol.includes(':'))
        .filter(m => !m.type || m.type === 'Common Stock' || m.type === 'ADR')
        .map(m => ({ symbol: m.symbol, name: m.description, type: m.type || 'Stock' }));
    }
  } catch (err) {
    console.warn('Finnhub search failed:', err.message);
  }

  // 3. Merge (local first), dedupe by symbol
  const merged = [];
  const used = new Set();
  for (const r of [...localHits, ...fhHits]) {
    const sym = String(r.symbol).toUpperCase();
    if (!used.has(sym)) { used.add(sym); merged.push({ ...r, symbol: sym }); }
  }
  const final = merged.slice(0, 12);

  setCache(cacheKey, final, 10 * 60 * 1000);
  res.json(final);
});

export default router;
