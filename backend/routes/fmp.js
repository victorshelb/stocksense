/**
 * Financial Modeling Prep (FMP) — free tier: 250 req/day
 * Covers: income statements, balance sheets, cash flows, dividends, key ratios
 * Sign up free at https://financialmodelingprep.com
 */
import express from 'express';
import fetch from 'node-fetch';
import { getCached, setCache } from '../utils/cache.js';

const router = express.Router();

const KEY  = () => process.env.FMP_API_KEY;
const BASE = 'https://financialmodelingprep.com/api/v3';

async function fmp(path) {
  if (!KEY()) throw new Error('FMP_API_KEY not configured in .env');
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE}${path}${sep}apikey=${KEY()}`);
  if (res.status === 429) throw new Error('FMP rate limit reached.');
  if (!res.ok) throw new Error(`FMP ${res.status}`);
  const data = await res.json();
  // FMP returns error objects with an "Error Message" key
  if (data?.['Error Message']) throw new Error(data['Error Message']);
  return data;
}

function fmt(n) {
  if (n == null) return null;
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Number(n).toFixed(2)}`;
}

function parseIncome(arr) {
  return (arr || []).map(s => ({
    date:            s.date,
    revenue:         s.revenue,
    revenueFmt:      fmt(s.revenue),
    grossProfit:     s.grossProfit,
    grossProfitFmt:  fmt(s.grossProfit),
    operatingIncome: s.operatingIncome,
    operatingFmt:    fmt(s.operatingIncome),
    netIncome:       s.netIncome,
    netIncomeFmt:    fmt(s.netIncome),
    ebitda:          s.ebitda,
    ebitdaFmt:       fmt(s.ebitda),
    eps:             s.eps,
    epsFmt:          s.eps?.toFixed(2),
    grossMargin:     s.grossProfitRatio   != null ? (s.grossProfitRatio   * 100).toFixed(1) + '%' : null,
    netMargin:       s.netIncomeRatio     != null ? (s.netIncomeRatio     * 100).toFixed(1) + '%' : null,
    operatingMargin: s.operatingIncomeRatio != null ? (s.operatingIncomeRatio * 100).toFixed(1) + '%' : null,
    rdExpenses:      s.researchAndDevelopmentExpenses,
    rdFmt:           fmt(s.researchAndDevelopmentExpenses),
  }));
}

function parseBalance(arr) {
  return (arr || []).map(s => ({
    date:             s.date,
    totalAssets:      s.totalAssets,
    assetsFmt:        fmt(s.totalAssets),
    totalLiabilities: s.totalLiabilities,
    liabFmt:          fmt(s.totalLiabilities),
    totalEquity:      s.totalStockholdersEquity,
    equityFmt:        fmt(s.totalStockholdersEquity),
    cash:             s.cashAndCashEquivalents,
    cashFmt:          fmt(s.cashAndCashEquivalents),
    shortTermDebt:    s.shortTermDebt,
    longTermDebt:     s.longTermDebt,
    longTermDebtFmt:  fmt(s.longTermDebt),
    debtToEquity:     s.totalLiabilities && s.totalStockholdersEquity
      ? (s.totalLiabilities / s.totalStockholdersEquity).toFixed(2) : null,
    goodwill:         s.goodwill,
    goodwillFmt:      fmt(s.goodwill),
  }));
}

function parseCashFlow(arr) {
  return (arr || []).map(s => ({
    date:        s.date,
    operatingCF: s.operatingCashFlow,
    opFmt:       fmt(s.operatingCashFlow),
    investingCF: s.investingCashFlow,
    invFmt:      fmt(s.investingCashFlow),
    financingCF: s.financingCashFlow,
    finFmt:      fmt(s.financingCashFlow),
    freeCashFlow:s.freeCashFlow,
    fcfFmt:      fmt(s.freeCashFlow),
    capex:       s.capitalExpenditure,
    capexFmt:    fmt(s.capitalExpenditure),
    dividendsPaid: s.commonDividendsPaid,
    dividendsFmt:  fmt(s.commonDividendsPaid),
  }));
}

// ── GET /api/fmp/:symbol — full financial statements ──────────────────────
router.get('/:symbol', async (req, res) => {
  const symbol   = req.params.symbol.toUpperCase();
  const cacheKey = `fmp_${symbol}`;
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  const [ai, qi, ab, qb, ac, qc, km, div] = await Promise.allSettled([
    fmp(`/income-statement/${symbol}?limit=4`),                          // annual income
    fmp(`/income-statement/${symbol}?period=quarter&limit=4`),           // quarterly income
    fmp(`/balance-sheet-statement/${symbol}?limit=4`),                   // annual balance
    fmp(`/balance-sheet-statement/${symbol}?period=quarter&limit=4`),    // quarterly balance
    fmp(`/cash-flow-statement/${symbol}?limit=4`),                       // annual cash flow
    fmp(`/cash-flow-statement/${symbol}?period=quarter&limit=4`),        // quarterly cash flow
    fmp(`/key-metrics/${symbol}?limit=1`),                               // key valuation metrics
    fmp(`/historical-price-full/stock_dividend/${symbol}?limit=8`),      // dividend history
  ]);

  const keyM = (km.status === 'fulfilled' ? km.value?.[0] : null) || {};
  const divHistory = div.status === 'fulfilled' ? (div.value?.historical || []).slice(0, 8) : [];

  const result = {
    symbol,
    incomeStatement: {
      annual:    parseIncome(ai.status === 'fulfilled' ? ai.value : []),
      quarterly: parseIncome(qi.status === 'fulfilled' ? qi.value : []),
    },
    balanceSheet: {
      annual:    parseBalance(ab.status === 'fulfilled' ? ab.value : []),
      quarterly: parseBalance(qb.status === 'fulfilled' ? qb.value : []),
    },
    cashFlow: {
      annual:    parseCashFlow(ac.status === 'fulfilled' ? ac.value : []),
      quarterly: parseCashFlow(qc.status === 'fulfilled' ? qc.value : []),
    },
    // Valuation ratios (most recent)
    valuation: {
      peRatio:          keyM.peRatio?.toFixed(2)              || null,
      pbRatio:          keyM.pbRatio?.toFixed(2)              || null,
      psRatio:          keyM.priceToSalesRatio?.toFixed(2)    || null,
      evEbitda:         keyM.evToEbitda?.toFixed(2)           || null,
      debtToEquity:     keyM.debtToEquity?.toFixed(2)         || null,
      currentRatio:     keyM.currentRatio?.toFixed(2)         || null,
      roe:              keyM.roe != null ? (keyM.roe * 100).toFixed(1) + '%' : null,
      roa:              keyM.roa != null ? (keyM.roa * 100).toFixed(1) + '%' : null,
      freeCashFlowYield:keyM.freeCashFlowYield != null ? (keyM.freeCashFlowYield * 100).toFixed(2) + '%' : null,
      dividendYield:    keyM.dividendYield != null ? (keyM.dividendYield * 100).toFixed(2) + '%' : null,
      enterpriseValue:  fmt(keyM.enterpriseValue),
    },
    // Dividend history
    dividends: divHistory.map(d => ({
      date:              d.date,
      label:             d.label,
      adjDividend:       d.adjDividend,
      dividend:          d.dividend,
      recordDate:        d.recordDate,
      paymentDate:       d.paymentDate,
      declarationDate:   d.declarationDate,
    })),
  };

  setCache(cacheKey, result, 60 * 60 * 1000); // 1h cache — financial statements don't change hourly
  res.json(result);
});

export default router;
