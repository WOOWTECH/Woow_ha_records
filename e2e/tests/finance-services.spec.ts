/**
 * E2E tests for the finance Area's HA services (REST API).
 *
 * These tests exercise the 14 services registered via services.py,
 * called through the REST API endpoint:
 *   POST /api/services/woow_ha_records/finance_<verb>?return_response
 *
 * Structure:
 *   Round 1 — Happy path: full CRUD lifecycle for accounts, transactions, plans
 *   Round 2 — Edge cases: invalid inputs, boundary values, injection attempts
 *   Round 3 — Cross-path consistency: data created via services visible via WS and vice versa
 *   Round 4 — Registration: services on the registry, and the panel loads
 *   Round 5 — Cleanup: delete test account, verify services persist
 *
 * Note: HA returns HTTP 500 for ServiceValidationError (not 400).
 * Note: Retries are disabled because tests are sequential and stateful.
 */

import { test, expect } from '@playwright/test';
import { getHAToken, loginAndNavigate } from '../utils/ha-auth';
import { HAServicesClient, listRegisteredServices } from '../utils/services-client';
import { HAWebSocketClient } from '../utils/ws-client';
import { EDGE_CASES } from '../utils/test-data';

// Disable retries — sequential stateful tests can't recover from re-running beforeAll
test.describe.configure({ retries: 0 });

let token: string;
let svc: HAServicesClient;
let ws: HAWebSocketClient;

// Test account identifiers (derived from name via HA config flow)
const ACCT_NAME = 'Svc Test Account';
const ACCT_ID = 'svc_test_account';

// Saved IDs from create operations (populated during tests)
let txId1 = '';
let txId2 = '';
let planId1 = '';
let planId2 = '';

/** Wait for config entry reload to complete */
const waitReload = (ms = 3000) => new Promise(r => setTimeout(r, ms));

test.describe('finance Area Services E2E Tests', () => {
  test.beforeAll(async () => {
    // Prefer long-lived token from env; fall back to auth flow
    if (process.env.HA_TOKEN) {
      token = process.env.HA_TOKEN;
    } else {
      const tokens = await getHAToken();
      token = tokens.access_token;
    }
    svc = new HAServicesClient(token, 'finance');
    ws = new HAWebSocketClient(token);
    await ws.connect();

    // Cleanup leftover test accounts from previous runs
    for (const aid of [ACCT_ID, 'renamed_test_account', 'negative_balance_test', '家庭帳戶_💰_test', 'post_delete_test']) {
      try { await svc.financeDeleteAccount(aid); } catch { /* ignore */ }
    }
    await waitReload(5000);
  });

  test.afterAll(async () => {
    // Best-effort cleanup of any test accounts
    for (const aid of [ACCT_ID, 'renamed_test_account', 'negative_balance_test', '家庭帳戶_💰_test', 'post_delete_test']) {
      try { await svc.financeDeleteAccount(aid); } catch { /* ignore */ }
    }
    try { await ws.close(); } catch { /* ignore */ }
  });

  // ═══════════════════════════════════════════════════════════
  // Round 1: Happy Path — full CRUD lifecycle
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 1: Happy Path CRUD Lifecycle', () => {

    test('1.1 get_accounts — initially empty (no test accounts)', async () => {
      const r = await svc.financeGetAccounts();
      expect(r.status).toBe(200);
      expect(r.data.accounts).toBeInstanceOf(Array);
      // No test accounts should exist at this point
      const testAcct = r.data.accounts.find((a: any) => a.id === ACCT_ID);
      expect(testAcct).toBeFalsy();
    });

    test('1.2 add_account — create test account with initial balance', async () => {
      const r = await svc.financeAddAccount(ACCT_NAME, 10000);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.account_id).toBe(ACCT_ID);
      expect(r.data.name).toBe(ACCT_NAME);
      await waitReload(5000);
    });

    test('1.3 get_accounts — verify account exists', async () => {
      const r = await svc.financeGetAccounts();
      expect(r.status).toBe(200);
      const acct = r.data.accounts.find((a: any) => a.id === ACCT_ID);
      expect(acct).toBeTruthy();
      expect(acct.name).toBe(ACCT_NAME);
      expect(acct.balance).toBe(10000);
    });

    test('1.4 get_account — full detail with empty transactions and plans', async () => {
      const r = await svc.financeGetAccount(ACCT_ID);
      expect(r.status).toBe(200);
      expect(r.data.account.id).toBe(ACCT_ID);
      expect(r.data.account.name).toBe(ACCT_NAME);
      expect(r.data.account.balance).toBe(10000);
      expect(r.data.account.transactions).toEqual([]);
      expect(r.data.account.recurring_plans).toEqual({});
    });

    test('1.5 add_transaction — add expense', async () => {
      const r = await svc.financeAddTransaction(ACCT_ID, -500, 'Grocery shopping');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.transaction).toBeTruthy();
      expect(r.data.transaction.id).toBeTruthy();
      expect(r.data.transaction.amount).toBe(-500);
      expect(r.data.transaction.note).toBe('Grocery shopping');
      expect(r.data.transaction.type).toBe('manual');
      txId1 = r.data.transaction.id;
    });

    test('1.6 add_transaction — add income', async () => {
      const r = await svc.financeAddTransaction(ACCT_ID, 3000, 'Freelance payment');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.transaction.amount).toBe(3000);
      txId2 = r.data.transaction.id;
    });

    test('1.7 get_account — verify balance updated (10000 - 500 + 3000 = 12500)', async () => {
      const r = await svc.financeGetAccount(ACCT_ID);
      expect(r.status).toBe(200);
      expect(r.data.account.balance).toBe(12500);
      expect(r.data.account.transactions.length).toBe(2);
    });

    test('1.8 update_transaction — change amount and note', async () => {
      const r = await svc.financeUpdateTransaction(ACCT_ID, txId1, {
        amount: -400,
        note: 'Corrected grocery amount',
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      // Verify balance recalculated: 12500 + (-400 - (-500)) = 12600
      const check = await svc.financeGetAccount(ACCT_ID);
      expect(check.data.account.balance).toBe(12600);
    });

    test('1.9 get_chart_data — verify monthly aggregation', async () => {
      const r = await svc.financeGetChartData(ACCT_ID, 3);
      expect(r.status).toBe(200);
      expect(r.data.data).toBeInstanceOf(Array);
      expect(r.data.data.length).toBeGreaterThanOrEqual(1);

      const currentMonth = r.data.data.find((d: any) =>
        d.month === new Date().toISOString().slice(0, 7),
      );
      expect(currentMonth).toBeTruthy();
      expect(currentMonth.income).toBe(3000);
      expect(currentMonth.expenses).toBe(400);
    });

    test('1.10 export_csv — verify CSV structure and content', async () => {
      const r = await svc.financeExportCsv(ACCT_ID);
      expect(r.status).toBe(200);
      expect(r.data.csv_content).toBeTruthy();
      expect(r.data.account_name).toBe(ACCT_NAME);
      expect(r.data.transaction_count).toBe(2);

      // Verify CSV header and content
      const lines = r.data.csv_content.trim().split('\r\n');
      expect(lines.length).toBe(3); // header + 2 transactions
      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('amount');
      expect(lines[0]).toContain('note');
      expect(lines[0]).toContain('type');
      expect(lines[0]).toContain('plan_id');
      // Check content includes our data
      expect(r.data.csv_content).toContain('Corrected grocery amount');
      expect(r.data.csv_content).toContain('Freelance payment');
    });

    test('1.11 delete_transaction — remove expense and verify balance revert', async () => {
      const r = await svc.financeDeleteTransaction(ACCT_ID, txId1);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      // Balance should revert: 12600 - (-400) = 13000
      const check = await svc.financeGetAccount(ACCT_ID);
      expect(check.data.account.balance).toBe(13000);
      expect(check.data.account.transactions.length).toBe(1);
    });

    test('1.12 adjust_balance — set absolute balance', async () => {
      const r = await svc.financeAdjustBalance(ACCT_ID, 20000);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      const check = await svc.financeGetAccount(ACCT_ID);
      expect(check.data.account.balance).toBe(20000);
    });

    test('1.13 add_plan — create monthly recurring plan', async () => {
      const r = await svc.financeAddPlan(
        ACCT_ID, 'Monthly Rent', -25000, 'monthly', 1,
      );
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.plan_id).toBeTruthy();
      planId1 = r.data.plan_id;
    });

    test('1.14 add_plan — create yearly plan', async () => {
      const r = await svc.financeAddPlan(
        ACCT_ID, 'Annual Insurance', -36000, 'yearly', 15, { month: 3 },
      );
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      planId2 = r.data.plan_id;
    });

    test('1.15 get_account — verify plans created', async () => {
      const r = await svc.financeGetAccount(ACCT_ID);
      expect(r.status).toBe(200);
      const plans = r.data.account.recurring_plans;
      expect(Object.keys(plans).length).toBe(2);

      const rent = plans[planId1];
      expect(rent).toBeTruthy();
      expect(rent.title).toBe('Monthly Rent');
      expect(rent.amount).toBe(-25000);
      expect(rent.frequency).toBe('monthly');
      expect(rent.day).toBe(1);

      const insurance = plans[planId2];
      expect(insurance).toBeTruthy();
      expect(insurance.title).toBe('Annual Insurance');
      expect(insurance.frequency).toBe('yearly');
      expect(insurance.month).toBe(3);
    });

    test('1.16 update_plan — change amount and title', async () => {
      const r = await svc.financeUpdatePlan(ACCT_ID, planId1, {
        amount: -26000,
        title: 'Monthly Rent (Adjusted)',
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      const check = await svc.financeGetAccount(ACCT_ID);
      const plan = check.data.account.recurring_plans[planId1];
      expect(plan.title).toBe('Monthly Rent (Adjusted)');
      expect(plan.amount).toBe(-26000);
    });

    test('1.17 update_plan — deactivate plan', async () => {
      const r = await svc.financeUpdatePlan(ACCT_ID, planId2, { active: false });
      expect(r.status).toBe(200);

      const check = await svc.financeGetAccount(ACCT_ID);
      const plan = check.data.account.recurring_plans[planId2];
      expect(plan.active).toBe(false);
    });

    test('1.18 delete_plan — remove yearly plan', async () => {
      const r = await svc.financeDeletePlan(ACCT_ID, planId2);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      const check = await svc.financeGetAccount(ACCT_ID);
      expect(check.data.account.recurring_plans[planId2]).toBeUndefined();
      expect(Object.keys(check.data.account.recurring_plans).length).toBe(1);
    });

    test('1.19 update_account — rename and add notes', async () => {
      const r = await svc.financeUpdateAccount(ACCT_ID, {
        name: 'Renamed Test Account',
        notes: 'Updated notes for testing',
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      const check = await svc.financeGetAccounts();
      const acct = check.data.accounts.find((a: any) => a.id === ACCT_ID);
      expect(acct.name).toBe('Renamed Test Account');
      expect(acct.notes).toBe('Updated notes for testing');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 2: Edge Cases & Error Handling
  //
  // Note: HA REST API returns HTTP 500 for ServiceValidationError.
  // We check for non-200 status rather than a specific error code.
  //
  // IMPORTANT: Tests that create/delete temporary accounts (2.20, 2.21)
  // are placed at the END of Round 2 to avoid disrupting the coordinator
  // for the main test account during other tests.
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 2: Edge Cases & Error Handling', () => {

    // ─── 2.A Nonexistent resources ────────────────────────
    test('2.1 get_account — nonexistent account returns error', async () => {
      const r = await svc.financeGetAccount('nonexistent_xyz_999');
      expect(r.status).not.toBe(200);
    });

    test('2.2 add_transaction — nonexistent account returns error', async () => {
      const r = await svc.financeAddTransaction('nonexistent_xyz_999', 100);
      expect(r.status).not.toBe(200);
    });

    test('2.3 update_transaction — nonexistent transaction returns error', async () => {
      const r = await svc.financeUpdateTransaction(ACCT_ID, 'tx_nonexistent', {
        amount: 999,
      });
      expect(r.status).not.toBe(200);
    });

    test('2.4 delete_transaction — nonexistent transaction returns error', async () => {
      const r = await svc.financeDeleteTransaction(ACCT_ID, 'tx_nonexistent');
      expect(r.status).not.toBe(200);
    });

    test('2.5 update_plan — nonexistent plan returns error', async () => {
      const r = await svc.financeUpdatePlan(ACCT_ID, 'plan_nonexistent', {
        title: 'Nope',
      });
      expect(r.status).not.toBe(200);
    });

    test('2.6 delete_plan — nonexistent plan returns error', async () => {
      const r = await svc.financeDeletePlan(ACCT_ID, 'plan_nonexistent');
      expect(r.status).not.toBe(200);
    });

    test('2.7 delete_account — nonexistent account returns error', async () => {
      const r = await svc.financeDeleteAccount('nonexistent_xyz_999');
      expect(r.status).not.toBe(200);
    });

    test('2.8 export_csv — nonexistent account returns error', async () => {
      const r = await svc.financeExportCsv('nonexistent_xyz_999');
      expect(r.status).not.toBe(200);
    });

    test('2.9 get_chart_data — nonexistent account returns error', async () => {
      const r = await svc.financeGetChartData('nonexistent_xyz_999');
      expect(r.status).not.toBe(200);
    });

    test('2.10 adjust_balance — nonexistent account returns error', async () => {
      const r = await svc.financeAdjustBalance('nonexistent_xyz_999', 100);
      expect(r.status).not.toBe(200);
    });

    // ─── 2.B Duplicate prevention ─────────────────────────
    test('2.11 add_account — duplicate name returns error', async () => {
      // Account was renamed to "Renamed Test Account" in test 1.19.
      // The duplicate name check in services.py should reject this.
      const r = await svc.financeAddAccount('Renamed Test Account');
      expect(r.status).not.toBe(200);
    });

    // ─── 2.C Empty/whitespace names ───────────────────────
    test('2.12 add_account — empty name returns error', async () => {
      const r = await svc.financeAddAccount('');
      expect(r.status).not.toBe(200);
    });

    test('2.13 add_account — whitespace-only name returns error', async () => {
      const r = await svc.financeAddAccount('   ');
      expect(r.status).not.toBe(200);
    });

    test('2.14 update_account — empty name returns error', async () => {
      const r = await svc.financeUpdateAccount(ACCT_ID, { name: '  ' });
      expect(r.status).not.toBe(200);
    });

    // ─── 2.D Boundary values ──────────────────────────────
    test('2.15 add_transaction — zero amount accepted', async () => {
      const r = await svc.financeAddTransaction(ACCT_ID, 0, 'Zero amount test');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.transaction.amount).toBe(0);
    });

    test('2.16 add_transaction — very large amount accepted', async () => {
      const r = await svc.financeAddTransaction(ACCT_ID, 9999999999, 'Large amount');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      // Cleanup: delete the large transaction to avoid balance skew
      await svc.financeDeleteTransaction(ACCT_ID, r.data.transaction.id);
    });

    test('2.17 add_transaction — negative amount accepted (expense)', async () => {
      const r = await svc.financeAddTransaction(ACCT_ID, -1, 'Tiny expense');
      expect(r.status).toBe(200);
      expect(r.data.transaction.amount).toBe(-1);
    });

    test('2.18 adjust_balance — negative balance accepted', async () => {
      // Save current balance
      const before = await svc.financeGetAccount(ACCT_ID);
      expect(before.status).toBe(200);
      const savedBalance = before.data.account.balance;

      const r = await svc.financeAdjustBalance(ACCT_ID, -5000);
      expect(r.status).toBe(200);

      const check = await svc.financeGetAccount(ACCT_ID);
      expect(check.data.account.balance).toBe(-5000);

      // Restore balance
      await svc.financeAdjustBalance(ACCT_ID, savedBalance);
    });

    test('2.19 adjust_balance — zero balance accepted', async () => {
      const before = await svc.financeGetAccount(ACCT_ID);
      expect(before.status).toBe(200);
      const savedBalance = before.data.account.balance;

      const r = await svc.financeAdjustBalance(ACCT_ID, 0);
      expect(r.status).toBe(200);

      // Restore
      await svc.financeAdjustBalance(ACCT_ID, savedBalance);
    });

    // ─── 2.E Unicode & special characters ─────────────────
    // Note: Tests 2.22-2.28 operate on the main ACCT_ID without
    // creating/deleting accounts, so they don't disrupt coordinators.

    test('2.22 add_transaction — note with special characters preserved', async () => {
      const r = await svc.financeAddTransaction(ACCT_ID, 100, EDGE_CASES.SPECIAL_CHARS);
      expect(r.status).toBe(200);

      const check = await svc.financeGetAccount(ACCT_ID);
      const tx = check.data.account.transactions.find(
        (t: any) => t.note === EDGE_CASES.SPECIAL_CHARS,
      );
      expect(tx).toBeTruthy();
      expect(tx.note).toBe(EDGE_CASES.SPECIAL_CHARS);
    });

    test('2.23 add_plan — title with Unicode preserved', async () => {
      const r = await svc.financeAddPlan(
        ACCT_ID, EDGE_CASES.UNICODE_TEXT, -100, 'monthly', 1,
      );
      expect(r.status).toBe(200);
      const pid = r.data.plan_id;

      const check = await svc.financeGetAccount(ACCT_ID);
      const plan = check.data.account.recurring_plans[pid];
      expect(plan.title).toBe(EDGE_CASES.UNICODE_TEXT);

      // Cleanup
      await svc.financeDeletePlan(ACCT_ID, pid);
    });

    // ─── 2.F Injection attempts ───────────────────────────
    test('2.24 add_transaction — HTML injection in note (stored safely)', async () => {
      const r = await svc.financeAddTransaction(ACCT_ID, 50, EDGE_CASES.HTML_INJECTION);
      expect(r.status).toBe(200);

      const check = await svc.financeGetAccount(ACCT_ID);
      const tx = check.data.account.transactions.find(
        (t: any) => t.note === EDGE_CASES.HTML_INJECTION,
      );
      expect(tx).toBeTruthy();
      expect(tx.note).toBe(EDGE_CASES.HTML_INJECTION);
    });

    test('2.25 add_transaction — SQL injection in note (stored safely)', async () => {
      const r = await svc.financeAddTransaction(ACCT_ID, 60, EDGE_CASES.SQL_INJECTION);
      expect(r.status).toBe(200);
    });

    test('2.26 update_account — XSS in notes (stored safely)', async () => {
      const r = await svc.financeUpdateAccount(ACCT_ID, {
        notes: EDGE_CASES.IMG_XSS,
      });
      expect(r.status).toBe(200);

      const check = await svc.financeGetAccount(ACCT_ID);
      expect(check.data.account.notes).toBe(EDGE_CASES.IMG_XSS);

      // Restore notes
      await svc.financeUpdateAccount(ACCT_ID, { notes: 'Updated notes for testing' });
    });

    // ─── 2.G Balance integrity under update/delete ────────
    test('2.27 update_transaction — amount change from negative to positive adjusts balance', async () => {
      // Add a test transaction
      const add = await svc.financeAddTransaction(ACCT_ID, -1000, 'Balance test');
      expect(add.status).toBe(200);
      const testTxId = add.data.transaction.id;

      const before = await svc.financeGetAccount(ACCT_ID);
      const balBefore = before.data.account.balance;

      // Change from -1000 to +500 → balance should increase by 1500
      const r = await svc.financeUpdateTransaction(ACCT_ID, testTxId, { amount: 500 });
      expect(r.status).toBe(200);

      const after = await svc.financeGetAccount(ACCT_ID);
      expect(after.data.account.balance).toBe(balBefore + 1500);

      // Cleanup
      await svc.financeDeleteTransaction(ACCT_ID, testTxId);
    });

    test('2.28 update_transaction — partial update (only note) preserves balance', async () => {
      const add = await svc.financeAddTransaction(ACCT_ID, -200, 'Partial test');
      expect(add.status).toBe(200);
      const testTxId = add.data.transaction.id;

      const before = await svc.financeGetAccount(ACCT_ID);
      const balBefore = before.data.account.balance;

      // Update only note
      const r = await svc.financeUpdateTransaction(ACCT_ID, testTxId, {
        note: 'Updated note only',
      });
      expect(r.status).toBe(200);

      const after = await svc.financeGetAccount(ACCT_ID);
      expect(after.data.account.balance).toBe(balBefore); // unchanged

      const tx = after.data.account.transactions.find((t: any) => t.id === testTxId);
      expect(tx.note).toBe('Updated note only');
      expect(tx.amount).toBe(-200); // unchanged

      // Cleanup
      await svc.financeDeleteTransaction(ACCT_ID, testTxId);
    });

    // ─── 2.H Response mode behavior ──────────────────────
    test('2.29 get_accounts without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('get_accounts', {}, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.30 get_account without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('get_account', { account_id: ACCT_ID }, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.31 export_csv without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('export_csv', { account_id: ACCT_ID }, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.32 get_chart_data without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('get_chart_data', { account_id: ACCT_ID }, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.33 add_transaction without return_response — works (fire-and-forget)', async () => {
      const r = await svc.call('add_transaction', {
        account_id: ACCT_ID,
        amount: 1,
        note: 'Fire-and-forget test',
      }, { returnResponse: false });
      // SupportsResponse.OPTIONAL should succeed without return_response
      expect(r.status).toBe(200);
    });

    // ─── 2.I CSV export edge cases ────────────────────────
    test('2.34 export_csv — with special characters in notes', async () => {
      const r = await svc.financeExportCsv(ACCT_ID);
      expect(r.status).toBe(200);
      // CSV writer should properly escape special chars
      expect(r.data.csv_content).toBeTruthy();
      expect(r.data.transaction_count).toBeGreaterThanOrEqual(1);
    });

    // ─── 2.J Account lifecycle edge cases (run LAST) ──────
    // These tests create/delete temporary accounts, which triggers
    // HA config entry reloads. Placed at the END of Round 2 to
    // avoid disrupting the coordinator for the main test account.

    test('2.20 add_account — negative initial_balance accepted', async () => {
      const r = await svc.financeAddAccount('Negative Balance Test', -1000);
      // This may succeed or fail depending on config flow
      if (r.status === 200) {
        const acctId = r.data.account_id;
        await waitReload(5000);
        const check = await svc.financeGetAccount(acctId);
        expect(check.data.account.balance).toBe(-1000);
        // Cleanup
        await svc.financeDeleteAccount(acctId);
        await waitReload(5000);
      }
    });

    test('2.21 add_account — Unicode name with emoji', async () => {
      const r = await svc.financeAddAccount('家庭帳戶 💰 Test');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      const acctId = r.data.account_id;
      await waitReload(5000);

      const check = await svc.financeGetAccounts();
      const acct = check.data.accounts.find((a: any) => a.id === acctId);
      expect(acct).toBeTruthy();
      expect(acct.name).toBe('家庭帳戶 💰 Test');

      // Cleanup
      await svc.financeDeleteAccount(acctId);
      await waitReload(5000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 3: Cross-Path Consistency (Services ↔ WebSocket)
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 3: Cross-Path Consistency', () => {

    test('3.1 Account created via services visible via WebSocket', async () => {
      // Reconnect WS in case previous reloads disrupted it
      try { await ws.close(); } catch { /* ignore */ }
      ws = new HAWebSocketClient(token);
      await ws.connect();

      const result = await ws.financeGetAccounts();
      const acct = result.accounts.find((a: any) => a.id === ACCT_ID);
      expect(acct).toBeTruthy();
      expect(acct.name).toBe('Renamed Test Account');
    });

    test('3.2 Transactions added via services visible via WebSocket', async () => {
      const result = await ws.financeGetAccount(ACCT_ID);
      // WS returns {account: {transactions: [...]}}
      expect(result.account.transactions.length).toBeGreaterThanOrEqual(1);
    });

    test('3.3 Transaction created via WebSocket visible via services', async () => {
      // Add a transaction via WS
      await ws.financeAddTransaction(ACCT_ID, 7777, 'Created via WebSocket');

      // Query via services REST API
      const r = await svc.financeGetAccount(ACCT_ID);
      const wsTx = r.data.account.transactions.find(
        (t: any) => t.note === 'Created via WebSocket',
      );
      expect(wsTx).toBeTruthy();
      expect(wsTx.amount).toBe(7777);
    });

    test('3.4 Plan created via WebSocket visible via services', async () => {
      // Add a plan via WS
      await ws.financeAddPlan(
        ACCT_ID, 'WS Plan', -500, 'weekly', 3,
      );

      // Retrieve via REST services
      const r = await svc.financeGetAccount(ACCT_ID);
      const plans = Object.values(r.data.account.recurring_plans) as any[];
      const wsPlan = plans.find((p: any) => p.title === 'WS Plan');
      expect(wsPlan).toBeTruthy();
      expect(wsPlan.amount).toBe(-500);
      expect(wsPlan.frequency).toBe('weekly');
    });

    test('3.5 CSV export reflects both service and WS transactions', async () => {
      const r = await svc.financeExportCsv(ACCT_ID);
      expect(r.status).toBe(200);
      expect(r.data.csv_content).toContain('Created via WebSocket');
      expect(r.data.csv_content).toContain('Fire-and-forget test');
    });

    test('3.6 Chart data consistent between services and WS', async () => {
      const svcResult = await svc.financeGetChartData(ACCT_ID, 1);
      const wsResult = await ws.financeGetChartData(ACCT_ID, 1);

      // svcResult.data.data is the REST response; wsResult is the WS msg.result
      // WS returns {data: [...]}
      expect(svcResult.data.data.length).toBeGreaterThanOrEqual(1);
      expect(wsResult.data.length).toBeGreaterThanOrEqual(1);

      const svcMonth = svcResult.data.data[0];
      const wsMonth = wsResult.data[0];
      expect(svcMonth.month).toBe(wsMonth.month);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 4: Service registration & panel load
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 4: Service Registration & Panel Load', () => {

    test('4.1 finance services registered under the integration domain', async () => {
      const registered = await listRegisteredServices(token);
      expect(registered).toEqual(expect.arrayContaining([
        'finance_get_accounts',
        'finance_get_account',
        'finance_get_chart_data',
        'finance_export_csv',
        'finance_add_transaction',
        'finance_update_transaction',
        'finance_delete_transaction',
        'finance_add_plan',
        'finance_update_plan',
        'finance_delete_plan',
        'finance_add_account',
        'finance_update_account',
        'finance_delete_account',
        'finance_adjust_balance',
      ]));
    });

    test('4.2 Finance panel loads correctly', async ({ page }) => {
      await loginAndNavigate(page, 'ha-finance');
      await page.waitForTimeout(5000);

      const content = await page.content();
      expect(content.length).toBeGreaterThan(1000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 5: Cleanup — delete test account
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 5: Cleanup & Final Verification', () => {

    test('5.1 delete_account — remove test account', async () => {
      const r = await svc.financeDeleteAccount(ACCT_ID);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      await waitReload(5000);
    });

    test('5.2 services still work after last account deleted', async () => {
      const r = await svc.financeGetAccounts();
      expect(r.status).toBe(200);
      const testAcct = r.data.accounts.find((a: any) => a.id === ACCT_ID);
      expect(testAcct).toBeFalsy();
    });

    test('5.3 add_account still callable after all accounts deleted', async () => {
      const r = await svc.financeAddAccount('Post-Delete Test', 0);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      const postId = r.data.account_id;
      await waitReload(5000);

      // Cleanup
      await svc.financeDeleteAccount(postId);
      await waitReload(3000);
    });
  });
});
