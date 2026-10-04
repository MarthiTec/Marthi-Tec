import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { APPLE_REFERENCE_URL, matchReference, parseAppleModels, type DeviceReference } from '../services/deviceReference.js';

export const deviceReferenceRouter = Router();
let refresh: Promise<DeviceReference[]> | null = null;

async function loadReferences(): Promise<DeviceReference[]> {
  const saved = await pool.query('SELECT data, refreshed_at FROM device_reference_sources WHERE source_url = $1', [APPLE_REFERENCE_URL]);
  const row = saved.rows[0];
  if (row && Date.now() - new Date(row.refreshed_at).getTime() < 86400000) return row.data;
  if (!refresh) {
    refresh = (async () => {
      const response = await fetch(APPLE_REFERENCE_URL, { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error('Não foi possível consultar as especificações do fabricante.');
      const models = parseAppleModels(await response.text());
      if (!models.length) throw new Error('As especificações do fabricante estão indisponíveis.');
      await pool.query(`INSERT INTO device_reference_sources (source_url, data) VALUES ($1, $2::jsonb)
        ON CONFLICT (source_url) DO UPDATE SET data = EXCLUDED.data, refreshed_at = now()`, [APPLE_REFERENCE_URL, JSON.stringify(models)]);
      return models;
    })().finally(() => { refresh = null; });
  }
  try { return await refresh; }
  catch (error) { if (row) return row.data; throw error; }
}

deviceReferenceRouter.get('/api/v1/device-reference', requireAuth, async (req, res, next) => {
  try {
    const query = String(req.query.name ?? '').trim().slice(0, 160);
    if (!/\biphone\b/i.test(query)) { res.json({ success: true, data: null }); return; }
    res.json({ success: true, data: matchReference(query, await loadReferences()) });
  } catch (error) { next(error); }
});
