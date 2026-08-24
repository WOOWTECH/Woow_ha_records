> Part of the [Woow HA Records Suite](../../../README.md) API reference. See [docs/api/](../README.md) for the full index.

# Health Record API Reference

Track health metrics (weight, temperature, feeding, sleep, etc.) for multiple family members. Each member is a separate ConfigEntry with customizable record types.

### Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `woow_ha_records_health_record_logged` | `member_id`, `member_name`, `record_type`, `record_name`, `value`, `unit`, `note`, `timestamp` | Fired after `log_record` succeeds |

### Entity Patterns

For each member + record_type combination, the following entities are created:

| Platform | Unique ID Pattern | Description |
|----------|------------------|-------------|
| `sensor` | `{member_id}_{type_id}_record` | Last recorded value (e.g., `sensor.baby_ming_weight_record`) |
| `button` | `{member_id}_{type_id}_log` | Quick-log button to record current value |
| `number` | `{member_id}_{type_id}_value` | Input number for setting value before logging |
| `text` | `{member_id}_{type_id}_note` | Input text for setting note before logging |

### woow_ha_records/health/get_members

List all family members with their record types, current values, and latest records.

**Auth:** Public

**Parameters:** None (beyond `type`)

**Request:**

```json
{
  "id": 1,
  "type": "woow_ha_records/health/get_members"
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

### woow_ha_records/health/get_records

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
  "type": "woow_ha_records/health/get_records",
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

### woow_ha_records/health/export_csv

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
  "type": "woow_ha_records/health/export_csv",
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

### woow_ha_records/health/log_record

Log a health record entry for a member. Fires `woow_ha_records_health_record_logged` event. Updates the sensor entity for that record type. Records are kept permanently.

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
  "type": "woow_ha_records/health/log_record",
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
- Fires event `woow_ha_records_health_record_logged`
- Updates `sensor.{member_id}_{type_id}_record` entity state

---

### woow_ha_records/health/update_record

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
  "type": "woow_ha_records/health/update_record",
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

### woow_ha_records/health/delete_record

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
  "type": "woow_ha_records/health/delete_record",
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

### woow_ha_records/health/add_record_type

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
  "type": "woow_ha_records/health/add_record_type",
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

### woow_ha_records/health/update_record_type

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
  "type": "woow_ha_records/health/update_record_type",
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

### woow_ha_records/health/delete_record_type

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
  "type": "woow_ha_records/health/delete_record_type",
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

### woow_ha_records/health/add_member

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
  "type": "woow_ha_records/health/add_member",
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

### woow_ha_records/health/update_member

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
  "type": "woow_ha_records/health/update_member",
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

### woow_ha_records/health/delete_member

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
  "type": "woow_ha_records/health/delete_member",
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

