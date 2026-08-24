# Health Area Services Guide

> **Domain:** the `health` Area
> **Total services:** 12 (3 query + 9 write)

This guide covers all HA services exposed by the **Ha Health Record** integration.
These services can be called from automations, scripts, Developer Tools, or via the
REST API (`/api/services/woow_ha_records/health_<verb>`).

---

## Quick Reference

| Service | Type | Required Fields |
|---------|------|----------------|
| `get_members` | Query | _(none)_ |
| `get_records` | Query | `start_time`, `end_time` |
| `export_csv` | Query | `member_id` |
| `log_record` | Write | `member_id`, `record_type`, `value` |
| `update_record` | Write | `member_id`, `type_id`, `timestamp` |
| `delete_record` | Write | `member_id`, `type_id`, `timestamp` |
| `add_record_type` | Write | `member_id`, `name`, `unit` |
| `update_record_type` | Write | `member_id`, `type_id`, `name`, `unit` |
| `delete_record_type` | Write | `member_id`, `type_id` |
| `add_member` | Write | `name` |
| `update_member` | Write | `member_id`, `name` |
| `delete_member` | Write | `member_id` |

### Response Types

- **Query services** use `SupportsResponse.ONLY` — they **always** return response data.
  You must set `response_variable` (in automations) or use `return_response: true` (in Developer Tools / REST API).
- **Write services** use `SupportsResponse.OPTIONAL` — they return `{"success": true}` when a response is requested,
  but also work without requesting a response.

---

## 1. get_members

List all family members and their record types.

### Parameters

_(none)_

### Response

```json
{
  "members": [
    {
      "id": "baby_emma",
      "name": "Baby Emma",
      "note": "",
      "record_sets": [
        {
          "type": "weight",
          "name": "Weight",
          "unit": "kg",
          "default_value": 0,
          "default_value_mode": "last_value",
          "current_value": 5.2,
          "last_record": {
            "value": 5.2,
            "note": "Morning weigh-in",
            "timestamp": "2026-05-14T08:00:00+08:00"
          }
        }
      ]
    }
  ]
}
```

### YAML Example

```yaml
service: woow_ha_records.health_get_members
data: {}
response_variable: members_result
```

### REST API

> **Note:** For query services (`SupportsResponse.ONLY`), append `?return_response`
> to the URL. For write services (`SupportsResponse.OPTIONAL`), the query parameter
> is optional — add it only when you need the response data.

```bash
curl -X POST "http://YOUR_HA:8123/api/services/woow_ha_records/health/get_members?return_response" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 2. get_records

Query health records within a time range, across **all** members.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `start_time` | Yes | datetime (ISO 8601) | Start of the query range |
| `end_time` | Yes | datetime (ISO 8601) | End of the query range |

### Response

```json
{
  "records": [
    {
      "member_id": "baby_emma",
      "record_type": "weight",
      "value": 5.2,
      "note": "Morning weigh-in",
      "timestamp": "2026-05-14T08:00:00+08:00"
    }
  ]
}
```

### YAML Example

```yaml
service: woow_ha_records.health_get_records
data:
  start_time: "2026-05-01T00:00:00"
  end_time: "2026-05-15T23:59:59"
response_variable: records_result
```

### REST API

```bash
curl -X POST "http://YOUR_HA:8123/api/services/woow_ha_records/health/get_records?return_response" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start_time": "2026-05-01T00:00:00+08:00",
    "end_time": "2026-05-15T23:59:59+08:00"
  }'
```

---

## 3. export_csv

Export all records for a member as CSV text.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |

### Response

```json
{
  "csv_content": "timestamp,record_type,record_name,value,unit,note\n2026-05-14T08:00:00,weight,Weight,5.2,kg,Morning weigh-in\n",
  "member_name": "Baby Emma",
  "record_count": 1
}
```

### YAML Example

```yaml
service: woow_ha_records.health_export_csv
data:
  member_id: "baby_emma"
response_variable: csv_result
```

---

## 4. log_record

Log a new health record for a member.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |
| `record_type` | Yes | string | The record type ID (e.g. `weight`, `feeding`) |
| `value` | Yes | number | The measured value |
| `note` | No | string | Optional free-text note |
| `timestamp` | No | string (ISO 8601) | Defaults to current time if omitted |

### Response (when requested)

```json
{ "success": true }
```

### Events

Fires `woow_ha_records_health_record_logged` with:
```json
{
  "member_id": "baby_emma",
  "member_name": "Baby Emma",
  "record_type": "weight",
  "record_name": "Weight",
  "value": 5.3,
  "unit": "kg",
  "note": "After feeding",
  "timestamp": "2026-05-15T09:00:00+08:00"
}
```

### YAML Example

```yaml
service: woow_ha_records.health_log_record
data:
  member_id: "baby_emma"
  record_type: "weight"
  value: 5.3
  note: "After feeding"
```

### YAML Example — with custom timestamp

```yaml
service: woow_ha_records.health_log_record
data:
  member_id: "baby_emma"
  record_type: "weight"
  value: 5.3
  note: "Backfill yesterday's record"
  timestamp: "2026-05-14T08:00:00"
```

### REST API

```bash
curl -X POST "http://YOUR_HA:8123/api/services/woow_ha_records/health/log_record" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "member_id": "baby_emma",
    "record_type": "weight",
    "value": 5.3,
    "note": "After feeding"
  }'
```

---

## 5. update_record

Update an existing health record.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |
| `type_id` | Yes | string | The record type ID |
| `timestamp` | Yes | string (ISO 8601) | Timestamp to locate the record |
| `record_id` | No | string | UUID of the record (preferred over timestamp) |
| `value` | No | number | New value |
| `note` | No | string | New note |
| `new_timestamp` | No | string (ISO 8601) | Replacement timestamp |

### YAML Example

```yaml
service: woow_ha_records.health_update_record
data:
  member_id: "baby_emma"
  type_id: "weight"
  timestamp: "2026-05-14T08:00:00+08:00"
  value: 5.25
  note: "Corrected value"
```

---

## 6. delete_record

Delete a single health record.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |
| `type_id` | Yes | string | The record type ID |
| `timestamp` | Yes | string (ISO 8601) | Timestamp to locate the record |
| `record_id` | No | string | UUID of the record (preferred over timestamp) |

### YAML Example

```yaml
service: woow_ha_records.health_delete_record
data:
  member_id: "baby_emma"
  type_id: "weight"
  timestamp: "2026-05-14T08:00:00+08:00"
```

---

## 7. add_record_type

Add a new record type to a member. This triggers an entry reload to create the new entities.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |
| `name` | Yes | string | Human-readable name (e.g. "Blood Pressure") |
| `unit` | Yes | string | Unit of measurement (e.g. "mmHg") |
| `default_value` | No | number | Initial default value (default: 0) |
| `default_value_mode` | No | select | `"fixed"` or `"last_value"` (default: `"fixed"`) |

### Response (when requested)

```json
{ "success": true, "type_id": "blood_pressure" }
```

### YAML Example

```yaml
service: woow_ha_records.health_add_record_type
data:
  member_id: "baby_emma"
  name: "Blood Pressure"
  unit: "mmHg"
  default_value: 120
  default_value_mode: "fixed"
```

---

## 8. update_record_type

Update the settings of an existing record type. Triggers entry reload.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |
| `type_id` | Yes | string | The record type ID to update |
| `name` | Yes | string | New display name |
| `unit` | Yes | string | New unit of measurement |
| `default_value` | No | number | New default value |
| `default_value_mode` | No | select | `"fixed"` or `"last_value"` |

### YAML Example

```yaml
service: woow_ha_records.health_update_record_type
data:
  member_id: "baby_emma"
  type_id: "blood_pressure"
  name: "Blood Pressure (Systolic)"
  unit: "mmHg"
  default_value: 120
```

---

## 9. delete_record_type

Delete a record type and remove its associated entities. Triggers entry reload.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |
| `type_id` | Yes | string | The record type ID to delete |

### YAML Example

```yaml
service: woow_ha_records.health_delete_record_type
data:
  member_id: "baby_emma"
  type_id: "blood_pressure"
```

---

## 10. add_member

Add a new family member. Creates a new config entry, which triggers entity creation.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `name` | Yes | string | Display name of the new member |
| `member_id` | No | string | Unique identifier (auto-generated from name if omitted) |
| `note` | No | string | Optional note |

### Response (when requested)

```json
{
  "success": true,
  "member_id": "baby_emma",
  "entry_id": "abc123..."
}
```

### YAML Example

```yaml
service: woow_ha_records.health_add_member
data:
  name: "Baby Emma"
  note: "Born 2026-01-15"
```

### YAML Example — with custom ID

```yaml
service: woow_ha_records.health_add_member
data:
  name: "Baby Emma"
  member_id: "emma"
  note: "Born 2026-01-15"
```

---

## 11. update_member

Update a member's display name and note.

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |
| `name` | Yes | string | New display name |
| `note` | No | string | New note (default: empty) |

### YAML Example

```yaml
service: woow_ha_records.health_update_member
data:
  member_id: "baby_emma"
  name: "Emma (toddler)"
  note: "Updated 2026-05-15"
```

---

## 12. delete_member

Delete a member and all associated data (config entry + storage file).

### Parameters

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `member_id` | Yes | string | The member's unique identifier |

### YAML Example

```yaml
service: woow_ha_records.health_delete_member
data:
  member_id: "baby_emma"
```

---

## Automation Examples

### Daily weight reminder + auto-log from a sensor

```yaml
automation:
  - alias: "Daily weight log from scale sensor"
    trigger:
      - platform: time
        at: "08:00:00"
    condition:
      - condition: state
        entity_id: sensor.bathroom_scale_weight
        state: "available"
    action:
      - service: woow_ha_records.health_log_record
        data:
          member_id: "baby_emma"
          record_type: "weight"
          value: "{{ states('sensor.bathroom_scale_weight') | float }}"
          note: "Auto-logged from scale sensor"
```

### Weekly CSV export via notification

```yaml
automation:
  - alias: "Weekly health report"
    trigger:
      - platform: time
        at: "09:00:00"
    condition:
      - condition: time
        weekday:
          - mon
    action:
      - service: woow_ha_records.health_export_csv
        data:
          member_id: "baby_emma"
        response_variable: csv_result
      - service: notify.mobile_app
        data:
          title: "Weekly Health Report"
          message: >-
            {{ csv_result.member_name }}: {{ csv_result.record_count }} records exported.
```

### Event-triggered notification

```yaml
automation:
  - alias: "Notify on new health record"
    trigger:
      - platform: event
        event_type: woow_ha_records_health_record_logged
    action:
      - service: notify.mobile_app
        data:
          title: "Health Record Logged"
          message: >-
            {{ trigger.event.data.member_name }} —
            {{ trigger.event.data.record_name }}:
            {{ trigger.event.data.value }} {{ trigger.event.data.unit }}
            {% if trigger.event.data.note %} ({{ trigger.event.data.note }}){% endif %}
```

---

## AI Agent Reference (REST API)

AI agents can call these services via the Home Assistant REST API.

### Base URL

```
POST http://<HA_HOST>:8123/api/services/woow_ha_records/health_<verb>
```

### Headers

```
Authorization: Bearer <LONG_LIVED_ACCESS_TOKEN>
Content-Type: application/json
```

### Query services (must append `?return_response`)

```bash
# Get all members
curl -s -X POST "http://HA:8123/api/services/woow_ha_records/health/get_members?return_response" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Get records in a time range
curl -s -X POST "http://HA:8123/api/services/woow_ha_records/health/get_records?return_response" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start_time": "2026-05-01T00:00:00+08:00",
    "end_time": "2026-05-15T23:59:59+08:00"
  }'
```

### Write services (append `?return_response` to get response data)

```bash
# Log a record
curl -s -X POST "http://HA:8123/api/services/woow_ha_records/health/log_record" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "member_id": "baby_emma",
    "record_type": "weight",
    "value": 5.3,
    "note": "Logged by AI agent"
  }'

# Add a new member (with response)
curl -s -X POST "http://HA:8123/api/services/woow_ha_records/health/add_member?return_response" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Grandpa Chen",
    "member_id": "grandpa_chen",
    "note": "Blood pressure tracking"
  }'

# Add a record type (with response)
curl -s -X POST "http://HA:8123/api/services/woow_ha_records/health/add_record_type?return_response" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "member_id": "grandpa_chen",
    "name": "Blood Pressure",
    "unit": "mmHg",
    "default_value": 120,
    "default_value_mode": "fixed"
  }'
```

### Typical AI agent workflow

1. **Discover** — Call `get_members` to list all members and their record types
2. **Log** — Call `log_record` with the appropriate `member_id` and `record_type`
3. **Query** — Call `get_records` with a time range to retrieve history
4. **Export** — Call `export_csv` to get a CSV dump for analysis

---

## Error Handling

All services raise `ServiceValidationError` with translation keys on failure:

| Translation Key | Cause |
|----------------|-------|
| `member_not_found` | The specified `member_id` does not match any loaded config entry |
| `record_type_not_found` | The `record_type` does not exist for the given member |
| `record_not_found` | No record matched the `timestamp` / `record_id` |
| `invalid_datetime` | A datetime field could not be parsed as ISO 8601 |
| `log_failed` | The coordinator failed to persist the record |
| `invalid_type_id` | Record type name produces an empty ID after sanitization |
| `type_exists` | A record type with that ID already exists |
| `type_not_found` | The specified `type_id` does not exist |
| `invalid_member_id` | Member ID is empty after sanitization |
| `member_exists` | A member with that ID already exists |
| `create_failed` | The config flow failed to create the member entry |
