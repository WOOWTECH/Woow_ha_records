# ha_asset_record 優化設計

## 需求

1. **名稱統一** — 所有中文顯示統一為「設備紀錄」（繁體）/「设备纪录」（簡體），修正側邊欄與面板標題不同步的問題
2. **分類系統** — 新增獨立 Category 實體（Note Record 風格），用戶自建分類，資產綁定 category_id，前端 Tab 導航切換
3. **排序功能** — 名稱、建立時間、更新時間，支援升降序切換

## 1. 名稱統一：「設備紀錄」

### 需修改的檔案

| 檔案 | 位置 | 現值 | 改為 |
|------|------|------|------|
| `frontend/sidebar-title.js` | zh-Hant mapping | `資產紀錄` | `設備紀錄` |
| `frontend/sidebar-title.js` | zh-Hans mapping | `资产纪录` | `设备纪录` |
| `frontend/ha-asset-panel.js` | ~行 672 fallback | `資產紀錄` | `設備紀錄` |
| `translations/zh-Hant.json` | `title` | `資產紀錄` | `設備紀錄` |

注意：`ha-asset-panel.js` 第 1222 行已經是 `\u8A2D\u5099\u7D00\u9304`（設備紀錄），不需要改。

## 2. 分類系統（Category CRUD）

### 2.1 資料模型

```python
@dataclass
class Category:
    id: str            # "cat_{uuid4().hex}"
    name: str          # max 100 chars
    created_at: str    # ISO 8601 UTC
```

Asset 新增 `category_id` 欄位，取代原本的 `category` 自由文字欄位。

### 2.2 Storage Schema

遷移前：
```json
{
  "assets": [{ "category": "家電", ... }]
}
```

遷移後：
```json
{
  "categories": [
    { "id": "cat_xxx", "name": "家電", "created_at": "2026-05-07T00:00:00+00:00" }
  ],
  "assets": [{ "category_id": "cat_xxx", ... }]
}
```

### 2.3 遷移邏輯（coordinator._async_load）

1. 偵測舊格式：assets 有 `category` 字串欄位但沒有頂層 `categories` 列表
2. 收集所有不重複的非空 category 文字值
3. 為每個建立 Category 實體
4. 將 asset 的 `category` 改為對應的 `category_id`
5. 空白 category 的 asset 設 `category_id = ""`（未分類）
6. 自動儲存新格式

### 2.4 WebSocket 指令

**新增：**

| 指令 | 參數 | 權限 | 說明 |
|------|------|------|------|
| `ha_asset_record/create_category` | `name` (str, required, max 100) | admin | 建立分類，重複名稱報錯 |
| `ha_asset_record/update_category` | `category_id`, `name` | admin | 重新命名分類 |
| `ha_asset_record/delete_category` | `category_id` | admin | 刪除分類 + cascade 刪除底下所有 asset |

**修改：**

| 指令 | 變更 |
|------|------|
| `ha_asset_record/list` | 回傳增加 `categories` 陣列 |
| `ha_asset_record/create` | `category` 參數改為 `category_id`（可選，空值=未分類） |
| `ha_asset_record/update` | 同上 |

### 2.5 Coordinator 變更

- 新增 `categories` 列表 + `_categories_by_id` dict
- 新增 `async_create_category(name)`、`async_update_category(id, name)`、`async_delete_category(id)`
- `async_delete_category` 內 cascade 刪除所有 `category_id` 匹配的 asset
- Category name 驗證：非空、max 100 chars、case-insensitive 重複檢查

## 3. 前端改動

### 3.1 Tab 導航

- 頂部新增分類 Tab 列（在搜尋框上方）
- 「全部」Tab（預設，顯示所有資產）
- 每個用戶分類一個 Tab
- 「+」按鈕開啟建立分類 dialog（文字輸入框）
- Tab 長按或右鍵可重新命名 / 刪除分類
- 刪除 confirm：「將同時刪除分類下 N 個設備，確定？」

### 3.2 排序控件

- 搜尋框旁邊新增排序 dropdown
- 選項：名稱、建立時間、更新時間
- 點擊同一選項切換升序/降序（箭頭圖示）
- 預設：更新時間降序

### 3.3 資產 Dialog 變更

- `category` 自由文字輸入改為 dropdown 選單
- 選項：已建立的分類列表 + 「未分類」
- 新增/編輯時選擇分類

### 3.4 篩選邏輯

```javascript
_getFilteredAssets() {
  let assets = this._assets;

  // 1. 分類篩選（全部 Tab 時跳過）
  if (this._activeTab && this._activeTab !== "all") {
    assets = assets.filter(a => a.category_id === this._activeTab);
  }

  // 2. 搜尋篩選
  if (this._searchQuery?.trim()) {
    const q = this._searchQuery.toLowerCase().trim();
    assets = assets.filter(a =>
      (a.name || "").toLowerCase().includes(q) ||
      (a.brand || "").toLowerCase().includes(q)
    );
  }

  // 3. 排序
  assets = this._sortAssets(assets);
  return assets;
}
```

### 3.5 不變的部分

- 表格/卡片響應式佈局
- 保固狀態顏色（綠/黃/紅）
- 漢堡按鈕、sidebar-title.js i18n 機制
- Summary 區塊（總數 + 總值）
- Manual / Maintenance markdown 欄位

## 4. i18n 新增 Key

需要在 `strings.json`、`en.json`、`zh-Hant.json` 中新增：

- `add_category` / `create_category`
- `category_name` / `category_placeholder`
- `delete_category_confirm`（含 asset 數量）
- `rename_category`
- `uncategorized`（未分類）
- `sort_by_name` / `sort_by_created` / `sort_by_updated`
- `sort_asc` / `sort_desc`

## 5. 檔案影響範圍

| 檔案 | 改動類型 |
|------|---------|
| `coordinator.py` | Category dataclass、CRUD、migration、storage schema |
| `websocket.py` | 3 新指令、修改 list/create/update |
| `const.py` | 新常數（MAX_CATEGORY_NAME_LENGTH 等） |
| `frontend/ha-asset-panel.js` | Tab UI、排序、dialog dropdown、名稱修正 |
| `frontend/sidebar-title.js` | 名稱修正 |
| `translations/zh-Hant.json` | 名稱修正 + 新 key |
| `translations/en.json` | 新 key |
| `strings.json` | 新 key |
| `text.py` | 移除舊 category text entity（改由分類系統管理） |
