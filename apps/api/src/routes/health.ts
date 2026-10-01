import { Router } from 'express';
import { env } from '../config/env.js';
import { checkDatabaseConnection } from '../db/pool.js';
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
