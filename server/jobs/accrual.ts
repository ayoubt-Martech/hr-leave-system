/**
 * Scheduled jobs for leave accrual and year-end carry-over.
 *
 * Schedules:
 *  - Monthly accrual: 00:05 on the 1st of every month
 *  - Year-end carry-over: 00:10 on Jan 1st
 *
 * Both jobs check a last_run guard in the settings table to prevent
 * double-execution if the server restarts mid-month.
 */

import cron from 'node-cron';
import { db } from '../db/client';
import { users, settings } from '../db/schema';
import { eq, gt } from 'drizzle-orm';
import { writeAudit } from '../services/audit';
import { sendSystemAlert } from '../services/email';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updated_at: new Date() } });
}

// ─── Monthly Accrual ─────────────────────────────────────────────────────────

export async function runMonthlyAccrual(): Promise<void> {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Guard: only run once per calendar month
  const lastRun = await getSetting('last_accrual_month');
  if (lastRun === currentMonth) {
    console.log(`[accrual] Already ran for ${currentMonth} — skipping.`);
    return;
  }

  const rateStr = await getSetting('monthly_accrual_rate');
  const rate = parseFloat(rateStr ?? '1.5');

  if (isNaN(rate) || rate <= 0) {
    console.error('[accrual] Invalid accrual rate in settings — aborting.');
    return;
  }

  console.log(`[accrual] Running monthly accrual for ${currentMonth} at +${rate} days`);

  try {
    // Only accrue for active users
    const activeUsers = await db
      .select({ id: users.id, current_balance: users.current_balance })
      .from(users)
      .where(eq(users.is_active, true));

    let accruedCount = 0;

    for (const user of activeUsers) {
      const newBalance = +(Number(user.current_balance) + rate).toFixed(2);
      await db
        .update(users)
        .set({ current_balance: String(newBalance), updated_at: new Date() })
        .where(eq(users.id, user.id));
      accruedCount++;
    }

    await setSetting('last_accrual_month', currentMonth);

    await writeAudit({
      actor: null,
      action: 'accrual_run',
      details: { month: currentMonth, rate, accruedCount },
    });

    const msg = `Monthly accrual complete: +${rate} days credited to ${accruedCount} active employees for ${currentMonth}.`;
    console.log(`[accrual] ${msg}`);
    await sendSystemAlert('Monthly Accrual Complete', msg);
  } catch (err: any) {
    console.error(`[accrual] Failed: ${err.message}`);
    await sendSystemAlert('Monthly Accrual FAILED', `Error: ${err.message}`);
  }
}

// ─── Year-End Carry-Over ──────────────────────────────────────────────────────

export async function runYearEndCarryOver(): Promise<void> {
  const year = new Date().getFullYear();
  const guardKey = `last_carry_over_year`;

  const lastRun = await getSetting(guardKey);
  if (lastRun === String(year)) {
    console.log(`[carry-over] Already ran for ${year} — skipping.`);
    return;
  }

  const maxStr = await getSetting('max_carry_over_days');
  const maxDays = parseFloat(maxStr ?? '0');

  if (isNaN(maxDays) || maxDays < 0) {
    console.error('[carry-over] Invalid max_carry_over_days — aborting.');
    return;
  }

  // 0 means unlimited carry-over — nothing to truncate, just record that the job ran.
  const isUnlimited = maxDays === 0;

  console.log(
    `[carry-over] Running year-end carry-over for ${year} (${isUnlimited ? 'unlimited — no truncation' : `max ${maxDays}d`})`
  );

  try {
    let affectedCount = 0;

    if (!isUnlimited) {
      const activeUsers = await db
        .select({ id: users.id, current_balance: users.current_balance, full_name: users.full_name })
        .from(users)
        .where(eq(users.is_active, true));

      for (const user of activeUsers) {
        const balance = Number(user.current_balance);
        if (balance > maxDays) {
          await db
            .update(users)
            .set({ current_balance: String(maxDays), updated_at: new Date() })
            .where(eq(users.id, user.id));
          affectedCount++;
          console.log(
            `[carry-over] Truncated ${user.full_name}: ${balance}d → ${maxDays}d`
          );
        }
      }
    }

    await setSetting(guardKey, String(year));

    await writeAudit({
      actor: null,
      action: 'carry_over_run',
      details: { year, maxDays, isUnlimited, affectedCount },
    });

    const msg = isUnlimited
      ? `Year-end carry-over complete: carry-over is unlimited — no balances were changed.`
      : `Year-end carry-over complete: ${affectedCount} employee(s) truncated to ${maxDays} days.`;
    console.log(`[carry-over] ${msg}`);
    await sendSystemAlert('Year-End Carry-Over Complete', msg);
  } catch (err: any) {
    console.error(`[carry-over] Failed: ${err.message}`);
    await sendSystemAlert('Year-End Carry-Over FAILED', `Error: ${err.message}`);
  }
}

// ─── Register cron schedules ──────────────────────────────────────────────────

export function registerCronJobs(): void {
  // Monthly accrual: 00:05 on the 1st of every month
  cron.schedule('5 0 1 * *', async () => {
    console.log('[cron] Triggering monthly accrual...');
    await runMonthlyAccrual();
  });

  // Year-end carry-over: 00:10 on Jan 1st
  cron.schedule('10 0 1 1 *', async () => {
    console.log('[cron] Triggering year-end carry-over...');
    await runYearEndCarryOver();
  });

  console.log('[cron] Scheduled: monthly accrual (1st of month 00:05), year-end carry-over (Jan 1 00:10)');
}
