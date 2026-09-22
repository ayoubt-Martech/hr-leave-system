import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { leaveRequests, users, emailAlerts, employeeManagers, leaveAttachments } from '../db/schema';
import { eq, and, inArray, or, ne } from 'drizzle-orm';
import { requireAuth, requireActiveUser } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { writeAudit } from '../services/audit';
import { sendLeaveNotification } from '../services/email';

const router = Router();
router.use(requireAuth, requireActiveUser);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateRequestSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days_count: z.coerce.number().min(0.25).max(365),
  type: z.enum(['Vacation', 'Emergency', 'Sick Leave', 'Authorization']),
  is_special: z.boolean().default(false),
  special_type: z.enum(['Maternity', 'Paternity', 'Bereavement', 'None']).default('None'),
  half_day_type: z.enum(['AM', 'PM', 'None']).default('None'),
  is_short_authorization: z.boolean().default(false),
  note: z.string().max(1000).default(''),
});

const ReviewSchema = z.object({
  action: z.enum(['approve', 'decline', 'approve_cancellation', 'reject_cancellation']),
  review_note: z.string().max(500).optional(),
});

const ALLOWED_ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8MB

const UploadAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mime_type: z.enum(ALLOWED_ATTACHMENT_TYPES),
  data: z.string().min(1),
});

// ─── GET /api/requests — fetch requests scoped by role ───────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, role } = req.user!;

    let rows;

    if (role === 'SuperAdmin') {
      // SuperAdmin sees everything
      rows = await db
        .select()
        .from(leaveRequests)
        .orderBy(leaveRequests.created_at);
    } else if (role === 'Manager') {
      // Manager sees their own + their direct reports'
      const teamMembers = await db
        .select({ id: employeeManagers.employee_id })
        .from(employeeManagers)
        .where(eq(employeeManagers.manager_id, userId));

      const teamIds = teamMembers.map((u) => u.id);
      const allIds = [userId, ...teamIds];

      rows = await db
        .select()
        .from(leaveRequests)
        .where(inArray(leaveRequests.user_id, allIds))
        .orderBy(leaveRequests.created_at);
    } else {
      // Employee sees only their own
      rows = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.user_id, userId))
        .orderBy(leaveRequests.created_at);
    }

    const attachmentRows = rows.length
      ? await db
          .select({
            leave_request_id: leaveAttachments.leave_request_id,
            filename: leaveAttachments.filename,
            mime_type: leaveAttachments.mime_type,
            created_at: leaveAttachments.created_at,
          })
          .from(leaveAttachments)
          .where(inArray(leaveAttachments.leave_request_id, rows.map((r) => r.id)))
      : [];

    const attachmentByRequest = new Map(attachmentRows.map((a) => [a.leave_request_id, a]));
    const rowsWithAttachment = rows.map((r) => ({
      ...r,
      attachment: attachmentByRequest.get(r.id)
        ? {
            filename: attachmentByRequest.get(r.id)!.filename,
            mime_type: attachmentByRequest.get(r.id)!.mime_type,
            uploaded_at: attachmentByRequest.get(r.id)!.created_at,
          }
        : null,
    }));

    res.json(rowsWithAttachment);
  } catch {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// ─── GET /api/requests/calendar — company-wide feed for the Team Calendar ────
// Unscoped by role (every active user can see the whole company's schedule —
// matches the existing calendar copy). Deliberately excludes note/review_note/
// action_reason so nothing private leaks; only what's needed to spot overlaps.

router.get('/calendar', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: leaveRequests.id,
        user_id: leaveRequests.user_id,
        start_date: leaveRequests.start_date,
        end_date: leaveRequests.end_date,
        days_count: leaveRequests.days_count,
        type: leaveRequests.type,
        half_day_type: leaveRequests.half_day_type,
        status: leaveRequests.status,
      })
      .from(leaveRequests)
      .where(inArray(leaveRequests.status, ['Approved', 'Pending', 'CancellationRequested']))
      .orderBy(leaveRequests.start_date);

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// ─── POST /api/requests — submit a new leave request ─────────────────────────

router.post(
  '/',
  validate(CreateRequestSchema),
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as z.infer<typeof CreateRequestSchema>;
    const { userId } = req.user!;

    // Enforce max 2 concurrent pending requests per employee
    const pendingCount = await db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(
        and(eq(leaveRequests.user_id, userId), eq(leaveRequests.status, 'Pending'))
      );

    if (pendingCount.length >= 2) {
      res.status(400).json({
        error: 'You already have 2 pending leave requests. Wait for a decision before submitting another.',
      });
      return;
    }

    // Date validation
    if (data.start_date > data.end_date) {
      res.status(400).json({ error: 'End date must be on or after start date' });
      return;
    }

    // Lead-time rules — waived for Emergency/Sick Leave, which are by nature unplannable
    if (data.type !== 'Emergency' && data.type !== 'Sick Leave') {
      const addDays = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
      };

      const minStartDate = addDays(1);
      if (data.start_date < minStartDate) {
        res.status(400).json({
          error: 'Leave requests need at least 24 hours notice — the earliest start date is tomorrow.',
        });
        return;
      }

      if (data.days_count > 3) {
        const minAdvanceDate = addDays(15);
        if (data.start_date < minAdvanceDate) {
          res.status(400).json({
            error: 'Requests longer than 3 days need at least 15 days notice.',
          });
          return;
        }
      }
    }

    // Overlap check against active (Pending or Approved) requests
    const existing = await db
      .select({ start_date: leaveRequests.start_date, end_date: leaveRequests.end_date })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.user_id, userId),
          inArray(leaveRequests.status, ['Pending', 'Approved'])
        )
      );

    const hasOverlap = existing.some(
      (r) => data.start_date <= r.end_date && data.end_date >= r.start_date
    );

    if (hasOverlap) {
      res.status(400).json({
        error: 'Date range overlaps with an existing pending or approved leave request',
      });
      return;
    }

    try {
      const [created] = await db
        .insert(leaveRequests)
        .values({
          id: `req_${Date.now()}`,
          user_id: userId,
          start_date: data.start_date,
          end_date: data.end_date,
          return_date: data.return_date,
          days_count: String(data.days_count),
          type: data.type,
          is_special: data.is_special,
          special_type: data.special_type,
          half_day_type: data.half_day_type,
          is_short_authorization: data.is_short_authorization,
          note: data.note,
          status: 'Pending',
        })
        .returning();

      // Create in-app alert for every assigned manager + send emails
      const [employee] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (employee) {
        const managerLinks = await db
          .select({ manager_id: employeeManagers.manager_id })
          .from(employeeManagers)
          .where(eq(employeeManagers.employee_id, employee.id));

        for (const link of managerLinks) {
          try {
            const [manager] = await db
              .select()
              .from(users)
              .where(eq(users.id, link.manager_id))
              .limit(1);

            if (!manager) continue;

            await db.insert(emailAlerts).values({
              id: `alert_${Date.now()}_${manager.id}`,
              recipient_id: manager.id,
              recipient_email: manager.email,
              recipient_name: manager.full_name,
              subject: `Leave Request: ${employee.full_name} (${data.days_count} days)`,
              preview: `${employee.full_name} submitted a ${data.type} request from ${data.start_date} to ${data.end_date}.`,
              leave_request_id: created.id,
              action_url: `/approvals?req=${created.id}`,
            });

            await sendLeaveNotification('submitted', {
              employeeName: employee.full_name,
              managerEmail: manager.email,
              managerName: manager.full_name,
              leaveType: data.type,
              startDate: data.start_date,
              endDate: data.end_date,
              daysCount: data.days_count,
              note: data.note,
              requestId: created.id,
            });
          } catch (notifyErr) {
            console.error(`[requests] Failed to notify manager ${link.manager_id}:`, notifyErr);
          }
        }
      }

      await writeAudit({
        actor: req.user,
        action: 'leave_submitted',
        targetId: created.id,
        targetType: 'leave_request',
        details: { type: data.type, days: data.days_count },
      });

      res.status(201).json(created);
    } catch {
      res.status(500).json({ error: 'Failed to submit leave request' });
    }
  }
);

// ─── POST /api/requests/:id/cancel — employee cancels their own pending request ─

router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { userId } = req.user!;

  try {
    const [reqRow] = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
      .limit(1);

    if (!reqRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (reqRow.user_id !== userId) {
      res.status(403).json({ error: 'Not your request' });
      return;
    }

    if (reqRow.status === 'Pending') {
      // Cancel immediately
      const [updated] = await db
        .update(leaveRequests)
        .set({ status: 'Cancelled', updated_at: new Date() })
        .where(eq(leaveRequests.id, id))
        .returning();

      await writeAudit({
        actor: req.user,
        action: 'leave_cancelled',
        targetId: id,
        targetType: 'leave_request',
      });

      res.json(updated);
      return;
    }

    if (reqRow.status === 'Approved') {
      // Request cancellation — needs manager approval
      const [updated] = await db
        .update(leaveRequests)
        .set({
          status: 'CancellationRequested',
          action_reason: req.body.reason ?? '',
          updated_at: new Date(),
        })
        .where(eq(leaveRequests.id, id))
        .returning();

      // Alert every assigned manager
      const [employee] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (employee) {
        const managerLinks = await db
          .select({ manager_id: employeeManagers.manager_id })
          .from(employeeManagers)
          .where(eq(employeeManagers.employee_id, employee.id));

        for (const link of managerLinks) {
          try {
            const [manager] = await db
              .select()
              .from(users)
              .where(eq(users.id, link.manager_id))
              .limit(1);

            if (!manager) continue;

            await db.insert(emailAlerts).values({
              id: `alert_${Date.now()}_${manager.id}`,
              recipient_id: manager.id,
              recipient_email: manager.email,
              recipient_name: manager.full_name,
              subject: `Cancellation Request: ${employee.full_name}`,
              preview: `${employee.full_name} wants to cancel their approved ${reqRow.type} leave (${reqRow.days_count} days).`,
              leave_request_id: id,
              action_url: `/approvals?req=${id}`,
            });

            await sendLeaveNotification('cancellation_requested', {
              employeeName: employee.full_name,
              managerEmail: manager.email,
              managerName: manager.full_name,
              leaveType: reqRow.type as string,
              startDate: reqRow.start_date,
              endDate: reqRow.end_date,
              daysCount: Number(reqRow.days_count),
              note: req.body.reason ?? '',
              requestId: id,
            });
          } catch (notifyErr) {
            console.error(`[requests] Failed to notify manager ${link.manager_id}:`, notifyErr);
          }
        }
      }

      await writeAudit({
        actor: req.user,
        action: 'cancellation_requested',
        targetId: id,
        targetType: 'leave_request',
      });

      res.json(updated);
      return;
    }

    res.status(400).json({ error: `Cannot cancel a request with status: ${reqRow.status}` });
  } catch {
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// ─── POST /api/requests/:id/review — manager approves or declines ─────────────

router.post(
  '/:id/review',
  validate(ReviewSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { action, review_note } = req.body as z.infer<typeof ReviewSchema>;
    const reviewer = req.user!;

    if (reviewer.role !== 'Manager' && reviewer.role !== 'SuperAdmin') {
      res.status(403).json({ error: 'Manager role required to review requests' });
      return;
    }

    try {
      const [reqRow] = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, id))
        .limit(1);

      if (!reqRow) {
        res.status(404).json({ error: 'Request not found' });
        return;
      }

      // Ensure the reviewer manages this employee (or is SuperAdmin)
      if (reviewer.role !== 'SuperAdmin') {
        const [link] = await db
          .select({ employee_id: employeeManagers.employee_id })
          .from(employeeManagers)
          .where(
            and(
              eq(employeeManagers.employee_id, reqRow.user_id),
              eq(employeeManagers.manager_id, reviewer.userId)
            )
          )
          .limit(1);

        if (!link) {
          res.status(403).json({ error: 'This employee is not in your team' });
          return;
        }
      }

      const [employee] = await db
        .select()
        .from(users)
        .where(eq(users.id, reqRow.user_id))
        .limit(1);

      if (!employee) {
        res.status(404).json({ error: 'Employee not found' });
        return;
      }

      let updated;

      if (action === 'approve' && reqRow.status === 'Pending') {
        // Deduct days from employee balance
        const newBalance = +(Number(employee.current_balance) - Number(reqRow.days_count)).toFixed(2);
        await db
          .update(users)
          .set({ current_balance: String(newBalance), updated_at: new Date() })
          .where(eq(users.id, employee.id));

        [updated] = await db
          .update(leaveRequests)
          .set({
            status: 'Approved',
            reviewed_at: new Date(),
            reviewed_by: reviewer.userId,
            review_note: review_note ?? 'Approved',
            updated_at: new Date(),
          })
          .where(eq(leaveRequests.id, id))
          .returning();

        await sendLeaveNotification('approved', {
          employeeName: employee.full_name,
          managerEmail: employee.email,
          managerName: employee.full_name,
          leaveType: reqRow.type as string,
          startDate: reqRow.start_date,
          endDate: reqRow.end_date,
          daysCount: Number(reqRow.days_count),
          note: review_note ?? '',
          requestId: id,
          employeeEmail: employee.email,
        });

        await writeAudit({
          actor: reviewer,
          action: 'leave_approved',
          targetId: id,
          targetType: 'leave_request',
          details: { newBalance, days: reqRow.days_count },
        });
      } else if (action === 'decline' && reqRow.status === 'Pending') {
        [updated] = await db
          .update(leaveRequests)
          .set({
            status: 'Declined',
            reviewed_at: new Date(),
            reviewed_by: reviewer.userId,
            review_note: review_note ?? 'Declined',
            updated_at: new Date(),
          })
          .where(eq(leaveRequests.id, id))
          .returning();

        await sendLeaveNotification('declined', {
          employeeName: employee.full_name,
          managerEmail: employee.email,
          managerName: employee.full_name,
          leaveType: reqRow.type as string,
          startDate: reqRow.start_date,
          endDate: reqRow.end_date,
          daysCount: Number(reqRow.days_count),
          note: review_note ?? '',
          requestId: id,
          employeeEmail: employee.email,
        });

        await writeAudit({
          actor: reviewer,
          action: 'leave_declined',
          targetId: id,
          targetType: 'leave_request',
          details: { reason: review_note },
        });
      } else if (action === 'approve_cancellation' && reqRow.status === 'CancellationRequested') {
        // Restore days to employee
        const restoredBalance = +(
          Number(employee.current_balance) + Number(reqRow.days_count)
        ).toFixed(2);
        await db
          .update(users)
          .set({ current_balance: String(restoredBalance), updated_at: new Date() })
          .where(eq(users.id, employee.id));

        [updated] = await db
          .update(leaveRequests)
          .set({
            status: 'Cancelled',
            reviewed_at: new Date(),
            reviewed_by: reviewer.userId,
            review_note: 'Cancellation approved. Balance restored.',
            updated_at: new Date(),
          })
          .where(eq(leaveRequests.id, id))
          .returning();

        await sendLeaveNotification('cancellation_approved', {
          employeeName: employee.full_name,
          managerEmail: employee.email,
          managerName: employee.full_name,
          leaveType: reqRow.type as string,
          startDate: reqRow.start_date,
          endDate: reqRow.end_date,
          daysCount: Number(reqRow.days_count),
          note: '',
          requestId: id,
          employeeEmail: employee.email,
        });

        await writeAudit({
          actor: reviewer,
          action: 'cancellation_approved',
          targetId: id,
          targetType: 'leave_request',
          details: { restoredBalance, days: reqRow.days_count },
        });
      } else if (action === 'reject_cancellation' && reqRow.status === 'CancellationRequested') {
        [updated] = await db
          .update(leaveRequests)
          .set({
            status: 'Approved',
            action_reason: 'Cancellation declined. Leave remains approved.',
            updated_at: new Date(),
          })
          .where(eq(leaveRequests.id, id))
          .returning();

        await sendLeaveNotification('cancellation_rejected', {
          employeeName: employee.full_name,
          managerEmail: employee.email,
          managerName: employee.full_name,
          leaveType: reqRow.type as string,
          startDate: reqRow.start_date,
          endDate: reqRow.end_date,
          daysCount: Number(reqRow.days_count),
          note: '',
          requestId: id,
          employeeEmail: employee.email,
        });

        await writeAudit({
          actor: reviewer,
          action: 'cancellation_rejected',
          targetId: id,
          targetType: 'leave_request',
        });
      } else {
        res.status(400).json({
          error: `Action '${action}' is not valid for a request with status '${reqRow.status}'`,
        });
        return;
      }

      res.json(updated);
    } catch {
      res.status(500).json({ error: 'Failed to review request' });
    }
  }
);

// ─── POST /api/requests/:id/attachment — upload/replace sick leave proof ─────
// Only the employee who owns the request (or SuperAdmin) can upload, and only
// once the request is an Approved Sick Leave — this is proof for leave that
// already happened, not a submission-time requirement.

router.post(
  '/:id/attachment',
  validate(UploadAttachmentSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { filename, mime_type, data } = req.body as z.infer<typeof UploadAttachmentSchema>;
    const { userId, role } = req.user!;

    try {
      const [reqRow] = await db
        .select()
        .from(leaveRequests)
        .where(eq(leaveRequests.id, id))
        .limit(1);

      if (!reqRow) {
        res.status(404).json({ error: 'Request not found' });
        return;
      }

      if (reqRow.user_id !== userId && role !== 'SuperAdmin') {
        res.status(403).json({ error: 'You can only upload proof for your own leave request' });
        return;
      }

      if (reqRow.type !== 'Sick Leave') {
        res.status(400).json({ error: 'Proof documents can only be attached to Sick Leave requests' });
        return;
      }

      if (reqRow.status !== 'Approved') {
        res.status(400).json({ error: 'Proof can only be uploaded once the leave has been approved' });
        return;
      }

      // Accept a raw base64 string or a data: URL — strip the prefix if present
      const base64 = data.includes(',') ? data.split(',').slice(1).join(',') : data;

      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        res.status(400).json({ error: 'Invalid file data' });
        return;
      }

      const approxBytes = Math.ceil((base64.length * 3) / 4);
      if (approxBytes > MAX_ATTACHMENT_BYTES) {
        res.status(400).json({ error: 'File is too large — max 8MB.' });
        return;
      }

      const [attachment] = await db
        .insert(leaveAttachments)
        .values({
          id: `att_${Date.now()}`,
          leave_request_id: id,
          uploaded_by: userId,
          filename,
          mime_type,
          data: base64,
        })
        .onConflictDoUpdate({
          target: leaveAttachments.leave_request_id,
          set: { filename, mime_type, data: base64, uploaded_by: userId, created_at: new Date() },
        })
        .returning({
          filename: leaveAttachments.filename,
          mime_type: leaveAttachments.mime_type,
          created_at: leaveAttachments.created_at,
        });

      await writeAudit({
        actor: req.user,
        action: 'leave_attachment_uploaded',
        targetId: id,
        targetType: 'leave_request',
        details: { filename, mime_type },
      });

      res.status(201).json({ ...attachment, uploaded_at: attachment.created_at });
    } catch {
      res.status(500).json({ error: 'Failed to upload proof document' });
    }
  }
);

// ─── GET /api/requests/:id/attachment — view/download the proof document ─────
// Owner, their assigned manager(s), or SuperAdmin only.

router.get('/:id/attachment', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { userId, role } = req.user!;

  try {
    const [reqRow] = await db
      .select()
      .from(leaveRequests)
      .where(eq(leaveRequests.id, id))
      .limit(1);

    if (!reqRow) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    let authorized = reqRow.user_id === userId || role === 'SuperAdmin';
    if (!authorized && role === 'Manager') {
      const [link] = await db
        .select({ employee_id: employeeManagers.employee_id })
        .from(employeeManagers)
        .where(
          and(
            eq(employeeManagers.employee_id, reqRow.user_id),
            eq(employeeManagers.manager_id, userId)
          )
        )
        .limit(1);
      authorized = !!link;
    }

    if (!authorized) {
      res.status(403).json({ error: 'Not authorized to view this document' });
      return;
    }

    const [attachment] = await db
      .select()
      .from(leaveAttachments)
      .where(eq(leaveAttachments.leave_request_id, id))
      .limit(1);

    if (!attachment) {
      res.status(404).json({ error: 'No proof document uploaded for this request' });
      return;
    }

    const buffer = Buffer.from(attachment.data, 'base64');
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.filename.replace(/"/g, '')}"`);
    res.send(buffer);
  } catch {
    res.status(500).json({ error: 'Failed to fetch proof document' });
  }
});

export default router;
