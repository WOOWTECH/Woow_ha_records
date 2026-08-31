/**
 * E2E tests for the health Area's HA services (REST API).
 *
 * These tests exercise the 12 services registered via services.py,
 * called through the REST API endpoint:
 *   POST /api/services/woow_ha_records/health_<verb>?return_response
 *
 * Structure:
 *   Round 1 — Happy path: full CRUD lifecycle for members, record types, records
 *   Round 2 — Edge cases: invalid inputs, boundary values, injection attempts
 *   Round 3 — Cross-path consistency: data created via services visible via WS and vice versa
 *   Round 4 — Registration: services on the registry, and the panel loads
 *   Round 5 — Cleanup: delete the test Members, verify services persist
 *
 * Note: error paths call the service over WebSocket and assert the specific
 *   refusal reason (#51); over REST a ServiceValidationError is a bare 500.
 * Note: Retries are disabled because tests are sequential and stateful.
 * Note: no hook here may touch the suite's own data. Playwright discards the
 *   worker process after a failed test and starts a fresh one for the rest of
 *   the file, so beforeAll and afterAll run again mid-suite; a hook that
 *   deleted the test Members would take every later test down with it. The
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

let token: string;
let svc: HAServicesClient;
let ws: HAWebSocketClient;

const SVC_MEMBER = 'svc_test_member';
const SVC_MEMBER_2 = 'svc_test_member_2';
const SVC_MEMBER_EDGE = 'svc_edge_member';

// Every Member id this spec ever creates, named once so the sweep in 1.1 and
// the cleanup in Round 5 cannot drift from what the tests actually make. Ids
// are dependable here, unlike finance's derived Account ids: add_member takes
// the id from the caller.
const ALL_TEST_MEMBER_IDS = [SVC_MEMBER, SVC_MEMBER_2, SVC_MEMBER_EDGE];

/**
 * Query windows are computed at run time.
 *
 * Records logged without an explicit timestamp land at "now", so a hardcoded
 * calendar window stops matching them the moment that month passes — which is
 * what silently broke this suite (issue #9). Everything below derives from a
 * single instant captured when the file loads, so every window agrees.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * The whole-hour offset the suite renders its instants in. Presentation only —
 * every window below names an absolute instant, and the backend compares in
 * UTC, so any zone would match the same records. +08 keeps the wire format
 * this file already used.
 */
const TZ_OFFSET_HOURS = 8;
const TZ_OFFSET_MS = TZ_OFFSET_HOURS * 60 * 60 * 1000;

/** Render an instant as ISO 8601 in that offset, to the second. */
const isoWithOffset = (d: Date): string =>
  new Date(d.getTime() + TZ_OFFSET_MS)
    .toISOString()
    .replace(/\.\d{3}Z$/, `+${String(TZ_OFFSET_HOURS).padStart(2, '0')}:00`);

/** Midnight of the offset's calendar day containing `d`. */
const startOfOffsetDay = (d: Date): Date => {
  const shifted = new Date(d.getTime() + TZ_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - TZ_OFFSET_MS);
};

const RUN_AT = new Date();

/** The one record logged with an explicit timestamp — a day before the run. */
const BACKDATED_AT = new Date(RUN_AT.getTime() - DAY_MS);
const BACKDATED_NOTE = 'Yesterday record';
const BACKDATED_TS = isoWithOffset(BACKDATED_AT);
/** Its own calendar day, used to single that record out from the "now" ones. */
const BACKDATED_DAY_START = isoWithOffset(startOfOffsetDay(BACKDATED_AT));
const BACKDATED_DAY_END = isoWithOffset(
  new Date(startOfOffsetDay(BACKDATED_AT).getTime() + DAY_MS - 1000),
);

/** Wide enough for every record this run creates: backdated plus "now". */
const RANGE_START = isoWithOffset(new Date(RUN_AT.getTime() - 2 * DAY_MS));
const RANGE_END = isoWithOffset(new Date(RUN_AT.getTime() + DAY_MS));

/** Wait for config entry reload to complete */
const waitReload = (ms = 3000) => new Promise(r => setTimeout(r, ms));

/**
 * Delete a Member this spec knows exists, and assert it went.
 *
 * Every cleanup here goes through this rather than swallowing its result: a
 * delete that fails silently leaves a Member behind for the next run to trip
 * over, and nothing in this run says so. Test 2.5 asserts inline instead,
 * because there the delete is the contract under test rather than tidying up
 * after one.
 */
async function deleteMemberOk(memberId: string): Promise<void> {
  const r = await svc.deleteMember(memberId);
  expect(r.status, `deleting Member ${memberId}`).toBe(200);
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
  const r = await ws.callService(`health_${verb}`, data);
  expect(r.success, `expected ${verb} to be refused`).toBe(false);
  expect(r.error?.translation_key).toBe(translationKey);
}

test.describe('health Area Services E2E Tests', () => {
  test.beforeAll(async () => {
    // Prefer long-lived token from env; fall back to auth flow
    if (process.env.HA_TOKEN) {
      token = process.env.HA_TOKEN;
    } else {
      const tokens = await getHAToken();
      token = tokens.access_token;
    }
    svc = new HAServicesClient(token);
    ws = new HAWebSocketClient(token);
    await ws.connect();
    // Nothing is deleted here on purpose: this hook runs again whenever a test
    // fails and Playwright recycles the worker. Test 1.1 sweeps instead.
  });

  test.afterAll(async () => {
    // Nothing to clean up here on purpose, for the same reason: deleting the
    // test Members from this hook would break every test after the first
    // failure. Round 5 deletes what Rounds 1 and 2 created, and 1.1 sweeps up
    // after a run that died early.
    try { await ws.close(); } catch { /* ignore */ }
  });

  // ═══════════════════════════════════════════════════════════
  // Round 1: Happy Path — full CRUD lifecycle
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 1: Happy Path CRUD Lifecycle', () => {

    test('1.1 add_member — create test member (sweeps leftovers from a dead run)', async () => {
      // A run that died mid-file leaves this spec's Members behind. Delete them
      // here, asserting each one: they were just read back from the service, so
      // a failure is a real one, not a leftover that wasn't there.
      const before = await svc.getMembers();
      expect(before.status).toBe(200);
      const leftovers = before.data.members.filter((m: any) =>
        ALL_TEST_MEMBER_IDS.includes(m.id),
      );
      for (const member of leftovers) {
        await deleteMemberOk(member.id);
      }
      if (leftovers.length > 0) await waitReload(5000);

      // The slate the rest of the file is written against
      const clean = await svc.getMembers();
      expect(clean.status).toBe(200);
      expect(
        clean.data.members.filter((m: any) => ALL_TEST_MEMBER_IDS.includes(m.id)),
      ).toEqual([]);

      const r = await svc.addMember('Services Test Member', SVC_MEMBER, 'Created by e2e test');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.member_id).toBe(SVC_MEMBER);
      // No entry_id any more: a Member is a store record, not a config entry.
      await waitReload();
    });

    test('1.2 get_members — verify member exists', async () => {
      const r = await svc.getMembers();
      expect(r.status).toBe(200);
      const member = r.data.members.find((m: any) => m.id === SVC_MEMBER);
      expect(member).toBeTruthy();
      expect(member.name).toBe('Services Test Member');
      expect(member.note).toBe('Created by e2e test');
      expect(member.record_sets).toEqual([]);
    });

    test('1.3 update_member — change name and note', async () => {
      const r = await svc.updateMember(SVC_MEMBER, 'Updated Member Name', 'Updated note');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      await waitReload();

      const check = await svc.getMembers();
      const member = check.data.members.find((m: any) => m.id === SVC_MEMBER);
      expect(member.name).toBe('Updated Member Name');
      expect(member.note).toBe('Updated note');
    });

    test('1.4 add_record_type — add Weight type', async () => {
      const r = await svc.addRecordType(SVC_MEMBER, 'Weight', 'kg', 3.5, 'last_value');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.type_id).toBe('weight');
      await waitReload();
    });

    test('1.5 add_record_type — add Temperature type', async () => {
      const r = await svc.addRecordType(SVC_MEMBER, 'Temperature', '°C', 36.5, 'fixed');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      expect(r.data.type_id).toBe('temperature');
      await waitReload();
    });

    test('1.6 get_members — verify record types added', async () => {
      const r = await svc.getMembers();
      const member = r.data.members.find((m: any) => m.id === SVC_MEMBER);
      expect(member.record_sets.length).toBe(2);
      const types = member.record_sets.map((rs: any) => rs.type);
      expect(types).toContain('weight');
      expect(types).toContain('temperature');

      const weight = member.record_sets.find((rs: any) => rs.type === 'weight');
      expect(weight.name).toBe('Weight');
      expect(weight.unit).toBe('kg');
      expect(weight.default_value).toBe(3.5);
      expect(weight.default_value_mode).toBe('last_value');
    });

    test('1.7 update_record_type — rename Weight to Body Weight', async () => {
      const r = await svc.updateRecordType(SVC_MEMBER, 'weight', 'Body Weight', 'kg', {
        defaultValue: 4.0,
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      await waitReload();

      const check = await svc.getMembers();
      const member = check.data.members.find((m: any) => m.id === SVC_MEMBER);
      const weight = member.record_sets.find((rs: any) => rs.type === 'weight');
      expect(weight.name).toBe('Body Weight');
      expect(weight.default_value).toBe(4.0);
    });

    test('1.8 log_record — log weight record', async () => {
      const r = await svc.logRecord(SVC_MEMBER, 'weight', 4.2, 'Morning weigh-in');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
    });

    test('1.9 log_record — log with custom timestamp', async () => {
      const ts = BACKDATED_TS;
      const r = await svc.logRecord(SVC_MEMBER, 'weight', 4.1, BACKDATED_NOTE, ts);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
    });

    test('1.10 log_record — log temperature record', async () => {
      const r = await svc.logRecord(SVC_MEMBER, 'temperature', 36.8, 'Normal temp');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
    });

    test('1.11 get_records — query records in range', async () => {
      const r = await svc.getRecords(RANGE_START, RANGE_END);
      expect(r.status).toBe(200);

      const myRecords = r.data.records.filter((rec: any) => rec.member_id === SVC_MEMBER);
      expect(myRecords.length).toBeGreaterThanOrEqual(3);

      // Verify records are sorted by timestamp descending
      const timestamps = r.data.records.map((rec: any) => rec.timestamp);
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1] >= timestamps[i]).toBe(true);
      }

      // Verify record structure
      const rec = myRecords[0];
      expect(rec).toHaveProperty('member_id');
      expect(rec).toHaveProperty('member_name');
      expect(rec).toHaveProperty('record_type');
      expect(rec).toHaveProperty('record_name');
      expect(rec).toHaveProperty('value');
      expect(rec).toHaveProperty('unit');
      expect(rec).toHaveProperty('note');
      expect(rec).toHaveProperty('timestamp');
      expect(rec).toHaveProperty('id');
    });

    test('1.12 update_record — update value and note', async () => {
      // Get a record to update
      const records = await svc.getRecords(BACKDATED_DAY_START, BACKDATED_DAY_END);
      // Match the note too: the day window alone would also admit a "now"
      // record if the HA clock ran behind the test host's across midnight.
      const target = records.data.records.find(
        (rec: any) =>
          rec.record_type === 'weight' &&
          rec.member_id === SVC_MEMBER &&
          rec.note === BACKDATED_NOTE,
      );
      expect(target).toBeTruthy();

      const r = await svc.updateRecord(SVC_MEMBER, 'weight', target.timestamp, {
        value: 4.15,
        note: 'Corrected value',
        record_id: target.id,
      });
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
    });

    test('1.13 export_csv — export and verify CSV content', async () => {
      const r = await svc.exportCsv(SVC_MEMBER);
      expect(r.status).toBe(200);
      expect(r.data.csv_content).toBeTruthy();
      expect(r.data.member_name).toBeTruthy();
      expect(r.data.record_count).toBeGreaterThanOrEqual(3);

      // Verify CSV structure
      const lines = r.data.csv_content.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(4); // header + 3 records
      const header = lines[0];
      expect(header).toContain('timestamp');
      expect(header).toContain('record_type');
      expect(header).toContain('value');
      expect(header).toContain('unit');
      expect(header).toContain('note');
    });

    test('1.14 delete_record — delete temperature record by record_id', async () => {
      const records = await svc.getRecords(RANGE_START, RANGE_END);
      const target = records.data.records.find(
        (rec: any) => rec.record_type === 'temperature' && rec.member_id === SVC_MEMBER,
      );
      expect(target).toBeTruthy();

      const r = await svc.deleteRecord(SVC_MEMBER, 'temperature', target.timestamp, target.id);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);

      // Verify deletion
      const after = await svc.getRecords(RANGE_START, RANGE_END);
      const remaining = after.data.records.filter(
        (rec: any) => rec.record_type === 'temperature' && rec.member_id === SVC_MEMBER,
      );
      expect(remaining.length).toBe(0);
    });

    test('1.15 delete_record_type — remove temperature type', async () => {
      const r = await svc.deleteRecordType(SVC_MEMBER, 'temperature');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      await waitReload();

      const check = await svc.getMembers();
      const member = check.data.members.find((m: any) => m.id === SVC_MEMBER);
      const types = member.record_sets.map((rs: any) => rs.type);
      expect(types).not.toContain('temperature');
      expect(types).toContain('weight');
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

    // ─── 2.1 Nonexistent members ─────────────────────────
    test('2.1 get_records — empty time range returns empty array', async () => {
      const r = await svc.getRecords('1970-01-01T00:00:00+00:00', '1970-01-02T00:00:00+00:00');
      expect(r.status).toBe(200);
      expect(r.data.records).toEqual([]);
    });

    test('2.2 log_record — nonexistent member refused with member_not_found', async () => {
      await expectRefused(
        'log_record',
        { member_id: 'nonexistent_member_xyz', record_type: 'weight', value: 1.0 },
        'health.member_not_found',
      );
    });

    test('2.3 export_csv — nonexistent member refused with member_not_found', async () => {
      await expectRefused(
        'export_csv',
        { member_id: 'nonexistent_member_xyz' },
        'health.member_not_found',
      );
    });

    test('2.4 update_member — nonexistent member refused with member_not_found', async () => {
      await expectRefused(
        'update_member',
        { member_id: 'nonexistent_member_xyz', name: 'New Name' },
        'health.member_not_found',
      );
    });

    test('2.5 delete_member — nonexistent member refused with member_not_found', async () => {
      await expectRefused(
        'delete_member',
        { member_id: 'nonexistent_member_xyz' },
        'health.member_not_found',
      );
    });

    // ─── 2.2 Nonexistent record types ────────────────────
    test('2.6 log_record — nonexistent record type refused with record_type_not_found', async () => {
      await expectRefused(
        'log_record',
        { member_id: SVC_MEMBER, record_type: 'nonexistent_type_xyz', value: 1.0 },
        'health.record_type_not_found',
      );
    });

    test('2.7 delete_record_type — nonexistent type refused with type_not_found', async () => {
      await expectRefused(
        'delete_record_type',
        { member_id: SVC_MEMBER, type_id: 'nonexistent_type_xyz' },
        'health.type_not_found',
      );
    });

    test('2.8 update_record_type — nonexistent type refused with type_not_found', async () => {
      await expectRefused(
        'update_record_type',
        { member_id: SVC_MEMBER, type_id: 'nonexistent_type_xyz', name: 'Name', unit: 'unit' },
        'health.type_not_found',
      );
    });

    // ─── 2.3 Duplicate prevention ────────────────────────
    test('2.9 add_member — duplicate member_id refused with member_exists', async () => {
      await expectRefused(
        'add_member',
        { name: 'Duplicate Test', member_id: SVC_MEMBER },
        'health.member_exists',
      );
    });

    test('2.10 add_record_type — duplicate type refused with type_exists', async () => {
      // "Weight" sanitizes to type_id "weight" which already exists
      await expectRefused(
        'add_record_type',
        { member_id: SVC_MEMBER, name: 'Weight', unit: 'kg' },
        'health.type_exists',
      );
    });

    // ─── 2.4 Invalid datetime ────────────────────────────
    test('2.11 log_record — invalid timestamp format refused with invalid_datetime', async () => {
      await expectRefused(
        'log_record',
        { member_id: SVC_MEMBER, record_type: 'weight', value: 4.0, timestamp: 'not-a-date' },
        'health.invalid_datetime',
      );
    });

    test('2.12 get_records — invalid start_time refused with invalid_datetime', async () => {
      await expectRefused(
        'get_records',
        { start_time: 'invalid-date', end_time: RANGE_END },
        'health.invalid_datetime',
      );
    });

    // ─── 2.5 Boundary values ─────────────────────────────
    test('2.13 log_record — zero value accepted', async () => {
      const r = await svc.logRecord(SVC_MEMBER, 'weight', 0, 'Zero value test');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
    });

    test('2.14 log_record — negative value accepted', async () => {
      const r = await svc.logRecord(SVC_MEMBER, 'weight', -1, 'Negative value test');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
    });

    test('2.15 log_record — very large number accepted', async () => {
      const r = await svc.logRecord(SVC_MEMBER, 'weight', 9999999999, 'Large number test');
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
    });

    // ─── 2.6 Unicode & special characters ────────────────
    test('2.16 add_member — Unicode name with emoji', async () => {
      const r = await svc.addMember('寶寶 👶 Test', SVC_MEMBER_EDGE, EDGE_CASES.UNICODE_TEXT);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      await waitReload();

      const check = await svc.getMembers();
      const member = check.data.members.find((m: any) => m.id === SVC_MEMBER_EDGE);
      expect(member).toBeTruthy();
      expect(member.name).toBe('寶寶 👶 Test');
      expect(member.note).toBe(EDGE_CASES.UNICODE_TEXT);
    });

    test('2.17 log_record — note with special characters', async () => {
      const r = await svc.logRecord(SVC_MEMBER, 'weight', 4.5, EDGE_CASES.SPECIAL_CHARS);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
    });

    // ─── 2.7 Injection attempts ──────────────────────────
    test('2.18 log_record — HTML injection in note (stored safely)', async () => {
      const r = await svc.logRecord(SVC_MEMBER, 'weight', 4.6, EDGE_CASES.HTML_INJECTION);
      expect(r.status).toBe(200);

      // Verify the note is stored as-is (not executed)
      const records = await svc.getRecords(RANGE_START, RANGE_END);
      const injected = records.data.records.find(
        (rec: any) => rec.note === EDGE_CASES.HTML_INJECTION && rec.member_id === SVC_MEMBER,
      );
      expect(injected).toBeTruthy();
      expect(injected.note).toBe(EDGE_CASES.HTML_INJECTION);
    });

    test('2.19 log_record — SQL injection in note (stored safely)', async () => {
      const r = await svc.logRecord(SVC_MEMBER, 'weight', 4.7, EDGE_CASES.SQL_INJECTION);
      expect(r.status).toBe(200);
    });

    test('2.20 add_member — XSS in name (stored safely)', async () => {
      const r = await svc.addMember(EDGE_CASES.IMG_XSS, SVC_MEMBER_2);
      expect(r.status).toBe(200);
      expect(r.data.success).toBe(true);
      await waitReload();

      const check = await svc.getMembers();
      const member = check.data.members.find((m: any) => m.id === SVC_MEMBER_2);
      expect(member.name).toBe(EDGE_CASES.IMG_XSS);
    });

    // ─── 2.8 Record not found ────────────────────────────
    test('2.21 update_record — nonexistent record refused with record_not_found', async () => {
      await expectRefused(
        'update_record',
        {
          member_id: SVC_MEMBER,
          type_id: 'weight',
          timestamp: '1970-01-01T00:00:00+00:00',
          value: 999,
        },
        'health.record_not_found',
      );
    });

    test('2.22 delete_record — nonexistent record refused with record_not_found', async () => {
      await expectRefused(
        'delete_record',
        {
          member_id: SVC_MEMBER,
          type_id: 'weight',
          timestamp: '1970-01-01T00:00:00+00:00',
        },
        'health.record_not_found',
      );
    });

    // ─── 2.9 Response mode behavior ─────────────────────
    test('2.23 get_members without return_response — returns error (ONLY mode)', async () => {
      const r = await svc.call('get_members', {}, { returnResponse: false });
      expect(r.status).toBe(400);
    });

    test('2.24 log_record without return_response — works (fire-and-forget)', async () => {
      const r = await svc.call('log_record', {
        member_id: SVC_MEMBER,
        record_type: 'weight',
        value: 5.0,
        note: 'Fire-and-forget test',
      }, { returnResponse: false });
      // SupportsResponse.OPTIONAL should succeed without return_response
      expect(r.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 3: Cross-Path Consistency (Services ↔ WebSocket)
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 3: Cross-Path Consistency', () => {

    test('3.1 Data created via services visible via WebSocket', async () => {
      // Reconnect WS in case previous reloads disrupted it
      try { await ws.close(); } catch { /* ignore */ }
      ws = new HAWebSocketClient(token);
      await ws.connect();

      const result = await ws.healthGetMembers();
      const member = result.members.find((m: any) => m.id === SVC_MEMBER);
      expect(member).toBeTruthy();
      expect(member.name).toBe('Updated Member Name');
    });

    test('3.2 Records logged via services visible via WebSocket', async () => {
      const result = await ws.healthGetRecords(RANGE_START, RANGE_END);
      const svcRecords = result.records.filter(
        (r: any) => r.member_id === SVC_MEMBER && r.record_type === 'weight',
      );
      // We logged multiple weight records in rounds 1 & 2
      expect(svcRecords.length).toBeGreaterThanOrEqual(3);
    });

    test('3.3 Data created via WebSocket visible via services', async () => {
      // Log a record via WS
      await ws.healthLogRecord(SVC_MEMBER, 'weight', 5.5, 'Logged via WS');

      // Query via services REST API
      const r = await svc.getRecords(RANGE_START, RANGE_END);
      const wsRecord = r.data.records.find(
        (rec: any) => rec.note === 'Logged via WS' && rec.member_id === SVC_MEMBER,
      );
      expect(wsRecord).toBeTruthy();
      expect(wsRecord.value).toBe(5.5);
    });

    test('3.4 CSV export reflects both service and WS records', async () => {
      const r = await svc.exportCsv(SVC_MEMBER);
      expect(r.status).toBe(200);
      expect(r.data.csv_content).toContain('Logged via WS');
      expect(r.data.csv_content).toContain('Fire-and-forget test');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 4: Service registration & panel load
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 4: Service Registration & Panel Load', () => {

    test('4.1 health services registered under the integration domain', async () => {
      const registered = await listRegisteredServices(token);
      expect(registered).toEqual(expect.arrayContaining([
        'health_get_members',
        'health_get_records',
        'health_export_csv',
        'health_log_record',
        'health_update_record',
        'health_delete_record',
        'health_add_record_type',
        'health_update_record_type',
        'health_delete_record_type',
        'health_add_member',
        'health_update_member',
        'health_delete_member',
      ]));
    });

    test('4.2 Health record panel loads correctly', async ({ page }) => {
      await loginAndNavigate(page, 'ha-health-record');
      await page.waitForTimeout(5000);

      const content = await page.content();
      expect(content.length).toBeGreaterThan(1000);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Round 5: Cleanup — delete the Members this spec created
  //
  // Tests rather than an afterAll, for the reason at the top of the file: an
  // afterAll re-runs mid-suite whenever a failure recycles the worker.
  // ═══════════════════════════════════════════════════════════
  test.describe('Round 5: Cleanup & Final Verification', () => {

    test('5.1 delete_member — remove every Member this spec created', async () => {
      const r = await svc.getMembers();
      expect(r.status).toBe(200);
      // Delete what is actually there rather than asserting a count first: if
      // the test that creates one of these Members is the one that failed, a
      // count assertion here would fail too, and #20 exists to stop one failure
      // becoming two. 5.2 is what proves the cleanup was complete.
      const mine = r.data.members.filter((m: any) =>
        ALL_TEST_MEMBER_IDS.includes(m.id),
      );

      for (const member of mine) {
        await deleteMemberOk(member.id);
      }
      await waitReload(5000);
    });

    test('5.2 get_members — no test Members remain', async () => {
      const r = await svc.getMembers();
      expect(r.status).toBe(200);
      const remaining = r.data.members.filter((m: any) =>
        ALL_TEST_MEMBER_IDS.includes(m.id),
      );
      expect(remaining).toEqual([]);
    });

    test('5.3 services still callable after cleanup', async () => {
      const r = await svc.getMembers();
      expect(r.status).toBe(200);
      expect(r.data.members).toBeInstanceOf(Array);
    });
  });
});
