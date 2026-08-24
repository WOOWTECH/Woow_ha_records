# ha_finance Services — AI Agent & Automation Guide

## Quick Reference

| Service | Type | Required Fields | Description |
|---------|------|----------------|-------------|
| `ha_finance.get_accounts` | Query | — | List all accounts |
| `ha_finance.get_account` | Query | `account_id` | Full account detail |
| `ha_finance.get_chart_data` | Query | `account_id` | Monthly income/expense data |
| `ha_finance.export_csv` | Query | `account_id` | Export transactions as CSV |
| `ha_finance.add_transaction` | Write | `account_id`, `amount` | Add income/expense |
| `ha_finance.update_transaction` | Write | `account_id`, `transaction_id` | Modify transaction |
| `ha_finance.delete_transaction` | Write | `account_id`, `transaction_id` | Delete + revert balance |
| `ha_finance.add_plan` | Write | `account_id`, `title`, `amount`, `frequency`, `day` | Create recurring plan |
| `ha_finance.update_plan` | Write | `account_id`, `plan_id` | Modify plan settings |
| `ha_finance.delete_plan` | Write | `account_id`, `plan_id` | Delete recurring plan |
| `ha_finance.add_account` | Write | `name` | Create new account |
| `ha_finance.update_account` | Write | `account_id` | Rename / update notes |
| `ha_finance.delete_account` | Write | `account_id` | Delete account + all data |
| `ha_finance.adjust_balance` | Write | `account_id`, `new_balance` | Set absolute balance |

## Calling Convention

### REST API

```
POST /api/services/ha_finance/<service_name>?return_response
Authorization: Bearer <long-lived-access-token>
Content-Type: application/json
```

- **Query services** (get_accounts, get_account, get_chart_data, export_csv): `?return_response` is **required** — they use `SupportsResponse.ONLY`.
- **Write services** (all others): `?return_response` is **optional** — they use `SupportsResponse.OPTIONAL`. Omit it for fire-and-forget.

### Python (Automations / Scripts)

```python
response = await hass.services.async_call(
    "ha_finance",
    "get_accounts",
    {},
    blocking=True,
    return_response=True,
)
# response == {"accounts": [...]}
```

---

## Service Details & Examples

### 1. get_accounts — List All Accounts

Returns all accounts with summary data.

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "http://localhost:8123/api/services/ha_finance/get_accounts?return_response"
```

**Response:**
```json
{
  "service_response": {
    "accounts": [
      {
        "id": "my_wallet",
        "name": "My Wallet",
        "balance": 15000.50,
        "notes": "Daily expenses"
      },
      {
        "id": "savings",
        "name": "Savings Account",
        "balance": 100000.00,
        "notes": ""
      }
    ]
  }
}
```

### 2. get_account — Full Account Detail

Returns an account with its complete transaction history and recurring plans.

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet"}' \
  "http://localhost:8123/api/services/ha_finance/get_account?return_response"
```

**Response:**
```json
{
  "service_response": {
    "account": {
      "id": "my_wallet",
      "name": "My Wallet",
      "balance": 15000.50,
      "notes": "Daily expenses",
      "transactions": [
        {
          "id": "tx_a1b2c3d4",
          "amount": -350.00,
          "note": "Grocery shopping",
          "timestamp": "2026-05-15T10:30:00+08:00",
          "type": "manual",
          "plan_id": null
        }
      ],
      "recurring_plans": {
        "plan_e5f6g7h8": {
          "title": "Monthly Salary",
          "amount": 50000.00,
          "frequency": "monthly",
          "day": 5,
          "month": 1,
          "active": true,
          "last_executed": "2026-05-05T00:00:00+00:00",
          "next_date": "2026-06-05"
        }
      }
    }
  }
}
```

### 3. get_chart_data — Monthly Income/Expense Analytics

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "months": 3}' \
  "http://localhost:8123/api/services/ha_finance/get_chart_data?return_response"
```

**Response:**
```json
{
  "service_response": {
    "data": [
      {"month": "2026-03", "income": 50000.00, "expenses": 32000.50},
      {"month": "2026-04", "income": 50000.00, "expenses": 28500.00},
      {"month": "2026-05", "income": 50000.00, "expenses": 15200.75}
    ]
  }
}
```

### 4. export_csv — Export Transactions

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet"}' \
  "http://localhost:8123/api/services/ha_finance/export_csv?return_response"
```

**Response:**
```json
{
  "service_response": {
    "csv_content": "timestamp,amount,note,type,plan_id\n2026-05-15T10:30:00+08:00,-350.0,Grocery shopping,manual,\n...",
    "account_name": "My Wallet",
    "transaction_count": 42
  }
}
```

### 5. add_transaction — Record Income or Expense

**Fields:**
| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `account_id` | Yes | string | Account identifier |
| `amount` | Yes | float | Positive = income, negative = expense |
| `note` | No | string | Description (default: "") |
| `transaction_type` | No | string | "manual" (default), "recurring", or "adjustment" |

**curl:**
```bash
# Record an expense
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "amount": -350, "note": "Grocery shopping"}' \
  "http://localhost:8123/api/services/ha_finance/add_transaction?return_response"

# Record income
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "amount": 50000, "note": "May salary"}' \
  "http://localhost:8123/api/services/ha_finance/add_transaction?return_response"
```

**Response:**
```json
{
  "service_response": {
    "success": true,
    "transaction": {
      "id": "tx_a1b2c3d4",
      "amount": -350.0,
      "note": "Grocery shopping",
      "timestamp": "2026-05-15T10:30:00+08:00",
      "type": "manual",
      "plan_id": null
    }
  }
}
```

**Events fired:**
- `ha_finance_transaction_added` — always
- `ha_finance_low_balance` — if balance drops below threshold

### 6. update_transaction — Modify Transaction

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "transaction_id": "tx_a1b2c3d4", "amount": -300, "note": "Corrected amount"}' \
  "http://localhost:8123/api/services/ha_finance/update_transaction?return_response"
```

Balance is automatically adjusted by the difference (old -350 → new -300 = +50 to balance).

### 7. delete_transaction — Delete & Revert Balance

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "transaction_id": "tx_a1b2c3d4"}' \
  "http://localhost:8123/api/services/ha_finance/delete_transaction?return_response"
```

Balance is reverted: if the deleted transaction was -350, balance increases by 350.

### 8. add_plan — Create Recurring Plan

**Fields:**
| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `account_id` | Yes | string | Account identifier |
| `title` | Yes | string | Human-readable name |
| `amount` | Yes | float | Positive = income, negative = expense |
| `frequency` | Yes | string | "daily", "weekly", "monthly", "yearly" |
| `day` | Yes | int | 1-28 (monthly/yearly), 1-7 Mon-Sun (weekly) |
| `month` | No | int | 1-12, for yearly only (default: 1) |
| `active` | No | bool | Enable on creation (default: true) |

**curl:**
```bash
# Monthly salary on the 5th
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "title": "Monthly Salary", "amount": 50000, "frequency": "monthly", "day": 5}' \
  "http://localhost:8123/api/services/ha_finance/add_plan?return_response"

# Weekly grocery budget on Saturdays (day=6)
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "title": "Weekly Groceries", "amount": -2000, "frequency": "weekly", "day": 6}' \
  "http://localhost:8123/api/services/ha_finance/add_plan?return_response"

# Yearly insurance on March 15
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "title": "Insurance Premium", "amount": -12000, "frequency": "yearly", "day": 15, "month": 3}' \
  "http://localhost:8123/api/services/ha_finance/add_plan?return_response"
```

**Response:**
```json
{
  "service_response": {
    "success": true,
    "plan_id": "plan_e5f6g7h8"
  }
}
```

### 9. update_plan — Modify Recurring Plan

All fields except `account_id` and `plan_id` are optional — only pass what you want to change.

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "plan_id": "plan_e5f6g7h8", "amount": 55000, "title": "Salary (Raise)"}' \
  "http://localhost:8123/api/services/ha_finance/update_plan?return_response"

# Pause a plan
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "plan_id": "plan_e5f6g7h8", "active": false}' \
  "http://localhost:8123/api/services/ha_finance/update_plan?return_response"
```

### 10. delete_plan — Remove Recurring Plan

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "plan_id": "plan_e5f6g7h8"}' \
  "http://localhost:8123/api/services/ha_finance/delete_plan?return_response"
```

### 11. add_account — Create New Account

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Emergency Fund", "initial_balance": 50000}' \
  "http://localhost:8123/api/services/ha_finance/add_account?return_response"
```

**Response:**
```json
{
  "service_response": {
    "success": true,
    "account_id": "emergency_fund",
    "name": "Emergency Fund"
  }
}
```

The account_id is auto-generated from the name (lowercase, spaces→underscores).

### 12. update_account — Rename / Update Notes

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "name": "Primary Wallet", "notes": "For daily spending only"}' \
  "http://localhost:8123/api/services/ha_finance/update_account?return_response"
```

### 13. delete_account — Delete Account & All Data

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "emergency_fund"}' \
  "http://localhost:8123/api/services/ha_finance/delete_account?return_response"
```

Deletes the config entry, all transactions, plans, and sensor entities.

### 14. adjust_balance — Set Absolute Balance

**curl:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"account_id": "my_wallet", "new_balance": 20000}' \
  "http://localhost:8123/api/services/ha_finance/adjust_balance?return_response"
```

Creates an adjustment transaction for the difference. If balance was 15000 and you set 20000, an adjustment of +5000 is created.

**Events fired:**
- `ha_finance_balance_adjusted` with `{account, balance, old_balance, diff}`
- `ha_finance_low_balance` if new balance is below threshold

---

## Error Handling

All errors are returned as HTTP 500 with a JSON body:
```json
{"message": "Account 'xyz' not found."}
```

| Error Key | Cause |
|-----------|-------|
| `account_not_found` | No account with the given ID exists or is loaded |
| `transaction_not_found` | No transaction with the given ID in the account |
| `plan_not_found` | No recurring plan with the given ID in the account |
| `transaction_failed` | Transaction creation failed internally |
| `invalid_name` | Account name is empty or whitespace-only |
| `duplicate_name` | Another account already uses the same name |
| `create_failed` | Config flow failed to create account |
| `delete_failed` | Config entry removal failed |

---

## Events

| Event | When |
|-------|------|
| `ha_finance_transaction_added` | New transaction recorded |
| `ha_finance_recurring_executed` | A recurring plan auto-executed |
| `ha_finance_balance_adjusted` | Balance manually adjusted |
| `ha_finance_low_balance` | Balance dropped below threshold |

---

## Common AI Agent Workflows

### Daily Expense Tracking
```python
# 1. Find the account
accounts = await hass.services.async_call("ha_finance", "get_accounts", {}, return_response=True)
wallet = next(a for a in accounts["accounts"] if a["name"] == "My Wallet")

# 2. Log an expense
await hass.services.async_call("ha_finance", "add_transaction", {
    "account_id": wallet["id"],
    "amount": -150,
    "note": "Lunch at restaurant"
}, return_response=True)
```

### Monthly Budget Report
```python
# Get chart data for the last 3 months
chart = await hass.services.async_call("ha_finance", "get_chart_data", {
    "account_id": "my_wallet",
    "months": 3
}, return_response=True)

for month in chart["data"]:
    net = month["income"] - month["expenses"]
    print(f"{month['month']}: Income={month['income']}, Expenses={month['expenses']}, Net={net}")
```

### Setup Recurring Bills
```python
# Auto-pay rent on the 1st of each month
await hass.services.async_call("ha_finance", "add_plan", {
    "account_id": "my_wallet",
    "title": "Rent",
    "amount": -15000,
    "frequency": "monthly",
    "day": 1
}, return_response=True)
```

### Export for External Analysis
```python
csv_data = await hass.services.async_call("ha_finance", "export_csv", {
    "account_id": "my_wallet"
}, return_response=True)

# csv_data["csv_content"] contains the full CSV text
# csv_data["transaction_count"] tells you how many rows
```

---

## Key Differences from WebSocket API

| Aspect | WebSocket | REST Service |
|--------|-----------|-------------|
| Protocol | WS `ha_finance/xxx` | POST `/api/services/ha_finance/xxx` |
| Auth | WS auth flow | Bearer token header |
| Response | `connection.send_result()` | `return_response` query param |
| Errors | `connection.send_error(code, msg)` | HTTP 500 + `ServiceValidationError` |
| Fire-and-forget | N/A | Omit `?return_response` for write services |

Both APIs use the same underlying coordinators and store — data changes are immediately visible across both.
