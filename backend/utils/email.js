import nodemailer from 'nodemailer';
import fetch from 'node-fetch';

// ── Transporter ──────────────────────────────────────────────────────────
function createTransporter() {
  // Option A: Gmail — set GMAIL_USER + GMAIL_APP_PASSWORD in .env
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  // Option B: Custom SMTP — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  throw new Error('No email provider configured. See .env.example for setup instructions.');
}

// ── Fetch live price for one stock (Finnhub — reliable, 60/min free) ──────
async function getPrice(symbol) {
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${process.env.FINNHUB_API_KEY}`);
    const q   = await res.json();
    if (q?.c == null || q.c === 0) return null;
    return {
      price:         q.c,
      change:        q.d ?? 0,
      changePercent: `${(q.dp ?? 0) >= 0 ? '+' : ''}${(q.dp ?? 0).toFixed(2)}%`,
    };
  } catch {
    return null;
  }
}

// ── Build HTML email ─────────────────────────────────────────────────────
function buildEmail(user, stockRows, date) {
  const appUrl  = process.env.APP_URL || 'http://localhost:5173';
  const from    = user.firstName || 'Investor';

  const rowsHtml = stockRows.map(({ symbol, name, price, change, changePercent, noData }) => {
    const isUp  = !noData && change >= 0;
    const color = noData ? '#64748b' : isUp ? '#00c087' : '#ff5252';
    const arrow = noData ? '' : isUp ? '▲ ' : '▼ ';
    const priceStr = noData ? 'Data unavailable' : `$${price.toFixed(price < 1 ? 4 : 2)}`;
    const changStr = noData ? '' : `${arrow}${changePercent}`;

    return `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #1e293b;">
        <strong style="color:#e2e8f0;font-size:15px;">${symbol}</strong>
        <span style="color:#64748b;font-size:12px;margin-left:8px;">${name}</span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #1e293b;text-align:right;">
        <span style="color:#e2e8f0;font-weight:600;">${priceStr}</span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #1e293b;text-align:right;">
        <span style="color:${color};font-weight:700;">${changStr}</span>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid #1e293b;text-align:center;">
        <a href="${appUrl}/stock/${symbol}" style="color:#3b82f6;font-size:12px;text-decoration:none;">View →</a>
      </td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:0;background:#080c18;font-family:Arial,sans-serif;}</style>
</head>
<body>
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">

  <div style="text-align:center;margin-bottom:32px;">
    <p style="font-size:28px;font-weight:900;color:#fff;margin:0;">
      📈 Stock<span style="color:#3b82f6">Sense</span>
    </p>
    <p style="color:#64748b;font-size:13px;margin:8px 0 0;">Daily Watchlist Digest · ${date}</p>
  </div>

  <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;line-height:1.6;">
    Hey ${from} 👋 Here's how your watchlist is performing today.
  </p>

  <table style="width:100%;border-collapse:collapse;background:#111827;border-radius:12px;overflow:hidden;margin-bottom:24px;">
    <thead>
      <tr style="background:#1e293b;">
        <th style="padding:12px 16px;text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Stock</th>
        <th style="padding:12px 16px;text-align:right;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Price</th>
        <th style="padding:12px 16px;text-align:right;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Today</th>
        <th style="padding:12px 16px;text-align:center;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Analysis</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div style="text-align:center;margin-bottom:28px;">
    <a href="${appUrl}/watchlist"
       style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:14px;display:inline-block;">
      Open StockSense →
    </a>
  </div>

  <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:16px;margin-bottom:20px;">
    <p style="color:#f59e0b;font-size:12px;font-weight:700;margin:0 0 6px;">⚠️ Not Financial Advice</p>
    <p style="color:#475569;font-size:12px;margin:0;line-height:1.6;">
      StockSense is for educational purposes only. This email does not constitute financial or investment advice.
      Always do your own research and consult a qualified financial advisor before making investment decisions.
    </p>
  </div>

  <p style="color:#334155;font-size:12px;text-align:center;">
    © 2026 StockSense ·
    <a href="${appUrl}/watchlist" style="color:#475569;">Manage notifications</a>
  </p>
</div>
</body></html>`;
}

// ── Public: send digest to one user ─────────────────────────────────────
export async function sendDigestToUser(user) {
  if (!user.watchlist?.length) throw new Error('Watchlist is empty.');
  const toEmail = user.notificationEmail || user.email;

  // Fetch prices (cap at 8 to stay within daily limit)
  const stockRows = [];
  for (const stock of user.watchlist.slice(0, 8)) {
    const data = await getPrice(stock.symbol);
    stockRows.push({ symbol: stock.symbol, name: stock.name || stock.symbol, ...data, noData: !data });
  }

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const transporter = createTransporter();
  const fromAddr    = process.env.GMAIL_USER || process.env.SMTP_USER || 'noreply@stocksense.app';

  await transporter.sendMail({
    from:    `"StockSense" <${fromAddr}>`,
    to:      toEmail,
    subject: `📈 Your StockSense Digest — ${date}`,
    html:    buildEmail(user, stockRows, date),
  });
}

// ── Public: verify transporter config is valid ───────────────────────────
export async function verifyEmailConfig() {
  const transporter = createTransporter();
  await transporter.verify();
}

// ── Public: send an account-verification email ───────────────────────────
export async function sendVerificationEmail(user, verifyLink) {
  const transporter = createTransporter(); // throws if email isn't configured
  const fromAddr    = process.env.GMAIL_USER || process.env.SMTP_USER || 'noreply@stocksense.app';
  const name        = user.firstName || 'there';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#080c18;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px;">
    <p style="font-size:26px;font-weight:900;color:#fff;text-align:center;margin:0 0 24px;">📈 Stock<span style="color:#3b82f6">Sense</span></p>
    <div style="background:#111827;border:1px solid #1e293b;border-radius:14px;padding:28px;">
      <p style="color:#e2e8f0;font-size:16px;margin:0 0 12px;">Hi ${name},</p>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Welcome to StockSense! Confirm your email address to activate your account and unlock AI analysis, your watchlist, and daily alerts.
      </p>
      <div style="text-align:center;margin:0 0 22px;">
        <a href="${verifyLink}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;">Verify my email →</a>
      </div>
      <p style="color:#475569;font-size:12px;line-height:1.6;margin:0;">
        Or paste this link into your browser:<br>
        <a href="${verifyLink}" style="color:#3b82f6;word-break:break-all;">${verifyLink}</a>
      </p>
    </div>
    <p style="color:#334155;font-size:12px;text-align:center;margin-top:18px;">
      If you didn't create a StockSense account, you can ignore this email.
    </p>
  </div></body></html>`;

  await transporter.sendMail({
    from:    `"StockSense" <${fromAddr}>`,
    to:      user.email,
    subject: 'Verify your StockSense account',
    html,
  });
}

// ── Public: send a two-step (2FA) login code ─────────────────────────────
export async function sendLoginCode(user, code) {
  const transporter = createTransporter(); // throws if email isn't configured
  const fromAddr    = process.env.GMAIL_USER || process.env.SMTP_USER || 'noreply@stocksense.app';
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#080c18;font-family:Arial,sans-serif;">
  <div style="max-width:440px;margin:0 auto;padding:32px 16px;text-align:center;">
    <p style="font-size:24px;font-weight:900;color:#fff;margin:0 0 20px;">📈 Stock<span style="color:#3b82f6">Sense</span></p>
    <div style="background:#111827;border:1px solid #1e293b;border-radius:14px;padding:28px;">
      <p style="color:#94a3b8;font-size:14px;margin:0 0 14px;">Your sign-in code is:</p>
      <p style="font-size:36px;font-weight:800;letter-spacing:8px;color:#fff;margin:0 0 14px;font-family:monospace;">${code}</p>
      <p style="color:#475569;font-size:12px;margin:0;">Expires in 10 minutes. If you didn't try to sign in, ignore this email and change your password.</p>
    </div>
  </div></body></html>`;
  await transporter.sendMail({
    from:    `"StockSense" <${fromAddr}>`,
    to:      user.email,
    subject: `${code} is your StockSense sign-in code`,
    html,
  });
}
