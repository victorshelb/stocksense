/**
 * Yahoo Finance data — no API key required, no daily limit.
 * Used for financial statements, dividends, earnings, and news
 * that Alpha Vantage either doesn't have or rate-limits heavily.
 */
import express from 'express';
import fetch from 'node-fetch';
import { getCached, setCache } from '../utils/cache.js';
import { analyzeChart } from '../utils/chartAnalysis.js';

const router = express.Router();

// ── Yahoo Finance session manager (handles crumb auth) ────────────────────
class YFSession {
  constructor() { this.crumb = null; this.cookie = null; }

  async init() {
    if (this.crumb) return;
    try {
      const r1 = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': UA, 'Accept': 'text/html' },
        redirect: 'follow',
      });
      // Grab A3 or B cookie — either works
      const setCookie = r1.headers.get('set-cookie') || '';
      const match = setCookie.match(/A3=[^;]+/) || setCookie.match(/B=[^;]+/);
      this.cookie = match ? match[0] : '';

      const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, 'Cookie': this.cookie },
      });
      const text = await r2.text();
      this.crumb = text.trim();
    } catch (err) {
      console.warn('YF session init failed:', err.message);
      this.crumb = null;
      this.cookie = null;
    }
  }

  async get(path, params = {}) {
    await this.init();

    const url = new URL(`https://query2.finance.yahoo.com${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (this.crumb) url.searchParams.set('crumb', this.crumb);

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': UA, 'Cookie': this.cookie || '' },
    });

    if (res.status === 401) {
      // Crumb expired — reset and retry once
      this.crumb = null; this.cookie = null;
      await this.init();
      return this.get(path, params);
    }
    return res;
  }
}

const UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const yf  = new YFSession();

const MODULES = [
  'assetProfile', 'financialData', 'defaultKeyStatistics', 'summaryDetail',
  'incomeStatementHistory', 'incomeStatementHistoryQuarterly',
  'balanceSheetHistory', 'balanceSheetHistoryQuarterly',
  'cashflowStatementHistory', 'cashflowStatementHistoryQuarterly',
  'earningsTrend', 'calendarEvents',
].join(',');

// ── helpers ───────────────────────────────────────────────────────────────
const raw = (v) => (v?.raw === undefined ? null : v.raw);
const fmtV = (v) => (v?.fmt === undefined ? null : v.fmt);

function formatMoney(n) {
  if (n === null || n === undefined) return null;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function parseIncome(statements) {
  return (statements || []).map(s => ({
    date:            s.endDate?.fmt,
    revenue:         raw(s.totalRevenue),
    revenueFmt:      formatMoney(raw(s.totalRevenue)),
    grossProfit:     raw(s.grossProfit),
    grossProfitFmt:  formatMoney(raw(s.grossProfit)),
    operatingIncome: raw(s.operatingIncome),
    operatingFmt:    formatMoney(raw(s.operatingIncome)),
    netIncome:       raw(s.netIncome),
    netIncomeFmt:    formatMoney(raw(s.netIncome)),
    ebitda:          raw(s.ebitda),
    ebitdaFmt:       formatMoney(raw(s.ebitda)),
    eps:             raw(s.dilutedEps),
    epsFmt:          fmtV(s.dilutedEps),
    grossMargin:     raw(s.totalRevenue) ? ((raw(s.grossProfit) / raw(s.totalRevenue)) * 100).toFixed(1) + '%' : null,
    netMargin:       raw(s.totalRevenue) ? ((raw(s.netIncome) / raw(s.totalRevenue)) * 100).toFixed(1) + '%' : null,
  }));
}

function parseBalance(statements) {
  return (statements || []).map(s => ({
    date:            s.endDate?.fmt,
    totalAssets:     raw(s.totalAssets),
    assetsFmt:       formatMoney(raw(s.totalAssets)),
    totalLiabilities:raw(s.totalLiab),
    liabFmt:         formatMoney(raw(s.totalLiab)),
    totalEquity:     raw(s.totalStockholderEquity),
    equityFmt:       formatMoney(raw(s.totalStockholderEquity)),
    cash:            raw(s.cash),
    cashFmt:         formatMoney(raw(s.cash)),
    shortTermDebt:   raw(s.shortLongTermDebt),
    longTermDebt:    raw(s.longTermDebt),
    longTermDebtFmt: formatMoney(raw(s.longTermDebt)),
    debtToEquity:    (raw(s.totalLiab) && raw(s.totalStockholderEquity))
      ? ((raw(s.totalLiab) / raw(s.totalStockholderEquity))).toFixed(2)
      : null,
  }));
}

function parseCashFlow(statements) {
  return (statements || []).map(s => ({
    date:        s.endDate?.fmt,
    operatingCF: raw(s.totalCashFromOperatingActivities),
    opFmt:       formatMoney(raw(s.totalCashFromOperatingActivities)),
    investingCF: raw(s.totalCashflowsFromInvestingActivities),
    invFmt:      formatMoney(raw(s.totalCashflowsFromInvestingActivities)),
    financingCF: raw(s.totalCashFromFinancingActivities),
    finFmt:      formatMoney(raw(s.totalCashFromFinancingActivities)),
    freeCashFlow:raw(s.freeCashFlow),
    fcfFmt:      formatMoney(raw(s.freeCashFlow)),
    capex:       raw(s.capitalExpenditures),
    capexFmt:    formatMoney(raw(s.capitalExpenditures)),
  }));
}

// ── GET /api/yahoo/:symbol — full financials ──────────────────────────────
router.get('/:symbol', async (req, res) => {
  const symbol   = req.params.symbol.toUpperCase();
  const cacheKey = `yf_full_${symbol}`;
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const response = await yf.get(`/v10/finance/quoteSummary/${symbol}`, { modules: MODULES });
    const json     = await response.json();

    if (json.quoteSummary?.error || !json.quoteSummary?.result?.[0]) {
      return res.status(404).json({ error: `No financial data found for ${symbol}.` });
    }

    const d   = json.quoteSummary.result[0];
    const fd  = d.financialData || {};
    const ks  = d.defaultKeyStatistics || {};
    const sd  = d.summaryDetail || {};
    const cal = d.calendarEvents || {};
    const et  = d.earningsTrend || {};

    const result = {
      symbol,
      // Financial statements
      incomeStatement: {
        annual:    parseIncome(d.incomeStatementHistory?.incomeStatementHistory),
        quarterly: parseIncome(d.incomeStatementHistoryQuarterly?.incomeStatementHistory),
      },
      balanceSheet: {
        annual:    parseBalance(d.balanceSheetHistory?.balanceSheetStatements),
        quarterly: parseBalance(d.balanceSheetHistoryQuarterly?.balanceSheetStatements),
      },
      cashFlow: {
        annual:    parseCashFlow(d.cashflowStatementHistory?.cashflowStatements),
        quarterly: parseCashFlow(d.cashflowStatementHistoryQuarterly?.cashflowStatements),
      },
      // Key metrics (for AI context)
      metrics: {
        revenueGrowth:    fd.revenueGrowth?.fmt,
        earningsGrowth:   fd.earningsGrowth?.fmt,
        grossMargins:     fd.grossMargins?.fmt,
        operatingMargins: fd.operatingMargins?.fmt,
        profitMargins:    fd.profitMargins?.fmt,
        returnOnEquity:   fd.returnOnEquity?.fmt,
        returnOnAssets:   fd.returnOnAssets?.fmt,
        totalCash:        formatMoney(raw(fd.totalCash)),
        totalDebt:        formatMoney(raw(fd.totalDebt)),
        freeCashflow:     formatMoney(raw(fd.freeCashflow)),
        debtToEquity:     fd.debtToEquity?.fmt,
        forwardPE:        raw(ks.forwardPE)?.toFixed(2),
        priceToBook:      raw(ks.priceToBook)?.toFixed(2),
        analystRating:    fd.recommendationKey,
        targetPrice:      formatMoney(raw(fd.targetMeanPrice)),
        targetHigh:       formatMoney(raw(fd.targetHighPrice)),
        targetLow:        formatMoney(raw(fd.targetLowPrice)),
      },
      // Dividends
      dividend: {
        hasDividend:   (raw(sd.dividendRate) || 0) > 0,
        ratePerShare:  raw(sd.dividendRate),
        ratePerShareFmt: sd.dividendRate?.fmt,
        yield:         raw(sd.dividendYield),
        yieldFmt:      sd.dividendYield ? (raw(sd.dividendYield) * 100).toFixed(2) + '%' : null,
        exDividendDate: sd.exDividendDate?.fmt,
        payoutRatio:   sd.payoutRatio?.fmt,
        lastSplitDate: ks.lastSplitDate?.fmt,
        lastSplitFactor: ks.lastSplitFactor?.fmt,
      },
      // Earnings calendar
      earnings: {
        nextDate:    cal.earnings?.earningsDate?.[0]?.fmt || null,
        nextDateRaw: cal.earnings?.earningsDate?.[0]?.raw || null,
        epsEstimate: cal.earnings?.epsEstimate?.fmt || null,
        revenueEstimate: cal.earnings?.revenueEstimate ? formatMoney(raw(cal.earnings.revenueEstimate)) : null,
        trend: (et.trend || []).slice(0, 4).map(t => ({
          period:          t.period,
          periodLabel:     { '0q': 'This Quarter', '+1q': 'Next Quarter', '0y': 'This Year', '+1y': 'Next Year' }[t.period] || t.period,
          epsEstimate:     t.earningsEstimate?.avg?.fmt,
          epsGrowth:       t.earningsEstimate?.growth?.fmt,
          revenueEstimate: t.revenueEstimate?.avg?.fmt,
          revenueGrowth:   t.revenueEstimate?.growth?.fmt,
        })),
      },
    };

    setCache(cacheKey, result, 30 * 60 * 1000); // 30 min cache
    res.json(result);
  } catch (err) {
    console.error('Yahoo Finance error:', err.message);
    res.status(500).json({ error: 'Could not fetch financial data.' });
  }
});

// ── GET /api/yahoo/:symbol/news — broader news coverage ──────────────────
router.get('/:symbol/news', async (req, res) => {
  const symbol   = req.params.symbol.toUpperCase();
  const cacheKey = `yf_news_${symbol}`;
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Yahoo Finance search endpoint — no auth needed for news
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=20&enableFuzzyQuery=false&quotesCount=0`;
    const res2 = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await res2.json();

    const news = (data.news || []).slice(0, 15).map(item => ({
      title:       item.title,
      publisher:   item.publisher,
      url:         item.link,
      publishedAt: new Date((item.providerPublishTime || 0) * 1000).toISOString(),
      thumbnail:   item.thumbnail?.resolutions?.[0]?.url || null,
    }));

    setCache(cacheKey, news, 10 * 60 * 1000);
    res.json(news);
  } catch (err) {
    console.error('Yahoo news error:', err.message);
    res.json([]);
  }
});

// ── GET /api/yahoo/:symbol/chart — daily candles + plain-English chart read ──
router.get('/:symbol/chart', async (req, res) => {
  const symbol   = req.params.symbol.toUpperCase();
  const range    = ['1mo', '3mo', '6mo', '1y', '2y'].includes(req.query.range) ? req.query.range : '6mo';
  const cacheKey = `yf_chart_${symbol}_${range}`;
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const r   = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`Yahoo chart ${r.status}`);
    const data   = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp) return res.status(404).json({ error: 'No chart data for this symbol.' });

    const ts = result.timestamp;
    const q  = result.indicators?.quote?.[0] || {};
    const candles = ts.map((t, i) => ({
      date:   new Date(t * 1000).toISOString().slice(0, 10),
      open:   q.open?.[i]   ?? null,
      high:   q.high?.[i]   ?? null,
      low:    q.low?.[i]    ?? null,
      close:  q.close?.[i]  ?? null,
      volume: q.volume?.[i] ?? null,
    })).filter((c) => c.close != null);

    const analysis = analyzeChart(candles, symbol);
    if (!analysis) return res.status(404).json({ error: 'Not enough price history to analyze.' });

    const out = { symbol, range, points: candles.length, analysis };
    setCache(cacheKey, out, 60 * 60 * 1000); // 1h
    res.json(out);
  } catch (err) {
    console.warn('Yahoo chart error:', err.message);
    res.status(502).json({ error: 'Chart data temporarily unavailable.' });
  }
});

// ── GET /api/yahoo/market/trending — dashboard fallback ──────────────────
router.get('/market/trending', async (req, res) => {
  const cacheKey = 'yf_trending';
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Yahoo trending — no auth needed
    const url  = 'https://query1.finance.yahoo.com/v1/finance/trending/US?count=20';
    const res2 = await fetch(url, { headers: { 'User-Agent': UA } });
    const data = await res2.json();
    const symbols = (data.finance?.result?.[0]?.quotes || []).map(q => q.symbol);

    if (!symbols.length) return res.json([]);

    // Batch quote
    const qUrl  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=symbol,regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,shortName`;
    const qRes  = await fetch(qUrl, { headers: { 'User-Agent': UA } });
    const qData = await qRes.json();
    const quotes = (qData.quoteResponse?.result || []).map(q => ({
      ticker:            q.symbol,
      price:             q.regularMarketPrice?.toFixed(2),
      change_amount:     q.regularMarketChange?.toFixed(2),
      change_percentage: (q.regularMarketChangePercent >= 0 ? '+' : '') + q.regularMarketChangePercent?.toFixed(2) + '%',
      volume:            q.regularMarketVolume,
      name:              q.shortName,
    }));

    setCache(cacheKey, quotes, 5 * 60 * 1000);
    res.json(quotes);
  } catch (err) {
    console.error('Yahoo trending error:', err.message);
    res.json([]);
  }
});

export default router;
