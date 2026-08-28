> Part of the [Woow HA Records Suite](../../../README.md) API reference. See [docs/api/](../README.md) for the full index.

# Asset Record API Reference

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

### woow_ha_records/asset/list

List all tracked assets with full details.

**Auth:** Public

**Parameters:** None (beyond `type`)

**Request:**

```json
{
  "id": 13,
  "type": "woow_ha_records/asset/list"
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

### woow_ha_records/asset/create

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
  "type": "woow_ha_records/asset/create",
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

### woow_ha_records/asset/update

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
  "type": "woow_ha_records/asset/update",
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

### woow_ha_records/asset/delete

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
  "type": "woow_ha_records/asset/delete",
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

### woow_ha_records/asset/delete_category

Delete a category and **cascade-delete all assets** filed under it. Also removes each deleted asset's entities and its device from the device registry.

The cascade is opt-in. A category that still holds assets is refused unless `force` is `true`, and nothing is deleted. Unlike a note, an asset has an escape route — `woow_ha_records/asset/update` moves it to another `category_id` — so reassigning what is worth keeping and then deleting the emptied category needs no `force` at all. The asset panel names the category and counts its assets before asking, so it passes `force`.

The other two category commands, `create_category` and `update_category`, are not yet documented here.

**Auth:** Admin

**Parameters:**

| Parameter | Type | Required | Validation | Description |
|-----------|------|----------|------------|-------------|
| `category_id` | string | Yes | Regex `^cat_[a-f0-9]+$` | Category ID |
| `force` | boolean | No | — | Confirm that the assets in the category may be deleted with it. Defaults to `false`, which refuses a non-empty category and deletes nothing. |

**Request:**

```json
{
  "id": 17,
  "type": "woow_ha_records/asset/delete_category",
  "category_id": "cat_a1b2c3d4e5f6...",
  "force": true
}
```

`force` is shown here because the example category holds assets. Omit it for a
category you expect to be empty, and let the `not_empty` refusal tell you when
it is not — that refusal is the guard, not an obstacle to route around.

**Response:**

```json
{
  "id": 17,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**Errors:**

| Code | Message | Cause |
|------|---------|-------|
| `not_found` | Integration not configured | Integration not set up |
| `not_found` | Category {id} not found | Invalid `category_id` |
| `not_empty` | Category '...' still holds N asset(s)... | Category holds assets and `force` was not set; nothing was deleted |

**Side Effects:** (only once the call is accepted — a refusal changes nothing)
- Cascade-deletes every asset filed under the category
- Removes each deleted asset's entities and its device from the device registry

---

