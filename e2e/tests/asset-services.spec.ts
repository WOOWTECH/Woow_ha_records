/**
 * E2E tests for the asset Area's HA services.
 *
 * Tests 10 services via REST API:
 *   Query (ONLY):  list_assets, get_asset, list_categories, export_csv
 *   Asset CRUD (OPTIONAL): create_asset, update_asset, delete_asset
 *   Category CRUD (OPTIONAL): create_category, update_category, delete_category
 *
 * 5 rounds:
 *   1. Happy path CRUD lifecycle
 *   2. Edge cases & error handling
 *   3. Cross-path consistency (services ↔ WebSocket)
 *   4. Service registration & panel load
 *   5. Cleanup & final verification
 *
 * Note: no hook here may touch the suite's own data. Playwright discards the
 *   worker process after a failed test and starts a fresh one for the rest of
 *   the file, so beforeAll and afterAll run again mid-suite; a hook that
 *   deleted the test Assets would take every later test down with it. The
 *   leftover sweep therefore lives in test 1.1, which never re-runs, and the
 *   end-of-run cleanup in Round 5.
 */

import { test, expect } from '@playwright/test';
import { getHAToken, loginAndNavigate } from '../utils/ha-auth';
import { HAServicesClient, listRegisteredServices } from '../utils/services-client';
import { HAWebSocketClient } from '../utils/ws-client';
import { EDGE_CASES } from '../utils/test-data';

// Disable retries — sequential stateful tests can't recover from re-running
// a test against data an earlier test consumed. This does not stop the worker
// being recycled after a failure; see the note on hooks above.
test.describe.configure({ retries: 0 });

const DOMAIN = 'asset';

let token: string;
let svc: HAServicesClient;
let ws: HAWebSocketClient;

// IDs populated during tests
let catId1 = '';
let catId2 = '';
let assetId1 = '';  // full fields
let assetId2 = '';  // minimal
let assetId3 = '';  // markdown content

// The prefix every Asset and Category name in this file starts with. Matching
// on it supersedes the id lists this spec used to keep: a list only holds what
// was appended to it, so anything created and not appended survived the sweep.
// Keep every new SvcTest* name in step with this constant.
const TEST_PREFIX = 'SvcTest';

/** Is this Asset or Category one of ours? Both are matched by name. */
const isTestName = (x: any): boolean =>
  typeof x?.name === 'string' && x.name.startsWith(TEST_PREFIX);

/**
 * Delete an Asset this spec knows exists, and assert it went.
 *
 * Every cleanup here goes through this rather than swallowing its result: a
 * delete that fails silently in Round 2 surfaces as an unrelated failure in
 * Round 5. Tests 1.17 and 2.3 assert inline instead, because there the delete
 * is the contract under test rather than tidying up after one.
 */
async function deleteAssetOk(assetId: string): Promise<void> {
  const r = await svc.assetDeleteAsset(assetId);
  expect(r.status, `deleting Asset ${assetId}`).toBe(200);
  expect(r.data.success).toBe(true);
}

/** Delete a Category this spec knows exists, and assert it went. */
async function deleteCategoryOk(categoryId: string): Promise<void> {
  const r = await svc.assetDeleteCategory(categoryId);
  expect(r.status, `deleting Category ${categoryId}`).toBe(200);
  expect(r.data.success).toBe(true);
}

/**
 * Call one of this Area's services over the WebSocket `call_service` command
 * and assert HA refused it for the given reason.
 *
 * Error paths go over WebSocket on purpose (#51): HA core's REST handler
 * collapses every ServiceValidationError into a bare HTTP 500 with the reason
 * only in the log (home-assistant/core#121219), so only the WS error frame
 * lets a test tell a wrong-reason refusal from a right one. Happy paths stay
 * on REST, which is still a supported surface for calls that succeed.
 */
async function expectRefused(
  verb: string,
  data: Record<string, any>,
  translationKey: string,
): Promise<void> {
  const r = await ws.callService(`${DOMAIN}_${verb}`, data);
  expect(r.success, `expected ${verb} to be refused`).toBe(false);
  expect(r.error?.translation_key).toBe(translationKey);
}

test.describe('asset Area Services E2E Tests', () => {
  test.beforeAll(async () => {
    const tokens = await getHAToken();
    token = tokens.access_token;
    svc = new HAServicesClient(token, DOMAIN);
    ws = new HAWebSocketClient(token);
    await ws.connect();
    // Nothing is deleted here on purpose: this hook runs again whenever a test
    // fails and Playwright recycles the worker. Test 1.1 sweeps instead.
  });

  test.afterAll(async () => {
    // Nothing to clean up here on purpose, for the same reason: deleting this
    // spec's Assets from this hook would break every test after the first
    // failure. Round 5 deletes what the tests created, and 1.1 sweeps up after
    // a run that died early.
    try { await ws.close(); } catch { /* ignore */ }
  });

  // ═══════════════════════════════════════════════════════════
  // Round 1: Happy Path CRUD Lifecycle
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 1: Happy Path CRUD Lifecycle', () => {
    test('1.1 list_assets — clean slate (sweeps leftovers from a dead run)', async () => {
      const before = await svc.assetListAssets();
      expect(before.status).toBe(200);
      expect(Array.isArray(before.data.assets)).toBe(true);
      expect(Array.isArray(before.data.categories)).toBe(true);

      // A run that died mid-file leaves this spec's Assets and Categories
      // behind. Delete them here, asserting each one: they were just read back
      // from the service, so a failure is a real one, not a leftover that
      // wasn't there. Assets go first — deleting a Category cascades to the
      // Assets in it, which would leave the Asset deletes with nothing to hit.
      for (const asset of before.data.assets.filter(isTestName)) {
        await deleteAssetOk(asset.id);
      }
      for (const cat of before.data.categories.filter(isTestName)) {
        await deleteCategoryOk(cat.id);
      }

      // The slate the rest of the file is written against
      const r = await svc.assetListAssets();
      expect(r.status).toBe(200);
      expect(r.data.assets.filter(isTestName)).toEqual([]);
      expect(r.data.categories.filter(isTestName)).toEqual([]);
    });

    test('1.2 list_categories — returns array', async () => {
      const r = await svc.assetListCategories();
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.categories)).toBe(true);
    });

    test('1.3 create_category — create first category', async () => {
      const r = await svc.assetCreateCategory('SvcTest 家電');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.category.name).toBe('SvcTest 家電');
      expect(r.data.category.id).toMatch(/^cat_[a-f0-9]+$/);
      catId1 = r.data.category.id;
    });

    test('1.4 create_category — create second category', async () => {
      const r = await svc.assetCreateCategory('SvcTest 3C');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      catId2 = r.data.category.id;
    });

    test('1.5 list_categories — verify two test categories', async () => {
      const r = await svc.assetListCategories();
      expect(r.status).toBe(200);
      const ids = r.data.categories.map((c: any) => c.id);
      expect(ids).toContain(catId1);
      expect(ids).toContain(catId2);
    });

    test('1.6 create_asset — full fields with category', async () => {
      const r = await svc.assetCreateAsset('SvcTest Sony 電視', {
        brand: 'Sony',
        category_id: catId1,
        value: 45000,
        purchase_at: '2024-01-15T00:00:00+08:00',
        warranty_until: '2026-01-15T00:00:00+08:00',
        manual_md: '# Sony TV Manual\n\nModel: XR-65A95L',
        maintenance_md: '每年清潔一次濾網',
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.asset.name).toBe('SvcTest Sony 電視');
      expect(r.data.asset.brand).toBe('Sony');
      expect(r.data.asset.category_id).toBe(catId1);
      expect(r.data.asset.value).toBe(45000);
      expect(r.data.asset.id).toMatch(/^asset_[a-f0-9]+$/);
      expect(r.data.asset.purchase_at).toBeTruthy();
      expect(r.data.asset.warranty_until).toBeTruthy();
      assetId1 = r.data.asset.id;
    });

    test('1.7 create_asset — minimal fields (name only)', async () => {
      const r = await svc.assetCreateAsset('SvcTest 簡單設備');
      expect(r.status).toBe(200);
      expect(r.data.asset.name).toBe('SvcTest 簡單設備');
      expect(r.data.asset.brand).toBe('');
      expect(r.data.asset.value).toBe(0);
      expect(r.data.asset.purchase_at).toBeNull();
      expect(r.data.asset.warranty_until).toBeNull();
      assetId2 = r.data.asset.id;
    });

    test('1.8 create_asset — with long markdown content', async () => {
      const longMd = '# Maintenance Guide\n\n' + '- Step '.repeat(500);
      const r = await svc.assetCreateAsset('SvcTest Markdown設備', {
        brand: 'TestBrand',
        category_id: catId2,
        value: 1299.99,
        manual_md: longMd,
        maintenance_md: '## 保養手冊\n\n定期保養',
      });
      expect(r.status).toBe(200);
      expect(r.data.asset.manual_md).toBe(longMd);
      assetId3 = r.data.asset.id;
    });

    test('1.9 get_asset — retrieve by ID', async () => {
      const r = await svc.assetGetAsset(assetId1);
      expect(r.status).toBe(200);
      expect(r.data.asset.id).toBe(assetId1);
      expect(r.data.asset.name).toBe('SvcTest Sony 電視');
      expect(r.data.asset.brand).toBe('Sony');
      expect(r.data.asset.category_id).toBe(catId1);
      expect(r.data.asset.value).toBe(45000);
    });

    test('1.10 list_assets — verify three test assets exist', async () => {
      const r = await svc.assetListAssets();
      expect(r.status).toBe(200);
      const svcAssets = r.data.assets.filter((a: any) => a.name?.startsWith('SvcTest'));
      expect(svcAssets.length).toBe(3);
    });

    test('1.11 update_asset — change name and brand', async () => {
      const r = await svc.assetUpdateAsset(assetId1, {
        name: 'SvcTest Sony BRAVIA 電視',
        brand: 'Sony BRAVIA',
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.asset.name).toBe('SvcTest Sony BRAVIA 電視');
      expect(r.data.asset.brand).toBe('Sony BRAVIA');
    });

    test('1.12 update_asset — change value and category_id', async () => {
      const r = await svc.assetUpdateAsset(assetId1, {
        value: 39900,
        category_id: catId2,
      });
      expect(r.status).toBe(200);
      expect(r.data.asset.value).toBe(39900);
      expect(r.data.asset.category_id).toBe(catId2);
    });

    test('1.13 update_asset — change datetime fields', async () => {
      const r = await svc.assetUpdateAsset(assetId1, {
        purchase_at: '2025-06-01T10:00:00Z',
        warranty_until: '2028-06-01T10:00:00Z',
      });
      expect(r.status).toBe(200);
      expect(r.data.asset.purchase_at).toContain('2025-06-01');
      expect(r.data.asset.warranty_until).toContain('2028-06-01');
    });

    test('1.14 get_asset — verify all updates persisted', async () => {
      const r = await svc.assetGetAsset(assetId1);
      expect(r.status).toBe(200);
      expect(r.data.asset.name).toBe('SvcTest Sony BRAVIA 電視');
      expect(r.data.asset.brand).toBe('Sony BRAVIA');
      expect(r.data.asset.value).toBe(39900);
      expect(r.data.asset.category_id).toBe(catId2);
      expect(r.data.asset.purchase_at).toContain('2025-06-01');
      expect(r.data.asset.warranty_until).toContain('2028-06-01');
    });

    test('1.15 update_category — rename category', async () => {
      const r = await svc.assetUpdateCategory(catId1, 'SvcTest 大型家電');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.category.name).toBe('SvcTest 大型家電');
      expect(r.data.category.id).toBe(catId1);
    });

    test('1.16 export_csv — verify structure and content', async () => {
      const r = await svc.assetExportCsv();
      expect(r.status).toBe(200);
      expect(r.data.csv_content).toBeTruthy();
      expect(r.data.asset_count).toBeGreaterThanOrEqual(3);

      const lines = r.data.csv_content.split('\n').filter((l: string) => l.trim());
      // Header
      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('name');
      expect(lines[0]).toContain('brand');
      expect(lines[0]).toContain('category');
      // Content should include our assets
      const csvText = r.data.csv_content;
      expect(csvText).toContain('SvcTest Sony BRAVIA 電視');
    });

    test('1.17 delete_asset — remove one asset', async () => {
      const r = await svc.assetDeleteAsset(assetId2);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      assetId2 = ''; // cleared

      const check = await svc.assetListAssets();
      const svcAssets = check.data.assets.filter((a: any) => a.name?.startsWith('SvcTest'));
      expect(svcAssets.length).toBe(2);
    });

    test('1.18 delete_category — refuses a non-empty category without force', async () => {
      // catId2 still holds assets. The cascade destroys them, so it is
      // opt-in. Issue #49.
      await expectRefused(
        'delete_category',
        { category_id: catId2, force: false },
        'asset.category_not_empty',
      );

      // Nothing was deleted.
      const cats = await svc.assetListCategories();
      expect(cats.data.categories.map((c: any) => c.id)).toContain(catId2);

      const assets = await svc.assetListAssets();
      const survivors = assets.data.assets.filter(
        (a: any) => a.category_id === catId2,
      );
      expect(survivors.length).toBeGreaterThanOrEqual(1);
    });

    test('1.19 delete_category — cascade deletes assets in category', async () => {
      // catId2 has assetId1 (moved to catId2 in test 1.12) and assetId3
      const beforeList = await svc.assetListAssets();
      const assetsInCat2 = beforeList.data.assets.filter(
        (a: any) => a.category_id === catId2 && a.name?.startsWith('SvcTest'),
      );
      expect(assetsInCat2.length).toBeGreaterThanOrEqual(1);

      const r = await svc.assetDeleteCategory(catId2);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      const afterList = await svc.assetListAssets();
      const remaining = afterList.data.assets.filter(
        (a: any) => a.category_id === catId2,
      );
      expect(remaining.length).toBe(0);

      // Category should be gone
      const cats = await svc.assetListCategories();
      const catIds = cats.data.categories.map((c: any) => c.id);
      expect(catIds).not.toContain(catId2);

      // Clear IDs for assets that were cascade-deleted
      assetId1 = '';
      assetId3 = '';
      catId2 = '';
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 2: Edge Cases & Error Handling
  //
  // Error paths call the service over WebSocket via expectRefused and assert
  // the specific refusal reason (#51). Over REST, a ServiceValidationError is
  // a bare HTTP 500 with the reason only in the HA log.
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 2: Edge Cases & Error Handling', () => {

    // ─── 2.A Nonexistent resources ────────────────────────
    test('2.1 get_asset — nonexistent ID refused with asset_not_found', async () => {
      await expectRefused(
        'get_asset',
        { asset_id: 'asset_0000000000000000' },
        'asset.asset_not_found',
      );
    });

    test('2.2 update_asset — nonexistent ID refused with asset_not_found', async () => {
      await expectRefused(
        'update_asset',
        { asset_id: 'asset_0000000000000000', name: 'Nope' },
        'asset.asset_not_found',
      );
    });

    test('2.3 delete_asset — nonexistent ID refused with asset_not_found', async () => {
      await expectRefused(
        'delete_asset',
        { asset_id: 'asset_0000000000000000' },
        'asset.asset_not_found',
      );
    });

    test('2.4 update_category — nonexistent ID refused with category_error', async () => {
      // The coordinator reports every category save problem (not found,
      // duplicate, too long) as one ValueError, so the service maps them all
      // to the single category_error key.
      await expectRefused(
        'update_category',
        { category_id: 'cat_0000000000000000', name: 'Nope' },
        'asset.category_error',
      );
    });

    test('2.5 delete_category — nonexistent ID refused with category_not_found', async () => {
      await expectRefused(
        'delete_category',
        { category_id: 'cat_0000000000000000' },
        'asset.category_not_found',
      );
    });

    // ─── 2.B Empty/whitespace names ──────────────────────
    test('2.6 create_asset — empty name refused with name_required', async () => {
      await expectRefused('create_asset', { name: '' }, 'asset.name_required');
    });

    test('2.7 create_asset — whitespace-only name refused with name_required', async () => {
      await expectRefused('create_asset', { name: '   ' }, 'asset.name_required');
    });

    test('2.8 update_asset — empty name refused with name_required', async () => {
      // Create a temp asset to update
      const c = await svc.assetCreateAsset('SvcTest TempForUpdate');
      expect(c.status).toBe(200);
      const tempId = c.data.asset.id;

      await expectRefused(
        'update_asset',
        { asset_id: tempId, name: '  ' },
        'asset.name_required',
      );

      // Clean up
      await deleteAssetOk(tempId);
    });

    test('2.9 create_category — empty name refused with category_name_required', async () => {
      await expectRefused('create_category', { name: '' }, 'asset.category_name_required');
    });

    test('2.10 create_category — whitespace-only name refused with category_name_required', async () => {
      await expectRefused('create_category', { name: '   ' }, 'asset.category_name_required');
    });

    // ─── 2.C Duplicate category name ─────────────────────
    test('2.11 create_category — duplicate name refused with category_error', async () => {
      const c = await svc.assetCreateCategory('SvcTest DupCategory');
      expect(c.status).toBe(200);

      await expectRefused(
        'create_category',
        { name: 'SvcTest DupCategory' },
        'asset.category_error',
      );

      // Case-insensitive
      await expectRefused(
        'create_category',
        { name: 'svctest dupcategory' },
        'asset.category_error',
      );
    });

    // ─── 2.D Invalid datetime ────────────────────────────
    test('2.12 create_asset — invalid purchase_at refused with invalid_datetime', async () => {
      await expectRefused(
        'create_asset',
        { name: 'SvcTest BadDate', purchase_at: 'not-a-date' },
        'asset.invalid_datetime',
      );
    });

    test('2.13 update_asset — invalid warranty_until refused with invalid_datetime', async () => {
      const c = await svc.assetCreateAsset('SvcTest DateUpdateTest');
      expect(c.status).toBe(200);
      const tempId = c.data.asset.id;

      await expectRefused(
        'update_asset',
        { asset_id: tempId, warranty_until: 'abc123' },
        'asset.invalid_datetime',
      );

      await deleteAssetOk(tempId);
    });

    // ─── 2.E Boundary values ─────────────────────────────
    test('2.14 create_asset — zero value accepted', async () => {
      const r = await svc.assetCreateAsset('SvcTest ZeroVal', { value: 0 });
      expect(r.status).toBe(200);
      expect(r.data.asset.value).toBe(0);
      await deleteAssetOk(r.data.asset.id);
    });

    test('2.15 create_asset — large value accepted', async () => {
      const r = await svc.assetCreateAsset('SvcTest LargeVal', { value: 99999999 });
      expect(r.status).toBe(200);
      expect(r.data.asset.value).toBe(99999999);
      await deleteAssetOk(r.data.asset.id);
    });

    test('2.16 create_category — max length name (100 chars) accepted', async () => {
      const r = await svc.assetCreateCategory('SvcTest' + 'A'.repeat(93));
      expect(r.status).toBe(200);
      await deleteCategoryOk(r.data.category.id);
    });

    // ─── 2.F Unicode & special characters ────────────────
    test('2.17 create_asset — Unicode name and brand preserved', async () => {
      const r = await svc.assetCreateAsset('SvcTest ' + EDGE_CASES.UNICODE_TEXT, {
        brand: EDGE_CASES.UNICODE_TEXT,
      });
      expect(r.status).toBe(200);
      expect(r.data.asset.name).toBe('SvcTest ' + EDGE_CASES.UNICODE_TEXT);
      expect(r.data.asset.brand).toBe(EDGE_CASES.UNICODE_TEXT);
      await deleteAssetOk(r.data.asset.id);
    });

    test('2.18 create_asset — emoji in name preserved', async () => {
      const r = await svc.assetCreateAsset('SvcTest ' + EDGE_CASES.EMOJI_HEAVY);
      expect(r.status).toBe(200);
      expect(r.data.asset.name).toBe('SvcTest ' + EDGE_CASES.EMOJI_HEAVY);
      await deleteAssetOk(r.data.asset.id);
    });

    // ─── 2.G Injection attempts ──────────────────────────
    test('2.19 create_asset — HTML injection in manual_md stored safely', async () => {
      const r = await svc.assetCreateAsset('SvcTest HTMLInject', {
        manual_md: EDGE_CASES.HTML_INJECTION,
      });
      expect(r.status).toBe(200);
      expect(r.data.asset.manual_md).toBe(EDGE_CASES.HTML_INJECTION);
      await deleteAssetOk(r.data.asset.id);
    });

    test('2.20 create_asset — SQL injection in name stored safely', async () => {
      const r = await svc.assetCreateAsset('SvcTest ' + EDGE_CASES.SQL_INJECTION);
      expect(r.status).toBe(200);
      expect(r.data.asset.name).toBe('SvcTest ' + EDGE_CASES.SQL_INJECTION);
      await deleteAssetOk(r.data.asset.id);
    });

    test('2.21 update_asset — XSS in maintenance_md stored safely', async () => {
      const c = await svc.assetCreateAsset('SvcTest XSSTest');
      expect(c.status).toBe(200);
      const tempId = c.data.asset.id;

      const r = await svc.assetUpdateAsset(tempId, {
        maintenance_md: EDGE_CASES.IMG_XSS,
      });
      expect(r.status).toBe(200);
      expect(r.data.asset.maintenance_md).toBe(EDGE_CASES.IMG_XSS);

      await deleteAssetOk(tempId);
    });

    // ─── 2.H Partial update ──────────────────────────────
    test('2.22 update_asset — partial update preserves other fields', async () => {
      const c = await svc.assetCreateAsset('SvcTest PartialUp', {
        brand: 'OriginalBrand',
        value: 5000,
        manual_md: 'Original manual',
      });
      expect(c.status).toBe(200);
      const tempId = c.data.asset.id;

      // Update only brand
      const r = await svc.assetUpdateAsset(tempId, { brand: 'NewBrand' });
      expect(r.status).toBe(200);
      expect(r.data.asset.brand).toBe('NewBrand');
      // Other fields preserved
      expect(r.data.asset.name).toBe('SvcTest PartialUp');
      expect(r.data.asset.value).toBe(5000);
      expect(r.data.asset.manual_md).toBe('Original manual');

      await deleteAssetOk(tempId);
    });

    // ─── 2.I Response mode tests ─────────────────────────
    test('2.23 list_assets without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('list_assets', {}, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.24 get_asset without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('get_asset', { asset_id: 'any' }, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.25 export_csv without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('export_csv', {}, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.26 list_categories without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('list_categories', {}, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.27 create_asset without return_response — works (OPTIONAL mode)', async () => {
      const r = await svc.call(
        'create_asset',
        { name: 'SvcTest FireAndForget' },
        { returnResponse: false },
      );
      expect(r.status).toBe(200);

      // Clean up the created asset. Best-effort on purpose: the call above ran
      // without return_response, so it reports nothing about what it made, and
      // this test is about the response mode rather than the Asset. If it is
      // there it must delete cleanly; Round 5 sweeps it either way.
      const list = await svc.assetListAssets();
      const found = list.data.assets.find((a: any) => a.name === 'SvcTest FireAndForget');
      if (found) await deleteAssetOk(found.id);
    });

    // ─── 2.J CSV with special chars ──────────────────────
    test('2.28 export_csv — special characters properly escaped', async () => {
      const c = await svc.assetCreateAsset('SvcTest CSV,Test"Name', {
        brand: 'Brand "with" quotes',
        manual_md: 'line1\nline2\nline3',
      });
      expect(c.status).toBe(200);
      const tempId = c.data.asset.id;

      const r = await svc.assetExportCsv();
      expect(r.status).toBe(200);
      // CSV should contain the escaped content
      expect(r.data.csv_content).toContain('SvcTest CSV');

      await deleteAssetOk(tempId);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 3: Cross-Path Consistency (Services ↔ WebSocket)
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 3: Cross-Path Consistency', () => {
    let crossAssetId = '';
    let crossCatId = '';
    let wsAssetId = '';
    let wsCatId = '';

    // No afterAll here either — a nested one is recycled with the worker just
    // like the outer hooks, and would strand the rest of Round 3 against data
    // it deleted. Everything below is named SvcTest*, so Round 5 sweeps it.

    test('3.1 Asset created via services visible via WebSocket', async () => {
      const c = await svc.assetCreateAsset('SvcTest CrossPathAsset', {
        brand: 'CrossBrand',
        value: 7777,
      });
      expect(c.status).toBe(200);
      crossAssetId = c.data.asset.id;

      const wsList = await ws.assetList();
      const found = wsList.assets.find((a: any) => a.id === crossAssetId);
      expect(found).toBeTruthy();
      expect(found.name).toBe('SvcTest CrossPathAsset');
      expect(found.brand).toBe('CrossBrand');
    });

    test('3.2 Category created via services visible via WebSocket', async () => {
      const c = await svc.assetCreateCategory('SvcTest CrossCat');
      expect(c.status).toBe(200);
      crossCatId = c.data.category.id;

      const wsList = await ws.assetList();
      const found = wsList.categories.find((c: any) => c.id === crossCatId);
      expect(found).toBeTruthy();
      expect(found.name).toBe('SvcTest CrossCat');
    });

    test('3.3 Asset created via WebSocket visible via services', async () => {
      const wsResult = await ws.assetCreate({
        name: 'SvcTest WsCreated',
        brand: 'WsBrand',
        value: 8888,
      });
      wsAssetId = wsResult.asset.id;

      const r = await svc.assetGetAsset(wsAssetId);
      expect(r.status).toBe(200);
      expect(r.data.asset.name).toBe('SvcTest WsCreated');
      expect(r.data.asset.brand).toBe('WsBrand');
      expect(r.data.asset.value).toBe(8888);
    });

    test('3.4 Asset updated via WebSocket visible via services', async () => {
      await ws.assetUpdate(wsAssetId, { brand: 'UpdatedWsBrand', value: 9999 });

      const r = await svc.assetGetAsset(wsAssetId);
      expect(r.status).toBe(200);
      expect(r.data.asset.brand).toBe('UpdatedWsBrand');
      expect(r.data.asset.value).toBe(9999);
    });

    test('3.5 Category created via WebSocket visible via services', async () => {
      const wsResult = await ws.assetCreateCategory('SvcTest WsCat');
      wsCatId = wsResult.category.id;

      const r = await svc.assetListCategories();
      expect(r.status).toBe(200);
      const found = r.data.categories.find((c: any) => c.id === wsCatId);
      expect(found).toBeTruthy();
      expect(found.name).toBe('SvcTest WsCat');
    });

    test('3.6 export_csv reflects both service and WS assets', async () => {
      const r = await svc.assetExportCsv();
      expect(r.status).toBe(200);
      expect(r.data.csv_content).toContain('SvcTest CrossPathAsset');
      expect(r.data.csv_content).toContain('SvcTest WsCreated');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 4: Service registration & panel load
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 4: Service Registration & Panel Load', () => {
    test('4.1 asset services registered under the integration domain', async () => {
      const registered = await listRegisteredServices(token);
      expect(registered).toEqual(expect.arrayContaining([
        'asset_list_assets',
        'asset_get_asset',
        'asset_list_categories',
        'asset_export_csv',
        'asset_create_asset',
        'asset_update_asset',
        'asset_delete_asset',
        'asset_create_category',
        'asset_update_category',
        'asset_delete_category',
      ]));
    });

    test('4.2 Asset panel loads correctly', async ({ page }) => {
      await loginAndNavigate(page, 'ha-asset-record');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const content = await page.content();
      expect(content.length).toBeGreaterThan(1000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 5: Cleanup & Final Verification
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 5: Cleanup & Final Verification', () => {
    test('5.1 delete all remaining test assets', async () => {
      const r = await svc.assetListAssets();
      expect(r.status).toBe(200);
      for (const asset of r.data.assets.filter(isTestName)) {
        await deleteAssetOk(asset.id);
      }
    });

    test('5.2 delete all remaining test categories', async () => {
      const r = await svc.assetListCategories();
      expect(r.status).toBe(200);
      for (const cat of r.data.categories.filter(isTestName)) {
        await deleteCategoryOk(cat.id);
      }
    });

    test('5.3 list_assets — no test data remains', async () => {
      const r = await svc.assetListAssets();
      expect(r.status).toBe(200);
      expect(r.data.assets.filter(isTestName)).toEqual([]);
      expect(r.data.categories.filter(isTestName)).toEqual([]);
    });

    test('5.4 services still callable after cleanup', async () => {
      const r = await svc.assetListAssets();
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.assets)).toBe(true);
    });
  });
});
