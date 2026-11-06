# Splunk Free — Quickstart for the StockSense SOC Lab

Splunk Free ingests up to 500 MB/day — far more than this lab produces — and is
the most widely recognised SIEM on the job market, so it's a strong portfolio
choice. No Docker required.

## 1. Install (macOS)
1. Download **Splunk Enterprise** for macOS from splunk.com (it runs as *Splunk
   Free* once the trial ends — no card needed): https://www.splunk.com/en_us/download/splunk-enterprise.html
2. Install the `.dmg`, then start it:
   ```bash
   /Applications/Splunk/bin/splunk start --accept-license
   ```
3. Open **http://localhost:8000** and set your admin password.
4. (Optional) switch to the free licence: **Settings → Licensing → Change license group → Free license**.

## 2. Add the log as a data source
**Settings → Add Data → Monitor → Files & Directories**
- File: `~/Downloads/stocksense/backend/logs/security.log`
- Source type: **`_json`** (Splunk auto-parses each line into fields like
  `event.code`, `source.ip`, `user.email`, `threat.technique.id`)
- Index: create one called **`stocksense`**
- Set **Index** and save. New events stream in live as you use the app / run `attack-sim.sh`.

## 3. Detection searches (SPL)
Run these in **Search & Reporting** (set the time picker to *Last 15 minutes*).

**Brute force — ≥5 failed logins per IP / 5 min (T1110)**
```spl
index=stocksense "event.code"="auth.login.failure"
| bin _time span=5m
| stats count by _time, source.ip
| where count >= 5
```

**Password spraying — one IP, many accounts (T1110.003)**
```spl
index=stocksense "event.code"="auth.login.failure"
| bin _time span=10m
| stats dc(user.email) AS accounts by _time, source.ip
| where accounts >= 5
```

**Account enumeration (T1589.002)**
```spl
index=stocksense (stocksense.reason="user_not_found" OR stocksense.reason="email_exists")
| bin _time span=10m
| stats count by _time, source.ip
| where count >= 8
```

**Anonymous AI cost abuse (T1496)**
```spl
index=stocksense "event.code"="ai.invoke" "stocksense.authenticated"=false
| bin _time span=5m
| stats count by _time, source.ip
| where count >= 10
```

**Privilege-escalation attempts (T1078)**
```spl
index=stocksense "event.code"="authz.denied"
| stats count by source.ip, url.path, user.email
```

## 4. Dashboard panels worth building
- **Failed vs successful logins over time** — `timechart count by event.outcome` on `event.category=authentication`
- **Top source IPs** — `stats count by source.ip | sort -count`
- **ATT&CK technique breakdown** — `stats count by threat.technique.id`
- **AI calls: authenticated vs anonymous** — `timechart count by stocksense.authenticated` on `event.code=ai.invoke`
- **Severity heat** — `stats count by event.severity`

Save each search as a **Report**, then **Add to Dashboard** → you have a SOC
dashboard to screenshot.

> Tip: Splunk Free has no scheduled alerting. To *demo* alerting, save a search
> and run it on a schedule manually, or graduate to Elastic (free alerting) or
> Splunk's 60-day Enterprise trial.

## Alternative: Elastic / ELK
Because the log is already **ECS-formatted**, Elastic is the most seamless: run
Elasticsearch + Kibana via Docker, point **Filebeat** at `security.log`, and the
fields map automatically. Kibana → **Security → Detection rules** gives you free
scheduled alerting and a prebuilt ATT&CK matrix view.
