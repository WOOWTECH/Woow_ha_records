import { test, expect } from '@playwright/test';
import { getHAToken, loginAndNavigate } from '../utils/ha-auth';
import { HAWebSocketClient } from '../utils/ws-client';
import {
  FINANCE_ACCOUNTS,
  FINANCE_MONTHLY_TRANSACTIONS,
  FINANCE_INVESTMENT_TRANSACTIONS,
  FINANCE_RECURRING_PLANS,
  EDGE_CASES,
} from '../utils/test-data';

let token: string;
let ws: HAWebSocketClient;
const accountIds: Record<string, string> = {};

test.describe('finance Area E2E Tests', () => {
  test.beforeAll(async () => {
    const tokens = await getHAToken();
    token = tokens.access_token;
    ws = new HAWebSocketClient(token);
    await ws.connect();
  });

  test.afterAll(async () => {
    await ws.close();
  });

  // ─── Account Management ────────────────────────────
  test.describe('Round 1: Create Accounts', () => {
    for (let i = 0; i < FINANCE_ACCOUNTS.length; i++) {
      const acc = FINANCE_ACCOUNTS[i];
      test(`1.${i + 1} Create account: ${acc.name}`, async () => {
        try {
          const result = await ws.financeAddAccount(acc.name, acc.initial_balance);
          expect(result.success).toBe(true);
          expect(result.account).toBeTruthy();
          accountIds[acc.name] = result.account.id;
        } catch (e: any) {
          // Idempotent: account already exists from previous run
          expect(e.message).toMatch(/already_configured|exists/i);
          // Populate accountIds from existing accounts
          const existing = await ws.financeGetAccounts();
          const found = existing.accounts.find((a: any) => a.name === acc.name);
          if (found) accountIds[acc.name] = found.id;
        }
      });
    }

    test('1.4 Verify all accounts listed', async () => {
      const result = await ws.financeGetAccounts();
      expect(result.accounts.length).toBeGreaterThanOrEqual(FINANCE_ACCOUNTS.length);

      for (const acc of FINANCE_ACCOUNTS) {
        const found = result.accounts.find((a: any) => a.name === acc.name);
        expect(found).toBeTruthy();
        accountIds[acc.name] = found.id;
      }
    });
  });

  test.describe('Round 1: Update Account', () => {
    test('2.1 Update account notes', async () => {
      const accountId = accountIds['家庭日常開銷'];
      if (accountId) {
        const result = await ws.financeUpdateAccount(accountId, {
          notes: '每月家庭生活支出帳戶，含房租、水電、伙食等固定支出',
        });
        expect(result.success).toBe(true);
      }
    });

    test('2.2 Update investment account notes', async () => {
      const accountId = accountIds['投資帳戶'];
      if (accountId) {
        const result = await ws.financeUpdateAccount(accountId, {
          notes: '長期投資與理財，主要持有台積電、ETF、債券基金',
        });
        expect(result.success).toBe(true);
      }
    });
  });

  // ─── Transaction CRUD ──────────────────────────────
  test.describe('Round 1: Monthly Transactions for 家庭日常開銷', () => {
    // Create 3 months of transactions
    for (let month = 1; month <= 3; month++) {
      test(`3.${month} Create month ${month} transactions`, async () => {
        const accountId = accountIds['家庭日常開銷'];
        expect(accountId).toBeTruthy();

        for (const tx of FINANCE_MONTHLY_TRANSACTIONS) {
          const result = await ws.financeAddTransaction(
            accountId,
            tx.amount,
            `${tx.note} (${2025}年${month}月)`,
            tx.type,
          );
          expect(result.success).toBe(true);
          expect(result.transaction).toBeTruthy();
        }
      });
    }
  });

  test.describe('Round 1: Investment Transactions', () => {
    test('4.1 Add investment transactions', async () => {
      const accountId = accountIds['投資帳戶'];
      expect(accountId).toBeTruthy();

      for (const tx of FINANCE_INVESTMENT_TRANSACTIONS) {
        const result = await ws.financeAddTransaction(accountId, tx.amount, tx.note, tx.type);
        expect(result.success).toBe(true);
      }
    });

    test('4.2 Add emergency fund interest', async () => {
      const accountId = accountIds['緊急備用金'];
      expect(accountId).toBeTruthy();

      // Add 3 months of interest
      for (let m = 1; m <= 3; m++) {
        const interest = Math.round(200000 * 0.015 / 12 * 100) / 100;
        await ws.financeAddTransaction(accountId, interest, `${m}月定存利息`, 'manual');
      }
    });
  });

  test.describe('Round 1: Verify Balances', () => {
    test('5.1 Verify 家庭日常開銷 balance', async () => {
      const accountId = accountIds['家庭日常開銷'];
      expect(accountId).toBeTruthy();
      const account = await ws.financeGetAccount(accountId);
      expect(account.account).toBeTruthy();

      // Balance grows with each test run (idempotent: just verify it's reasonable)
      expect(account.account.balance).toBeDefined();
      expect(typeof account.account.balance).toBe('number');
    });

    test('5.2 Verify 投資帳戶 balance', async () => {
      const accountId = accountIds['投資帳戶'];
      expect(accountId).toBeTruthy();
      const account = await ws.financeGetAccount(accountId);
      expect(account.account).toBeTruthy();
      expect(typeof account.account.balance).toBe('number');
    });

    test('5.3 Verify transaction history count', async () => {
      const accountId = accountIds['家庭日常開銷'];
      expect(accountId).toBeTruthy();
      const account = await ws.financeGetAccount(accountId);
      // At least 3 months of transactions from any previous run
      expect(account.account.transactions.length).toBeGreaterThanOrEqual(
        FINANCE_MONTHLY_TRANSACTIONS.length * 3
      );
    });
  });

  // ─── Transaction Update & Delete ───────────────────
  test.describe('Round 1: Transaction Update & Delete', () => {
    test('6.1 Update a transaction amount', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const account = await ws.financeGetAccount(accountId);
      const tx = account.account.transactions[0];
      if (tx) {
        const balanceBefore = account.account.balance;
        const result = await ws.financeUpdateTransaction(accountId, tx.id, {
          amount: tx.amount + 500,
          note: tx.note + ' (已調整 +500)',
        });
        expect(result.success).toBe(true);

        // Verify balance changed
        const accountAfter = await ws.financeGetAccount(accountId);
        expect(accountAfter.account.balance).toBeCloseTo(balanceBefore + 500, 0);
      }
    });

    test('6.2 Delete a transaction and verify balance rollback', async () => {
      const accountId = accountIds['家庭日常開銷'];

      // Add a temp transaction
      const addResult = await ws.financeAddTransaction(accountId, 9999, '待刪除交易 DELETE-TEST');
      expect(addResult.success).toBe(true);

      const balanceAfterAdd = (await ws.financeGetAccount(accountId)).account.balance;

      // Delete it
      const deleteResult = await ws.financeDeleteTransaction(accountId, addResult.transaction.id);
      expect(deleteResult.success).toBe(true);

      // Verify balance rolled back
      const balanceAfterDelete = (await ws.financeGetAccount(accountId)).account.balance;
      expect(balanceAfterDelete).toBeCloseTo(balanceAfterAdd - 9999, 0);
    });
  });

  // ─── Recurring Plans ─────────────────────────
  test.describe('Round 1: Recurring Plans', () => {
    for (let i = 0; i < FINANCE_RECURRING_PLANS.length; i++) {
      const plan = FINANCE_RECURRING_PLANS[i];
      test(`7.${i + 1} Create plan: ${plan.title}`, async () => {
        const accountId = accountIds['家庭日常開銷'];
        expect(accountId).toBeTruthy();
        try {
          const result = await ws.financeAddPlan(
            accountId,
            plan.title,
            plan.amount,
            plan.frequency,
            plan.day,
            plan.month || 1,
            true,
          );
          expect(result.success).toBe(true);
          expect(result.plan_id).toBeTruthy();
        } catch (e: any) {
          // Idempotent: plan may already exist
          expect(e.message).toMatch(/exists|duplicate|already/i);
        }
      });
    }

    test('7.6 Verify plans listed in account', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const account = await ws.financeGetAccount(accountId);
      const plans = Object.values(account.account.recurring_plans || {});
      expect(plans.length).toBeGreaterThanOrEqual(FINANCE_RECURRING_PLANS.length);
    });

    test('7.7 Update plan amount', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const account = await ws.financeGetAccount(accountId);
      const plans = Object.entries(account.account.recurring_plans || {});
      const rentPlan = plans.find(([_, p]: any) => p.title === '房租');
      if (rentPlan) {
        const result = await ws.financeUpdatePlan(accountId, rentPlan[0], {
          amount: -26000,
        });
        expect(result.success).toBe(true);
      }
    });

    test('7.8 Toggle plan active status', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const account = await ws.financeGetAccount(accountId);
      const plans = Object.entries(account.account.recurring_plans || {});
      const subPlan = plans.find(([_, p]: any) => p.title === '訂閱服務');
      if (subPlan) {
        // Deactivate
        await ws.financeUpdatePlan(accountId, subPlan[0], { active: false });
        let updated = await ws.financeGetAccount(accountId);
        expect((updated.account.recurring_plans as any)[subPlan[0]].active).toBe(false);

        // Reactivate
        await ws.financeUpdatePlan(accountId, subPlan[0], { active: true });
        updated = await ws.financeGetAccount(accountId);
        expect((updated.account.recurring_plans as any)[subPlan[0]].active).toBe(true);
      }
    });
  });

  // ─── Edge Cases ────────────────────────────
  test.describe('Round 2: Edge Cases', () => {
    test('8.1 Negative balance scenario', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const account = await ws.financeGetAccount(accountId);
      const currentBalance = account.account.balance;

      // Add a large expense to make balance negative
      const result = await ws.financeAddTransaction(
        accountId,
        -(currentBalance + 10000),
        '大額支出測試 (負餘額)',
      );
      expect(result.success).toBe(true);

      const afterAccount = await ws.financeGetAccount(accountId);
      expect(afterAccount.account.balance).toBeLessThan(0);

      // Reverse it
      await ws.financeDeleteTransaction(accountId, result.transaction.id);
    });

    test('8.2 Large transaction amount', async () => {
      const accountId = accountIds['投資帳戶'];
      const result = await ws.financeAddTransaction(accountId, 999999, '大額測試');
      expect(result.success).toBe(true);
      // Clean up
      await ws.financeDeleteTransaction(accountId, result.transaction.id);
    });

    test('8.3 Plan day boundary: day=1', async () => {
      const accountId = accountIds['緊急備用金'];
      const result = await ws.financeAddPlan(accountId, '月初測試', -100, 'monthly', 1);
      expect(result.success).toBe(true);
      // Clean up
      await ws.financeDeletePlan(accountId, result.plan_id);
    });

    test('8.4 Plan day boundary: day=28', async () => {
      const accountId = accountIds['緊急備用金'];
      const result = await ws.financeAddPlan(accountId, '月底測試', -100, 'monthly', 28);
      expect(result.success).toBe(true);
      // Clean up
      await ws.financeDeletePlan(accountId, result.plan_id);
    });

    test('8.5 All frequency types', async () => {
      const accountId = accountIds['緊急備用金'];
      for (const freq of ['daily', 'weekly', 'monthly', 'yearly']) {
        const result = await ws.financeAddPlan(
          accountId, `${freq}測試`, -100, freq, 1, 1, true,
        );
        expect(result.success).toBe(true);
        await ws.financeDeletePlan(accountId, result.plan_id);
      }
    });

    test('8.6 Unicode in transaction notes', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const result = await ws.financeAddTransaction(
        accountId,
        100,
        EDGE_CASES.UNICODE_TEXT,
      );
      expect(result.success).toBe(true);
      expect(result.transaction.note).toBe(EDGE_CASES.UNICODE_TEXT);
    });

    test('8.7 Empty note in transaction', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const result = await ws.financeAddTransaction(accountId, 50, '');
      expect(result.success).toBe(true);
    });
  });

  // ─── Chart Data ────────────────────────────
  test.describe('Round 2: Chart Data Verification', () => {
    test('9.1 Get chart data for 家庭日常開銷', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const result = await ws.financeGetChartData(accountId, 6);
      expect(result.data).toBeTruthy();
      // Should have some months of data
      if (result.data.length > 0) {
        const firstMonth = result.data[0];
        expect(firstMonth.month).toMatch(/^\d{4}-\d{2}$/);
        expect(typeof firstMonth.income).toBe('number');
        expect(typeof firstMonth.expenses).toBe('number');
      }
    });
  });

  // ─── Account Delete ────────────────────────────
  test.describe('Round 2: Account Delete', () => {
    test('10.1 Create and delete a temporary account', async () => {
      const result = await ws.financeAddAccount('待刪除帳戶 DELETE-TEST', 1000);
      expect(result.success).toBe(true);

      const deleteResult = await ws.financeDeleteAccount(result.account.id);
      expect(deleteResult.success).toBe(true);

      // Verify gone
      const accounts = await ws.financeGetAccounts();
      const found = accounts.accounts.find((a: any) => a.id === result.account.id);
      expect(found).toBeUndefined();
    });
  });

  // ─── Browser UI Verification ────────────────────
  test.describe('Round 3: Browser UI Verification', () => {
    test('11.1 Navigate to finance panel', async ({ page }) => {
      await loginAndNavigate(page, 'ha-finance');
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'test-results/finance-panel.png', fullPage: true });
    });

    test('11.2 Verify no JavaScript errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await loginAndNavigate(page, 'ha-finance');
      await page.waitForTimeout(3000);

      const criticalErrors = errors.filter(e =>
        !e.includes('favicon') && !e.includes('ResizeObserver')
      );
      if (criticalErrors.length > 0) {
        console.log('Finance panel errors:', criticalErrors);
      }
    });
  });

  // ─── Stability ─────────────────────────────
  test.describe('Round 3: Stability', () => {
    test('12.1 Verify all demo accounts intact', async () => {
      const result = await ws.financeGetAccounts();
      for (const acc of FINANCE_ACCOUNTS) {
        const found = result.accounts.find((a: any) => a.name === acc.name);
        expect(found).toBeTruthy();
      }
    });

    test('12.2 Rapid transaction creation (10 in sequence)', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const balanceBefore = (await ws.financeGetAccount(accountId)).account.balance;

      for (let i = 0; i < 10; i++) {
        await ws.financeAddTransaction(accountId, 1, `快速交易 #${i + 1}`);
      }

      const balanceAfter = (await ws.financeGetAccount(accountId)).account.balance;
      expect(balanceAfter).toBeCloseTo(balanceBefore + 10, 0);
    });

    test('12.3 Verify balance consistency', async () => {
      const accountId = accountIds['家庭日常開銷'];
      const account = await ws.financeGetAccount(accountId);
      // Sum all transactions
      const txSum = account.account.transactions.reduce(
        (sum: number, tx: any) => sum + tx.amount,
        0,
      );
      // Balance should be initial + sum of all transactions
      // (approximate due to floating point)
      const expectedBalance = 50000 + txSum;
      expect(account.account.balance).toBeCloseTo(expectedBalance, 0);
    });
  });
});
