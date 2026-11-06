# StockSense SOC Lab 🛡️

A self-contained detection-engineering lab built on the StockSense web app.
It demonstrates the full blue-team loop on a real application:

**instrument → attack → detect → triage → report**

The app emits structured **ECS-formatted, MITRE ATT&CK-tagged** security events
(`backend/utils/securityLog.js` → `backend/logs/security.log`). This lab attacks
the app, then catches the attacks with detections you can run locally or in a SIEM.

---

## Contents
| File | What it is |
|------|------------|
| `attack-sim.sh` | Controlled attack simulator (brute force, spray, enumeration, AI abuse, priv-esc) against your **own** localhost instance |
| `detect.py` | Zero-dependency detection engine — sliding-window rules over the log, SOC-style alerts mapped to ATT&CK |
| `sigma/*.yml` | Detection-as-code: vendor-neutral Sigma rules (convert to Splunk/Elastic/Wazuh with `sigma convert`) |
| `splunk-quickstart.md` | Step-by-step: stand up Splunk Free, ingest the log, run the SPL detections, build a dashboard |

---

## Run it (no SIEM needed)

```bash
# Terminal 1 — start the app
cd ~/Downloads/stocksense && npm start

# Terminal 2 — generate attacks, then detect
cd ~/Downloads/stocksense/soc-lab
chmod +x attack-sim.sh
./attack-sim.sh
python3 detect.py
```

`detect.py` prints the alerts that fired. Watch the raw telemetry live with:
```bash
tail -f ~/Downloads/stocksense/backend/logs/security.log | jq
```

---

## Detection coverage (MITRE ATT&CK)
| Rule | Technique | Signal |
|------|-----------|--------|
| Credential brute force | T1110 | ≥5 `auth.login.failure` / IP / 5m |
| Password spraying | T1110.003 | ≥5 distinct accounts / IP / 10m |
| Account enumeration | T1589.002 | ≥8 `user_not_found`/`email_exists` / IP / 10m |
| 2FA brute force | T1110.001 | ≥5 `auth.2fa.failure` / user / 10m |
| Anonymous AI cost abuse | T1496 | ≥10 unauthenticated `ai.invoke` / IP / 5m |
| Privilege escalation | T1078 | any `authz.denied` |

---

## Suggested LinkedIn write-up arc
1. **Telemetry** — "I instrumented a real app with ECS + ATT&CK-tagged security logging." *(screenshot: `tail | jq`)*
2. **Attack** — "I ran a controlled brute-force / spray / enumeration / API-abuse campaign against it." *(screenshot: `attack-sim.sh`)*
3. **Detect** — "I caught all six with sliding-window detections." *(screenshot: `detect.py` output)*
4. **SIEM** — "Ingested into Splunk/Elastic and built a SOC dashboard." *(screenshot: dashboard)*
5. **Respond** — "Wrote an incident report: detection → scope → IOCs → ATT&CK → containment → remediation." *(attach the report)*

> All testing here targets a local instance you own and control — authorised
> security testing for detection validation.
