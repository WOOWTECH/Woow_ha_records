/**
 * Realistic test data for E2E tests.
 * All data uses real-world Chinese/English examples for demo purposes.
 */

// ─── Health Record Test Data ──────────────────────────────────

export const HEALTH_MEMBERS = {
  BABY_MING: {
    name: '小明 (Baby Ming)',
    member_id: 'baby_ming',
    note: '2025年3月15日出生，男嬰，出生體重3.2kg',
  },
  BABY_HUA: {
    name: '小花 (Baby Hua)',
    member_id: 'baby_hua',
    note: '2025年5月20日出生，女嬰，出生體重3.0kg',
  },
};

export const HEALTH_RECORD_TYPES = {
  FEEDING: { name: '餵奶量', unit: 'ml', default_value: 120, mode: 'last_value' as const },
  SLEEP: { name: '睡眠時數', unit: 'hr', default_value: 2.0, mode: 'fixed' as const },
  WEIGHT: { name: '體重', unit: 'kg', default_value: 3.5, mode: 'last_value' as const },
  HEIGHT: { name: '身高', unit: 'cm', default_value: 50, mode: 'last_value' as const },
  TEMPERATURE: { name: '體溫', unit: '°C', default_value: 36.5, mode: 'fixed' as const },
};

/** Generate feeding records for a given number of days */
export function generateFeedingRecords(days: number, startDate: Date) {
  const records: Array<{ value: number; note: string; timestamp: string }> = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    // 4-6 feedings per day
    const feedingsPerDay = 4 + Math.floor(Math.random() * 3);
    const feedingTimes = [6, 9, 12, 15, 18, 21]; // possible hours
    for (let f = 0; f < feedingsPerDay; f++) {
      const hour = feedingTimes[f];
      const minute = Math.floor(Math.random() * 60);
      const feedDate = new Date(date);
      feedDate.setHours(hour, minute, 0, 0);
      // Amount increases over time: 80-180ml
      const baseAmount = 80 + (d / days) * 80;
      const amount = Math.round(baseAmount + (Math.random() - 0.5) * 30);
      const notes = [
        '喝得很好 👶', '有點不想喝', '全部喝完', '剩一點點',
        '配方奶', '母乳', '邊喝邊玩', '很快就喝完了',
      ];
      records.push({
        value: Math.max(60, Math.min(200, amount)),
        note: notes[Math.floor(Math.random() * notes.length)],
        timestamp: feedDate.toISOString(),
      });
    }
  }
  return records;
}

/** Generate sleep records */
export function generateSleepRecords(days: number, startDate: Date) {
  const records: Array<{ value: number; note: string; timestamp: string }> = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    // 3-5 naps per day
    const napsPerDay = 3 + Math.floor(Math.random() * 3);
    const napTimes = [8, 11, 14, 17, 20];
    for (let n = 0; n < napsPerDay; n++) {
      const hour = napTimes[n];
      const napDate = new Date(date);
      napDate.setHours(hour, 0, 0, 0);
      const duration = 1.0 + Math.random() * 3.0;
      const notes = [
        '睡得很安穩', '中途醒來一次', '淺眠', '熟睡',
        '需要哄才入睡', '自己就睡著了', '抱著睡的',
      ];
      records.push({
        value: Math.round(duration * 10) / 10,
        note: notes[Math.floor(Math.random() * notes.length)],
        timestamp: napDate.toISOString(),
      });
    }
  }
  return records;
}

/** Generate weight records (weekly) */
export function generateWeightRecords(weeks: number, startWeight: number, startDate: Date) {
  const records: Array<{ value: number; note: string; timestamp: string }> = [];
  for (let w = 0; w < weeks; w++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + w * 7);
    date.setHours(9, 0, 0, 0);
    const weight = startWeight + (w * 0.2) + (Math.random() * 0.1 - 0.05);
    records.push({
      value: Math.round(weight * 100) / 100,
      note: w === 0 ? '出生體重' : `第${w}週量測`,
      timestamp: date.toISOString(),
    });
  }
  return records;
}

/** Generate height records (monthly) */
export function generateHeightRecords(months: number, startHeight: number, startDate: Date) {
  const records: Array<{ value: number; note: string; timestamp: string }> = [];
  for (let m = 0; m < months; m++) {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + m);
    date.setHours(10, 0, 0, 0);
    const height = startHeight + m * 3 + (Math.random() * 0.5);
    records.push({
      value: Math.round(height * 10) / 10,
      note: m === 0 ? '出生身高' : `第${m}個月量測`,
      timestamp: date.toISOString(),
    });
  }
  return records;
}

// ─── Asset Record Test Data ──────────────────────────────────

export const ASSET_DATA = [
  {
    name: 'Sony 65 吋 4K OLED 電視 XR-65A95L',
    brand: 'Sony',
    category: '家電',
    value: 45000,
    purchase_at: '2024-01-15T00:00:00+08:00',
    warranty_until: '2027-01-15T00:00:00+08:00',
    manual_md: `# Sony XR-65A95L 使用手冊\n\n## 基本操作\n- 電源：遙控器紅色按鈕\n- 音量：側邊 +/- 按鈕\n- 頻道：數字鍵直接輸入\n\n## HDMI 連接\n| Port | 建議用途 |\n|------|----------|\n| HDMI 1 | PS5 (4K 120Hz) |\n| HDMI 2 | Apple TV |\n| HDMI 3 | Switch |\n\n## 故障排除\n1. 畫面閃爍 → 重新啟動電視\n2. 無聲音 → 檢查 HDMI ARC 設定`,
    maintenance_md: '每月清潔螢幕一次，使用微纖維布。避免直射陽光。',
  },
  {
    name: 'MacBook Pro 16 吋 M3 Max',
    brand: 'Apple',
    category: '3C',
    value: 89900,
    purchase_at: '2024-03-20T00:00:00+08:00',
    warranty_until: '2025-03-20T00:00:00+08:00',
    manual_md: `# MacBook Pro 使用手冊\n\n## 快速開始\n1. 開箱後接上 MagSafe 充電器\n2. 按電源鍵開機，遵循設定精靈\n\n## 常用快捷鍵\n| 功能 | 快捷鍵 |\n|------|--------|\n| 截圖 | Cmd+Shift+4 |\n| Spotlight | Cmd+Space |\n| 切換視窗 | Cmd+Tab |\n| 強制退出 | Cmd+Option+Esc |\n\n## 維護建議\n- 每月清潔鍵盤與螢幕\n- 電池健康度低於 80% 時更換\n- 定期備份至 Time Machine`,
    maintenance_md: '每季清理散熱孔灰塵。電池每月完整充放電一次。',
  },
  {
    name: 'iPhone 15 Pro 256GB 原色鈦金屬',
    brand: 'Apple',
    category: '3C',
    value: 36900,
    purchase_at: '2024-06-01T00:00:00+08:00',
    warranty_until: '2025-06-01T00:00:00+08:00',
    manual_md: '# iPhone 15 Pro\n\n## 動作按鈕設定\n可自訂為：靜音、相機、手電筒、翻譯等\n\n## ProMotion 設定\n設定 → 輔助使用 → 動態效果 → 限制畫面更新率',
    maintenance_md: '使用原廠保護殼與玻璃貼。避免高溫環境充電。',
  },
  {
    name: 'Dyson V15 Detect Absolute 吸塵器',
    brand: 'Dyson',
    category: '家電',
    value: 22900,
    purchase_at: '2024-02-14T00:00:00+08:00',
    warranty_until: '2026-02-14T00:00:00+08:00',
    manual_md: '# Dyson V15 Detect\n\n## 清潔模式\n- **自動模式**：自動偵測灰塵調整吸力\n- **強力模式**：最大吸力，適合地毯\n- **節能模式**：延長電池使用時間\n\n## 濾網清洗\n每月清洗一次，冷水沖洗後自然風乾 24 小時',
    maintenance_md: '每月清洗濾網。每半年檢查刷頭磨損。集塵筒達 MAX 線時清空。',
  },
  {
    name: 'IKEA BEKANT 升降書桌 160x80cm',
    brand: 'IKEA',
    category: '傢俱',
    value: 18990,
    purchase_at: '2023-11-25T00:00:00+08:00',
    warranty_until: '2033-11-25T00:00:00+08:00',
    manual_md: '# BEKANT 升降書桌\n\n## 高度調整\n- 範圍：65-125cm\n- 按住上/下按鈕調整\n- 建議站立高度：肘部成90度\n\n## 載重\n- 最大載重：70kg\n- 建議放置：螢幕、鍵盤、檯燈',
    maintenance_md: '每年檢查螺絲鬆緊。桌面用濕布擦拭。避免超過最大載重。',
  },
  {
    name: 'Panasonic NR-F607HX 冰箱 601L',
    brand: 'Panasonic',
    category: '家電',
    value: 32000,
    purchase_at: '2024-04-10T00:00:00+08:00',
    warranty_until: '2027-04-10T00:00:00+08:00',
    manual_md: '# Panasonic 冰箱\n\n## 溫度設定\n- 冷藏室：2-6°C\n- 冷凍室：-18°C\n- 蔬果室：5-7°C\n\n## 省電模式\n長時間外出可啟用「旅行模式」',
    maintenance_md: '每季清理冷凝器。門封條每月擦拭。冰箱背面保持 10cm 散熱空間。',
  },
  {
    name: 'LG WD-S18VBD 蒸氣滾筒洗脫烘 18kg',
    brand: 'LG',
    category: '家電',
    value: 35900,
    purchase_at: '2024-07-01T00:00:00+08:00',
    warranty_until: '2027-07-01T00:00:00+08:00',
    manual_md: '# LG 洗脫烘\n\n## 常用行程\n- **標準洗**: 60分鐘\n- **快洗**: 30分鐘\n- **大物洗**: 棉被、毛毯\n- **蒸氣殺菌**: 除蟎除菌',
    maintenance_md: '每月執行桶槽清潔。乾燥濾網每次使用後清理。門封條保持乾燥。',
  },
  {
    name: 'Herman Miller Aeron 全功能人體工學椅',
    brand: 'Herman Miller',
    category: '傢俱',
    value: 52000,
    purchase_at: '2024-08-15T00:00:00+08:00',
    warranty_until: '2036-08-15T00:00:00+08:00',
    manual_md: '# Aeron 人體工學椅\n\n## 調整項目\n1. **座高**: 腳底平放地面\n2. **傾斜張力**: 向後靠的阻力\n3. **腰靠**: 上下滑動調整\n4. **扶手**: 高度與角度\n\n## 尺寸\n- Size B (中)：適合 170-185cm',
    maintenance_md: '網布座面用吸塵器清潔。金屬部件每年上矽油。12年原廠保固。',
  },
];

// ─── Note Record Test Data ──────────────────────────────────

export const NOTE_CATEGORIES = ['專案管理', '會議記錄', '技術文件', '個人筆記'];

export const NOTE_DATA: Record<string, Array<{ title: string; content: string; pinned: boolean }>> = {
  '專案管理': [
    {
      title: 'Q1 產品開發計畫',
      pinned: true,
      content: `# Q1 產品開發計畫

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
| UAT | 03/01 | David |
| 上線 | 03/15 | All |

## 風險項目
> **注意**: API 變更可能影響第三方整合

\`\`\`python
# API v2 範例
response = client.get("/api/v2/records")
data = response.json()
\`\`\``,
    },
    {
      title: 'Sprint Review 紀錄 - Sprint 5',
      pinned: false,
      content: `# Sprint 5 Review

## 完成項目
1. 使用者登入功能 ✅
2. 資料匯出 CSV ✅
3. 權限管理 (部分完成)

## Demo 紀錄
- 展示了新的登入流程
- 資料匯出功能獲得好評
- **待改善**：匯出速度需優化

## 下個 Sprint 目標
- 完成權限管理剩餘功能
- 開始 Dashboard 圖表開發`,
    },
    {
      title: 'Bug Triage 流程',
      pinned: false,
      content: `# Bug Triage 流程

## 嚴重度分級

| 等級 | 定義 | SLA |
|------|------|-----|
| P0 | 系統無法使用 | 4小時內修復 |
| P1 | 核心功能異常 | 24小時內修復 |
| P2 | 次要功能問題 | 本週修復 |
| P3 | 美觀/體驗問題 | 下個Sprint |

## 處理流程
1. QA 回報 → Jira
2. 每日 standup 分類
3. 分配負責人
4. 修復 → Code Review → 測試 → 關閉`,
    },
  ],
  '會議記錄': [
    {
      title: '2024/01 月會議記錄',
      pinned: false,
      content: `# 一月份月會議記錄

**日期**: 2024-01-30
**出席**: Alice, Bob, Charlie, David, Eve

## 議程
1. 上月工作回顧
2. 本月目標設定
3. 資源需求討論

## 決議事項
- 招募 2 名前端工程師
- Q1 預算增加 15%
- 導入新的 CI/CD 工具

## Action Items
- [ ] Alice: 完成招募 JD (02/05)
- [ ] Bob: 評估 CI/CD 工具 (02/10)
- [x] Charlie: 提交 Q1 預算表`,
    },
    {
      title: '2024/02 月會議記錄',
      pinned: false,
      content: `# 二月份月會議記錄

**日期**: 2024-02-28
**出席**: Alice, Bob, Charlie, David

## 重點摘要
- 新人 Frank 於 2/15 到職
- CI/CD 工具選定 GitHub Actions
- 產品 v1.5 準時上線`,
    },
    {
      title: 'Q1 OKR 檢討',
      pinned: true,
      content: `# Q1 OKR 檢討

## O1: 提升產品品質
- **KR1**: Bug 數量降低 30% → **達成 35%** ✅
- **KR2**: 測試覆蓋率 80% → **達成 78%** ⚠️
- **KR3**: 客戶滿意度 4.5/5 → **達成 4.6** ✅

## O2: 加速開發效率
- **KR1**: Sprint velocity 提升 20% → **達成 22%** ✅
- **KR2**: CI/CD 建置完成 → **達成** ✅`,
    },
  ],
  '技術文件': [
    {
      title: 'API 文件規範',
      pinned: true,
      content: `# API 文件規範

## RESTful 設計原則

### URL 命名
\`\`\`
GET    /api/v2/records          # 列表
GET    /api/v2/records/:id      # 單筆
POST   /api/v2/records          # 新增
PUT    /api/v2/records/:id      # 更新
DELETE /api/v2/records/:id      # 刪除
\`\`\`

### 回應格式
\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "total": 100,
    "per_page": 20
  }
}
\`\`\`

### 錯誤格式
\`\`\`json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Name is required"
  }
}
\`\`\``,
    },
    {
      title: '部署流程 SOP',
      pinned: false,
      content: `# 部署流程 SOP

## 環境

| 環境 | URL | 分支 |
|------|-----|------|
| Dev | dev.example.com | develop |
| Staging | staging.example.com | release/* |
| Production | app.example.com | main |

## 步驟
1. 建立 Release Branch
2. QA 在 Staging 測試
3. 取得 PM 簽核
4. 合併至 main
5. 自動部署至 Production
6. 監控 30 分鐘

## Rollback
\`\`\`bash
# 緊急回滾
kubectl rollout undo deployment/app -n production
\`\`\``,
    },
    {
      title: '資料庫 Schema 設計',
      pinned: false,
      content: `# 資料庫 Schema

## ER Diagram (文字版)

\`\`\`
users (1) ──< (N) records
users (1) ──< (N) accounts
accounts (1) ──< (N) transactions
\`\`\`

## Table: users
| Column | Type | Constraint |
|--------|------|-----------|
| id | UUID | PK |
| name | VARCHAR(255) | NOT NULL |
| email | VARCHAR(255) | UNIQUE |
| created_at | TIMESTAMP | DEFAULT NOW() |

## Indexing Strategy
- B-tree on \`users.email\`
- Composite index on \`records(user_id, created_at)\``,
    },
  ],
  '個人筆記': [
    {
      title: '讀書心得：Clean Code',
      pinned: false,
      content: `# Clean Code 讀書心得

## 重點摘要

### 命名
> 變數名稱應該揭示意圖，而非需要註解來解釋

好的命名：
\`\`\`javascript
const elapsedTimeInDays = 30;
const activeUsers = users.filter(u => u.isActive);
\`\`\`

壞的命名：
\`\`\`javascript
const d = 30;  // elapsed time in days
const list = users.filter(u => u.flag);
\`\`\`

### 函數
- 函數應該要小
- 只做一件事
- 參數越少越好（理想 0-2 個）

### 個人感想
這本書改變了我對程式碼品質的看法。**可讀性比效能更重要**。`,
    },
    {
      title: '年度目標 2024',
      pinned: true,
      content: `# 2024 年度目標

## 技術
- [x] 學會 TypeScript
- [ ] 完成 AWS Solutions Architect 認證
- [ ] 貢獻 3 個 Open Source 專案

## 健康
- [ ] 每週運動 3 次
- [ ] 體重維持 70kg

## 財務
- [ ] 每月儲蓄率 30%
- [ ] 建立緊急預備金 6 個月`,
    },
  ],
};

// ─── Finance Test Data ──────────────────────────────────────

export const FINANCE_ACCOUNTS = [
  { name: '家庭日常開銷', initial_balance: 50000, notes: '每月家庭生活支出帳戶' },
  { name: '投資帳戶', initial_balance: 100000, notes: '長期投資與理財' },
  { name: '緊急備用金', initial_balance: 200000, notes: '至少維持 6 個月生活費' },
];

export const FINANCE_MONTHLY_TRANSACTIONS = [
  { amount: 85000, note: '薪資收入', type: 'manual' },
  { amount: -25000, note: '房租', type: 'manual' },
  { amount: -3500, note: '水電瓦斯', type: 'manual' },
  { amount: -15000, note: '伙食費', type: 'manual' },
  { amount: -3000, note: '交通費 (捷運月票+油資)', type: 'manual' },
  { amount: -5000, note: '娛樂休閒', type: 'manual' },
  { amount: -1500, note: '網路/電話費', type: 'manual' },
  { amount: -3000, note: '保險月繳', type: 'manual' },
  { amount: -2000, note: '日用品採購', type: 'manual' },
  { amount: -1000, note: '訂閱服務 (Netflix/Spotify)', type: 'manual' },
];

export const FINANCE_INVESTMENT_TRANSACTIONS = [
  { amount: 12000, note: '台積電股息', type: 'manual' },
  { amount: -50000, note: '定期定額基金申購', type: 'manual' },
  { amount: 8000, note: '債券利息', type: 'manual' },
  { amount: -30000, note: '加碼買入 ETF', type: 'manual' },
];

export const FINANCE_RECURRING_PLANS = [
  { title: '房租', amount: -25000, frequency: 'monthly', day: 1 },
  { title: '薪資', amount: 85000, frequency: 'monthly', day: 5 },
  { title: '保險年繳', amount: -36000, frequency: 'yearly', day: 15, month: 3 },
  { title: '網路費', amount: -1500, frequency: 'monthly', day: 10 },
  { title: '訂閱服務', amount: -1000, frequency: 'monthly', day: 1 },
];

// ─── Edge Case Test Data ──────────────────────────────────

export const EDGE_CASES = {
  EMPTY_STRING: '',
  MAX_LENGTH_255: 'A'.repeat(255),
  OVER_MAX_255: 'A'.repeat(256),
  MAX_LENGTH_100: '測'.repeat(100),
  OVER_MAX_100: '測'.repeat(101),
  MAX_LENGTH_200: '字'.repeat(200),
  OVER_MAX_200: '字'.repeat(201),
  MAX_LENGTH_65535: 'B'.repeat(65535),
  MAX_LENGTH_100000: 'C'.repeat(100000),
  UNICODE_TEXT: '寶寶今天很乖 👶🍼 ñ ü ö ä ß 日本語 한국어',
  EMOJI_HEAVY: '😀😃😄😁😆🥹😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😗',
  HTML_INJECTION: '<script>alert("xss")</script>',
  IMG_XSS: '<img onerror=alert(1) src=x>',
  MARKDOWN_INJECTION: '[click me](javascript:alert(1))',
  SQL_INJECTION: "'; DROP TABLE records; --",
  SPECIAL_CHARS: '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`',
  ZERO_VALUE: 0,
  MAX_ASSET_VALUE: 999999.99,
  NEGATIVE_VALUE: -1,
  VERY_LARGE_NUMBER: 9999999999,
  NAN_STRING: 'NaN',
  INFINITY_STRING: 'Infinity',
};
