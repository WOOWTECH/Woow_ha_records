/**
 * The one-time cleanup ADR-0003 asks a user to do after upgrading.
 *
 * The note unique_id lost its category, so every note entity registered before
 * the upgrade is orphaned: HA created a fresh entry under the new shape and
 * left the old one behind as unavailable. The README tells a user to delete
 * these once through Settings -> Devices & Services -> Entities. This is the
 * same deletion, driven over the WebSocket registry API so it can be verified.
 *
 *   node cleanup-43-orphans.mjs           # report only
 *   node cleanup-43-orphans.mjs --apply   # actually remove them
 *
 * Only entries that are BOTH this integration's AND of the pre-#43 shape are
 * touched: unique_id `note_<category uuid>_<note uuid>_<suffix>`, which carries
 * eight hyphens against the new shape's four.
 */
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const BASE = process.env.HA_BASE_URL || 'http://192.168.2.6:8123';
const APPLY = process.argv.includes('--apply');
const TOKEN =
  process.env.HA_TOKEN ||
  readFileSync(new URL('./.env', import.meta.url), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('HA_TOKEN='))
    ?.split('=')
    .slice(1)
    .join('=')
    .trim();

const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/api/websocket`);
let id = 0;
const pending = new Map();
const send = (payload) =>
  new Promise((resolve) => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, ...payload }));
  });

const ready = new Promise((resolve, reject) => {
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === 'auth_required')
      return ws.send(JSON.stringify({ type: 'auth', access_token: TOKEN }));
    if (m.type === 'auth_ok') return resolve();
    if (m.type === 'auth_invalid') return reject(new Error('auth failed'));
    const waiter = pending.get(m.id);
    if (waiter) {
      pending.delete(m.id);
      waiter(m);
    }
  });
  ws.on('error', reject);
});

await ready;

const registry = (await send({ type: 'config/entity_registry/list' })).result;
const notes = (await send({ type: 'woow_ha_records/note/get_data' })).result;
const liveNoteIds = new Set(notes.notes.map((n) => n.id));

const mine = registry.filter(
  (e) => e.platform === 'woow_ha_records' && (e.unique_id || '').startsWith('note_'),
);
const isOldShape = (uid) => (uid.match(/-/g) || []).length > 4;
const orphans = mine.filter((e) => isOldShape(e.unique_id));
const current = mine.filter((e) => !isOldShape(e.unique_id));

console.log(`note entities registered : ${mine.length}`);
console.log(`  current shape          : ${current.length}`);
console.log(`  pre-#43 shape (orphans): ${orphans.length}`);
console.log(`notes in the store       : ${liveNoteIds.size} (expect ${liveNoteIds.size * 2} current entities)`);

// A current-shape entry whose note is gone would be a #65 orphan, i.e. a
// cleanup that did not run. There should be none.
const stillOrphaned = current.filter((e) => !liveNoteIds.has(e.unique_id.split('_')[1]));
console.log(`current-shape entries with no note: ${stillOrphaned.length}`);

if (!APPLY) {
  console.log('\n(report only — pass --apply to remove the orphans)');
  ws.close();
  process.exit(0);
}

console.log(`\nremoving ${orphans.length} orphaned entries...`);
let removed = 0;
let failed = 0;
for (const entry of orphans) {
  const r = await send({
    type: 'config/entity_registry/remove',
    entity_id: entry.entity_id,
  });
  if (r.success) removed++;
  else {
    failed++;
    if (failed <= 3) console.log(`  could not remove ${entry.entity_id}: ${r.error?.message}`);
  }
}
console.log(`removed ${removed}, failed ${failed}`);

const after = (await send({ type: 'config/entity_registry/list' })).result.filter(
  (e) => e.platform === 'woow_ha_records' && (e.unique_id || '').startsWith('note_'),
);
console.log(`\nnote entities remaining  : ${after.length}`);
console.log(`  of pre-#43 shape       : ${after.filter((e) => isOldShape(e.unique_id)).length}`);

ws.close();
