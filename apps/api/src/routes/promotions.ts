import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
export const promotionsRouter = Router();
const schema = z.object({
  id: z.string().optional(), name: z.string().trim().min(1), active: z.boolean(),
  dayOffer:z.boolean().optional(),channels:z.array(z.enum(['totem','pdv','external'])).optional(),
  kind: z.enum(['tier', 'gift', 'percent', 'fixed', 'promo_price', 'buy_x_pay_y']),
  criteria: z.object({ stockIds: z.array(z.string()), supplierId: z.string().optional(),
    category: z.string().optional(), brand: z.string().optional(), minQty: z.number().positive().optional(),
    minAmount: z.number().nonnegative().optional(), customerGroup: z.string().optional(),attributes:z.record(z.string()).optional() }),
  discountPercent: z.number().min(0).max(100).optional(), discountAmount: z.number().nonnegative().optional(),
  promoPrice: z.number().nonnegative().optional(), tiers: z.array(z.object({ qty: z.number().int().positive(), totalPrice: z.number().nonnegative() })),
  buyQty: z.number().int().positive().optional(), payQty: z.number().int().positive().optional(),
  giftStockId: z.string(), giftMinQty: z.number().int().positive(), priority: z.number(),
  accumulative: z.boolean(), stockIds: z.array(z.string()), note: z.string(),
  startDate: z.string().optional(), endDate: z.string().optional(),
});
const fromRow = (row: any) => ({ ...row.rules, id: row.id, name: row.name, active: row.active, createdAt: row.created_at });
promotionsRouter.get('/api/v1/promotions', requireAuth, async (req, res, next) => {
  try { const rows = await pool.query('SELECT * FROM promo_campaigns WHERE store_id = $1 ORDER BY created_at DESC', [req.storeId]);
    res.json({ success: true, data: rows.rows.map(fromRow) });
  } catch (error) { next(error); }
});
promotionsRouter.post('/api/v1/promotions', requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager', 'superadmin'].includes(req.user!.role ?? '')) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Sem permissão para configurar campanhas.' } }); return; }
    const body = schema.parse(req.body); const id = body.id ?? randomUUID();
    if(body.dayOffer && (body.kind!=='promo_price'||!body.promoPrice||!body.endDate||!Number.isFinite(Date.parse(body.endDate))||Date.parse(body.endDate)<=Date.now()||!body.criteria.stockIds.length||!body.channels?.length)) throw Object.assign(new Error('Defina produto, preço positivo, canais e uma validade futura para a oferta.'),{status:400});
    if(body.dayOffer){const targets=await pool.query('SELECT id FROM stock_items WHERE store_id=$1 AND id=ANY($2::text[])',[req.storeId,body.criteria.stockIds]);if(targets.rows.length!==new Set(body.criteria.stockIds).size)throw Object.assign(new Error('Produto de outra loja ou indisponível.'),{status:400});}
    const result = await pool.query(
      `INSERT INTO promo_campaigns(id, store_id, name, active, rules) VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, active=EXCLUDED.active, rules=EXCLUDED.rules
       WHERE promo_campaigns.store_id=EXCLUDED.store_id RETURNING *`,
      [id, req.storeId, body.name, body.active, JSON.stringify(body)],
    );
    if (!result.rows[0]) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada nesta loja.' } }); return; }
    res.json({ success: true, data: fromRow(result.rows[0]) });
  } catch (error) { next(error); }
});
promotionsRouter.delete('/api/v1/promotions/:id', requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'manager', 'superadmin'].includes(req.user!.role ?? '')) { res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Sem permissão para excluir campanhas.' } }); return; }
    const result = await pool.query('DELETE FROM promo_campaigns WHERE id=$1 AND store_id=$2 RETURNING id', [req.params.id, req.storeId]);
    if (!result.rowCount) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Campanha não encontrada nesta loja.' } }); return; }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) { next(error); }
});
