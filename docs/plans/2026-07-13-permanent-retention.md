# Permanent Record Retention Implementation Plan

> **STATUS: SHIPPED.** Implemented and merged in `71403ba` (Merge fix/permanent-retention).
> All steps below are complete; the file is retained as the record of the design decisions.
> The quoted PR body near the end is reproduced verbatim as it was written and is not updated.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the hard-coded data-retention limits in `ha_finance` (1000 tx/account) and `ha_health_record` (10,000 records/member) so records are kept permanently, then prove it with unit tests and a disposable k3s Home Assistant E2E test before the PR is merged.

**Architecture:** Both components persist via HA's `Store` helper (JSON in `.storage/`). We delete the trim/prune code paths, their constants, and their events entirely (spec option A). Tests are changed first (TDD). The merge gate is a fresh HA instance in k3s namespace `ha-records-test` where we bulk-insert past the old limits and verify zero data loss, persistence across restart, and clean logs.

**Tech Stack:** Python 3.12+, pytest + pytest-homeassistant-custom-component (pinned `homeassistant==2025.1.4`), kubectl against local k3s, bash + Python stdlib for E2E scripts.

**Spec:** `docs/design/2026-07-13-permanent-retention-design.md`

**Working directory:** `/home/woowtechcluster1/Woow_ha_records` (branch `fix/permanent-retention`, already contains the committed spec).

---

## Important repo facts (read before starting)

- `pyproject.toml` sets `testpaths = ["tests"]`, `asyncio_mode = "auto"`, `pythonpath = ["."]`. Run pytest from the repo root.
- Test deps: `requirements_test.txt` (pytest, pytest-asyncio, `pytest-homeassistant-custom-component==0.13.205`, `homeassistant==2025.1.4`, voluptuous). Requires Python ≥ 3.12.
- The GitHub remote URL embeds credentials: `git remote get-url origin` gives `https://WOOWTECH:<token>@github.com/WOOWTECH/Woow_ha_records.git`. **Never write the token into any committed file.** Extract it into env vars when needed (Task 7/8 show how).
- `ha_finance` stores ALL accounts in one file `.storage/ha_finance`; `ha_health_record` stores per member in `.storage/ha_health_record_<member_id>`.
- Services used by E2E (verified against `services.py` on this branch):
  - `ha_finance.add_transaction` (fields: `account_id`, `amount`, `note`); `ha_finance.get_account` (`?return_response`, returns `{"account": {"balance": ..., "transactions": [...]}}`)
  - `ha_health_record.add_record_type` (fields: `member_id`, `name`, `unit`; `type_id` is auto-generated from `name`, e.g. "Feeding" → `feeding`); `ha_health_record.log_record`; `ha_health_record.get_records` (`?return_response`, returns `{"records": [...]}` in a time range)
- **Chicken-and-egg on a fresh HA:** both integrations register their services only after a first config entry exists (`ha_health_record` has no `async_setup` at all). The E2E MUST bootstrap one config entry per domain via the config-flow REST API (`POST /api/config/config_entries/flow`) before calling any service. Both config flows accept explicit IDs: finance `{"account_name", "account_id", "initial_balance"}`, health `{"member_name", "member_id"}`.
- **Token expiry:** an access token from the onboarding `authorization_code` exchange lives ~30 min — shorter than the E2E run. The harness persists the refresh token and mints fresh access tokens per phase.

---

### Task 1: Test environment setup + green baseline

**Files:** none created (venv is gitignored-by-convention; verify)

- [x] **Step 1: Create venv and install test deps**

```bash
cd /home/woowtechcluster1/Woow_ha_records
python3 --version   # must be >= 3.12; if not, use python3.12 explicitly
python3 -m venv .venv
.venv/bin/pip install --quiet -r requirements_test.txt
```

- [x] **Step 2: Ensure `.venv` is not committed**

```bash
grep -q '^\.venv' .gitignore || echo '.venv/' >> .gitignore
```
If `.gitignore` was modified, include it in the Task 2 commit.

- [x] **Step 3: Run the full suite for a green baseline**

Run: `.venv/bin/pytest -q`
Expected: all tests PASS. If the baseline is already red, STOP and report — do not proceed on a broken baseline.

---

### Task 2: `ha_finance` — remove transaction trimming (TDD)

**Files:**
- Modify: `tests/ha_finance/test_models.py:122-136`
- Modify: `custom_components/ha_finance/models.py:163-182`
- Modify: `custom_components/ha_finance/const.py:36,41`
- Modify: `custom_components/ha_finance/coordinator.py:14-29,147,153-154,250,253-254,273-287,304,307-308`
- Modify: `custom_components/ha_finance/__init__.py:48,54` (docstring)
- Modify: `custom_components/ha_finance/panel.py:61` (docstring)
- Modify: `custom_components/ha_finance/manifest.json:4`

- [x] **Step 1: Replace the trimming test with a permanent-retention test**

In `tests/ha_finance/test_models.py`, replace the whole `test_add_transaction_trims_oldest` method (lines 122-136, docstring self-labelled "BUG") with:

```python
    def test_add_transaction_never_trims(self):
        """Transactions are kept permanently -- nothing is trimmed at any size."""
        account = Account(id="acc1", name="Test", balance=0.0)

        total = 1001  # exceeds the old hard-coded 1000 limit
        for i in range(total):
            tx = Transaction.create(amount=1.0, note=f"tx_{i}")
            account.add_transaction(tx)

        assert len(account.transactions) == total
        assert account.balance == float(total)
        assert account.transactions[0].note == "tx_0"  # oldest still present
        assert account.transactions[-1].note == f"tx_{total - 1}"
```

- [x] **Step 2: Run the new test to verify it fails**

Run: `.venv/bin/pytest tests/ha_finance/test_models.py::TestAccount::test_add_transaction_never_trims -v`
Expected: FAIL — `len(account.transactions)` is 1000, not 1001 (trimming still active).

- [x] **Step 3: Remove trimming from the model**

In `custom_components/ha_finance/models.py`, replace `add_transaction` (lines 163-182) with:

```python
    def add_transaction(self, transaction: Transaction) -> None:
        """Add a transaction and update balance.

        Transactions are kept permanently; nothing is ever trimmed.
        """
        self.balance += transaction.amount
        self.transactions.append(transaction)
```

- [x] **Step 4: Remove the constant and event**

In `custom_components/ha_finance/const.py` delete line 36 (`EVENT_TRANSACTIONS_TRIMMED: Final = "ha_finance_transactions_trimmed"`) and line 41 (`DEFAULT_MAX_TRANSACTIONS: Final = 1000`).

- [x] **Step 5: Clean up the coordinator**

In `custom_components/ha_finance/coordinator.py`:
1. Remove `DEFAULT_MAX_TRANSACTIONS,` (line 16) and `EVENT_TRANSACTIONS_TRIMMED,` (line 22) from the `.const` import.
2. Line 147: `trimmed = account.add_transaction(transaction, max_transactions=DEFAULT_MAX_TRANSACTIONS)` → `account.add_transaction(transaction)`; delete the `if trimmed: self._fire_trimmed_event(account)` block (lines 153-154).
3. Line 250: same replacement; delete `if trimmed:` block (lines 253-254).
4. Line 304: same replacement; delete `if trimmed:` block (lines 307-308).
5. Delete the whole `_fire_trimmed_event` method (lines 273-287).

(Line numbers shift as you edit — locate by content, not absolute number.)

- [x] **Step 6: Update docstrings and manifest**

1. `custom_components/ha_finance/__init__.py` module docstring: delete the line `` * ``ha_finance_transactions_trimmed`` -- old transactions pruned `` and the line `` * ``max_transactions``       -- ``1000`` `` under "Configuration defaults".
2. `custom_components/ha_finance/panel.py` docstring: delete the line `` - ``ha_finance_transactions_trimmed`` -- Old transactions were pruned. ``
3. `custom_components/ha_finance/manifest.json` `description`: change `Fires 5 HA bus events (transaction_added, recurring_executed, balance_adjusted, low_balance, transactions_trimmed).` → `Fires 4 HA bus events (transaction_added, recurring_executed, balance_adjusted, low_balance). Transactions are kept permanently.`

- [x] **Step 7: Verify no stale references remain in the component**

Run: `grep -rn "DEFAULT_MAX_TRANSACTIONS\|EVENT_TRANSACTIONS_TRIMMED\|max_transactions\|_fire_trimmed_event\|transactions_trimmed" custom_components/ tests/`
Expected: no matches (the services/panel call sites `account.add_transaction(transaction)` never used the return value, so nothing else changes).

- [x] **Step 8: Run the finance test suite**

Run: `.venv/bin/pytest tests/ha_finance -v`
Expected: ALL PASS, including `test_add_transaction_never_trims`.

- [x] **Step 9: Commit**

```bash
git add tests/ha_finance/test_models.py custom_components/ha_finance/ .gitignore
git commit -m "fix(ha_finance): keep transactions permanently, remove 1000-tx trimming"
```

---

### Task 3: `ha_health_record` — remove record pruning (TDD)

**Files:**
- Modify: `tests/ha_health_record/test_coordinator.py:13-18,254-278`
- Modify: `custom_components/ha_health_record/coordinator.py:17-28,33,282-301,376`
- Modify: `custom_components/ha_health_record/const.py:22`
- Modify: `custom_components/ha_health_record/__init__.py:54` (docstring)

- [x] **Step 1: Replace the pruning test and drop the `MAX_RECORDS` import**

In `tests/ha_health_record/test_coordinator.py`:

1. Change the import (lines 13-18) to remove `MAX_RECORDS`:

```python
from custom_components.ha_health_record.coordinator import (
    HealthRecordCoordinator,
    Record,
    RecordSet,
)
```

2. Replace the whole `test_prune_records_at_max` method (lines 254-278) with:

```python
    async def test_records_never_pruned(self, coordinator):
        """Records are kept permanently -- exceeding the old 10,000 limit loses nothing."""
        old_limit = 10_000
        for i in range(old_limit):
            coordinator.records.append({
                "id": f"rec_{i}",
                "record_type": "feeding",
                "record_name": "Feeding",
                "value": float(i),
                "unit": "ml",
                "note": "",
                "timestamp": f"2025-01-01T{i % 24:02d}:00:00+00:00",
            })

        # Log one more record past the old limit
        coordinator.set_record_value("feeding", 999.0)
        coordinator.log_record("feeding")

        assert len(coordinator.records) == old_limit + 1
        assert coordinator.records[0]["id"] == "rec_0"  # oldest still present
        assert coordinator.records[-1]["value"] == 999.0
```

- [x] **Step 2: Run the new test to verify it fails**

Run: `.venv/bin/pytest tests/ha_health_record/test_coordinator.py -v -k never_pruned`
Expected: FAIL — count is 10,000 (rec_0 pruned).

- [x] **Step 3: Remove pruning from the coordinator**

In `custom_components/ha_health_record/coordinator.py`:
1. Remove `EVENT_RECORDS_PRUNED,` from the `.const` import (line 25).
2. Delete line 33: `MAX_RECORDS = 10_000  # oldest records are pruned beyond this limit`.
3. Delete the whole `_prune_records` method (lines 282-301).
4. In `log_record`, delete the call `self._prune_records()` (line 376).

- [x] **Step 4: Remove the event constant and docstring mention**

1. `custom_components/ha_health_record/const.py`: delete line 22 (`EVENT_RECORDS_PRUNED = f"{DOMAIN}_records_pruned"`).
2. `custom_components/ha_health_record/__init__.py` docstring: delete the line `` * ``ha_health_record_records_pruned``  -- fired after old records are pruned ``.

- [x] **Step 5: Verify no stale references remain**

Run: `grep -rn "MAX_RECORDS\|EVENT_RECORDS_PRUNED\|_prune_records\|records_pruned" custom_components/ tests/`
Expected: no matches.

- [x] **Step 6: Run the health-record test suite**

Run: `.venv/bin/pytest tests/ha_health_record -v`
Expected: ALL PASS.

- [x] **Step 7: Commit**

```bash
git add tests/ha_health_record/test_coordinator.py custom_components/ha_health_record/
git commit -m "fix(ha_health_record): keep records permanently, remove 10k pruning"
```

---

### Task 4: Full suite + repo-wide sweep

- [x] **Step 1: Run the entire pytest suite**

Run: `.venv/bin/pytest -q`
Expected: ALL PASS (merge-gate check #1).

- [x] **Step 2: Repo-wide sweep for leftovers (excluding docs, handled next)**

Run: `grep -rni "trimmed\|pruned" custom_components/ tests/ | grep -vi "whitespace"`
Expected: no matches. (The remaining "trimmed" hits in `ha_note_record`/`ha_asset_record` are whitespace-trimming docs — leave them.)

No commit needed if nothing found.

---

### Task 5: Documentation updates

**Files:**
- Modify: `README.md` (lines ~148, 320, 370, 1374, 1399, 1572)
- Modify: `README_zh-TW.md` (same mirrored lines)
- Modify: `docs/ha_finance_services_guide.md:429`

- [x] **Step 1: Update `README.md`**

1. Line 148 — delete the table row `| \`ha_health_record_records_pruned\` | ... |`.
2. Line 320 — replace the sentence `Records exceeding 10,000 per member are auto-pruned (oldest removed).` with `Records are kept permanently.`
3. Line 370 — delete the bullet `- May fire \`ha_health_record_records_pruned\` if records exceed 10,000`.
4. Line 1374 — delete the table row `| \`ha_finance_transactions_trimmed\` | ... |`.
5. Line 1399 — delete the table row `| \`DEFAULT_MAX_TRANSACTIONS\` | 1000 | ... |`.
6. Line 1572 — delete the bullet `- May fire \`ha_finance_transactions_trimmed\` if transactions exceed 1000`.

- [x] **Step 2: Update `README_zh-TW.md` (mirrored lines)**

1. Line 148 — delete the `ha_health_record_records_pruned` row.
2. Line 320 — replace 「每位成員超過 10,000 筆記錄時自動修剪（移除最舊記錄）。」 with 「記錄永久保留。」
3. Line 370 — delete 「- 記錄超過 10,000 筆時可能觸發 …」.
4. Line 1374 — delete the `ha_finance_transactions_trimmed` row.
5. Line 1399 — delete the `DEFAULT_MAX_TRANSACTIONS` row.
6. Line 1572 — delete 「- 交易超過 1000 筆時可能觸發 …」.

- [x] **Step 3: Update the services guide**

`docs/ha_finance_services_guide.md` line 429: delete the row `| \`ha_finance_transactions_trimmed\` | Oldest transactions pruned (>1000 limit) |`.

- [x] **Step 4: Final docs sweep**

Run: `grep -rni "trimmed\|pruned\|max_transactions\|MAX_RECORDS" README.md README_zh-TW.md docs/ --include='*.md' | grep -vE 'docs/(plans|design)/'`
Expected: no retention-related matches (spec/plan files under `docs/design/` and `docs/plans/` are exempt).

- [x] **Step 5: Commit**

```bash
git add README.md README_zh-TW.md docs/ha_finance_services_guide.md
git commit -m "docs: records are kept permanently; remove trimmed/pruned event docs"
```

---

### Task 6: Push branch + open PR (do NOT merge)

- [x] **Step 1: Push**

```bash
cd /home/woowtechcluster1/Woow_ha_records
git push -u origin fix/permanent-retention
```

- [x] **Step 2: Open the PR** (extract token from the remote; never echo it)

```bash
export GH_TOKEN=$(git remote get-url origin | sed -E 's#https://[^:]+:([^@]+)@.*#\1#')
gh pr create --repo WOOWTECH/Woow_ha_records \
  --base main --head fix/permanent-retention \
  --title "fix: keep finance transactions and health records permanently" \
  --body "$(cat <<'EOF'
## Summary
- ha_finance: remove 1000-transaction-per-account trimming (`DEFAULT_MAX_TRANSACTIONS`, `ha_finance_transactions_trimmed` event, trim logic in `Account.add_transaction`)
- ha_health_record: remove 10,000-record-per-member pruning (`MAX_RECORDS`, `_prune_records`, `ha_health_record_records_pruned` event)
- Tests replaced with permanent-retention assertions; docs updated

Spec: docs/superpowers/specs/2026-07-13-permanent-retention-design.md

## Merge gate (per spec)
- [x] pytest full suite green
- [ ] k3s E2E on disposable HA instance (`ha-records-test` ns) — report will be attached as a comment

**Do not merge until the E2E report is attached and reviewed.**
EOF
)"
```

Expected: PR URL printed. Report it to the user.

---

### Task 7: k3s E2E harness (manifests + scripts, committed to the branch)

**Files:**
- Create: `e2e/k3s/ha-test.yaml`
- Create: `e2e/k3s/onboard.sh`
- Create: `e2e/k3s/token.sh`
- Create: `e2e/k3s/bootstrap.sh`
- Create: `e2e/k3s/retention_test.py`

- [x] **Step 1: Write the k8s manifest**

Create `e2e/k3s/ha-test.yaml`. Notes: PVC (not emptyDir) so `.storage` survives pod restart (merge-gate check #6); initContainer clones the branch and copies `custom_components` on every pod start; credentials come from a Secret created at deploy time (Task 8), never from this file.

```yaml
# Disposable Home Assistant instance for retention E2E testing.
# Deploy:   see e2e/k3s/onboard.sh header for the full sequence
# Teardown: kubectl delete namespace ha-records-test
apiVersion: v1
kind: Namespace
metadata:
  name: ha-records-test
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ha-config
  namespace: ha-records-test
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: homeassistant
  namespace: ha-records-test
spec:
  replicas: 1
  strategy:
    type: Recreate   # RWO PVC: old pod must release before new pod starts
  selector:
    matchLabels:
      app: homeassistant
  template:
    metadata:
      labels:
        app: homeassistant
    spec:
      initContainers:
        - name: fetch-components
          image: alpine/git:latest
          command: ["/bin/sh", "-c"]
          args:
            - |
              set -e
              rm -rf /tmp/repo
              git clone --depth 1 -b fix/permanent-retention \
                "https://${GIT_USER}:${GIT_TOKEN}@github.com/WOOWTECH/Woow_ha_records.git" /tmp/repo
              mkdir -p /config/custom_components
              cp -r /tmp/repo/custom_components/. /config/custom_components/
          envFrom:
            - secretRef:
                name: repo-credentials
          volumeMounts:
            - name: config
              mountPath: /config
      containers:
        - name: homeassistant
          image: ghcr.io/home-assistant/home-assistant:2025.1
          ports:
            - containerPort: 8123
          volumeMounts:
            - name: config
              mountPath: /config
          readinessProbe:
            httpGet:
              path: /manifest.json
              port: 8123
            initialDelaySeconds: 30
            periodSeconds: 5
            failureThreshold: 24
      volumes:
        - name: config
          persistentVolumeClaim:
            claimName: ha-config
---
apiVersion: v1
kind: Service
metadata:
  name: homeassistant
  namespace: ha-records-test
spec:
  selector:
    app: homeassistant
  ports:
    - port: 8123
      targetPort: 8123
```

- [x] **Step 2: Write the onboarding + token scripts**

Create `e2e/k3s/onboard.sh` (mode 755). Completes fresh-HA onboarding (owner user `admin`/`admin123`, matching `e2e/run-tests.sh` conventions), **saves the refresh token** to `/tmp/ha-records-test.refresh`, and prints an access token on stdout:

```bash
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
```

Create `e2e/k3s/token.sh` (mode 755). Mints a fresh ~30-min access token from the saved refresh token — call it at the start of every Task 8 phase:

```bash
#!/bin/bash
# Print a fresh access token using the refresh token saved by onboard.sh.
set -euo pipefail
HA="${HA_BASE_URL:-http://localhost:18125}"
REFRESH=$(cat /tmp/ha-records-test.refresh)
curl -sf -X POST "$HA/auth/token" \
  -d "grant_type=refresh_token&refresh_token=$REFRESH&client_id=$HA/" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'
```

- [x] **Step 2b: Write the bootstrap script (creates the first config entries)**

Create `e2e/k3s/bootstrap.sh` (mode 755). On a fresh HA neither integration is loaded (config-flow-only; `ha_health_record` has no `async_setup`), so their services don't exist yet. This creates one config entry per domain via the config-flow REST API with **known, fixed IDs**, which loads the integrations and registers all services:

```bash
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
```

(Field keys verified against `config_flow.py`: finance `account_name`/`account_id`/`initial_balance`; health `member_name`/`member_id` — both flows honor the explicit IDs.)

- [x] **Step 3: Write the retention test script**

Create `e2e/k3s/retention_test.py` (mode 755). Python stdlib only. Assumes `bootstrap.sh` already created the account/member entries with the fixed IDs. Two phases so the pod restart happens between them; auto-refreshes the access token on 401 using `/tmp/ha-records-test.refresh`:

```python
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
ACCOUNT_ID = "retention_test_acct"    # created by bootstrap.sh
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
    """Return (transaction_count, balance) via ha_finance.get_account."""
    resp = call("ha_finance", "get_account", {"account_id": ACCOUNT_ID}, response=True)
    account = resp.get("account", {})
    return len(account.get("transactions", [])), account.get("balance", -1.0)


def health_record_count() -> int:
    resp = call(
        "ha_health_record", "get_records",
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
        call("ha_finance", "add_transaction",
             {"account_id": ACCOUNT_ID, "amount": 1.0, "note": f"tx_{i}"})
        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{FINANCE_TX}")

    print(f"== Seeding health: {HEALTH_RECORDS} records ==")
    # type_id is auto-generated from name: "Feeding" -> "feeding"
    call("ha_health_record", "add_record_type",
         {"member_id": MEMBER_ID, "name": "Feeding", "unit": "ml"})
    for i in range(HEALTH_RECORDS):
        call("ha_health_record", "log_record",
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
```

(Response shapes verified against `services.py` on this branch: `get_account` → `{"account": {"balance", "transactions": [...]}}`; `get_records` → `{"records": [...]}`; `add_record_type` requires `member_id`/`name`/`unit` and generates `type_id` from `name`. The account/member are NOT created here — `bootstrap.sh` creates them via config flow because `ha_finance.add_account` auto-generates IDs and `ha_health_record.add_member` requires an existing entry to even be registered.)

- [x] **Step 4: Commit the harness**

```bash
chmod +x e2e/k3s/onboard.sh e2e/k3s/token.sh e2e/k3s/bootstrap.sh e2e/k3s/retention_test.py
git add e2e/k3s/
git commit -m "test(e2e): add disposable k3s HA retention test harness"
git push
```

---

### Task 8: Run the k3s E2E merge gate

No repo file changes — this task produces the test report.

- [x] **Step 1: Create namespace + credentials Secret + deploy**

```bash
cd /home/woowtechcluster1/Woow_ha_records
GIT_URL=$(git remote get-url origin)
GIT_USER=$(echo "$GIT_URL" | sed -E 's#https://([^:]+):.*#\1#')
GIT_TOKEN=$(echo "$GIT_URL" | sed -E 's#https://[^:]+:([^@]+)@.*#\1#')

kubectl apply -f e2e/k3s/ha-test.yaml
kubectl -n ha-records-test create secret generic repo-credentials \
  --from-literal=GIT_USER="$GIT_USER" --from-literal=GIT_TOKEN="$GIT_TOKEN" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n ha-records-test rollout restart deployment/homeassistant  # pick up secret if pod raced it
kubectl -n ha-records-test rollout status deployment/homeassistant --timeout=600s
```

Expected: `deployment "homeassistant" successfully rolled out`.

- [x] **Step 2: Port-forward, onboard, bootstrap config entries**

Port-forward PID goes to a file (shell job control does not survive separate command blocks). Run `onboard.sh` and `bootstrap.sh` in the SAME shell block — `bootstrap.sh` needs the `HA_TOKEN` exported by the onboarding line:

```bash
kubectl -n ha-records-test port-forward svc/homeassistant 18125:8123 >/tmp/pf.log 2>&1 &
echo $! > /tmp/pf.pid
sleep 3
export HA_BASE_URL=http://localhost:18125
export HA_TOKEN=$(bash e2e/k3s/onboard.sh)
curl -sf -H "Authorization: Bearer $HA_TOKEN" $HA_BASE_URL/api/ && echo OK
bash e2e/k3s/bootstrap.sh
```

Expected: `{"message": "API running."}`, `OK`, then `Created ha_finance entry.` and `Created ha_health_record entry.` — this loads both integrations and registers their services (they are config-flow-only; without an entry the services don't exist). Gate #2 partially verified here.

- [x] **Step 3: Seed past the old limits (gates #3 and #4)**

Mint a fresh token first (the onboarding token may be near its ~30-min expiry):

```bash
export HA_TOKEN=$(bash e2e/k3s/token.sh)
python3 e2e/k3s/retention_test.py seed 2>&1 | tee /tmp/retention-seed.log
```

Expected: `PASS finance transactions retained: 1100`, `PASS finance balance correct: 1100.0`, `PASS health records retained: 10100`, exit 0. (Sequential REST calls: expect roughly 5-15 minutes for the 11,200 calls; the script auto-refreshes its token on 401. NOT idempotent — to retry after a partial failure, delete the namespace and restart from Step 1.)

- [x] **Step 4: Log check — no errors, no trim/prune mentions (gates #2 and #5)**

```bash
kubectl -n ha-records-test logs deployment/homeassistant | grep -iE "error.*(ha_finance|ha_health_record)|trimmed|pruned" || echo CLEAN
```

Expected: `CLEAN`. (The trim/prune code paths no longer exist, so the events cannot fire; log absence is the verification.)

- [x] **Step 5: Restart pod, verify persistence (gate #6)**

```bash
kubectl -n ha-records-test rollout restart deployment/homeassistant
kubectl -n ha-records-test rollout status deployment/homeassistant --timeout=600s
kill $(cat /tmp/pf.pid) 2>/dev/null
kubectl -n ha-records-test port-forward svc/homeassistant 18125:8123 >/tmp/pf.log 2>&1 &
echo $! > /tmp/pf.pid
sleep 5
export HA_TOKEN=$(bash e2e/k3s/token.sh)   # fresh token; auth state persisted on PVC
python3 e2e/k3s/retention_test.py verify
```

Expected: all three PASS lines again, exit 0. Onboarding does not re-run — users/entries/records are all in `.storage` on the PVC, and the refresh token remains valid across restarts.

- [x] **Step 6: Frontend panel check (gate #7)**

Run the existing Playwright suite against the instance (covers panels loading and browsing):

```bash
cd e2e && HA_BASE_URL=http://localhost:18125 HA_USERNAME=admin HA_PASSWORD=admin123 \
  ./run-tests.sh tests/finance-record.spec.ts tests/health-record.spec.ts
```

Expected: tests pass. If the suite has environment problems unrelated to retention (e.g. missing xvfb), fall back to a manual check: `curl -sf $HA_BASE_URL/ha-finance-panel/ && curl -sf $HA_BASE_URL/ha-health-record/` return HTTP 200, and note the fallback in the report.

- [x] **Step 7: Write the report and attach to the PR**

Compose `/tmp/retention-e2e-report.md` summarizing all 7 gate results (PASS/FAIL each, with counts and durations). **The report must state explicitly** that gate #5 (zero trimmed/pruned events) is verified by log absence plus the fact that the event-firing code paths were deleted from the codebase — a live event listener is unnecessary since the events can no longer be constructed. Then:

```bash
export GH_TOKEN=$(git -C /home/woowtechcluster1/Woow_ha_records remote get-url origin | sed -E 's#https://[^:]+:([^@]+)@.*#\1#')
gh pr comment --repo WOOWTECH/Woow_ha_records fix/permanent-retention --body-file /tmp/retention-e2e-report.md
```

---

### Task 9: Teardown + hand off to user

- [x] **Step 1: Teardown ONLY after user confirms** they don't want to inspect the instance:

```bash
kill $(cat /tmp/pf.pid) 2>/dev/null  # stop port-forward
kubectl delete namespace ha-records-test
rm -f /tmp/ha-records-test.refresh /tmp/pf.pid
```

- [x] **Step 2: Report to user**: PR URL, E2E report summary, reminder that merging is the user's call (per spec, the agent never merges).
