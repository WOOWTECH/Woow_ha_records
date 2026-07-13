#!/bin/bash
# Create the first ha_finance + ha_health_record config entries (fixed IDs).
# Usage: HA_TOKEN=... ./bootstrap.sh
# Note: on an ALREADY-bootstrapped instance the flow returns
# {"type":"abort","reason":"already_configured"} and this exits 1 —
# that state is fine; do not tear down the namespace just for this.
set -euo pipefail
HA="${HA_BASE_URL:-http://localhost:18125}"

flow() {  # $1=handler  $2=user-step JSON
  FLOW_ID=$(curl -sf -X POST "$HA/api/config/config_entries/flow" \
    -H "Authorization: Bearer $HA_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"handler\":\"$1\",\"show_advanced_options\":false}" \
    | python3 -c 'import sys,json;print(json.load(sys.stdin)["flow_id"])')
  RESULT=$(curl -sf -X POST "$HA/api/config/config_entries/flow/$FLOW_ID" \
    -H "Authorization: Bearer $HA_TOKEN" -H 'Content-Type: application/json' -d "$2")
  TYPE=$(echo "$RESULT" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("type",""))')
  if [ "$TYPE" != "create_entry" ]; then
    echo "Bootstrap failed for $1: $RESULT" >&2
    exit 1
  fi
  echo "Created $1 entry."
}

flow ha_finance '{"account_name":"Retention Test","account_id":"retention_test_acct","initial_balance":0}'
flow ha_health_record '{"member_name":"Retention Test","member_id":"retention_test_member"}'
