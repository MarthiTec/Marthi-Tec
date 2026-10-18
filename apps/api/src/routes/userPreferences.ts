import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Configurações de tela de cada usuário (filtros, aba aberta, item escolhido…), guardadas no banco por
 * loja: a pessoa reabre a tela do jeito que deixou, em qualquer aparelho. Nunca é dado de negócio.
 */
export const userPreferencesRouter = Router();
userPreferencesRouter.use('/api/v1/user-preferences', requireAuth);

const keySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/i, 'Preferência inválida.');
const bodySchema = z.object({ value: z.record(z.string(), z.unknown()) });

userPreferencesRouter.get('/api/v1/user-preferences/:key', async (req, res, next) => {
  try {
    const key = keySchema.parse(req.params.key);
    const row = (await pool.query('SELECT value FROM user_preferences WHERE store_id = $1 AND user_id = $2 AND key = $3', [req.storeId, req.user!.id, key])).rows[0];
    res.json({ success: true, data: { value: row?.value ?? null } });
  } catch (error) {
    next(error);
  }
});

userPreferencesRouter.put('/api/v1/user-preferences/:key', async (req, res, next) => {
  try {
    const key = keySchema.parse(req.params.key);
    const { value } = bodySchema.parse(req.body ?? {});
    const json = JSON.stringify(value);
    if (json.length > 20_000) throw Object.assign(new Error('Configuração grande demais.'), { status: 413 });
    await pool.query(
      `INSERT INTO user_preferences (store_id, user_id, key, value, updated_at) VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (store_id, user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [req.storeId, req.user!.id, key, json],
    );
    res.json({ success: true, data: { value } });
  } catch (error) {
    next(error);
  }
});
