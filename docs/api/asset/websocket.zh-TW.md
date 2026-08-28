> 本文件屬於 [Woow HA Records Suite](../../../README_zh-TW.md) API 參考。完整索引見 [docs/api/](../README.md)。

# 資產記錄 API 參考

管理家庭資產，包含購買追蹤、保固監控與 Markdown 文件。單一實例整合 — 一個 ConfigEntry 管理所有資產。

### 實體模式

每項資產會建立以下實體：

| 平台 | 唯一 ID 模式 | 說明 |
|------|-------------|------|
| `datetime` | `{asset_id}_purchase_date` | 購買日期 |
| `datetime` | `{asset_id}_warranty_expiry` | 保固到期日 |
| `number` | `{asset_id}_price` | 資產價格/價值 |
| `text` | `{asset_id}_brand` | 資產品牌 |
| `text` | `{asset_id}_name` | 資產名稱 |

資產 ID 格式為 `asset_{uuid4_hex}`（例如 `asset_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4`）。

### woow_ha_records/asset/list

列出所有追蹤中的資產及完整詳情。

**驗證：** Public

**參數：** 無（僅需 `type`）

**請求：**

```json
{
  "id": 13,
  "type": "woow_ha_records/asset/list"
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Integration not configured | 資產記錄整合未設定 |

---

### woow_ha_records/asset/create

建立新資產。回傳含自動產生 ID 的資產資料。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 驗證規則 | 說明 |
|------|------|------|--------|----------|------|
| `name` | string | 是 | — | 最多 255 字元，去空格後非空 | 資產名稱 |
| `brand` | string | 否 | `""` | 最多 255 字元 | 品牌名稱 |
| `category` | string | 否 | `""` | 最多 255 字元 | 分類名稱 |
| `value` | float | 否 | `0` | — | 金額價值 |
| `purchase_at` | string/null | 否 | `null` | ISO 8601 日期時間或 null | 購買日期 |
| `warranty_until` | string/null | 否 | `null` | ISO 8601 日期時間或 null | 保固到期日 |
| `manual_md` | string | 否 | `""` | 最多 65,535 字元 | Markdown 說明書/文件 |
| `maintenance_md` | string | 否 | `""` | 最多 65,535 字元 | Markdown 維護日誌 |

**請求：**

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

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Integration not configured | 資產記錄整合未設定 |
| `invalid_input` | Asset name is required | 去空格後名稱為空 |
| `invalid_format` | Invalid purchase_at datetime: ... | 無法解析的日期時間字串 |
| `invalid_format` | Invalid warranty_until datetime: ... | 無法解析的日期時間字串 |

**副作用：**
- 建立 5 個實體（datetime×2、number×1、text×2）

---

### woow_ha_records/asset/update

更新現有資產的一個或多個欄位。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `asset_id` | string | 是 | 正規式 `^asset_[a-f0-9]+$` | 資產 ID |
| `name` | string | 否 | 最多 255 字元，非空 | 新名稱 |
| `brand` | string | 否 | 最多 255 字元 | 新品牌 |
| `category` | string | 否 | 最多 255 字元 | 新分類 |
| `value` | float | 否 | — | 新價值 |
| `purchase_at` | string/null | 否 | ISO 8601 或 null | 新購買日期 |
| `warranty_until` | string/null | 否 | ISO 8601 或 null | 新保固日期 |
| `manual_md` | string | 否 | 最多 65,535 字元 | 新說明書內容 |
| `maintenance_md` | string | 否 | 最多 65,535 字元 | 新維護內容 |

**請求：**

```json
{
  "id": 15,
  "type": "woow_ha_records/asset/update",
  "asset_id": "asset_a1b2c3d4e5f6...",
  "value": 45000.0,
  "maintenance_md": "## 2025-01 Maintenance\n- Replaced battery"
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Integration not configured | 整合未設定 |
| `not_found` | Asset {id} not found | 無效的 `asset_id` |
| `invalid_input` | Asset name cannot be empty | 名稱為空 |
| `invalid_format` | Invalid purchase_at/warranty_until datetime | 無法解析的日期時間 |

---

### woow_ha_records/asset/delete

刪除資產及所有關聯實體。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `asset_id` | string | 是 | 正規式 `^asset_[a-f0-9]+$` | 資產 ID |

**請求：**

```json
{
  "id": 16,
  "type": "woow_ha_records/asset/delete",
  "asset_id": "asset_a1b2c3d4e5f6..."
}
```

**回應：**

```json
{
  "id": 16,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Integration not configured | 整合未設定 |
| `not_found` | Asset {id} not found | 無效的 `asset_id` |

**副作用：**
- 移除所有 5 個關聯實體及裝置註冊表中的裝置

---

### woow_ha_records/asset/delete_category

刪除分類並**連鎖刪除其下所有資產**。同時移除每項被刪除資產的實體，以及裝置註冊表中的裝置。

連鎖刪除需要明確選入。若分類下仍有資產，除非 `force` 為 `true`，否則會拒絕該呼叫且不刪除任何資料。與筆記不同，資產有退路——`woow_ha_records/asset/update` 可將它改到別的 `category_id`——因此先把值得保留的資產移出，再刪除已清空的分類，根本不需要 `force`。資產面板在詢問前已列出分類名稱與其資產數量，因此會傳入 `force`。

另外兩個分類指令 `create_category` 與 `update_category` 尚未於此文件記載。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `category_id` | string | 是 | 正規式 `^cat_[a-f0-9]+$` | 分類 ID |
| `force` | boolean | 否 | — | 確認分類下的資產可一併刪除。預設 `false`，此時會拒絕非空分類且不刪除任何資料。 |

**請求：**

```json
{
  "id": 17,
  "type": "woow_ha_records/asset/delete_category",
  "category_id": "cat_a1b2c3d4e5f6...",
  "force": true
}
```

此處列出 `force` 是因為範例分類下有資產。若預期分類為空，請省略它，並由 `not_empty`
拒絕告知你並非如此——這個拒絕就是防護本身，而不是需要繞過的障礙。

**回應：**

```json
{
  "id": 17,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Integration not configured | 整合未設定 |
| `not_found` | Category {id} not found | 無效的 `category_id` |
| `not_empty` | Category '...' still holds N asset(s)... | 分類下仍有資產且未設定 `force`；未刪除任何資料 |

**副作用：**（僅在呼叫被接受後發生；遭拒絕時不會改變任何資料）
- 連鎖刪除分類下的每項資產
- 移除每項被刪除資產的實體，以及裝置註冊表中的裝置

---

