import { User, LeaveRequest, Holiday, Setting, EmailAlert, LeaveType, HalfDayType, SpecialLeaveType } from '../types';

const USERS_KEY = 'martechr_users_v2';
const REQUESTS_KEY = 'martechr_requests_v2';
const HOLIDAYS_KEY = 'martechr_holidays_v2';
const SETTINGS_KEY = 'martechr_settings_v2';
const EMAIL_ALERTS_KEY = 'martechr_email_alerts_v2';
const CURRENT_USER_KEY = 'martechr_current_user_v2';

// Pre-seeded Tunisian Holidays
const INITIAL_HOLIDAYS: Holiday[] = [
  { id: 'hol_1', name: "New Year's Day (Jour de l'An)", date: '2026-01-01', is_recurring: true, category: 'National' },
  { id: 'hol_2', name: "Independence Day (Fête de l'Indépendance)", date: '2026-03-20', is_recurring: true, category: 'National' },
  { id: 'hol_3', name: 'Eid al-Fitr (Aïd El Fitr)', date: '2026-03-21', is_recurring: false, category: 'Religious' },
  { id: 'hol_4', name: 'Eid al-Fitr Day 2', date: '2026-03-22', is_recurring: false, category: 'Religious' },
  { id: 'hol_5', name: "Martyrs' Day (Fête des Martyrs)", date: '2026-04-09', is_recurring: true, category: 'National' },
  { id: 'hol_6', name: 'Labor Day (Fête du Travail)', date: '2026-05-01', is_recurring: true, category: 'National' },
  { id: 'hol_7', name: 'Eid al-Adha (Aïd El Idha)', date: '2026-05-27', is_recurring: false, category: 'Religious' },
  { id: 'hol_8', name: 'Eid al-Adha Day 2', date: '2026-05-28', is_recurring: false, category: 'Religious' },
  { id: 'hol_9', name: 'Ras al-Am (Islamic New Year 1448)', date: '2026-06-17', is_recurring: false, category: 'Religious' },
  { id: 'hol_10', name: 'Republic Day (Fête de la République)', date: '2026-07-25', is_recurring: true, category: 'National' },
  { id: 'hol_11', name: "National Women's Day (Fête de la Femme)", date: '2026-08-13', is_recurring: true, category: 'National' },
  { id: 'hol_12', name: 'Mawlid Ennabawi (Mouled)', date: '2026-08-26', is_recurring: false, category: 'Religious' },
  { id: 'hol_13', name: "Evacuation Day (Fête de l'Évacuation)", date: '2026-10-15', is_recurring: true, category: 'National' },
  { id: 'hol_14', name: 'Revolution & Youth Day', date: '2026-12-17', is_recurring: true, category: 'National' },
];

// Pre-seeded Users with hierarchy
const INITIAL_USERS: User[] = [
  {
    id: 'user_admin_ayoub',
    full_name: 'Ayoub T.',
    email: 'ayoub.t@martechlabs.io',
    position: 'Chief Executive Officer',
    role: 'SuperAdmin',
    manager_ids: [],
    initial_balance: 18,
    current_balance: 16.5,
    is_active: true,
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    created_at: '2025-01-01',
  },
  {
    id: 'user_admin_hr',
    full_name: 'Super Administrator',
    email: 'admin@martechlabs.io',
    position: 'HR Director',
    role: 'SuperAdmin',
    manager_ids: [],
    initial_balance: 18,
    current_balance: 18,
    is_active: true,
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    created_at: '2025-01-01',
  },
  {
    id: 'user_mgr_sami',
    full_name: 'Sami Mansour',
    email: 'sami.m@martechlabs.io',
    position: 'Engineering Manager',
    role: 'Manager',
    manager_ids: ['user_admin_ayoub'],
    initial_balance: 20,
    current_balance: 17,
    is_active: true,
    avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    created_at: '2025-01-01',
  },
  {
    id: 'user_mgr_leila',
    full_name: 'Leila Ben Salah',
    email: 'leila.b@martechlabs.io',
    position: 'Operations & QA Lead',
    role: 'Manager',
    manager_ids: ['user_admin_ayoub'],
    initial_balance: 18,
    current_balance: 15,
    is_active: true,
    avatar_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    created_at: '2025-01-01',
  },
  {
    id: 'user_emp_radhwen',
    full_name: 'Radhwen Boulahia',
    email: 'radhwen.b@martechlabs.io',
    position: 'Senior Backend Engineer',
    role: 'Employee',
    manager_ids: ['user_mgr_sami'],
    initial_balance: 35, // Migrated from: "17( rest 2025)+18"
    current_balance: 22,
    is_active: true,
    avatar_url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    created_at: '2025-01-01',
  },
  {
    id: 'user_emp_amel',
    full_name: 'Amel Omri',
    email: 'amel.o@martechlabs.io',
    position: 'Lead UI/UX Designer',
    role: 'Employee',
    manager_ids: ['user_mgr_sami'],
    initial_balance: 32.5, // Migrated from: "14.5( rest 2025)+18"
    current_balance: 25.5,
    is_active: true,
    avatar_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
    created_at: '2025-01-01',
  },
  {
    id: 'user_emp_yassine',
    full_name: 'Yassine Trabelsi',
    email: 'yassine.t@martechlabs.io',
    position: 'Automation QA Specialist',
    role: 'Employee',
    manager_ids: ['user_mgr_leila'],
    initial_balance: 26, // Migrated from: "8( rest 2025)+18"
    current_balance: 21,
    is_active: true,
    avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    created_at: '2025-01-01',
  },
  {
    id: 'user_emp_sarra',
    full_name: 'Sarra Khemir',
    email: 'sarra.k@martechlabs.io',
    position: 'Junior Frontend Developer',
    role: 'Employee',
    manager_ids: ['user_mgr_sami'],
    initial_balance: 6,
    current_balance: 1.0, // Low balance to demonstrate negative balance flow
    is_active: true,
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    created_at: '2026-01-15',
  },
];

// Pre-seeded Leave Requests
const INITIAL_REQUESTS: LeaveRequest[] = [
  // Historical backfilled requests for Radhwen (Section 5)
  {
    id: 'req_hist_radhwen_1',
    user_id: 'user_emp_radhwen',
    start_date: '2026-01-12',
    end_date: '2026-01-16',
    return_date: '2026-01-19',
    days_count: 5,
    type: 'Vacation',
    is_special: false,
    half_day_type: 'None',
    note: 'Winter leave (Legacy backfill from Absence Leave.xlsx)',
    status: 'Approved',
    created_at: '2026-01-05T09:00:00Z',
    reviewed_at: '2026-01-06T10:00:00Z',
    reviewed_by: 'user_mgr_sami',
    is_legacy_backfill: true,
  },
  {
    id: 'req_hist_radhwen_2',
    user_id: 'user_emp_radhwen',
    start_date: '2026-04-20',
    end_date: '2026-04-24',
    return_date: '2026-04-27',
    days_count: 5,
    type: 'Vacation',
    is_special: false,
    half_day_type: 'None',
    note: 'Spring break (Legacy backfill)',
    status: 'Approved',
    created_at: '2026-04-10T08:30:00Z',
    reviewed_at: '2026-04-11T11:00:00Z',
    reviewed_by: 'user_mgr_sami',
    is_legacy_backfill: true,
  },
  {
    id: 'req_hist_radhwen_3',
    user_id: 'user_emp_radhwen',
    start_date: '2026-07-06',
    end_date: '2026-07-08',
    return_date: '2026-07-09',
    days_count: 3,
    type: 'Sick Leave',
    is_special: false,
    half_day_type: 'None',
    note: 'Medical doctor appointment and recovery',
    status: 'Approved',
    created_at: '2026-07-05T07:15:00Z',
    reviewed_at: '2026-07-05T08:00:00Z',
    reviewed_by: 'user_mgr_sami',
    is_legacy_backfill: true,
  },
  // Amel's historical requests
  {
    id: 'req_hist_amel_1',
    user_id: 'user_emp_amel',
    start_date: '2026-02-09',
    end_date: '2026-02-13',
    return_date: '2026-02-16',
    days_count: 5,
    type: 'Vacation',
    is_special: false,
    half_day_type: 'None',
    note: 'Annual leave (Legacy backfill)',
    status: 'Approved',
    created_at: '2026-02-01T09:00:00Z',
    reviewed_at: '2026-02-02T10:00:00Z',
    reviewed_by: 'user_mgr_sami',
    is_legacy_backfill: true,
  },
  {
    id: 'req_hist_amel_2',
    user_id: 'user_emp_amel',
    start_date: '2026-05-18',
    end_date: '2026-05-19',
    return_date: '2026-05-20',
    days_count: 2,
    type: 'Emergency',
    is_special: false,
    half_day_type: 'None',
    note: 'Family urgent event',
    status: 'Approved',
    created_at: '2026-05-17T14:00:00Z',
    reviewed_at: '2026-05-17T15:30:00Z',
    reviewed_by: 'user_mgr_sami',
    is_legacy_backfill: true,
  },
  // Active Pending request 1: Radhwen has an upcoming vacation
  {
    id: 'req_pending_radhwen',
    user_id: 'user_emp_radhwen',
    start_date: '2026-10-12',
    end_date: '2026-10-16',
    return_date: '2026-10-19',
    days_count: 5,
    type: 'Vacation',
    is_special: false,
    half_day_type: 'None',
    note: 'Autumn holiday trip with family',
    status: 'Pending',
    created_at: '2026-09-10T11:20:00Z',
  },
  // Active Pending request 2: Sarra requests leave with NEGATIVE BALANCE (current 1.0, requests 3.0 days)
  {
    id: 'req_pending_sarra_negative',
    user_id: 'user_emp_sarra',
    start_date: '2026-10-05',
    end_date: '2026-10-07',
    return_date: '2026-10-08',
    days_count: 3,
    type: 'Vacation',
    is_special: false,
    half_day_type: 'None',
    note: 'Urgent family relocation - I will make up the 2 negative days with upcoming October accrual.',
    status: 'Pending',
    created_at: '2026-09-14T16:45:00Z',
  },
  // CancellationRequested request: Yassine wants to cancel an approved leave to restore his 3 days
  {
    id: 'req_cancel_yassine',
    user_id: 'user_emp_yassine',
    start_date: '2026-11-02',
    end_date: '2026-11-04',
    return_date: '2026-11-05',
    days_count: 3,
    type: 'Vacation',
    is_special: false,
    half_day_type: 'None',
    note: 'Project schedule changed so I postponed this trip.',
    status: 'CancellationRequested',
    created_at: '2026-08-20T10:00:00Z',
    reviewed_at: '2026-08-21T09:30:00Z',
    reviewed_by: 'user_mgr_leila',
  },
];

// Pre-seeded Settings
const INITIAL_SETTINGS: Setting[] = [
  { key: 'max_carry_over_days', value: 0 },
  { key: 'monthly_accrual_rate', value: 1.5 },
  { key: 'last_accrual_month', value: '2026-09' },
  { key: 'company_name', value: 'Momentum Marketing Group' },
];

export class StorageService {
  static getUsers(): User[] {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      this.saveUsers(INITIAL_USERS);
      return INITIAL_USERS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_USERS;
    }
  }

  static saveUsers(users: User[]): void {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  static getUserById(id: string): User | undefined {
    return this.getUsers().find((u) => u.id === id);
  }

  static getUserByEmail(email: string): User | undefined {
    const clean = email.toLowerCase().trim();
    return this.getUsers().find((u) => u.email.toLowerCase().trim() === clean);
  }

  static updateUser(updated: User): void {
    const users = this.getUsers().map((u) => (u.id === updated.id ? updated : u));
    this.saveUsers(users);
  }

  static addUser(newUser: User): void {
    const users = this.getUsers();
    users.push(newUser);
    this.saveUsers(users);
  }

  static deleteUser(userId: string): void {
    const users = this.getUsers().filter((u) => u.id !== userId);
    this.saveUsers(users);
  }

  static getRequests(): LeaveRequest[] {
    const raw = localStorage.getItem(REQUESTS_KEY);
    if (!raw) {
      this.saveRequests(INITIAL_REQUESTS);
      return INITIAL_REQUESTS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_REQUESTS;
    }
  }

  static saveRequests(requests: LeaveRequest[]): void {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  }

  static addRequest(request: LeaveRequest): void {
    const requests = this.getRequests();
    requests.unshift(request);
    this.saveRequests(requests);

    // If requested, generate Manager email alert notification
    const employee = this.getUserById(request.user_id);
    if (employee && employee.manager_ids.length > 0) {
      const manager = this.getUserById(employee.manager_ids[0]);
      if (manager) {
        this.addEmailAlert({
          id: `alert_${Date.now()}`,
          recipient_email: manager.email,
          recipient_name: manager.full_name,
          subject: `Leave Request Alert: ${employee.full_name} (${request.days_count} days)`,
          preview: `${employee.full_name} submitted a ${request.type} request from ${request.start_date} to ${request.end_date}. Note: ${request.note || 'None'}`,
          leave_request_id: request.id,
          created_at: new Date().toISOString(),
          action_url: `#approvals?req=${request.id}`,
          read: false,
        });
      }
    }
  }

  static updateRequest(updated: LeaveRequest): void {
    const requests = this.getRequests().map((r) => (r.id === updated.id ? updated : r));
    this.saveRequests(requests);
  }

  static getHolidays(): Holiday[] {
    const raw = localStorage.getItem(HOLIDAYS_KEY);
    if (!raw) {
      this.saveHolidays(INITIAL_HOLIDAYS);
      return INITIAL_HOLIDAYS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_HOLIDAYS;
    }
  }

  static saveHolidays(holidays: Holiday[]): void {
    localStorage.setItem(HOLIDAYS_KEY, JSON.stringify(holidays));
  }

  static addHoliday(holiday: Holiday): void {
    const holidays = this.getHolidays();
    holidays.push(holiday);
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    this.saveHolidays(holidays);
  }

  static updateHoliday(updated: Holiday): void {
    const holidays = this.getHolidays().map((h) => (h.id === updated.id ? updated : h));
    this.saveHolidays(holidays);
  }

  static deleteHoliday(id: string): void {
    const holidays = this.getHolidays().filter((h) => h.id !== id);
    this.saveHolidays(holidays);
  }

  static getSettings(): Setting[] {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      this.saveSettings(INITIAL_SETTINGS);
      return INITIAL_SETTINGS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_SETTINGS;
    }
  }

  static saveSettings(settings: Setting[]): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  static getSettingValue<T>(key: string, defaultValue: T): T {
    const settings = this.getSettings();
    const item = settings.find((s) => s.key === key);
    return item ? (item.value as unknown as T) : defaultValue;
  }

  static setSettingValue(key: string, value: string | number | boolean): void {
    const settings = this.getSettings();
    const index = settings.findIndex((s) => s.key === key);
    if (index >= 0) {
      settings[index].value = value;
    } else {
      settings.push({ key, value });
    }
    this.saveSettings(settings);
  }

  static getEmailAlerts(): EmailAlert[] {
    const raw = localStorage.getItem(EMAIL_ALERTS_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  static addEmailAlert(alert: EmailAlert): void {
    const alerts = this.getEmailAlerts();
    alerts.unshift(alert);
    localStorage.setItem(EMAIL_ALERTS_KEY, JSON.stringify(alerts.slice(0, 50)));
  }

  static markAlertAsRead(id: string): void {
    const alerts = this.getEmailAlerts().map((a) => (a.id === id ? { ...a, read: true } : a));
    localStorage.setItem(EMAIL_ALERTS_KEY, JSON.stringify(alerts));
  }

  static getCurrentUser(): User | null {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        // Refresh from current users list to get fresh balance
        const fresh = this.getUserById(parsed.id);
        return fresh || parsed;
      } catch {
        // fallback
      }
    }
    // Default to SuperAdmin Ayoub
    const defaultUser = this.getUserById('user_admin_ayoub') || INITIAL_USERS[0];
    this.setCurrentUser(defaultUser);
    return defaultUser;
  }

  static setCurrentUser(user: User | null): void {
    if (user) {
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CURRENT_USER_KEY);
    }
  }

  /**
   * Section 2 Accrual Engine: Accrue monthly days (1.5 days/month)
   */
  static triggerMonthlyAccrual(): { accruedUsersCount: number; rate: number } {
    const rate = this.getSettingValue<number>('monthly_accrual_rate', 1.5);
    const users = this.getUsers().map((u) => {
      if (!u.is_active) return u;
      return {
        ...u,
        current_balance: +(u.current_balance + rate).toFixed(2),
      };
    });
    this.saveUsers(users);
    return { accruedUsersCount: users.length, rate };
  }

  /**
   * Section 2 Year-End Carry-Over Limit:
   * Enforce max carry-over (default 0 = unlimited) on Jan 1st
   */
  static triggerYearEndCarryOver(): { affectedCount: number; maxLimit: number } {
    const limit = this.getSettingValue<number>('max_carry_over_days', 0);
    let affectedCount = 0;
    const users = limit === 0 ? this.getUsers() : this.getUsers().map((u) => {
      if (u.current_balance > limit) {
        affectedCount++;
        return {
          ...u,
          current_balance: limit,
        };
      }
      return u;
    });
    this.saveUsers(users);
    return { affectedCount, maxLimit: limit };
  }

  /**
   * Reset data to initial pristine demo state
   */
  static resetToDemoData(): void {
    localStorage.removeItem(USERS_KEY);
    localStorage.removeItem(REQUESTS_KEY);
    localStorage.removeItem(HOLIDAYS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(EMAIL_ALERTS_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}
