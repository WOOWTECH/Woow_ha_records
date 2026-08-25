# API Reference Index

One folder per Area. Two different API surfaces live side by side:

- **`websocket.md`** — WebSocket commands (`woow_ha_records/<area>/<verb>`) used by
  the custom panels. Available in English and Traditional Chinese.
- **`services.md`** — Home Assistant services
  (`POST /api/services/woow_ha_records/<area>_<verb>`), the surface intended for
  automations and AI agents. English only.

## Documents

| Area | WebSocket (EN) | WebSocket (中文) | Services (EN) |
|---|---|---|---|
| health | [websocket.md](health/websocket.md) | [websocket.zh-TW.md](health/websocket.zh-TW.md) | [services.md](health/services.md) |
| asset | [websocket.md](asset/websocket.md) | [websocket.zh-TW.md](asset/websocket.zh-TW.md) | — *(not written yet)* |
| note | [websocket.md](note/websocket.md) | [websocket.zh-TW.md](note/websocket.zh-TW.md) | — *(not written yet)* |
| finance | [websocket.md](finance/websocket.md) | [websocket.zh-TW.md](finance/websocket.zh-TW.md) | [services.md](finance/services.md) |

**Missing on purpose, not lost:** the asset Area (10 services) and the note Area
(9 services) have no services guide yet. Every service is declared in
`custom_components/woow_ha_records/services.yaml`. There are no Chinese
translations of the services guides — that is the current state, not a broken
link.

## Where else to look

- Command overview for all 37 WebSocket commands: [root README](../../README.md#command-index)
  ([中文](../../README_zh-TW.md#指令索引))
- Service definitions: `custom_components/woow_ha_records/services.yaml`
- Service tests: `e2e/tests/<area>-services.spec.ts`
- Vocabulary: [CONTEXT.md](../../CONTEXT.md) — Area, Account, Member, Record Type
- Why one integration and not four: [ADR-0001](../adr/0001-merge-four-integrations-into-one-domain.md)
