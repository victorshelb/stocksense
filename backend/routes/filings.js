import express from 'express';
import fetch from 'node-fetch';
import { getCached, setCache } from '../utils/cache.js';

const router = express.Router();
const SEC = { headers: { 'User-Agent': 'StockSense contact@stocksense.app' } };

// In-process CIK map — loaded from SEC once per server run
let cikMap = null;

async function getCIKMap() {
  if (cikMap) return cikMap;
  const cached = getCached('__cik_map');
  if (cached) { cikMap = cached; return cikMap; }

  const res = await fetch('https://www.sec.gov/files/company_tickers.json', SEC);
  const data = await res.json();
  cikMap = {};
  Object.values(data).forEach(item => {
    cikMap[item.ticker.toUpperCase()] = {
      cik: String(item.cik_str).padStart(10, '0'),
      cikRaw: item.cik_str,
      name: item.title,
    };
  });
  setCache('__cik_map', cikMap, 24 * 60 * 60 * 1000);
  return cikMap;
}

const FORM_LABELS = {
  '10-K': 'Annual Report',
  '10-Q': 'Quarterly Report',
  '8-K': 'Current Report (Material Event)',
};

// GET /api/filings/:symbol — list of recent SEC filings
router.get('/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `filings_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const map = await getCIKMap();
    const company = map[symbol];

    if (!company) {
      return res.status(404).json({
        error: `No SEC filings found for ${symbol}.`,
        edgarUrl: `https://efts.sec.gov/LATEST/search-index?q=%22${symbol}%22&forms=10-K`,
      });
    }

    const { cik, cikRaw, name } = company;
    const subRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, SEC);
    const sub = await subRes.json();

    const recent = sub.filings?.recent || {};
    const forms = recent.form || [];
    const accessions = recent.accessionNumber || [];
    const dates = recent.filingDate || [];
    const docs = recent.primaryDocument || [];
    const descs = recent.primaryDocDescription || [];

    const TARGET = ['10-K', '10-Q', '8-K'];
    const filings = [];

    for (let i = 0; i < forms.length && filings.length < 12; i++) {
      if (!TARGET.includes(forms[i])) continue;
      const acc = accessions[i];
      const accNoDash = acc?.replace(/-/g, '');
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikRaw}/${accNoDash}/${docs[i]}`;

      filings.push({
        form: forms[i],
        label: FORM_LABELS[forms[i]] || forms[i],
        date: dates[i],
        accession: acc,
        description: descs[i] || FORM_LABELS[forms[i]] || '',
        docUrl,
      });
    }

    const result = {
      symbol, name, cik,
      filings,
      edgarUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&dateb=&owner=include&count=10`,
    };

    setCache(cacheKey, result, 60 * 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('Filings error:', err);
    res.status(500).json({ error: 'Failed to fetch SEC filings.' });
  }
});

// GET /api/filings/:symbol/text?url=... — proxy + extract text from an EDGAR filing
router.get('/:symbol/text', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://www.sec.gov/')) {
    return res.status(400).json({ error: 'Invalid filing URL.' });
  }

  const cacheKey = `filing_text_${Buffer.from(url).toString('base64').slice(0, 60)}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const response = await fetch(url, SEC);
    const html = await response.text();

    // Strip HTML to plain text
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s{3,}/g, '\n\n')
      .trim();

    // Extract key 10-K/10-Q sections
    const sections = {};
    const sectionPatterns = [
      { key: 'business',  label: 'Business Overview',           regex: /item\s+1[.\s]+business\b/i },
      { key: 'risks',     label: 'Risk Factors',                regex: /item\s+1a[.\s]+risk\s+factors/i },
      { key: 'mda',       label: "Management's Discussion & Analysis", regex: /item\s+7[.\s]+management.{0,60}discussion/i },
      { key: 'financial', label: 'Financial Results',           regex: /item\s+8[.\s]+financial\s+statement/i },
    ];

    for (const { key, label, regex } of sectionPatterns) {
      const idx = text.search(regex);
      if (idx !== -1) {
        sections[key] = { label, text: text.slice(idx, idx + 10000).trim() };
      }
    }

    // If no sections found (e.g. 8-K), just use the first 15K chars
    if (Object.keys(sections).length === 0) {
      sections.full = { label: 'Filing Content', text: text.slice(0, 15000) };
    }

    const result = { sections, charCount: text.length };
    setCache(cacheKey, result, 6 * 60 * 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('Filing text error:', err);
    res.status(500).json({ error: 'Failed to fetch filing content.' });
  }
});

export default router;
