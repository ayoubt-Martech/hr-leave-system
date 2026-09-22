/**
 * Seed script — populates a fresh PostgreSQL database with:
 *   - Initial settings (accrual rate, carry-over limit)
 *   - Tunisian public holidays for 2026
 *   - Company users with hierarchy
 *   - Historical leave requests
 *
 * Usage: npm run db:seed
 * Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING for all records.
 */
import * as dotenv from 'dotenv';
import 'dotenv/config';
import { pool } from '../server/db/client';
dotenv.config({ path: '.env.local', override: true });

async function seed() {
  const client = await pool.connect();
  console.log('[seed] Connected to PostgreSQL');

  try {
    await client.query('BEGIN');

    // ── Settings ────────────────────────────────────────────────────────────
    console.log('[seed] Inserting settings...');
    const settingsValues = [
      ['max_carry_over_days', '0'],
      ['monthly_accrual_rate', '1.5'],
      ['last_accrual_month', '2026-09'],
      ['company_name', 'Momentum Marketing Group'],
    ];
    for (const [key, value] of settingsValues) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, value]
      );
    }

    // ── Tunisian Holidays 2026 ───────────────────────────────────────────────
    console.log('[seed] Inserting holidays...');
    const holidays = [
      ["hol_1",  "New Year's Day (Jour de l'An)",          "2026-01-01", true,  "National"],
      ["hol_2",  "Independence Day (Fête de l'Indépendance)", "2026-03-20", true, "National"],
      ["hol_3",  "Eid al-Fitr (Aïd El Fitr)",               "2026-03-21", false, "Religious"],
      ["hol_4",  "Eid al-Fitr Day 2",                        "2026-03-22", false, "Religious"],
      ["hol_5",  "Martyrs' Day (Fête des Martyrs)",          "2026-04-09", true,  "National"],
      ["hol_6",  "Labor Day (Fête du Travail)",               "2026-05-01", true,  "National"],
      ["hol_7",  "Eid al-Adha (Aïd El Idha)",                "2026-05-27", false, "Religious"],
      ["hol_8",  "Eid al-Adha Day 2",                        "2026-05-28", false, "Religious"],
      ["hol_9",  "Ras al-Am (Islamic New Year 1448)",         "2026-06-17", false, "Religious"],
      ["hol_10", "Republic Day (Fête de la République)",      "2026-07-25", true,  "National"],
      ["hol_11", "National Women's Day (Fête de la Femme)",   "2026-08-13", true,  "National"],
      ["hol_12", "Mawlid Ennabawi (Mouled)",                  "2026-08-26", false, "Religious"],
      ["hol_13", "Evacuation Day (Fête de l'Évacuation)",     "2026-10-15", true,  "National"],
      ["hol_14", "Revolution & Youth Day",                    "2026-12-17", true,  "National"],
    ];
    for (const [id, name, date, recurring, category] of holidays) {
      await client.query(
        `INSERT INTO holidays (id, name, date, is_recurring, category)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [id, name, date, recurring, category]
      );
    }

    // ── Users ────────────────────────────────────────────────────────────────
    console.log('[seed] Inserting users...');
    const users = [
      // id, full_name, email, position, role, initial_balance, current_balance, is_active
      ['user_admin_ayoub', 'Ayoub T.', 'ayoub.t@martechlabs.io', 'Chief Executive Officer',    'SuperAdmin', 18,   16.5, true],
      ['user_admin_hr',    'Super Administrator', 'admin@martechlabs.io', 'HR Director',        'SuperAdmin', 18,   18,   true],
      ['user_mgr_sami',    'Sami Mansour',  'sami.m@martechlabs.io',  'Engineering Manager',   'Manager',    20,   17,   true],
      ['user_mgr_leila',   'Leila Ben Salah', 'leila.b@martechlabs.io', 'Operations & QA Lead', 'Manager',   18,   15,   true],
      ['user_emp_radhwen', 'Radhwen Boulahia', 'radhwen.b@martechlabs.io', 'Senior Backend Engineer', 'Employee', 35, 22,   true],
      ['user_emp_amel',    'Amel Omri',     'amel.o@martechlabs.io',  'Lead UI/UX Designer',   'Employee',   32.5, 25.5, true],
      ['user_emp_yassine', 'Yassine Trabelsi', 'yassine.t@martechlabs.io', 'Full-Stack Developer', 'Employee', 26,   17,   true],
      ['user_emp_sarra',   'Sarra Khemir',  'sarra.k@martechlabs.io', 'QA Engineer',           'Employee',   18,   1,    true],
    ];
    for (const [id, full_name, email, position, role, initial_balance, current_balance, is_active] of users) {
      await client.query(
        `INSERT INTO users (id, full_name, email, position, role, initial_balance, current_balance, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
        [id, full_name, email, position, role, initial_balance, current_balance, is_active]
      );
    }

    // ── Employee → Manager assignments ─────────────────────────────────────────
    console.log('[seed] Inserting employee_managers...');
    const employeeManagers = [
      ['user_emp_radhwen', 'user_mgr_sami'],
      ['user_emp_amel',    'user_mgr_sami'],
      ['user_emp_yassine', 'user_mgr_leila'],
      ['user_emp_sarra',   'user_mgr_leila'],
    ];
    for (const [employee_id, manager_id] of employeeManagers) {
      await client.query(
        `INSERT INTO employee_managers (employee_id, manager_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [employee_id, manager_id]
      );
    }

    // ── Leave Requests ───────────────────────────────────────────────────────
    console.log('[seed] Inserting leave requests...');
    const requests = [
      // Radhwen historical
      ['req_hist_radhwen_1', 'user_emp_radhwen', '2026-01-05', '2026-01-09', '2026-01-12', 5,  'Vacation',   'None', 'Approved', 'Annual leave (Legacy backfill)', 'user_mgr_sami', true],
      ['req_hist_radhwen_2', 'user_emp_radhwen', '2026-04-20', '2026-04-24', '2026-04-27', 5,  'Vacation',   'None', 'Approved', 'Spring break (Legacy backfill)', 'user_mgr_sami', true],
      ['req_hist_radhwen_3', 'user_emp_radhwen', '2026-07-06', '2026-07-08', '2026-07-09', 3,  'Sick Leave', 'None', 'Approved', 'Medical recovery',              'user_mgr_sami', true],
      // Amel historical
      ['req_hist_amel_1',    'user_emp_amel',    '2026-02-09', '2026-02-13', '2026-02-16', 5,  'Vacation',   'None', 'Approved', 'Annual leave (Legacy backfill)', 'user_mgr_sami', true],
      ['req_hist_amel_2',    'user_emp_amel',    '2026-05-18', '2026-05-19', '2026-05-20', 2,  'Emergency',  'None', 'Approved', 'Family urgent event',           'user_mgr_sami', true],
      // Pending requests
      ['req_pending_radhwen', 'user_emp_radhwen', '2026-10-12', '2026-10-16', '2026-10-19', 5, 'Vacation',   'None', 'Pending',  'Autumn holiday trip',           null,            false],
      ['req_pending_sarra',   'user_emp_sarra',   '2026-10-05', '2026-10-07', '2026-10-08', 3, 'Vacation',   'None', 'Pending',  'Urgent family relocation',      null,            false],
      // Cancellation requested
      ['req_cancel_yassine',  'user_emp_yassine', '2026-11-02', '2026-11-04', '2026-11-05', 3, 'Vacation',   'None', 'CancellationRequested', 'Project schedule changed', 'user_mgr_leila', false],
    ];
    for (const [id, user_id, start_date, end_date, return_date, days_count, type, half_day_type, status, note, reviewed_by, is_legacy] of requests) {
      await client.query(
        `INSERT INTO leave_requests
           (id, user_id, start_date, end_date, return_date, days_count, type, half_day_type, status, note, reviewed_by, reviewed_at, is_legacy_backfill)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [
          id, user_id, start_date, end_date, return_date, days_count, type, half_day_type,
          status, note,
          reviewed_by ?? null,
          reviewed_by ? new Date().toISOString() : null,
          is_legacy,
        ]
      );
    }

    await client.query('COMMIT');
    console.log('[seed] ✓ Database seeded successfully.');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[seed] ✗ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
