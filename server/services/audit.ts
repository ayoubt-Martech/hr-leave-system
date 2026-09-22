import { db } from '../db/client';
import { auditLog } from '../db/schema';
import { AuthPayload } from '../middleware/auth';

type AuditAction = typeof auditLog.$inferInsert['action'];

interface AuditOptions {
  actor?: AuthPayload | null; // null = system/cron
  action: AuditAction;
  targetId?: string;
  targetType?: 'user' | 'leave_request' | 'setting' | 'holiday';
  details?: Record<string, unknown>;
}

export async function writeAudit(opts: AuditOptions): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actor_id: opts.actor?.userId ?? null,
      actor_email: opts.actor?.email ?? null,
      action: opts.action,
      target_id: opts.targetId ?? null,
      target_type: opts.targetType ?? null,
      details: opts.details ? JSON.stringify(opts.details) : null,
    });
  } catch (err: any) {
    // Audit failures must never break the main operation
    console.error('[audit] Failed to write audit log:', err.message);
  }
}
