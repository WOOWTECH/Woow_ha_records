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

## Refused calls over REST: the reason never reaches you

Every validation failure in this integration is raised as a
`ServiceValidationError` with a translated message saying what went wrong and
what to do. **Over REST, none of that reaches the caller.** Home Assistant
core's handler for `POST /api/services/...` maps only schema errors and
`ServiceNotFound` to HTTP 400; a `ServiceValidationError` falls through to a
bare `HTTP 500` with the generic body `Server got itself in trouble`. The
message lands in the HA log and nowhere else.

This is upstream Home Assistant behaviour on every core version to date, and
nothing in this integration can change the status code or body:

- [home-assistant/core#121219](https://github.com/home-assistant/core/issues/121219)
- [home-assistant/core#106379](https://github.com/home-assistant/core/issues/106379)
- [home-assistant/architecture#992](https://github.com/home-assistant/architecture/discussions/992)

**If you need to read the refusal reason — AI assistants included — call the
service over the WebSocket API instead.** The `call_service` command's error
frame preserves the translated message and the translation key:

```jsonc
// → {"id": 5, "type": "call_service", "domain": "woow_ha_records",
//    "service": "note_delete_category", "service_data": {"category_id": "..."},
//    "return_response": true}
// ←
{
  "id": 5,
  "type": "result",
  "success": false,
  "error": {
    "code": "service_validation_error",
    "message": "Category 'Inbox' still holds 3 note(s), and deleting it deletes them too. Pass force: true to confirm.",
    "translation_key": "note.category_not_empty",
    "translation_domain": "woow_ha_records"
  }
}
```

Home Assistant's own LLM tool-calling path surfaces the same message. REST
remains a fully supported surface for calls that succeed; it is only the
refusal *reason* it cannot deliver. The error-path e2e tests in
`e2e/tests/<area>-services.spec.ts` assert on these WebSocket error frames for
exactly this reason.

## Where else to look

- Command overview for all 37 WebSocket commands: [root README](../../README.md#command-index)
  ([中文](../../README_zh-TW.md#指令索引))
- Service definitions: `custom_components/woow_ha_records/services.yaml`
- Service tests: `e2e/tests/<area>-services.spec.ts`
- Vocabulary: [CONTEXT.md](../../CONTEXT.md) — Area, Account, Member, Record Type
- Why one integration and not four: [ADR-0001](../adr/0001-merge-four-integrations-into-one-domain.md)
