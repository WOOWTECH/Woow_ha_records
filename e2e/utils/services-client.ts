/**
 * REST API client for HA Services testing.
 * Calls services via POST /api/services/<domain>/<service> endpoint.
 *
 * Query services (SupportsResponse.ONLY) require ?return_response.
 * Write services (SupportsResponse.OPTIONAL) optionally accept ?return_response.
 */

const HA_BASE = process.env.HA_BASE_URL || 'http://localhost:18125';

export interface ServiceResult {
  /** HTTP status code */
  status: number;
  /** Parsed JSON body (may be service_response wrapper or error) */
  body: any;
  /** Extracted service_response if present, otherwise raw body */
  data: any;
}

export class HAServicesClient {
  private token: string;
  private domain: string;

  constructor(token: string, domain = 'ha_health_record') {
    this.token = token;
    this.domain = domain;
  }

  /**
   * Call an HA service via REST API.
   * @param service  Service name (e.g. "get_members")
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
    const url = `${HA_BASE}/api/services/${this.domain}/${service}${qs}`;

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
}
