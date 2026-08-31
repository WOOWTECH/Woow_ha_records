/**
 * REST API client for HA Services testing.
 * Calls services via POST /api/services/<domain>/<service> endpoint.
 *
 * Query services (SupportsResponse.ONLY) require ?return_response.
 * Write services (SupportsResponse.OPTIONAL) optionally accept ?return_response.
 */

const HA_BASE = process.env.HA_BASE_URL || 'http://localhost:18125';

/** The integration domain every Area's services are registered under. */
export const INTEGRATION_DOMAIN = 'woow_ha_records';

export interface ServiceResult {
  /** HTTP status code */
  status: number;
  /** Parsed JSON body (may be service_response wrapper or error) */
  body: any;
  /** Extracted service_response if present, otherwise raw body */
  data: any;
}

/**
 * The service names Home Assistant has registered under the integration's
 * domain, read from `GET /api/services`.
 *
 * This is the service registry itself, so it answers "is this service
 * registered?" directly — unlike the Developer Tools page, whose markup is
 * frontend-rendered and changes between HA releases.
 */
export async function listRegisteredServices(token: string): Promise<string[]> {
  const res = await fetch(`${HA_BASE}/api/services`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`GET /api/services failed: ${res.status} ${await res.text()}`);
  }

  const domains: Array<{ domain: string; services: Record<string, unknown> }> = await res.json();
  const entry = domains.find(d => d.domain === INTEGRATION_DOMAIN);
  if (!entry) {
    throw new Error(
      `Domain "${INTEGRATION_DOMAIN}" is not registered. Registered domains: ` +
        domains.map(d => d.domain).sort().join(', '),
    );
  }

  return Object.keys(entry.services ?? {});
}

export class HAServicesClient {
  private token: string;
  private area: string;

  /** @param area  One of "finance", "asset", "health", "note". */
  constructor(token: string, area = 'health') {
    this.token = token;
    this.area = area;
  }

  /**
   * Call an HA service via REST API.
   * @param service  Bare verb (e.g. "get_members"); the Area prefix is added
   * @param data     Service call payload
   * @param opts     Options: returnResponse (default: true)
   */
  async call(
    service: string,
    data: Record<string, any> = {},
    opts: { returnResponse?: boolean } = {},
  ): Promise<ServiceResult> {
    const wantResponse = opts.returnResponse !== false;
    const qs = wantResponse ? '?return_response' : '';
    const url = `${HA_BASE}/api/services/${INTEGRATION_DOMAIN}/${this.area}_${service}${qs}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    let body: any;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    // HA wraps service responses: { changed_states: [], service_response: {...} }
    const serviceResponse = body?.service_response ?? body;

    return {
      status: res.status,
      body,
      data: serviceResponse,
    };
  }

  // ─── Query services (SupportsResponse.ONLY) ─────────────

  async getMembers(): Promise<ServiceResult> {
    return this.call('get_members');
  }

  async getRecords(startTime: string, endTime: string): Promise<ServiceResult> {
    return this.call('get_records', { start_time: startTime, end_time: endTime });
  }

  async exportCsv(memberId: string): Promise<ServiceResult> {
    return this.call('export_csv', { member_id: memberId });
  }

  // ─── Record CRUD (SupportsResponse.OPTIONAL) ────────────

  async logRecord(
    memberId: string,
    recordType: string,
    value: number,
    note = '',
    timestamp?: string,
  ): Promise<ServiceResult> {
    return this.call('log_record', {
      member_id: memberId,
      record_type: recordType,
      value,
      note,
      ...(timestamp ? { timestamp } : {}),
    });
  }

  async updateRecord(
    memberId: string,
    typeId: string,
    timestamp: string,
    updates: { value?: number; note?: string; new_timestamp?: string; record_id?: string } = {},
  ): Promise<ServiceResult> {
    return this.call('update_record', {
      member_id: memberId,
      type_id: typeId,
      timestamp,
      ...updates,
    });
  }

  async deleteRecord(
    memberId: string,
    typeId: string,
    timestamp: string,
    recordId?: string,
  ): Promise<ServiceResult> {
    return this.call('delete_record', {
      member_id: memberId,
      type_id: typeId,
      timestamp,
      ...(recordId ? { record_id: recordId } : {}),
    });
  }

  // ─── Record type management ─────────────────────────────

  async addRecordType(
    memberId: string,
    name: string,
    unit: string,
    defaultValue = 0,
    defaultValueMode: 'fixed' | 'last_value' = 'fixed',
  ): Promise<ServiceResult> {
    return this.call('add_record_type', {
      member_id: memberId,
      name,
      unit,
      default_value: defaultValue,
      default_value_mode: defaultValueMode,
    });
  }

  async updateRecordType(
    memberId: string,
    typeId: string,
    name: string,
    unit: string,
    opts: { defaultValue?: number; defaultValueMode?: string } = {},
  ): Promise<ServiceResult> {
    return this.call('update_record_type', {
      member_id: memberId,
      type_id: typeId,
      name,
      unit,
      ...(opts.defaultValue !== undefined ? { default_value: opts.defaultValue } : {}),
      ...(opts.defaultValueMode ? { default_value_mode: opts.defaultValueMode } : {}),
    });
  }

  async deleteRecordType(memberId: string, typeId: string): Promise<ServiceResult> {
    return this.call('delete_record_type', { member_id: memberId, type_id: typeId });
  }

  // ─── Member management ──────────────────────────────────

  async addMember(
    name: string,
    memberId?: string,
    note = '',
  ): Promise<ServiceResult> {
    return this.call('add_member', {
      name,
      ...(memberId ? { member_id: memberId } : {}),
      note,
    });
  }

  async updateMember(
    memberId: string,
    name: string,
    note = '',
  ): Promise<ServiceResult> {
    return this.call('update_member', { member_id: memberId, name, note });
  }

  async deleteMember(memberId: string): Promise<ServiceResult> {
    return this.call('delete_member', { member_id: memberId });
  }

  // ─── Finance: Query services (SupportsResponse.ONLY) ────

  async financeGetAccounts(): Promise<ServiceResult> {
    return this.call('get_accounts');
  }

  async financeGetAccount(accountId: string): Promise<ServiceResult> {
    return this.call('get_account', { account_id: accountId });
  }

  async financeGetChartData(accountId: string, months = 6): Promise<ServiceResult> {
    return this.call('get_chart_data', { account_id: accountId, months });
  }

  async financeExportCsv(accountId: string): Promise<ServiceResult> {
    return this.call('export_csv', { account_id: accountId });
  }

  // ─── Finance: Transaction CRUD (SupportsResponse.OPTIONAL)

  async financeAddTransaction(
    accountId: string,
    amount: number,
    note = '',
    transactionType = 'manual',
  ): Promise<ServiceResult> {
    return this.call('add_transaction', {
      account_id: accountId,
      amount,
      note,
      transaction_type: transactionType,
    });
  }

  async financeUpdateTransaction(
    accountId: string,
    transactionId: string,
    updates: { amount?: number; note?: string } = {},
  ): Promise<ServiceResult> {
    return this.call('update_transaction', {
      account_id: accountId,
      transaction_id: transactionId,
      ...updates,
    });
  }

  async financeDeleteTransaction(
    accountId: string,
    transactionId: string,
  ): Promise<ServiceResult> {
    return this.call('delete_transaction', {
      account_id: accountId,
      transaction_id: transactionId,
    });
  }

  // ─── Finance: Recurring Plans (SupportsResponse.OPTIONAL)

  async financeAddPlan(
    accountId: string,
    title: string,
    amount: number,
    frequency: string,
    day: number,
    opts: { month?: number; active?: boolean } = {},
  ): Promise<ServiceResult> {
    return this.call('add_plan', {
      account_id: accountId,
      title,
      amount,
      frequency,
      day,
      ...(opts.month !== undefined ? { month: opts.month } : {}),
      ...(opts.active !== undefined ? { active: opts.active } : {}),
    });
  }

  async financeUpdatePlan(
    accountId: string,
    planId: string,
    updates: Record<string, any> = {},
  ): Promise<ServiceResult> {
    return this.call('update_plan', {
      account_id: accountId,
      plan_id: planId,
      ...updates,
    });
  }

  async financeDeletePlan(
    accountId: string,
    planId: string,
  ): Promise<ServiceResult> {
    return this.call('delete_plan', {
      account_id: accountId,
      plan_id: planId,
    });
  }

  // ─── Finance: Account Management (SupportsResponse.OPTIONAL)

  async financeAddAccount(
    name: string,
    initialBalance = 0,
  ): Promise<ServiceResult> {
    return this.call('add_account', {
      name,
      initial_balance: initialBalance,
    });
  }

  async financeUpdateAccount(
    accountId: string,
    updates: { name?: string; note?: string } = {},
  ): Promise<ServiceResult> {
    return this.call('update_account', {
      account_id: accountId,
      ...updates,
    });
  }

  async financeDeleteAccount(accountId: string): Promise<ServiceResult> {
    return this.call('delete_account', { account_id: accountId });
  }

  async financeAdjustBalance(
    accountId: string,
    newBalance: number,
  ): Promise<ServiceResult> {
    return this.call('adjust_balance', {
      account_id: accountId,
      new_balance: newBalance,
    });
  }

  // ─── Asset Record: Query services (SupportsResponse.ONLY) ─

  async assetListAssets(): Promise<ServiceResult> {
    return this.call('list_assets');
  }

  async assetGetAsset(assetId: string): Promise<ServiceResult> {
    return this.call('get_asset', { asset_id: assetId });
  }

  async assetListCategories(): Promise<ServiceResult> {
    return this.call('list_categories');
  }

  async assetExportCsv(): Promise<ServiceResult> {
    return this.call('export_csv');
  }

  // ─── Asset Record: Asset CRUD (SupportsResponse.OPTIONAL) ─

  async assetCreateAsset(
    name: string,
    opts: {
      brand?: string;
      category_id?: string;
      value?: number;
      purchase_at?: string;
      warranty_until?: string;
      manual_md?: string;
      maintenance_md?: string;
    } = {},
  ): Promise<ServiceResult> {
    return this.call('create_asset', { name, ...opts });
  }

  async assetUpdateAsset(
    assetId: string,
    updates: {
      name?: string;
      brand?: string;
      category_id?: string;
      value?: number;
      purchase_at?: string;
      warranty_until?: string;
      manual_md?: string;
      maintenance_md?: string;
    } = {},
  ): Promise<ServiceResult> {
    return this.call('update_asset', { asset_id: assetId, ...updates });
  }

  async assetDeleteAsset(assetId: string): Promise<ServiceResult> {
    return this.call('delete_asset', { asset_id: assetId });
  }

  // ─── Asset Record: Category CRUD (SupportsResponse.OPTIONAL)

  async assetCreateCategory(name: string): Promise<ServiceResult> {
    return this.call('create_category', { name });
  }

  async assetUpdateCategory(
    categoryId: string,
    name: string,
  ): Promise<ServiceResult> {
    return this.call('update_category', { category_id: categoryId, name });
  }

  /**
   * Delete an asset category.
   *
   * The cascade is opt-in (#49): a category that still holds assets is
   * refused unless `force` is set. Teardown wants the category gone
   * whatever is in it, so this defaults to forcing; pass `false` to
   * exercise the guard.
   */
  async assetDeleteCategory(
    categoryId: string,
    force = true,
  ): Promise<ServiceResult> {
    return this.call('delete_category', { category_id: categoryId, force });
  }

  // ─── Note Record: Query services (SupportsResponse.ONLY) ──

  async noteListNotes(): Promise<ServiceResult> {
    return this.call('list_notes');
  }

  async noteGetNote(noteId: string): Promise<ServiceResult> {
    return this.call('get_note', { note_id: noteId });
  }

  async noteListCategories(): Promise<ServiceResult> {
    return this.call('list_categories');
  }

  async noteExportMarkdown(): Promise<ServiceResult> {
    return this.call('export_markdown');
  }

  // ─── Note Record: Note CRUD (SupportsResponse.OPTIONAL) ───

  async noteCreateNote(
    categoryId: string,
    title: string,
    opts: { content?: string; pinned?: boolean } = {},
  ): Promise<ServiceResult> {
    return this.call('create_note', {
      category_id: categoryId,
      title,
      ...opts,
    });
  }

  async noteUpdateNote(
    noteId: string,
    updates: { title?: string; content?: string; pinned?: boolean } = {},
  ): Promise<ServiceResult> {
    return this.call('update_note', { note_id: noteId, ...updates });
  }

  async noteDeleteNote(noteId: string): Promise<ServiceResult> {
    return this.call('delete_note', { note_id: noteId });
  }

  // ─── Note Record: Category CRUD (SupportsResponse.OPTIONAL)

  async noteCreateCategory(name: string): Promise<ServiceResult> {
    return this.call('create_category', { name });
  }

  /**
   * Delete a note category.
   *
   * The cascade is opt-in (#45): a category that still holds notes is
   * refused unless `force` is set. Teardown wants the category gone
   * whatever is in it, so this defaults to forcing; pass `false` to
   * exercise the guard.
   */
  async noteDeleteCategory(categoryId: string, force = true): Promise<ServiceResult> {
    return this.call('delete_category', { category_id: categoryId, force });
  }
}
