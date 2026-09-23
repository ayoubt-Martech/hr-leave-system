import { eq } from 'drizzle-orm';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db/client';
import { users } from '../db/schema';

export interface AuthPayload {
  userId: string;
  email: string;
  role: 'SuperAdmin' | 'Manager' | 'Employee';
}

// Extend Express Request — use a separate namespace augmentation file-safe key
declare global {
  namespace Express {
    // Passport sets req.user; we override its type to our AuthPayload
    interface User extends AuthPayload {}
  }
}

/** Verifies JWT from Authorization: Bearer <token> header */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    // TEMP DIAGNOSTIC — remove once the 401-reload-loop bug is found.
    console.error(`[auth] 401 missing/malformed header on ${req.method} ${req.originalUrl} — got: ${JSON.stringify(header)}`);
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    // TEMP DIAGNOSTIC — remove once the 401-reload-loop bug is found.
    console.error(`[auth] 401 jwt.verify failed on ${req.method} ${req.originalUrl}: ${(err as Error).name}: ${(err as Error).message}`);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Gate: only SuperAdmin may proceed */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'SuperAdmin') {
    res.status(403).json({ error: 'SuperAdmin role required' });
    return;
  }
  next();
}

/** Gate: Manager or SuperAdmin may proceed */
export function requireManager(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'Manager' && req.user?.role !== 'SuperAdmin') {
    res.status(403).json({ error: 'Manager role required' });
    return;
  }
  next();
}

/**
 * Verifies that the authenticated user can only access their own resources
 * unless they are SuperAdmin. Pass targetUserId from the route param.
 */
export function requireSelfOrAdmin(targetUserId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role === 'SuperAdmin' || req.user?.userId === targetUserId) {
      next();
      return;
    }
    res.status(403).json({ error: 'Access denied' });
  };
}

/** Middleware that refreshes the user row from DB to ensure is_active is still true */
export async function requireActiveUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }

  try {
    const [row] = await db
      .select({ is_active: users.is_active })
      .from(users)
      .where(eq(users.id, req.user.userId))
      .limit(1);

    if (!row || !row.is_active) {
      res.status(403).json({ error: 'Account is deactivated. Contact HR.' });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: 'Auth check failed' });
  }
}
