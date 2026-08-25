> Part of the [Woow HA Records Suite](../../../README.md) API reference. See [docs/api/](../README.md) for the full index.

# Note Record API Reference

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

### woow_ha_records/note/get_data

List all categories and all notes.

**Auth:** Public

**Parameters:** None (beyond `type`)

**Request:**

```json
{
  "id": 17,
  "type": "woow_ha_records/note/get_data"
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

### woow_ha_records/note/create_category

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
  "type": "woow_ha_records/note/create_category",
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

### woow_ha_records/note/create_note

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
  "type": "woow_ha_records/note/create_note",
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

### woow_ha_records/note/update_note

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
  "type": "woow_ha_records/note/update_note",
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

### woow_ha_records/note/delete_note

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
  "type": "woow_ha_records/note/delete_note",
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

### woow_ha_records/note/delete_category

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
  "type": "woow_ha_records/note/delete_category",
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

