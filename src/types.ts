export type UserRole = 'SuperAdmin' | 'Manager' | 'Employee';

export interface User {
  id: string;
  full_name: string;
  email: string;
  position: string;
  role: UserRole;
  manager_ids: string[];
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
  termination_date?: string | null;
  avatar_url?: string;
  created_at?: string;
}

export type LeaveType = 'Vacation' | 'Emergency' | 'Sick Leave' | 'Authorization';
export type SpecialLeaveType = 'Maternity' | 'Paternity' | 'Bereavement' | 'None';
export type HalfDayType = 'AM' | 'PM' | 'None';
export type LeaveStatus = 'Pending' | 'Approved' | 'Declined' | 'CancellationRequested' | 'Cancelled';

export interface LeaveRequest {
  id: string;
  user_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  return_date: string;// YYYY-MM-DD (next working day)
  days_count: number;
  type: LeaveType;
  is_special: boolean;
  special_type?: SpecialLeaveType;
  half_day_type: HalfDayType;
  is_short_authorization?: boolean; // 0.25 day / 2 hrs
  note: string;
  status: LeaveStatus;
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  review_note?: string;
  action_reason?: string;
  is_legacy_backfill?: boolean;
  /** Sick leave proof document, if one has been uploaded (metadata only — no file content). */
  attachment?: LeaveAttachmentMeta | null;
}

export interface LeaveAttachmentMeta {
  filename: string;
  mime_type: string;
  uploaded_at: string;
}

/** Minimal, privacy-limited leave entry used by the company-wide Team Calendar. */
export interface CalendarLeaveEntry {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  days_count: number;
  type: LeaveType;
  half_day_type: HalfDayType;
  status: LeaveStatus;
}

export interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  is_recurring: boolean;
  category?: 'National' | 'Religious';
}

export interface Setting {
  key: string;
  value: string | number | boolean;
}

export interface EmailAlert {
  id: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  preview: string;
  leave_request_id: string;
  created_at: string;
  action_url: string;
  read: boolean;
}

export interface DateCalculationResult {
  totalCalendarDays: number;
  weekendDays: number;
  holidayDays: number;
  holidaysEncountered: Holiday[];
  effectiveWorkingDays: number;
  returnDate: string;
  isValid: boolean;
  error?: string;
}

export type MigrationAction = 'create' | 'map' | 'skip';

export interface MigrationLeaveRow {
  start_date: string;
  end_date: string;
  return_date: string | null;
  days_count: number;
  type: LeaveType;
  note: string;
}

/** One row of the Excel-migration review table: an editable, admin-confirmed
 *  resolution for a single legacy worksheet, ready to be sent to the import endpoint. */
export interface MigrationSheetReview {
  sheetName: string;
  employeeName: string;
  isEmpty: boolean;
  action: MigrationAction;
  mappedUserId: string | null;
  matchConfidence: 'exact_name' | 'exact_email' | 'none';
  isTerminated: boolean;
  terminationDate: string | null;
  openingBalance: number;
  balanceSource: 'initial_solde' | 'remaining' | 'none';
  newUserEmail: string;
  newUserPosition: string;
  leaveRows: MigrationLeaveRow[];
}

export interface MigrationImportSummary {
  created: number;
  mapped: number;
  skipped: number;
  leaveRowsInserted: number;
}
