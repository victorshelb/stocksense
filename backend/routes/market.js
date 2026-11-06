import express from 'express';
import fetch from 'node-fetch';
import { getCached, setCache } from '../utils/cache.js';

const router = express.Router();

// Curated universe of liquid, recognisable stocks — we fetch live quotes for
// these and compute gainers/losers. Finnhub /quote is free (60 req/min), so
// this is reliable with no daily limit (unlike Alpha Vantage / FMP).
const UNIVERSE = [
  // Mega-cap tech & semis
  'AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','AMD','INTC','NFLX',
  'ORCL','CRM','ADBE','CSCO','QCOM','TXN','AVGO','MU','AMAT','LRCX',
  'INTU','NOW','IBM','SHOP','PLTR','SNOW','DELL','HPQ','SMCI','ARM',
  'PANW','CRWD','DDOG','NET','ZS','UBER','ABNB','MRVL','ADI','KLAC',
  // Communication & media
  'DIS','T','VZ','CMCSA','SPOT','SNAP','RBLX','PINS','WBD','EA',
  // Financials & fintech
  'JPM','BAC','V','MA','GS','MS','WFC','C','AXP','SCHW',
  'BLK','PYPL','SOFI','HOOD','COIN','SQ','PGR','CB','SPGI','ICE',
  // Healthcare & pharma
  'JNJ','LLY','PFE','MRNA','UNH','ABBV','MRK','TMO','ABT','AMGN',
  'GILD','BMY','CVS','DHR','ISRG',
  // Consumer
  'WMT','KO','PEP','MCD','NKE','COST','SBUX','TGT','HD','LOW',
  'PG','CL','BABA','PDD','LULU','CMG','DPZ','EL',
  // Energy & industrials & autos
  'XOM','CVX','COP','SLB','OXY','BA','CAT','GE','F','GM',
  'RIVN','LCID','UPS','FDX','LMT','RTX','DE','HON','MMM','NEE',
  // Broader coverage — staples, alt-assets, utilities, REITs, travel, industrials
  'MDLZ','MO','PM','BX','KKR','VST','CEG','PLD','AMT','WM',
  'BKNG','MAR','ANET','MELI','GD','TJX','ELV','CI','SO','DUK',
];

const NAMES = {
  AAPL:'Apple', MSFT:'Microsoft', NVDA:'NVIDIA', GOOGL:'Alphabet', AMZN:'Amazon',
  META:'Meta', TSLA:'Tesla', AMD:'AMD', INTC:'Intel', NFLX:'Netflix', DIS:'Disney',
  ORCL:'Oracle', CRM:'Salesforce', ADBE:'Adobe', CSCO:'Cisco', QCOM:'Qualcomm',
  TXN:'Texas Instruments', AVGO:'Broadcom', MU:'Micron', AMAT:'Applied Materials',
  LRCX:'Lam Research', INTU:'Intuit', NOW:'ServiceNow', IBM:'IBM', SHOP:'Shopify',
  PLTR:'Palantir', SNOW:'Snowflake', DELL:'Dell', HPQ:'HP', SMCI:'Super Micro', ARM:'Arm',
  PANW:'Palo Alto Networks', CRWD:'CrowdStrike', DDOG:'Datadog', NET:'Cloudflare',
  ZS:'Zscaler', UBER:'Uber', ABNB:'Airbnb', MRVL:'Marvell', ADI:'Analog Devices', KLAC:'KLA',
  T:'AT&T', VZ:'Verizon', CMCSA:'Comcast', SPOT:'Spotify', SNAP:'Snap', RBLX:'Roblox',
  PINS:'Pinterest', WBD:'Warner Bros Discovery', EA:'Electronic Arts',
  JPM:'JPMorgan', BAC:'Bank of America', V:'Visa', MA:'Mastercard', GS:'Goldman Sachs',
  MS:'Morgan Stanley', WFC:'Wells Fargo', C:'Citigroup', AXP:'American Express',
  SCHW:'Charles Schwab', BLK:'BlackRock', PYPL:'PayPal', SOFI:'SoFi', HOOD:'Robinhood',
  COIN:'Coinbase', SQ:'Block', PGR:'Progressive', CB:'Chubb', SPGI:'S&P Global', ICE:'ICE',
  JNJ:'Johnson & Johnson', LLY:'Eli Lilly', PFE:'Pfizer', MRNA:'Moderna', UNH:'UnitedHealth',
  ABBV:'AbbVie', MRK:'Merck', TMO:'Thermo Fisher', ABT:'Abbott', AMGN:'Amgen',
  GILD:'Gilead', BMY:'Bristol-Myers', CVS:'CVS Health', DHR:'Danaher', ISRG:'Intuitive Surgical',
  WMT:'Walmart', KO:'Coca-Cola', PEP:'PepsiCo', MCD:"McDonald's", NKE:'Nike', COST:'Costco',
  SBUX:'Starbucks', TGT:'Target', HD:'Home Depot', LOW:"Lowe's", PG:'Procter & Gamble',
  CL:'Colgate', BABA:'Alibaba', PDD:'PDD Holdings', LULU:'Lululemon', CMG:'Chipotle',
  DPZ:"Domino's", EL:'Estée Lauder',
  XOM:'Exxon Mobil', CVX:'Chevron', COP:'ConocoPhillips', SLB:'SLB', OXY:'Occidental',
  BA:'Boeing', CAT:'Caterpillar', GE:'GE Aerospace', F:'Ford', GM:'General Motors',
  RIVN:'Rivian', LCID:'Lucid', UPS:'UPS', FDX:'FedEx', LMT:'Lockheed Martin',
  RTX:'RTX', DE:'Deere', HON:'Honeywell', MMM:'3M', NEE:'NextEra Energy',
  MDLZ:'Mondelez', MO:'Altria', PM:'Philip Morris', BX:'Blackstone', KKR:'KKR',
  VST:'Vistra', CEG:'Constellation Energy', PLD:'Prologis', AMT:'American Tower',
  WM:'Waste Management', BKNG:'Booking Holdings', MAR:'Marriott', ANET:'Arista Networks',
  MELI:'MercadoLibre', GD:'General Dynamics', TJX:'TJX', ELV:'Elevance Health',
  CI:'Cigna', SO:'Southern Company', DUK:'Duke Energy',
};

const FH = () => process.env.FINNHUB_API_KEY;

async function quote(symbol) {
  try {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FH()}`, {
      signal: AbortSignal.timeout(8000),
    });
    const q = await r.json();
    if (!q || q.c == null || q.c === 0) return null;
    return {
      ticker: symbol,
      name: NAMES[symbol] || symbol,
      price: String(q.c),
      change_amount: q.d != null ? String(q.d) : null,
      change_percentage: `${q.dp >= 0 ? '+' : ''}${(q.dp ?? 0).toFixed(2)}%`,
      volume: null,
      _dp: q.dp ?? 0,
    };
  } catch {
    return null;
  }
}

// Fetch in small chunks to stay friendly with Finnhub's rate limit
async function fetchUniverse() {
  const out = [];
  const CHUNK = 10;
  for (let i = 0; i < UNIVERSE.length; i += CHUNK) {
    const chunk = UNIVERSE.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(quote));
    out.push(...results.filter(Boolean));
    // small pause between chunks so the quote burst stays friendly to Finnhub's 60/min
    if (i + CHUNK < UNIVERSE.length) await new Promise(r => setTimeout(r, 300));
  }
  return out;
}

// GET /api/market/overview
router.get('/overview', async (req, res) => {
  const cacheKey = 'market_overview_fh';
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  if (!FH()) {
    return res.status(429).json({
      error: 'Add a free Finnhub API key (FINNHUB_API_KEY) for live market data.',
      needsKey: true,
    });
  }

  try {
    const stocks = await fetchUniverse();
    if (stocks.length === 0) {
      return res.status(503).json({ error: 'Could not load live quotes. Please try again shortly.' });
    }

    const sorted = [...stocks].sort((a, b) => b._dp - a._dp);
    const byVolatility = [...stocks].sort((a, b) => Math.abs(b._dp) - Math.abs(a._dp));

    const strip = ({ _dp, ...rest }) => rest;

    const result = {
      source: 'Finnhub (live)',
      last_updated: new Date().toISOString(),
      top_gainers: sorted.filter(s => s._dp > 0).slice(0, 10).map(strip),
      top_losers:  sorted.filter(s => s._dp < 0).slice(-10).reverse().map(strip),
      most_actively_traded: byVolatility.slice(0, 10).map(strip),
    };

    setCache(cacheKey, result, 5 * 60 * 1000); // 5 min
    res.json(result);
  } catch (err) {
    console.error('Market overview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market data.' });
  }
});

export default router;
