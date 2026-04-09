#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

export HA_BASE_URL="${HA_BASE_URL:-http://localhost:18125}"
export HA_USERNAME="${HA_USERNAME:-admin}"
export HA_PASSWORD="${HA_PASSWORD:-admin123}"

echo "========================================"
echo "  HA Record E2E Browser Tests"
echo "========================================"
echo "HA URL: $HA_BASE_URL"
echo "User:   $HA_USERNAME"
echo ""

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Create test-results directory
mkdir -p test-results

# Verify HA is reachable
echo "Checking HA connectivity..."
if ! curl -sf "$HA_BASE_URL/api/" > /dev/null 2>&1; then
  echo "ERROR: Cannot reach Home Assistant at $HA_BASE_URL"
  exit 1
fi
echo "HA is running."

# Verify authentication
echo "Verifying authentication..."
FLOW_ID=$(curl -sf -X POST "$HA_BASE_URL/auth/login_flow" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$HA_BASE_URL/\",\"handler\":[\"homeassistant\",null],\"redirect_uri\":\"$HA_BASE_URL/?auth_callback=1\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['flow_id'])")

AUTH_RESULT=$(curl -sf -X POST "$HA_BASE_URL/auth/login_flow/$FLOW_ID" \
  -H "Content-Type: application/json" \
  -d "{\"client_id\":\"$HA_BASE_URL/\",\"username\":\"$HA_USERNAME\",\"password\":\"$HA_PASSWORD\"}")

AUTH_TYPE=$(echo "$AUTH_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('type',''))")
if [ "$AUTH_TYPE" != "create_entry" ]; then
  echo "ERROR: Authentication failed"
  echo "$AUTH_RESULT"
  exit 1
fi
echo "Authentication OK."

echo ""
echo "Running tests..."
echo "========================================"

# Run with xvfb if DISPLAY is not set
if [ -z "${DISPLAY:-}" ]; then
  echo "No DISPLAY set, using xvfb-run..."
  xvfb-run --auto-servernum --server-args="-screen 0 1280x900x24" \
    npx playwright test "$@" --reporter=list,html
else
  npx playwright test "$@" --reporter=list,html
fi

echo ""
echo "========================================"
echo "  Tests Complete!"
echo "========================================"
echo "HTML report: $SCRIPT_DIR/playwright-report/index.html"
echo "Screenshots: $SCRIPT_DIR/test-results/"
