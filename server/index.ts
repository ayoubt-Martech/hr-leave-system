import cookieParser from 'cookie-parser';
import cors from 'cors';
import * as dotenvLocal from 'dotenv';
import 'dotenv/config';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import passport from 'passport';
import path from 'path';
dotenvLocal.config({ path: '.env.local', override: true });

import { pool } from './db/client';
import { registerCronJobs } from './jobs/accrual';
import adminRouter from './routes/admin';
import alertsRouter from './routes/alerts';
import authRouter from './routes/auth';
import holidaysRouter from './routes/holidays';
import migrationRouter from './routes/migration';
import requestsRouter from './routes/requests';
import settingsRouter from './routes/settings';
import usersRouter from './routes/users';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Security middleware ──────────────────────────────────────────────────────

app.use(
  helmet({
    // Allow the frontend to load from same origin in production
    contentSecurityPolicy: IS_PROD
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
          },
        }
      : false,
  })
);

// CORS: in production only allow the configured frontend origin
const allowedOrigins = IS_PROD
  ? [process.env.FRONTEND_URL ?? ''].filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, same-origin)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── General middleware ───────────────────────────────────────────────────────

// 12mb accommodates base64-encoded sick-leave proof uploads (max 8MB file,
// ~1.33x inflation from base64 encoding, plus JSON envelope overhead).
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

// ─── Rate limiting ────────────────────────────────────────────────────────────

// Strict limit on auth endpoints to prevent brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: { error: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/holidays', holidaysRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/migration', migrationRouter);

// ─── Health check (public, no auth) ──────────────────────────────────────────
// Must be registered before the SPA catch-all below, or that '*' route
// swallows it and returns index.html instead of the JSON payload.

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── Serve built frontend in production ──────────────────────────────────────

if (IS_PROD) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  // SPA fallback — must come after API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Never leak stack traces in production
  const message = IS_PROD ? 'Internal server error' : (err.message ?? 'Unknown error');
  console.error('[error]', err.message);
  res.status(err.status ?? 500).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  // Verify DB connection before accepting traffic
  try {
    await pool.query('SELECT 1');
    console.log('[db] PostgreSQL connected');
  } catch (err: any) {
    console.error('[db] Connection failed:', err.message);
    process.exit(1);
  }

  // Register scheduled jobs
  registerCronJobs();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] MMG-HR API running on port ${PORT} (${IS_PROD ? 'production' : 'development'})`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received — shutting down gracefully');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[server] SIGINT received — shutting down gracefully');
  await pool.end();
  process.exit(0);
});

start();
