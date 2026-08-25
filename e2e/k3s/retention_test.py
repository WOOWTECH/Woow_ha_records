#!/usr/bin/env python3
"""Retention E2E: prove no data loss past the old limits.

Usage (after onboard.sh + bootstrap.sh):
  HA_TOKEN=... ./retention_test.py seed     # insert data past old limits, verify
  HA_TOKEN=... ./retention_test.py verify   # re-verify counts (after pod restart)

Env: HA_BASE_URL (default http://localhost:18125), HA_TOKEN (required).
Auto-refreshes the token on 401 via /tmp/ha-records-test.refresh.
Exit code 0 = all checks passed.
NOT idempotent: re-running `seed` doubles the data. To retry, delete the
namespace and redeploy first.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

HA = os.environ.get("HA_BASE_URL", "http://localhost:18125")
TOKEN = os.environ["HA_TOKEN"]
REFRESH_FILE = "/tmp/ha-records-test.refresh"

FINANCE_TX = 1100       # old limit: 1000
HEALTH_RECORDS = 10100  # old limit: 10000
ACCOUNT_ID = "retention_test"         # derived by finance_add_account from the name
MEMBER_ID = "retention_test_member"   # created by bootstrap.sh


def _refresh_token() -> None:
    global TOKEN
    with open(REFRESH_FILE) as f:
        refresh = f.read().strip()
    data = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh,
        "client_id": f"{HA}/",
    }).encode()
    with urllib.request.urlopen(urllib.request.Request(f"{HA}/auth/token", data=data)) as r:
        TOKEN = json.loads(r.read())["access_token"]
    print("  (access token refreshed)")


def call(domain: str, service: str, data: dict, response: bool = False,
         _retried: bool = False) -> dict:
    qs = "?return_response" if response else ""
    req = urllib.request.Request(
        f"{HA}/api/services/{domain}/{service}{qs}",
        data=json.dumps(data).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
    except urllib.error.HTTPError as err:
        if err.code == 401 and not _retried:
            _refresh_token()
            return call(domain, service, data, response, _retried=True)
        print(f"HTTP {err.code} calling {domain}.{service}: {err.read().decode()[:500]}")
        raise
    parsed = json.loads(body) if body else {}
    return parsed.get("service_response", parsed) if isinstance(parsed, dict) else parsed


def finance_state() -> tuple[int, float]:
    """Return (transaction_count, balance) via woow_ha_records.finance_get_account."""
    resp = call("woow_ha_records", "finance_get_account", {"account_id": ACCOUNT_ID}, response=True)
    account = resp.get("account", {})
    return len(account.get("transactions", [])), account.get("balance", -1.0)


def health_record_count() -> int:
    resp = call(
        "woow_ha_records", "health_get_records",
        {"start_time": "2000-01-01T00:00:00+00:00", "end_time": "2100-01-01T00:00:00+00:00"},
        response=True,
    )
    return len(resp.get("records", []))


def check(name: str, actual, expected) -> bool:
    ok = actual == expected
    print(f"{'PASS' if ok else 'FAIL'}  {name}: {actual} (expected {expected})")
    return ok


def seed() -> bool:
    print(f"== Seeding finance: {FINANCE_TX} transactions ==")
    for i in range(FINANCE_TX):
        call("woow_ha_records", "finance_add_transaction",
             {"account_id": ACCOUNT_ID, "amount": 1.0, "note": f"tx_{i}"})
        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{FINANCE_TX}")

    print(f"== Seeding health: {HEALTH_RECORDS} records ==")
    # type_id is auto-generated from name: "Feeding" -> "feeding"
    call("woow_ha_records", "health_add_record_type",
         {"member_id": MEMBER_ID, "name": "Feeding", "unit": "ml"})
    for i in range(HEALTH_RECORDS):
        call("woow_ha_records", "health_log_record",
             {"member_id": MEMBER_ID, "record_type": "feeding", "value": float(i)})
        if (i + 1) % 500 == 0:
            print(f"  {i + 1}/{HEALTH_RECORDS}")

    return verify()


def verify() -> bool:
    tx_count, balance = finance_state()
    ok = check("finance transactions retained", tx_count, FINANCE_TX)
    ok &= check("finance balance correct", balance, float(FINANCE_TX))
    ok &= check("health records retained", health_record_count(), HEALTH_RECORDS)
    return ok


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "verify"
    passed = seed() if mode == "seed" else verify()
    sys.exit(0 if passed else 1)
