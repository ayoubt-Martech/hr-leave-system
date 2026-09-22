import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { holidays } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireSuperAdmin, requireActiveUser } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { writeAudit } from '../services/audit';

const router = Router();
router.use(requireAuth, requireActiveUser);

const HolidaySchema = z.object({
  name: z.string().min(2).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  is_recurring: z.boolean().default(false),
  category: z.enum(['National', 'Religious']).default('National'),
});

/** GET /api/holidays — all users can read (needed for date calculation) */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.select().from(holidays).orderBy(holidays.date);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

/** POST /api/holidays — SuperAdmin only */
router.post(
  '/',
  requireSuperAdmin,
  validate(HolidaySchema),
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as z.infer<typeof HolidaySchema>;

    try {
      const [created] = await db
        .insert(holidays)
        .values({
          id: `hol_${Date.now()}`,
          name: data.name,
          date: data.date,
          is_recurring: data.is_recurring,
          category: data.category,
        })
        .returning();

      await writeAudit({
        actor: req.user,
        action: 'holiday_added',
        targetId: created.id,
        targetType: 'holiday',
        details: { name: data.name, date: data.date },
      });

      res.status(201).json(created);
    } catch {
      res.status(500).json({ error: 'Failed to add holiday' });
    }
  }
);

/** DELETE /api/holidays/:id — SuperAdmin only */
router.delete('/:id', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const [deleted] = await db.delete(holidays).where(eq(holidays.id, id)).returning();

    if (!deleted) {
      res.status(404).json({ error: 'Holiday not found' });
      return;
    }

    await writeAudit({
      actor: req.user,
      action: 'holiday_deleted',
      targetId: id,
      targetType: 'holiday',
      details: { name: deleted.name },
    });

    res.json({ message: 'Holiday deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

export default router;
