#!/bin/bash
# Print a fresh access token using the refresh token saved by onboard.sh.
set -euo pipefail
HA="${HA_BASE_URL:-http://localhost:18125}"
REFRESH=$(cat /tmp/ha-records-test.refresh)
curl -sf -X POST "$HA/auth/token" \
  -d "grant_type=refresh_token&refresh_token=$REFRESH&client_id=$HA/" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'
