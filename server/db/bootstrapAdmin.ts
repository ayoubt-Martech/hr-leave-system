/**
 * Bootstraps the first SuperAdmin account from environment variables.
 *
 * Solves the cold-start chicken-and-egg problem: login only works for
 * emails that already exist as an active user row, but only a SuperAdmin
 * can add new users via the Admin Panel — so a fresh production database
 * has no way to create its first user through the UI.
 *
 * Safe to run on every deploy/restart: it's a no-op as soon as ANY
 * SuperAdmin exists, whether created by this script or by hand later.
 *
 * Configure via .env:
 *   BOOTSTRAP_SUPERADMIN_EMAIL=you@yourcompany.com
 *   BOOTSTRAP_SUPERADMIN_NAME=Your Name
 * Leave both unset to skip entirely (e.g. in dev, where db:seed already
 * creates SuperAdmin accounts).
 */
import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });

import { eq } from 'drizzle-orm';
import { db, pool } from './client';
import { users } from './schema';

async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.toLowerCase().trim();
  const fullName = process.env.BOOTSTRAP_SUPERADMIN_NAME?.trim();

  if (!email || !fullName) {
    console.log('[bootstrap-admin] BOOTSTRAP_SUPERADMIN_EMAIL/NAME not set — skipping.');
    await pool.end();
    return;
  }

  const [existingSuperAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'SuperAdmin'))
    .limit(1);

  if (existingSuperAdmin) {
    console.log('[bootstrap-admin] A SuperAdmin already exists — skipping.');
    await pool.end();
    return;
  }

  const [existingByEmail] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingByEmail) {
    // No SuperAdmin exists yet, but this email is already a user — promote it
    // rather than failing on the unique email constraint.
    await db
      .update(users)
      .set({ role: 'SuperAdmin', is_active: true, updated_at: new Date() })
      .where(eq(users.id, existingByEmail.id));
    console.log(`[bootstrap-admin] Promoted existing user ${email} to SuperAdmin.`);
  } else {
    await db.insert(users).values({
      id: `user_bootstrap_${Date.now()}`,
      full_name: fullName,
      email,
      role: 'SuperAdmin',
      is_active: true,
    });
    console.log(`[bootstrap-admin] Created first SuperAdmin: ${fullName} <${email}>`);
  }

  await pool.end();
}

bootstrapAdmin().catch((err) => {
  console.error('[bootstrap-admin] Failed:', err.message);
  process.exit(1);
});
