/**
 * Admin-only routes: manual accrual triggers, audit log, system health.
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { auditLog, users } from '../db/schema';
import { desc, eq } from 'drizzle-orm';
import { requireAuth, requireSuperAdmin, requireActiveUser } from '../middleware/auth';
import { runMonthlyAccrual, runYearEndCarryOver } from '../jobs/accrual';

const router = Router();
router.use(requireAuth, requireActiveUser, requireSuperAdmin);

/** POST /api/admin/accrual/run — manually trigger monthly accrual */
router.post('/accrual/run', async (_req: Request, res: Response): Promise<void> => {
  try {
    await runMonthlyAccrual();
    res.json({ message: 'Monthly accrual executed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/admin/accrual/carry-over — manually trigger year-end carry-over */
router.post('/accrual/carry-over', async (_req: Request, res: Response): Promise<void> => {
  try {
    await runYearEndCarryOver();
    res.json({ message: 'Year-end carry-over executed successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/admin/audit — last 200 audit log entries */
router.get('/audit', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.created_at))
      .limit(200);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

/** GET /api/admin/health — quick system health check */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    await db.select({ id: users.id }).from(users).limit(1);
    res.json({ status: 'ok', db: 'connected', ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

export default router;
