import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { users, leaveRequests, employeeManagers } from '../db/schema';
import { eq, ne, and, inArray } from 'drizzle-orm';
import { requireAuth, requireSuperAdmin, requireActiveUser } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { writeAudit } from '../services/audit';
import { sendWelcomeEmail } from '../services/email';

const router = Router();

// All user routes require authentication and an active account
router.use(requireAuth, requireActiveUser);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  id: z.string().optional(), // admin may specify, otherwise generated
  full_name: z.string().min(2).max(100),
  email: z.string().email().toLowerCase(),
  position: z.string().min(1).max(100).default('Team Member'),
  role: z.enum(['SuperAdmin', 'Manager', 'Employee']).default('Employee'),
  manager_ids: z.array(z.string()).default([]),
  initial_balance: z.coerce.number().min(0).max(365).default(18),
  current_balance: z.coerce.number().min(-365).max(365).optional(),
  avatar_url: z.string().url().optional().nullable(),
});

const UpdateUserSchema = z.object({
  full_name: z.string().min(2).max(100).optional(),
  position: z.string().min(1).max(100).optional(),
  role: z.enum(['SuperAdmin', 'Manager', 'Employee']).optional(),
  manager_ids: z.array(z.string()).optional(),
  initial_balance: z.coerce.number().min(0).max(365).optional(),
  current_balance: z.coerce.number().min(-365).max(365).optional(),
  is_active: z.boolean().optional(),
  termination_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  avatar_url: z.string().url().optional().nullable(),
});

// ─── GET /api/users — list all users (SuperAdmin) or public list for calendars ──

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const isSuperAdmin = req.user?.role === 'SuperAdmin';

    const rows = await db
      .select({
        id: users.id,
        full_name: users.full_name,
        email: users.email,
        position: users.position,
        role: users.role,
        initial_balance: users.initial_balance,
        current_balance: users.current_balance,
        is_active: users.is_active,
        termination_date: users.termination_date,
        avatar_url: users.avatar_url,
        created_at: users.created_at,
      })
      .from(users)
      .orderBy(users.full_name);

    const managerLinks = rows.length
      ? await db
          .select({ employee_id: employeeManagers.employee_id, manager_id: employeeManagers.manager_id })
          .from(employeeManagers)
          .where(inArray(employeeManagers.employee_id, rows.map((r) => r.id)))
      : [];

    const managersByEmployee = new Map<string, string[]>();
    for (const link of managerLinks) {
      const list = managersByEmployee.get(link.employee_id) ?? [];
      list.push(link.manager_id);
      managersByEmployee.set(link.employee_id, list);
    }

    const rowsWithManagers = rows.map((r) => ({
      ...r,
      manager_ids: managersByEmployee.get(r.id) ?? [],
    }));

    // Non-admins only get active users (needed for calendar, team view)
    const result = isSuperAdmin ? rowsWithManagers : rowsWithManagers.filter((u) => u.is_active);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── GET /api/users/:id ───────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  // Employees can only see themselves; managers can see their team
  const isSuperAdmin = req.user?.role === 'SuperAdmin';
  const isManager = req.user?.role === 'Manager';
  const isSelf = req.user?.userId === id;

  if (!isSuperAdmin && !isSelf && !isManager) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        full_name: users.full_name,
        email: users.email,
        position: users.position,
        role: users.role,
        initial_balance: users.initial_balance,
        current_balance: users.current_balance,
        is_active: users.is_active,
        termination_date: users.termination_date,
        avatar_url: users.avatar_url,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const managerLinks = await db
      .select({ manager_id: employeeManagers.manager_id })
      .from(employeeManagers)
      .where(eq(employeeManagers.employee_id, id));

    res.json({ ...user, manager_ids: managerLinks.map((l) => l.manager_id) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ─── POST /api/users — create user (SuperAdmin only) ─────────────────────────

router.post(
  '/',
  requireSuperAdmin,
  validate(CreateUserSchema),
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as z.infer<typeof CreateUserSchema>;

    // Duplicate email check
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const newId = data.id ?? `user_${Date.now()}`;
    const balance = data.current_balance ?? data.initial_balance;

    if (data.manager_ids.includes(newId)) {
      res.status(400).json({ error: 'A user cannot be their own manager' });
      return;
    }

    try {
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(users)
          .values({
            id: newId,
            full_name: data.full_name,
            email: data.email,
            position: data.position,
            role: data.role,
            initial_balance: String(data.initial_balance),
            current_balance: String(balance),
            is_active: true,
            avatar_url: data.avatar_url ?? null,
          })
          .returning();

        if (data.manager_ids.length) {
          await tx.insert(employeeManagers).values(
            data.manager_ids.map((manager_id) => ({ employee_id: row.id, manager_id }))
          );
        }

        return row;
      });

      await writeAudit({
        actor: req.user,
        action: 'user_created',
        targetId: created.id,
        targetType: 'user',
        details: { email: created.email, role: created.role },
      });

      await sendWelcomeEmail({ fullName: created.full_name, email: created.email });

      res.status(201).json({ ...created, manager_ids: data.manager_ids });
    } catch {
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// ─── PATCH /api/users/:id — update user (SuperAdmin only) ────────────────────

router.patch(
  '/:id',
  requireSuperAdmin,
  validate(UpdateUserSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const data = req.body as z.infer<typeof UpdateUserSchema>;

    // Prevent SuperAdmin from deactivating themselves
    if (id === req.user?.userId && data.is_active === false) {
      res.status(400).json({ error: 'You cannot deactivate your own account' });
      return;
    }

    if (data.manager_ids?.includes(id)) {
      res.status(400).json({ error: 'A user cannot be their own manager' });
      return;
    }

    try {
      const updateData: Partial<typeof users.$inferInsert> = {
        updated_at: new Date(),
      };

      if (data.full_name !== undefined) updateData.full_name = data.full_name;
      if (data.position !== undefined) updateData.position = data.position;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.initial_balance !== undefined)
        updateData.initial_balance = String(data.initial_balance);
      if (data.current_balance !== undefined)
        updateData.current_balance = String(data.current_balance);
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.termination_date !== undefined) updateData.termination_date = data.termination_date;
      if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(users)
          .set(updateData)
          .where(eq(users.id, id))
          .returning();

        if (!row) return null;

        if (data.manager_ids !== undefined) {
          await tx.delete(employeeManagers).where(eq(employeeManagers.employee_id, id));
          if (data.manager_ids.length) {
            await tx.insert(employeeManagers).values(
              data.manager_ids.map((manager_id) => ({ employee_id: id, manager_id }))
            );
          }
        }

        return row;
      });

      if (!updated) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const action =
        data.is_active === false
          ? 'user_deactivated'
          : data.is_active === true
          ? 'user_activated'
          : data.current_balance !== undefined
          ? 'balance_adjusted'
          : 'user_updated';

      await writeAudit({
        actor: req.user,
        action,
        targetId: updated.id,
        targetType: 'user',
        details: data as Record<string, unknown>,
      });

      const managerLinks = await db
        .select({ manager_id: employeeManagers.manager_id })
        .from(employeeManagers)
        .where(eq(employeeManagers.employee_id, id));

      res.json({ ...updated, manager_ids: managerLinks.map((l) => l.manager_id) });
    } catch {
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// ─── DELETE /api/users/:id — delete user (SuperAdmin only) ───────────────────

const RemoveUserSchema = z.object({
  termination_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().max(500).optional(),
});

// Soft delete — never hard-deletes a user row. Historical leave_requests
// reference users.id with onDelete: 'cascade', so a real DELETE would wipe
// their entire leave history. Instead this deactivates the account and
// records a termination date; the row (and all their records) stay intact
// and reappear under the "Former Employees" view.
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  if (id === req.user?.userId) {
    res.status(400).json({ error: 'You cannot remove your own account' });
    return;
  }

  const parsed = RemoveUserSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
    return;
  }
  const { termination_date, reason } = parsed.data;

  try {
    const [updated] = await db
      .update(users)
      .set({
        is_active: false,
        termination_date: termination_date ?? new Date().toISOString().slice(0, 10),
        updated_at: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await writeAudit({
      actor: req.user,
      action: 'user_deleted',
      targetId: id,
      targetType: 'user',
      details: { email: updated.email, reason: reason ?? null, termination_date: updated.termination_date },
    });

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

export default router;
