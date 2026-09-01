/**
 * WebSocket client for direct HA API testing.
 * Maintains a persistent connection and supports sequential commands.
 */

const HA_BASE = process.env.HA_BASE_URL || 'http://localhost:18125';

/** The integration domain `callService` calls into. */
const INTEGRATION_DOMAIN = 'woow_ha_records';

/** The `error` object HA puts on a failed WebSocket command frame. */
export interface ServiceCallError {
  code: string;
  message: string;
  translation_key?: string;
  translation_domain?: string;
  translation_placeholders?: Record<string, string>;
}

/** Outcome of a service call made over the WebSocket `call_service` command. */
export interface ServiceCallOutcome {
  /** True when HA accepted and ran the call. */
  success: boolean;
  /** The service's response payload, when the call succeeded with a response. */
  response?: any;
  /** The refusal, when the call failed. */
  error?: ServiceCallError;
}

export class HAWebSocketClient {
  private ws: any = null;
  private msgId = 0;
  private pending = new Map<number, { resolve: Function; reject: Function }>();
  private token: string;
  private connected = false;
  private authPromise: Promise<void> | null = null;

  constructor(token: string) {
    this.token = token;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    const wsUrl = HA_BASE.replace('http', 'ws') + '/api/websocket';
    const { default: WebSocket } = await import('ws');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WS connect timeout')), 15_000);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('message', (data: any) => {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'auth_required') {
          this.ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
          return;
        }

        if (msg.type === 'auth_ok') {
          this.connected = true;
          clearTimeout(timeout);
          resolve();
          return;
        }

        if (msg.type === 'auth_invalid') {
          clearTimeout(timeout);
          reject(new Error(`Auth invalid: ${msg.message}`));
          return;
        }

        // Handle response to a command — resolve with the whole frame;
        // sendCommand decides whether a failure frame is a thrown error.
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          res(msg);
        }
      });

      this.ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on('close', () => {
        this.connected = false;
      });
    });
  }

  /** Send a WebSocket command and wait for the full response frame. */
  private async sendRaw(command: Record<string, any>): Promise<any> {
    if (!this.connected) await this.connect();

    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command timeout: ${command.type}`));
      }, 30_000);

      this.pending.set(id, {
        resolve: (frame: any) => {
          clearTimeout(timeout);
          resolve(frame);
        },
        reject: (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify({ id, ...command }));
    });
  }

  /** Send a WebSocket command and wait for its result; throw on failure. */
  async sendCommand(command: Record<string, any>): Promise<any> {
    const frame = await this.sendRaw(command);
    if (frame.success === false) {
      throw new Error(`WS error: ${JSON.stringify(frame.error)}`);
    }
    return frame.result;
  }

  /**
   * Call one of the integration's services through Home Assistant's
   * WebSocket `call_service` command.
   *
   * This is the path the error-path e2e tests use (#51): HA core's REST
   * handler collapses every ServiceValidationError into a bare HTTP 500 with
   * the reason only in the log (home-assistant/core#121219), while this error
   * frame preserves the message and the raise site's translation key. A
   * refusal resolves (with `success: false` and the `error`) rather than
   * throwing, so tests can assert on the reason.
   *
   * @param service  Full service name, e.g. "note_delete_category"
   * @param serviceData  Service call payload
   * @param opts  returnResponse defaults to true; every service in this
   *   integration is ONLY or OPTIONAL, so requesting a response is always valid
   */
  async callService(
    service: string,
    serviceData: Record<string, any> = {},
    opts: { returnResponse?: boolean } = {},
  ): Promise<ServiceCallOutcome> {
    const frame = await this.sendRaw({
      type: 'call_service',
      domain: INTEGRATION_DOMAIN,
      service,
      service_data: serviceData,
      ...(opts.returnResponse !== false ? { return_response: true } : {}),
    });

    if (frame.success === false) {
      return { success: false, error: frame.error };
    }
    return { success: true, response: frame.result?.response };
  }

  /** Close connection */
  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  // ─── Health Record Helpers ──────────────────────────────────

  async healthGetMembers() {
    return this.sendCommand({ type: 'woow_ha_records/health/get_members' });
  }

  async healthAddMember(name: string, memberId?: string, note = '') {
    return this.sendCommand({
      type: 'woow_ha_records/health/add_member',
      name,
      ...(memberId ? { member_id: memberId } : {}),
      note,
    });
  }

  async healthUpdateMember(memberId: string, name: string, note = '') {
    return this.sendCommand({
      type: 'woow_ha_records/health/update_member',
      member_id: memberId,
      name,
      note,
    });
  }

  async healthAddRecordType(
    memberId: string,
    name: string,
    unit: string,
    defaultValue = 0,
    defaultValueMode: 'fixed' | 'last_value' = 'fixed',
  ) {
    return this.sendCommand({
      type: 'woow_ha_records/health/add_record_type',
      member_id: memberId,
      name,
      unit,
      default_value: defaultValue,
      default_value_mode: defaultValueMode,
    });
  }

  async healthLogRecord(
    memberId: string,
    recordType: string,
    value: number,
    note = '',
    timestamp?: string,
  ) {
    return this.sendCommand({
      type: 'woow_ha_records/health/log_record',
      member_id: memberId,
      record_type: recordType,
      value,
      note,
      ...(timestamp ? { timestamp } : {}),
    });
  }

  async healthGetRecords(startTime: string, endTime: string) {
    return this.sendCommand({
      type: 'woow_ha_records/health/get_records',
      start_time: startTime,
      end_time: endTime,
    });
  }

  async healthUpdateRecord(
    memberId: string,
    typeId: string,
    timestamp: string,
    updates: { value?: number; note?: string; new_timestamp?: string; record_id?: string },
  ) {
    return this.sendCommand({
      type: 'woow_ha_records/health/update_record',
      member_id: memberId,
      type_id: typeId,
      timestamp,
      ...updates,
    });
  }

  async healthDeleteRecord(memberId: string, typeId: string, timestamp: string, recordId?: string) {
    return this.sendCommand({
      type: 'woow_ha_records/health/delete_record',
      member_id: memberId,
      type_id: typeId,
      timestamp,
      ...(recordId ? { record_id: recordId } : {}),
    });
  }

  async healthExportCsv(memberId: string) {
    return this.sendCommand({
      type: 'woow_ha_records/health/export_csv',
      member_id: memberId,
    });
  }

  // ─── Asset Record Helpers ──────────────────────────────────

  async assetList() {
    return this.sendCommand({ type: 'woow_ha_records/asset/list' });
  }

  async assetCreate(data: {
    name: string;
    brand?: string;
    /** Reference to a Category record id (`cat_<hex>`), not a category name. */
    category_id?: string;
    value?: number;
    purchase_at?: string;
    warranty_until?: string;
    manual_md?: string;
    maintenance_md?: string;
  }) {
    return this.sendCommand({ type: 'woow_ha_records/asset/create', ...data });
  }

  async assetUpdate(assetId: string, data: Record<string, any>) {
    return this.sendCommand({ type: 'woow_ha_records/asset/update', asset_id: assetId, ...data });
  }

  async assetDelete(assetId: string) {
    return this.sendCommand({ type: 'woow_ha_records/asset/delete', asset_id: assetId });
  }

  async assetCreateCategory(name: string) {
    return this.sendCommand({ type: 'woow_ha_records/asset/create_category', name });
  }

  async assetUpdateCategory(categoryId: string, name: string) {
    return this.sendCommand({ type: 'woow_ha_records/asset/update_category', category_id: categoryId, name });
  }

  /**
   * Delete an asset category.
   *
   * The cascade is opt-in (#49): a category that still holds assets is
   * refused with `not_empty` unless `force` is set. Teardown wants the
   * category gone whatever is in it, so this defaults to forcing; pass
   * `false` to exercise the guard.
   */
  async assetDeleteCategory(categoryId: string, force = true) {
    return this.sendCommand({
      type: 'woow_ha_records/asset/delete_category',
      category_id: categoryId,
      force,
    });
  }

  // ─── Note Record Helpers ──────────────────────────────────

  async noteGetData() {
    return this.sendCommand({ type: 'woow_ha_records/note/get_data' });
  }

  async noteCreateCategory(name: string) {
    return this.sendCommand({ type: 'woow_ha_records/note/create_category', name });
  }

  async noteCreateNote(categoryId: string, title: string, content = '', pinned = false) {
    return this.sendCommand({
      type: 'woow_ha_records/note/create_note',
      category_id: categoryId,
      title,
      content,
      pinned,
    });
  }

  async noteUpdateNote(
    noteId: string,
    updates: { title?: string; content?: string; pinned?: boolean; category_id?: string },
  ) {
    return this.sendCommand({
      type: 'woow_ha_records/note/update_note',
      note_id: noteId,
      ...updates,
    });
  }

  async noteDeleteNote(noteId: string) {
    return this.sendCommand({ type: 'woow_ha_records/note/delete_note', note_id: noteId });
  }

  /**
   * Delete a note category.
   *
   * The cascade is opt-in (#45): a category that still holds notes is
   * refused with `not_empty` unless `force` is set. Teardown wants the
   * category gone whatever is in it, so this defaults to forcing; pass
   * `false` to exercise the guard.
   */
  async noteDeleteCategory(categoryId: string, force = true) {
    return this.sendCommand({
      type: 'woow_ha_records/note/delete_category',
      category_id: categoryId,
      force,
    });
  }

  // ─── Finance Helpers ──────────────────────────────────────

  async financeGetAccounts() {
    return this.sendCommand({ type: 'woow_ha_records/finance/accounts' });
  }

  async financeGetAccount(accountId: string) {
    return this.sendCommand({ type: 'woow_ha_records/finance/account', account_id: accountId });
  }

  async financeAddAccount(name: string, initialBalance = 0) {
    return this.sendCommand({
      type: 'woow_ha_records/finance/add_account',
      name,
      initial_balance: initialBalance,
    });
  }

  async financeUpdateAccount(accountId: string, updates: { name?: string; note?: string }) {
    return this.sendCommand({
      type: 'woow_ha_records/finance/update_account',
      account_id: accountId,
      ...updates,
    });
  }

  async financeDeleteAccount(accountId: string) {
    return this.sendCommand({ type: 'woow_ha_records/finance/delete_account', account_id: accountId });
  }

  async financeAddTransaction(accountId: string, amount: number, note = '', type = 'manual') {
    return this.sendCommand({
      type: 'woow_ha_records/finance/add_transaction',
      account_id: accountId,
      amount,
      note,
      transaction_type: type,
    });
  }

  async financeUpdateTransaction(
    accountId: string,
    transactionId: string,
    updates: { amount?: number; note?: string },
  ) {
    return this.sendCommand({
      type: 'woow_ha_records/finance/update_transaction',
      account_id: accountId,
      transaction_id: transactionId,
      ...updates,
    });
  }

  async financeDeleteTransaction(accountId: string, transactionId: string) {
    return this.sendCommand({
      type: 'woow_ha_records/finance/delete_transaction',
      account_id: accountId,
      transaction_id: transactionId,
    });
  }

  async financeAddPlan(
    accountId: string,
    title: string,
    amount: number,
    frequency: string,
    day: number,
    month = 1,
    active = true,
  ) {
    return this.sendCommand({
      type: 'woow_ha_records/finance/add_plan',
      account_id: accountId,
      title,
      amount,
      frequency,
      day,
      month,
      active,
    });
  }

  async financeUpdatePlan(
    accountId: string,
    planId: string,
    updates: Record<string, any>,
  ) {
    return this.sendCommand({
      type: 'woow_ha_records/finance/update_plan',
      account_id: accountId,
      plan_id: planId,
      ...updates,
    });
  }

  async financeDeletePlan(accountId: string, planId: string) {
    return this.sendCommand({
      type: 'woow_ha_records/finance/delete_plan',
      account_id: accountId,
      plan_id: planId,
    });
  }

  async financeGetChartData(accountId: string, months = 6) {
    return this.sendCommand({
      type: 'woow_ha_records/finance/chart_data',
      account_id: accountId,
      months,
    });
  }
}
