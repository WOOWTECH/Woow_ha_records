/**
 * WebSocket client for direct HA API testing.
 * Maintains a persistent connection and supports sequential commands.
 */

const HA_BASE = process.env.HA_BASE_URL || 'http://localhost:18125';

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

        // Handle response to a command
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.success === false) {
            rej(new Error(`WS error: ${JSON.stringify(msg.error)}`));
          } else {
            res(msg.result);
          }
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

  /** Send a WebSocket command and wait for response */
  async sendCommand(command: Record<string, any>): Promise<any> {
    if (!this.connected) await this.connect();

    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command timeout: ${command.type}`));
      }, 30_000);

      this.pending.set(id, {
        resolve: (result: any) => {
          clearTimeout(timeout);
          resolve(result);
        },
        reject: (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify({ id, ...command }));
    });
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

  async assetDeleteCategory(categoryId: string) {
    return this.sendCommand({ type: 'woow_ha_records/asset/delete_category', category_id: categoryId });
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

  async noteUpdateNote(noteId: string, updates: { title?: string; content?: string; pinned?: boolean }) {
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
