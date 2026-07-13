#!/bin/bash
# Complete onboarding on a FRESH Home Assistant.
# Saves the refresh token to /tmp/ha-records-test.refresh and prints an access token.
# Usage: HA_BASE_URL=http://localhost:18125 ./onboard.sh
set -euo pipefail
HA="${HA_BASE_URL:-http://localhost:18125}"
REFRESH_FILE=/tmp/ha-records-test.refresh

# 1. Create owner user -> auth code
CODE=$(curl -sf -X POST "$HA/api/onboarding/users" \
  -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"$HA/\",\"name\":\"Admin\",\"username\":\"admin\",\"password\":\"admin123\",\"language\":\"en\"}" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["auth_code"])')

# 2. Exchange auth code for tokens; persist refresh token
RESP=$(curl -sf -X POST "$HA/auth/token" \
  -d "grant_type=authorization_code&code=$CODE&client_id=$HA/")
TOKEN=$(echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
echo "$RESP" | python3 -c 'import sys,json;print(json.load(sys.stdin)["refresh_token"])' > "$REFRESH_FILE"
chmod 600 "$REFRESH_FILE"

# 3. Finish remaining onboarding steps (ignore analytics failure)
curl -sf -X POST "$HA/api/onboarding/core_config" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -s  -X POST "$HA/api/onboarding/analytics" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' >/dev/null || true
curl -sf -X POST "$HA/api/onboarding/integration" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"$HA/\",\"redirect_uri\":\"$HA/?auth_callback=1\"}" >/dev/null

echo "$TOKEN"
