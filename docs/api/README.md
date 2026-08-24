# API Reference Index

One folder per integration. Two different API surfaces live side by side:

- **`websocket.md`** — WebSocket commands used by the custom panel frontend.
  Split out of the root README; available in English and Traditional Chinese.
- **`services.md`** — Home Assistant services (`POST /api/services/<domain>/<service>`),
  the surface intended for automations and AI agents. English only.

## Documents

| Integration | WebSocket (EN) | WebSocket (中文) | Services (EN) |
|---|---|---|---|
| `ha_health_record` | [websocket.md](ha_health_record/websocket.md) | [websocket.zh-TW.md](ha_health_record/websocket.zh-TW.md) | [services.md](ha_health_record/services.md) |
| `ha_asset_record` | [websocket.md](ha_asset_record/websocket.md) | [websocket.zh-TW.md](ha_asset_record/websocket.zh-TW.md) | — *(not written yet)* |
| `ha_note_record` | [websocket.md](ha_note_record/websocket.md) | [websocket.zh-TW.md](ha_note_record/websocket.zh-TW.md) | — *(not written yet)* |
| `ha_finance` | [websocket.md](ha_finance/websocket.md) | [websocket.zh-TW.md](ha_finance/websocket.zh-TW.md) | [services.md](ha_finance/services.md) |

**Missing on purpose, not lost:** `ha_asset_record` (10 services) and `ha_note_record`
(9 services) have no services guide yet. Their services are declared in each
integration's `services.yaml`. There are no Chinese translations of the services
guides — that is the current state, not a broken link.

## Where else to look

- Command overview table for all 34 WebSocket commands: [root README](../../README.md#command-index)
  ([中文](../../README_zh-TW.md#指令索引))
- Service definitions: `custom_components/<domain>/services.yaml`
- Service tests: `e2e/tests/<domain>-services.spec.ts`
