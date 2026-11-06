#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# StockSense SOC Lab — Attack Simulation (DETECTION VALIDATION)
#
# Generates benign, controlled attack traffic against YOUR OWN local StockSense
# instance so you can prove the security detections fire. This is authorised
# testing of your own app on localhost — nothing leaves your machine.
#
# Each scenario sends a spoofed X-Forwarded-For so it appears to come from a
# different attacker IP in the logs (your server sets `trust proxy`, so it reads
# that header). That makes the SIEM dashboards and per-IP detections realistic.
#
# Usage:
#   1) In one terminal:  cd ~/Downloads/stocksense && npm start
#   2) In another:       cd ~/Downloads/stocksense/soc-lab && ./attack-sim.sh
#   3) Then detect:      python3 detect.py     (or open your SIEM)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
BASE="${BASE:-http://localhost:3003}"

say() { printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }

# hit METHOD PATH [JSON_BODY] [SPOOF_IP]
hit() {
  local method="$1" path="$2" data="${3:-}" xff="${4:-}"
  local args=(-s -o /dev/null -w "  [%{http_code}] $method $path" -X "$method"
              "$BASE$path" -H 'Content-Type: application/json')
  [ -n "$xff" ]  && args+=(-H "X-Forwarded-For: $xff")
  [ -n "$data" ] && args+=(-d "$data")
  curl "${args[@]}"; echo
}

# Preflight — make sure the app is up
if ! curl -sf -o /dev/null "$BASE/api/health"; then
  echo "✗ Cannot reach $BASE"
  echo "  Start the app first:  (cd ~/Downloads/stocksense && npm start)"
  exit 1
fi
echo "Target: $BASE   —   generating attack telemetry..."

# 1) Credential brute force — one victim, many password guesses, one IP
say "1) Brute force: one account, 12 password guesses (MITRE T1110)"
for i in $(seq 1 12); do
  hit POST /api/auth/login "{\"email\":\"victim@stocksense.app\",\"password\":\"Wrong-$i!\"}" "45.146.10.7"
  sleep 0.15
done

# 2) Password spray — many accounts, one common password, one IP
say "2) Password spray: 8 accounts, one common password (MITRE T1110.003)"
for u in alice bob carol dave erin frank grace heidi; do
  hit POST /api/auth/login "{\"email\":\"$u@stocksense.app\",\"password\":\"Password1!\"}" "185.220.101.45"
  sleep 0.15
done

# 3) Account enumeration — probe which emails exist, one IP
say "3) Account enumeration: 10 unknown emails probed (MITRE T1589.002)"
for n in $(seq 1 10); do
  hit POST /api/auth/login "{\"email\":\"probe$n@unknown$n.io\",\"password\":\"x\"}" "103.97.176.20"
  sleep 0.1
done

# 4) Anonymous AI abuse — hammer the metered, paid AI endpoint with no login
say "4) Anonymous AI abuse: 12 calls to the paid AI endpoint, no auth (MITRE T1496)"
for s in NVDA TSLA AAPL AMZN META GOOG AMD INTC NFLX BABA ORCL CRM; do
  hit POST /api/ai/summarize "{\"symbol\":\"$s\"}" "194.165.16.9"
  sleep 0.15
done

# 5) Privilege escalation / probing privileged endpoints
say "5) Privilege escalation: admin + bulk-email probes without rights (MITRE T1078)"
hit GET  /api/admin/users ""                        "45.146.10.7"
hit POST /api/email/send-all "{\"secret\":\"guess123\"}" "45.146.10.7"
hit GET  /api/admin/users ""                        "45.146.10.7"

echo
echo "✓ Attack simulation complete."
echo "  Now run the detections:   python3 detect.py"
echo "  Or watch the raw stream:  tail -f ../backend/logs/security.log | jq"
