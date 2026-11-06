import express from 'express';
import fetch from 'node-fetch';
import { getCached, setCache } from '../utils/cache.js';

const router = express.Router();
const AV = () => process.env.ALPHA_VANTAGE_API_KEY;

// GET /api/stock/:symbol/quote
router.get('/:symbol/quote', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `quote_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Information) return res.status(429).json({ error: 'API rate limit reached.' });

    const q = data['Global Quote'];
    if (!q || !q['01. symbol']) return res.status(404).json({ error: 'Stock not found.' });

    const result = {
      symbol: q['01. symbol'],
      price: parseFloat(q['05. price']),
      open: parseFloat(q['02. open']),
      high: parseFloat(q['03. high']),
      low: parseFloat(q['04. low']),
      volume: parseInt(q['06. volume']),
      previousClose: parseFloat(q['08. previous close']),
      change: parseFloat(q['09. change']),
      changePercent: q['10. change percent'],
      tradingDay: q['07. latest trading day'],
    };

    setCache(cacheKey, result, 2 * 60 * 1000); // cache 2 min
    res.json(result);
  } catch (err) {
    console.error('Quote error:', err);
    res.status(500).json({ error: 'Failed to fetch stock quote.' });
  }
});

// GET /api/stock/:symbol/overview — company fundamentals
router.get('/:symbol/overview', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `overview_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${AV()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Information) return res.status(429).json({ error: 'API rate limit reached.' });
    if (!data.Symbol) return res.status(404).json({ error: 'Company not found.' });

    setCache(cacheKey, data, 60 * 60 * 1000); // cache 1 hour
    res.json(data);
  } catch (err) {
    console.error('Overview error:', err);
    res.status(500).json({ error: 'Failed to fetch company overview.' });
  }
});

// GET /api/stock/:symbol/news — recent news with sentiment
router.get('/:symbol/news', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `news_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${symbol}&limit=10&apikey=${AV()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Information) return res.status(429).json({ error: 'API rate limit reached.' });

    const articles = (data.feed || []).slice(0, 8).map((item) => ({
      title: item.title,
      summary: item.summary,
      source: item.source,
      url: item.url,
      publishedAt: item.time_published,
      sentiment: item.ticker_sentiment?.[0]?.ticker_sentiment_label || 'Neutral',
      sentimentScore: parseFloat(item.ticker_sentiment?.[0]?.ticker_sentiment_score || 0),
    }));

    setCache(cacheKey, articles, 15 * 60 * 1000); // cache 15 min
    res.json(articles);
  } catch (err) {
    console.error('News error:', err);
    res.status(500).json({ error: 'Failed to fetch news.' });
  }
});

// GET /api/stock/:symbol/earnings — quarterly + annual EPS history
router.get('/:symbol/earnings', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `earnings_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${AV()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.Information) return res.status(429).json({ error: 'API rate limit reached.' });
    if (!data.quarterlyEarnings) return res.status(404).json({ error: 'No earnings data.' });

    const quarterly = (data.quarterlyEarnings || []).slice(0, 8).map(q => ({
      date: q.fiscalDateEnding,
      reported: isNaN(parseFloat(q.reportedEPS)) ? null : parseFloat(q.reportedEPS),
      estimated: isNaN(parseFloat(q.estimatedEPS)) ? null : parseFloat(q.estimatedEPS),
      surprise: isNaN(parseFloat(q.surprise)) ? null : parseFloat(q.surprise),
      surprisePercent: isNaN(parseFloat(q.surprisePercentage)) ? null : parseFloat(q.surprisePercentage),
    }));

    const annual = (data.annualEarnings || []).slice(0, 5).map(a => ({
      year: a.fiscalDateEnding,
      reported: isNaN(parseFloat(a.reportedEPS)) ? null : parseFloat(a.reportedEPS),
    }));

    const result = { symbol, quarterly, annual };
    setCache(cacheKey, result, 6 * 60 * 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('Earnings error:', err);
    res.status(500).json({ error: 'Failed to fetch earnings.' });
  }
});

export default router;
