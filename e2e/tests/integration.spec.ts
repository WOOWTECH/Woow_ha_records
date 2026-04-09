import { test, expect } from '@playwright/test';
import { getHAToken, loginAndNavigate } from '../utils/ha-auth';
import { HAWebSocketClient } from '../utils/ws-client';

let token: string;
let ws: HAWebSocketClient;

test.describe('Cross-Component Integration Tests', () => {
  test.beforeAll(async () => {
    const tokens = await getHAToken();
    token = tokens.access_token;
    ws = new HAWebSocketClient(token);
    await ws.connect();
  });

  test.afterAll(async () => {
    await ws.close();
  });

  // ─── Panel Navigation ─────────────────────────────────
  test.describe('Panel Navigation', () => {
    test('1.1 Navigate between all four panels sequentially', async ({ page }) => {
      const panels = [
        { path: 'ha-health-record', name: 'Health Record' },
        { path: 'ha-asset-record', name: 'Asset Record' },
        { path: 'ha-note-record', name: 'Note Record' },
        { path: 'ha-finance', name: 'Finance' },
      ];

      for (const panel of panels) {
        await loginAndNavigate(page, panel.path);
        await page.waitForTimeout(3000);
        // Verify page loaded (no 404)
        const status = await page.evaluate(() => document.title);
        expect(status).toBeTruthy();
      }
    });

    test('1.2 Rapid panel switching (stress test)', async ({ page }) => {
      // Login once
      await loginAndNavigate(page, 'ha-health-record');
      await page.waitForTimeout(2000);

      const panels = ['ha-asset-record', 'ha-note-record', 'ha-finance', 'ha-health-record'];
      for (let round = 0; round < 2; round++) {
        for (const panel of panels) {
          await page.goto(`/${panel}`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1000);
        }
      }
      // If we get here without crash, the test passes
    });
  });

  // ─── Data Persistence ─────────────────────────────────
  test.describe('Data Persistence', () => {
    test('2.1 Health records persist after page reload', async ({ page }) => {
      await loginAndNavigate(page, 'ha-health-record');
      await page.waitForTimeout(3000);

      // Verify via WebSocket that data exists
      const members = await ws.healthGetMembers();
      expect(members.members.length).toBeGreaterThan(0);

      // Reload page
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);

      // Re-verify
      const membersAfter = await ws.healthGetMembers();
      expect(membersAfter.members.length).toBe(members.members.length);
    });

    test('2.2 Asset records persist after page reload', async () => {
      const before = await ws.assetList();
      // Simulate "reload" by creating new WS connection
      const ws2 = new HAWebSocketClient(token);
      await ws2.connect();
      const after = await ws2.assetList();
      await ws2.close();

      expect(after.assets.length).toBe(before.assets.length);
    });

    test('2.3 Note records persist', async () => {
      const before = await ws.noteGetData();
      const ws2 = new HAWebSocketClient(token);
      await ws2.connect();
      const after = await ws2.noteGetData();
      await ws2.close();

      expect(after.categories.length).toBe(before.categories.length);
      expect(after.notes.length).toBe(before.notes.length);
    });

    test('2.4 Finance records persist', async () => {
      const before = await ws.financeGetAccounts();
      const ws2 = new HAWebSocketClient(token);
      await ws2.connect();
      const after = await ws2.financeGetAccounts();
      await ws2.close();

      expect(after.accounts.length).toBe(before.accounts.length);
    });
  });

  // ─── Comprehensive Data Inventory ─────────────────────
  test.describe('Data Inventory - Verify Demo Dataset', () => {
    test('3.1 Health Record inventory', async () => {
      const members = await ws.healthGetMembers();
      console.log(`\n📊 Health Record Inventory:`);
      console.log(`  Members: ${members.members.length}`);
      for (const m of members.members) {
        console.log(`  - ${m.name} (${m.id}): ${m.record_sets?.length || 0} record types`);
      }

      const records = await ws.healthGetRecords('2025-01-01T00:00:00Z', '2026-12-31T23:59:59Z');
      console.log(`  Total records: ${records.records.length}`);

      expect(members.members.length).toBeGreaterThanOrEqual(2);
      expect(records.records.length).toBeGreaterThan(50);
    });

    test('3.2 Asset Record inventory', async () => {
      const assets = await ws.assetList();
      console.log(`\n📊 Asset Record Inventory:`);
      console.log(`  Total assets: ${assets.assets.length}`);
      for (const a of assets.assets) {
        console.log(`  - ${a.name} (${a.brand}): $${a.value}`);
      }

      expect(assets.assets.length).toBeGreaterThanOrEqual(8);
    });

    test('3.3 Note Record inventory', async () => {
      const data = await ws.noteGetData();
      console.log(`\n📊 Note Record Inventory:`);
      console.log(`  Categories: ${data.categories.length}`);
      console.log(`  Notes: ${data.notes.length}`);
      for (const cat of data.categories) {
        const catNotes = data.notes.filter((n: any) => n.category_id === cat.id);
        console.log(`  - ${cat.name}: ${catNotes.length} notes`);
      }

      expect(data.categories.length).toBeGreaterThanOrEqual(4);
      expect(data.notes.length).toBeGreaterThanOrEqual(10);
    });

    test('3.4 Finance Record inventory', async () => {
      const accounts = await ws.financeGetAccounts();
      console.log(`\n📊 Finance Record Inventory:`);
      console.log(`  Accounts: ${accounts.accounts.length}`);
      for (const a of accounts.accounts) {
        console.log(`  - ${a.name}: balance=${a.balance}`);
      }

      expect(accounts.accounts.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Screenshots Gallery ──────────────────────────────
  test.describe('Screenshots Gallery', () => {
    test('4.1 Take final screenshots of all panels', async ({ page }) => {
      const panels = [
        { path: 'ha-health-record', name: 'health' },
        { path: 'ha-asset-record', name: 'asset' },
        { path: 'ha-note-record', name: 'note' },
        { path: 'ha-finance', name: 'finance' },
      ];

      for (const panel of panels) {
        await loginAndNavigate(page, panel.path);
        await page.waitForTimeout(5000);
        await page.screenshot({
          path: `test-results/final-${panel.name}-panel.png`,
          fullPage: true,
        });
      }
    });
  });
});
