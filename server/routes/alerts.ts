import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { emailAlerts } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, requireActiveUser } from '../middleware/auth';

const router = Router();
router.use(requireAuth, requireActiveUser);

/** GET /api/alerts — returns the current user's alerts (newest first, capped at 50) */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(emailAlerts)
      .where(eq(emailAlerts.recipient_id, req.user!.userId))
      .orderBy(desc(emailAlerts.created_at))
      .limit(50);

    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

/** PATCH /api/alerts/:id/read — mark a single alert as read */
router.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [updated] = await db
      .update(emailAlerts)
      .set({ read: true })
      .where(
        and(
          eq(emailAlerts.id, id),
          eq(emailAlerts.recipient_id, req.user!.userId) // users can only mark their own
        )
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
});

/** POST /api/alerts/read-all — mark all of the current user's alerts as read */
router.post('/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    await db
      .update(emailAlerts)
      .set({ read: true })
      .where(
        and(
          eq(emailAlerts.recipient_id, req.user!.userId),
          eq(emailAlerts.read, false)
        )
      );

    res.json({ message: 'All alerts marked as read' });
  } catch {
    res.status(500).json({ error: 'Failed to mark alerts as read' });
  }
});

export default router;
