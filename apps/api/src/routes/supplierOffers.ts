import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Cotação avançada: ofertas dos fornecedores para o mesmo aparelho. O preço muda várias vezes no dia,
 * então cada oferta guarda o dia da cotação; a tela compara preço, prazo, parcelamento e procedência.
 */
export const supplierOffersRouter = Router();

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const list = z.array(z.string().trim().min(1).max(40)).max(30).default([]);

const offerSchema = z.object({
  supplierId: z.string().trim().max(100).optional().nullable(),
  supplierName: z.string().trim().min(1, 'Informe o fornecedor.').max(160),
  model: z.string().trim().min(1, 'Informe o aparelho.').max(160),
  condition: z.enum(['new', 'used', 'refurbished']).default('new'),
  batteryLevel: z.coerce.number().int().min(1).max(100).optional().nullable(),
  capacities: list,
  colors: list,
  price: z.coerce.number().positive('Informe o preço do fornecedor.'),
  deliveryDays: z.coerce.number().int().min(0).max(120).default(0),
  maxInstallments: z.coerce.number().int().min(1).max(24).default(1),
  installmentFeePercent: z.coerce.number().min(0).max(100).default(0),
  origin: z.string().trim().max(80).default(''),
  warranty: z.string().trim().max(120).default(''),
  notes: z.string().trim().max(500).default(''),
  quotedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const offerRow = (row: any) => ({
  id: row.id,
  supplierId: row.supplier_id ?? '',
  supplierName: row.supplier_name,
  model: row.model,
  condition: row.condition,
  batteryLevel: row.battery_level ?? null,
  capacities: row.capacities ?? [],
  colors: row.colors ?? [],
  price: Number(row.price) || 0,
  deliveryDays: Number(row.delivery_days) || 0,
  maxInstallments: Number(row.max_installments) || 1,
  installmentFeePercent: Number(row.installment_fee_percent) || 0,
  origin: row.origin ?? '',
  warranty: row.warranty ?? '',
  notes: row.notes ?? '',
  quotedAt: String(row.quoted_at instanceof Date ? row.quoted_at.toISOString() : row.quoted_at).slice(0, 10),
  createdBy: row.created_by ?? '',
  updatedAt: row.updated_at,
});

async function assertSupplier(storeId: string, supplierId?: string | null) {
  if (!supplierId) return;
  if (!(await pool.query('SELECT 1 FROM suppliers WHERE id = $1 AND store_id = $2', [supplierId, storeId])).rows.length) {
    throw httpError('Fornecedor não encontrado nesta loja.', 400);
  }
}

/** Hoje no fuso da loja (Brasília), para o dia da cotação. */
const todayBrasilia = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);

supplierOffersRouter.get('/api/v1/supplier-offers', requireAuth, async (req, res, next) => {
  try {
    const query = z.object({ days: z.coerce.number().int().min(0).max(365).default(7) }).parse(req.query);
    const rows = await pool.query(
      `SELECT * FROM supplier_offers WHERE store_id = $1 AND quoted_at >= ($2::date - $3::int) ORDER BY quoted_at DESC, price ASC`,
      [req.storeId, todayBrasilia(), query.days],
    );
    res.json({ success: true, data: rows.rows.map(offerRow) });
  } catch (error) {
    next(error);
  }
});

supplierOffersRouter.post('/api/v1/supplier-offers', requireAuth, async (req, res, next) => {
  try {
    const body = offerSchema.parse(req.body);
    await assertSupplier(req.storeId!, body.supplierId);
    const inserted = await pool.query(
      `INSERT INTO supplier_offers (id, store_id, supplier_id, supplier_name, model, condition, battery_level, capacities, colors, price,
         delivery_days, max_installments, installment_fee_percent, origin, warranty, notes, quoted_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17::date,$18) RETURNING *`,
      [
        `OFR-${randomUUID()}`, req.storeId, body.supplierId || null, body.supplierName, body.model, body.condition,
        body.condition === 'new' ? null : body.batteryLevel ?? null, JSON.stringify(body.capacities), JSON.stringify(body.colors), body.price,
        body.deliveryDays, body.maxInstallments, body.installmentFeePercent, body.origin, body.warranty, body.notes,
        body.quotedAt ?? todayBrasilia(), req.user?.name ?? '',
      ],
    );
    res.status(201).json({ success: true, data: offerRow(inserted.rows[0]) });
  } catch (error) {
    next(error);
  }
});

supplierOffersRouter.put('/api/v1/supplier-offers/:id', requireAuth, async (req, res, next) => {
  try {
    const body = offerSchema.parse(req.body);
    await assertSupplier(req.storeId!, body.supplierId);
    const updated = await pool.query(
      `UPDATE supplier_offers SET supplier_id=$3, supplier_name=$4, model=$5, condition=$6, battery_level=$7, capacities=$8::jsonb, colors=$9::jsonb,
         price=$10, delivery_days=$11, max_installments=$12, installment_fee_percent=$13, origin=$14, warranty=$15, notes=$16,
         quoted_at=COALESCE($17::date, quoted_at), updated_at=now()
       WHERE id=$1 AND store_id=$2 RETURNING *`,
      [
        req.params.id, req.storeId, body.supplierId || null, body.supplierName, body.model, body.condition,
        body.condition === 'new' ? null : body.batteryLevel ?? null, JSON.stringify(body.capacities), JSON.stringify(body.colors), body.price,
        body.deliveryDays, body.maxInstallments, body.installmentFeePercent, body.origin, body.warranty, body.notes, body.quotedAt ?? null,
      ],
    );
    if (!updated.rows[0]) throw httpError('Oferta não encontrada.', 404);
    res.json({ success: true, data: offerRow(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

supplierOffersRouter.delete('/api/v1/supplier-offers/:id', requireAuth, async (req, res, next) => {
  try {
    const deleted = await pool.query('DELETE FROM supplier_offers WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
    if (!deleted.rowCount) throw httpError('Oferta não encontrada.', 404);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});
