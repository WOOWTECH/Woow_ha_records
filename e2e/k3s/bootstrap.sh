#!/bin/bash
# Create the woow_ha_records config entry, then the retention fixtures
# (one finance Account, one health Member) through its services.
#
# Before the merge an Account and a Member were each a config entry of their
# own; they are store records now, so only the integration itself goes through
# a config flow. Re-running against an already-bootstrapped instance is a
# no-op for the entry and an error for the fixtures — both are fine.
# Usage: HA_TOKEN=... ./bootstrap.sh
set -euo pipefail
HA="${HA_BASE_URL:-http://localhost:18125}"

FLOW_ID=$(curl -sf -X POST "$HA/api/config/config_entries/flow" \
  -H "Authorization: Bearer $HA_TOKEN" -H 'Content-Type: application/json' \
  -d '{"handler":"woow_ha_records","show_advanced_options":false}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["flow_id"])')

RESULT=$(curl -sf -X POST "$HA/api/config/config_entries/flow/$FLOW_ID" \
  -H "Authorization: Bearer $HA_TOKEN" -H 'Content-Type: application/json' -d '{}')
TYPE=$(echo "$RESULT" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("type",""))')
if [ "$TYPE" != "create_entry" ]; then
  echo "Config entry not created: $RESULT" >&2
  exit 1
fi
echo "Created woow_ha_records entry."

svc() {  # $1=service  $2=JSON payload
  curl -sf -X POST "$HA/api/services/woow_ha_records/$1" \
    -H "Authorization: Bearer $HA_TOKEN" -H 'Content-Type: application/json' \
    -d "$2" >/dev/null
  echo "Called $1."
}

svc finance_add_account '{"name":"Retention Test","initial_balance":0}'
svc health_add_member   '{"name":"Retention Test","member_id":"retention_test_member"}'
