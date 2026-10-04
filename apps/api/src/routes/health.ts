import { Router } from 'express';
import { env } from '../config/env.js';
import { checkDatabaseConnection } from '../db/pool.js';
export const healthRouter = Router();
healthRouter.get('/health', async (_req, res, next) => {
  try {
    const database = await checkDatabaseConnection();
    res.status(database.connected ? 200 : 503).json({ success: database.connected,
      data: { service: env.APP_NAME, status: database.connected ? 'ok' : 'degraded',
        time: new Date().toISOString(), database: { configured: database.configured, connected: database.connected } } });
  } catch (error) { next(error); }
});
