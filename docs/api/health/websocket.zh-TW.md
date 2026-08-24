> 本文件屬於 [Woow HA Records Suite](../../../README_zh-TW.md) API 參考。完整索引見 [docs/api/](../README.md)。

# 健康記錄 API 參考

追蹤多位家庭成員的健康指標（體重、體溫、餵食、睡眠等）。每位成員為獨立的 ConfigEntry，支援自訂記錄類型。

### 事件

| 事件 | 載荷 | 觸發條件 |
|------|------|----------|
| `woow_ha_records_health_record_logged` | `member_id`, `member_name`, `record_type`, `record_name`, `value`, `unit`, `note`, `timestamp` | `log_record` 成功後觸發 |

### 實體模式

每個成員 + 記錄類型組合會建立以下實體：

| 平台 | 唯一 ID 模式 | 說明 |
|------|-------------|------|
| `sensor` | `{member_id}_{type_id}_record` | 最新記錄值（例如 `sensor.baby_ming_weight_record`） |
| `button` | `{member_id}_{type_id}_log` | 快速記錄按鈕 |
| `number` | `{member_id}_{type_id}_value` | 記錄前設定數值的輸入 |
| `text` | `{member_id}_{type_id}_note` | 記錄前設定備註的輸入 |

### woow_ha_records/health/get_members

列出所有家庭成員及其記錄類型、目前數值與最新記錄。

**驗證：** Public

**參數：** 無（僅需 `type`）

**請求：**

```json
{
  "id": 1,
  "type": "woow_ha_records/health/get_members"
}
```

**回應：**

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

**錯誤：** 無特定錯誤（總是成功，無成員時回傳空陣列）

---

### woow_ha_records/health/get_records

依時間範圍查詢健康記錄，跨所有成員。回傳結果按時間戳降序排列。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `start_time` | string | 是 | ISO 8601 日期時間 | 時間範圍起始（含） |
| `end_time` | string | 是 | ISO 8601 日期時間 | 時間範圍結束（含） |

**請求：**

```json
{
  "id": 2,
  "type": "woow_ha_records/health/get_records",
  "start_time": "2025-01-01T00:00:00Z",
  "end_time": "2025-01-31T23:59:59Z"
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `invalid_date` | Invalid date format | `start_time` 或 `end_time` 不是有效的 ISO 8601 |

---

### woow_ha_records/health/export_csv

匯出特定成員的所有記錄為 CSV 內容。CSV 欄位：`timestamp`, `record_type`, `record_name`, `value`, `unit`, `note`。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `member_id` | string | 是 | 成員的唯一 ID |

**請求：**

```json
{
  "id": 3,
  "type": "woow_ha_records/health/export_csv",
  "member_id": "baby_ming"
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |

---

### woow_ha_records/health/log_record

記錄一筆健康數據。觸發 `woow_ha_records_health_record_logged` 事件。更新該記錄類型的感測器實體。記錄永久保留。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 驗證規則 | 說明 |
|------|------|------|--------|----------|------|
| `member_id` | string | 是 | — | 必須為現有成員 | 成員的唯一 ID |
| `record_type` | string | 是 | — | 必須為現有記錄類型 | 記錄類型 ID（例如 `weight`） |
| `value` | float | 是 | — | 有限數字（非 NaN/Infinity） | 記錄的數值 |
| `note` | string | 否 | `""` | — | 選填文字備註 |
| `timestamp` | string | 否 | 目前時間 | ISO 8601 日期時間 | 覆蓋記錄時間戳 |

**請求：**

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

**回應：**

```json
{
  "id": 4,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |
| `record_type_not_found` | Record type {type} not found | 無效的 `record_type` |
| `invalid_timestamp` | Invalid timestamp format | `timestamp` 不是有效的 ISO 8601 |
| `log_failed` | Failed to log record | 內部錯誤 |

**副作用：**
- 觸發事件 `woow_ha_records_health_record_logged`
- 更新 `sensor.{member_id}_{type_id}_record` 實體狀態

---

### woow_ha_records/health/update_record

更新現有記錄的數值、備註或時間戳。支援以 UUID（`record_id`）或以 `type_id` + `timestamp` 回退查找。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `member_id` | string | 是 | 必須為現有成員 | 成員的唯一 ID |
| `type_id` | string | 是 | — | 記錄類型 ID |
| `timestamp` | string | 是 | ISO 8601 | 原始時間戳（回退查找鍵） |
| `record_id` | string | 否 | UUID hex | 建議使用：記錄的 UUID |
| `value` | float | 否 | 有限數字 | 新數值 |
| `note` | string | 否 | — | 新備註 |
| `new_timestamp` | string | 否 | ISO 8601 | 新時間戳 |

**請求：**

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

**回應：**

```json
{
  "id": 5,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |
| `record_not_found` | Record not found | 無匹配的記錄 |

---

### woow_ha_records/health/delete_record

依 UUID 或類型 + 時間戳回退方式刪除特定記錄。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `member_id` | string | 是 | 必須為現有成員 | 成員的唯一 ID |
| `type_id` | string | 是 | — | 記錄類型 ID |
| `timestamp` | string | 是 | ISO 8601 | 記錄時間戳（回退查找鍵） |
| `record_id` | string | 否 | UUID hex | 建議使用：記錄的 UUID |

**請求：**

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

**回應：**

```json
{
  "id": 6,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |
| `record_not_found` | Record not found | 無匹配的記錄 |

---

### woow_ha_records/health/add_record_type

為成員新增自訂記錄類型（量測種類）。觸發 ConfigEntry 重新載入以建立新實體。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 驗證規則 | 說明 |
|------|------|------|--------|----------|------|
| `member_id` | string | 是 | — | 必須為現有成員 | 成員的唯一 ID |
| `name` | string | 是 | — | 至少包含 1 個英數字元 | 顯示名稱（例如「Blood Pressure」） |
| `unit` | string | 是 | — | — | 量測單位（例如「mmHg」） |
| `default_value` | float | 否 | `0` | 有限數字 | 快速記錄的預設值 |
| `default_value_mode` | string | 否 | `"fixed"` | `"fixed"` 或 `"last_value"` | 預設值的決定方式 |

**請求：**

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

**回應：**

```json
{
  "id": 7,
  "type": "result",
  "success": true,
  "result": { "success": true, "type_id": "temperature" }
}
```

`type_id` 由 `name` 自動產生：轉小寫，空格/連字號替換為底線，去除非英數字元。

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |
| `invalid_type_id` | Name must contain at least one alphanumeric character | 名稱清理後 type_id 為空 |
| `type_exists` | Record type {type_id} already exists | 重複的 type_id |

**副作用：**
- 重新載入 ConfigEntry（建立新的 sensor、button、number、text 實體）

---

### woow_ha_records/health/update_record_type

更新現有記錄類型的名稱、單位或預設值設定。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `member_id` | string | 是 | 必須為現有成員 | 成員的唯一 ID |
| `type_id` | string | 是 | 必須為現有類型 | 記錄類型 ID |
| `name` | string | 是 | — | 新顯示名稱 |
| `unit` | string | 是 | — | 新單位 |
| `default_value` | float | 否 | 有限數字 | 新預設值 |
| `default_value_mode` | string | 否 | `"fixed"` 或 `"last_value"` | 新預設值模式 |

**請求：**

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

**回應：**

```json
{
  "id": 8,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |
| `type_not_found` | Record type {type_id} not found | 無效的 `type_id` |

**副作用：**
- 重新載入 ConfigEntry（更新實體名稱/單位）

---

### woow_ha_records/health/delete_record_type

刪除記錄類型並從實體註冊表中清理所有關聯實體。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `member_id` | string | 是 | 成員的唯一 ID |
| `type_id` | string | 是 | 要刪除的記錄類型 ID |

**請求：**

```json
{
  "id": 9,
  "type": "woow_ha_records/health/delete_record_type",
  "member_id": "baby_ming",
  "type_id": "temperature"
}
```

**回應：**

```json
{
  "id": 9,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |
| `type_not_found` | Record type {type_id} not found | 無效的 `type_id` |

**副作用：**
- 移除 4 個實體註冊表項目（sensor、button、number、text）
- 重新載入 ConfigEntry

---

### woow_ha_records/health/add_member

新增家庭成員。透過設定流程建立新的 ConfigEntry。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 說明 |
|------|------|------|--------|------|
| `name` | string | 是 | — | 顯示名稱（例如「Baby Ming」） |
| `member_id` | string | 否 | 由名稱自動產生 | 唯一 ID（英數字元 + 底線） |
| `note` | string | 否 | `""` | 選填的成員備註 |

若未提供 `member_id`，會自動產生：轉小寫，空格/連字號 → 底線，去除非英數字元。

**請求：**

```json
{
  "id": 10,
  "type": "woow_ha_records/health/add_member",
  "name": "Baby Ming",
  "note": "Born 2024-01-15"
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `invalid_member_id` | Member ID is empty after sanitization | 名稱清理後 ID 為空 |
| `member_exists` | Member {id} already exists | 重複的 member_id |
| `create_failed` | Failed to create member | 設定流程錯誤 |

---

### woow_ha_records/health/update_member

更新成員的名稱或備註。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 說明 |
|------|------|------|--------|------|
| `member_id` | string | 是 | — | 成員的唯一 ID |
| `name` | string | 是 | — | 新顯示名稱 |
| `note` | string | 否 | `""` | 新備註 |

**請求：**

```json
{
  "id": 11,
  "type": "woow_ha_records/health/update_member",
  "member_id": "baby_ming",
  "name": "Ming (Updated)",
  "note": "Now 1 year old"
}
```

**回應：**

```json
{
  "id": 11,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |

**副作用：**
- 更新 ConfigEntry 資料與標題
- 重新載入 ConfigEntry

---

### woow_ha_records/health/delete_member

刪除家庭成員及所有關聯資料（移除 ConfigEntry）。

**驗證：** Admin

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `member_id` | string | 是 | 成員的唯一 ID |

**請求：**

```json
{
  "id": 12,
  "type": "woow_ha_records/health/delete_member",
  "member_id": "baby_ming"
}
```

**回應：**

```json
{
  "id": 12,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `member_not_found` | Member {id} not found | 無效的 `member_id` |

**副作用：**
- 移除 ConfigEntry 及所有關聯的實體、裝置與儲存資料

---

