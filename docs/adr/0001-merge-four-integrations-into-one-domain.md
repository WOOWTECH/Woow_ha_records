---
status: accepted
---

# Merge the four integrations into a single `woow_ha_records` domain

HACS installs exactly one integration per repository. This repo shipped four
(`ha_asset_record`, `ha_finance`, `ha_health_record`, `ha_note_record`), so
distribution went through a workflow that mirrored each one into its own
publish repo — four repos, four release streams, four things to keep in step.
We collapsed the four into a single domain, `woow_ha_records`, partitioned
internally by Area, so the monorepo itself is the HACS repository and the
mirroring workflow could be deleted.

## Considered options

**Automatic migration of existing installs** was rejected on evidence, not
principle. At the time of the decision the four publish repos were eight days
old with zero stars and one release each, and the only known installation held
test fixtures under 1 KB. Four migration paths would have been written and then
maintained forever for no known beneficiary. We took the clean break instead:
version 2.0.0, new domain, new entity IDs, new service names, no migration
code, and users re-enter their data.

**Keeping the old service and WebSocket names** under the new domain would have
preserved the documented API, but four service names collided across the old
domains (`export_csv`, `create_category`, `delete_category`, `list_categories`)
and it would have left a permanent gap between the domain a service lives in
and the name it answers to. Every service and WebSocket command is now prefixed
by its Area instead.

## Consequences

Account and Member stopped being Home Assistant config entries and became
ordinary records inside their Area's store — the integration now has exactly one
config entry. This was the point of alignment: `ha_finance` already kept every
account in a single store with per-account config entries layered on top as
redundant bookkeeping, while `ha_health_record` kept a genuinely separate store
per member. Neither shape survives; both Areas now hold their records in one
store keyed by ID.

Each Area keeps its own store file rather than sharing one. Finance
transactions and health records are retained permanently, so a shared file
would mean every note edit rewrites an ever-growing ledger, and one corrupt
write would take all four Areas down together.
