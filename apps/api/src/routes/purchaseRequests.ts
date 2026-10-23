import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canManageArea } from '../services/employeeAccess.js';
import { findSalesCatalogByPublicKey } from '../services/salesCatalog.js';
import { getStoreWhatsAppConfig } from '../services/storeCommunication.js';
import { resolveStoreEvolutionCreds, sendEvolutionText } from '../services/evolutionWhatsApp.js';

/**
 * Solicitações de compra pelo catálogo digital.
 * Cliente pede produto/opção indisponível → fila no painel → entrada de estoque + venda pelos fluxos existentes.
 */
export const purchaseRequestsRouter = Router();
purchaseRequestsRouter.use('/api/v1/purchase-requests', requireAuth);

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const digitsOf = (phone: string) => phone.replace(/\D/g, '').slice(-11);
const text = (max: number) => z.string().trim().max(max).default('');
const CONDITION_LABEL: Record<string, string> = { new: 'novo', used: 'usado' };

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

const attrKind = (name: string): 'color' | 'capacity' | null => {
  const value = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\b(cor|cores|color|colour)\b/.test(value)) return 'color';
  if (/(capac|armazen|memoria|storage)/.test(value)) return 'capacity';
  return null;
};

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
  catalogTypeId: row.catalog_type_id ?? null,
  catalogModelId: row.catalog_model_id ?? null,
  deviceType: row.device_type || '',
  deviceModel: row.device_model || '',
  color: row.color || '',
  capacity: row.capacity || '',
  condition: row.condition === 'used' ? 'used' : 'new',
  conditionLabel: CONDITION_LABEL[row.condition === 'used' ? 'used' : 'new'],
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

async function resolveCatalog(token: string) {
  const key = String(token ?? '').trim();
  if (!key) throw httpError('Catálogo não encontrado ou link desativado.', 404);
  const catalog = await findSalesCatalogByPublicKey(pool, key);
  if (!catalog) throw httpError('Catálogo não encontrado ou link desativado.', 404);
  return catalog;
}

function productDescription(row: {
  product_name?: string;
  brand?: string;
  device_type?: string;
  device_model?: string;
  color?: string;
  capacity?: string;
}) {
  const base =
    String(row.product_name || '').trim() ||
    [row.brand, row.device_type, row.device_model].filter(Boolean).join(' ').toUpperCase() ||
    'produto solicitado';
  const extras = [row.color, row.capacity].filter((value) => {
    const text = String(value || '').trim();
    return text && !base.toLowerCase().includes(text.toLowerCase());
  });
  return extras.length ? `${base}, ${extras.join(', ')}` : base;
}

function customerPurchaseMessage(row: any) {
  const desc = productDescription(row);
  const condition = CONDITION_LABEL[row.condition === 'used' ? 'used' : 'new'];
  return `Oi, fiz uma solicitação de compra pelo catálogo digital. Gostaria de comprar o produto ${desc}, condição ${condition}. Vocês podem conseguir esse aparelho pra mim?`;
}

/** Avisa o vendedor pelo WhatsApp da loja (Evolution). Falha silenciosa se não estiver configurado. */
async function notifySellerWhatsApp(storeId: string, message: string) {
  try {
    const cfg = await getStoreWhatsAppConfig(storeId);
    if (!cfg.enabled) return { sent: false, reason: 'disabled' as const };
    const { baseUrl, instance, apiKey } = resolveStoreEvolutionCreds(cfg);
    if (!baseUrl || !instance || !apiKey) return { sent: false, reason: 'unconfigured' as const };
    let phone = String(cfg.storeNumber || '').trim();
    if (!phone) {
      phone = String((await pool.query('SELECT phone FROM stores WHERE id = $1', [storeId])).rows[0]?.phone || '').trim();
    }
    if (!phone || phone.replace(/\D/g, '').length < 10) return { sent: false, reason: 'no_phone' as const };
    const result = await sendEvolutionText(phone, message, { baseUrl, instance, apiKey, storeId });
    return { sent: result.ok, reason: result.ok ? ('ok' as const) : ('rejected' as const) };
  } catch (error) {
    console.warn('[purchase-requests] WhatsApp loja:', error instanceof Error ? error.message : error);
    return { sent: false, reason: 'error' as const };
  }
}

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

    // Ping opcional ao marcar como atendida — falha não bloqueia o painel.
    if (body.status === 'fulfilled' && row.status !== 'fulfilled') {
      void notifySellerWhatsApp(
        req.storeId!,
        `Solicitação ${updated.protocol} marcada como atendida. Cliente: ${updated.customer_name} (${updated.customer_phone}). ${productDescription(updated)}, condição ${CONDITION_LABEL[updated.condition === 'used' ? 'used' : 'new']}.`,
      );
    }

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
               product_id, product_name, brand, catalog_type_id, catalog_model_id, device_type, device_model, color, capacity, condition,
               variant_label, attributes, qty, notes, desired_options, history, handled_by
             ) VALUES (
               $1, $2, $3::int, $4, $5, 'open', $6, $7, $8, $9,
               $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
               $20, $21::jsonb, $22::int, $23, $24, $25::jsonb, $26
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
              row.catalog_type_id ?? null,
              row.catalog_model_id ?? null,
              row.device_type || '',
              row.device_model || '',
              row.color || '',
              row.capacity || '',
              row.condition === 'used' ? 'used' : 'new',
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

/** Opções do builder (marca/tipo/modelo + cor/capacidade), alinhadas ao cadastro de estoque. */
purchaseRequestsRouter.get('/api/v1/public/sales-catalogs/:token/purchase-builder', async (req, res, next) => {
  try {
    const catalog = await resolveCatalog(req.params.token);
    const storeId = catalog.store_id;
    const brand = String(req.query.brand ?? '').trim().toLowerCase();
    const typeId = String(req.query.typeId ?? '').trim();

    const brands = (
      await pool.query(
        `SELECT slug, name FROM store_brands WHERE store_id = $1 AND active = true ORDER BY lower(name)`,
        [storeId],
      )
    ).rows.map((row: any) => ({ slug: row.slug, name: row.name }));

    const types = brand
      ? (
          await pool.query(
            `SELECT t.id, t.brand_slug, COALESCE(o.name, t.name) AS name FROM catalog_types t
               LEFT JOIN catalog_store_overrides o ON o.store_id = $1 AND o.ref_id = t.id
              WHERE t.active = true AND COALESCE(o.hidden, false) = false AND (t.store_id IS NULL OR t.store_id = $1) AND t.brand_slug = $2
              ORDER BY t.sort, 3`,
            [storeId, brand],
          )
        ).rows.map((row: any) => ({ id: row.id, brandSlug: row.brand_slug, name: row.name }))
      : [];

    const models = typeId
      ? (
          await pool.query(
            `SELECT m.id, m.type_id, COALESCE(o.name, m.name) AS name FROM catalog_models m
               JOIN catalog_types t ON t.id = m.type_id
               LEFT JOIN catalog_store_overrides o ON o.store_id = $1 AND o.ref_id = m.id
              WHERE m.active = true AND COALESCE(o.hidden, false) = false AND (m.store_id IS NULL OR m.store_id = $1)
                AND (t.store_id IS NULL OR t.store_id = $1) AND m.type_id = $2
              ORDER BY m.sort, 3`,
            [storeId, typeId],
          )
        ).rows.map((row: any) => ({ id: row.id, typeId: row.type_id, name: row.name }))
      : [];

    const attrs = (
      await pool.query(
        `SELECT a.id, a.name, v.value
           FROM product_attributes a
           JOIN product_attribute_values v ON v.attribute_id = a.id
          WHERE a.store_id = $1 AND a.active = true AND a.use_on_stock = true
          ORDER BY a.sort, a.name, v.sort, v.value`,
        [storeId],
      )
    ).rows;
    const colors: string[] = [];
    const capacities: string[] = [];
    for (const row of attrs) {
      const kind = attrKind(row.name);
      if (kind === 'color' && !colors.includes(row.value)) colors.push(row.value);
      if (kind === 'capacity' && !capacities.includes(row.value)) capacities.push(row.value);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { brands, types, models, colors, capacities } });
  } catch (error) {
    next(error);
  }
});

const publicSchema = z.object({
  requestKey: z.string().trim().min(8).max(80).optional(),
  productId: z.string().trim().max(80).nullable().optional(),
  productName: text(160),
  brand: text(60),
  catalogTypeId: z.string().trim().max(80).nullable().optional(),
  catalogModelId: z.string().trim().max(80).nullable().optional(),
  deviceType: text(80),
  deviceModel: text(80),
  color: text(60),
  capacity: text(40),
  condition: z.enum(['new', 'used']).optional().default('new'),
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
    const catalog = await resolveCatalog(req.params.token);
    const body = publicSchema.parse(req.body ?? {});
    if (body.website) throw httpError('Não foi possível enviar.', 400);
    const hasDevice = Boolean(body.brand.trim() && (body.deviceType.trim() || body.deviceModel.trim() || body.productName.trim()));
    if (!body.productId && !hasDevice && body.desiredOptions.trim().length < 5 && body.productName.trim().length < 3) {
      throw httpError('Escolha marca, tipo e modelo (ou descreva o produto desejado).');
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
    let deviceType = body.deviceType.trim();
    let deviceModel = body.deviceModel.trim();
    let catalogTypeId = body.catalogTypeId || null;
    let catalogModelId = body.catalogModelId || null;
    const color = body.color.trim();
    const capacity = body.capacity.trim();
    const condition = body.condition === 'used' ? 'used' : 'new';

    if (productId) {
      const allowed: string[] = Array.isArray(catalog.product_ids) ? catalog.product_ids : [];
      if (allowed.length && !allowed.includes(productId)) throw httpError('Este produto não está neste catálogo.', 409);
      const item = (await pool.query('SELECT id, name, brand, catalog_type_id, catalog_model_id FROM stock_items WHERE id = $1 AND store_id = $2', [productId, storeId])).rows[0];
      if (!item) throw httpError('Produto não encontrado.', 404);
      productName = productName || item.name;
      brand = brand || String(item.brand || '');
      catalogTypeId = catalogTypeId || item.catalog_type_id || null;
      catalogModelId = catalogModelId || item.catalog_model_id || null;
    }

    if (catalogTypeId) {
      const type = (
        await pool.query(`SELECT id, name FROM catalog_types WHERE id = $1 AND active = true AND (store_id IS NULL OR store_id = $2)`, [
          catalogTypeId,
          storeId,
        ])
      ).rows[0];
      if (!type) throw httpError('Tipo de aparelho inválido.');
      deviceType = deviceType || type.name;
    }
    if (catalogModelId) {
      const model = (
        await pool.query(`SELECT id, name FROM catalog_models WHERE id = $1 AND active = true AND (store_id IS NULL OR store_id = $2)`, [
          catalogModelId,
          storeId,
        ])
      ).rows[0];
      if (!model) throw httpError('Modelo inválido.');
      deviceModel = deviceModel || model.name;
    }

    if (!productName) {
      const brandName =
        (
          await pool.query(`SELECT name FROM store_brands WHERE store_id = $1 AND (slug = $2 OR lower(name) = lower($2)) LIMIT 1`, [
            storeId,
            brand,
          ])
        ).rows[0]?.name || brand;
      productName = [brandName, deviceType, deviceModel].filter(Boolean).join(' ').toUpperCase();
    }

    const variantParts = [capacity, color].filter(Boolean);
    const variantLabel = body.variantLabel.trim() || variantParts.join(' · ');
    const attributes = body.attributes.length
      ? body.attributes
      : [
          ...(color ? [{ id: 'color', name: 'Cor', value: color }] : []),
          ...(capacity ? [{ id: 'capacity', name: 'Capacidade', value: capacity }] : []),
        ];
    const desiredOptions =
      body.desiredOptions.trim() ||
      [deviceType && deviceModel ? `${deviceType} ${deviceModel}` : '', capacity, color].filter(Boolean).join(' · ');

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
               product_id, product_name, brand, catalog_type_id, catalog_model_id, device_type, device_model, color, capacity, condition,
               variant_label, attributes, qty, notes, desired_options, history
             ) VALUES (
               $1, $2, $3::int, $4, $5, $6, 'open', $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
               $21, $22::jsonb, $23::int, $24, $25, $26::jsonb
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
              catalogTypeId,
              catalogModelId,
              deviceType,
              deviceModel,
              color,
              capacity,
              condition,
              variantLabel,
              JSON.stringify(attributes),
              body.qty,
              body.notes,
              desiredOptions,
              JSON.stringify([{ at, by: body.customer.name, action: 'created', to: 'open', note: 'Solicitação enviada pelo Catálogo Digital' }]),
            ],
          )
        ).rows[0];
      } catch (error: any) {
        if (!/unique|duplicate/i.test(String(error?.message))) throw error;
      }
    }
    if (!saved) throw httpError('Não foi possível gerar o protocolo agora. Tente de novo.', 503);

    // Avisa a loja via Evolution; se WhatsApp não estiver configurado, a solicitação já foi salva.
    void notifySellerWhatsApp(storeId, customerPurchaseMessage(saved));

    res.status(201).json({ success: true, data: { id: saved.id, protocol: saved.protocol } });
  } catch (error) {
    next(error);
  }
});
