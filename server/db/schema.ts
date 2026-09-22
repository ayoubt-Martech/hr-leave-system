import {
  pgTable,
  text,
  numeric,
  boolean,
  timestamp,
  pgEnum,
  index,
  foreignKey,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['SuperAdmin', 'Manager', 'Employee']);

export const leaveTypeEnum = pgEnum('leave_type', [
  'Vacation',
  'Emergency',
  'Sick Leave',
  'Authorization',
]);

export const specialLeaveTypeEnum = pgEnum('special_leave_type', [
  'Maternity',
  'Paternity',
  'Bereavement',
  'None',
]);

export const halfDayTypeEnum = pgEnum('half_day_type', ['AM', 'PM', 'None']);

export const leaveStatusEnum = pgEnum('leave_status', [
  'Pending',
  'Approved',
  'Declined',
  'CancellationRequested',
  'Cancelled',
]);

export const holidayCategoryEnum = pgEnum('holiday_category', ['National', 'Religious']);

export const auditActionEnum = pgEnum('audit_action', [
  'leave_submitted',
  'leave_approved',
  'leave_declined',
  'leave_cancelled',
  'cancellation_requested',
  'cancellation_approved',
  'cancellation_rejected',
  'user_created',
  'user_updated',
  'user_deleted',
  'user_deactivated',
  'user_activated',
  'balance_adjusted',
  'settings_updated',
  'holiday_added',
  'holiday_deleted',
  'accrual_run',
  'carry_over_run',
  'legacy_import',
  'leave_attachment_uploaded',
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // e.g. 'user_admin_ayoub'
    full_name: text('full_name').notNull(),
    email: text('email').notNull().unique(),
    position: text('position').notNull().default('Team Member'),
    role: userRoleEnum('role').notNull().default('Employee'),
    initial_balance: numeric('initial_balance', { precision: 6, scale: 2 }).notNull().default('18'),
    current_balance: numeric('current_balance', { precision: 6, scale: 2 }).notNull().default('18'),
    is_active: boolean('is_active').notNull().default(true),
    termination_date: text('termination_date'), // 'YYYY-MM-DD', set when a legacy import detects "End of contract"
    avatar_url: text('avatar_url'),
    google_id: text('google_id').unique(), // populated on first OAuth login
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('users_email_idx').on(t.email)]
);

export const employeeManagers = pgTable(
  'employee_managers',
  {
    employee_id: text('employee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    manager_id: text('manager_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.employee_id, t.manager_id] }),
    index('employee_managers_manager_idx').on(t.manager_id),
    index('employee_managers_employee_idx').on(t.employee_id),
  ]
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    start_date: text('start_date').notNull(), // YYYY-MM-DD
    end_date: text('end_date').notNull(),
    return_date: text('return_date').notNull(),
    days_count: numeric('days_count', { precision: 5, scale: 2 }).notNull(),
    type: leaveTypeEnum('type').notNull(),
    is_special: boolean('is_special').notNull().default(false),
    special_type: specialLeaveTypeEnum('special_type').default('None'),
    half_day_type: halfDayTypeEnum('half_day_type').notNull().default('None'),
    is_short_authorization: boolean('is_short_authorization').notNull().default(false),
    note: text('note').notNull().default(''),
    status: leaveStatusEnum('status').notNull().default('Pending'),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    reviewed_by: text('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
    review_note: text('review_note'),
    action_reason: text('action_reason'),
    is_legacy_backfill: boolean('is_legacy_backfill').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('leave_requests_user_idx').on(t.user_id),
    index('leave_requests_status_idx').on(t.status),
    index('leave_requests_dates_idx').on(t.start_date, t.end_date),
  ]
);

export const leaveAttachments = pgTable(
  'leave_attachments',
  {
    id: text('id').primaryKey(),
    leave_request_id: text('leave_request_id')
      .notNull()
      .unique()
      .references(() => leaveRequests.id, { onDelete: 'cascade' }),
    uploaded_by: text('uploaded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    mime_type: text('mime_type').notNull(),
    data: text('data').notNull(), // base64-encoded file content
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('leave_attachments_request_idx').on(t.leave_request_id)]
);

export const holidays = pgTable(
  'holidays',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    date: text('date').notNull(), // YYYY-MM-DD
    is_recurring: boolean('is_recurring').notNull().default(false),
    category: holidayCategoryEnum('category').notNull().default('National'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('holidays_date_idx').on(t.date)]
);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // stored as string, parsed on read
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const emailAlerts = pgTable(
  'email_alerts',
  {
    id: text('id').primaryKey(),
    recipient_id: text('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipient_email: text('recipient_email').notNull(),
    recipient_name: text('recipient_name').notNull(),
    subject: text('subject').notNull(),
    preview: text('preview').notNull(),
    leave_request_id: text('leave_request_id').references(() => leaveRequests.id, {
      onDelete: 'cascade',
    }),
    action_url: text('action_url').notNull(),
    read: boolean('read').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('alerts_recipient_idx').on(t.recipient_id),
    index('alerts_read_idx').on(t.read),
  ]
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actor_id: text('actor_id'), // who performed the action (null = system/cron)
    actor_email: text('actor_email'),
    action: auditActionEnum('action').notNull(),
    target_id: text('target_id'), // user_id or request_id being acted upon
    target_type: text('target_type'), // 'user' | 'leave_request' | 'setting' | 'holiday'
    details: text('details'), // JSON string with relevant before/after data
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_actor_idx').on(t.actor_id),
    index('audit_action_idx').on(t.action),
    index('audit_created_idx').on(t.created_at),
  ]
);

// ─── Type exports (inferred from schema) ──────────────────────────────────────

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type EmployeeManagerRow = typeof employeeManagers.$inferSelect;
export type LeaveRequestRow = typeof leaveRequests.$inferSelect;
export type NewLeaveRequestRow = typeof leaveRequests.$inferInsert;
export type LeaveAttachmentRow = typeof leaveAttachments.$inferSelect;
export type HolidayRow = typeof holidays.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
export type EmailAlertRow = typeof emailAlerts.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
