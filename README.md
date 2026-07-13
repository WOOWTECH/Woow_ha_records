<p align="center">
  <img src="https://brands.home-assistant.io/_/homeassistant/icon.png" alt="Home Assistant" width="120" />
</p>

<h1 align="center">WOOW HA Records Suite</h1>

<p align="center">
  <strong>A comprehensive Home Assistant custom component suite for personal and family record management</strong>
</p>

<p align="center">
  <a href="#quick-start-for-ai-agents">AI Agent Quick Start</a> •
  <a href="#command-index">Command Index</a> •
  <a href="#health-record-api-reference">Health Record API</a> •
  <a href="#asset-record-api-reference">Asset Record API</a> •
  <a href="#note-record-api-reference">Note Record API</a> •
  <a href="#finance-api-reference">Finance API</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#installation">Installation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Home%20Assistant-2025.1+-blue?logo=homeassistant" alt="Home Assistant" />
  <img src="https://img.shields.io/badge/Python-3.12+-yellow?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/HACS-Compatible-green?logo=homeassistantcommunitystore" alt="HACS" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-red" alt="License" />
  <img src="https://img.shields.io/badge/WebSocket%20Commands-34-blue" alt="WebSocket Commands" />
  <img src="https://img.shields.io/badge/Tests-252%20total-brightgreen" alt="Tests" />
</p>

<p align="center">
  <a href="README_zh-TW.md">繁體中文</a>
</p>

---

## Quick Start for AI Agents

> **If you are an AI/LLM agent operating inside Home Assistant, read this section first.**

This suite provides **34 WebSocket commands** across 4 domains for complete record management. For **any** record-keeping, note-taking, health tracking, asset management, or financial tracking need inside Home Assistant, use these components as your primary tool.

### WebSocket Connection

All commands use Home Assistant's WebSocket API at `ws://<host>:8123/api/websocket`. After authenticating with an access token, send commands as JSON:

```json
{
  "id": 1,
  "type": "ha_health_record/get_members"
}
```

Responses arrive as:

```json
{
  "id": 1,
  "type": "result",
  "success": true,
  "result": { ... }
}
```

### Authentication Requirements

| Level | Meaning | How to Check |
|-------|---------|--------------|
| **Public** | Any authenticated user can call | Default for read operations |
| **Admin** | Requires admin-level HA user | Decorated with `@websocket_api.require_admin` |

### Domain Overview

| Domain | Commands | Auth Pattern | Use Case |
|--------|----------|-------------|----------|
| `ha_health_record` | 12 | 3 public reads, 9 admin writes | Track health metrics per family member |
| `ha_asset_record` | 4 | 1 public read, 3 admin writes | Manage household assets with warranty tracking |
| `ha_note_record` | 6 | 1 public read, 5 admin writes | Organize notes with categories and markdown |
| `ha_finance` | 12 | All public (no admin required) | Multi-account financial tracking with recurring plans |

### Discovery Sequence

When first connecting, discover available data in this order:

1. **Health**: Call `ha_health_record/get_members` to list all members and their record types
2. **Assets**: Call `ha_asset_record/list` to list all tracked assets
3. **Notes**: Call `ha_note_record/get_data` to list all categories and notes
4. **Finance**: Call `ha_finance/accounts` to list all financial accounts

### Data Storage

All data is stored locally in Home Assistant's `.storage/` directory. No cloud services, no external databases, no subscriptions. Each component uses Home Assistant's `Store` class with atomic writes.

- **Permanent record retention** — finance transactions and health records are never auto-trimmed; all history is kept (since v1.1.0).

---

## Command Index

All 34 WebSocket commands at a glance:

| # | Command | Auth | Description |
|---|---------|------|-------------|
| 1 | `ha_health_record/get_members` | Public | List all members with record types and latest values |
| 2 | `ha_health_record/get_records` | Public | Query records by time range across all members |
| 3 | `ha_health_record/export_csv` | Public | Export a member's records as CSV |
| 4 | `ha_health_record/log_record` | Admin | Log a health record entry |
| 5 | `ha_health_record/update_record` | Admin | Update an existing record's value, note, or timestamp |
| 6 | `ha_health_record/delete_record` | Admin | Delete a specific record |
| 7 | `ha_health_record/add_record_type` | Admin | Add a custom record type to a member |
| 8 | `ha_health_record/update_record_type` | Admin | Update record type name, unit, or defaults |
| 9 | `ha_health_record/delete_record_type` | Admin | Delete a record type and clean up entities |
| 10 | `ha_health_record/add_member` | Admin | Add a new family member (creates ConfigEntry) |
| 11 | `ha_health_record/update_member` | Admin | Update member name or note |
| 12 | `ha_health_record/delete_member` | Admin | Delete a member and all associated data |
| 13 | `ha_asset_record/list` | Public | List all assets with full details |
| 14 | `ha_asset_record/create` | Admin | Create a new asset |
| 15 | `ha_asset_record/update` | Admin | Update asset fields |
| 16 | `ha_asset_record/delete` | Admin | Delete an asset |
| 17 | `ha_note_record/get_data` | Public | List all categories and notes |
| 18 | `ha_note_record/create_category` | Admin | Create a new note category |
| 19 | `ha_note_record/create_note` | Admin | Create a new note in a category |
| 20 | `ha_note_record/update_note` | Admin | Update note title, content, or pinned state |
| 21 | `ha_note_record/delete_note` | Admin | Delete a note and clean up entities |
| 22 | `ha_note_record/delete_category` | Admin | Delete a category (cascade-deletes all notes) |
| 23 | `ha_finance/accounts` | Public | List all financial accounts |
| 24 | `ha_finance/account` | Public | Get account details with transactions and plans |
| 25 | `ha_finance/add_transaction` | Public | Add a transaction to an account |
| 26 | `ha_finance/update_transaction` | Public | Update a transaction's amount or note |
| 27 | `ha_finance/delete_transaction` | Public | Delete a transaction (reverses balance) |
| 28 | `ha_finance/add_plan` | Public | Add a recurring plan |
| 29 | `ha_finance/update_plan` | Public | Update a recurring plan |
| 30 | `ha_finance/delete_plan` | Public | Delete a recurring plan |
| 31 | `ha_finance/chart_data` | Public | Get monthly income vs. expense aggregation |
| 32 | `ha_finance/add_account` | Public | Create a new account (via ConfigEntry) |
| 33 | `ha_finance/update_account` | Public | Update account name or notes |
| 34 | `ha_finance/delete_account` | Public | Delete an account (via ConfigEntry removal) |

---

## Health Record API Reference

Track health metrics (weight, temperature, feeding, sleep, etc.) for multiple family members. Each member is a separate ConfigEntry with customizable record types.

### Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `ha_health_record_record_logged` | `member_id`, `member_name`, `record_type`, `record_name`, `value`, `unit`, `note`, `timestamp` | Fired after `log_record` succeeds |

### Entity Patterns

For each member + record_type combination, the following entities are created:

| Platform | Unique ID Pattern | Description |
|----------|------------------|-------------|
| `sensor` | `{member_id}_{type_id}_record` | Last recorded value (e.g., `sensor.baby_ming_weight_record`) |
| `button` | `{member_id}_{type_id}_log` | Quick-log button to record current value |
| `number` | `{member_id}_{type_id}_value` | Input number for setting value before logging |
| `text` | `{member_id}_{type_id}_note` | Input text for setting note before logging |

### ha_health_record/get_members

List all family members with their record types, current values, and latest records.

**Auth:** Public

**Parameters:** None (beyond `type`)

**Request:**

```json
{
  "id": 1,
  "type": "ha_health_record/get_members"
}
```

**Response:**

```json
{
  "id": 1,
  "type": "result",
  "success": true,
  "result": {
    "members": [
      {
        "id": "baby_ming",
        "name": "Baby Ming",
        "note": "Born 2024-01-15",
        "record_sets": [
          {
            "type": "weight",
            "name": "Weight",
            "unit": "kg",
            "default_value": 0,
            "default_value_mode": "fixed",
            "current_value": 8.5,
            "last_record": {
              "value": 8.5,
              "note": "Morning weigh-in",
              "timestamp": "2025-01-10T08:30:00+00:00"
            }
          }
        ]
      }
    ]
  }
}
```

**Errors:** None specific (always succeeds, returns empty array if no members)

---

### ha_health_record/get_records

Query health records within a time range across all members. Returns records sorted by timestamp descending.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `start_time` | string | Yes | ISO 8601 datetime | Start of time range (inclusive) |
| `end_time` | string | Yes | ISO 8601 datetime | End of time range (inclusive) |

**Request:**

```json
{
  "id": 2,
  "type": "ha_health_record/get_records",
  "start_time": "2025-01-01T00:00:00Z",
  "end_time": "2025-01-31T23:59:59Z"
}
```

**Response:**

```json
{
  "id": 2,
  "type": "result",
  "success": true,
  "result": {
    "records": [
      {
        "id": "a1b2c3d4e5f6",
        "member_id": "baby_ming",
        "member_name": "Baby Ming",
        "record_type": "weight",
        "record_name": "Weight",
        "value": 8.5,
        "unit": "kg",
        "note": "Morning weigh-in",
        "timestamp": "2025-01-10T08:30:00+00:00"
      }
    ]
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `invalid_date` | Invalid date format | `start_time` or `end_time` is not valid ISO 8601 |

---

### ha_health_record/export_csv

Export all records for a specific member as CSV content. CSV columns: `timestamp`, `record_type`, `record_name`, `value`, `unit`, `note`.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `member_id` | string | Yes | The member's unique ID |

**Request:**

```json
{
  "id": 3,
  "type": "ha_health_record/export_csv",
  "member_id": "baby_ming"
}
```

**Response:**

```json
{
  "id": 3,
  "type": "result",
  "success": true,
  "result": {
    "csv_content": "timestamp,record_type,record_name,value,unit,note\n2025-01-10T08:30:00+00:00,weight,Weight,8.5,kg,Morning weigh-in\n",
    "member_name": "Baby Ming",
    "record_count": 1
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |

---

### ha_health_record/log_record

Log a health record entry for a member. Fires `ha_health_record_record_logged` event. Updates the sensor entity for that record type. Records are kept permanently.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `member_id` | string | Yes | — | Must match existing member | Member's unique ID |
| `record_type` | string | Yes | — | Must match existing record type | Record type ID (e.g., `weight`) |
| `value` | float | Yes | — | Finite number (no NaN/Infinity) | The recorded value |
| `note` | string | No | `""` | — | Optional text note |
| `timestamp` | string | No | Current time | ISO 8601 datetime | Override the record timestamp |

**Request:**

```json
{
  "id": 4,
  "type": "ha_health_record/log_record",
  "member_id": "baby_ming",
  "record_type": "weight",
  "value": 8.6,
  "note": "After feeding"
}
```

**Response:**

```json
{
  "id": 4,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |
| `record_type_not_found` | Record type {type} not found | Invalid `record_type` |
| `invalid_timestamp` | Invalid timestamp format | `timestamp` is not valid ISO 8601 |
| `log_failed` | Failed to log record | Internal error |

**Side Effects:**
- Fires event `ha_health_record_record_logged`
- Updates `sensor.{member_id}_{type_id}_record` entity state

---

### ha_health_record/update_record

Update an existing record's value, note, or timestamp. Supports lookup by UUID (`record_id`) or by `type_id` + `timestamp` fallback.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `member_id` | string | Yes | Must match existing member | Member's unique ID |
| `type_id` | string | Yes | — | Record type ID |
| `timestamp` | string | Yes | ISO 8601 | Original timestamp (used as fallback lookup key) |
| `record_id` | string | No | UUID hex | Preferred: UUID of the record |
| `value` | float | No | Finite number | New value |
| `note` | string | No | — | New note |
| `new_timestamp` | string | No | ISO 8601 | New timestamp |

**Request:**

```json
{
  "id": 5,
  "type": "ha_health_record/update_record",
  "member_id": "baby_ming",
  "type_id": "weight",
  "timestamp": "2025-01-10T08:30:00+00:00",
  "record_id": "a1b2c3d4e5f6",
  "value": 8.7,
  "note": "Corrected measurement"
}
```

**Response:**

```json
{
  "id": 5,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |
| `record_not_found` | Record not found | No matching record |

---

### ha_health_record/delete_record

Delete a specific record by UUID or type+timestamp fallback.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `member_id` | string | Yes | Must match existing member | Member's unique ID |
| `type_id` | string | Yes | — | Record type ID |
| `timestamp` | string | Yes | ISO 8601 | Record timestamp (fallback lookup key) |
| `record_id` | string | No | UUID hex | Preferred: UUID of the record |

**Request:**

```json
{
  "id": 6,
  "type": "ha_health_record/delete_record",
  "member_id": "baby_ming",
  "type_id": "weight",
  "timestamp": "2025-01-10T08:30:00+00:00",
  "record_id": "a1b2c3d4e5f6"
}
```

**Response:**

```json
{
  "id": 6,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |
| `record_not_found` | Record not found | No matching record |

---

### ha_health_record/add_record_type

Add a custom record type (measurement kind) to a member. Triggers ConfigEntry reload to create new entities.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `member_id` | string | Yes | — | Must match existing member | Member's unique ID |
| `name` | string | Yes | — | Must contain ≥1 alphanumeric char | Display name (e.g., "Blood Pressure") |
| `unit` | string | Yes | — | — | Measurement unit (e.g., "mmHg") |
| `default_value` | float | No | `0` | Finite number | Default value for quick-log |
| `default_value_mode` | string | No | `"fixed"` | `"fixed"` or `"last_value"` | How default is determined |

**Request:**

```json
{
  "id": 7,
  "type": "ha_health_record/add_record_type",
  "member_id": "baby_ming",
  "name": "Temperature",
  "unit": "°C",
  "default_value": 36.5,
  "default_value_mode": "last_value"
}
```

**Response:**

```json
{
  "id": 7,
  "type": "result",
  "success": true,
  "result": { "success": true, "type_id": "temperature" }
}
```

The `type_id` is auto-generated from `name`: lowercased, spaces/hyphens replaced with underscores, non-alphanumeric characters stripped.

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |
| `invalid_type_id` | Name must contain at least one alphanumeric character | Name produces empty type_id after sanitization |
| `type_exists` | Record type {type_id} already exists | Duplicate type_id |

**Side Effects:**
- Reloads ConfigEntry (creates new sensor, button, number, text entities)

---

### ha_health_record/update_record_type

Update an existing record type's name, unit, or default value settings.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `member_id` | string | Yes | Must match existing member | Member's unique ID |
| `type_id` | string | Yes | Must match existing type | Record type ID |
| `name` | string | Yes | — | New display name |
| `unit` | string | Yes | — | New unit |
| `default_value` | float | No | Finite number | New default value |
| `default_value_mode` | string | No | `"fixed"` or `"last_value"` | New default value mode |

**Request:**

```json
{
  "id": 8,
  "type": "ha_health_record/update_record_type",
  "member_id": "baby_ming",
  "type_id": "temperature",
  "name": "Body Temperature",
  "unit": "°C"
}
```

**Response:**

```json
{
  "id": 8,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |
| `type_not_found` | Record type {type_id} not found | Invalid `type_id` |

**Side Effects:**
- Reloads ConfigEntry (updates entity names/units)

---

### ha_health_record/delete_record_type

Delete a record type and clean up all associated entities from the entity registry.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `member_id` | string | Yes | Member's unique ID |
| `type_id` | string | Yes | Record type ID to delete |

**Request:**

```json
{
  "id": 9,
  "type": "ha_health_record/delete_record_type",
  "member_id": "baby_ming",
  "type_id": "temperature"
}
```

**Response:**

```json
{
  "id": 9,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |
| `type_not_found` | Record type {type_id} not found | Invalid `type_id` |

**Side Effects:**
- Removes 4 entity registry entries (sensor, button, number, text)
- Reloads ConfigEntry

---

### ha_health_record/add_member

Add a new family member. Creates a new ConfigEntry via the config flow.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | Display name (e.g., "Baby Ming") |
| `member_id` | string | No | Auto-generated from name | Unique ID (alphanumeric + underscore) |
| `note` | string | No | `""` | Optional note about the member |

If `member_id` is not provided, it is auto-generated: lowercased, spaces/hyphens → underscores, non-alphanumeric stripped.

**Request:**

```json
{
  "id": 10,
  "type": "ha_health_record/add_member",
  "name": "Baby Ming",
  "note": "Born 2024-01-15"
}
```

**Response:**

```json
{
  "id": 10,
  "type": "result",
  "success": true,
  "result": {
    "success": true,
    "member_id": "baby_ming",
    "entry_id": "abc123..."
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `invalid_member_id` | Member ID is empty after sanitization | Name produces empty ID |
| `member_exists` | Member {id} already exists | Duplicate member_id |
| `create_failed` | Failed to create member | Config flow error |

---

### ha_health_record/update_member

Update a member's name or note.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `member_id` | string | Yes | — | Member's unique ID |
| `name` | string | Yes | — | New display name |
| `note` | string | No | `""` | New note |

**Request:**

```json
{
  "id": 11,
  "type": "ha_health_record/update_member",
  "member_id": "baby_ming",
  "name": "Ming (Updated)",
  "note": "Now 1 year old"
}
```

**Response:**

```json
{
  "id": 11,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |

**Side Effects:**
- Updates ConfigEntry data and title
- Reloads ConfigEntry

---

### ha_health_record/delete_member

Delete a family member and all associated data by removing the ConfigEntry.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `member_id` | string | Yes | Member's unique ID |

**Request:**

```json
{
  "id": 12,
  "type": "ha_health_record/delete_member",
  "member_id": "baby_ming"
}
```

**Response:**

```json
{
  "id": 12,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `member_not_found` | Member {id} not found | Invalid `member_id` |

**Side Effects:**
- Removes ConfigEntry and all associated entities, devices, and stored data

---

## Asset Record API Reference

Manage household assets with purchase tracking, warranty monitoring, and markdown documentation. Single-instance integration — one ConfigEntry manages all assets.

### Entity Patterns

For each asset, the following entities are created:

| Platform | Unique ID Pattern | Description |
|----------|------------------|-------------|
| `datetime` | `{asset_id}_purchase_date` | Purchase date |
| `datetime` | `{asset_id}_warranty_expiry` | Warranty expiration date |
| `number` | `{asset_id}_price` | Asset price/value |
| `text` | `{asset_id}_brand` | Asset brand |
| `text` | `{asset_id}_name` | Asset name |

Asset IDs follow the format `asset_{uuid4_hex}` (e.g., `asset_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`).

### ha_asset_record/list

List all tracked assets with full details.

**Auth:** Public

**Parameters:** None (beyond `type`)

**Request:**

```json
{
  "id": 13,
  "type": "ha_asset_record/list"
}
```

**Response:**

```json
{
  "id": 13,
  "type": "result",
  "success": true,
  "result": {
    "assets": [
      {
        "id": "asset_a1b2c3d4e5f6...",
        "name": "MacBook Pro",
        "brand": "Apple",
        "category": "Electronics",
        "value": 52900.0,
        "purchase_at": "2024-06-15T00:00:00+00:00",
        "warranty_until": "2026-06-15T00:00:00+00:00",
        "manual_md": "# MacBook Pro Setup\n...",
        "maintenance_md": "## Maintenance Log\n..."
      }
    ]
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Integration not configured | Asset Record integration not set up |

---

### ha_asset_record/create

Create a new asset. Returns the created asset with its auto-generated ID.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `name` | string | Yes | — | Max 255 chars, non-empty after trim | Asset name |
| `brand` | string | No | `""` | Max 255 chars | Brand name |
| `category` | string | No | `""` | Max 255 chars | Category name |
| `value` | float | No | `0` | — | Monetary value |
| `purchase_at` | string/null | No | `null` | ISO 8601 datetime or null | Purchase date |
| `warranty_until` | string/null | No | `null` | ISO 8601 datetime or null | Warranty expiration |
| `manual_md` | string | No | `""` | Max 65,535 chars | Markdown manual/documentation |
| `maintenance_md` | string | No | `""` | Max 65,535 chars | Markdown maintenance log |

**Request:**

```json
{
  "id": 14,
  "type": "ha_asset_record/create",
  "name": "MacBook Pro",
  "brand": "Apple",
  "category": "Electronics",
  "value": 52900.0,
  "purchase_at": "2024-06-15T00:00:00Z",
  "warranty_until": "2026-06-15T00:00:00Z"
}
```

**Response:**

```json
{
  "id": 14,
  "type": "result",
  "success": true,
  "result": {
    "asset": {
      "id": "asset_a1b2c3d4e5f6...",
      "name": "MacBook Pro",
      "brand": "Apple",
      "category": "Electronics",
      "value": 52900.0,
      "purchase_at": "2024-06-15T00:00:00+00:00",
      "warranty_until": "2026-06-15T00:00:00+00:00",
      "manual_md": "",
      "maintenance_md": ""
    }
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Integration not configured | Asset Record integration not set up |
| `invalid_input` | Asset name is required | Empty name after trimming |
| `invalid_format` | Invalid purchase_at datetime: ... | Unparseable datetime string |
| `invalid_format` | Invalid warranty_until datetime: ... | Unparseable datetime string |

**Side Effects:**
- Creates 5 entities (datetime×2, number×1, text×2)

---

### ha_asset_record/update

Update one or more fields of an existing asset.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `asset_id` | string | Yes | Regex `^asset_[a-f0-9]+$` | Asset ID |
| `name` | string | No | Max 255 chars, non-empty | New name |
| `brand` | string | No | Max 255 chars | New brand |
| `category` | string | No | Max 255 chars | New category |
| `value` | float | No | — | New value |
| `purchase_at` | string/null | No | ISO 8601 or null | New purchase date |
| `warranty_until` | string/null | No | ISO 8601 or null | New warranty date |
| `manual_md` | string | No | Max 65,535 chars | New manual content |
| `maintenance_md` | string | No | Max 65,535 chars | New maintenance content |

**Request:**

```json
{
  "id": 15,
  "type": "ha_asset_record/update",
  "asset_id": "asset_a1b2c3d4e5f6...",
  "value": 45000.0,
  "maintenance_md": "## 2025-01 Maintenance\n- Replaced battery"
}
```

**Response:**

```json
{
  "id": 15,
  "type": "result",
  "success": true,
  "result": {
    "asset": {
      "id": "asset_a1b2c3d4e5f6...",
      "name": "MacBook Pro",
      "brand": "Apple",
      "category": "Electronics",
      "value": 45000.0,
      "purchase_at": "2024-06-15T00:00:00+00:00",
      "warranty_until": "2026-06-15T00:00:00+00:00",
      "manual_md": "",
      "maintenance_md": "## 2025-01 Maintenance\n- Replaced battery"
    }
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Integration not configured | Integration not set up |
| `not_found` | Asset {id} not found | Invalid `asset_id` |
| `invalid_input` | Asset name cannot be empty | Empty name |
| `invalid_format` | Invalid purchase_at/warranty_until datetime | Unparseable datetime |

---

### ha_asset_record/delete

Delete an asset and all associated entities.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `asset_id` | string | Yes | Regex `^asset_[a-f0-9]+$` | Asset ID |

**Request:**

```json
{
  "id": 16,
  "type": "ha_asset_record/delete",
  "asset_id": "asset_a1b2c3d4e5f6..."
}
```

**Response:**

```json
{
  "id": 16,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Integration not configured | Integration not set up |
| `not_found` | Asset {id} not found | Invalid `asset_id` |

**Side Effects:**
- Removes all 5 associated entities and the device from device registry

---

## Note Record API Reference

Organize personal notes with categories, search, and markdown support. Notes are grouped into categories. Each category and its notes share a device in the device registry.

### Entity Patterns

For each note, the following entities are created:

| Platform | Unique ID Pattern | Description |
|----------|------------------|-------------|
| `text` | `{domain}_{category_id}_{note_id}_content` | Note content (text entity) |
| `switch` | `{domain}_{category_id}_{note_id}_pinned` | Pinned state (switch entity) |

### Validation Limits

| Field | Max Length |
|-------|-----------|
| Category name | 100 characters |
| Note title | 200 characters |
| Note content | 100,000 characters (100KB) |

### ha_note_record/get_data

List all categories and all notes.

**Auth:** Public

**Parameters:** None (beyond `type`)

**Request:**

```json
{
  "id": 17,
  "type": "ha_note_record/get_data"
}
```

**Response:**

```json
{
  "id": 17,
  "type": "result",
  "success": true,
  "result": {
    "categories": [
      {
        "id": "cat_abc123",
        "name": "Work Notes"
      }
    ],
    "notes": [
      {
        "id": "note_def456",
        "category_id": "cat_abc123",
        "title": "Meeting Notes",
        "content": "# Q1 Review\n- Revenue up 15%",
        "pinned": false,
        "created_at": "2025-01-10T10:00:00+00:00",
        "updated_at": "2025-01-10T12:00:00+00:00"
      }
    ]
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Store not initialized | Integration not set up |

---

### ha_note_record/create_category

Create a new note category.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `name` | string | Yes | Non-empty after trim, max 100 chars, case-insensitive unique | Category name |

**Request:**

```json
{
  "id": 18,
  "type": "ha_note_record/create_category",
  "name": "Work Notes"
}
```

**Response:**

```json
{
  "id": 18,
  "type": "result",
  "success": true,
  "result": {
    "id": "cat_abc123",
    "name": "Work Notes"
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Store not initialized | Integration not set up |
| `invalid_input` | Category name is required | Empty name |
| `invalid_input` | Category name exceeds maximum length of 100 characters | Name too long |
| `duplicate` | Category already exists | Case-insensitive duplicate |

---

### ha_note_record/create_note

Create a new note in a category.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `category_id` | string | Yes | — | Must exist | Category ID |
| `title` | string | Yes | — | Non-empty after trim, max 200 chars, unique per category (case-insensitive) | Note title |
| `content` | string | No | `""` | Max 100,000 chars | Note content (supports markdown) |
| `pinned` | boolean | No | `false` | — | Whether to pin the note |

**Request:**

```json
{
  "id": 19,
  "type": "ha_note_record/create_note",
  "category_id": "cat_abc123",
  "title": "Meeting Notes",
  "content": "# Q1 Review\n- Revenue up 15%",
  "pinned": true
}
```

**Response:**

```json
{
  "id": 19,
  "type": "result",
  "success": true,
  "result": {
    "id": "note_def456",
    "category_id": "cat_abc123",
    "title": "Meeting Notes",
    "content": "# Q1 Review\n- Revenue up 15%",
    "pinned": true,
    "created_at": "2025-01-10T10:00:00+00:00",
    "updated_at": "2025-01-10T10:00:00+00:00"
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Store not initialized | Integration not set up |
| `not_found` | Category not found | Invalid `category_id` |
| `invalid_input` | Note title is required | Empty title |
| `invalid_input` | Note title exceeds maximum length of 200 characters | Title too long |
| `invalid_input` | Note content exceeds maximum length of 100000 characters | Content too long |
| `duplicate` | Note title already exists in this category | Case-insensitive duplicate title |

**Side Effects:**
- Creates 2 entities (text for content, switch for pinned)

---

### ha_note_record/update_note

Update a note's title, content, or pinned state. All fields are optional — only provided fields are updated.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `note_id` | string | Yes | Must exist | Note ID |
| `title` | string | No | Non-empty, max 200 chars, unique in category | New title |
| `content` | string | No | Max 100,000 chars | New content |
| `pinned` | boolean | No | — | New pinned state |

**Request:**

```json
{
  "id": 20,
  "type": "ha_note_record/update_note",
  "note_id": "note_def456",
  "title": "Q1 Meeting Notes (Updated)",
  "pinned": false
}
```

**Response:**

```json
{
  "id": 20,
  "type": "result",
  "success": true,
  "result": {
    "id": "note_def456",
    "category_id": "cat_abc123",
    "title": "Q1 Meeting Notes (Updated)",
    "content": "# Q1 Review\n- Revenue up 15%",
    "pinned": false,
    "created_at": "2025-01-10T10:00:00+00:00",
    "updated_at": "2025-01-10T14:00:00+00:00"
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Store not initialized | Integration not set up |
| `not_found` | Note not found | Invalid `note_id` |
| `invalid_input` | Note title is required | Empty title |
| `invalid_input` | Note title/content exceeds maximum length | Too long |
| `duplicate` | Note title already exists in this category | Case-insensitive duplicate |

---

### ha_note_record/delete_note

Delete a note and clean up its entity registry entries.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `note_id` | string | Yes | Note ID |

**Request:**

```json
{
  "id": 21,
  "type": "ha_note_record/delete_note",
  "note_id": "note_def456"
}
```

**Response:**

```json
{
  "id": 21,
  "type": "result",
  "success": true,
  "result": { "deleted": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Store not initialized | Integration not set up |
| `not_found` | Note not found | Invalid `note_id` |

**Side Effects:**
- Removes 2 entity registry entries (text, switch)

---

### ha_note_record/delete_category

Delete a category and **cascade-delete all notes** within it. Also removes all entity registry and device registry entries.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category_id` | string | Yes | Category ID |

**Request:**

```json
{
  "id": 22,
  "type": "ha_note_record/delete_category",
  "category_id": "cat_abc123"
}
```

**Response:**

```json
{
  "id": 22,
  "type": "result",
  "success": true,
  "result": { "deleted": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Store not initialized | Integration not set up |
| `not_found` | Category not found | Invalid `category_id` |

**Side Effects:**
- Cascade-deletes all notes in the category
- Removes all associated entity registry entries (2 per note)
- Removes the device from device registry

---

## Finance API Reference

Multi-account financial tracking with transactions, recurring plans, and visualization. Each account is a separate ConfigEntry. All finance commands are **public** (no admin requirement).

### Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `ha_finance_transaction_added` | `account`, `amount`, `note`, `type` | After `add_transaction` via coordinator |
| `ha_finance_recurring_executed` | `account`, `plan_id`, `title`, `amount` | When a recurring plan executes at midnight |
| `ha_finance_balance_adjusted` | `account`, `old_balance`, `new_balance`, `diff` | After manual balance adjustment |
| `ha_finance_low_balance` | `account`, `balance`, `threshold` | When balance drops below threshold (default: 1000) |

### Entity Patterns

For each account, the following sensor entities are created:

| Unique ID Pattern | Description | Device Class |
|------------------|-------------|--------------|
| `{account_id}_balance_display` | Current balance | — (state_class: total) |
| `{account_id}_last_transaction` | Last transaction amount | — |
| `{account_id}_last_note` | Last transaction note | — |
| `{account_id}_last_time` | Last transaction timestamp | `timestamp` |

For each recurring plan in an account:

| Unique ID Pattern | Description | Device Class |
|------------------|-------------|--------------|
| `{account_id}_{plan_id}_next_date` | Next execution date | `date` |
| `{account_id}_{plan_id}_last_executed` | Last executed timestamp | `timestamp` |

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_LOW_BALANCE_THRESHOLD` | 1000.0 | Balance below this fires low balance event |
| `DEFAULT_CURRENCY` | "NTD" | Default currency unit |
| Transaction types | `manual`, `recurring`, `adjustment` | Distinguishes how transaction was created |
| Frequency options | `daily`, `weekly`, `monthly`, `yearly` | Recurring plan frequencies |

### ha_finance/accounts

List all financial accounts with basic info.

**Auth:** Public

**Parameters:** None

**Request:**

```json
{
  "id": 23,
  "type": "ha_finance/accounts"
}
```

**Response:**

```json
{
  "id": 23,
  "type": "result",
  "success": true,
  "result": {
    "accounts": [
      {
        "id": "finance_abc123",
        "name": "Main Account",
        "balance": 50000.0,
        "notes": "Family expenses"
      }
    ]
  }
}
```

---

### ha_finance/account

Get full account details including all transactions and recurring plans.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | Yes | Account ID |

**Request:**

```json
{
  "id": 24,
  "type": "ha_finance/account",
  "account_id": "finance_abc123"
}
```

**Response:**

```json
{
  "id": 24,
  "type": "result",
  "success": true,
  "result": {
    "account": {
      "id": "finance_abc123",
      "name": "Main Account",
      "balance": 50000.0,
      "notes": "Family expenses",
      "transactions": [
        {
          "id": "tx_a1b2c3d4",
          "amount": -500.0,
          "note": "Groceries",
          "timestamp": "2025-01-10T12:00:00+00:00",
          "type": "manual",
          "plan_id": null
        }
      ],
      "recurring_plans": {
        "plan_e5f6a7b8": {
          "title": "Monthly Rent",
          "amount": -15000.0,
          "frequency": "monthly",
          "day": 1,
          "month": 1,
          "active": true,
          "last_executed": "2025-01-01T00:00:00+00:00",
          "next_date": "2025-02-01"
        }
      }
    }
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account not found | Invalid `account_id` |

---

### ha_finance/add_transaction

Add a financial transaction. Positive amounts = income, negative = expense. Fires `ha_finance_transaction_added` event and checks for low balance.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `account_id` | string | Yes | — | Account ID |
| `amount` | float | Yes | — | Transaction amount (positive=income, negative=expense) |
| `note` | string | No | `""` | Transaction description |
| `transaction_type` | string | No | `"manual"` | Type: `manual`, `recurring`, or `adjustment` |

**Request:**

```json
{
  "id": 25,
  "type": "ha_finance/add_transaction",
  "account_id": "finance_abc123",
  "amount": -500.0,
  "note": "Groceries"
}
```

**Response:**

```json
{
  "id": 25,
  "type": "result",
  "success": true,
  "result": {
    "success": true,
    "transaction": {
      "id": "tx_a1b2c3d4",
      "amount": -500.0,
      "note": "Groceries",
      "timestamp": "2025-01-10T12:00:00+00:00",
      "type": "manual",
      "plan_id": null
    }
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account not found | Invalid `account_id` |
| `error` | Failed to create transaction | Internal error |

**Side Effects:**
- Updates account balance
- Fires `ha_finance_transaction_added` event
- May fire `ha_finance_low_balance` if balance drops below threshold

---

### ha_finance/update_transaction

Update a transaction's amount or note. If amount changes, the balance is recalculated.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | Yes | Account ID |
| `transaction_id` | string | Yes | Transaction ID (e.g., `tx_a1b2c3d4`) |
| `amount` | float | No | New amount (recalculates balance) |
| `note` | string | No | New note |

**Request:**

```json
{
  "id": 26,
  "type": "ha_finance/update_transaction",
  "account_id": "finance_abc123",
  "transaction_id": "tx_a1b2c3d4",
  "amount": -450.0,
  "note": "Groceries (adjusted)"
}
```

**Response:**

```json
{
  "id": 26,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account not found | Invalid `account_id` |
| `not_found` | Transaction not found | Invalid `transaction_id` |

**Side Effects:**
- Recalculates balance if amount changed (adds difference)

---

### ha_finance/delete_transaction

Delete a transaction. The transaction amount is reversed from the balance.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | Yes | Account ID |
| `transaction_id` | string | Yes | Transaction ID |

**Request:**

```json
{
  "id": 27,
  "type": "ha_finance/delete_transaction",
  "account_id": "finance_abc123",
  "transaction_id": "tx_a1b2c3d4"
}
```

**Response:**

```json
{
  "id": 27,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account not found | Invalid `account_id` |
| `not_found` | Transaction not found | Invalid `transaction_id` |

**Side Effects:**
- Reverses the transaction amount from balance (balance -= transaction.amount)

---

### ha_finance/add_plan

Add a recurring plan to an account. Plans auto-execute at midnight when their scheduled date arrives.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|------------|-------------|
| `account_id` | string | Yes | — | Must exist | Account ID |
| `title` | string | Yes | — | — | Plan name (e.g., "Monthly Rent") |
| `amount` | float | Yes | — | — | Amount per execution (positive=income, negative=expense) |
| `frequency` | string | Yes | — | `daily`, `weekly`, `monthly`, `yearly` | Execution frequency |
| `day` | int | Yes | — | 1–28 | Day of execution (day of week for weekly, day of month for monthly/yearly) |
| `month` | int | No | `1` | 1–12 | Month for yearly frequency |
| `active` | boolean | No | `true` | — | Whether the plan is active |

**Frequency + Day semantics:**
- `daily`: `day` is ignored (executes every day)
- `weekly`: `day` = 1–7 (Monday–Sunday)
- `monthly`: `day` = 1–28 (day of month)
- `yearly`: `day` = 1–28, `month` = 1–12

**Request:**

```json
{
  "id": 28,
  "type": "ha_finance/add_plan",
  "account_id": "finance_abc123",
  "title": "Monthly Rent",
  "amount": -15000.0,
  "frequency": "monthly",
  "day": 1
}
```

**Response:**

```json
{
  "id": 28,
  "type": "result",
  "success": true,
  "result": { "success": true, "plan_id": "plan_a1b2c3d4" }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account not found | Invalid `account_id` |

**Side Effects:**
- Creates 2 sensor entities (`{plan_id}_next_date`, `{plan_id}_last_executed`)
- Plan auto-executes at midnight when next_date arrives

---

### ha_finance/update_plan

Update a recurring plan's properties.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `account_id` | string | Yes | Must exist | Account ID |
| `plan_id` | string | Yes | Must exist | Plan ID |
| `title` | string | No | — | New title |
| `amount` | float | No | — | New amount |
| `frequency` | string | No | `daily`/`weekly`/`monthly`/`yearly` | New frequency |
| `day` | int | No | 1–28 | New day |
| `month` | int | No | 1–12 | New month |
| `active` | boolean | No | — | Enable/disable plan |

**Request:**

```json
{
  "id": 29,
  "type": "ha_finance/update_plan",
  "account_id": "finance_abc123",
  "plan_id": "plan_a1b2c3d4",
  "amount": -16000.0,
  "active": true
}
```

**Response:**

```json
{
  "id": 29,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account not found | Invalid `account_id` |
| `not_found` | Plan not found | Invalid `plan_id` |

**Side Effects:**
- Recalculates `next_date` if frequency, day, or month changed

---

### ha_finance/delete_plan

Delete a recurring plan and clean up associated sensor entities.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | Yes | Account ID |
| `plan_id` | string | Yes | Plan ID |

**Request:**

```json
{
  "id": 30,
  "type": "ha_finance/delete_plan",
  "account_id": "finance_abc123",
  "plan_id": "plan_a1b2c3d4"
}
```

**Response:**

```json
{
  "id": 30,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Side Effects:**
- Removes 2 sensor entities (`_next_date`, `_last_executed`)

---

### ha_finance/chart_data

Get monthly income vs. expense aggregation for charts. Returns data sorted oldest-first.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `account_id` | string | Yes | — | Account ID |
| `months` | int | No | `6` | Number of recent months to include |

**Request:**

```json
{
  "id": 31,
  "type": "ha_finance/chart_data",
  "account_id": "finance_abc123",
  "months": 3
}
```

**Response:**

```json
{
  "id": 31,
  "type": "result",
  "success": true,
  "result": {
    "data": [
      { "month": "2024-11", "income": 50000.0, "expenses": 35000.0 },
      { "month": "2024-12", "income": 50000.0, "expenses": 42000.0 },
      { "month": "2025-01", "income": 50000.0, "expenses": 38000.0 }
    ]
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account not found | Invalid `account_id` |

**Logic:** Transactions with `amount >= 0` are counted as income; `amount < 0` as expenses (absolute value).

---

### ha_finance/add_account

Create a new financial account. This creates a new ConfigEntry via the config flow, which sets up a coordinator and sensor entities.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | — | Account name (non-empty) |
| `initial_balance` | float | No | `0.0` | Starting balance |

**Request:**

```json
{
  "id": 32,
  "type": "ha_finance/add_account",
  "name": "Savings Account",
  "initial_balance": 100000.0
}
```

**Response:**

```json
{
  "id": 32,
  "type": "result",
  "success": true,
  "result": {
    "success": true,
    "account": {
      "id": "finance_abc123",
      "name": "Savings Account",
      "balance": 100000.0
    }
  }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `invalid_name` | Account name cannot be empty | Empty name |
| `flow_error` | Failed to create account config entry | Config flow error |
| `flow_failed` | Config flow did not create entry: {reason} | Flow rejected |

**Side Effects:**
- Creates ConfigEntry → coordinator → 4 sensor entities
- Recurring plan check scheduled at midnight

---

### ha_finance/update_account

Update an account's name or notes. If the name changes, the ConfigEntry title and device registry are also updated.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | Yes | Account ID |
| `name` | string | No | New name (non-empty, case-insensitive unique) |
| `notes` | string | No | New notes |

**Request:**

```json
{
  "id": 33,
  "type": "ha_finance/update_account",
  "account_id": "finance_abc123",
  "name": "Family Savings",
  "notes": "Emergency fund"
}
```

**Response:**

```json
{
  "id": 33,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account not found | Invalid `account_id` |
| `invalid_name` | Account name cannot be empty | Empty name |
| `duplicate_name` | Account with this name already exists | Case-insensitive duplicate |

**Side Effects:**
- Updates ConfigEntry title and device registry name

---

### ha_finance/delete_account

Delete a financial account by removing its ConfigEntry. This triggers full cleanup.

**Auth:** Public

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `account_id` | string | Yes | Account ID |

**Request:**

```json
{
  "id": 34,
  "type": "ha_finance/delete_account",
  "account_id": "finance_abc123"
}
```

**Response:**

```json
{
  "id": 34,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Account config entry not found | Invalid `account_id` |
| `remove_error` | Failed to remove account config entry | Removal error |

**Side Effects:**
- Removes ConfigEntry, coordinator, all sensor entities, device, and account data from store

---

## Workflow Examples for AI Agents

### Track a New Family Member's Health

```
1. ha_health_record/add_member      → name: "Baby Ming"
2. ha_health_record/add_record_type → member_id: "baby_ming", name: "Weight", unit: "kg"
3. ha_health_record/add_record_type → member_id: "baby_ming", name: "Temperature", unit: "°C"
4. ha_health_record/log_record      → member_id: "baby_ming", record_type: "weight", value: 8.5
5. ha_health_record/get_records     → start_time/end_time for range queries
6. ha_health_record/export_csv      → member_id: "baby_ming" for data export
```

### Manage Household Assets

```
1. ha_asset_record/create  → name: "MacBook Pro", brand: "Apple", category: "Electronics", value: 52900
2. ha_asset_record/update  → asset_id: "...", warranty_until: "2026-06-15T00:00:00Z"
3. ha_asset_record/update  → asset_id: "...", maintenance_md: "## Battery replaced 2025-03"
4. ha_asset_record/list    → check all assets, filter by category in your logic
```

### Organize Project Notes

```
1. ha_note_record/create_category → name: "Work Projects"
2. ha_note_record/create_note     → category_id: "...", title: "Q1 Goals", content: "# Goals\n- ..."
3. ha_note_record/update_note     → note_id: "...", content: "updated content", pinned: true
4. ha_note_record/get_data        → retrieve all categories and notes for search/filtering
```

### Set Up Family Finances

```
1. ha_finance/add_account       → name: "Family Account", initial_balance: 50000
2. ha_finance/add_transaction   → account_id: "...", amount: -500, note: "Groceries"
3. ha_finance/add_transaction   → account_id: "...", amount: 50000, note: "Monthly salary"
4. ha_finance/add_plan          → account_id: "...", title: "Rent", amount: -15000, frequency: "monthly", day: 1
5. ha_finance/chart_data        → account_id: "...", months: 6 for income vs expense chart
```

### Cross-Component Daily Routine

```
Morning:
  ha_health_record/log_record → weight measurement
  ha_finance/add_transaction  → breakfast expense

Work:
  ha_note_record/create_note  → meeting notes

Evening:
  ha_health_record/log_record → temperature check
  ha_finance/add_transaction  → dinner expense
  ha_finance/chart_data       → review today's spending
```

---

## Error Code Reference

All error codes used across the suite:

| Code | Domain(s) | Meaning |
|------|-----------|---------|
| `member_not_found` | health_record | Member ID does not match any loaded ConfigEntry |
| `record_type_not_found` | health_record | Record type ID not found for the member |
| `type_not_found` | health_record | Record type not found (for update/delete) |
| `record_not_found` | health_record | No record matches the given ID/timestamp |
| `invalid_date` | health_record | ISO 8601 datetime parsing failed |
| `invalid_timestamp` | health_record | Timestamp field is not valid ISO 8601 |
| `invalid_type_id` | health_record | Name produces empty type_id after sanitization |
| `invalid_member_id` | health_record | Member ID is empty after sanitization |
| `type_exists` | health_record | Duplicate record type ID |
| `member_exists` | health_record | Duplicate member ID |
| `create_failed` | health_record | Config flow failed to create entry |
| `log_failed` | health_record | Internal error during record logging |
| `not_found` | asset, note, finance | Resource not found (generic) |
| `invalid_input` | asset, note | Input validation failure (empty name, too long, etc.) |
| `invalid_format` | asset | Datetime string is unparseable |
| `duplicate` | note | Case-insensitive duplicate name/title |
| `invalid_name` | finance | Account name is empty |
| `duplicate_name` | finance | Case-insensitive duplicate account name |
| `flow_error` | finance | Config flow exception |
| `flow_failed` | finance | Config flow did not create entry |
| `remove_error` | finance | Failed to remove config entry |
| `error` | note, finance | Generic internal error |

---

## Architecture

### System Overview

```mermaid
graph TB
    subgraph "Home Assistant Core"
        HA[Home Assistant]
        ER[Entity Registry]
        DR[Device Registry]
        WS[WebSocket API]
        ST[Persistent Storage]
    end

    subgraph "WOOW HA Records Suite"
        subgraph "Health Record"
            HR_CF[Config Flow] --> HR_INIT[__init__]
            HR_INIT --> HR_COORD[Coordinator]
            HR_COORD --> HR_STORE[Data Store]
            HR_INIT --> HR_PANEL[Panel + WS API]
            HR_INIT --> HR_ENT[Entities]
        end

        subgraph "Asset Record"
            AR_CF[Config Flow] --> AR_INIT[__init__]
            AR_INIT --> AR_COORD[Coordinator]
            AR_COORD --> AR_STORE[Data Store]
            AR_INIT --> AR_PANEL[Panel + WS API]
            AR_INIT --> AR_ENT[Entities]
        end

        subgraph "Note Record"
            NR_CF[Config Flow] --> NR_INIT[__init__]
            NR_INIT --> NR_STORE[Shared Store]
            NR_INIT --> NR_PANEL[Panel + WS API]
            NR_INIT --> NR_ENT[Entities]
        end

        subgraph "Finance"
            FI_CF[Config Flow] --> FI_INIT[__init__]
            FI_INIT --> FI_COORD[Coordinator]
            FI_COORD --> FI_STORE[Shared Store]
            FI_INIT --> FI_PANEL[Panel + WS API]
            FI_INIT --> FI_ENT[Entities]
        end
    end

    subgraph "Frontend Panels"
        HR_JS[Health Panel<br/>Vanilla Web Components]
        AR_JS[Asset Panel<br/>Lit Element]
        NR_JS[Note Panel<br/>Vendored Dependencies]
        FI_JS[Finance Panel<br/>Lit Element 3.3.3]
    end

    HR_PANEL --> WS
    AR_PANEL --> WS
    NR_PANEL --> WS
    FI_PANEL --> WS

    HR_STORE --> ST
    AR_STORE --> ST
    NR_STORE --> ST
    FI_STORE --> ST

    HR_ENT --> ER
    AR_ENT --> ER
    NR_ENT --> ER
    FI_ENT --> ER

    HR_JS --> WS
    AR_JS --> WS
    NR_JS --> WS
    FI_JS --> WS
```

### Data Flow

```mermaid
sequenceDiagram
    participant U as User (Browser/AI)
    participant P as Frontend Panel
    participant W as WebSocket API
    participant C as Coordinator
    participant S as Data Store
    participant E as HA Entity

    U->>P: User interaction / AI command
    P->>W: WebSocket command
    W->>C: Process request
    C->>S: Read/Write data
    S-->>C: Data response
    C->>E: Update entity state
    C-->>W: Result
    W-->>P: Response
    P-->>U: UI update / JSON result
```

---

## Screenshots

### Health Record Panel

Track health metrics for family members with custom record types and CSV export.

![Health Record Panel](docs/screenshots/health-record-panel.png)

### Asset Record Panel

Manage household assets with purchase tracking, warranty monitoring, and documentation.

![Asset Record Panel](docs/screenshots/asset-record-panel.png)

### Note Record Panel

Organize notes with categories, search, and markdown support.

![Note Record Panel](docs/screenshots/note-record-panel.png)

### Finance Panel

Multi-account financial tracking with income/expense visualization.

![Finance Panel](docs/screenshots/finance-panel.png)

### Integration Setup

Configure components through Home Assistant's standard integration flow.

![Integration Setup](docs/screenshots/ha-integration-setup.png)

---

## Installation

### HACS (Recommended)

1. Open HACS in your Home Assistant instance
2. Click the three-dot menu → **Custom repositories**
3. Add this repository URL with category **Integration**
4. Search for "WOOW HA Records" and install
5. Restart Home Assistant

### Manual Installation

1. Copy the desired component directories from `custom_components/` to your Home Assistant's `custom_components/` directory:

```
custom_components/
├── ha_health_record/
├── ha_asset_record/
├── ha_note_record/
└── ha_finance/
```

2. Restart Home Assistant

---

## Configuration

Each component is configured through the Home Assistant UI:

1. Go to **Settings** → **Devices & Services** → **Add Integration**
2. Search for the component name:
   - **Ha Health Record** — Enter member name (e.g., `baby_ming`)
   - **Asset Record** — Single instance, no additional configuration
   - **Note Record** — Enter category name
   - **Finance Record** — Enter account name and initial balance

3. The custom panel will appear in the sidebar automatically

### Multiple Entries

- **Health Record**: Add multiple members (one config entry per family member)
- **Finance**: Add multiple accounts (one config entry per financial account)
- **Note Record**: Add multiple categories
- **Asset Record**: Single instance only

---

## Testing

This project includes comprehensive test coverage with two test suites:

### Unit Tests (109 tests)

Python-based unit tests using `pytest` with Home Assistant test fixtures.

```bash
pip install -r requirements_test.txt
pytest tests/ -v
```

**Coverage:**
- Config flow validation
- Data store operations (CRUD, persistence)
- Coordinator state management
- WebSocket API handlers
- Entity platform setup
- Input validation and security checks

### E2E Browser Tests (143 tests)

TypeScript-based end-to-end tests using Playwright against a live Home Assistant instance.

```bash
cd e2e
npm install
npx playwright install
npx playwright test
```

**Test suites:**

| Suite | Tests | Description |
|-------|-------|-------------|
| `health-record.spec.ts` | 28 | Member management, record types, CRUD, CSV export, time-series |
| `asset-record.spec.ts` | 28 | Asset CRUD, categories, search, markdown, warranty tracking |
| `note-record.spec.ts` | 38 | Note CRUD, categories, search, markdown, XSS protection |
| `finance-record.spec.ts` | 38 | Account management, transactions, recurring plans, charts |
| `integration.spec.ts` | 11 | Cross-component integration and data isolation |

**Requirements:**
- Running Home Assistant instance (default: `http://localhost:18125`)
- All four components installed and configured
- Google Chrome or Chromium browser

### k3s E2E Harness (`e2e/k3s/`)

Disposable Home Assistant instance on a local k3s cluster, used as the release gate for data-retention changes:

| File | Purpose |
|---|---|
| `ha-test.yaml` | Namespace + PVC + Deployment (initContainer clones the branch) + Service |
| `onboard.sh` | Automates fresh-HA onboarding (creates owner user, saves refresh token) |
| `token.sh` | Mints a fresh access token from the saved refresh token |
| `bootstrap.sh` | Creates the first ha_finance / ha_health_record config entries via the config-flow REST API |
| `retention_test.py` | Seeds 1,100 transactions + 10,100 records and verifies all are retained (also after pod restart) |

---

## Project Structure

```
Woow_ha_records/
├── custom_components/
│   ├── ha_health_record/        # Health metrics tracking
│   │   ├── __init__.py          # Component lifecycle & multi-member setup
│   │   ├── config_flow.py       # Config entry flow
│   │   ├── coordinator.py       # Data update coordinator
│   │   ├── panel.py             # WebSocket API (12 commands)
│   │   ├── store.py             # Persistent data store
│   │   ├── sensor.py            # Sensor platform
│   │   ├── button.py            # Quick-log button platform
│   │   ├── number.py            # Number input platform
│   │   ├── text.py              # Text input platform
│   │   ├── frontend/            # Custom panel (vanilla Web Components)
│   │   └── manifest.json
│   │
│   ├── ha_asset_record/         # Asset management
│   │   ├── __init__.py          # Single-instance lifecycle
│   │   ├── config_flow.py
│   │   ├── coordinator.py
│   │   ├── websocket.py         # WebSocket API (4 commands)
│   │   ├── store.py
│   │   ├── sensor.py
│   │   ├── frontend/            # Custom panel (Lit Element)
│   │   └── manifest.json
│   │
│   ├── ha_note_record/          # Note management
│   │   ├── __init__.py          # Shared store architecture
│   │   ├── config_flow.py
│   │   ├── store.py
│   │   ├── websocket_api.py     # WebSocket API (6 commands)
│   │   ├── switch.py            # Switch platform
│   │   ├── text.py              # Text platform
│   │   ├── frontend/            # Custom panel (vendored dependencies)
│   │   │   └── vendor/          # Offline-capable third-party libs
│   │   └── manifest.json
│   │
│   └── ha_finance/              # Financial tracking
│       ├── __init__.py          # Multi-account lifecycle
│       ├── config_flow.py
│       ├── coordinator.py
│       ├── panel.py             # WebSocket API (12 commands)
│       ├── store.py
│       ├── models.py            # Data models
│       ├── frontend/            # Custom panel (Lit Element 3.3.3)
│       └── manifest.json
│
├── tests/                       # Unit tests (109 tests)
│   ├── test_health_record/
│   ├── test_asset_record/
│   ├── test_note_record/
│   └── test_finance/
│
├── e2e/                         # E2E browser tests (143 tests)
│   ├── tests/
│   ├── utils/
│   ├── k3s/                     # Disposable k3s HA E2E harness
│   └── playwright.config.ts
│
├── docs/
│   ├── screenshots/             # Panel screenshots
│   └── PRD-e2e-browser-testing.md
│
├── hacs.json                    # HACS configuration
├── pyproject.toml               # Project configuration
├── requirements_test.txt        # Test dependencies
└── LICENSE                      # GPL-3.0
```

---

## Development

### Prerequisites

- Python 3.12+
- Home Assistant Core 2025.1+
- Node.js 18+ (for E2E tests)

### Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/WOOWTECH/Woow_ha_records.git
cd Woow_ha_records

# Install Python test dependencies
pip install -r requirements_test.txt

# Run unit tests
pytest tests/ -v

# Install E2E test dependencies
cd e2e && npm install && npx playwright install

# Run E2E tests (requires running HA instance)
npx playwright test
```

### Component Versions

| Component | Version | Domain |
|-----------|---------|--------|
| Health Record | 1.1.0 | `ha_health_record` |
| Asset Record | 1.0.2 | `ha_asset_record` |
| Note Record | 1.0.2 | `ha_note_record` |
| Finance Record | 1.1.0 | `ha_finance` |

---

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/WOOWTECH">WOOWTECH</a>
</p>
