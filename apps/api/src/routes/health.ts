import { Router } from 'express';
import { env } from '../config/env.js';
import { checkDatabaseConnection } from '../db/pool.js';

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
