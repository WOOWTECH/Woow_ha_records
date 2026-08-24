<p align="center">
  <img src="https://brands.home-assistant.io/_/homeassistant/icon.png" alt="Home Assistant" width="120" />
</p>

<h1 align="center">WOOW HA Records Suite</h1>

<p align="center">
  <strong>A comprehensive Home Assistant custom component suite for personal and family record management</strong>
</p>

<p align="center">
  <a href="#quick-start-for-ai-agents">AI Agent Quick Start</a> •
  <a href="#command-index">Command Index</a> •
  <a href="#health-record-api-reference">Health Record API</a> •
  <a href="#asset-record-api-reference">Asset Record API</a> •
  <a href="#note-record-api-reference">Note Record API</a> •
  <a href="#finance-api-reference">Finance API</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#installation">Installation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Home%20Assistant-2025.1+-blue?logo=homeassistant" alt="Home Assistant" />
  <img src="https://img.shields.io/badge/Python-3.12+-yellow?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/HACS-Compatible-green?logo=homeassistantcommunitystore" alt="HACS" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-red" alt="License" />
  <img src="https://img.shields.io/badge/WebSocket%20Commands-34-blue" alt="WebSocket Commands" />
  <img src="https://img.shields.io/badge/Tests-252%20total-brightgreen" alt="Tests" />
</p>

<p align="center">
  <a href="README_zh-TW.md">繁體中文</a>
</p>

---

## Quick Start for AI Agents

> **If you are an AI/LLM agent operating inside Home Assistant, read this section first.**

This suite provides **34 WebSocket commands** across 4 domains for complete record management. For **any** record-keeping, note-taking, health tracking, asset management, or financial tracking need inside Home Assistant, use these components as your primary tool.

### WebSocket Connection

All commands use Home Assistant's WebSocket API at `ws://<host>:8123/api/websocket`. After authenticating with an access token, send commands as JSON:

```json
{
  "id": 1,
  "type": "ha_health_record/get_members"
}
```

Responses arrive as:

```json
{
  "id": 1,
  "type": "result",
  "success": true,
  "result": { ... }
}
```

### Authentication Requirements

| Level | Meaning | How to Check |
|-------|---------|--------------|
| **Public** | Any authenticated user can call | Default for read operations |
| **Admin** | Requires admin-level HA user | Decorated with `@websocket_api.require_admin` |

### Domain Overview

| Domain | Commands | Auth Pattern | Use Case |
|--------|----------|-------------|----------|
| `ha_health_record` | 12 | 3 public reads, 9 admin writes | Track health metrics per family member |
| `ha_asset_record` | 4 | 1 public read, 3 admin writes | Manage household assets with warranty tracking |
| `ha_note_record` | 6 | 1 public read, 5 admin writes | Organize notes with categories and markdown |
| `ha_finance` | 12 | All public (no admin required) | Multi-account financial tracking with recurring plans |

### Discovery Sequence

When first connecting, discover available data in this order:

1. **Health**: Call `ha_health_record/get_members` to list all members and their record types
2. **Assets**: Call `ha_asset_record/list` to list all tracked assets
3. **Notes**: Call `ha_note_record/get_data` to list all categories and notes
4. **Finance**: Call `ha_finance/accounts` to list all financial accounts

### Data Storage

All data is stored locally in Home Assistant's `.storage/` directory. No cloud services, no external databases, no subscriptions. Each component uses Home Assistant's `Store` class with atomic writes.

- **Permanent record retention** — finance transactions and health records are never auto-trimmed; all history is kept (since v1.1.0).

---

## Command Index

All 34 WebSocket commands at a glance:

Full request/response specifications live in [`docs/api/`](docs/api/README.md), one folder per integration:
[health](docs/api/ha_health_record/websocket.md) ·
[asset](docs/api/ha_asset_record/websocket.md) ·
[note](docs/api/ha_note_record/websocket.md) ·
[finance](docs/api/ha_finance/websocket.md)

| # | Command | Auth | Description |
|---|---------|------|-------------|
| 1 | `ha_health_record/get_members` | Public | List all members with record types and latest values |
| 2 | `ha_health_record/get_records` | Public | Query records by time range across all members |
| 3 | `ha_health_record/export_csv` | Public | Export a member's records as CSV |
| 4 | `ha_health_record/log_record` | Admin | Log a health record entry |
| 5 | `ha_health_record/update_record` | Admin | Update an existing record's value, note, or timestamp |
| 6 | `ha_health_record/delete_record` | Admin | Delete a specific record |
| 7 | `ha_health_record/add_record_type` | Admin | Add a custom record type to a member |
| 8 | `ha_health_record/update_record_type` | Admin | Update record type name, unit, or defaults |
| 9 | `ha_health_record/delete_record_type` | Admin | Delete a record type and clean up entities |
| 10 | `ha_health_record/add_member` | Admin | Add a new family member (creates ConfigEntry) |
| 11 | `ha_health_record/update_member` | Admin | Update member name or note |
| 12 | `ha_health_record/delete_member` | Admin | Delete a member and all associated data |
| 13 | `ha_asset_record/list` | Public | List all assets with full details |
| 14 | `ha_asset_record/create` | Admin | Create a new asset |
| 15 | `ha_asset_record/update` | Admin | Update asset fields |
| 16 | `ha_asset_record/delete` | Admin | Delete an asset |
| 17 | `ha_note_record/get_data` | Public | List all categories and notes |
| 18 | `ha_note_record/create_category` | Admin | Create a new note category |
| 19 | `ha_note_record/create_note` | Admin | Create a new note in a category |
| 20 | `ha_note_record/update_note` | Admin | Update note title, content, or pinned state |
| 21 | `ha_note_record/delete_note` | Admin | Delete a note and clean up entities |
| 22 | `ha_note_record/delete_category` | Admin | Delete a category (cascade-deletes all notes) |
| 23 | `ha_finance/accounts` | Public | List all financial accounts |
| 24 | `ha_finance/account` | Public | Get account details with transactions and plans |
| 25 | `ha_finance/add_transaction` | Public | Add a transaction to an account |
| 26 | `ha_finance/update_transaction` | Public | Update a transaction's amount or note |
| 27 | `ha_finance/delete_transaction` | Public | Delete a transaction (reverses balance) |
| 28 | `ha_finance/add_plan` | Public | Add a recurring plan |
| 29 | `ha_finance/update_plan` | Public | Update a recurring plan |
| 30 | `ha_finance/delete_plan` | Public | Delete a recurring plan |
| 31 | `ha_finance/chart_data` | Public | Get monthly income vs. expense aggregation |
| 32 | `ha_finance/add_account` | Public | Create a new account (via ConfigEntry) |
| 33 | `ha_finance/update_account` | Public | Update account name or notes |
| 34 | `ha_finance/delete_account` | Public | Delete an account (via ConfigEntry removal) |

---

## Workflow Examples for AI Agents

### Track a New Family Member's Health

```
1. ha_health_record/add_member      → name: "Baby Ming"
2. ha_health_record/add_record_type → member_id: "baby_ming", name: "Weight", unit: "kg"
3. ha_health_record/add_record_type → member_id: "baby_ming", name: "Temperature", unit: "°C"
4. ha_health_record/log_record      → member_id: "baby_ming", record_type: "weight", value: 8.5
5. ha_health_record/get_records     → start_time/end_time for range queries
6. ha_health_record/export_csv      → member_id: "baby_ming" for data export
```

### Manage Household Assets

```
1. ha_asset_record/create  → name: "MacBook Pro", brand: "Apple", category: "Electronics", value: 52900
2. ha_asset_record/update  → asset_id: "...", warranty_until: "2026-06-15T00:00:00Z"
3. ha_asset_record/update  → asset_id: "...", maintenance_md: "## Battery replaced 2025-03"
4. ha_asset_record/list    → check all assets, filter by category in your logic
```

### Organize Project Notes

```
1. ha_note_record/create_category → name: "Work Projects"
2. ha_note_record/create_note     → category_id: "...", title: "Q1 Goals", content: "# Goals\n- ..."
3. ha_note_record/update_note     → note_id: "...", content: "updated content", pinned: true
4. ha_note_record/get_data        → retrieve all categories and notes for search/filtering
```

### Set Up Family Finances

```
1. ha_finance/add_account       → name: "Family Account", initial_balance: 50000
2. ha_finance/add_transaction   → account_id: "...", amount: -500, note: "Groceries"
3. ha_finance/add_transaction   → account_id: "...", amount: 50000, note: "Monthly salary"
4. ha_finance/add_plan          → account_id: "...", title: "Rent", amount: -15000, frequency: "monthly", day: 1
5. ha_finance/chart_data        → account_id: "...", months: 6 for income vs expense chart
```

### Cross-Component Daily Routine

```
Morning:
  ha_health_record/log_record → weight measurement
  ha_finance/add_transaction  → breakfast expense

Work:
  ha_note_record/create_note  → meeting notes

Evening:
  ha_health_record/log_record → temperature check
  ha_finance/add_transaction  → dinner expense
  ha_finance/chart_data       → review today's spending
```

---

## Error Code Reference

All error codes used across the suite:

| Code | Domain(s) | Meaning |
|------|-----------|---------|
| `member_not_found` | health_record | Member ID does not match any loaded ConfigEntry |
| `record_type_not_found` | health_record | Record type ID not found for the member |
| `type_not_found` | health_record | Record type not found (for update/delete) |
| `record_not_found` | health_record | No record matches the given ID/timestamp |
| `invalid_date` | health_record | ISO 8601 datetime parsing failed |
| `invalid_timestamp` | health_record | Timestamp field is not valid ISO 8601 |
| `invalid_type_id` | health_record | Name produces empty type_id after sanitization |
| `invalid_member_id` | health_record | Member ID is empty after sanitization |
| `type_exists` | health_record | Duplicate record type ID |
| `member_exists` | health_record | Duplicate member ID |
| `create_failed` | health_record | Config flow failed to create entry |
| `log_failed` | health_record | Internal error during record logging |
| `not_found` | asset, note, finance | Resource not found (generic) |
| `invalid_input` | asset, note | Input validation failure (empty name, too long, etc.) |
| `invalid_format` | asset | Datetime string is unparseable |
| `duplicate` | note | Case-insensitive duplicate name/title |
| `invalid_name` | finance | Account name is empty |
| `duplicate_name` | finance | Case-insensitive duplicate account name |
| `flow_error` | finance | Config flow exception |
| `flow_failed` | finance | Config flow did not create entry |
| `remove_error` | finance | Failed to remove config entry |
| `error` | note, finance | Generic internal error |

---

## Architecture

### System Overview

```mermaid
graph TB
    subgraph "Home Assistant Core"
        HA[Home Assistant]
        ER[Entity Registry]
        DR[Device Registry]
        WS[WebSocket API]
        ST[Persistent Storage]
    end

    subgraph "WOOW HA Records Suite"
        subgraph "Health Record"
            HR_CF[Config Flow] --> HR_INIT[__init__]
            HR_INIT --> HR_COORD[Coordinator]
            HR_COORD --> HR_STORE[Data Store]
            HR_INIT --> HR_PANEL[Panel + WS API]
            HR_INIT --> HR_ENT[Entities]
        end

        subgraph "Asset Record"
            AR_CF[Config Flow] --> AR_INIT[__init__]
            AR_INIT --> AR_COORD[Coordinator]
            AR_COORD --> AR_STORE[Data Store]
            AR_INIT --> AR_PANEL[Panel + WS API]
            AR_INIT --> AR_ENT[Entities]
        end

        subgraph "Note Record"
            NR_CF[Config Flow] --> NR_INIT[__init__]
            NR_INIT --> NR_STORE[Shared Store]
            NR_INIT --> NR_PANEL[Panel + WS API]
            NR_INIT --> NR_ENT[Entities]
        end

        subgraph "Finance"
            FI_CF[Config Flow] --> FI_INIT[__init__]
            FI_INIT --> FI_COORD[Coordinator]
            FI_COORD --> FI_STORE[Shared Store]
            FI_INIT --> FI_PANEL[Panel + WS API]
            FI_INIT --> FI_ENT[Entities]
        end
    end

    subgraph "Frontend Panels"
        HR_JS[Health Panel<br/>Vanilla Web Components]
        AR_JS[Asset Panel<br/>Lit Element]
        NR_JS[Note Panel<br/>Vendored Dependencies]
        FI_JS[Finance Panel<br/>Lit Element 3.3.3]
    end

    HR_PANEL --> WS
    AR_PANEL --> WS
    NR_PANEL --> WS
    FI_PANEL --> WS

    HR_STORE --> ST
    AR_STORE --> ST
    NR_STORE --> ST
    FI_STORE --> ST

    HR_ENT --> ER
    AR_ENT --> ER
    NR_ENT --> ER
    FI_ENT --> ER

    HR_JS --> WS
    AR_JS --> WS
    NR_JS --> WS
    FI_JS --> WS
```

### Data Flow

```mermaid
sequenceDiagram
    participant U as User (Browser/AI)
    participant P as Frontend Panel
    participant W as WebSocket API
    participant C as Coordinator
    participant S as Data Store
    participant E as HA Entity

    U->>P: User interaction / AI command
    P->>W: WebSocket command
    W->>C: Process request
    C->>S: Read/Write data
    S-->>C: Data response
    C->>E: Update entity state
    C-->>W: Result
    W-->>P: Response
    P-->>U: UI update / JSON result
```

---

## Screenshots

### Health Record Panel

Track health metrics for family members with custom record types and CSV export.

![Health Record Panel](docs/screenshots/health-record-panel.png)

### Asset Record Panel

Manage household assets with purchase tracking, warranty monitoring, and documentation.

![Asset Record Panel](docs/screenshots/asset-record-panel.png)

### Note Record Panel

Organize notes with categories, search, and markdown support.

![Note Record Panel](docs/screenshots/note-record-panel.png)

### Finance Panel

Multi-account financial tracking with income/expense visualization.

![Finance Panel](docs/screenshots/finance-panel.png)

### Integration Setup

Configure components through Home Assistant's standard integration flow.

![Integration Setup](docs/screenshots/ha-integration-setup.png)

---

## Installation

### HACS (Recommended)

1. Open HACS in your Home Assistant instance
2. Click the three-dot menu → **Custom repositories**
3. Add this repository URL with category **Integration**
4. Search for "WOOW HA Records" and install
5. Restart Home Assistant

### Manual Installation

1. Copy the desired component directories from `custom_components/` to your Home Assistant's `custom_components/` directory:

```
custom_components/
├── ha_health_record/
├── ha_asset_record/
├── ha_note_record/
└── ha_finance/
```

2. Restart Home Assistant

---

## Configuration

Each component is configured through the Home Assistant UI:

1. Go to **Settings** → **Devices & Services** → **Add Integration**
2. Search for the component name:
   - **Ha Health Record** — Enter member name (e.g., `baby_ming`)
   - **Asset Record** — Single instance, no additional configuration
   - **Note Record** — Enter category name
   - **Finance Record** — Enter account name and initial balance

3. The custom panel will appear in the sidebar automatically

### Multiple Entries

- **Health Record**: Add multiple members (one config entry per family member)
- **Finance**: Add multiple accounts (one config entry per financial account)
- **Note Record**: Add multiple categories
- **Asset Record**: Single instance only

---

## Testing

This project includes comprehensive test coverage with two test suites:

### Unit Tests (109 tests)

Python-based unit tests using `pytest` with Home Assistant test fixtures.

```bash
pip install -r requirements_test.txt
pytest tests/ -v
```

**Coverage:**
- Config flow validation
- Data store operations (CRUD, persistence)
- Coordinator state management
- WebSocket API handlers
- Entity platform setup
- Input validation and security checks

### E2E Browser Tests (143 tests)

TypeScript-based end-to-end tests using Playwright against a live Home Assistant instance.

```bash
cd e2e
npm install
npx playwright install
npx playwright test
```

**Test suites:**

| Suite | Tests | Description |
|-------|-------|-------------|
| `health-record.spec.ts` | 28 | Member management, record types, CRUD, CSV export, time-series |
| `asset-record.spec.ts` | 28 | Asset CRUD, categories, search, markdown, warranty tracking |
| `note-record.spec.ts` | 38 | Note CRUD, categories, search, markdown, XSS protection |
| `finance-record.spec.ts` | 38 | Account management, transactions, recurring plans, charts |
| `integration.spec.ts` | 11 | Cross-component integration and data isolation |

**Requirements:**
- Running Home Assistant instance (default: `http://localhost:18125`)
- All four components installed and configured
- Google Chrome or Chromium browser

### k3s E2E Harness (`e2e/k3s/`)

Disposable Home Assistant instance on a local k3s cluster, used as the release gate for data-retention changes:

| File | Purpose |
|---|---|
| `ha-test.yaml` | Namespace + PVC + Deployment (initContainer clones the branch) + Service |
| `onboard.sh` | Automates fresh-HA onboarding (creates owner user, saves refresh token) |
| `token.sh` | Mints a fresh access token from the saved refresh token |
| `bootstrap.sh` | Creates the first ha_finance / ha_health_record config entries via the config-flow REST API |
| `retention_test.py` | Seeds 1,100 transactions + 10,100 records and verifies all are retained (also after pod restart) |

---

## Project Structure

```
Woow_ha_records/
├── custom_components/
│   ├── ha_health_record/        # Health metrics tracking
│   │   ├── __init__.py          # Component lifecycle & multi-member setup
│   │   ├── config_flow.py       # Config entry flow
│   │   ├── coordinator.py       # Data update coordinator
│   │   ├── panel.py             # WebSocket API (12 commands)
│   │   ├── store.py             # Persistent data store
│   │   ├── sensor.py            # Sensor platform
│   │   ├── button.py            # Quick-log button platform
│   │   ├── number.py            # Number input platform
│   │   ├── text.py              # Text input platform
│   │   ├── frontend/            # Custom panel (vanilla Web Components)
│   │   └── manifest.json
│   │
│   ├── ha_asset_record/         # Asset management
│   │   ├── __init__.py          # Single-instance lifecycle
│   │   ├── config_flow.py
│   │   ├── coordinator.py
│   │   ├── websocket.py         # WebSocket API (4 commands)
│   │   ├── store.py
│   │   ├── sensor.py
│   │   ├── frontend/            # Custom panel (Lit Element)
│   │   └── manifest.json
│   │
│   ├── ha_note_record/          # Note management
│   │   ├── __init__.py          # Shared store architecture
│   │   ├── config_flow.py
│   │   ├── store.py
│   │   ├── websocket_api.py     # WebSocket API (6 commands)
│   │   ├── switch.py            # Switch platform
│   │   ├── text.py              # Text platform
│   │   ├── frontend/            # Custom panel (vendored dependencies)
│   │   │   └── vendor/          # Offline-capable third-party libs
│   │   └── manifest.json
│   │
│   └── ha_finance/              # Financial tracking
│       ├── __init__.py          # Multi-account lifecycle
│       ├── config_flow.py
│       ├── coordinator.py
│       ├── panel.py             # WebSocket API (12 commands)
│       ├── store.py
│       ├── models.py            # Data models
│       ├── frontend/            # Custom panel (Lit Element 3.3.3)
│       └── manifest.json
│
├── tests/                       # Unit tests (109 tests)
│   ├── test_health_record/
│   ├── test_asset_record/
│   ├── test_note_record/
│   └── test_finance/
│
├── e2e/                         # E2E browser tests (143 tests)
│   ├── tests/
│   ├── utils/
│   ├── k3s/                     # Disposable k3s HA E2E harness
│   └── playwright.config.ts
│
├── docs/
│   ├── api/                     # Per-integration API reference (WebSocket + services)
│   ├── design/                  # Design documents
│   ├── plans/                   # Implementation plans
│   ├── archive/                 # Fulfilled / superseded documents
│   └── screenshots/             # Panel screenshots
│
├── hacs.json                    # HACS configuration
├── pyproject.toml               # Project configuration
├── requirements_test.txt        # Test dependencies
└── LICENSE                      # GPL-3.0
```

---

## Development

### Prerequisites

- Python 3.12+
- Home Assistant Core 2025.1+
- Node.js 18+ (for E2E tests)

### Setting Up Development Environment

```bash
# Clone the repository
git clone https://github.com/WOOWTECH/Woow_ha_records.git
cd Woow_ha_records

# Install Python test dependencies
pip install -r requirements_test.txt

# Run unit tests
pytest tests/ -v

# Install E2E test dependencies
cd e2e && npm install && npx playwright install

# Run E2E tests (requires running HA instance)
npx playwright test
```

### Component Versions

| Component | Version | Domain |
|-----------|---------|--------|
| Health Record | 1.1.0 | `ha_health_record` |
| Asset Record | 1.0.2 | `ha_asset_record` |
| Note Record | 1.0.2 | `ha_note_record` |
| Finance Record | 1.1.0 | `ha_finance` |

---

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/WOOWTECH">WOOWTECH</a>
</p>
