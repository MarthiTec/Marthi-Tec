import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireSession, requirePlatformAdmin } from '../middlewares/authMiddleware.js';
export const plansRouter = Router();
const schema = z.object({
  name: z.string().trim().min(1), price: z.string(), priceNumeric: z.number().nonnegative(),
  promotionalPrice: z.string().optional(), period: z.string(), blurb: z.string(),
  fullDescription: z.string().optional(), commercialCallout: z.string().optional(), homeSummary: z.string().optional(),
  featured: z.boolean(), displayOrder: z.number(), active: z.boolean(), maxModules: z.number().int().positive(),
  allModules: z.boolean().optional(), features: z.array(z.string()),
});
plansRouter.get('/api/v1/commercial-plans', async (_req, res, next) => {
  try {
    const result = await pool.query('SELECT settings FROM platform_commercial_plans ORDER BY id');
    res.json({ success: true, data: result.rows.map(r => r.settings).filter(p => p.active !== false) });
  } catch (error) { next(error); }
});
plansRouter.get('/api/v1/admin/commercial-plans', requireSession, requirePlatformAdmin, async (_req, res, next) => {
  try { const result = await pool.query('SELECT settings FROM platform_commercial_plans ORDER BY id');
    res.json({ success: true, data: result.rows.map(r => r.settings) });
  } catch (error) { next(error); }
});
plansRouter.put('/api/v1/admin/commercial-plans/:id', requireSession, requirePlatformAdmin, async (req, res, next) => {
  try {
    const data = { ...schema.parse(req.body), id: req.params.id };
    const result = await pool.query('UPDATE platform_commercial_plans SET settings=$1::jsonb, updated_at=now() WHERE id=$2 RETURNING settings', [JSON.stringify(data), req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Plano não encontrado.' } }); return; }
    res.json({ success: true, data: result.rows[0].settings });
  } catch (error) { next(error); }
});
plansRouter.post('/api/v1/admin/commercial-plans/reset', requireSession, requirePlatformAdmin, async (_req, res, next) => {
  try {
    const result = await pool.query('UPDATE platform_commercial_plans SET settings=defaults, updated_at=now() RETURNING settings');
    res.json({ success: true, data: result.rows.map(r => r.settings) });
  } catch (error) { next(error); }
});
