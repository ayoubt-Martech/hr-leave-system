import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/client';
import { settings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, requireSuperAdmin, requireActiveUser } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { writeAudit } from '../services/audit';

const router = Router();
router.use(requireAuth, requireActiveUser);

const UpsertSettingSchema = z.object({
  key: z.string().min(1).max(80),
  value: z.union([z.string(), z.number(), z.boolean()]).transform(String),
});

/** GET /api/settings — readable by all authenticated users */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.select().from(settings);
    // Return as a key→value map for easy frontend consumption
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = row.value;
    res.json(map);
  } catch {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/** PUT /api/settings — SuperAdmin only, upserts a single key */
router.put(
  '/',
  requireSuperAdmin,
  validate(UpsertSettingSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { key, value } = req.body as z.infer<typeof UpsertSettingSchema>;

    try {
      const [upserted] = await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updated_at: new Date() } })
        .returning();

      await writeAudit({
        actor: req.user,
        action: 'settings_updated',
        targetType: 'setting',
        details: { key, value },
      });

      res.json(upserted);
    } catch {
      res.status(500).json({ error: 'Failed to update setting' });
    }
  }
);

export default router;
