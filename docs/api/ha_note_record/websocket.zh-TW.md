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

### ha_note_record/get_data

列出所有分類與所有筆記。

**驗證：** Public

**參數：** 無（僅需 `type`）

**請求：**

```json
{
  "id": 17,
  "type": "ha_note_record/get_data"
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

### ha_note_record/create_category

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
  "type": "ha_note_record/create_category",
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

### ha_note_record/create_note

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
  "type": "ha_note_record/create_note",
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

### ha_note_record/update_note

更新筆記的標題、內容或置頂狀態。所有欄位皆為選填 — 僅更新提供的欄位。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `note_id` | string | 是 | 必須存在 | 筆記 ID |
| `title` | string | 否 | 非空，最多 200 字元，同分類內唯一 | 新標題 |
| `content` | string | 否 | 最多 100,000 字元 | 新內容 |
| `pinned` | boolean | 否 | — | 新置頂狀態 |

**請求：**

```json
{
  "id": 20,
  "type": "ha_note_record/update_note",
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

### ha_note_record/delete_note

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
  "type": "ha_note_record/delete_note",
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

### ha_note_record/delete_category

刪除分類並**連鎖刪除其中所有筆記**。同時移除所有實體註冊表與裝置註冊表項目。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `category_id` | string | 是 | 分類 ID |

**請求：**

```json
{
  "id": 22,
  "type": "ha_note_record/delete_category",
  "category_id": "cat_abc123"
}
```

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

**副作用：**
- 連鎖刪除分類中的所有筆記
- 移除所有關聯的實體註冊表項目（每則筆記 2 個）
- 從裝置註冊表中移除裝置

---

