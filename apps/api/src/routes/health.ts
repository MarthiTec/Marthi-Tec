import { Router } from 'express';
import { env } from '../config/env.js';
import { checkDatabaseConnection, pool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { verifySmtpConfig } from '../services/emailService.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const database = await checkDatabaseConnection();

  res.status(database.configured && !database.connected ? 503 : 200).json({
    success: database.connected || !database.configured,
    data: {
      service: env.APP_NAME,
      status: database.connected || !database.configured ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      database,
    },
  });
});

/**
 * Endpoint de diagnóstico para validar conexão SMTP e opcionalmente disparar teste
 * GET /health/email?email=matheusmarcal.mma@gmail.com
 * POST /api/v1/health/email
 */
healthRouter.get('/health/email', async (req, res) => {
  const target = typeof req.query.email === 'string' && req.query.email.trim()
    ? req.query.email.trim()
    : undefined;
  const result = await verifySmtpConfig(target);
  res.status(result.connected ? 200 : 500).json({
    success: result.connected,
    data: result,
  });
});

healthRouter.get('/api/v1/health/email', async (req, res) => {
  const target = typeof req.query.email === 'string' && req.query.email.trim()
    ? req.query.email.trim()
    : undefined;
  const result = await verifySmtpConfig(target);
  res.status(result.connected ? 200 : 500).json({
    success: result.connected,
    data: result,
  });
});

healthRouter.post('/api/v1/health/email', async (req, res) => {
  const target = typeof req.body?.email === 'string' && req.body.email.trim()
    ? req.body.email.trim()
    : 'matheusmarcal.mma@gmail.com';
  const result = await verifySmtpConfig(target);
  res.status(result.connected ? 200 : 500).json({
    success: result.connected,
    data: result,
  });
});

healthRouter.get('/health/db-status', async (_req, res) => {
  if (!pool) {
    res.json({ success: false, error: 'Sem pool de conexão ativa.' });
    return;
  }
  try {
    const tablesRes = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name ASC`,
    );
    let migrationsRes: any = { rows: [] };
    try {
      migrationsRes = await pool.query(`SELECT id, name, applied_at FROM _migrations ORDER BY id ASC`);
    } catch {
      // ignore
    }
    res.json({
      success: true,
      tables: tablesRes.rows.map((r: any) => r.table_name),
      migrations: migrationsRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

healthRouter.all(['/health/migrate', '/api/v1/health/migrate'], async (_req, res) => {
  try {
    const applied = await runMigrations();
    res.json({ success: true, applied });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});
