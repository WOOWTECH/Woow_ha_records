> 本文件屬於 [Woow HA Records Suite](../../../README_zh-TW.md) API 參考。完整索引見 [docs/api/](../README.md)。

# 財務 API 參考

多帳戶財務追蹤，支援交易、定期計畫與視覺化。每個帳戶為獨立的 ConfigEntry。所有財務指令皆為 **Public**（無需管理員權限）。

### 事件

| 事件 | 載荷 | 觸發條件 |
|------|------|----------|
| `woow_ha_records_finance_transaction_added` | `account`, `amount`, `note`, `type` | 透過協調器 `add_transaction` 後觸發 |
| `woow_ha_records_finance_recurring_executed` | `account`, `plan_id`, `title`, `amount` | 定期計畫在午夜執行時觸發 |
| `woow_ha_records_finance_balance_adjusted` | `account`, `old_balance`, `new_balance`, `diff` | 手動調整餘額後觸發 |
| `woow_ha_records_finance_low_balance` | `account`, `balance`, `threshold` | 餘額降至閾值以下時觸發（預設：1000） |

### 實體模式

每個帳戶會建立以下感測器實體：

| 唯一 ID 模式 | 說明 | 裝置類別 |
|-------------|------|----------|
| `{account_id}_balance_display` | 目前餘額 | —（state_class: total） |
| `{account_id}_last_transaction` | 最近交易金額 | — |
| `{account_id}_last_note` | 最近交易備註 | — |
| `{account_id}_last_time` | 最近交易時間戳 | `timestamp` |

每個帳戶中的定期計畫：

| 唯一 ID 模式 | 說明 | 裝置類別 |
|-------------|------|----------|
| `{account_id}_{plan_id}_next_date` | 下次執行日期 | `date` |
| `{account_id}_{plan_id}_last_executed` | 上次執行時間戳 | `timestamp` |

### 常數

| 常數 | 值 | 說明 |
|------|-----|------|
| `DEFAULT_LOW_BALANCE_THRESHOLD` | 1000.0 | 餘額低於此值觸發低餘額事件 |
| `DEFAULT_CURRENCY` | "NTD" | 預設貨幣單位 |
| 交易類型 | `manual`, `recurring`, `adjustment` | 區分交易建立方式 |
| 頻率選項 | `daily`, `weekly`, `monthly`, `yearly` | 定期計畫頻率 |

### woow_ha_records/finance/accounts

列出所有財務帳戶的基本資訊。

**驗證：** Public

**參數：** 無

**請求：**

```json
{
  "id": 23,
  "type": "woow_ha_records/finance/accounts"
}
```

**回應：**

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
        "note": "Family expenses"
      }
    ]
  }
}
```

---

### woow_ha_records/finance/account

取得帳戶完整詳情，包含所有交易與定期計畫。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `account_id` | string | 是 | 帳戶 ID |

**請求：**

```json
{
  "id": 24,
  "type": "woow_ha_records/finance/account",
  "account_id": "finance_abc123"
}
```

**回應：**

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
      "note": "Family expenses",
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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account not found | 無效的 `account_id` |

---

### woow_ha_records/finance/add_transaction

新增財務交易。正數金額 = 收入，負數 = 支出。觸發 `woow_ha_records_finance_transaction_added` 事件並檢查低餘額。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 說明 |
|------|------|------|--------|------|
| `account_id` | string | 是 | — | 帳戶 ID |
| `amount` | float | 是 | — | 交易金額（正數=收入，負數=支出） |
| `note` | string | 否 | `""` | 交易說明 |
| `transaction_type` | string | 否 | `"manual"` | 類型：`manual`、`recurring` 或 `adjustment` |

**請求：**

```json
{
  "id": 25,
  "type": "woow_ha_records/finance/add_transaction",
  "account_id": "finance_abc123",
  "amount": -500.0,
  "note": "Groceries"
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account not found | 無效的 `account_id` |
| `error` | Failed to create transaction | 內部錯誤 |

**副作用：**
- 更新帳戶餘額
- 觸發 `woow_ha_records_finance_transaction_added` 事件
- 餘額降至閾值以下時可能觸發 `woow_ha_records_finance_low_balance`

---

### woow_ha_records/finance/update_transaction

更新交易的金額或備註。若金額變更，餘額會重新計算。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `account_id` | string | 是 | 帳戶 ID |
| `transaction_id` | string | 是 | 交易 ID（例如 `tx_a1b2c3d4`） |
| `amount` | float | 否 | 新金額（重新計算餘額） |
| `note` | string | 否 | 新備註 |

**請求：**

```json
{
  "id": 26,
  "type": "woow_ha_records/finance/update_transaction",
  "account_id": "finance_abc123",
  "transaction_id": "tx_a1b2c3d4",
  "amount": -450.0,
  "note": "Groceries (adjusted)"
}
```

**回應：**

```json
{
  "id": 26,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account not found | 無效的 `account_id` |
| `not_found` | Transaction not found | 無效的 `transaction_id` |

**副作用：**
- 金額變更時重新計算餘額（加上差額）

---

### woow_ha_records/finance/delete_transaction

刪除交易。交易金額會從餘額中反轉。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `account_id` | string | 是 | 帳戶 ID |
| `transaction_id` | string | 是 | 交易 ID |

**請求：**

```json
{
  "id": 27,
  "type": "woow_ha_records/finance/delete_transaction",
  "account_id": "finance_abc123",
  "transaction_id": "tx_a1b2c3d4"
}
```

**回應：**

```json
{
  "id": 27,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account not found | 無效的 `account_id` |
| `not_found` | Transaction not found | 無效的 `transaction_id` |

**副作用：**
- 從餘額中反轉交易金額（balance -= transaction.amount）

---

### woow_ha_records/finance/add_plan

為帳戶新增定期計畫。計畫在排定日期到達時於午夜自動執行。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 驗證規則 | 說明 |
|------|------|------|--------|----------|------|
| `account_id` | string | 是 | — | 必須存在 | 帳戶 ID |
| `title` | string | 是 | — | — | 計畫名稱（例如「Monthly Rent」） |
| `amount` | float | 是 | — | — | 每次執行金額（正數=收入，負數=支出） |
| `frequency` | string | 是 | — | `daily`, `weekly`, `monthly`, `yearly` | 執行頻率 |
| `day` | int | 是 | — | 1–28 | 執行日（weekly 為星期幾，monthly/yearly 為幾號） |
| `month` | int | 否 | `1` | 1–12 | yearly 頻率的月份 |
| `active` | boolean | 否 | `true` | — | 計畫是否啟用 |

**頻率 + Day 語意：**
- `daily`：`day` 被忽略（每天執行）
- `weekly`：`day` = 1–7（週一至週日）
- `monthly`：`day` = 1–28（每月幾號）
- `yearly`：`day` = 1–28，`month` = 1–12

**請求：**

```json
{
  "id": 28,
  "type": "woow_ha_records/finance/add_plan",
  "account_id": "finance_abc123",
  "title": "Monthly Rent",
  "amount": -15000.0,
  "frequency": "monthly",
  "day": 1
}
```

**回應：**

```json
{
  "id": 28,
  "type": "result",
  "success": true,
  "result": { "success": true, "plan_id": "plan_a1b2c3d4" }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account not found | 無效的 `account_id` |

**副作用：**
- 建立 2 個感測器實體（`{plan_id}_next_date`、`{plan_id}_last_executed`）
- 計畫在 next_date 到達時於午夜自動執行

---

### woow_ha_records/finance/update_plan

更新定期計畫的屬性。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 驗證規則 | 說明 |
|------|------|------|----------|------|
| `account_id` | string | 是 | 必須存在 | 帳戶 ID |
| `plan_id` | string | 是 | 必須存在 | 計畫 ID |
| `title` | string | 否 | — | 新標題 |
| `amount` | float | 否 | — | 新金額 |
| `frequency` | string | 否 | `daily`/`weekly`/`monthly`/`yearly` | 新頻率 |
| `day` | int | 否 | 1–28 | 新日期 |
| `month` | int | 否 | 1–12 | 新月份 |
| `active` | boolean | 否 | — | 啟用/停用計畫 |

**請求：**

```json
{
  "id": 29,
  "type": "woow_ha_records/finance/update_plan",
  "account_id": "finance_abc123",
  "plan_id": "plan_a1b2c3d4",
  "amount": -16000.0,
  "active": true
}
```

**回應：**

```json
{
  "id": 29,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account not found | 無效的 `account_id` |
| `not_found` | Plan not found | 無效的 `plan_id` |

**副作用：**
- 頻率、日期或月份變更時重新計算 `next_date`

---

### woow_ha_records/finance/delete_plan

刪除定期計畫並清理關聯的感測器實體。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `account_id` | string | 是 | 帳戶 ID |
| `plan_id` | string | 是 | 計畫 ID |

**請求：**

```json
{
  "id": 30,
  "type": "woow_ha_records/finance/delete_plan",
  "account_id": "finance_abc123",
  "plan_id": "plan_a1b2c3d4"
}
```

**回應：**

```json
{
  "id": 30,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**副作用：**
- 移除 2 個感測器實體（`_next_date`、`_last_executed`）

---

### woow_ha_records/finance/chart_data

取得月度收支彙總資料供圖表使用。回傳結果按時間由舊到新排列。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 說明 |
|------|------|------|--------|------|
| `account_id` | string | 是 | — | 帳戶 ID |
| `months` | int | 否 | `6` | 包含的最近月份數 |

**請求：**

```json
{
  "id": 31,
  "type": "woow_ha_records/finance/chart_data",
  "account_id": "finance_abc123",
  "months": 3
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account not found | 無效的 `account_id` |

**邏輯：** `amount >= 0` 的交易計為收入；`amount < 0` 計為支出（取絕對值）。

---

### woow_ha_records/finance/add_account

建立新財務帳戶。透過設定流程建立新的 ConfigEntry，設定協調器與感測器實體。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 預設值 | 說明 |
|------|------|------|--------|------|
| `name` | string | 是 | — | 帳戶名稱（非空） |
| `initial_balance` | float | 否 | `0.0` | 初始餘額 |

**請求：**

```json
{
  "id": 32,
  "type": "woow_ha_records/finance/add_account",
  "name": "Savings Account",
  "initial_balance": 100000.0
}
```

**回應：**

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

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `invalid_name` | Account name cannot be empty | 名稱為空 |
| `flow_error` | Failed to create account config entry | 設定流程錯誤 |
| `flow_failed` | Config flow did not create entry: {reason} | 流程被拒絕 |

**副作用：**
- 建立 ConfigEntry → 協調器 → 4 個感測器實體
- 排程午夜定期計畫檢查

---

### woow_ha_records/finance/update_account

更新帳戶的名稱或備註。若名稱變更，ConfigEntry 標題與裝置註冊表也會更新。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `account_id` | string | 是 | 帳戶 ID |
| `name` | string | 否 | 新名稱（非空，不分大小寫唯一） |
| `note` | string | 否 | 新備註 |

**請求：**

```json
{
  "id": 33,
  "type": "woow_ha_records/finance/update_account",
  "account_id": "finance_abc123",
  "name": "Family Savings",
  "note": "Emergency fund"
}
```

**回應：**

```json
{
  "id": 33,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account not found | 無效的 `account_id` |
| `invalid_name` | Account name cannot be empty | 名稱為空 |
| `duplicate_name` | Account with this name already exists | 不分大小寫重複 |

**副作用：**
- 更新 ConfigEntry 標題與裝置註冊表名稱

---

### woow_ha_records/finance/delete_account

移除 ConfigEntry 以刪除財務帳戶。觸發完整清理。

**驗證：** Public

**參數：**

| 參數 | 型別 | 必要 | 說明 |
|------|------|------|------|
| `account_id` | string | 是 | 帳戶 ID |

**請求：**

```json
{
  "id": 34,
  "type": "woow_ha_records/finance/delete_account",
  "account_id": "finance_abc123"
}
```

**回應：**

```json
{
  "id": 34,
  "type": "result",
  "success": true,
  "result": { "success": true }
}
```

**錯誤：**

| 代碼 | 訊息 | 原因 |
|------|------|------|
| `not_found` | Account config entry not found | 無效的 `account_id` |
| `remove_error` | Failed to remove account config entry | 移除錯誤 |

**副作用：**
- 移除 ConfigEntry、協調器、所有感測器實體、裝置及儲存中的帳戶資料

---

