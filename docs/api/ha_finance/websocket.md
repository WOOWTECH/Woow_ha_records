> Part of the [Woow HA Records Suite](../../../README.md) API reference. See [docs/api/](../README.md) for the full index.

# Finance API Reference

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

