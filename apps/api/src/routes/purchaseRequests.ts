import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canManageArea } from '../services/employeeAccess.js';
import { findSalesCatalogByPublicKey } from '../services/salesCatalog.js';

/**
 * Solicitações de compra pelo catálogo digital.
 * Cliente pede produto/opção indisponível → fila no painel → entrada de estoque + venda pelos fluxos existentes.
 */
export const purchaseRequestsRouter = Router();
purchaseRequestsRouter.use('/api/v1/purchase-requests', requireAuth);

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const digitsOf = (phone: string) => phone.replace(/\D/g, '').slice(-11);
const text = (max: number) => z.string().trim().max(max).default('');

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  open: 'Aberta',
  in_progress: 'Em atendimento',
  fulfilled: 'Atendida',
  cancelled: 'Cancelada',
};

const recent = new Map<string, number[]>();
function rateLimit(key: string, max = 6) {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((at) => now - at < 10 * 60_000);
  if (list.length >= max) throw httpError('Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.', 429);
  list.push(now);
  recent.set(key, list);
}

const view = (row: any) => ({
  id: row.id,
  protocol: row.protocol,
  seq: Number(row.seq) || 0,
  catalogId: row.catalog_id ?? null,
  status: row.status as keyof typeof PURCHASE_STATUS_LABEL,
  statusLabel: PURCHASE_STATUS_LABEL[row.status] ?? row.status,
  customerId: row.customer_id ?? null,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  productId: row.product_id ?? null,
  productName: row.product_name || '',
  brand: row.brand || '',
  variantLabel: row.variant_label || '',
  attributes: Array.isArray(row.attributes) ? row.attributes : [],
  qty: Number(row.qty) || 1,
  notes: row.notes || '',
  desiredOptions: row.desired_options || '',
  history: Array.isArray(row.history) ? row.history : [],
  stockEntryId: row.stock_entry_id ?? null,
  saleId: row.sale_id ?? null,
  handledBy: row.handled_by || '',
  cancelReason: row.cancel_reason || '',
  fulfilledAt: row.fulfilled_at ?? null,
  fulfilledBy: row.fulfilled_by || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function requireManage(req: { user?: { role?: string }; areaGranted?: boolean }) {
  if (!canManageArea(req)) throw httpError('Seu acesso não inclui Produtos. Peça ao administrador para liberar em Pessoas › Permissões.', 403);
}

/* ── Painel ─────────────────────────────────────────────────────────────────── */

purchaseRequestsRouter.get('/api/v1/purchase-requests', async (req, res, next) => {
  try {
    const status = String(req.query.status ?? '').trim();
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    const args: unknown[] = [req.storeId];
    let where = 'store_id = $1';
    if (status && status !== 'all') {
      const statuses = status.split(',').map((s) => s.trim()).filter((s) => s in PURCHASE_STATUS_LABEL);
      if (statuses.length) {
        args.push(statuses);
        where += ` AND status = ANY($${args.length}::text[])`;
      }
    }
    if (q) {
      args.push(`%${q.toLowerCase()}%`);
      const like = `$${args.length}`;
      const digits = q.replace(/\D/g, '');
      if (digits.length >= 4) {
        args.push(`%${digits}%`);
        where += ` AND (lower(protocol) LIKE ${like} OR lower(customer_name) LIKE ${like} OR lower(product_name) LIKE ${like} OR lower(desired_options) LIKE ${like} OR phone_digits LIKE $${args.length})`;
      } else {
        where += ` AND (lower(protocol) LIKE ${like} OR lower(customer_name) LIKE ${like} OR lower(product_name) LIKE ${like} OR lower(desired_options) LIKE ${like})`;
      }
    }
    const rows = (await pool.query(`SELECT * FROM purchase_requests WHERE ${where} ORDER BY created_at DESC LIMIT 300`, args)).rows;
    res.json({ success: true, data: rows.map(view) });
  } catch (error) {
    next(error);
  }
});

purchaseRequestsRouter.get('/api/v1/purchase-requests/summary', async (req, res, next) => {
  try {
    const rows = (await pool.query('SELECT status, count(*)::int AS n FROM purchase_requests WHERE store_id = $1 GROUP BY status', [req.storeId])).rows;
    const counts = Object.fromEntries(Object.keys(PURCHASE_STATUS_LABEL).map((s) => [s, 0]));
    for (const row of rows) counts[row.status] = Number(row.n);
    res.json({ success: true, data: { counts, open: (counts.open ?? 0) + (counts.in_progress ?? 0) } });
  } catch (error) {
    next(error);
  }
});

purchaseRequestsRouter.get('/api/v1/purchase-requests/:id', async (req, res, next) => {
  try {
    const row = (await pool.query('SELECT * FROM purchase_requests WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId])).rows[0];
    if (!row) throw httpError('Solicitação não encontrada nesta loja.', 404);
    res.json({ success: true, data: view(row) });
  } catch (error) {
    next(error);
  }
});

const patchSchema = z.object({
  status: z.enum(['open', 'in_progress', 'fulfilled', 'cancelled']).optional(),
  note: text(400),
  cancelReason: text(400),
  productId: z.string().trim().max(80).nullable().optional(),
  productName: text(160).optional(),
  qty: z.number().int().min(1).max(99).optional(),
  notes: text(500).optional(),
  desiredOptions: text(500).optional(),
  stockEntryId: z.string().trim().max(80).nullable().optional(),
  saleId: z.string().trim().max(80).nullable().optional(),
});

purchaseRequestsRouter.patch('/api/v1/purchase-requests/:id', async (req, res, next) => {
  try {
    requireManage(req);
    const body = patchSchema.parse(req.body ?? {});
    const row = (await pool.query('SELECT * FROM purchase_requests WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId])).rows[0];
    if (!row) throw httpError('Solicitação não encontrada nesta loja.', 404);
    if (row.status === 'fulfilled' && body.status && body.status !== 'fulfilled') {
      throw httpError('Solicitação já atendida. Não é possível alterar a situação.', 409);
    }
    if (row.status === 'cancelled' && body.status && body.status !== 'open') {
      throw httpError('Solicitação cancelada. Reabra (Aberta) para alterar.', 409);
    }

    if (body.productId) {
      const found = (await pool.query('SELECT id, name, brand FROM stock_items WHERE id = $1 AND store_id = $2', [body.productId, req.storeId])).rows[0];
      if (!found) throw httpError('Produto não encontrado nesta loja.');
    }

    const by = req.user?.name ?? '';
    const at = new Date().toISOString();
    const history = Array.isArray(row.history) ? [...row.history] : [];
    let status = row.status;
    let cancelReason = row.cancel_reason || '';
    let fulfilledAt = row.fulfilled_at;
    let fulfilledBy = row.fulfilled_by || '';
    let handledBy = row.handled_by || '';

    if (body.status && body.status !== row.status) {
      history.push({
        at,
        by,
        action: 'status',
        from: row.status,
        to: body.status,
        note: body.note || body.cancelReason || PURCHASE_STATUS_LABEL[body.status],
      });
      status = body.status;
      if (body.status === 'in_progress' && !handledBy) handledBy = by;
      if (body.status === 'fulfilled') {
        fulfilledAt = at;
        fulfilledBy = by;
        handledBy = handledBy || by;
      }
      if (body.status === 'cancelled') cancelReason = body.cancelReason || body.note || cancelReason;
      if (body.status === 'open') {
        cancelReason = '';
        fulfilledAt = null;
        fulfilledBy = '';
      }
    } else if (body.note) {
      history.push({ at, by, action: 'note', note: body.note });
    }

    if (body.stockEntryId !== undefined && body.stockEntryId !== row.stock_entry_id) {
      history.push({ at, by, action: 'stock_entry', note: body.stockEntryId ? `Entrada vinculada: ${body.stockEntryId}` : 'Entrada desvinculada' });
    }
    if (body.saleId !== undefined && body.saleId !== row.sale_id) {
      history.push({ at, by, action: 'sale', note: body.saleId ? `Venda vinculada: ${body.saleId}` : 'Venda desvinculada' });
    }

    const productId = body.productId !== undefined ? body.productId : row.product_id;
    const productName = body.productName !== undefined ? body.productName : row.product_name;
    const qty = body.qty !== undefined ? body.qty : row.qty;
    const notes = body.notes !== undefined ? body.notes : row.notes;
    const desiredOptions = body.desiredOptions !== undefined ? body.desiredOptions : row.desired_options;
    const stockEntryId = body.stockEntryId !== undefined ? body.stockEntryId : row.stock_entry_id;
    const saleId = body.saleId !== undefined ? body.saleId : row.sale_id;

    const updated = (
      await pool.query(
        `UPDATE purchase_requests SET
           status = $3, cancel_reason = $4, fulfilled_at = $5, fulfilled_by = $6, handled_by = $7,
           product_id = $8, product_name = $9, qty = $10::int, notes = $11, desired_options = $12,
           stock_entry_id = $13, sale_id = $14, history = $15::jsonb, updated_at = now()
         WHERE id = $1 AND store_id = $2 RETURNING *`,
        [
          row.id,
          req.storeId,
          status,
          cancelReason,
          fulfilledAt,
          fulfilledBy,
          handledBy,
          productId,
          productName,
          qty,
          notes,
          desiredOptions,
          stockEntryId,
          saleId,
          JSON.stringify(history),
        ],
      )
    ).rows[0];
    res.json({ success: true, data: view(updated) });
  } catch (error) {
    next(error);
  }
});

/** Duplicar: cria nova solicitação aberta com os mesmos dados (equipe). */
purchaseRequestsRouter.post('/api/v1/purchase-requests/:id/duplicate', async (req, res, next) => {
  try {
    requireManage(req);
    const row = (await pool.query('SELECT * FROM purchase_requests WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId])).rows[0];
    if (!row) throw httpError('Solicitação não encontrada nesta loja.', 404);
    const by = req.user?.name ?? '';
    const at = new Date().toISOString();
    let saved: any = null;
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const seq = Number((await pool.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM purchase_requests WHERE store_id = $1', [req.storeId])).rows[0].next) + attempt;
      const protocol = `CMP-${String(seq).padStart(5, '0')}`;
      try {
        saved = (
          await pool.query(
            `INSERT INTO purchase_requests (
               id, store_id, seq, protocol, catalog_id, status, customer_id, customer_name, customer_phone, phone_digits,
               product_id, product_name, brand, variant_label, attributes, qty, notes, desired_options, history, handled_by
             ) VALUES (
               $1, $2, $3::int, $4, $5, 'open', $6, $7, $8, $9,
               $10, $11, $12, $13, $14::jsonb, $15::int, $16, $17, $18::jsonb, $19
             ) RETURNING *`,
            [
              `PRQ-${randomUUID()}`,
              req.storeId,
              seq,
              protocol,
              row.catalog_id,
              row.customer_id,
              row.customer_name,
              row.customer_phone,
              row.phone_digits,
              row.product_id,
              row.product_name,
              row.brand,
              row.variant_label,
              JSON.stringify(Array.isArray(row.attributes) ? row.attributes : []),
              Number(row.qty) || 1,
              row.notes || '',
              row.desired_options || '',
              JSON.stringify([{ at, by, action: 'created', to: 'open', note: `Duplicada de ${row.protocol}` }]),
              by,
            ],
          )
        ).rows[0];
      } catch (error: any) {
        if (!/unique|duplicate/i.test(String(error?.message))) throw error;
      }
    }
    if (!saved) throw httpError('Não foi possível duplicar agora. Tente de novo.', 503);
    res.status(201).json({ success: true, data: view(saved) });
  } catch (error) {
    next(error);
  }
});

purchaseRequestsRouter.delete('/api/v1/purchase-requests/:id', async (req, res, next) => {
  try {
    requireManage(req);
    const row = (await pool.query('SELECT * FROM purchase_requests WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId])).rows[0];
    if (!row) throw httpError('Solicitação não encontrada nesta loja.', 404);
    if (row.status === 'fulfilled') throw httpError('Não é possível excluir uma solicitação já atendida.', 409);
    if (row.status !== 'cancelled') {
      const by = req.user?.name ?? '';
      const at = new Date().toISOString();
      const history = Array.isArray(row.history) ? [...row.history] : [];
      history.push({ at, by, action: 'status', from: row.status, to: 'cancelled', note: 'Cancelada pela equipe' });
      const updated = (
        await pool.query(
          `UPDATE purchase_requests SET status = 'cancelled', cancel_reason = COALESCE(NULLIF(cancel_reason, ''), 'Cancelada pela equipe'),
             history = $3::jsonb, updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *`,
          [row.id, req.storeId, JSON.stringify(history)],
        )
      ).rows[0];
      res.json({ success: true, data: view(updated) });
      return;
    }
    await pool.query('DELETE FROM purchase_requests WHERE id = $1 AND store_id = $2', [row.id, req.storeId]);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── Público (catálogo) ─────────────────────────────────────────────────────── */

const publicSchema = z.object({
  requestKey: z.string().trim().min(8).max(80).optional(),
  productId: z.string().trim().max(80).nullable().optional(),
  productName: text(160),
  brand: text(60),
  variantLabel: text(160),
  attributes: z
    .array(z.object({ id: z.string().max(80).default(''), name: z.string().max(80).default(''), value: z.string().max(100) }))
    .max(12)
    .default([]),
  qty: z.coerce.number().int().min(1).max(99).default(1),
  desiredOptions: text(500),
  notes: text(500),
  customer: z.object({
    name: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
    phone: z.string().trim().max(30).refine((value) => value.replace(/\D/g, '').length >= 10, 'Informe o WhatsApp com DDD.'),
  }),
  website: z.string().max(200).optional(),
});

purchaseRequestsRouter.post('/api/v1/public/sales-catalogs/:token/purchase-requests', async (req, res, next) => {
  try {
    const catalog = await findSalesCatalogByPublicKey(pool, req.params.token);
    if (!catalog) throw httpError('Catálogo não encontrado ou link desativado.', 404);
    const body = publicSchema.parse(req.body ?? {});
    if (body.website) throw httpError('Não foi possível enviar.', 400);
    if (!body.productId && !body.productName.trim() && body.desiredOptions.trim().length < 5) {
      throw httpError('Descreva o produto ou as opções que deseja solicitar.');
    }
    rateLimit(`purchase:${catalog.id}:${req.ip}`, 6);
    const storeId = catalog.store_id;

    if (body.requestKey) {
      const existing = (await pool.query('SELECT * FROM purchase_requests WHERE store_id = $1 AND request_key = $2', [storeId, body.requestKey])).rows[0];
      if (existing) {
        res.json({ success: true, data: { id: existing.id, protocol: existing.protocol } });
        return;
      }
    }

    let productId = body.productId || null;
    let productName = body.productName.trim();
    let brand = body.brand.trim();
    if (productId) {
      const allowed: string[] = Array.isArray(catalog.product_ids) ? catalog.product_ids : [];
      if (allowed.length && !allowed.includes(productId)) throw httpError('Este produto não está neste catálogo.', 409);
      const item = (await pool.query('SELECT id, name, brand FROM stock_items WHERE id = $1 AND store_id = $2', [productId, storeId])).rows[0];
      if (!item) throw httpError('Produto não encontrado.', 404);
      productName = productName || item.name;
      brand = brand || String(item.brand || '');
    }

    const phoneDigits = digitsOf(body.customer.phone);
    const customerId =
      (await pool.query('SELECT id FROM customers WHERE store_id = $1 AND phone_digits = $2 LIMIT 1', [storeId, phoneDigits])).rows[0]?.id ?? null;
    const at = new Date().toISOString();

    let saved: any = null;
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const seq = Number((await pool.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM purchase_requests WHERE store_id = $1', [storeId])).rows[0].next) + attempt;
      const protocol = `CMP-${String(seq).padStart(5, '0')}`;
      try {
        saved = (
          await pool.query(
            `INSERT INTO purchase_requests (
               id, store_id, seq, protocol, catalog_id, request_key, status, customer_id, customer_name, customer_phone, phone_digits,
               product_id, product_name, brand, variant_label, attributes, qty, notes, desired_options, history
             ) VALUES (
               $1, $2, $3::int, $4, $5, $6, 'open', $7, $8, $9, $10,
               $11, $12, $13, $14, $15::jsonb, $16::int, $17, $18, $19::jsonb
             ) RETURNING *`,
            [
              `PRQ-${randomUUID()}`,
              storeId,
              seq,
              protocol,
              catalog.id,
              body.requestKey ?? null,
              customerId,
              body.customer.name,
              body.customer.phone,
              phoneDigits,
              productId,
              productName,
              brand,
              body.variantLabel.trim(),
              JSON.stringify(body.attributes),
              body.qty,
              body.notes,
              body.desiredOptions,
              JSON.stringify([{ at, by: body.customer.name, action: 'created', to: 'open', note: 'Solicitação enviada pelo Catálogo Digital' }]),
            ],
          )
        ).rows[0];
      } catch (error: any) {
        if (!/unique|duplicate/i.test(String(error?.message))) throw error;
      }
    }
    if (!saved) throw httpError('Não foi possível gerar o protocolo agora. Tente de novo.', 503);
    res.status(201).json({ success: true, data: { id: saved.id, protocol: saved.protocol } });
  } catch (error) {
    next(error);
  }
});
