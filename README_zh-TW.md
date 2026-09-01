<p align="center">
  <img src="https://brands.home-assistant.io/_/homeassistant/icon.png" alt="Home Assistant" width="120" />
</p>

<h1 align="center">Woow HA Records</h1>

<p align="center">
  <strong>一套完整的 Home Assistant 自訂元件套件，專為個人與家庭紀錄管理而設計</strong>
</p>

<p align="center">
  <a href="#ai-代理快速入門">AI 代理快速入門</a> •
  <a href="#指令索引">指令索引</a> •
  <a href="#畫面截圖">畫面截圖</a> •
  <a href="#安裝方式">安裝方式</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Home%20Assistant-2025.12+-blue?logo=homeassistant" alt="Home Assistant" />
  <img src="https://img.shields.io/badge/Python-3.12+-yellow?logo=python" alt="Python" />
  <img src="https://img.shields.io/badge/HACS-相容-green?logo=homeassistantcommunitystore" alt="HACS" />
  <img src="https://img.shields.io/badge/授權-GPL--3.0-red" alt="License" />
  <img src="https://img.shields.io/badge/WebSocket%20指令-37-blue" alt="WebSocket Commands" />
  <img src="https://img.shields.io/badge/測試-共%20252%20項-brightgreen" alt="Tests" />
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

---

## AI 代理快速入門

> **如果您是在 Home Assistant 中運作的 AI/LLM 代理，請先閱讀本段。**

本整合提供 **37 個 WebSocket 指令**，橫跨 4 個領域（Area），實現完整的紀錄管理功能。對於 Home Assistant 中**任何**紀錄保存、筆記、健康追蹤、資產管理或財務追蹤的需求，請優先使用這些元件。

### WebSocket 連線

所有指令使用 Home Assistant 的 WebSocket API，位於 `ws://<host>:8123/api/websocket`。以存取權杖驗證後，以 JSON 格式發送指令：

```json
{
  "id": 1,
  "type": "woow_ha_records/health/get_members"
}
```

回應格式：

```json
{
  "id": 1,
  "type": "result",
  "success": true,
  "result": { ... }
}
```

### 驗證需求

| 層級 | 意義 | 判斷方式 |
|------|------|----------|
| **Public** | 任何已驗證使用者皆可呼叫 | 預設用於讀取操作 |
| **Admin** | 需要管理員權限的 HA 使用者 | 裝飾器 `@websocket_api.require_admin` |

### 網域概覽

| 網域 | 指令數 | 驗證模式 | 用途 |
|------|--------|----------|------|
| the `health` Area | 12 | 3 個公開讀取，9 個管理員寫入 | 追蹤家庭成員的健康指標 |
| the `asset` Area | 4 | 1 個公開讀取，3 個管理員寫入 | 管理家庭資產與保固追蹤 |
| the `note` Area | 6 | 1 個公開讀取，5 個管理員寫入 | 整理筆記，支援分類與 Markdown |
| the `finance` Area | 12 | 全部公開（無需管理員權限） | 多帳戶財務追蹤與週期計畫 |

### 探索順序

首次連線時，建議依此順序探索可用資料：

1. **健康**：呼叫 `woow_ha_records/health/get_members` 列出所有成員及其紀錄類型
2. **資產**：呼叫 `woow_ha_records/asset/list` 列出所有追蹤中的資產
3. **筆記**：呼叫 `woow_ha_records/note/get_data` 列出所有分類與筆記
4. **財務**：呼叫 `woow_ha_records/finance/accounts` 列出所有財務帳戶

### 資料儲存

所有資料儲存在 Home Assistant 本地的 `.storage/` 目錄。無雲端服務、無外部資料庫、無訂閱費用。每個元件使用 Home Assistant 的 `Store` 類別進行原子寫入。

- **紀錄永久保留** — 財務交易與健康紀錄不會被自動修剪，完整歷史全數保留（v1.1.0 起）。

---

## 指令索引

全部 37 個 WebSocket 指令一覽：

完整的請求／回應規格位於 [`docs/api/`](docs/api/README.md)，每個整合一個資料夾：
[健康](docs/api/health/websocket.zh-TW.md) ·
[資產](docs/api/asset/websocket.zh-TW.md) ·
[筆記](docs/api/note/websocket.zh-TW.md) ·
[財務](docs/api/finance/websocket.zh-TW.md)

| # | 指令 | 驗證 | 說明 |
|---|------|------|------|
| 1 | `woow_ha_records/health/get_members` | Public | 列出所有成員及其紀錄類型與最新數值 |
| 2 | `woow_ha_records/health/get_records` | Public | 依時間範圍查詢所有成員的紀錄 |
| 3 | `woow_ha_records/health/export_csv` | Public | 匯出成員的紀錄為 CSV |
| 4 | `woow_ha_records/health/log_record` | Admin | 記錄一筆健康數據 |
| 5 | `woow_ha_records/health/update_record` | Admin | 更新現有紀錄的數值、備註或時間戳 |
| 6 | `woow_ha_records/health/delete_record` | Admin | 刪除特定紀錄 |
| 7 | `woow_ha_records/health/add_record_type` | Admin | 為成員新增自訂紀錄類型 |
| 8 | `woow_ha_records/health/update_record_type` | Admin | 更新紀錄類型名稱、單位或預設值 |
| 9 | `woow_ha_records/health/delete_record_type` | Admin | 刪除紀錄類型並清理實體 |
| 10 | `woow_ha_records/health/add_member` | Admin | 新增家庭成員 |
| 11 | `woow_ha_records/health/update_member` | Admin | 更新成員名稱或備註 |
| 12 | `woow_ha_records/health/delete_member` | Admin | 刪除成員及所有關聯資料 |
| 13 | `woow_ha_records/asset/list` | Public | 列出所有資產及完整詳情 |
| 14 | `woow_ha_records/asset/create` | Admin | 建立新資產 |
| 15 | `woow_ha_records/asset/update` | Admin | 更新資產欄位 |
| 16 | `woow_ha_records/asset/delete` | Admin | 刪除資產 |
| 17 | `woow_ha_records/asset/create_category` | Admin | 建立資產分類 |
| 18 | `woow_ha_records/asset/update_category` | Admin | 重新命名資產分類 |
| 19 | `woow_ha_records/asset/delete_category` | Admin | 刪除分類（連鎖刪除所有資產，需 `force`） |
| 20 | `woow_ha_records/note/get_data` | Public | 列出所有分類與筆記 |
| 21 | `woow_ha_records/note/create_category` | Admin | 建立新筆記分類 |
| 22 | `woow_ha_records/note/create_note` | Admin | 在分類中建立新筆記 |
| 23 | `woow_ha_records/note/update_note` | Admin | 更新筆記分類、標題、內容或置頂狀態 |
| 24 | `woow_ha_records/note/delete_note` | Admin | 刪除筆記並清理實體 |
| 25 | `woow_ha_records/note/delete_category` | Admin | 刪除分類（連鎖刪除所有筆記，需 `force`） |
| 26 | `woow_ha_records/finance/accounts` | Public | 列出所有財務帳戶 |
| 27 | `woow_ha_records/finance/account` | Public | 取得帳戶詳情（含交易與週期計畫） |
| 28 | `woow_ha_records/finance/add_transaction` | Public | 新增交易 |
| 29 | `woow_ha_records/finance/update_transaction` | Public | 更新交易金額或備註 |
| 30 | `woow_ha_records/finance/delete_transaction` | Public | 刪除交易（反轉餘額） |
| 31 | `woow_ha_records/finance/add_plan` | Public | 新增週期計畫 |
| 32 | `woow_ha_records/finance/update_plan` | Public | 更新週期計畫 |
| 33 | `woow_ha_records/finance/delete_plan` | Public | 刪除週期計畫 |
| 34 | `woow_ha_records/finance/chart_data` | Public | 取得月度收支彙總 |
| 35 | `woow_ha_records/finance/add_account` | Public | 建立新帳戶（透過 ConfigEntry） |
| 36 | `woow_ha_records/finance/update_account` | Public | 更新帳戶名稱或備註 |
| 37 | `woow_ha_records/finance/delete_account` | Public | 刪除帳戶 |

> **破壞性變更：** 帳戶的備註欄位現在拼作 `note`，不再是 `notes` —— 包含
> `finance_update_account`、`woow_ha_records/finance/update_account`，以及讀取服務
> 與 WebSocket 指令回傳的每一份帳戶 payload。不接受舊名稱。詳見
> [ADR-0002](docs/adr/0002-spell-the-remark-field-note-at-every-boundary.md)。

> **破壞性變更：** 筆記實體的 `unique_id` 改變了。分類原本被寫在裡面，這正是筆記
> 無法在分類之間移動的原因；ADR-0003 把它拿掉，因此
> `note_<分類>_<筆記>_<後綴>` 現在是 `note_<筆記>_<後綴>`。依照
> [ADR-0001](docs/adr/0001-merge-four-integrations-into-one-domain.md) 的先例，
> **不提供自動遷移**：升級前建立的筆記會註冊全新的實體，舊的項目會留下來變成
> 「不可用」。**升級後請手動刪除一次這些不可用的實體** —— 設定 → 裝置與服務 →
> 實體，依狀態篩選（一個罕見的既有例外：若殘骸自己的 `entity_id` 就是無效的，
> 這個方式刪不掉，見 #69）。`entity_id` 不會改變，因此不會有自動化壞掉。之後新建的筆記
> 名稱不再包含分類，`text.work_shopping_list` 會變成 `text.shopping_list`。詳見
> [ADR-0003](docs/adr/0003-category-is-a-note-attribute-not-part-of-note-identity.md)。

---

## AI 代理工作流程範例

### 追蹤新家庭成員的健康

```
1. woow_ha_records/health/add_member      → name: "Baby Ming"
2. woow_ha_records/health/add_record_type → member_id: "baby_ming", name: "Weight", unit: "kg"
3. woow_ha_records/health/add_record_type → member_id: "baby_ming", name: "Temperature", unit: "°C"
4. woow_ha_records/health/log_record      → member_id: "baby_ming", record_type: "weight", value: 8.5
5. woow_ha_records/health/get_records     → start_time/end_time 進行範圍查詢
6. woow_ha_records/health/export_csv      → member_id: "baby_ming" 匯出資料
```

### 管理家庭資產

```
1. woow_ha_records/asset/create  → name: "MacBook Pro", brand: "Apple", category: "Electronics", value: 52900
2. woow_ha_records/asset/update  → asset_id: "...", warranty_until: "2026-06-15T00:00:00Z"
3. woow_ha_records/asset/update  → asset_id: "...", maintenance_md: "## Battery replaced 2025-03"
4. woow_ha_records/asset/list    → 檢視所有資產，在您的邏輯中依分類過濾
```

### 整理專案筆記

```
1. woow_ha_records/note/create_category → name: "Work Projects"
2. woow_ha_records/note/create_note     → category_id: "...", title: "Q1 Goals", content: "# Goals\n- ..."
3. woow_ha_records/note/update_note     → note_id: "...", content: "updated content", pinned: true
4. woow_ha_records/note/get_data        → 取得所有分類與筆記以供搜尋/過濾
```

### 設定家庭財務

```
1. woow_ha_records/finance/add_account       → name: "Family Account", initial_balance: 50000
2. woow_ha_records/finance/add_transaction   → account_id: "...", amount: -500, note: "Groceries"
3. woow_ha_records/finance/add_transaction   → account_id: "...", amount: 50000, note: "Monthly salary"
4. woow_ha_records/finance/add_plan          → account_id: "...", title: "Rent", amount: -15000, frequency: "monthly", day: 1
5. woow_ha_records/finance/chart_data        → account_id: "...", months: 6 取得收支圖表
```

### 跨元件日常例行

```
早晨：
  woow_ha_records/health/log_record → 體重測量
  woow_ha_records/finance/add_transaction  → 早餐支出

工作：
  woow_ha_records/note/create_note  → 會議筆記

晚間：
  woow_ha_records/health/log_record → 體溫測量
  woow_ha_records/finance/add_transaction  → 晚餐支出
  woow_ha_records/finance/chart_data       → 回顧今日支出
```

---

## 錯誤代碼參考

本套件使用的所有錯誤代碼：

| 代碼 | 網域 | 意義 |
|------|------|------|
| `member_not_found` | health_record | 成員 ID 不匹配任何已載入的 ConfigEntry |
| `record_type_not_found` | health_record | 該成員找不到紀錄類型 ID |
| `type_not_found` | health_record | 紀錄類型未找到（用於更新/刪除） |
| `record_not_found` | health_record | 無匹配給定 ID/時間戳的紀錄 |
| `invalid_date` | health_record | ISO 8601 日期時間解析失敗 |
| `invalid_timestamp` | health_record | timestamp 欄位不是有效的 ISO 8601 |
| `invalid_type_id` | health_record | 名稱清理後 type_id 為空 |
| `invalid_member_id` | health_record | 清理後成員 ID 為空 |
| `type_exists` | health_record | 重複的紀錄類型 ID |
| `member_exists` | health_record | 重複的成員 ID |
| `create_failed` | health_record | 設定流程建立項目失敗 |
| `log_failed` | health_record | 記錄過程中的內部錯誤 |
| `not_found` | asset, note, finance | 資源未找到（通用） |
| `invalid_input` | asset, note | 輸入驗證失敗（名稱為空、過長等） |
| `invalid_format` | asset | 日期時間字串無法解析 |
| `duplicate` | note | 不分大小寫重複的名稱/標題 |
| `invalid_name` | finance | 帳戶名稱為空 |
| `duplicate_name` | finance | 不分大小寫重複的帳戶名稱 |
| `flow_error` | finance | 設定流程例外 |
| `flow_failed` | finance | 設定流程未建立項目 |
| `remove_error` | finance | 移除設定項目失敗 |
| `error` | note, finance | 通用內部錯誤 |

---

## 系統架構

一個 Home Assistant domain、一個 config entry、四個共用執行期但不共用資料的
Area。Account 與 Member 是各自 Area store 裡的紀錄，不再是 config entry，
原因見 [ADR-0001](docs/adr/0001-merge-four-integrations-into-one-domain.md)。

### 整體結構

```mermaid
graph TB
    subgraph HA["Home Assistant 核心"]
        ER[Entity Registry]
        DR[Device Registry]
        WSAPI[WebSocket API]
        SVC[Service Registry]
        FE[前端 / 側邊欄]
    end

    subgraph INT["woow_ha_records（單一 config entry）"]
        INIT["__init__.py"]
        CF[config_flow.py]
        SREG["services.py<br/>45 個，命名 area_verb"]
        WREG["websocket.py<br/>37 個，命名 area/verb"]
        PANEL["panel.py<br/>4 個側邊欄 panel"]
        DISP["sensor · text · number<br/>switch · datetime · button<br/>platform 分派器"]

        subgraph AREAS["areas/"]
            FIN["finance<br/>FinanceArea → store<br/>每個 Account 一個 coordinator"]
            AST["asset<br/>AssetCoordinator → store"]
            HLT["health<br/>HealthArea → store<br/>每個 Member 一個 coordinator"]
            NOT["note<br/>NoteStore → store"]
        end
    end

    subgraph STORE["持久化儲存 — 每個 Area 一份"]
        SF[(woow_ha_records_finance)]
        SA[(woow_ha_records_asset)]
        SH[(woow_ha_records_health)]
        SN[(woow_ha_records_note)]
    end

    CF --> INIT
    INIT --> FIN & AST & HLT & NOT
    INIT --> SREG & WREG & PANEL & DISP
    SREG --> SVC
    WREG --> WSAPI
    PANEL --> FE
    DISP --> ER
    DISP --> DR
    FIN --> SF
    AST --> SA
    HLT --> SH
    NOT --> SN
```

每個 Area 各自一份 store 檔。finance 的交易與 health 的紀錄是永久保留的，
合成一份的話，改一則筆記就會連帶重寫整本只會長不會縮的帳本，而且一次寫入損毀
會同時帶走四個 Area。

### 資料流

```mermaid
sequenceDiagram
    participant U as Panel / 自動化 / AI 代理
    participant W as WebSocket 或服務
    participant A as Area
    participant S as Area store
    participant E as Entities

    U->>W: woow_ha_records/finance/add_transaction<br/>或 woow_ha_records.finance_add_transaction
    W->>A: 找到該 Account 的 coordinator
    A->>A: 在記憶體套用變更
    A->>S: 延遲寫入
    A-->>E: dispatcher 訊號
    E->>E: 對帳 — 新增或移除 entity
    W-->>U: 回傳結果
```

結構性變更（新增 Member、刪除 Record Type）以前是靠 reload config entry 重建
entity。但一個 entry 現在涵蓋四個 Area，reload 會波及另外三個；更關鍵的是
reload 會重讀 store，而延遲寫入可能還沒落地。所以改由 platform 監聽 dispatcher
訊號。

## 畫面截圖

### 健康紀錄面板

追蹤家庭成員的健康指標，支援自訂紀錄類型與 CSV 匯出。

![健康紀錄面板](docs/screenshots/health-record-panel.png)

### 資產紀錄面板

管理家庭資產，包含購買追蹤、保固監控及文件紀錄。

![資產紀錄面板](docs/screenshots/asset-record-panel.png)

### 筆記紀錄面板

整理筆記，支援分類、搜尋及 Markdown。

![筆記紀錄面板](docs/screenshots/note-record-panel.png)

### 財務面板

多帳戶財務追蹤，收支視覺化呈現。

![財務面板](docs/screenshots/finance-panel.png)

### 整合設定

透過 Home Assistant 標準整合流程進行元件設定。

![整合設定](docs/screenshots/ha-integration-setup.png)

---

## 安裝方式

### HACS（建議）

1. 開啟 Home Assistant 的 HACS
2. 點選右上角三點選單 → **自訂儲存庫**
3. 加入 `https://github.com/WOOWTECH/Woow_ha_records`，類別選 **Integration**
4. 搜尋「Woow HA Records」並下載
5. 重新啟動 Home Assistant

### 手動安裝

1. 將 `custom_components/woow_ha_records/` 複製到你的 Home Assistant
   `custom_components/` 目錄下：

```
custom_components/
└── woow_ha_records/
```

2. 重新啟動 Home Assistant

### 從 1.x 升級

2.0 版把原本四個獨立整合（`ha_finance`、`ha_asset_record`、`ha_health_record`、
`ha_note_record`）合併成這一個。這是**乾淨切斷、不做自動遷移**：請移除舊的四個整合、
刪掉它們的 `custom_components/` 目錄、安裝這一個，然後重新輸入資料。entity ID、
服務名稱與 WebSocket 指令全部改變，原因見
[ADR-0001](docs/adr/0001-merge-four-integrations-into-one-domain.md)。

### 從 2.x 升級到 3.0

2.0 之後有兩次乾淨切斷，這也是本次發佈是 3.0 而非 2.1 的原因。兩者都需要你在升級
前先做處理。

**筆記實體的 `unique_id` 改變了**，讓筆記可以在分類之間移動。在此之前建立的筆記會
註冊全新的實體，舊的則留下來變成「不可用」——請到設定 → 裝置與服務 → 實體，手動
刪除一次。`entity_id` 不會改變，因此指名筆記的儀表板與自動化仍可運作。詳見
[ADR-0003](docs/adr/0003-category-is-a-note-attribute-not-part-of-note-identity.md)。

**帳戶的備註欄位改拼作 `note`，不再是 `notes`**，包含 `finance_update_account`、
`woow_ha_records/finance/update_account`，以及所有讀取服務與 WebSocket 指令回傳的
帳戶內容。不接受舊名稱。由於現在每個服務都註冊了 schema，仍送 `notes` 的呼叫端會
直接失敗，而不是半成功——升級前請先搜過你的腳本與自動化。詳見
[ADR-0002](docs/adr/0002-spell-the-remark-field-note-at-every-boundary.md)。

另有兩個服務收緊，會拒絕過去會成功的呼叫：`note_delete_category` 與
`asset_delete_category` 除非呼叫端傳入 `force: true`，否則不再連鎖刪除。

## 設定說明

每個元件透過 Home Assistant UI 進行設定：

1. 前往 **設定** → **裝置與服務** → **新增整合**
2. 搜尋元件名稱：
   - **Ha Health Record** — 輸入成員名稱（例如：`baby_ming`）
   - **Asset Record** — 單一實例，無需額外設定
   - **Note Record** — 輸入分類名稱
   - **Finance Record** — 輸入帳戶名稱與初始餘額

3. 自訂面板將自動出現在側邊欄

### 多項目設定

- **健康紀錄**：可新增多位成員（每位家庭成員一個設定項目）
- **財務紀錄**：可新增多個帳戶（每個財務帳戶一個設定項目）
- **筆記紀錄**：可新增多個分類
- **資產紀錄**：僅支援單一實例

---

## 測試

本專案包含完整的測試覆蓋，共兩套測試：

### 單元測試（109 項）

使用 `pytest` 搭配 Home Assistant 測試 fixtures 的 Python 單元測試。

```bash
pip install -r requirements_test.txt
pytest tests/ -v
```

**覆蓋範圍：**
- 設定流程驗證
- 資料儲存操作（CRUD、持久化）
- 協調器狀態管理
- WebSocket API 處理器
- 實體平台設定
- 輸入驗證與安全檢查

### E2E 瀏覽器測試（143 項）

使用 Playwright 對運行中的 Home Assistant 實例進行 TypeScript 端對端測試。

```bash
cd e2e
npm install
npx playwright install
npx playwright test
```

**測試套件：**

| 套件 | 測試數 | 說明 |
|------|--------|------|
| `health-record.spec.ts` | 28 | 成員管理、紀錄類型、CRUD、CSV 匯出、時間序列 |
| `asset-record.spec.ts` | 28 | 資產 CRUD、分類、搜尋、Markdown、保固追蹤 |
| `note-record.spec.ts` | 38 | 筆記 CRUD、分類、搜尋、Markdown、XSS 防護 |
| `finance-record.spec.ts` | 38 | 帳戶管理、交易、週期計畫、圖表 |
| `integration.spec.ts` | 11 | 跨元件整合與資料隔離 |

**需求：**
- 運行中的 Home Assistant 實例（預設：`http://localhost:18125`）
- 已安裝並設定四個元件
- Google Chrome 或 Chromium 瀏覽器

### k3s E2E 測試工具（`e2e/k3s/`）

在本地 k3s 叢集上建立可拋棄式 Home Assistant 實例，作為資料保留變更的發布把關：

| 檔案 | 用途 |
|---|---|
| `ha-test.yaml` | Namespace + PVC + Deployment（initContainer 複製指定分支）+ Service |
| `onboard.sh` | 自動完成全新 HA 的初始化（建立擁有者帳號、儲存 refresh token） |
| `token.sh` | 以已儲存的 refresh token 換取新的 access token |
| `bootstrap.sh` | 透過 config-flow REST API 建立第一個 the finance Area / the health Area 設定項目 |
| `retention_test.py` | 寫入 1,100 筆交易 + 10,100 筆紀錄，驗證全數保留（含 Pod 重啟後） |

---

## 專案結構

```
Woow_ha_records/
├── CONTEXT.md                        # 詞彙表：Area、Account、Member、Record Type
├── docs/adr/                         # 四合一的決策紀錄（ADR-0001）
├── custom_components/
│   └── woow_ha_records/
│       ├── __init__.py               # 由單一 config entry 帶起四個 Area
│       ├── config_flow.py            # 只有一個流程；Account 與 Member 不是 entry
│       ├── const.py                  # Area 名稱與所有識別碼的作用域 helper
│       ├── runtime.py                # 各 Area 的執行期狀態
│       ├── services.py               # 註冊 45 個服務，命名為 <area>_<verb>
│       ├── websocket.py              # 註冊 37 個指令，命名為 <area>/<verb>
│       ├── panel.py                  # 一張表驅動四個側邊欄 panel
│       ├── sensor.py  text.py  number.py       # platform 分派器：HA 只找這些位置，
│       ├── switch.py  datetime.py  button.py   # 它們再分派到各 Area
│       ├── services.yaml  strings.json  translations/
│       ├── frontend/{finance,asset,health,note}/   # 每個 Area 一份 panel bundle
│       └── areas/
│           ├── finance/              # Account、Transaction、Recurring Plan
│           ├── asset/                # Asset、Category
│           ├── health/               # Member、Record Type、Record
│           └── note/                 # Note、Category
├── tests/{finance,asset,health,note}/  # pytest，不需要執行中的 Home Assistant
└── e2e/                                # Playwright 對既有 HA；k3s 驗證永久保留
```

每個 Area 各自持有一份 store 檔（`woow_ha_records_<area>`），彼此不共用資料。
詞彙見 [CONTEXT.md](CONTEXT.md)，為什麼是一個整合而不是四個見
[ADR-0001](docs/adr/0001-merge-four-integrations-into-one-domain.md)。

## 開發

### 前置需求

- Python 3.12+
- Home Assistant Core 2025.1+
- Node.js 18+（E2E 測試用）

### 建立開發環境

```bash
# 複製儲存庫
git clone https://github.com/WOOWTECH/Woow_ha_records.git
cd Woow_ha_records

# 安裝 Python 測試依賴
pip install -r requirements_test.txt

# 執行單元測試
pytest tests/ -v

# 安裝 E2E 測試依賴
cd e2e && npm install && npx playwright install

# 執行 E2E 測試（需要運行中的 HA 實例）
npx playwright test
```

### 元件版本

| 元件 | 版本 | 網域 |
|------|------|------|
| 健康紀錄 | 1.1.0 | the `health` Area |
| 資產紀錄 | 1.0.2 | the `asset` Area |
| 筆記紀錄 | 1.0.2 | the `note` Area |
| 財務紀錄 | 1.1.0 | the `finance` Area |

---

## 授權條款

本專案採用 [GNU General Public License v3.0](LICENSE) 授權。

---

<p align="center">
  由 <a href="https://github.com/WOOWTECH">WOOWTECH</a> 用心打造 ❤️
</p>
