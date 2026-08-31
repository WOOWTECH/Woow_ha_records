/**
 * E2E tests for the note Area's HA services.
 *
 * Tests 9 services via REST API:
 *   Query (ONLY):  list_notes, get_note, list_categories, export_markdown
 *   Note CRUD (OPTIONAL): create_note, update_note, delete_note
 *   Category CRUD (OPTIONAL): create_category, delete_category
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
 *   deleted the test Notes would take every later test down with it. The
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

const DOMAIN = 'note';

let token: string;
let svc: HAServicesClient;
let ws: HAWebSocketClient;

// IDs populated during tests
let catId1 = '';
let catId2 = '';
let noteId1 = '';  // full fields (pinned + content)
let noteId2 = '';  // minimal (title only)
let noteId3 = '';  // markdown heavy

// The prefix every Note title and Category name in this file starts with.
// Matching on it supersedes the id lists this spec used to keep: a list only
// holds what was appended to it, so anything created and not appended survived
// the sweep. Keep every new SvcTest* name in step with this constant.
const TEST_PREFIX = 'SvcTest';

/** Is this Note one of ours? A Note is named by its title. */
const isTestTitle = (x: any): boolean =>
  typeof x?.title === 'string' && x.title.startsWith(TEST_PREFIX);

/** Is this Category one of ours? */
const isTestName = (x: any): boolean =>
  typeof x?.name === 'string' && x.name.startsWith(TEST_PREFIX);

/**
 * Delete a Note this spec knows exists, and assert it went.
 *
 * Every cleanup here goes through this rather than swallowing its result: a
 * delete that fails silently in Round 2 surfaces as an unrelated failure in
 * Round 5. Tests 1.16 and 2.3 assert inline instead, because there the delete
 * is the contract under test rather than tidying up after one.
 */
async function deleteNoteOk(noteId: string): Promise<void> {
  const r = await svc.noteDeleteNote(noteId);
  expect(r.status, `deleting Note ${noteId}`).toBe(200);
  expect(r.data.success).toBe(true);
}

/** Delete a Category this spec knows exists, and assert it went. */
async function deleteCategoryOk(categoryId: string): Promise<void> {
  const r = await svc.noteDeleteCategory(categoryId);
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

test.describe('note Area Services E2E Tests', () => {
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
    // spec's Notes from this hook would break every test after the first
    // failure. Round 5 deletes what the tests created, and 1.1 sweeps up after
    // a run that died early.
    try { await ws.close(); } catch { /* ignore */ }
  });

  // ═══════════════════════════════════════════════════════════
  // Round 1: Happy Path CRUD Lifecycle
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 1: Happy Path CRUD Lifecycle', () => {
    test('1.1 list_notes — clean slate (sweeps leftovers from a dead run)', async () => {
      const before = await svc.noteListNotes();
      expect(before.status).toBe(200);
      expect(Array.isArray(before.data.notes)).toBe(true);
      expect(Array.isArray(before.data.categories)).toBe(true);

      // A run that died mid-file leaves this spec's Notes and Categories
      // behind. Delete them here, asserting each one: they were just read back
      // from the service, so a failure is a real one, not a leftover that
      // wasn't there. Notes go first — deleting a Category cascades to the
      // Notes in it, which would leave the Note deletes with nothing to hit.
      for (const note of before.data.notes.filter(isTestTitle)) {
        await deleteNoteOk(note.id);
      }
      for (const cat of before.data.categories.filter(isTestName)) {
        await deleteCategoryOk(cat.id);
      }

      // The slate the rest of the file is written against
      const r = await svc.noteListNotes();
      expect(r.status).toBe(200);
      expect(r.data.notes.filter(isTestTitle)).toEqual([]);
      expect(r.data.categories.filter(isTestName)).toEqual([]);
    });

    test('1.2 list_categories — returns array', async () => {
      const r = await svc.noteListCategories();
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.categories)).toBe(true);
    });

    test('1.3 create_category — create first category', async () => {
      const r = await svc.noteCreateCategory('SvcTest 專案管理');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.category.name).toBe('SvcTest 專案管理');
      expect(r.data.category.id).toBeTruthy();
      catId1 = r.data.category.id;
    });

    test('1.4 create_category — create second category', async () => {
      const r = await svc.noteCreateCategory('SvcTest 技術文件');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      catId2 = r.data.category.id;
    });

    test('1.5 list_categories — verify two test categories', async () => {
      const r = await svc.noteListCategories();
      expect(r.status).toBe(200);
      const ids = r.data.categories.map((c: any) => c.id);
      expect(ids).toContain(catId1);
      expect(ids).toContain(catId2);
    });

    test('1.6 create_note — full fields with content and pinned', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest Q1計畫', {
        content: '# Q1 計畫\n\n## 目標\n- 完成核心功能\n- 通過安全審查',
        pinned: true,
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.note.title).toBe('SvcTest Q1計畫');
      expect(r.data.note.content).toContain('# Q1 計畫');
      expect(r.data.note.pinned).toBe(true);
      expect(r.data.note.category_id).toBe(catId1);
      expect(r.data.note.id).toBeTruthy();
      noteId1 = r.data.note.id;
    });

    test('1.7 create_note — minimal fields (title only)', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest 簡單筆記');
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest 簡單筆記');
      expect(r.data.note.content).toBe('');
      expect(r.data.note.pinned).toBe(false);
      noteId2 = r.data.note.id;
    });

    test('1.8 create_note — with long markdown content', async () => {
      const longMd = '# 技術文件\n\n' + '- 步驟 '.repeat(500);
      const r = await svc.noteCreateNote(catId2, 'SvcTest Markdown筆記', {
        content: longMd,
        pinned: false,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe(longMd);
      noteId3 = r.data.note.id;
    });

    test('1.9 get_note — retrieve by ID', async () => {
      const r = await svc.noteGetNote(noteId1);
      expect(r.status).toBe(200);
      expect(r.data.note.id).toBe(noteId1);
      expect(r.data.note.title).toBe('SvcTest Q1計畫');
      expect(r.data.note.content).toContain('# Q1 計畫');
      expect(r.data.note.pinned).toBe(true);
      expect(r.data.note.category_id).toBe(catId1);
    });

    test('1.10 list_notes — verify three test notes exist', async () => {
      const r = await svc.noteListNotes();
      expect(r.status).toBe(200);
      const svcNotes = r.data.notes.filter((n: any) => n.title?.startsWith('SvcTest'));
      expect(svcNotes.length).toBe(3);
    });

    test('1.11 update_note — change title', async () => {
      const r = await svc.noteUpdateNote(noteId1, {
        title: 'SvcTest Q1開發計畫',
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.note.title).toBe('SvcTest Q1開發計畫');
      // Other fields preserved
      expect(r.data.note.content).toContain('# Q1 計畫');
      expect(r.data.note.pinned).toBe(true);
    });

    test('1.12 update_note — change content', async () => {
      const r = await svc.noteUpdateNote(noteId1, {
        content: '# Q1 開發計畫 (更新版)\n\n全新內容',
      });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe('# Q1 開發計畫 (更新版)\n\n全新內容');
      // Title preserved
      expect(r.data.note.title).toBe('SvcTest Q1開發計畫');
    });

    test('1.13 update_note — change pinned status', async () => {
      const r = await svc.noteUpdateNote(noteId1, { pinned: false });
      expect(r.status).toBe(200);
      expect(r.data.note.pinned).toBe(false);
    });

    test('1.14 get_note — verify all updates persisted', async () => {
      const r = await svc.noteGetNote(noteId1);
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest Q1開發計畫');
      expect(r.data.note.content).toBe('# Q1 開發計畫 (更新版)\n\n全新內容');
      expect(r.data.note.pinned).toBe(false);
    });

    test('1.15 export_markdown — verify structure and content', async () => {
      const r = await svc.noteExportMarkdown();
      expect(r.status).toBe(200);
      expect(r.data.markdown_content).toBeTruthy();
      expect(r.data.note_count).toBeGreaterThanOrEqual(3);
      expect(r.data.category_count).toBeGreaterThanOrEqual(2);

      const md = r.data.markdown_content;
      // Should contain category headers
      expect(md).toContain('# SvcTest 專案管理');
      // Should contain note titles as subheadings
      expect(md).toContain('## SvcTest Q1開發計畫');
      // Should contain separators
      expect(md).toContain('---');
    });

    test('1.16 delete_note — remove one note', async () => {
      const r = await svc.noteDeleteNote(noteId2);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      noteId2 = '';

      const check = await svc.noteListNotes();
      const svcNotes = check.data.notes.filter((n: any) => n.title?.startsWith('SvcTest'));
      expect(svcNotes.length).toBe(2);
    });

    test('1.17 delete_category — refuses a non-empty category without force', async () => {
      // catId2 still holds noteId3. The cascade destroys notes that cannot be
      // moved out of the category first, so it is opt-in. Issue #45.
      await expectRefused(
        'delete_category',
        { category_id: catId2, force: false },
        'note.category_not_empty',
      );

      // Nothing was deleted.
      const cats = await svc.noteListCategories();
      expect(cats.data.categories.map((c: any) => c.id)).toContain(catId2);

      const notes = await svc.noteListNotes();
      const survivors = notes.data.notes.filter((n: any) => n.category_id === catId2);
      expect(survivors.length).toBeGreaterThanOrEqual(1);
    });

    test('1.18 delete_category — cascade deletes notes in category', async () => {
      // catId2 has noteId3
      const beforeList = await svc.noteListNotes();
      const notesInCat2 = beforeList.data.notes.filter(
        (n: any) => n.category_id === catId2 && n.title?.startsWith('SvcTest'),
      );
      expect(notesInCat2.length).toBeGreaterThanOrEqual(1);

      // force: true is the client default, but this test is the acceptance
      // check that the very call 1.17 saw refused succeeds once forced (#45,
      // #51) — so say it explicitly rather than lean on a default.
      const r = await svc.noteDeleteCategory(catId2, true);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      const afterList = await svc.noteListNotes();
      const remaining = afterList.data.notes.filter(
        (n: any) => n.category_id === catId2,
      );
      expect(remaining.length).toBe(0);

      // Category should be gone
      const cats = await svc.noteListCategories();
      const catIds = cats.data.categories.map((c: any) => c.id);
      expect(catIds).not.toContain(catId2);

      noteId3 = '';
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
    test('2.1 get_note — nonexistent ID refused with note_not_found', async () => {
      await expectRefused(
        'get_note',
        { note_id: '00000000-0000-0000-0000-000000000000' },
        'note.note_not_found',
      );
    });

    test('2.2 update_note — nonexistent ID refused with note_not_found', async () => {
      await expectRefused(
        'update_note',
        { note_id: '00000000-0000-0000-0000-000000000000', title: 'Nope' },
        'note.note_not_found',
      );
    });

    test('2.3 delete_note — nonexistent ID refused with note_not_found', async () => {
      await expectRefused(
        'delete_note',
        { note_id: '00000000-0000-0000-0000-000000000000' },
        'note.note_not_found',
      );
    });

    test('2.4 delete_category — nonexistent ID refused with category_not_found', async () => {
      await expectRefused(
        'delete_category',
        { category_id: '00000000-0000-0000-0000-000000000000' },
        'note.category_not_found',
      );
    });

    test('2.5 create_note — nonexistent category refused with category_not_found', async () => {
      await expectRefused(
        'create_note',
        { category_id: '00000000-0000-0000-0000-000000000000', title: 'SvcTest Orphan' },
        'note.category_not_found',
      );
    });

    // ─── 2.B Empty/whitespace names ──────────────────────
    test('2.6 create_category — empty name refused with category_name_required', async () => {
      await expectRefused('create_category', { name: '' }, 'note.category_name_required');
    });

    test('2.7 create_category — whitespace-only name refused with category_name_required', async () => {
      await expectRefused('create_category', { name: '   ' }, 'note.category_name_required');
    });

    test('2.8 create_note — empty title refused with title_required', async () => {
      // Use catId1 which still exists from Round 1
      await expectRefused(
        'create_note',
        { category_id: catId1, title: '' },
        'note.title_required',
      );
    });

    test('2.9 create_note — whitespace-only title refused with title_required', async () => {
      await expectRefused(
        'create_note',
        { category_id: catId1, title: '   ' },
        'note.title_required',
      );
    });

    test('2.10 update_note — empty title refused with title_required', async () => {
      await expectRefused(
        'update_note',
        { note_id: noteId1, title: '  ' },
        'note.title_required',
      );
    });

    // ─── 2.C Duplicate names ─────────────────────────────
    test('2.11 create_category — duplicate name refused with category_duplicate', async () => {
      const c = await svc.noteCreateCategory('SvcTest DupCategory');
      expect(c.status).toBe(200);

      await expectRefused(
        'create_category',
        { name: 'SvcTest DupCategory' },
        'note.category_duplicate',
      );

      // Case-insensitive
      await expectRefused(
        'create_category',
        { name: 'svctest dupcategory' },
        'note.category_duplicate',
      );

      await deleteCategoryOk(c.data.category.id);
    });

    test('2.12 create_note — duplicate title in same category refused with title_duplicate', async () => {
      const c = await svc.noteCreateNote(catId1, 'SvcTest DupTitle');
      expect(c.status).toBe(200);

      await expectRefused(
        'create_note',
        { category_id: catId1, title: 'SvcTest DupTitle' },
        'note.title_duplicate',
      );

      // Case-insensitive
      await expectRefused(
        'create_note',
        { category_id: catId1, title: 'svctest duptitle' },
        'note.title_duplicate',
      );

      await deleteNoteOk(c.data.note.id);
    });

    test('2.13 update_note — duplicate title (excluding self) refused with title_duplicate', async () => {
      // Create two notes
      const n1 = await svc.noteCreateNote(catId1, 'SvcTest TitleA');
      expect(n1.status).toBe(200);

      const n2 = await svc.noteCreateNote(catId1, 'SvcTest TitleB');
      expect(n2.status).toBe(200);

      // Try to rename n2 to n1's title
      await expectRefused(
        'update_note',
        { note_id: n2.data.note.id, title: 'SvcTest TitleA' },
        'note.title_duplicate',
      );

      await deleteNoteOk(n1.data.note.id);
      await deleteNoteOk(n2.data.note.id);
    });

    // ─── 2.D Length limits ────────────────────────────────
    test('2.14 create_category — max length name (100 chars) accepted', async () => {
      const name = 'SvcTest' + 'A'.repeat(93);
      expect(name.length).toBe(100);
      const r = await svc.noteCreateCategory(name);
      expect(r.status).toBe(200);
      await deleteCategoryOk(r.data.category.id);
    });

    test('2.15 create_category — over max length (101 chars) refused with category_name_too_long', async () => {
      const name = 'SvcTest' + 'A'.repeat(94);
      expect(name.length).toBe(101);
      await expectRefused('create_category', { name }, 'note.category_name_too_long');
    });

    test('2.16 create_note — max title length (200 chars) accepted', async () => {
      const title = 'SvcTest' + 'B'.repeat(193);
      expect(title.length).toBe(200);
      const r = await svc.noteCreateNote(catId1, title);
      expect(r.status).toBe(200);
      await deleteNoteOk(r.data.note.id);
    });

    test('2.17 create_note — over max title length (201 chars) refused with title_too_long', async () => {
      const title = 'SvcTest' + 'B'.repeat(194);
      expect(title.length).toBe(201);
      await expectRefused(
        'create_note',
        { category_id: catId1, title },
        'note.title_too_long',
      );
    });

    test('2.18 create_note — max content length (100000 chars) accepted', async () => {
      const content = 'C'.repeat(100000);
      const r = await svc.noteCreateNote(catId1, 'SvcTest MaxContent', { content });
      expect(r.status).toBe(200);
      expect(r.data.note.content.length).toBe(100000);
      await deleteNoteOk(r.data.note.id);
    });

    test('2.19 create_note — over max content length (100001 chars) refused with content_too_long', async () => {
      const content = 'C'.repeat(100001);
      await expectRefused(
        'create_note',
        { category_id: catId1, title: 'SvcTest OverContent', content },
        'note.content_too_long',
      );
    });

    // ─── 2.E Unicode & special characters ────────────────
    test('2.20 create_note — Unicode title and content preserved', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest ' + EDGE_CASES.UNICODE_TEXT, {
        content: EDGE_CASES.UNICODE_TEXT,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest ' + EDGE_CASES.UNICODE_TEXT);
      expect(r.data.note.content).toBe(EDGE_CASES.UNICODE_TEXT);
      await deleteNoteOk(r.data.note.id);
    });

    test('2.21 create_note — emoji in title preserved', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest ' + EDGE_CASES.EMOJI_HEAVY);
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest ' + EDGE_CASES.EMOJI_HEAVY);
      await deleteNoteOk(r.data.note.id);
    });

    // ─── 2.F Injection attempts ──────────────────────────
    test('2.22 create_note — HTML injection in content stored safely', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest HTMLInject', {
        content: EDGE_CASES.HTML_INJECTION,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe(EDGE_CASES.HTML_INJECTION);
      await deleteNoteOk(r.data.note.id);
    });

    test('2.23 create_note — SQL injection in title stored safely', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest ' + EDGE_CASES.SQL_INJECTION);
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest ' + EDGE_CASES.SQL_INJECTION);
      await deleteNoteOk(r.data.note.id);
    });

    test('2.24 create_note — XSS in content stored safely', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest XSSContent', {
        content: EDGE_CASES.IMG_XSS,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe(EDGE_CASES.IMG_XSS);
      await deleteNoteOk(r.data.note.id);
    });

    test('2.25 create_note — markdown injection in content stored safely', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest MdInject', {
        content: EDGE_CASES.MARKDOWN_INJECTION,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe(EDGE_CASES.MARKDOWN_INJECTION);
      await deleteNoteOk(r.data.note.id);
    });

    // ─── 2.G Partial update preserves fields ─────────────
    test('2.26 update_note — partial update preserves other fields', async () => {
      const c = await svc.noteCreateNote(catId1, 'SvcTest PartialUp', {
        content: 'Original content',
        pinned: true,
      });
      expect(c.status).toBe(200);
      const tempId = c.data.note.id;

      // Update only content
      const r = await svc.noteUpdateNote(tempId, { content: 'New content' });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe('New content');
      // Other fields preserved
      expect(r.data.note.title).toBe('SvcTest PartialUp');
      expect(r.data.note.pinned).toBe(true);

      await deleteNoteOk(tempId);
    });

    // ─── 2.H Response mode tests ─────────────────────────
    test('2.27 list_notes without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('list_notes', {}, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.28 get_note without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('get_note', { note_id: 'any' }, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.29 export_markdown without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('export_markdown', {}, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.30 list_categories without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('list_categories', {}, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.31 create_note without return_response — works (OPTIONAL mode)', async () => {
      const r = await svc.call(
        'create_note',
        { category_id: catId1, title: 'SvcTest FireAndForget' },
        { returnResponse: false },
      );
      expect(r.status).toBe(200);

      // Clean up. Best-effort on purpose: the call above ran without
      // return_response, so it reports nothing about what it made, and this
      // test is about the response mode rather than the Note. If it is there it
      // must delete cleanly; Round 5 sweeps it either way.
      const list = await svc.noteListNotes();
      const found = list.data.notes.find((n: any) => n.title === 'SvcTest FireAndForget');
      if (found) await deleteNoteOk(found.id);
    });

    // ─── 2.I Markdown export with special content ────────
    test('2.32 export_markdown — empty database returns empty string', async () => {
      // Create a temp category with no notes
      const c = await svc.noteCreateCategory('SvcTest EmptyCat');
      expect(c.status).toBe(200);
      const tempCatId = c.data.category.id;

      // Export should work (empty categories don't appear)
      const r = await svc.noteExportMarkdown();
      expect(r.status).toBe(200);
      // The markdown should NOT contain the empty category
      expect(r.data.markdown_content).not.toContain('# SvcTest EmptyCat');

      await deleteCategoryOk(tempCatId);
    });

    test('2.33 create_note — special chars in title', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest ' + EDGE_CASES.SPECIAL_CHARS);
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest ' + EDGE_CASES.SPECIAL_CHARS);
      await deleteNoteOk(r.data.note.id);
    });

    // ─── 2.J Pinned toggle ───────────────────────────────
    test('2.34 update_note — toggle pinned true→false→true', async () => {
      const c = await svc.noteCreateNote(catId1, 'SvcTest PinnedToggle', { pinned: true });
      expect(c.status).toBe(200);
      const tempId = c.data.note.id;
      expect(c.data.note.pinned).toBe(true);

      // Toggle off
      const r1 = await svc.noteUpdateNote(tempId, { pinned: false });
      expect(r1.status).toBe(200);
      expect(r1.data.note.pinned).toBe(false);

      // Toggle back on
      const r2 = await svc.noteUpdateNote(tempId, { pinned: true });
      expect(r2.status).toBe(200);
      expect(r2.data.note.pinned).toBe(true);

      await deleteNoteOk(tempId);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 3: Cross-Path Consistency (Services ↔ WebSocket)
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 3: Cross-Path Consistency', () => {
    let crossNoteId = '';
    let crossCatId = '';
    let wsNoteId = '';
    let wsCatId = '';

    // No afterAll here either — a nested one is recycled with the worker just
    // like the outer hooks, and would strand the rest of Round 3 against data
    // it deleted. Everything below is named SvcTest*, so Round 5 sweeps it.

    test('3.1 Note created via services visible via WebSocket', async () => {
      const c = await svc.noteCreateNote(catId1, 'SvcTest CrossPathNote', {
        content: 'Created via services',
        pinned: true,
      });
      expect(c.status).toBe(200);
      crossNoteId = c.data.note.id;

      const wsData = await ws.noteGetData();
      const found = wsData.notes.find((n: any) => n.id === crossNoteId);
      expect(found).toBeTruthy();
      expect(found.title).toBe('SvcTest CrossPathNote');
      expect(found.content).toBe('Created via services');
      expect(found.pinned).toBe(true);
    });

    test('3.2 Category created via services visible via WebSocket', async () => {
      const c = await svc.noteCreateCategory('SvcTest CrossCat');
      expect(c.status).toBe(200);
      crossCatId = c.data.category.id;

      const wsData = await ws.noteGetData();
      const found = wsData.categories.find((c: any) => c.id === crossCatId);
      expect(found).toBeTruthy();
      expect(found.name).toBe('SvcTest CrossCat');
    });

    test('3.3 Note created via WebSocket visible via services', async () => {
      const wsResult = await ws.noteCreateNote(catId1, 'SvcTest WsCreated', 'WS content', false);
      wsNoteId = wsResult.id;

      const r = await svc.noteGetNote(wsNoteId);
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest WsCreated');
      expect(r.data.note.content).toBe('WS content');
    });

    test('3.4 Note updated via WebSocket visible via services', async () => {
      await ws.noteUpdateNote(wsNoteId, { content: 'Updated WS content', pinned: true });

      const r = await svc.noteGetNote(wsNoteId);
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe('Updated WS content');
      expect(r.data.note.pinned).toBe(true);
    });

    test('3.5 Category created via WebSocket visible via services', async () => {
      const wsResult = await ws.noteCreateCategory('SvcTest WsCat');
      wsCatId = wsResult.id;

      const r = await svc.noteListCategories();
      expect(r.status).toBe(200);
      const found = r.data.categories.find((c: any) => c.id === wsCatId);
      expect(found).toBeTruthy();
      expect(found.name).toBe('SvcTest WsCat');
    });

    test('3.6 export_markdown reflects both service and WS notes', async () => {
      const r = await svc.noteExportMarkdown();
      expect(r.status).toBe(200);
      expect(r.data.markdown_content).toContain('SvcTest CrossPathNote');
      expect(r.data.markdown_content).toContain('SvcTest WsCreated');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 4: Service registration & panel load
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 4: Service Registration & Panel Load', () => {
    test('4.1 note services registered under the integration domain', async () => {
      const registered = await listRegisteredServices(token);
      expect(registered).toEqual(expect.arrayContaining([
        'note_list_notes',
        'note_get_note',
        'note_list_categories',
        'note_export_markdown',
        'note_create_note',
        'note_update_note',
        'note_delete_note',
        'note_create_category',
        'note_delete_category',
      ]));
    });

    test('4.2 Note panel loads correctly', async ({ page }) => {
      await loginAndNavigate(page, 'ha-note-record');
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
    test('5.1 delete all remaining test notes', async () => {
      const r = await svc.noteListNotes();
      expect(r.status).toBe(200);
      for (const note of r.data.notes.filter(isTestTitle)) {
        await deleteNoteOk(note.id);
      }
    });

    test('5.2 delete all remaining test categories', async () => {
      const r = await svc.noteListCategories();
      expect(r.status).toBe(200);
      for (const cat of r.data.categories.filter(isTestName)) {
        await deleteCategoryOk(cat.id);
      }
    });

    test('5.3 list_notes — no test data remains', async () => {
      const r = await svc.noteListNotes();
      expect(r.status).toBe(200);
      expect(r.data.notes.filter(isTestTitle)).toEqual([]);
      expect(r.data.categories.filter(isTestName)).toEqual([]);
    });

    test('5.4 services still callable after cleanup', async () => {
      const r = await svc.noteListNotes();
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.notes)).toBe(true);
    });
  });
});
