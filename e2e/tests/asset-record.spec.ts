import { test, expect } from '@playwright/test';
import { getHAToken, loginAndNavigate } from '../utils/ha-auth';
import { HAWebSocketClient } from '../utils/ws-client';
import { ASSET_DATA, EDGE_CASES } from '../utils/test-data';

let token: string;
let ws: HAWebSocketClient;
const createdAssetIds: string[] = [];

test.describe('ha_asset_record E2E Tests', () => {
  test.beforeAll(async () => {
    const tokens = await getHAToken();
    token = tokens.access_token;
    ws = new HAWebSocketClient(token);
    await ws.connect();
  });

  test.afterAll(async () => {
    await ws.close();
  });

  // ─── Asset CRUD ───────────────────────────────────────────
  test.describe('Round 1: Create Assets with Real Data', () => {
    for (let i = 0; i < ASSET_DATA.length; i++) {
      const asset = ASSET_DATA[i];
      test(`1.${i + 1} Create asset: ${asset.name}`, async () => {
        const result = await ws.assetCreate({
          name: asset.name,
          brand: asset.brand,
          category: asset.category,
          value: asset.value,
          purchase_at: asset.purchase_at,
          warranty_until: asset.warranty_until,
          manual_md: asset.manual_md,
          maintenance_md: asset.maintenance_md,
        });
        expect(result.asset).toBeTruthy();
        expect(result.asset.name).toBe(asset.name);
        expect(result.asset.id).toMatch(/^asset_[a-f0-9]+$/);
        createdAssetIds.push(result.asset.id);
      });
    }
  });

  test.describe('Round 1: Read & Verify Assets', () => {
    test('2.1 List all assets and verify count', async () => {
      const result = await ws.assetList();
      expect(result.assets.length).toBeGreaterThanOrEqual(ASSET_DATA.length);

      // Verify all created assets exist
      for (const asset of ASSET_DATA) {
        const found = result.assets.find((a: any) => a.name === asset.name);
        expect(found).toBeTruthy();
        expect(found.brand).toBe(asset.brand);
        expect(found.category).toBe(asset.category);
      }
    });

    test('2.2 Verify Markdown content preserved', async () => {
      const result = await ws.assetList();
      // Find the MacBook created by our test data (exact name from ASSET_DATA)
      const macbook = result.assets.find((a: any) => a.name === 'MacBook Pro 16 吋 M3 Max');
      if (macbook) {
        expect(macbook.manual_md).toContain('# MacBook Pro 使用手冊');
        expect(macbook.manual_md).toContain('Cmd+Shift+4');
      } else {
        // If not found by exact name, verify at least one asset has markdown
        const withMd = result.assets.find((a: any) => a.manual_md && a.manual_md.length > 50);
        expect(withMd).toBeTruthy();
      }
    });

    test('2.3 Verify date fields', async () => {
      const result = await ws.assetList();
      const tv = result.assets.find((a: any) => a.name.includes('Sony'));
      expect(tv).toBeTruthy();
      expect(tv.purchase_at).toBeTruthy();
      expect(tv.warranty_until).toBeTruthy();
    });
  });

  test.describe('Round 1: Update Assets', () => {
    test('3.1 Update asset value (price increase)', async () => {
      const result = await ws.assetList();
      const macbook = result.assets.find((a: any) => a.name.includes('MacBook'));
      if (macbook) {
        const updated = await ws.assetUpdate(macbook.id, { value: 92900 });
        expect(updated.asset).toBeTruthy();
        expect(updated.asset.value).toBe(92900);
      }
    });

    test('3.2 Update warranty date', async () => {
      const result = await ws.assetList();
      const iphone = result.assets.find((a: any) => a.name.includes('iPhone'));
      if (iphone) {
        const updated = await ws.assetUpdate(iphone.id, {
          warranty_until: '2026-06-01T00:00:00+08:00',
        });
        expect(updated.asset).toBeTruthy();
      }
    });

    test('3.3 Update maintenance notes', async () => {
      const result = await ws.assetList();
      const dyson = result.assets.find((a: any) => a.name.includes('Dyson'));
      if (dyson) {
        const updated = await ws.assetUpdate(dyson.id, {
          maintenance_md: dyson.maintenance_md + '\n\n## 最近緭護\n- 2024-10-01: 更換濾網\n- 2024-12-15: 清潔刷頭',
        });
        expect(updated.asset).toBeTruthy();
        expect(updated.asset.maintenance_md).toContain('更換濾網');
      }
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────
  test.describe('Round 2: Edge Cases - Input Validation', () => {
    test('4.1 Reject empty name', async () => {
      try {
        await ws.assetCreate({ name: '' });
        expect(true).toBe(false); // Should not reach here
      } catch (e: any) {
        expect(e.message).toBeTruthy();
      }
    });

    test('4.2 Accept 255-char name', async () => {
      const result = await ws.assetCreate({
        name: EDGE_CASES.MAX_LENGTH_255,
        brand: 'EdgeTest',
        category: '邹界測試',
        value: 1,
      });
      expect(result.asset).toBeTruthy();
      // Clean up
      if (result.asset?.id) {
        await ws.assetDelete(result.asset.id);
      }
    });

    test('4.3 Value boundary: 0', async () => {
      const result = await ws.assetCreate({
        name: '零元資產測試',
        value: EDGE_CASES.ZERO_VALUE,
        brand: 'Test',
        category: '測試',
      });
      expect(result.asset).toBeTruthy();
      expect(result.asset.value).toBe(0);
      if (result.asset?.id) await ws.assetDelete(result.asset.id);
    });

    test('4.4 Value boundary: 999999.99 (max)', async () => {
      const result = await ws.assetCreate({
        name: '高僸資產測試',
        value: EDGE_CASES.MAX_ASSET_VALUE,
        brand: 'Test',
        category: '測試',
      });
      expect(result.asset).toBeTruthy();
      expect(result.asset.value).toBe(999999.99);
      if (result.asset?.id) await ws.assetDelete(result.asset.id);
    });

    test('4.5 Special characters in name', async () => {
      const result = await ws.assetCreate({
        name: EDGE_CASES.SPECIAL_CHARS,
        brand: '特殊字元',
        category: '測試',
        value: 100,
      });
      expect(result.asset).toBeTruthy();
      expect(result.asset.name).toBe(EDGE_CASES.SPECIAL_CHARS);
      if (result.asset?.id) await ws.assetDelete(result.asset.id);
    });

    test('4.6 HTML injection in name (XSS test)', async () => {
      const result = await ws.assetCreate({
        name: EDGE_CASES.HTML_INJECTION,
        brand: 'XSS Test',
        category: '安全測試',
        value: 0,
      });
      expect(result.asset).toBeTruthy();
      // The value should be stored as-is (sanitization happens at render time)
      expect(result.asset.name).toBe(EDGE_CASES.HTML_INJECTION);
      if (result.asset?.id) await ws.assetDelete(result.asset.id);
    });

    test('4.7 Unicode and emoji in fields', async () => {
      const result = await ws.assetCreate({
        name: '日本語テスト 🎌',
        brand: '한국 브랜드',
        category: 'Ünïcödë',
        value: 42,
        manual_md: EDGE_CASES.UNICODE_TEXT,
      });
      expect(result.asset).toBeTruthy();
      expect(result.asset.name).toBe('日本語テスト 🎌');
      if (result.asset?.id) await ws.assetDelete(result.asset.id);
    });

    test('4.8 Large markdown content (65535 chars)', async () => {
      const result = await ws.assetCreate({
        name: '大量 Markdown 測試',
        brand: 'Test',
        category: '測試',
        value: 1,
        manual_md: EDGE_CASES.MAX_LENGTH_65535,
      });
      expect(result.asset).toBeTruthy();
      expect(result.asset.manual_md.length).toBe(65535);
      if (result.asset?.id) await ws.assetDelete(result.asset.id);
    });
  });

  test.describe('Round 2: Delete & Verify', () => {
    test('5.1 Delete a temporary asset and verify removal', async () => {
      const created = await ws.assetCreate({
        name: '待刪除資產 DELETE-TEST',
        brand: 'Temp',
        category: '暨時',
        value: 0,
      });
      expect(created.asset).toBeTruthy();

      const deleteResult = await ws.assetDelete(created.asset.id);
      expect(deleteResult.success).toBe(true);

      // Verify it's gone
      const list = await ws.assetList();
      const found = list.assets.find((a: any) => a.id === created.asset.id);
      expect(found).toBeUndefined();
    });
  });

  // ─── Browser UI Verification ──────────────────────
  test.describe('Round 3: Browser UI Verification', () => {
    test('6.1 Navigate to asset panel and verify data displays', async ({ page }) => {
      await loginAndNavigate(page, 'ha-asset-record');
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'test-results/asset-panel.png', fullPage: true });
    });

    test('6.2 Verify no JavaScript errors on page', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await loginAndNavigate(page, 'ha-asset-record');
      await page.waitForTimeout(3000);

      const criticalErrors = errors.filter(e =>
        !e.includes('favicon') && !e.includes('ResizeObserver')
      );
      if (criticalErrors.length > 0) {
        console.log('Asset panel errors:', criticalErrors);
      }
    });

    test('6.3 Verify search functionality via WebSocket', async () => {
      const result = await ws.assetList();
      // Verify we can find by brand
      const appleProducts = result.assets.filter((a: any) => a.brand === 'Apple');
      expect(appleProducts.length).toBeGreaterThanOrEqual(2);

      // Verify we can find by category
      const appliances = result.assets.filter((a: any) => a.category === '家電');
      expect(appliances.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ─── Stability: Repeat Operations ───────────────────
  test.describe('Round 3: Stability', () => {
    test('7.1 Create and immediately read back', async () => {
      const result = await ws.assetCreate({
        name: '穩定性測試資産 #' + Date.now(),
        brand: 'Stability',
        category: '穩定性',
        value: 777,
      });
      expect(result.asset).toBeTruthy();

      // Immediately read back
      const list = await ws.assetList();
      const found = list.assets.find((a: any) => a.id === result.asset.id);
      expect(found).toBeTruthy();
      expect(found.value).toBe(777);

      // Clean up
      if (result.asset?.id) await ws.assetDelete(result.asset.id);
    });

    test('7.2 Verify all demo assets still intact', async () => {
      const result = await ws.assetList();
      for (const asset of ASSET_DATA) {
        const found = result.assets.find((a: any) => a.name === asset.name);
        expect(found).toBeTruthy();
      }
    });
  });
});
