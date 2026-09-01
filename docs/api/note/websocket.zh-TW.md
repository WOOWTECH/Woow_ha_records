> 本文件屬於 [Woow HA Records Suite](../../../README_zh-TW.md) API 參考。完整索引見 [docs/api/](../README.md)。

# 筆記記錄 API 參考

整理個人筆記，支援分類、搜尋與 Markdown。筆記分組至分類中，每個分類及其筆記共用裝置註冊表中的裝置。

### 實體模式

每則筆記會建立以下實體：

| 平台 | 唯一 ID 模式 | 說明 |
|------|-------------|------|
| `text` | `{domain}_{category_id}_{note_id}_content` | 筆記內容（text 實體） |
| `switch` | `{domain}_{category_id}_{note_id}_pinned` | 置頂狀態（switch 實體） |

### 驗證限制

| 欄位 | 最大長度 |
|------|----------|
| 分類名稱 | 100 字元 |
| 筆記標題 | 200 字元 |
| 筆記內容 | 100,000 字元（100KB） |

### woow_ha_records/note/get_data

列出所有分類與所有筆記。

**驗證：** Public

**參數：** 無（僅需 `type`）

**請求：**

```json
{
  "id": 17,
  "type": "woow_ha_records/note/get_data"
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Store not initialized | 整合未設定 |

---

### woow_ha_records/note/create_category

建立新筆記分類。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `name` | string | 是 | 去空格後非空，最多 100 字元，不分大小寫唯一 | 分類名稱 |

**請求：**

```json
{
  "id": 18,
  "type": "woow_ha_records/note/create_category",
  "name": "Work Notes"
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Store not initialized | 整合未設定 |
| `invalid_input` | Category name is required | 名稱為空 |
| `invalid_input` | Category name exceeds maximum length of 100 characters | 名稱過長 |
| `duplicate` | Category already exists | 不分大小寫重複 |

---

### woow_ha_records/note/create_note

在分類中建立新筆記。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 驗證規則 | 說明 |
|------|------|------|--------|----------|------|
| `category_id` | string | 是 | — | 必須存在 | 分類 ID |
| `title` | string | 是 | — | 去空格後非空，最多 200 字元，同分類內不分大小寫唯一 | 筆記標題 |
| `content` | string | 否 | `""` | 最多 100,000 字元 | 筆記內容（支援 Markdown） |
| `pinned` | boolean | 否 | `false` | — | 是否置頂 |

**請求：**

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

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Store not initialized | 整合未設定 |
| `not_found` | Category not found | 無效的 `category_id` |
| `invalid_input` | Note title is required | 標題為空 |
| `invalid_input` | Note title exceeds maximum length of 200 characters | 標題過長 |
| `invalid_input` | Note content exceeds maximum length of 100000 characters | 內容過長 |
| `duplicate` | Note title already exists in this category | 不分大小寫重複標題 |

**副作用：**
- 建立 2 個實體（text 用於內容，switch 用於置頂）

---

### woow_ha_records/note/update_note

更新筆記的分類、標題、內容或置頂狀態。除 `note_id` 外皆為選填 — 僅更新提供的欄位。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `note_id` | string | 是 | 必須存在 | 筆記 ID |
| `category_id` | string | 否 | 必須存在，且該分類不得已有同名筆記 | 將筆記移動到這個分類 |
| `title` | string | 否 | 非空，最多 200 字元，同分類內唯一 | 新標題 |
| `content` | string | 否 | 最多 100,000 字元 | 新內容 |
| `pinned` | boolean | 否 | — | 新置頂狀態 |

傳入 `category_id` 即為移動筆記。標題、內容、置頂狀態與 `created_at` 皆保留，只有分類與 `updated_at` 改變，`_content` 與 `_pinned` 兩個實體會改掛到目的分類的裝置底下。重複標題檢查是對**目的分類**執行，因此即使不改標題，只要目的分類已有同名筆記仍會被拒絕。筆記的 `entity_id` 不會改變，也從未包含分類名稱——見 [ADR-0003](../../adr/0003-category-is-a-note-attribute-not-part-of-note-identity.md)。

**請求：**

```json
{
  "id": 20,
  "type": "woow_ha_records/note/update_note",
  "note_id": "note_def456",
  "title": "Q1 Meeting Notes (Updated)",
  "pinned": false
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Store not initialized | 整合未設定 |
| `not_found` | Note not found | 無效的 `note_id` |
| `invalid_input` | Note title is required | 標題為空 |
| `invalid_input` | Note title/content exceeds maximum length | 過長 |
| `duplicate` | Note title already exists in this category | 不分大小寫重複 |

---

### woow_ha_records/note/delete_note

刪除筆記並清理實體註冊表項目。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `note_id` | string | 是 | 筆記 ID |

**請求：**

```json
{
  "id": 21,
  "type": "woow_ha_records/note/delete_note",
  "note_id": "note_def456"
}
```

**回應：**

```json
{
  "id": 21,
  "type": "result",
  "success": true,
  "result": { "deleted": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Store not initialized | 整合未設定 |
| `not_found` | Note not found | 無效的 `note_id` |

**副作用：**
- 移除 2 個實體註冊表項目（text、switch）

---

### woow_ha_records/note/delete_category

刪除分類並**連鎖刪除其中所有筆記**。同時移除所有實體註冊表與裝置註冊表項目。

連鎖刪除需要明確選入，且無法復原——若分類下仍有筆記，除非 `force` 為 `true`，否則會拒絕該呼叫。筆記現在有退路了：`woow_ha_records/note/update_note` 可以把筆記移到別的 `category_id`，因此先把要留的筆記移走、再刪除已清空的分類，完全不需要 `force`。筆記面板已要求使用者輸入分類名稱確認，因此會傳入 `force`。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `category_id` | string | 是 | 分類 ID |
| `force` | boolean | 否 | 確認分類下的筆記可一併刪除。預設 `false`，此時會拒絕非空分類且不刪除任何資料。 |

**請求：**

```json
{
  "id": 22,
  "type": "woow_ha_records/note/delete_category",
  "category_id": "cat_abc123",
  "force": true
}
```

此處列出 `force` 是因為範例分類下有筆記。若預期分類為空，請省略它，並由 `not_empty`
拒絕告知你並非如此——這個拒絕就是防護本身，而不是需要繞過的障礙。

**回應：**

```json
{
  "id": 22,
  "type": "result",
  "success": true,
  "result": { "deleted": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Store not initialized | 整合未設定 |
| `not_found` | Category not found | 無效的 `category_id` |
| `not_empty` | Category '...' still holds N note(s)... | 分類下仍有筆記且未設定 `force`；未刪除任何資料 |

**副作用：**（僅在呼叫被接受後發生；遭拒絕時不會改變任何資料）
- 連鎖刪除分類中的所有筆記
- 移除所有關聯的實體註冊表項目（每則筆記 2 個）
- 從裝置註冊表中移除裝置

---

