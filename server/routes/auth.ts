/**
 * Auth routes — Google OAuth 2.0 + dev-login bypass
 *
 * Google OAuth flow (production):
 *  1. Frontend → GET /api/auth/google
 *  2. Google  → GET /api/auth/google/callback
 *  3. Whitelist check, JWT issued, redirect to /?token=<jwt>
 *
 * Dev login bypass (development only):
 *  POST /api/auth/dev-login  { email }  → { token, user }
 *  Only active when NODE_ENV !== 'production'.
 *  Google OAuth strategy is only registered when GOOGLE_CLIENT_ID is set.
 */

import { eq } from 'drizzle-orm';
import { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import {
    Strategy as GoogleStrategy,
    Profile,
    VerifyCallback,
} from 'passport-google-oauth20';
import { db } from '../db/client';
import { users, employeeManagers } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { writeAudit } from '../services/audit';

const router = Router();

// ─── Google OAuth — only registered when credentials are present ──────────────

const googleOAuthEnabled =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

if (googleOAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        callbackURL: `${process.env.APP_URL}/api/auth/google/callback`,
        scope: ['email', 'profile'],
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done: VerifyCallback
      ) => {
        const email = profile.emails?.[0]?.value?.toLowerCase().trim();
        if (!email) {
          return done(null, false, { message: 'No email returned from Google.' });
        }
        try {
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

          if (!user) {
            return done(null, false, {
              message: 'Access denied: this Google account is not whitelisted. Contact HR.',
            });
          }
          if (!user.is_active) {
            return done(null, false, {
              message: 'Access denied: account is deactivated. Contact HR.',
            });
          }
          if (!user.google_id) {
            await db
              .update(users)
              .set({ google_id: profile.id, updated_at: new Date() })
              .where(eq(users.id, user.id));
          }
          return done(null, user as any);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      done(null, (user ?? null) as any);
    } catch (err) {
      done(err);
    }
  });
} else {
  console.warn(
    '[auth] GOOGLE_CLIENT_ID not configured — Google OAuth disabled. ' +
    'Use POST /api/auth/dev-login in development.'
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/** Step 1: redirect to Google */
router.get('/google', (req: Request, res: Response) => {
  if (!googleOAuthEnabled) {
    res.status(503).json({ error: 'Google OAuth is not configured on this server.' });
    return;
  }
  passport.authenticate('google', { scope: ['email', 'profile'], session: false })(req, res);
});

/** Step 2: Google callback */
router.get('/google/callback', (req: Request, res: Response, next) => {
  if (!googleOAuthEnabled) {
    res.status(503).json({ error: 'Google OAuth is not configured.' });
    return;
  }
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL ?? '/'}?auth_error=access_denied`,
    session: false,
  })(req, res, next);
}, async (req: Request, res: Response) => {
  const user = req.user as any;
  const payload = { userId: user.id, email: user.email, role: user.role };

  const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as any,
    issuer: 'mmg-hr',
    audience: 'mmg-hr-client',
  });

  await writeAudit({
    actor: payload,
    action: 'user_updated',
    targetId: user.id,
    targetType: 'user',
    details: { event: 'login' },
  });

  res.redirect(`${process.env.FRONTEND_URL ?? ''}/?token=${token}`);
});

/** GET /api/auth/me — returns the current user's DB record */
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
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
        avatar_url: users.avatar_url,
        created_at: users.created_at,
      })
      .from(users)
      .where(eq(users.id, req.user!.userId))
      .limit(1);

    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    if (!user.is_active) { res.status(403).json({ error: 'Account is deactivated' }); return; }

    const managerLinks = await db
      .select({ manager_id: employeeManagers.manager_id })
      .from(employeeManagers)
      .where(eq(employeeManagers.employee_id, user.id));

    res.json({ ...user, manager_ids: managerLinks.map((l) => l.manager_id) });
  } catch {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/** POST /api/auth/logout */
router.post('/logout', requireAuth, (_req: Request, res: Response) => {
  res.json({ message: 'Logged out' });
});

/**
 * POST /api/auth/dev-login — disabled unless ALLOW_DEV_LOGIN=true.
 * Off by default in every environment, including non-production, so it
 * can't be accidentally left reachable — opt in explicitly, and only for
 * as long as needed (e.g. a demo before Google OAuth is configured).
 * Body: { email: string }
 */
router.post('/dev-login', async (req: Request, res: Response): Promise<void> => {
  if (process.env.ALLOW_DEV_LOGIN !== 'true') {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ error: 'email is required' }); return; }

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      res.status(401).json({
        error: `No user found with email: ${email}. Run npm run db:seed first.`,
      });
      return;
    }
    if (!user.is_active) {
      res.status(403).json({ error: 'Account is deactivated.' });
      return;
    }

    const payload = { userId: user.id, email: user.email, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET as string, {
      expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as any,
      issuer: 'mmg-hr',
      audience: 'mmg-hr-client',
    });

    const managerLinks = await db
      .select({ manager_id: employeeManagers.manager_id })
      .from(employeeManagers)
      .where(eq(employeeManagers.employee_id, user.id));

    res.json({ token, user: { ...user, manager_ids: managerLinks.map((l) => l.manager_id) } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
