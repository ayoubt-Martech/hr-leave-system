/**
 * ApiService — drop-in replacement for StorageService.
 *
 * All methods are async and call the Express backend over HTTP.
 * The JWT is stored in localStorage under 'martechr_token'.
 * Every mutating call is server-side authorised, so role enforcement
 * is no longer the frontend's responsibility.
 */

import {
    CalendarLeaveEntry,
    EmailAlert,
    HalfDayType,
    Holiday,
    LeaveAttachmentMeta,
    LeaveRequest,
    LeaveStatus,
    LeaveType,
    MigrationImportSummary,
    MigrationSheetReview,
    SpecialLeaveType,
    User,
    UserRole
} from '../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'martechr_token';

// ─── Token helpers ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });

  if (res.status === 401) {
    // Token expired or invalid — clear it and redirect to login
    clearToken();
    window.location.href = '/';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const AuthService = {
  /** Redirects to the backend Google OAuth flow */
  loginWithGoogle(): void {
    window.location.href = `${BASE}/auth/google`;
  },

  /**
   * Dev-only: logs in by email directly without OAuth.
   * Only works when VITE_DEV_LOGIN=true and the server is in development mode.
   */
  async devLogin(email: string): Promise<User> {
    const res = await fetch(`${BASE}/auth/dev-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const { token, user } = await res.json();
    setToken(token);
    return normalizeUser(user);
  },

  /** Called on app boot — exchanges token from URL or storage for the current user */
  async bootstrap(): Promise<User | null> {
    // Pick up token from URL after OAuth callback (?token=...)
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
      // Clean the token from the URL without a page reload
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean);
    }

    if (!getToken()) return null;

    try {
      return await apiFetch<User>('/auth/me');
    } catch {
      clearToken();
      return null;
    }
  },

  async logout(): Promise<void> {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      clearToken();
    }
  },
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const ApiService = {
  // ── User CRUD ──────────────────────────────────────────────────────────────

  async getUsers(): Promise<User[]> {
    const rows = await apiFetch<any[]>('/users');
    return rows.map(normalizeUser);
  },

  async getUserById(id: string): Promise<User | undefined> {
    try {
      const row = await apiFetch<any>(`/users/${id}`);
      return normalizeUser(row);
    } catch {
      return undefined;
    }
  },

  async addUser(user: Omit<User, 'id'> & { id?: string }): Promise<User> {
    const row = await apiFetch<any>('/users', {
      method: 'POST',
      body: JSON.stringify(user),
    });
    return normalizeUser(row);
  },

  async updateUser(user: User): Promise<User> {
    const row = await apiFetch<any>(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        full_name: user.full_name,
        position: user.position,
        role: user.role,
        manager_ids: user.manager_ids,
        initial_balance: user.initial_balance,
        current_balance: user.current_balance,
        is_active: user.is_active,
        termination_date: user.termination_date ?? null,
        avatar_url: user.avatar_url,
      }),
    });
    return normalizeUser(row);
  },

  /** Soft-deletes a user (deactivates + records termination_date). All their leave records are kept. */
  async deleteUser(userId: string, options?: { termination_date?: string; reason?: string }): Promise<User> {
    const row = await apiFetch<any>(`/users/${userId}`, {
      method: 'DELETE',
      body: JSON.stringify(options ?? {}),
    });
    return normalizeUser(row);
  },

  // ── Leave Requests ─────────────────────────────────────────────────────────

  async getRequests(): Promise<LeaveRequest[]> {
    const rows = await apiFetch<any[]>('/requests');
    return rows.map(normalizeRequest);
  },

  /** Company-wide, privacy-limited feed (no notes) powering the Team Calendar. */
  async getCalendarRequests(): Promise<CalendarLeaveEntry[]> {
    const rows = await apiFetch<any[]>('/requests/calendar');
    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      start_date: r.start_date,
      end_date: r.end_date,
      days_count: parseFloat(r.days_count ?? '0'),
      type: r.type as LeaveType,
      half_day_type: r.half_day_type as HalfDayType,
      status: r.status as LeaveStatus,
    }));
  },

  async addRequest(req: Omit<LeaveRequest, 'id' | 'created_at' | 'status'>): Promise<LeaveRequest> {
    const row = await apiFetch<any>('/requests', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    return normalizeRequest(row);
  },

  async cancelRequest(requestId: string, reason?: string): Promise<LeaveRequest> {
    const row = await apiFetch<any>(`/requests/${requestId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return normalizeRequest(row);
  },

  async reviewRequest(
    requestId: string,
    action: 'approve' | 'decline' | 'approve_cancellation' | 'reject_cancellation',
    review_note?: string
  ): Promise<LeaveRequest> {
    const row = await apiFetch<any>(`/requests/${requestId}/review`, {
      method: 'POST',
      body: JSON.stringify({ action, review_note }),
    });
    return normalizeRequest(row);
  },

  /** Uploads (or replaces) the sick-leave proof document for an approved request. */
  async uploadAttachment(requestId: string, file: File): Promise<LeaveAttachmentMeta> {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    return apiFetch<LeaveAttachmentMeta>(`/requests/${requestId}/attachment`, {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, mime_type: file.type, data }),
    });
  },

  /** Fetches the proof document and opens it in a new tab. */
  async viewAttachment(requestId: string): Promise<void> {
    // Open the tab synchronously (still inside the click's call stack) so
    // browsers don't treat it as a blocked popup — the fetch below is async,
    // and window.open() after an await gets silently blocked in most browsers.
    const newTab = window.open('', '_blank');
    try {
      const res = await fetch(`${BASE}/requests/${requestId}/attachment`, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (newTab) {
        newTab.location.href = url;
      } else {
        window.open(url, '_blank');
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      newTab?.close();
      throw err;
    }
  },

  // ── Holidays ───────────────────────────────────────────────────────────────

  async getHolidays(): Promise<Holiday[]> {
    return apiFetch<Holiday[]>('/holidays');
  },

  async addHoliday(holiday: Omit<Holiday, 'id'>): Promise<Holiday> {
    return apiFetch<Holiday>('/holidays', {
      method: 'POST',
      body: JSON.stringify(holiday),
    });
  },

  async deleteHoliday(id: string): Promise<void> {
    await apiFetch(`/holidays/${id}`, { method: 'DELETE' });
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  async getSettings(): Promise<Record<string, string>> {
    return apiFetch<Record<string, string>>('/settings');
  },

  async getSettingValue<T = string>(key: string, defaultVal: T): Promise<T> {
    try {
      const map = await this.getSettings();
      const raw = map[key];
      if (raw === undefined || raw === null) return defaultVal;
      // Coerce to the type of defaultVal
      if (typeof defaultVal === 'number') return Number(raw) as unknown as T;
      if (typeof defaultVal === 'boolean') return (raw === 'true') as unknown as T;
      return raw as unknown as T;
    } catch {
      return defaultVal;
    }
  },

  async setSettingValue(key: string, value: string | number | boolean): Promise<void> {
    await apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify({ key, value }),
    });
  },

  // ── Email Alerts ───────────────────────────────────────────────────────────

  async getEmailAlerts(): Promise<EmailAlert[]> {
    return apiFetch<EmailAlert[]>('/alerts');
  },

  async markAlertRead(alertId: string): Promise<void> {
    await apiFetch(`/alerts/${alertId}/read`, { method: 'PATCH' });
  },

  async markAllAlertsRead(): Promise<void> {
    await apiFetch('/alerts/read-all', { method: 'POST' });
  },

  // ── Admin: Accrual engine ──────────────────────────────────────────────────

  async triggerMonthlyAccrual(): Promise<{ message: string }> {
    return apiFetch('/admin/accrual/run', { method: 'POST' });
  },

  async triggerYearEndCarryOver(): Promise<{ message: string }> {
    return apiFetch('/admin/accrual/carry-over', { method: 'POST' });
  },

  // ── Legacy Excel migration ──────────────────────────────────────────────────

  async importLegacyData(
    reviews: MigrationSheetReview[]
  ): Promise<{ message: string; summary: MigrationImportSummary }> {
    const sheets = reviews.map((r) => ({
      sheetName: r.sheetName,
      action: r.action,
      mappedUserId: r.action === 'map' ? r.mappedUserId : null,
      isTerminated: r.isTerminated,
      terminationDate: r.isTerminated ? r.terminationDate : null,
      openingBalance: r.openingBalance,
      newUser:
        r.action === 'create'
          ? {
              full_name: r.employeeName,
              email: r.newUserEmail,
              position: r.newUserPosition,
              manager_ids: [],
            }
          : undefined,
      leaveRows: r.action === 'skip' ? [] : r.leaveRows,
    }));

    return apiFetch('/migration/import', {
      method: 'POST',
      body: JSON.stringify({ sheets }),
    });
  },

  /** Downloads a fresh .xlsx export of all users + leave requests. */
  async exportData(): Promise<void> {
    const res = await fetch(`${BASE}/migration/export`, { headers: authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Export failed: ${res.statusText}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mmg-hr-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

// ─── Normalizers (numeric strings from Postgres → numbers) ───────────────────

function normalizeUser(raw: any): User {
  return {
    id: raw.id,
    full_name: raw.full_name,
    email: raw.email,
    position: raw.position,
    role: raw.role as UserRole,
    manager_ids: Array.isArray(raw.manager_ids) ? raw.manager_ids : [],
    initial_balance: parseFloat(raw.initial_balance ?? '0'),
    current_balance: parseFloat(raw.current_balance ?? '0'),
    is_active: raw.is_active,
    termination_date: raw.termination_date ?? null,
    avatar_url: raw.avatar_url ?? undefined,
    created_at: raw.created_at,
  };
}

function normalizeRequest(raw: any): LeaveRequest {
  return {
    id: raw.id,
    user_id: raw.user_id,
    start_date: raw.start_date,
    end_date: raw.end_date,
    return_date: raw.return_date,
    days_count: parseFloat(raw.days_count ?? '0'),
    type: raw.type as LeaveType,
    is_special: raw.is_special,
    special_type: raw.special_type as SpecialLeaveType,
    half_day_type: raw.half_day_type as HalfDayType,
    is_short_authorization: raw.is_short_authorization ?? false,
    note: raw.note ?? '',
    status: raw.status as LeaveStatus,
    created_at: raw.created_at,
    reviewed_at: raw.reviewed_at ?? undefined,
    reviewed_by: raw.reviewed_by ?? undefined,
    review_note: raw.review_note ?? undefined,
    action_reason: raw.action_reason ?? undefined,
    is_legacy_backfill: raw.is_legacy_backfill ?? false,
    attachment: raw.attachment ?? null,
  };
}
