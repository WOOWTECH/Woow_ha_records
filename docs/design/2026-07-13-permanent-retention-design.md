# Permanent Record Retention — Design

**Date:** 2026-07-13
**Branch:** `fix/permanent-retention`
**Status:** Approved by user

## Problem

Two of the four custom components silently delete the user's oldest data
once a hard-coded limit is reached. There is no configuration option to
change or disable this behavior, so long-term records are lost.

| Component | Limit | Behavior |
|---|---|---|
| `ha_finance` | `DEFAULT_MAX_TRANSACTIONS = 1000` per account (`const.py:41`) | `Account.add_transaction()` slices off oldest transactions (`models.py:179-181`); coordinator fires `ha_finance_transactions_trimmed` |
| `ha_health_record` | `MAX_RECORDS = 10_000` per member (`coordinator.py:33`) | `_prune_records()` deletes oldest records (`coordinator.py:282-301`); fires `ha_health_record_records_pruned` |

`ha_asset_record` and `ha_note_record` were audited and contain no
retention trimming (only field-length validation), so they are out of
scope.

## Decision

**Remove the limits entirely** (option A of A/B/C considered):
delete the trim/prune logic, the constants, and the now-meaningless
events. Records are kept permanently.

Rationale: these are record-keeping components; silently deleting data
contradicts their purpose. Both components persist via Home Assistant's
`Store` helper (JSON in `.storage/`). At household scale (tens of
entries per day) the files grow a few MB over years, which is
acceptable. No safety valve or config option is added (YAGNI); the
existing test suite even marks the trimming as "BUG"
(`tests/ha_finance/test_models.py:123`).

Alternatives rejected:
- **Warn-only high watermark:** keeps dead code paths and an event that
  no longer means anything actionable.
- **Configurable limit via options flow:** most work, and under a
  "keep forever" requirement nobody would set it.

## Changes

### `ha_finance`

| File | Change |
|---|---|
| `const.py` | Delete `EVENT_TRANSACTIONS_TRIMMED` (line 36) and `DEFAULT_MAX_TRANSACTIONS` (line 41) |
| `models.py` | `Account.add_transaction()`: remove `max_transactions` parameter and trim block; return type `bool` → `None` |
| `coordinator.py` | Remove `max_transactions=` argument and `if trimmed:` branches at the 3 call sites (lines 147, 250, 304); delete `_fire_trimmed_event()` (lines 273-286); remove unused imports |
| `__init__.py` | Remove event mention (line 48) and `max_transactions -- 1000` configuration default (line 54) from module docstring |
| `panel.py` | Remove event mention from docstring (line 61) |
| `manifest.json` | Update `description` (line 4): event count and `transactions_trimmed` name are stale after removal |

### `ha_health_record`

| File | Change |
|---|---|
| `coordinator.py` | Delete `MAX_RECORDS` (line 33), `_prune_records()` (lines 282-301), and its call site (line 376); remove unused imports |
| `const.py` | Delete `EVENT_RECORDS_PRUNED` (line 22) |
| `__init__.py` | Remove event mention from module docstring (line 54) |

### Tests (change first — TDD)

| File | Change |
|---|---|
| `tests/ha_finance/test_models.py` | Replace the trimming test (~line 123, self-labelled "BUG") with an inverse test: add 1001+ transactions, assert **all retained** and balance correct |
| `tests/ha_health_record/test_coordinator.py` | Replace `test_prune_records_at_max` (lines 254-276) with an inverse test: exceed 10,000 records, assert **all retained** and no event fired. **Also remove the `MAX_RECORDS` import (line 14)** — if forgotten, pytest collection fails for the whole file once the constant is deleted |

### Documentation

| File | Change |
|---|---|
| `README.md` | Remove **all** mentions of trimmed/pruned events and limits (known: lines ~148, 320, 370, 1374, 1399, 1572 — grep for `trimmed`/`pruned`/`1000`/`10,000` to catch any others); state that records are kept permanently |
| `README_zh-TW.md` | Same mentions (mirrored lines, including 320 「自動修剪」) |
| `docs/ha_finance_services_guide.md` | Remove the `ha_finance_transactions_trimmed` row (line 429) |

## Merge Gate: k3s E2E Test

A fresh, disposable Home Assistant instance is deployed to the local
k3s cluster in a new namespace `ha-records-test` (official
`homeassistant` image; `custom_components` from this branch mounted via
ConfigMap or initContainer clone). Existing `home-assistant` /
`paas-test-homeassistant` namespaces are not touched.

All checks must pass before merge:

| # | Test | Pass criterion |
|---|---|---|
| 1 | `pytest` full suite | All green |
| 2 | HA startup | Both components load; no errors in log |
| 3 | Finance: insert 1,100 transactions (WS/service) | All 1,100 retained; balance correct |
| 4 | Health: insert 10,100 records | All 10,100 retained |
| 5 | Event listener during 3-4 | Zero `*_trimmed` / `*_pruned` events |
| 6 | Restart HA pod | Record counts unchanged (`.storage` persisted) |
| 7 | Frontend panels | Open and browse normally with large datasets |

The namespace is deleted after testing.

## Delivery

1. Feature branch `fix/permanent-retention` off `main`.
2. TDD: update tests first, then implementation; `pytest` green.
3. Push branch, open PR; attach the k3s E2E test report to the PR.
4. User reviews and merges. The agent never merges.

## Error Handling / Risks

- **Large stores:** `Store.async_delay_save` (health) and full-file
  rewrites (finance) still work with larger JSON files; write frequency
  is unchanged. No migration is needed — existing stores load as-is.
- **External automations** listening for the removed events will simply
  never trigger again; the events are documented as removed in the
  READMEs.
