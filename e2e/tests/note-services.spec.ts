/**
 * E2E tests for ha_note_record HA Services.
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
 *   4. Browser UI verification
 *   5. Cleanup & final verification
 */

import { test, expect } from '@playwright/test';
import { getHAToken, loginAndNavigate } from '../utils/ha-auth';
import { HAServicesClient } from '../utils/services-client';
import { HAWebSocketClient } from '../utils/ws-client';
import { EDGE_CASES } from '../utils/test-data';

test.describe.configure({ retries: 0 });

const DOMAIN = 'ha_note_record';

let token: string;
let svc: HAServicesClient;
let ws: HAWebSocketClient;

// IDs populated during tests
let catId1 = '';
let catId2 = '';
let noteId1 = '';  // full fields (pinned + content)
let noteId2 = '';  // minimal (title only)
let noteId3 = '';  // markdown heavy
// Edge-case note/category IDs for cleanup
const extraNoteIds: string[] = [];
const extraCatIds: string[] = [];

test.describe('ha_note_record Services E2E Tests', () => {
  test.beforeAll(async () => {
    const tokens = await getHAToken();
    token = tokens.access_token;
    svc = new HAServicesClient(token, DOMAIN);
    ws = new HAWebSocketClient(token);
    await ws.connect();

    // Clean up leftover test data from previous runs
    const initial = await svc.noteListNotes();
    if (initial.status === 200) {
      for (const note of initial.data.notes || []) {
        if (note.title?.startsWith('SvcTest')) {
          try { await svc.noteDeleteNote(note.id); } catch { /* ignore */ }
        }
      }
      for (const cat of initial.data.categories || []) {
        if (cat.name?.startsWith('SvcTest')) {
          try { await svc.noteDeleteCategory(cat.id); } catch { /* ignore */ }
        }
      }
    }
  });

  test.afterAll(async () => {
    // Best-effort cleanup
    for (const nid of [noteId1, noteId2, noteId3, ...extraNoteIds]) {
      if (nid) try { await svc.noteDeleteNote(nid); } catch { /* ignore */ }
    }
    for (const cid of [catId1, catId2, ...extraCatIds]) {
      if (cid) try { await svc.noteDeleteCategory(cid); } catch { /* ignore */ }
    }
    // Final sweep — clean any remaining SvcTest items
    try {
      const final = await svc.noteListNotes();
      if (final.status === 200) {
        for (const note of final.data.notes || []) {
          if (note.title?.startsWith('SvcTest')) {
            try { await svc.noteDeleteNote(note.id); } catch { /* ignore */ }
          }
        }
        for (const cat of final.data.categories || []) {
          if (cat.name?.startsWith('SvcTest')) {
            try { await svc.noteDeleteCategory(cat.id); } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
    try { await ws.close(); } catch { /* ignore */ }
  });

  // ═══════════════════════════════════════════════════════════
  // Round 1: Happy Path CRUD Lifecycle
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 1: Happy Path CRUD Lifecycle', () => {
    test('1.1 list_notes — initially no SvcTest data', async () => {
      const r = await svc.noteListNotes();
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.notes)).toBe(true);
      expect(Array.isArray(r.data.categories)).toBe(true);
      const svcNotes = r.data.notes.filter((n: any) => n.title?.startsWith('SvcTest'));
      expect(svcNotes.length).toBe(0);
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

    test('1.17 delete_category — cascade deletes notes in category', async () => {
      // catId2 has noteId3
      const beforeList = await svc.noteListNotes();
      const notesInCat2 = beforeList.data.notes.filter(
        (n: any) => n.category_id === catId2 && n.title?.startsWith('SvcTest'),
      );
      expect(notesInCat2.length).toBeGreaterThanOrEqual(1);

      const r = await svc.noteDeleteCategory(catId2);
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
  // Note: HA REST API returns HTTP 500 for ServiceValidationError.
  // We check for non-200 status rather than a specific error code.
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 2: Edge Cases & Error Handling', () => {

    // ─── 2.A Nonexistent resources ────────────────────────
    test('2.1 get_note — nonexistent ID returns error', async () => {
      const r = await svc.noteGetNote('00000000-0000-0000-0000-000000000000');
      expect(r.status).not.toBe(200);
    });

    test('2.2 update_note — nonexistent ID returns error', async () => {
      const r = await svc.noteUpdateNote('00000000-0000-0000-0000-000000000000', { title: 'Nope' });
      expect(r.status).not.toBe(200);
    });

    test('2.3 delete_note — nonexistent ID returns error', async () => {
      const r = await svc.noteDeleteNote('00000000-0000-0000-0000-000000000000');
      expect(r.status).not.toBe(200);
    });

    test('2.4 delete_category — nonexistent ID returns error', async () => {
      const r = await svc.noteDeleteCategory('00000000-0000-0000-0000-000000000000');
      expect(r.status).not.toBe(200);
    });

    test('2.5 create_note — nonexistent category returns error', async () => {
      const r = await svc.noteCreateNote('00000000-0000-0000-0000-000000000000', 'SvcTest Orphan');
      expect(r.status).not.toBe(200);
    });

    // ─── 2.B Empty/whitespace names ──────────────────────
    test('2.6 create_category — empty name returns error', async () => {
      const r = await svc.noteCreateCategory('');
      expect(r.status).not.toBe(200);
    });

    test('2.7 create_category — whitespace-only name returns error', async () => {
      const r = await svc.noteCreateCategory('   ');
      expect(r.status).not.toBe(200);
    });

    test('2.8 create_note — empty title returns error', async () => {
      // Use catId1 which still exists from Round 1
      const r = await svc.noteCreateNote(catId1, '');
      expect(r.status).not.toBe(200);
    });

    test('2.9 create_note — whitespace-only title returns error', async () => {
      const r = await svc.noteCreateNote(catId1, '   ');
      expect(r.status).not.toBe(200);
    });

    test('2.10 update_note — empty title returns error', async () => {
      const r = await svc.noteUpdateNote(noteId1, { title: '  ' });
      expect(r.status).not.toBe(200);
    });

    // ─── 2.C Duplicate names ─────────────────────────────
    test('2.11 create_category — duplicate name returns error', async () => {
      const c = await svc.noteCreateCategory('SvcTest DupCategory');
      expect(c.status).toBe(200);
      extraCatIds.push(c.data.category.id);

      const r = await svc.noteCreateCategory('SvcTest DupCategory');
      expect(r.status).not.toBe(200);

      // Case-insensitive
      const r2 = await svc.noteCreateCategory('svctest dupcategory');
      expect(r2.status).not.toBe(200);

      await svc.noteDeleteCategory(c.data.category.id);
    });

    test('2.12 create_note — duplicate title in same category returns error', async () => {
      const c = await svc.noteCreateNote(catId1, 'SvcTest DupTitle');
      expect(c.status).toBe(200);
      extraNoteIds.push(c.data.note.id);

      const r = await svc.noteCreateNote(catId1, 'SvcTest DupTitle');
      expect(r.status).not.toBe(200);

      // Case-insensitive
      const r2 = await svc.noteCreateNote(catId1, 'svctest duptitle');
      expect(r2.status).not.toBe(200);

      await svc.noteDeleteNote(c.data.note.id);
    });

    test('2.13 update_note — duplicate title (excluding self) returns error', async () => {
      // Create two notes
      const n1 = await svc.noteCreateNote(catId1, 'SvcTest TitleA');
      expect(n1.status).toBe(200);
      extraNoteIds.push(n1.data.note.id);

      const n2 = await svc.noteCreateNote(catId1, 'SvcTest TitleB');
      expect(n2.status).toBe(200);
      extraNoteIds.push(n2.data.note.id);

      // Try to rename n2 to n1's title
      const r = await svc.noteUpdateNote(n2.data.note.id, { title: 'SvcTest TitleA' });
      expect(r.status).not.toBe(200);

      await svc.noteDeleteNote(n1.data.note.id);
      await svc.noteDeleteNote(n2.data.note.id);
    });

    // ─── 2.D Length limits ────────────────────────────────
    test('2.14 create_category — max length name (100 chars) accepted', async () => {
      const name = 'SvcTest' + 'A'.repeat(93);
      expect(name.length).toBe(100);
      const r = await svc.noteCreateCategory(name);
      expect(r.status).toBe(200);
      extraCatIds.push(r.data.category.id);
      await svc.noteDeleteCategory(r.data.category.id);
    });

    test('2.15 create_category — over max length (101 chars) returns error', async () => {
      const name = 'SvcTest' + 'A'.repeat(94);
      expect(name.length).toBe(101);
      const r = await svc.noteCreateCategory(name);
      expect(r.status).not.toBe(200);
    });

    test('2.16 create_note — max title length (200 chars) accepted', async () => {
      const title = 'SvcTest' + 'B'.repeat(193);
      expect(title.length).toBe(200);
      const r = await svc.noteCreateNote(catId1, title);
      expect(r.status).toBe(200);
      extraNoteIds.push(r.data.note.id);
      await svc.noteDeleteNote(r.data.note.id);
    });

    test('2.17 create_note — over max title length (201 chars) returns error', async () => {
      const title = 'SvcTest' + 'B'.repeat(194);
      expect(title.length).toBe(201);
      const r = await svc.noteCreateNote(catId1, title);
      expect(r.status).not.toBe(200);
    });

    test('2.18 create_note — max content length (100000 chars) accepted', async () => {
      const content = 'C'.repeat(100000);
      const r = await svc.noteCreateNote(catId1, 'SvcTest MaxContent', { content });
      expect(r.status).toBe(200);
      expect(r.data.note.content.length).toBe(100000);
      extraNoteIds.push(r.data.note.id);
      await svc.noteDeleteNote(r.data.note.id);
    });

    test('2.19 create_note — over max content length (100001 chars) returns error', async () => {
      const content = 'C'.repeat(100001);
      const r = await svc.noteCreateNote(catId1, 'SvcTest OverContent', { content });
      expect(r.status).not.toBe(200);
    });

    // ─── 2.E Unicode & special characters ────────────────
    test('2.20 create_note — Unicode title and content preserved', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest ' + EDGE_CASES.UNICODE_TEXT, {
        content: EDGE_CASES.UNICODE_TEXT,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest ' + EDGE_CASES.UNICODE_TEXT);
      expect(r.data.note.content).toBe(EDGE_CASES.UNICODE_TEXT);
      await svc.noteDeleteNote(r.data.note.id);
    });

    test('2.21 create_note — emoji in title preserved', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest ' + EDGE_CASES.EMOJI_HEAVY);
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest ' + EDGE_CASES.EMOJI_HEAVY);
      await svc.noteDeleteNote(r.data.note.id);
    });

    // ─── 2.F Injection attempts ──────────────────────────
    test('2.22 create_note — HTML injection in content stored safely', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest HTMLInject', {
        content: EDGE_CASES.HTML_INJECTION,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe(EDGE_CASES.HTML_INJECTION);
      await svc.noteDeleteNote(r.data.note.id);
    });

    test('2.23 create_note — SQL injection in title stored safely', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest ' + EDGE_CASES.SQL_INJECTION);
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest ' + EDGE_CASES.SQL_INJECTION);
      await svc.noteDeleteNote(r.data.note.id);
    });

    test('2.24 create_note — XSS in content stored safely', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest XSSContent', {
        content: EDGE_CASES.IMG_XSS,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe(EDGE_CASES.IMG_XSS);
      await svc.noteDeleteNote(r.data.note.id);
    });

    test('2.25 create_note — markdown injection in content stored safely', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest MdInject', {
        content: EDGE_CASES.MARKDOWN_INJECTION,
      });
      expect(r.status).toBe(200);
      expect(r.data.note.content).toBe(EDGE_CASES.MARKDOWN_INJECTION);
      await svc.noteDeleteNote(r.data.note.id);
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

      await svc.noteDeleteNote(tempId);
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

      // Clean up
      const list = await svc.noteListNotes();
      const found = list.data.notes.find((n: any) => n.title === 'SvcTest FireAndForget');
      if (found) await svc.noteDeleteNote(found.id);
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

      await svc.noteDeleteCategory(tempCatId);
    });

    test('2.33 create_note — special chars in title', async () => {
      const r = await svc.noteCreateNote(catId1, 'SvcTest ' + EDGE_CASES.SPECIAL_CHARS);
      expect(r.status).toBe(200);
      expect(r.data.note.title).toBe('SvcTest ' + EDGE_CASES.SPECIAL_CHARS);
      await svc.noteDeleteNote(r.data.note.id);
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

      await svc.noteDeleteNote(tempId);
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

    test.afterAll(async () => {
      for (const id of [crossNoteId, wsNoteId]) {
        if (id) try { await svc.noteDeleteNote(id); } catch { /* ignore */ }
      }
      for (const id of [crossCatId, wsCatId]) {
        if (id) try { await svc.noteDeleteCategory(id); } catch { /* ignore */ }
      }
    });

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
  // Round 4: Browser UI Verification
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 4: Browser UI Verification', () => {
    test('4.1 ha_note_record services listed in Developer Tools', async ({ page }) => {
      await loginAndNavigate(page, 'developer-tools/service');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const content = await page.content();
      expect(content).toContain('ha_note_record');
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
      for (const note of r.data.notes) {
        if (note.title?.startsWith('SvcTest')) {
          const d = await svc.noteDeleteNote(note.id);
          expect(d.status).toBe(200);
        }
      }
    });

    test('5.2 delete all remaining test categories', async () => {
      const r = await svc.noteListCategories();
      expect(r.status).toBe(200);
      for (const cat of r.data.categories) {
        if (cat.name?.startsWith('SvcTest')) {
          const d = await svc.noteDeleteCategory(cat.id);
          expect(d.status).toBe(200);
        }
      }
    });

    test('5.3 list_notes — no test data remains', async () => {
      const r = await svc.noteListNotes();
      expect(r.status).toBe(200);
      const svcNotes = r.data.notes.filter((n: any) => n.title?.startsWith('SvcTest'));
      expect(svcNotes.length).toBe(0);
      const svcCats = r.data.categories.filter((c: any) => c.name?.startsWith('SvcTest'));
      expect(svcCats.length).toBe(0);
    });

    test('5.4 services still callable after cleanup', async () => {
      const r = await svc.noteListNotes();
      expect(r.status).toBe(200);
      expect(Array.isArray(r.data.notes)).toBe(true);
    });
  });
});
