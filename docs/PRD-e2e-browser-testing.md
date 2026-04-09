# PRD: E2E Browser Testing — HA Record Custom Components

**Version:** 1.0
**Date:** 2026-04-10
**Author:** WOOWTECH Engineering
**Status:** Active

---

## 1. Product Overview

### 1.1 Background
WOOWTECH 開發了四個 Home Assistant 自訂元件，用於家庭成員的健康追蹤、資產管理、筆記管理與財務管理。這些元件已完成核心 Python 單元測試（109 tests），現需要瀏覽器端對端測試以驗證前端 UI、WebSocket API 交互、以及完整的使用者操作流程。

### 1.2 Components Under Test

| Component | Domain | Panel URL | Purpose |
|-----------|--------|-----------|---------|
| ha_health_record | 健康紀錄 | /ha-health-record | 家庭成員健康追蹤（餵奶、睡眠、體重、身高等） |
| ha_asset_record | 資產紀錄 | /ha-asset-record | 家庭資產管理（保固追蹤、維護說明） |
| ha_note_record | 筆記紀錄 | /ha-note-record | Markdown 筆記管理（分類、搜尋） |
| ha_finance | 財務紀錄 | /ha-finance | 家庭財務管理（帳戶、交易、循環計劃） |

### 1.3 Objectives
- 達到 **商用企業部署** 品質等級
- 覆蓋所有 CRUD 操作的完整生命週期
- 驗證邊界條件與安全性
- 建立豐富的 **實際範例資料** 作為展示用途
- 多輪重複執行確保穩定性

---

## 2. Test Scope Matrix

### 2.1 Functional Test Coverage

| Category | health_record | asset_record | note_record | finance |
|----------|:---:|:---:|:---:|:---:|
| Create | ✅ | ✅ | ✅ | ✅ |
| Read / List | ✅ | ✅ | ✅ | ✅ |
| Update | ✅ | ✅ | ✅ | ✅ |
| Delete | ✅ | ✅ | ✅ | ✅ |
| Search / Filter | ✅ | ✅ | ✅ | ✅ |
| Cascade Delete | - | - | ✅ | ✅ |
| Data Export | ✅ (CSV) | - | - | - |
| Chart / Visualization | - | - | - | ✅ |
| Markdown Rendering | - | ✅ | ✅ | - |
| Recurring Plans | - | - | - | ✅ |

### 2.2 Non-Functional Test Coverage

| Category | Tests |
|----------|-------|
| Input Validation | 空字串、最大長度、數值邊界 |
| Security (XSS) | HTML injection, script injection |
| Security (Auth) | Admin-only write operations |
| Data Integrity | NaN/Infinity rejection, balance calculation |
| Performance | 大量資料載入、快速連續操作 |
| Persistence | 頁面重整後資料保留 |
| i18n | 中英文切換 |
| UI Responsiveness | Dialog open/close, tab switching |

---

## 3. Test Data Specifications

### 3.1 Health Record Test Data

**Members:**
| Name | ID | Note |
|------|----|------|
| 小明 (Baby Ming) | baby_ming | 2025年3月出生，男嬰 |
| 小花 (Baby Hua) | baby_hua | 2025年5月出生，女嬰 |

**Record Types for 小明:**
| Type | Unit | Default Value | Mode |
|------|------|--------------|------|
| 餵奶量 (Feeding) | ml | 120 | last_value |
| 睡眠時數 (Sleep) | hr | 2.0 | fixed |
| 體重 (Weight) | kg | 3.5 | last_value |
| 身高 (Height) | cm | 50 | last_value |

**Record Types for 小花:**
| Type | Unit | Default Value | Mode |
|------|------|--------------|------|
| 餵奶量 (Feeding) | ml | 100 | last_value |
| 體溫 (Temperature) | °C | 36.5 | fixed |

**Sample Records (30 days):**
- 餵奶：每天 4-6 筆，量在 80-180ml 之間遞增
- 睡眠：每天 3-5 筆，時段 1.5-4.0hr
- 體重：每週 1 筆，從 3.5kg 遞增至 5.2kg
- 身高：每月 1 筆，從 50cm 遞增至 58cm

### 3.2 Asset Record Test Data

| Asset Name | Brand | Category | Value (NTD) | Purchase Date | Warranty Until |
|------------|-------|----------|-------------|--------------|----------------|
| Sony 65 吋 4K OLED 電視 | Sony | 家電 | 45,000 | 2024-01-15 | 2027-01-15 |
| MacBook Pro 16 吋 M3 Max | Apple | 3C | 89,900 | 2024-03-20 | 2025-03-20 |
| iPhone 15 Pro 256GB | Apple | 3C | 36,900 | 2024-06-01 | 2025-06-01 |
| Dyson V15 Detect 吸塵器 | Dyson | 家電 | 22,900 | 2024-02-14 | 2026-02-14 |
| IKEA BEKANT 升降書桌 | IKEA | 傢俱 | 18,990 | 2023-11-25 | 2033-11-25 |
| Panasonic NR-F607HX 冰箱 | Panasonic | 家電 | 32,000 | 2024-04-10 | 2027-04-10 |
| LG WD-S18VBD 洗脫烘 | LG | 家電 | 35,900 | 2024-07-01 | 2027-07-01 |
| Herman Miller Aeron 人體工學椅 | Herman Miller | 傢俱 | 52,000 | 2024-08-15 | 2036-08-15 |

**Markdown Content Example (manual_md for MacBook):**
```markdown
# MacBook Pro 使用手冊

## 快速開始
1. 開箱後接上 MagSafe 充電器
2. 按電源鍵開機，遵循設定精靈

## 常用快捷鍵
| 功能 | 快捷鍵 |
|------|--------|
| 截圖 | Cmd+Shift+4 |
| Spotlight | Cmd+Space |
| 切換視窗 | Cmd+Tab |

## 維護建議
- 每月清潔鍵盤與螢幕
- 電池健康度低於 80% 時更換
```

### 3.3 Note Record Test Data

**Categories & Notes:**

| Category | Notes |
|----------|-------|
| 專案管理 | Q1 產品開發計畫、Sprint Review 紀錄、Bug Triage 流程 |
| 會議記錄 | 2024/01 月會議記錄、2024/02 月會議記錄、Q1 OKR 檢討 |
| 技術文件 | API 文件規範、部署流程 SOP、資料庫 Schema 設計 |
| 個人筆記 | 讀書心得：Clean Code、學習 Rust 筆記、年度目標 |

**Sample Note Content (Markdown):**
```markdown
# Q1 產品開發計畫

## 目標
- [ ] 完成 v2.0 核心功能開發
- [ ] 通過安全性審查
- [x] 建立 CI/CD 流程

## 時程

| 階段 | 期限 | 負責人 |
|------|------|--------|
| 設計審查 | 01/15 | Alice |
| 開發 Sprint 1 | 02/01 | Bob |
| QA 測試 | 02/15 | Charlie |

## 風險項目
> **注意**: API 變更可能影響第三方整合

```python
# API v2 範例
response = client.get("/api/v2/records")
```
```

### 3.4 Finance Test Data

**Accounts:**
| Name | Initial Balance (NTD) | Notes |
|------|----------------------|-------|
| 家庭日常開銷 | 50,000 | 每月家庭生活支出帳戶 |
| 投資帳戶 | 100,000 | 長期投資與理財 |
| 緊急備用金 | 200,000 | 至少維持 6 個月生活費 |

**Monthly Transactions (家庭日常開銷):**
| Description | Amount | Type |
|-------------|--------|------|
| 薪資收入 | +85,000 | income |
| 房租 | -25,000 | expense |
| 水電瓦斯 | -3,500 | expense |
| 伙食費 | -15,000 | expense |
| 交通費 | -3,000 | expense |
| 娛樂費 | -5,000 | expense |
| 網路/電話費 | -1,500 | expense |
| 保險費 | -3,000 | expense |

**Recurring Plans:**
| Plan | Amount | Frequency | Day |
|------|--------|-----------|-----|
| 房租 | -25,000 | Monthly | 1 |
| 薪資 | +85,000 | Monthly | 5 |
| 保險年繳 | -36,000 | Yearly | 15 (Month: 3) |
| 網路費 | -1,500 | Monthly | 10 |

---

## 4. Acceptance Criteria

### 4.1 Functional
- [ ] 所有 CRUD 操作在 UI 上正確執行
- [ ] WebSocket API 回應符合預期 schema
- [ ] 建立的資料在頁面重整後仍然存在
- [ ] 搜尋/篩選功能正確過濾結果
- [ ] 級聯刪除正確清除關聯資料
- [ ] CSV 匯出內容正確

### 4.2 Edge Cases & Boundaries
- [ ] 空字串輸入被拒絕（必填欄位）
- [ ] 最大長度字串可正確儲存與顯示
- [ ] NaN / Infinity 數值被拒絕
- [ ] 數值邊界（0, max, 負數）正確處理
- [ ] 特殊字元（Unicode, Emoji, HTML）正確處理
- [ ] 日期邊界（跨月、跨年）正確處理

### 4.3 Security
- [ ] XSS payload 在 Markdown 渲染中被消毒
- [ ] Write WebSocket commands 需要 admin 權限
- [ ] HTML injection 不會執行

### 4.4 Performance
- [ ] 頁面載入時間 < 3 秒（含 50+ 筆資料）
- [ ] 連續快速操作（5 筆 < 2 秒）不會造成 race condition
- [ ] 大量資料（100+ 筆）scrolling 流暢

### 4.5 Test Execution
- [ ] 所有測試 100% 通過
- [ ] 多輪重複執行結果一致
- [ ] 測試完成後範例資料完整保留在 HA 中

---

## 5. Technology Stack

| Component | Version | Purpose |
|-----------|---------|---------|
| Playwright | 1.59.1 | Browser automation & E2E testing |
| Node.js | 20.19.6 | Runtime |
| TypeScript | Latest | Test code language |
| Chrome | (system) | Target browser |
| xvfb-run | (system) | Headless display server |
| WebSocket | ws | Direct API testing |

---

## 6. Test Execution Plan

### Round 1: Data Seeding & Basic CRUD
- 建立所有成員、帳戶、分類等基礎資料
- 執行所有 Create → Read → Update → Verify 操作
- 建立大量歷史資料作為展示用途

### Round 2: Edge Cases & Security
- 邊界值測試
- XSS 注入測試
- 權限驗證
- 異常輸入處理

### Round 3: Stability & Performance
- 重複執行 Round 1 操作驗證冪等性
- 快速連續操作壓力測試
- 大量資料下的效能驗證
- 頁面切換穩定性測試

---

## 7. Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Shadow DOM selector 不穩定 | High | 使用 Playwright 原生 shadow piercing + 多重 fallback |
| HA WebSocket 連線逾時 | Medium | 設定合理 timeout + retry 機制 |
| 測試資料衝突 | Medium | 使用 unique prefix/timestamp 避免命名衝突 |
| 前端 JS 動態載入延遲 | Medium | 使用 waitForSelector + networkidle |
