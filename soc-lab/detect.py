#!/usr/bin/env python3
"""
StockSense SOC Lab — Detection Engine
─────────────────────────────────────
Reads the ECS security log (backend/logs/security.log) and runs sliding-window
detections, printing SOC-style alerts mapped to MITRE ATT&CK. Pure standard
library — no installs.

Usage:
    python3 detect.py                       # default log path
    python3 detect.py /path/to/security.log
"""
import json, os, sys
from collections import defaultdict, deque
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_LOG = os.path.join(HERE, "..", "backend", "logs", "security.log")
LOG_PATH = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_LOG

# ── helpers ──────────────────────────────────────────────────────────────────
def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))

def get(e, *path):
    cur = e
    for p in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(p)
    return cur

def load(path):
    events = []
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except FileNotFoundError:
        print(f"✗ Log not found: {path}\n  Run the app + attack-sim.sh first.")
        sys.exit(1)
    events.sort(key=lambda e: e.get("@timestamp", ""))
    return events

def window_peak(pairs, minutes, distinct=False):
    """Max count (or distinct values) within any sliding window of `minutes`."""
    pairs = sorted(pairs, key=lambda x: x[0])
    win = timedelta(minutes=minutes)
    dq, best = deque(), 0
    for t, v in pairs:
        dq.append((t, v))
        while dq and t - dq[0][0] > win:
            dq.popleft()
        count = len({vv for _, vv in dq if vv is not None}) if distinct else len(dq)
        best = max(best, count)
    return best

ALERTS = []
def fire(level, rule, attack, entity, detail):
    ALERTS.append((level, rule, attack, entity, detail))

# ── detection rules ──────────────────────────────────────────────────────────
def run_rules(events):
    code   = lambda e: get(e, "event", "code")
    ip     = lambda e: get(e, "source", "ip") or "unknown"
    email  = lambda e: get(e, "user", "email")
    uid    = lambda e: get(e, "user", "id")
    reason = lambda e: get(e, "stocksense", "reason")
    t      = lambda e: parse_ts(e["@timestamp"])

    # Rule 1 — Credential brute force: >=5 failed logins from one IP in 5 min
    g = defaultdict(list)
    for e in events:
        if code(e) == "auth.login.failure":
            g[ip(e)].append((t(e), None))
    for k, v in g.items():
        peak = window_peak(v, 5)
        if peak >= 5:
            fire("HIGH", "Credential brute force", "T1110", k, f"{peak} failed logins within 5m")

    # Rule 2 — Password spray: one IP, >=5 DISTINCT target accounts in 10 min
    g = defaultdict(list)
    for e in events:
        if code(e) == "auth.login.failure":
            g[ip(e)].append((t(e), email(e)))
    for k, v in g.items():
        peak = window_peak(v, 10, distinct=True)
        if peak >= 5:
            fire("HIGH", "Password spraying", "T1110.003", k, f"{peak} distinct accounts targeted within 10m")

    # Rule 3 — Account enumeration: >=8 unknown-account / exists probes from one IP / 10m
    g = defaultdict(list)
    for e in events:
        if reason(e) in ("user_not_found", "email_exists"):
            g[ip(e)].append((t(e), None))
    for k, v in g.items():
        peak = window_peak(v, 10)
        if peak >= 8:
            fire("MEDIUM", "Account enumeration", "T1589.002", k, f"{peak} enumeration probes within 10m")

    # Rule 4 — 2FA brute force: >=5 bad codes for one user in 10 min
    g = defaultdict(list)
    for e in events:
        if code(e) == "auth.2fa.failure":
            g[uid(e) or email(e)].append((t(e), None))
    for k, v in g.items():
        peak = window_peak(v, 10)
        if peak >= 5:
            fire("HIGH", "2FA / MFA brute force", "T1110.001", k, f"{peak} bad codes within 10m")

    # Rule 5 — Anonymous AI abuse: >=10 unauthenticated AI calls from one IP / 5m
    g = defaultdict(list)
    for e in events:
        if code(e) == "ai.invoke" and get(e, "stocksense", "authenticated") is False:
            g[ip(e)].append((t(e), None))
    for k, v in g.items():
        peak = window_peak(v, 5)
        if peak >= 10:
            fire("MEDIUM", "Anonymous AI cost abuse", "T1496", k, f"{peak} unauthenticated AI calls within 5m")

    # Rule 6 — Privilege escalation / access denied: any authz.denied
    g = defaultdict(int)
    for e in events:
        if code(e) == "authz.denied":
            g[ip(e)] += 1
    for k, n in g.items():
        fire("HIGH", "Unauthorized privileged access attempt", "T1078", k, f"{n} access-denied event(s)")

# ── report ───────────────────────────────────────────────────────────────────
COLOR = {"HIGH": "\033[1;31m", "MEDIUM": "\033[1;33m", "LOW": "\033[1;34m"}
RESET = "\033[0m"
ORDER = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}

def main():
    events = load(LOG_PATH)
    run_rules(events)

    print("\n" + "═" * 70)
    print(f"  StockSense SOC — Detection Run")
    print(f"  Log: {LOG_PATH}")
    print(f"  Events analysed: {len(events)}")
    print("═" * 70)

    if not ALERTS:
        print("\n  ✓ No detections fired. (Generate traffic with ./attack-sim.sh)\n")
        return

    ALERTS.sort(key=lambda a: ORDER.get(a[0], 9))
    print(f"\n  🚨 {len(ALERTS)} detection(s) fired:\n")
    for level, rule, attack, entity, detail in ALERTS:
        c = COLOR.get(level, "")
        print(f"  {c}[{level:^6}]{RESET} {rule}")
        print(f"           source : {entity}")
        print(f"           detail : {detail}")
        print(f"           ATT&CK : {attack}")
        print()

if __name__ == "__main__":
    main()
