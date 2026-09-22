import nodemailer from 'nodemailer';

// ─── Transporter ─────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `"MMG-HR" <${process.env.SMTP_FROM ?? process.env.SMTP_USER}>`;
const APP_URL = process.env.FRONTEND_URL ?? process.env.APP_URL ?? '';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NotificationType =
  | 'submitted'
  | 'approved'
  | 'declined'
  | 'cancellation_requested'
  | 'cancellation_approved'
  | 'cancellation_rejected';

export interface LeaveNotificationData {
  employeeName: string;
  managerEmail: string;
  managerName: string;
  employeeEmail?: string; // for approved/declined, sent to employee
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  note: string;
  requestId: string;
}

export interface WelcomeEmailData {
  fullName: string;
  email: string;
}

// ─── HTML template helper ────────────────────────────────────────────────────

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f4f4f5; margin:0; padding:24px; }
    .card { background:#fff; border-radius:12px; max-width:560px; margin:0 auto; padding:32px; border:1px solid #e4e4e7; }
    .brand { font-size:13px; font-weight:700; color:#18181b; letter-spacing:.5px; margin-bottom:24px; }
    h2 { font-size:18px; color:#18181b; margin:0 0 8px; }
    p { font-size:14px; color:#52525b; line-height:1.6; margin:0 0 12px; }
    .meta { background:#f4f4f5; border-radius:8px; padding:16px; margin:16px 0; font-size:13px; color:#3f3f46; }
    .meta strong { color:#18181b; }
    .btn { display:inline-block; background:#18181b; color:#fff; font-size:13px; font-weight:600; padding:10px 20px; border-radius:8px; text-decoration:none; margin-top:16px; }
    .footer { font-size:11px; color:#a1a1aa; text-align:center; margin-top:24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">MMG-HR · Momentum Marketing Group</div>
    ${body}
    <div class="footer">MMG-HR Leave Management System · Momentum Marketing Group</div>
  </div>
</body>
</html>`;
}

// ─── Email templates ──────────────────────────────────────────────────────────

function submittedEmail(d: LeaveNotificationData) {
  return {
    to: d.managerEmail,
    subject: `Leave Request: ${d.employeeName} — ${d.daysCount} day(s) ${d.leaveType}`,
    html: baseTemplate(
      'New Leave Request',
      `<h2>New Leave Request</h2>
      <p><strong>${d.employeeName}</strong> has submitted a leave request that requires your review.</p>
      <div class="meta">
        <p><strong>Type:</strong> ${d.leaveType}</p>
        <p><strong>Duration:</strong> ${d.startDate} → ${d.endDate} (${d.daysCount} working day(s))</p>
        ${d.note ? `<p><strong>Note:</strong> ${d.note}</p>` : ''}
      </div>
      <a href="${APP_URL}/approvals?req=${d.requestId}" class="btn">Review Request →</a>`
    ),
  };
}

function approvedEmail(d: LeaveNotificationData) {
  return {
    to: d.employeeEmail!,
    subject: `Your Leave Request Has Been Approved ✓`,
    html: baseTemplate(
      'Leave Approved',
      `<h2>Leave Request Approved</h2>
      <p>Your leave request has been approved.</p>
      <div class="meta">
        <p><strong>Type:</strong> ${d.leaveType}</p>
        <p><strong>Duration:</strong> ${d.startDate} → ${d.endDate} (${d.daysCount} working day(s))</p>
        ${d.note ? `<p><strong>Manager note:</strong> ${d.note}</p>` : ''}
      </div>
      <a href="${APP_URL}/" class="btn">View My Leaves →</a>`
    ),
  };
}

function declinedEmail(d: LeaveNotificationData) {
  return {
    to: d.employeeEmail!,
    subject: `Your Leave Request Has Been Declined`,
    html: baseTemplate(
      'Leave Declined',
      `<h2>Leave Request Declined</h2>
      <p>Unfortunately your leave request has been declined.</p>
      <div class="meta">
        <p><strong>Type:</strong> ${d.leaveType}</p>
        <p><strong>Duration:</strong> ${d.startDate} → ${d.endDate} (${d.daysCount} day(s))</p>
        ${d.note ? `<p><strong>Reason:</strong> ${d.note}</p>` : ''}
      </div>
      <a href="${APP_URL}/" class="btn">View My Leaves →</a>`
    ),
  };
}

function cancellationEmail(d: LeaveNotificationData) {
  return {
    to: d.managerEmail,
    subject: `Cancellation Request: ${d.employeeName} — ${d.leaveType}`,
    html: baseTemplate(
      'Cancellation Request',
      `<h2>Leave Cancellation Request</h2>
      <p><strong>${d.employeeName}</strong> is requesting to cancel an already-approved leave.</p>
      <div class="meta">
        <p><strong>Type:</strong> ${d.leaveType}</p>
        <p><strong>Duration:</strong> ${d.startDate} → ${d.endDate} (${d.daysCount} day(s))</p>
        ${d.note ? `<p><strong>Reason:</strong> ${d.note}</p>` : ''}
      </div>
      <a href="${APP_URL}/approvals?req=${d.requestId}" class="btn">Review Cancellation →</a>`
    ),
  };
}

function cancellationApprovedEmail(d: LeaveNotificationData) {
  return {
    to: d.employeeEmail!,
    subject: `Your Leave Cancellation Has Been Approved`,
    html: baseTemplate(
      'Cancellation Approved',
      `<h2>Leave Cancellation Approved</h2>
      <p>Your request to cancel the following leave has been approved, and your balance has been restored.</p>
      <div class="meta">
        <p><strong>Type:</strong> ${d.leaveType}</p>
        <p><strong>Duration:</strong> ${d.startDate} → ${d.endDate} (${d.daysCount} day(s) restored)</p>
      </div>
      <a href="${APP_URL}/" class="btn">View My Leaves →</a>`
    ),
  };
}

function cancellationRejectedEmail(d: LeaveNotificationData) {
  return {
    to: d.employeeEmail!,
    subject: `Your Leave Cancellation Request Was Declined`,
    html: baseTemplate(
      'Cancellation Declined',
      `<h2>Leave Cancellation Declined</h2>
      <p>Your request to cancel the following leave was declined — it remains approved on the calendar.</p>
      <div class="meta">
        <p><strong>Type:</strong> ${d.leaveType}</p>
        <p><strong>Duration:</strong> ${d.startDate} → ${d.endDate} (${d.daysCount} day(s))</p>
      </div>
      <a href="${APP_URL}/" class="btn">View My Leaves →</a>`
    ),
  };
}

// ─── Public send function ─────────────────────────────────────────────────────

export async function sendLeaveNotification(
  type: NotificationType,
  data: LeaveNotificationData
): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.warn('[email] SMTP_HOST not configured — skipping email notification');
    return;
  }

  let mail: { to: string; subject: string; html: string };

  switch (type) {
    case 'submitted':
      mail = submittedEmail(data);
      break;
    case 'approved':
      mail = approvedEmail(data);
      break;
    case 'declined':
      mail = declinedEmail(data);
      break;
    case 'cancellation_requested':
      mail = cancellationEmail(data);
      break;
    case 'cancellation_approved':
      mail = cancellationApprovedEmail(data);
      break;
    case 'cancellation_rejected':
      mail = cancellationRejectedEmail(data);
      break;
    default:
      return;
  }

  try {
    await transporter.sendMail({ from: FROM, ...mail });
    console.log(`[email] Sent '${type}' notification to ${mail.to}`);
  } catch (err: any) {
    // Email failures must never crash the main request
    console.error(`[email] Failed to send '${type}' to ${mail.to}: ${err.message}`);
  }
}

function welcomeEmail(d: WelcomeEmailData) {
  return {
    to: d.email,
    subject: `Welcome to MMG-HR`,
    html: baseTemplate(
      'Welcome to MMG-HR',
      `<h2>Welcome, ${d.fullName}!</h2>
      <p>An account has been created for you on MMG-HR, Momentum Marketing Group's leave management system.</p>
      <div class="meta">
        <p>Sign in with your company Google account (<strong>${d.email}</strong>) to request time off, check your balance, and see the team calendar.</p>
      </div>
      <a href="${APP_URL}/" class="btn">Sign In →</a>`
    ),
  };
}

/** Send a welcome email when a SuperAdmin creates a new user account */
export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.warn('[email] SMTP_HOST not configured — skipping welcome email');
    return;
  }

  const mail = welcomeEmail(data);
  try {
    await transporter.sendMail({ from: FROM, ...mail });
    console.log(`[email] Sent welcome email to ${mail.to}`);
  } catch (err: any) {
    console.error(`[email] Failed to send welcome email to ${mail.to}: ${err.message}`);
  }
}

/** Send a plain-text system alert to HR (used by cron jobs) */
export async function sendSystemAlert(subject: string, text: string): Promise<void> {
  if (!process.env.SMTP_HOST || !process.env.HR_EMAIL) return;

  try {
    await transporter.sendMail({
      from: FROM,
      to: process.env.HR_EMAIL,
      subject: `[MMG-HR System] ${subject}`,
      text,
    });
  } catch (err: any) {
    console.error(`[email] Failed to send system alert: ${err.message}`);
  }
}
