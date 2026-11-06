# StockSense

**AI-powered stock research: live market data, plain-English analysis, and a built-in SOC detection lab.**

StockSense pulls quotes, charts, news, earnings and filings from several market-data providers, then uses Claude, with live web search, to explain what's going on with a stock in plain English. It also has accounts with 2FA, watchlists and email digests. The app is instrumented with **ECS-formatted, MITRE ATT&CK-tagged security logging**, with a companion **SOC lab** that attacks the app and catches the attacks with detection rules.

## Features

### Research
- **Search** across US and Nigerian (NGX) markets, with logos, quotes and mini charts
- **Stock detail**: TradingView chart, overview, earnings, news, and financial statements
- **AI summary**: Claude analyses the stock with **live web search** and cites sources
- **Chart insight**: AI explanation of recent price action
- **Financials analysis**: plain-English breakdown of the income statement, balance sheet and cash flow
- **SEC filings viewer**, with AI highlighting of the important parts
- **News sentiment** (optional on-device model via `@xenova/transformers`)
- **Market overview**: trending stocks, top movers, explore page

### Accounts
- Register and log in with **JWT** + **bcrypt**, plus **two-factor authentication**
- **Watchlist**, profile and password management
- **Email digests** of your watchlist (Nodemailer)
- **Admin panel**: users, verification, enable/disable

### Security engineering (the SOC lab)
- Every auth, admin and AI event is logged as **ECS JSON**, tagged with **MITRE ATT&CK** techniques (`backend/utils/securityLog.js`)
- `soc-lab/attack-sim.sh`: controlled attacks against your own instance (brute force, password spraying, user enumeration, AI abuse, privilege escalation)
- `soc-lab/detect.py`: a zero-dependency detection engine with sliding-window rules that raises SOC-style alerts
- `soc-lab/sigma/`: **Sigma** rules (detection-as-code, convertible to Splunk, Elastic or Wazuh)
- `soc-lab/splunk-quickstart.md`: ingest the logs into Splunk Free, run the SPL detections and build a dashboard

> instrument → attack → detect → triage → report

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, TradingView widgets |
| Backend | Node.js, Express |
| AI | Anthropic Claude (with the web search tool) |
| Market data | Finnhub, Financial Modeling Prep, Alpha Vantage, Yahoo Finance, NGX |
| Auth | JWT, bcrypt, 2FA |
| Security | ECS logging, MITRE ATT&CK mapping, Sigma, Python detection engine, Splunk |

## Run it locally

```bash
npm run install:all                       # installs root, backend and frontend
cp backend/.env.example backend/.env      # add your API keys (see below)
npm start                                 # builds the frontend, serves everything on http://localhost:3003
```

For development with hot reload: `npm run dev` (frontend on :5173, API on :3003).

### Environment variables (`backend/.env`)

| Variable | What for |
|---|---|
| `ANTHROPIC_API_KEY` | AI summaries and analysis |
| `FINNHUB_API_KEY` | Quotes, news, company data |
| `FMP_API_KEY` | Financial statements |
| `ALPHA_VANTAGE_API_KEY` | Fallback price data |
| `JWT_SECRET` | Signing login tokens (use a long random string) |
| SMTP settings | Email digests (optional) |

See `backend/.env.example` for the full list. Real keys are never committed: `.env` and `backend/data/` are git-ignored.

## Try the SOC lab

```bash
npm start                                  # terminal 1
cd soc-lab && ./attack-sim.sh && python3 detect.py   # terminal 2
```

## Disclaimer

StockSense is for education and research. It is **not financial advice**.
