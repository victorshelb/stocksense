/**
 * Finnhub — free tier: 60 API calls/minute (effectively unlimited for our usage)
 * Covers: quotes, news, analyst ratings, insider transactions, earnings history, key metrics
 * Sign up free at https://finnhub.io
 */
import express from 'express';
import fetch from 'node-fetch';
import { getCached, setCache } from '../utils/cache.js';
import { computeIntelligence } from '../utils/intelligence.js';
import { explainStock } from '../utils/explain.js';
import { newsSentiment } from '../utils/sentiment.js';

const router = express.Router();

const KEY  = () => process.env.FINNHUB_API_KEY;
const BASE = 'https://finnhub.io/api/v1';

async function fh(path, params = {}) {
  if (!KEY()) throw new Error('FINNHUB_API_KEY not configured in .env');
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('token', KEY());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString());
  if (res.status === 429) throw new Error('Finnhub rate limit reached — try again in a moment.');
  if (!res.ok) throw new Error(`Finnhub ${res.status}`);
  return res.json();
}

function fmtMoney(n) {
  if (n == null) return null;
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

// ── Financial statement parsing (from /stock/financials-reported, free tier) ──
// Each report has report.{ic, bs, cf} = arrays of { concept, label, value, unit }.
// Concepts use the US-GAAP taxonomy; we match on the local concept name.
function findVal(arr, candidates) {
  if (!Array.isArray(arr)) return null;
  for (const cand of candidates) {
    const hit = arr.find(x => {
      const local = String(x.concept || '').replace(/^.*[_:]/, '');
      return local.toLowerCase() === cand.toLowerCase() && typeof x.value === 'number';
    });
    if (hit) return hit.value;
  }
  return null;
}

function parseReports(reports) {
  return (reports || []).map(r => {
    const ic = r.report?.ic || [];
    const bs = r.report?.bs || [];
    const cf = r.report?.cf || [];

    const revenue   = findVal(ic, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax']);
    const grossProfit = findVal(ic, ['GrossProfit']);
    const operating = findVal(ic, ['OperatingIncomeLoss']);
    const netIncome = findVal(ic, ['NetIncomeLoss', 'ProfitLoss']);
    const eps       = findVal(ic, ['EarningsPerShareDiluted', 'EarningsPerShareBasic']);

    const totalAssets = findVal(bs, ['Assets']);
    const totalLiab   = findVal(bs, ['Liabilities', 'LiabilitiesAndStockholdersEquity']);
    const equity      = findVal(bs, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
    const cash        = findVal(bs, ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']);
    const longDebt    = findVal(bs, ['LongTermDebtNoncurrent', 'LongTermDebt']);

    const opCF  = findVal(cf, ['NetCashProvidedByUsedInOperatingActivities']);
    const invCF = findVal(cf, ['NetCashProvidedByUsedInInvestingActivities']);
    const finCF = findVal(cf, ['NetCashProvidedByUsedInFinancingActivities']);
    const capex = findVal(cf, ['PaymentsToAcquirePropertyPlantAndEquipment']);
    const fcf   = opCF != null && capex != null ? opCF - Math.abs(capex) : null;

    const pct = (a, b) => (a != null && b ? ((a / b) * 100).toFixed(1) + '%' : null);

    return {
      date: r.endDate ? String(r.endDate).slice(0, 10) : (r.year ? String(r.year) : null),
      form: r.form,
      // income
      revenue, revenueFmt: fmtMoney(revenue),
      grossProfit, grossProfitFmt: fmtMoney(grossProfit),
      operatingIncome: operating, operatingFmt: fmtMoney(operating),
      netIncome, netIncomeFmt: fmtMoney(netIncome),
      ebitda: null, ebitdaFmt: null,
      eps, epsFmt: eps != null ? eps.toFixed(2) : null,
      grossMargin: pct(grossProfit, revenue),
      netMargin: pct(netIncome, revenue),
      // balance
      totalAssets, assetsFmt: fmtMoney(totalAssets),
      totalLiabilities: totalLiab, liabFmt: fmtMoney(totalLiab),
      totalEquity: equity, equityFmt: fmtMoney(equity),
      cash, cashFmt: fmtMoney(cash),
      longTermDebt: longDebt, longTermDebtFmt: fmtMoney(longDebt),
      debtToEquity: totalLiab != null && equity ? (totalLiab / equity).toFixed(2) : null,
      // cash flow
      operatingCF: opCF, opFmt: fmtMoney(opCF),
      investingCF: invCF, invFmt: fmtMoney(invCF),
      financingCF: finCF, finFmt: fmtMoney(finCF),
      freeCashFlow: fcf, fcfFmt: fmtMoney(fcf),
      capex, capexFmt: fmtMoney(capex),
    };
  }).filter(r => r.revenue != null || r.totalAssets != null || r.operatingCF != null);
}

// ── GET /api/finnhub/:symbol — full Finnhub bundle ────────────────────────
router.get('/:symbol', async (req, res) => {
  const symbol   = req.params.symbol.toUpperCase();
  const cacheKey = `fh_${symbol}`;
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  const today     = new Date().toISOString().slice(0, 10);
  const monthAgo  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [profileR, metricsR, newsR, recR, earningsR, insiderR, finAnnualR, finQuarterR, quoteR] = await Promise.allSettled([
    fh('/stock/profile2',            { symbol }),
    fh('/stock/metric',              { symbol, metric: 'all' }),
    fh('/company-news',              { symbol, from: monthAgo, to: today }),
    fh('/stock/recommendation',      { symbol }),
    fh('/stock/earnings',            { symbol, limit: 8 }),
    fh('/stock/insider-transactions',{ symbol }),
    fh('/stock/financials-reported', { symbol, freq: 'annual' }),
    fh('/stock/financials-reported', { symbol, freq: 'quarterly' }),
    fh('/quote',                     { symbol }),  // current price → 52-week range position
  ]);

  const m = metricsR.status === 'fulfilled' ? (metricsR.value?.metric || {}) : {};
  const quote = quoteR.status === 'fulfilled' ? (quoteR.value || {}) : {};

  const annualReports    = finAnnualR.status  === 'fulfilled' ? (finAnnualR.value?.data  || []) : [];
  const quarterlyReports = finQuarterR.status === 'fulfilled' ? (finQuarterR.value?.data || []) : [];
  const annualFin    = parseReports(annualReports).slice(0, 4);
  const quarterlyFin = parseReports(quarterlyReports).slice(0, 4);

  const result = {
    symbol,
    profile:  profileR.status === 'fulfilled' ? profileR.value  : null,

    // Key metrics from Finnhub (richer than Alpha Vantage overview)
    metrics: {
      marketCap:       fmtMoney((m.marketCapitalization || 0) * 1e6),
      peRatio:         m.peBasicExclExtraTTM?.toFixed(2)   || null,
      pbRatio:         m.pbQuarterly?.toFixed(2)            || null,
      beta:            m.beta?.toFixed(2)                   || null,
      high52w:         m['52WeekHigh']                      || null,
      low52w:          m['52WeekLow']                       || null,
      high52wDate:     m['52WeekHighDate']                  || null,
      low52wDate:      m['52WeekLowDate']                   || null,
      divYield:        m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual.toFixed(2) + '%' : null,
      netMarginTTM:    m.netProfitMarginTTM != null ? m.netProfitMarginTTM.toFixed(1) + '%' : null,
      grossMarginTTM:  m.grossMarginTTM != null ? m.grossMarginTTM.toFixed(1) + '%' : null,
      roeTTM:          m.roeTTM != null ? m.roeTTM.toFixed(1) + '%' : null,
      epsBasicTTM:     m.epsBasicExclExtraTTM?.toFixed(2)  || null,
      revGrowth5y:     m['revenueGrowth5Y']?.toFixed(1)    || null,
      currentRatio:    m.currentRatioQuarterly?.toFixed(2)  || null,
    },

    // News (last 30 days, up to 15 articles)
    news: (newsR.status === 'fulfilled' ? newsR.value || [] : []).slice(0, 15).map(n => ({
      headline:    n.headline,
      summary:     n.summary,
      source:      n.source,
      url:         n.url,
      publishedAt: n.datetime ? new Date(n.datetime * 1000).toISOString() : null,
      image:       n.image || null,
      category:    n.category,
    })),

    // Analyst consensus (most recent period first)
    analystRatings: (recR.status === 'fulfilled' ? recR.value || [] : []).slice(0, 3).map(r => ({
      period:      r.period,
      strongBuy:   r.strongBuy  || 0,
      buy:         r.buy        || 0,
      hold:        r.hold       || 0,
      sell:        r.sell       || 0,
      strongSell:  r.strongSell || 0,
      total:       (r.strongBuy || 0) + (r.buy || 0) + (r.hold || 0) + (r.sell || 0) + (r.strongSell || 0),
    })),

    // Earnings history — beat/miss track record
    earningsHistory: (earningsR.status === 'fulfilled' ? earningsR.value || [] : []).map(e => ({
      period:    e.period,
      actual:    e.actual,
      estimate:  e.estimate,
      surprise:  e.surprise,
      surprisePct: e.surprisePercent,
      beat:      e.surprise != null ? e.surprise > 0 : null,
    })),

    // Insider transactions — who's buying/selling shares
    insiderTrades: (insiderR.status === 'fulfilled' ? (insiderR.value?.data || []) : []).slice(0, 12).map(t => ({
      name:            t.name,
      transactionDate: t.transactionDate,
      filingDate:      t.filingDate,
      shares:          t.change,
      price:           t.transactionPrice,
      type:            t.transactionCode === 'S' ? 'SELL' : t.transactionCode === 'P' ? 'BUY' : t.transactionCode,
      value:           t.change && t.transactionPrice ? fmtMoney(Math.abs(t.change * t.transactionPrice)) : null,
    })),

    // Full financial statements (parsed from free financials-reported endpoint)
    financials: {
      incomeStatement: { annual: annualFin, quarterly: quarterlyFin },
      balanceSheet:    { annual: annualFin, quarterly: quarterlyFin },
      cashFlow:        { annual: annualFin, quarterly: quarterlyFin },
    },

    // Valuation snapshot (for the AI + metrics panel)
    valuation: {
      peRatio:      m.peBasicExclExtraTTM?.toFixed(2)  || null,
      pbRatio:      m.pbQuarterly?.toFixed(2)           || null,
      psRatio:      m.psTTM?.toFixed(2)                 || null,
      roe:          m.roeTTM != null ? m.roeTTM.toFixed(1) + '%' : null,
      roa:          m.roaTTM != null ? m.roaTTM.toFixed(1) + '%' : null,
      currentRatio: m.currentRatioQuarterly?.toFixed(2) || null,
      debtToEquity: m['totalDebt/totalEquityQuarterly']?.toFixed(2) || null,
      grossMargin:  m.grossMarginTTM != null ? m.grossMarginTTM.toFixed(1) + '%' : null,
      netMargin:    m.netProfitMarginTTM != null ? m.netProfitMarginTTM.toFixed(1) + '%' : null,
    },

    // Dividend snapshot
    dividend: {
      hasDividend:  !!(m.dividendYieldIndicatedAnnual || m.dividendPerShareAnnual),
      perShare:     m.dividendPerShareAnnual?.toFixed(2) || null,
      yield:        m.dividendYieldIndicatedAnnual != null ? m.dividendYieldIndicatedAnnual.toFixed(2) + '%' : null,
      growthRate:   m.dividendGrowthRate5Y?.toFixed(1) || null,
    },
  };

  // News sentiment — FinBERT (real financial NLP model) when available, else
  // the weighted finance lexicon. Non-blocking: capped by a timeout internally.
  const sentiment = await newsSentiment(result.news);

  // Local quant model — health score, pillars, trend, weather. No external AI.
  result.intelligence = computeIntelligence({
    metric: m,
    quote,
    analystRatings: result.analystRatings,
    news: result.news,
    earnings: result.earningsHistory,
    symbol,
    newsSentimentScore: sentiment.score,
  });
  result.intelligence.sentimentModel = sentiment.model; // 'finbert' | 'lexicon' | 'none'

  // Local explanation engine — full plain-English analysis (the Claude replacement).
  result.explanation = explainStock({
    symbol,
    profile: result.profile,
    metric: m,
    quote,
    intelligence: result.intelligence,
    news: result.news,
    analystRatings: result.analystRatings,
    earnings: result.earningsHistory,
  });

  setCache(cacheKey, result, 15 * 60 * 1000); // 15 min cache
  res.json(result);
});

export default router;
