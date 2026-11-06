import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { getCached, setCache } from '../utils/cache.js';
import { requireAuth } from '../middleware/auth.js';
import { logSecurity } from '../utils/securityLog.js';

const router = express.Router();

// Log every AI invocation — the metered, paid surface. Now auth-gated
// (requireAuth), so the SOC view keys on per-user / per-IP call volume.
function logAI(req, endpoint, extra = {}) {
  logSecurity('ai.invoke', {
    req,
    user: req.user ? { id: req.user.id, email: req.user.email } : undefined,
    endpoint,
    authenticated: !!req.user,
    cached: false,
    ...extra,
  });
}

const formatNum = (n) => {
  if (!n || n === 'None') return 'N/A';
  const num = parseFloat(n);
  if (isNaN(num)) return n;
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (Math.abs(num) >= 1e9)  return `$${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6)  return `$${(num / 1e6).toFixed(2)}M`;
  return n;
};

const stripJSON = (text) =>
  text.trim().replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/\n?```$/, '').trim();

// POST /api/ai/summarize
// Body: { symbol, overview, news, earnings, quote, movementContext, finnhub, fmp }
router.post('/summarize', requireAuth, async (req, res) => {
  const { symbol, overview, news, earnings, quote, movementContext, finnhub, fmp } = req.body;
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });

  const hasData = !!(overview?.Description || overview?.Sector);
  const isGainer = movementContext?.from === 'gainers';
  const isLoser  = movementContext?.from === 'losers';
  const changeToday = movementContext?.changeToday || '';

  // Cache key includes movement context so gainers/losers get a focused analysis
  const cacheKey = `ai_summary_v3_${symbol}_${movementContext?.from || 'none'}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  logAI(req, 'summarize', { symbol: String(symbol).slice(0, 12) });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── Build context blocks ──────────────────────────────────────────────

    // Combine Finnhub news (richer) + Alpha Vantage news
    const finnhubNewsItems = (finnhub?.news || []).slice(0, 5).map(n =>
      `- [Finnhub] ${n.headline}: ${(n.summary || '').slice(0, 200)}`
    );
    const avNewsItems = (news || []).slice(0, 4).map(n =>
      `- [${n.sentiment || 'Neutral'}] ${n.title}: ${(n.summary || '').slice(0, 200)}`
    );
    const allNews = [...finnhubNewsItems, ...avNewsItems];
    const newsText = allNews.length > 0 ? allNews.join('\n') : 'No recent news found.';

    const hi  = parseFloat(overview?.['52WeekHigh']);
    const lo  = parseFloat(overview?.['52WeekLow']);
    const cur = parseFloat(quote?.price);
    let rangeContext = 'Price range data not available.';
    if (!isNaN(hi) && !isNaN(lo) && !isNaN(cur) && hi !== lo) {
      const pct = (((cur - lo) / (hi - lo)) * 100).toFixed(0);
      rangeContext = `Current price $${cur.toFixed(2)} sits ${pct}% of the way between its 52-week low ($${lo.toFixed(2)}) and high ($${hi.toFixed(2)}).`;
    }

    let earningsContext = 'No earnings history available.';
    if (earnings?.quarterly?.length > 0) {
      earningsContext = 'Recent quarterly EPS:\n' + earnings.quarterly.slice(0, 4).map(q => {
        const beat = q.surprise > 0 ? 'BEAT' : q.surprise < 0 ? 'MISSED' : 'MET';
        return `  ${q.date}: EPS $${q.reported?.toFixed(2) ?? 'N/A'} — ${beat} estimates by ${q.surprisePercent?.toFixed(1) ?? '?'}%`;
      }).join('\n');
    }

    // ── Determine the right prompt based on what data we have ─────────────

    let movementBlock = '';
    if (isGainer && changeToday) {
      movementBlock = `
⚠️ IMPORTANT: ${symbol} is one of TODAY'S TOP GAINERS — it is up ${changeToday} TODAY.
Your PRIMARY job is to explain WHY this stock is surging today. Dig into the news, any filings, and market context to find the most likely reason. If the reason is unclear, say so honestly.`;
    } else if (isLoser && changeToday) {
      movementBlock = `
⚠️ IMPORTANT: ${symbol} is one of TODAY'S TOP LOSERS — it is down ${changeToday} TODAY.
Your PRIMARY job is to explain WHY this stock is falling today. Look at the news, context, and any filings to find the most likely cause. If the reason is unclear, say so honestly.`;
    }

    // ── Enrich context from Finnhub + FMP ────────────────────────────────
    let analystBlock = '';
    if (finnhub?.analystRatings?.[0]) {
      const r = finnhub.analystRatings[0];
      const total = r.total || 1;
      analystBlock = `ANALYST CONSENSUS (${r.period}): ${r.strongBuy + r.buy} Buy | ${r.hold} Hold | ${r.sell + r.strongSell} Sell (out of ${total} analysts)`;
    }

    let insiderBlock = '';
    if (finnhub?.insiderTrades?.length > 0) {
      const buys  = finnhub.insiderTrades.filter(t => t.type === 'BUY').length;
      const sells = finnhub.insiderTrades.filter(t => t.type === 'SELL').length;
      insiderBlock = `INSIDER TRADING (last 30 days): ${buys} insider buy transactions, ${sells} insider sell transactions.`;
    }

    let fmpBlock = '';
    if (fmp?.incomeStatement?.annual?.[0]) {
      const latest = fmp.incomeStatement.annual[0];
      const prev   = fmp.incomeStatement.annual[1];
      const revenueGrowth = latest.revenue && prev?.revenue
        ? (((latest.revenue - prev.revenue) / Math.abs(prev.revenue)) * 100).toFixed(1) + '%'
        : 'N/A';
      fmpBlock = `FINANCIAL PERFORMANCE (most recent annual):
- Revenue: ${latest.revenueFmt} (${revenueGrowth} YoY growth)
- Net Income: ${latest.netIncomeFmt}
- Gross Margin: ${latest.grossMargin || 'N/A'}
- Net Margin: ${latest.netMargin || 'N/A'}
- Operating Income: ${latest.operatingFmt}`;
    }

    if (fmp?.valuation) {
      const v = fmp.valuation;
      fmpBlock += `\nVALUATION METRICS: P/E ${v.peRatio || 'N/A'} | P/S ${v.psRatio || 'N/A'} | EV/EBITDA ${v.evEbitda || 'N/A'} | ROE ${v.roe || 'N/A'}`;
    }

    let companyBlock = '';
    if (hasData || finnhub?.profile?.name) {
      const profile = finnhub?.profile;
      companyBlock = `
COMPANY INFO:
- What they do: ${(overview?.Description || profile?.finnhubIndustry || '').slice(0, 600)}
- Sector: ${overview?.Sector || profile?.finnhubIndustry || 'N/A'}
- Country: ${profile?.country || 'US'}
- Market Cap: ${finnhub?.metrics?.marketCap || formatNum(overview?.MarketCapitalization)}
- Beta: ${finnhub?.metrics?.beta || overview?.Beta || 'N/A'} (1 = moves same as market)
${fmpBlock}
${analystBlock}
${insiderBlock}`;
    } else {
      // Detect likely security type from ticker
      const ticker = symbol.toUpperCase();
      let secType = 'stock';
      if (/W$/.test(ticker)) secType = 'warrant (gives the right to buy shares at a set price — more speculative than regular stocks)';
      else if (/U$/.test(ticker)) secType = 'unit (a bundle of shares and warrants — common in SPACs)';
      else if (/R$/.test(ticker)) secType = 'rights offering (lets existing shareholders buy more shares at a discount)';
      else if (/\+$/.test(ticker)) secType = 'preferred stock';

      companyBlock = `
NOTE: Limited fundamental data is available for ${symbol}. It appears to be a ${secType}.
No revenue, earnings, or standard financial metrics are available for this security.
This significantly limits the analysis — treat it as higher risk due to information scarcity.`;
    }

    const companyName = overview?.Name || finnhub?.profile?.name || symbol;

    const prompt = `You are a clear, honest financial analyst explaining stocks in plain English for everyday people who have never invested before. Avoid jargon. If you use a financial term, briefly explain it in parentheses.

RESEARCH STEP — you have a web_search tool. Do 2 to 3 targeted searches (NO MORE than 3) to find the LATEST news, events, earnings, and analyst commentary about ${companyName} (${symbol}) — especially anything explaining its recent price movement. Use what you find to make the analysis current and specific. If searches are rate-limited or unhelpful, just use the data provided below. After researching, output ONLY the JSON object.
${movementBlock}

SYMBOL: ${symbol}
${companyBlock}

PRICE POSITION:
${rangeContext}

EARNINGS HISTORY:
${earningsContext}

RECENT NEWS (with sentiment labels):
${newsText}

When done researching, respond with a JSON object ONLY — no markdown fences, no text after the JSON. Be specific and honest — if you don't know why a stock moved, say so. Don't make things up. Prefer concrete facts (dates, numbers, named events) from your web research.

{
  "plain_summary": "2–3 sentences explaining what this company/security does and its current situation in plain language, informed by your web research. If data is very limited, be upfront about that.",
  "why_moving_today": "${(isGainer || isLoser) ? 'REQUIRED: 2–3 sentences specifically explaining WHY this stock moved so much today, citing the specific event/news you found. Be specific. If no clear reason found, say the reason is unclear and what factors might be at play.' : 'null — not a top mover today'}",
  "latest_developments": ["a recent, specific development you found from the web (include a rough date if known)", "another recent development", "another"],
  "price_context": "1 sentence on where the stock sits in its yearly range, in plain English. Say N/A if no data.",
  "earnings_trend": "1 sentence on the recent earnings beat/miss pattern. Say Not enough data if unavailable.",
  "why_up": ["specific reason 1", "specific reason 2", "specific reason 3"],
  "why_down": ["specific risk/reason 1", "specific risk/reason 2", "specific risk/reason 3"],
  "recommendation": "BULLISH" | "NEUTRAL" | "BEARISH",
  "recommendation_reason": "One honest sentence. If data is too limited to make a call, say that.",
  "risk_level": "LOW" | "MEDIUM" | "HIGH" | "VERY HIGH",
  "risk_reason": "One sentence explaining the risk level. Warrants, SPACs, and low-data securities should be HIGH or VERY HIGH."
}`;

    // Pull every text block out of a (possibly tool-using) response and find the JSON object
    const extractJSON = (msg) => {
      const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const cleaned = stripJSON(text);
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON object in model output');
      return JSON.parse(cleaned.slice(start, end + 1));
    };

    let parsed;
    let webResearched = false;
    try {
      // Primary path: live web research via the web_search tool
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 2500,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        messages: [{ role: 'user', content: prompt }],
      });
      parsed = extractJSON(message);
      webResearched = (message.content || []).some(
        b => b.type === 'web_search_tool_result' || b.type === 'server_tool_use'
      );
    } catch (webErr) {
      // Fallback: data-only analysis (no tools) — guarantees the page always gets an answer
      console.warn('Web-search analysis failed, falling back to data-only:', webErr.message);
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1800,
        messages: [{ role: 'user', content: prompt.replace(/RESEARCH STEP[\s\S]*?output ONLY the JSON object\.\n/, '') }],
      });
      parsed = extractJSON(message);
    }
    parsed.web_researched = webResearched;

    // Longer caches = far fewer paid calls. Movers still refresh a bit quicker.
    const ttl = (isGainer || isLoser) ? 2 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
    setCache(cacheKey, parsed, ttl);
    res.json(parsed);
  } catch (err) {
    console.error('AI summarize error:', err);
    res.status(500).json({ error: 'Failed to generate AI summary. Please try again.' });
  }
});

// POST /api/ai/analyze-financials
// Body: { symbol, companyName, section, annualData, quarterlyData, metrics }
router.post('/analyze-financials', requireAuth, async (req, res) => {
  const { symbol, companyName, section, annualData, quarterlyData, metrics } = req.body;
  if (!symbol || !section) return res.status(400).json({ error: 'symbol and section are required' });

  const cacheKey = `ai_fin_${symbol}_${section}`;
  const cached   = getCached(cacheKey);
  if (cached) return res.json(cached);

  logAI(req, 'analyze-financials', { symbol: String(symbol).slice(0, 12), section: String(section).slice(0, 40) });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const annualRows   = (annualData  || []).map(r => JSON.stringify(r)).join('\n');
    const quarterlyRows= (quarterlyData||[]).map(r => JSON.stringify(r)).join('\n');
    const metricsStr   = metrics ? JSON.stringify(metrics, null, 2) : 'N/A';

    const sectionGuide = {
      incomeStatement: 'revenue growth, profit margins, earnings trends, and operating leverage',
      balanceSheet:    'financial strength, debt levels, cash position, and solvency',
      cashFlow:        'cash generation, capital spending, free cash flow, and financial sustainability',
      dividend:        'dividend sustainability, yield attractiveness, and payout history',
      earnings:        'upcoming earnings expectations, analyst estimates, and growth outlook',
    }[section] || 'key financial metrics';

    const prompt = `You are a financial analyst explaining ${section.replace(/([A-Z])/g, ' $1')} data for ${companyName || symbol} to someone who has never read a financial report. Focus on ${sectionGuide}.

ANNUAL DATA (most recent 4 years):
${annualRows || 'No annual data available.'}

QUARTERLY DATA (most recent 4 quarters):
${quarterlyRows || 'No quarterly data available.'}

ADDITIONAL METRICS:
${metricsStr}

Provide a response as JSON ONLY (no markdown):
{
  "summary": "3-4 sentences in plain English explaining what this data tells us about the company's financial health. Use everyday language.",
  "trend": "IMPROVING" | "DECLINING" | "STABLE" | "MIXED",
  "trendExplanation": "1-2 sentences explaining why you chose that trend label, referencing actual numbers.",
  "highlights": [
    {
      "metric": "name of the metric",
      "value": "the key value or range",
      "what_it_means": "plain English explanation of why this number matters",
      "sentiment": "positive" | "negative" | "neutral"
    }
  ],
  "stockImpact": "2-3 sentences on how this financial data might affect the stock price — what would make it go up or down.",
  "opportunities": ["specific opportunity based on the data"],
  "risks": ["specific risk based on the data"],
  "reference_note": "One sentence on where investors can verify this data themselves (e.g. company investor relations page, SEC filings)."
}`;

    const message = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1500,
      messages:   [{ role: 'user', content: prompt }],
    });

    const parsed = JSON.parse(stripJSON(message.content[0].text));
    setCache(cacheKey, parsed, 24 * 60 * 60 * 1000); // 24h cache — statements rarely change
    res.json(parsed);
  } catch (err) {
    console.error('AI financials error:', err);
    res.status(500).json({ error: 'Failed to analyze financial data.' });
  }
});

// POST /api/ai/highlight
// Body: { symbol, filingType, sections, filingDate }
router.post('/highlight', requireAuth, async (req, res) => {
  const { symbol, filingType, sections, filingDate } = req.body;
  if (!symbol || !sections) return res.status(400).json({ error: 'symbol and sections are required' });

  const cacheKey = `ai_highlight_${symbol}_${filingDate}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  logAI(req, 'highlight', { symbol: String(symbol).slice(0, 12), filingType: String(filingType || '').slice(0, 12) });

  const sectionText = Object.values(sections)
    .map((s) => `=== ${s.label} ===\n${s.text}`)
    .join('\n\n')
    .slice(0, 20000);

  if (sectionText.length < 100) {
    return res.status(400).json({ error: 'Filing content too short to analyze.' });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `You are analyzing a ${filingType} SEC filing for ${symbol} filed on ${filingDate}.

Find 6–8 passages that most directly reveal how the company is doing financially — the kind of things that move a stock price up or down. Write for someone who has never read a financial report.

For each passage:
1. Copy the EXACT quote from the document (under 180 words)
2. Write a plain-English interpretation (2–3 sentences)
3. Rate it: "positive" (good for stock), "negative" (bad), or "neutral"
4. Name the section (e.g. Revenue Growth, Risk Factors, Guidance, Cost Cuts, AI Investment)
5. Give a short 4–6 word impact label (e.g. "Revenue up 12% YoY", "China risk flagged")

Filing content:
${sectionText}

Respond with JSON ONLY — no markdown:
{
  "highlights": [
    {
      "id": 0,
      "quote": "exact text from the filing",
      "interpretation": "plain English explanation — what this means for the stock price",
      "sentiment": "positive" | "negative" | "neutral",
      "section": "section name",
      "impact": "short impact label"
    }
  ],
  "overall_takeaway": "3–4 sentences summarising the key takeaways in plain English — what it means for someone deciding whether to buy, hold, or sell."
}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const parsed = JSON.parse(stripJSON(message.content[0].text));
    setCache(cacheKey, parsed, 24 * 60 * 60 * 1000); // filings never change once published
    res.json(parsed);
  } catch (err) {
    console.error('AI highlight error:', err);
    res.status(500).json({ error: 'Failed to analyze filing.' });
  }
});

export default router;
