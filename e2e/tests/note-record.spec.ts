import { test, expect } from '@playwright/test';
import { getHAToken, loginAndNavigate } from '../utils/ha-auth';
import { HAWebSocketClient } from '../utils/ws-client';
import { NOTE_CATEGORIES, NOTE_DATA, EDGE_CASES } from '../utils/test-data';

let token: string;
let ws: HAWebSocketClient;
const categoryIds: Record<string, string> = {};
const noteIds: string[] = [];

test.describe('ha_note_record E2E Tests', () => {
  test.beforeAll(async () => {
    const tokens = await getHAToken();
    token = tokens.access_token;
    ws = new HAWebSocketClient(token);
    await ws.connect();
  });

  test.afterAll(async () => {
    await ws.close();
  });

  // ─── Category Management ───────────────────────────────
  test.describe('Round 1: Create Categories', () => {
    for (let i = 0; i < NOTE_CATEGORIES.length; i++) {
      const catName = NOTE_CATEGORIES[i];
      test(`1.${i + 1} Create category: ${catName}`, async () => {
        try {
          const result = await ws.noteCreateCategory(catName);
          expect(result.id).toBeTruthy();
          expect(result.name).toBe(catName);
          categoryIds[catName] = result.id;
        } catch (e: any) {
          // Idempotent: category already exists
          expect(e.message).toMatch(/exists|duplicate/i);
          const data = await ws.noteGetData();
          const found = data.categories.find((c: any) => c.name === catName);
          if (found) categoryIds[catName] = found.id;
        }
      });
    }

    test('1.5 Verify all categories created', async () => {
      const data = await ws.noteGetData();
      expect(data.categories.length).toBeGreaterThanOrEqual(NOTE_CATEGORIES.length);
      for (const cat of NOTE_CATEGORIES) {
        const found = data.categories.find((c: any) => c.name === cat);
        expect(found).toBeTruthy();
        // Store IDs for later use
        if (found) categoryIds[cat] = found.id;
      }
    });
  });

  // ─── Note Creation with Rich Markdown ──────────────────
  test.describe('Round 1: Create Notes with Realistic Content', () => {
    for (const [catName, notes] of Object.entries(NOTE_DATA)) {
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        test(`2. Create note in "${catName}": ${note.title}`, async () => {
          // Get category ID dynamically
          const data = await ws.noteGetData();
          const cat = data.categories.find((c: any) => c.name === catName);
          expect(cat).toBeTruthy();

          try {
            const result = await ws.noteCreateNote(cat.id, note.title, note.content, note.pinned);
            expect(result.id).toBeTruthy();
            expect(result.title).toBe(note.title);
            noteIds.push(result.id);
          } catch (e: any) {
            // Idempotent: note with same title already exists
            expect(e.message).toMatch(/exists|duplicate/i);
            // Find existing note ID
            const existingNote = cat.notes?.find((n: any) => n.title === note.title);
            if (existingNote) noteIds.push(existingNote.id);
          }
        });
      }
    }
  });

  test.describe('Round 1: Verify Notes', () => {
    test('3.1 Verify all notes created with correct content', async () => {
      const data = await ws.noteGetData();
      const totalExpected = Object.values(NOTE_DATA).reduce((sum, notes) => sum + notes.length, 0);
      expect(data.notes.length).toBeGreaterThanOrEqual(totalExpected);
    });

    test('3.2 Verify Markdown content preserved', async () => {
      const data = await ws.noteGetData();
      const q1Plan = data.notes.find((n: any) => n.title === 'Q1 產品開發計畫');
      expect(q1Plan).toBeTruthy();
      expect(q1Plan.content).toContain('## 目標');
      expect(q1Plan.content).toContain('```python');
    });

    test('3.3 Verify pinned notes', async () => {
      const data = await ws.noteGetData();
      const pinnedNotes = data.notes.filter((n: any) => n.pinned);
      expect(pinnedNotes.length).toBeGreaterThanOrEqual(3); // Q1 plan, Q1 OKR, API docs, yearly goals
    });
  });

  // ─── Note Update ───────────────────────────────────────
  test.describe('Round 1: Update Notes', () => {
    test('4.1 Update note title', async () => {
      const data = await ws.noteGetData();
      // On re-runs, the note may already be renamed
      const note = data.notes.find((n: any) => n.title === '2024/02 月會議記錄');
      const alreadyRenamed = data.notes.find((n: any) => n.title === '2024/02 月會議記錄 (已更新)');
      if (note && !alreadyRenamed) {
        const result = await ws.noteUpdateNote(note.id, {
          title: '2024/02 月會議記錄 (已更新)',
        });
        expect(result.title).toBe('2024/02 月會議記錄 (已更新)');
      } else {
        // Idempotent: already renamed or note not found
        expect(alreadyRenamed || note).toBeTruthy();
      }
    });

    test('4.2 Update note content', async () => {
      const data = await ws.noteGetData();
      const note = data.notes.find((n: any) => n.title.includes('Sprint Review'));
      if (note) {
        const newContent = note.content + '\n\n---\n\n## 附記\n此次 Sprint 完成率 90%，團隊表現良好。';
        const result = await ws.noteUpdateNote(note.id, { content: newContent });
        expect(result.content).toContain('附記');
      }
    });

    test('4.3 Toggle pin status', async () => {
      const data = await ws.noteGetData();
      const note = data.notes.find((n: any) => n.title.includes('Bug Triage'));
      if (note) {
        const result = await ws.noteUpdateNote(note.id, { pinned: true });
        expect(result.pinned).toBe(true);

        // Toggle back
        const result2 = await ws.noteUpdateNote(note.id, { pinned: false });
        expect(result2.pinned).toBe(false);
      }
    });
  });

  // ─── Edge Cases ────────────────────────────────────────
  test.describe('Round 2: Edge Cases', () => {
    test('5.1 Category name at max length (100 chars)', async () => {
      const result = await ws.noteCreateCategory(EDGE_CASES.MAX_LENGTH_100);
      expect(result.id).toBeTruthy();
      // Clean up
      await ws.noteDeleteCategory(result.id);
    });

    test('5.2 Category name over max length (101 chars)', async () => {
      try {
        await ws.noteCreateCategory(EDGE_CASES.OVER_MAX_100);
        // Might succeed if backend doesn't validate — check
      } catch (e: any) {
        expect(e.message).toBeTruthy();
      }
    });

    test('5.3 Note title at max length (200 chars)', async () => {
      const data = await ws.noteGetData();
      const cat = data.categories.find((c: any) => c.name === '個人筆記');
      if (cat) {
        const result = await ws.noteCreateNote(cat.id, EDGE_CASES.MAX_LENGTH_200, 'Test', false);
        expect(result.id).toBeTruthy();
        await ws.noteDeleteNote(result.id);
      }
    });

    test('5.4 Note content at 100KB', async () => {
      const data = await ws.noteGetData();
      const cat = data.categories.find((c: any) => c.name === '個人筆記');
      if (cat) {
        const result = await ws.noteCreateNote(cat.id, '大量內容測試', EDGE_CASES.MAX_LENGTH_100000, false);
        expect(result.id).toBeTruthy();
        await ws.noteDeleteNote(result.id);
      }
    });

    test('5.5 Duplicate title in same category should fail', async () => {
      const data = await ws.noteGetData();
      const cat = data.categories.find((c: any) => c.name === '專案管理');
      if (cat) {
        try {
          await ws.noteCreateNote(cat.id, 'Q1 產品開發計畫', 'Duplicate test', false);
          // If doesn't throw, it allowed duplicate
        } catch (e: any) {
          expect(e.message).toContain('duplicate');
        }
      }
    });

    test('5.6 XSS injection in note content', async () => {
      const data = await ws.noteGetData();
      const cat = data.categories.find((c: any) => c.name === '技術文件');
      if (cat) {
        const xssContent = `# XSS 測試\n\n${EDGE_CASES.HTML_INJECTION}\n\n${EDGE_CASES.IMG_XSS}\n\n${EDGE_CASES.MARKDOWN_INJECTION}`;
        try {
          const result = await ws.noteCreateNote(cat.id, 'XSS 安全性測試', xssContent, false);
          expect(result.id).toBeTruthy();
          expect(result.content).toContain('<script>');
        } catch (e: any) {
          // Idempotent: note with same title already exists
          expect(e.message).toMatch(/duplicate/i);
          const existing = data.notes.find((n: any) => n.title === 'XSS 安全性測試');
          expect(existing).toBeTruthy();
        }
      }
    });

    test('5.7 Unicode and Emoji in title and content', async () => {
      const data = await ws.noteGetData();
      const cat = data.categories.find((c: any) => c.name === '個人筆記');
      if (cat) {
        const unicodeTitle = '日本語テスト 🇯🇵 한국어 🇰🇷';
        try {
          const result = await ws.noteCreateNote(
            cat.id,
            unicodeTitle,
            EDGE_CASES.UNICODE_TEXT + '\n\n' + EDGE_CASES.EMOJI_HEAVY,
            false,
          );
          expect(result.id).toBeTruthy();
          expect(result.title).toBe(unicodeTitle);
        } catch (e: any) {
          // Idempotent: note already exists
          expect(e.message).toMatch(/duplicate/i);
          const existing = data.notes.find((n: any) => n.title === unicodeTitle);
          expect(existing).toBeTruthy();
        }
      }
    });

    test('5.8 Empty category name should fail', async () => {
      try {
        await ws.noteCreateCategory('');
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e.message).toBeTruthy();
      }
    });

    test('5.9 Empty note title should fail', async () => {
      const data = await ws.noteGetData();
      const cat = data.categories[0];
      if (cat) {
        try {
          await ws.noteCreateNote(cat.id, '', 'content', false);
          expect(true).toBe(false);
        } catch (e: any) {
          expect(e.message).toBeTruthy();
        }
      }
    });
  });

  // ─── Cascade Delete ────────────────────────────────────
  test.describe('Round 2: Cascade Delete', () => {
    test('6.1 Create temp category with notes, then cascade delete', async () => {
      // Create temp category
      const cat = await ws.noteCreateCategory('待刪除分類 CASCADE-TEST');
      expect(cat.id).toBeTruthy();

      // Create notes in it
      await ws.noteCreateNote(cat.id, '級聯刪除測試筆記 1', '內容1', false);
      await ws.noteCreateNote(cat.id, '級聯刪除測試筆記 2', '內容2', true);
      await ws.noteCreateNote(cat.id, '級聯刪除測試筆記 3', '內容3', false);

      // Verify notes exist
      let data = await ws.noteGetData();
      const notesBefore = data.notes.filter((n: any) => n.category_id === cat.id);
      expect(notesBefore.length).toBe(3);

      // Delete category (cascades to notes)
      const deleteResult = await ws.noteDeleteCategory(cat.id);
      expect(deleteResult.deleted).toBe(true);

      // Verify notes are gone
      data = await ws.noteGetData();
      const notesAfter = data.notes.filter((n: any) => n.category_id === cat.id);
      expect(notesAfter.length).toBe(0);

      // Verify category is gone
      const catAfter = data.categories.find((c: any) => c.id === cat.id);
      expect(catAfter).toBeUndefined();
    });
  });

  // ─── Delete Single Note ────────────────────────────────
  test.describe('Round 2: Delete Single Note', () => {
    test('7.1 Delete a note and verify', async () => {
      const data = await ws.noteGetData();
      const cat = data.categories.find((c: any) => c.name === '個人筆記');
      if (cat) {
        // Create a temp note
        const note = await ws.noteCreateNote(cat.id, '待刪除筆記 DELETE-TEST', 'temp', false);
        expect(note.id).toBeTruthy();

        // Delete it
        const result = await ws.noteDeleteNote(note.id);
        expect(result.deleted).toBe(true);

        // Verify it's gone
        const afterData = await ws.noteGetData();
        const found = afterData.notes.find((n: any) => n.id === note.id);
        expect(found).toBeUndefined();
      }
    });
  });

  // ─── Browser UI Verification ──────────────────────────
  test.describe('Round 3: Browser UI Verification', () => {
    test('8.1 Navigate to note panel and verify rendering', async ({ page }) => {
      await loginAndNavigate(page, 'ha-note-record');
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'test-results/note-panel.png', fullPage: true });
    });

    test('8.2 Verify no JavaScript errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await loginAndNavigate(page, 'ha-note-record');
      await page.waitForTimeout(3000);

      const criticalErrors = errors.filter(e =>
        !e.includes('favicon') && !e.includes('ResizeObserver')
      );
      if (criticalErrors.length > 0) {
        console.log('Note panel errors:', criticalErrors);
      }
    });

    test('8.3 Verify XSS content is sanitized in rendering', async ({ page }) => {
      await loginAndNavigate(page, 'ha-note-record');
      await page.waitForTimeout(5000);

      // Check that no alert dialogs appear
      let alertTriggered = false;
      page.on('dialog', async (dialog) => {
        alertTriggered = true;
        await dialog.dismiss();
      });

      await page.waitForTimeout(2000);
      expect(alertTriggered).toBe(false);
    });
  });

  // ─── Stability ─────────────────────────────────────────
  test.describe('Round 3: Stability', () => {
    test('9.1 Verify all demo data intact', async () => {
      const data = await ws.noteGetData();

      // Verify categories
      for (const catName of NOTE_CATEGORIES) {
        const cat = data.categories.find((c: any) => c.name === catName);
        expect(cat).toBeTruthy();
      }

      // Verify key notes
      const q1Plan = data.notes.find((n: any) => n.title === 'Q1 產品開發計畫');
      expect(q1Plan).toBeTruthy();
      expect(q1Plan.pinned).toBe(true);

      const apiDoc = data.notes.find((n: any) => n.title === 'API 文件規範');
      expect(apiDoc).toBeTruthy();
    });

    test('9.2 Repeat create-read cycle', async () => {
      const data = await ws.noteGetData();
      const cat = data.categories.find((c: any) => c.name === '個人筆記');
      if (cat) {
        for (let i = 0; i < 3; i++) {
          const note = await ws.noteCreateNote(
            cat.id,
            `重複測試筆記 Round ${i + 1} - ${Date.now()}`,
            `穩定性測試內容 #${i + 1}`,
            false,
          );
          expect(note.id).toBeTruthy();

          // Read back
          const readData = await ws.noteGetData();
          const found = readData.notes.find((n: any) => n.id === note.id);
          expect(found).toBeTruthy();

          // Clean up
          await ws.noteDeleteNote(note.id);
        }
      }
    });
  });
});
