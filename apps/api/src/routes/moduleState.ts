import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

export const moduleStateRouter = Router();
const keys = z.enum(['card-rates', 'cash-settings', 'pos-quotes', 'stock-inventory', 'os-print-settings', 'bank-files', 'operations']);
const publicData = (key: string, data: any) => {
  if (key !== 'cash-settings' || !data) return data;
  const { deletePasswordHash: _hash, ...settings } = data;
  return { ...settings, deleteItemPassword: '', deletePasswordConfigured: Boolean(_hash) };
};
const schema = z.object({ revision: z.number().int().nonnegative(), data: z.union([z.record(z.unknown()), z.array(z.unknown())]) });
moduleStateRouter.get('/api/v1/module-state/:key', requireAuth, async (req, res, next) => {
  try {
    const key = keys.parse(req.params.key);
    const result = await pool.query('SELECT data,revision FROM store_module_state WHERE store_id=$1 AND module_key=$2', [req.storeId, key]);
    const row = result.rows[0] ?? { data: null, revision: 0 };
    res.json({ success: true, data: { ...row, data: publicData(key, row.data) } });
  } catch (error) { next(error); }
});
moduleStateRouter.put('/api/v1/module-state/:key', requireAuth, async (req, res, next) => {
  try {
    const key = keys.parse(req.params.key);
    const body = schema.parse(req.body);
    if (['cardapio', 'card-rates', 'cash-settings', 'os-print-settings', 'bank-files', 'operations'].includes(key)
      && !['admin', 'manager', 'superadmin'].includes(req.user!.role ?? '')) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Sem permissão para alterar configurações da loja.' } }); return;
    }
    if (key === 'card-rates') {
      const rate = z.number().finite().min(0).max(100);
      const brand = z.object({id:z.string().min(1),name:z.string().min(1),active:z.boolean(),debitRate:rate,
        installments:z.array(z.object({installment:z.number().int().min(1).max(36),rate})).min(1).max(36)});
      body.data=z.array(z.object({id:z.string().min(1),name:z.string().min(1),model:z.string().optional(),serialNumber:z.string().optional(),
        isDefaultTotem:z.boolean(),defaultBrandId:z.string().min(1),active:z.boolean(),brands:z.array(brand).min(1),createdAt:z.string(),updatedAt:z.string()})).max(100).parse(body.data);
    }
    if (key === 'cash-settings') {
      const settings = z.object({ deleteItemPassword: z.string().max(128).optional(), requirePasswordToDeleteItem: z.boolean().optional() }).passthrough().parse(body.data);
      const current = await pool.query('SELECT data FROM store_module_state WHERE store_id=$1 AND module_key=$2', [req.storeId, key]);
      const password = settings.deleteItemPassword?.trim();
      let hash = current.rows[0]?.data?.deletePasswordHash;
      if (password) { const salt = randomBytes(16).toString('hex'); hash = salt + ':' + scryptSync(password, salt, 64).toString('hex'); }
      if (settings.requirePasswordToDeleteItem && !hash) { res.status(400).json({ success:false, error:{ code:'PASSWORD_REQUIRED', message:'Defina uma senha administrativa antes de exigir autorização.' } }); return; }
      delete settings.deleteItemPassword;
      delete settings.deletePasswordConfigured;
      delete settings.deletePasswordHash;
      body.data = { ...settings, ...(hash ? { deletePasswordHash: hash } : {}) };
    }
    const updated = body.revision === 0 ? await pool.query(
      `INSERT INTO store_module_state(store_id,module_key,data,revision,updated_by)
       SELECT $1,$2,$3::jsonb,1,$5 WHERE $4::integer=0
       ON CONFLICT (store_id,module_key) DO NOTHING RETURNING data,revision`,
      [req.storeId, key, JSON.stringify(body.data), body.revision, req.user!.id],
    ) : await pool.query(
      `UPDATE store_module_state SET data=$3::jsonb,revision=revision+1,updated_by=$5,updated_at=now()
       WHERE store_id=$1 AND module_key=$2 AND revision=$4 RETURNING data,revision`,
      [req.storeId, key, JSON.stringify(body.data), body.revision, req.user!.id],
    );
    if (!updated.rows[0]) { res.status(409).json({ success: false, error: { code: 'REVISION_CONFLICT', message: 'Outro usuário alterou esses dados. Atualize a tela antes de salvar novamente.' } }); return; }
    res.json({ success: true, data: { ...updated.rows[0], data: publicData(key, updated.rows[0].data) } });
  } catch (error) { next(error); }
});

const verificationAttempts = new Map<string, { count: number; until: number }>();
moduleStateRouter.post('/api/v1/module-state/cash-settings/verify-password', requireAuth, async (req, res, next) => {
  try {
    const password = z.string().min(1).max(128).parse(req.body.password);
    const identity = `${req.storeId}:${req.user!.id}`;
    const attempt = verificationAttempts.get(identity);
    if (attempt && attempt.until > Date.now() && attempt.count >= 5) { res.status(429).json({ success:false, error:{ code:'TOO_MANY_ATTEMPTS', message:'Aguarde um minuto antes de tentar novamente.' } }); return; }
    for (const [key, value] of verificationAttempts) if (value.until <= Date.now()) verificationAttempts.delete(key);
    const result = await pool.query('SELECT data FROM store_module_state WHERE store_id=$1 AND module_key=$2', [req.storeId, 'cash-settings']);
    const stored = result.rows[0]?.data?.deletePasswordHash;
    const [salt, hash] = typeof stored === 'string' ? stored.split(':') : [];
    const expected = Buffer.from(hash ?? '', 'hex');
    const actual = salt ? scryptSync(password, salt, 64) : Buffer.alloc(0);
    const valid = expected.length === 64 && actual.length === expected.length && timingSafeEqual(actual, expected);
    if (valid) verificationAttempts.delete(identity);
    else verificationAttempts.set(identity, { count: (attempt && attempt.until > Date.now() ? attempt.count : 0) + 1, until: Date.now() + 60000 });
    res.json({ success:true, data:{ valid } });
  } catch (error) { next(error); }
});
