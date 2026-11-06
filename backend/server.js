import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import marketRoutes    from './routes/market.js';
import stockRoutes     from './routes/stock.js';
import aiRoutes        from './routes/ai.js';
import searchRoutes    from './routes/search.js';
import filingsRoutes   from './routes/filings.js';
import authRoutes      from './routes/auth.js';
import userRoutes      from './routes/user.js';
import emailRoutes     from './routes/emailRoutes.js';
import yahooRoutes     from './routes/yahoo.js';
import finnhubRoutes   from './routes/finnhub.js';
import fmpRoutes       from './routes/fmp.js';
import ngxRoutes       from './routes/ngx.js';
import adminRoutes     from './routes/admin.js';
import { logSecurity, accessLog } from './utils/securityLog.js';
import { getAllSubscribed } from './utils/db.js';
import { sendDigestToUser } from './utils/email.js';

// override: true makes the .env file authoritative — otherwise an empty
// ANTHROPIC_API_KEY exported in the shell (Claude Code sets this) would shadow it.
dotenv.config({ override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3003;

// Behind one reverse proxy (Cloudflare / Render / Nginx) in production, so the
// real client IP comes from X-Forwarded-For — without this every security event
// would log the proxy's IP and per-IP detections would be useless.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use(accessLog);   // baseline access log → security.log (one event per /api request)

// ── API routes ──────────────────────────────────────────────────────────
app.use('/api/market',  marketRoutes);
app.use('/api/stock',   stockRoutes);
app.use('/api/ai',      aiRoutes);
app.use('/api/search',  searchRoutes);
app.use('/api/filings', filingsRoutes);
app.use('/api/auth',    authRoutes);
app.use('/api/user',    userRoutes);
app.use('/api/email',   emailRoutes);
app.use('/api/yahoo',   yahooRoutes);    // fallback trending (no key needed)
app.use('/api/finnhub', finnhubRoutes);  // news, analyst, insider, metrics
app.use('/api/fmp',     fmpRoutes);      // income, balance, cashflow, dividends
app.use('/api/ngx',     ngxRoutes);      // Nigerian Exchange — movers + curated list
app.use('/api/admin',   adminRoutes);    // admin — list/manage users

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// Diagnostic — which data sources are configured (no secrets exposed)
app.get('/api/health/keys', (_, res) => {
  res.json({
    anthropic:     !!process.env.ANTHROPIC_API_KEY,
    alphaVantage:  !!process.env.ALPHA_VANTAGE_API_KEY,
    finnhub:       !!process.env.FINNHUB_API_KEY,
    fmp:           !!process.env.FMP_API_KEY,
    email:         !!(process.env.GMAIL_USER || process.env.SMTP_HOST),
  });
});

// ── Serve the built frontend (production) ─────────────────────────────────
// If frontend/dist exists, this one server serves BOTH the website and the API
// on port 3003 — no Vite, no second process, no port conflicts, no stale cache.
const distPath = path.join(__dirname, '../frontend/dist');
const hasBuild = existsSync(distPath);

if (hasBuild) {
  app.use(express.static(distPath));
  // SPA fallback: any non-API route returns index.html so client-side routing works
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  // Build not present — point visitors at the Vite dev server instead
  app.get('/', (_, res) => res.redirect(process.env.APP_URL || 'http://localhost:5173'));
}

// Global error handler — record the failure as telemetry and return a generic
// message (never leak a stack trace to the client). Must be the last middleware.
app.use((err, req, res, _next) => {
  logSecurity('http.error', { req, status: 500, message: 'Unhandled server error', error_type: err?.name });
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// ── Daily watchlist email digest scheduler ────────────────────────────────
// Sends every subscribed user their digest once a day at ~8am local. Silent
// until email is configured (GMAIL_USER / SMTP_HOST) so it never errors.
function scheduleDailyDigests() {
  if (!(process.env.GMAIL_USER || process.env.SMTP_HOST)) return;

  async function run() {
    const subs = getAllSubscribed();
    for (const user of subs) {
      try { await sendDigestToUser(user); }
      catch (e) { console.warn(`Digest failed for ${user.email}:`, e.message); }
    }
    if (subs.length) console.log(`📧 Sent daily digest to ${subs.length} subscriber(s).`);
  }

  const now = new Date();
  const next8 = new Date(now);
  next8.setHours(8, 0, 0, 0);
  if (next8 <= now) next8.setDate(next8.getDate() + 1);
  setTimeout(() => { run(); setInterval(run, 24 * 60 * 60 * 1000); }, next8 - now);
  console.log(`📧 Daily digest scheduled for ${next8.toLocaleString()}`);
}

app.listen(PORT, () => {
  logSecurity('service.start', { message: `StockSense started on port ${PORT}`, build: hasBuild });
  console.log(`\n  StockSense running on  http://localhost:${PORT}`);
  console.log(hasBuild
    ? '  → serving the built website + API together. Open the URL above.\n'
    : '  → API only (no build found). Run the Vite dev server, or `npm run build` the frontend.\n');
  scheduleDailyDigests();
});
