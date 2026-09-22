/**
 * Legacy Excel data migration — SuperAdmin only.
 *
 * The client parses the uploaded "Absence Leave.xlsx"-shaped workbook
 * entirely in the browser (src/utils/excelMigration.ts) and lets the
 * SuperAdmin review/edit the per-sheet mapping before committing. This
 * route only validates and writes the finalized batch in one transaction.
 */
import { Router, Request, Response } from 'express';
import { eq, inArray } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { db } from '../db/client';
import { users, leaveRequests, employeeManagers } from '../db/schema';
import { requireAuth, requireSuperAdmin, requireActiveUser } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { writeAudit } from '../services/audit';

const router = Router();
router.use(requireAuth, requireActiveUser, requireSuperAdmin);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ImportLeaveRowSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  return_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  days_count: z.coerce.number().min(0.01).max(365),
  type: z.enum(['Vacation', 'Emergency', 'Sick Leave', 'Authorization']),
  note: z.string().max(1000).default(''),
});

const ImportSheetSchema = z.object({
  sheetName: z.string().min(1),
  action: z.enum(['create', 'map', 'skip']),
  mappedUserId: z.string().nullable().default(null),
  isTerminated: z.boolean().default(false),
  terminationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  openingBalance: z.coerce.number().min(-365).max(365).default(0),
  newUser: z
    .object({
      full_name: z.string().min(2).max(100),
      email: z.string().email().toLowerCase(),
      position: z.string().min(1).max(100).default('Team Member'),
      manager_ids: z.array(z.string()).default([]),
    })
    .optional(),
  leaveRows: z.array(ImportLeaveRowSchema).default([]),
});

const ImportBatchSchema = z.object({
  sheets: z.array(ImportSheetSchema).min(1),
});

type ImportSheet = z.infer<typeof ImportSheetSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── POST /api/migration/import ────────────────────────────────────────────────

router.post(
  '/import',
  validate(ImportBatchSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { sheets } = req.body as z.infer<typeof ImportBatchSchema>;

    const summary = { created: 0, mapped: 0, skipped: 0, leaveRowsInserted: 0 };
    const errors: { sheetName: string; error: string }[] = [];

    try {
      await db.transaction(async (tx) => {
        for (const sheet of sheets as ImportSheet[]) {
          if (sheet.action === 'skip') {
            summary.skipped++;
            continue;
          }

          let userId: string;

          if (sheet.action === 'create') {
            if (!sheet.newUser) {
              throw new Error(`Sheet "${sheet.sheetName}": newUser is required for action 'create'`);
            }

            const [existingByEmail] = await tx
              .select({ id: users.id })
              .from(users)
              .where(eq(users.email, sheet.newUser.email))
              .limit(1);

            if (existingByEmail) {
              throw new Error(
                `Sheet "${sheet.sheetName}": a user with email ${sheet.newUser.email} already exists — map to that user instead of creating a new one`
              );
            }

            userId = newId('user_legacy');
            await tx.insert(users).values({
              id: userId,
              full_name: sheet.newUser.full_name,
              email: sheet.newUser.email,
              position: sheet.newUser.position,
              role: 'Employee',
              initial_balance: String(sheet.openingBalance),
              current_balance: String(sheet.openingBalance),
              is_active: !sheet.isTerminated,
              termination_date: sheet.isTerminated ? sheet.terminationDate : null,
            });

            if (sheet.newUser.manager_ids.length) {
              await tx.insert(employeeManagers).values(
                sheet.newUser.manager_ids.map((manager_id) => ({ employee_id: userId, manager_id }))
              );
            }
            summary.created++;
          } else {
            // action === 'map'
            if (!sheet.mappedUserId) {
              throw new Error(`Sheet "${sheet.sheetName}": mappedUserId is required for action 'map'`);
            }

            const [target] = await tx
              .select({ id: users.id })
              .from(users)
              .where(eq(users.id, sheet.mappedUserId))
              .limit(1);

            if (!target) {
              throw new Error(`Sheet "${sheet.sheetName}": mapped user ${sheet.mappedUserId} not found`);
            }

            userId = target.id;

            if (sheet.isTerminated) {
              await tx
                .update(users)
                .set({
                  is_active: false,
                  termination_date: sheet.terminationDate,
                  updated_at: new Date(),
                })
                .where(eq(users.id, userId));
            }
            summary.mapped++;
          }

          if (sheet.leaveRows.length > 0) {
            await tx.insert(leaveRequests).values(
              sheet.leaveRows.map((r) => ({
                id: newId('req'),
                user_id: userId,
                start_date: r.start_date,
                end_date: r.end_date,
                return_date: r.return_date ?? r.end_date,
                days_count: String(r.days_count),
                type: r.type,
                status: 'Approved' as const,
                is_legacy_backfill: true,
                note: r.note,
                reviewed_by: req.user!.userId,
                reviewed_at: new Date(),
                review_note: 'Imported from legacy Excel tracker',
              }))
            );
            summary.leaveRowsInserted += sheet.leaveRows.length;
          }
        }
      });

      await writeAudit({
        actor: req.user,
        action: 'legacy_import',
        details: summary,
      });

      res.json({ message: 'Import complete', summary });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? 'Import failed', summary, errors });
    }
  }
);

// ─── GET /api/migration/export — download current data as .xlsx ──────────────

router.get('/export', async (_req: Request, res: Response): Promise<void> => {
  try {
    const allUsers = await db.select().from(users).orderBy(users.full_name);
    const allRequests = await db.select().from(leaveRequests).orderBy(leaveRequests.start_date);

    const managerLinks = allUsers.length
      ? await db
          .select({ employee_id: employeeManagers.employee_id, manager_id: employeeManagers.manager_id })
          .from(employeeManagers)
          .where(inArray(employeeManagers.employee_id, allUsers.map((u) => u.id)))
      : [];
    const namesById = new Map(allUsers.map((u) => [u.id, u.full_name]));
    const managerNamesByEmployee = new Map<string, string[]>();
    for (const link of managerLinks) {
      const list = managerNamesByEmployee.get(link.employee_id) ?? [];
      list.push(namesById.get(link.manager_id) ?? link.manager_id);
      managerNamesByEmployee.set(link.employee_id, list);
    }

    const wb = XLSX.utils.book_new();

    const usersSheet = XLSX.utils.json_to_sheet(
      allUsers.map((u) => ({
        ID: u.id,
        'Full Name': u.full_name,
        Email: u.email,
        Position: u.position,
        Role: u.role,
        Managers: (managerNamesByEmployee.get(u.id) ?? []).join(', '),
        'Initial Balance': u.initial_balance,
        'Current Balance': u.current_balance,
        Active: u.is_active,
        'Termination Date': u.termination_date ?? '',
      }))
    );
    XLSX.utils.book_append_sheet(wb, usersSheet, 'Users');

    const requestsSheet = XLSX.utils.json_to_sheet(
      allRequests.map((r) => ({
        ID: r.id,
        'User ID': r.user_id,
        'Start Date': r.start_date,
        'End Date': r.end_date,
        'Return Date': r.return_date,
        Days: r.days_count,
        Type: r.type,
        Status: r.status,
        'Legacy Backfill': r.is_legacy_backfill,
        Note: r.note,
      }))
    );
    XLSX.utils.book_append_sheet(wb, requestsSheet, 'Leave Requests');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="mmg-hr-export-${new Date().toISOString().slice(0, 10)}.xlsx"`
    );
    res.send(buf);
  } catch {
    res.status(500).json({ error: 'Failed to generate export' });
  }
});

export default router;
