import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Telas mais acessadas: o painel conta cada abertura de tela do menu, por loja e por usuário,
 * e mostra as 10 mais usadas como atalho. Cada loja só enxerga as próprias contagens.
 */
export const screenVisitsRouter = Router();
screenVisitsRouter.use('/api/v1/screen-visits', requireAuth);

const visitSchema = z.object({
  path: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .regex(/^\/[a-z0-9/_-]*$/i, 'Tela inválida.'),
});

screenVisitsRouter.post('/api/v1/screen-visits', async (req, res, next) => {
  try {
    const { path } = visitSchema.parse(req.body ?? {});
    await pool.query(
      `INSERT INTO screen_visits (store_id, user_id, path, visits, last_at) VALUES ($1, $2, $3, 1, now())
       ON CONFLICT (store_id, user_id, path) DO UPDATE SET visits = screen_visits.visits + 1, last_at = now()`,
      [req.storeId, req.user!.id, path],
    );
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

screenVisitsRouter.get('/api/v1/screen-visits/top', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 30);
    const rows = (
      await pool.query(
        `SELECT path, visits, last_at FROM screen_visits WHERE store_id = $1 AND user_id = $2 ORDER BY visits DESC, last_at DESC LIMIT $3::int`,
        [req.storeId, req.user!.id, limit],
      )
    ).rows;
    res.json({ success: true, data: rows.map((row) => ({ path: row.path, visits: Number(row.visits), lastAt: row.last_at })) });
  } catch (error) {
    next(error);
  }
});

/** Zera as contagens do usuário nesta loja. */
screenVisitsRouter.delete('/api/v1/screen-visits', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM screen_visits WHERE store_id = $1 AND user_id = $2', [req.storeId, req.user!.id]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});
