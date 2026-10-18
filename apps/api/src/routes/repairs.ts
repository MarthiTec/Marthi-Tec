import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Orçamento de manutenção pelo catálogo digital.
 *  - Painel: catálogo de serviços por marca/modelo (com peças e qualidades) e a fila "Solicitações de
 *    orçamento" no módulo de OS (avaliação presencial, aprovação e conversão em OS).
 *  - Público (link do catálogo): o cliente escolhe aparelho e serviços e envia; acompanha pelo protocolo.
 * A solicitação nunca vira OS sozinha nem baixa estoque: a OS só nasce na aprovação, uma única vez.
 */
export const repairsRouter = Router();
repairsRouter.use('/api/v1/repair-services', requireAuth);
repairsRouter.use('/api/v1/repair-requests', requireAuth);

type Db = { query: typeof pool.query };
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const num = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value));
const digitsOf = (phone: string) => phone.replace(/\D/g, '').slice(-11);
const text = (max: number) => z.string().trim().max(max).default('');

export const REPAIR_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando análise',
  awaiting_device: 'Aguardando aparelho',
  evaluating: 'Em avaliação presencial',
  awaiting_approval: 'Aguardando aprovação',
  converted: 'Convertida em OS',
  cancelled: 'Cancelada',
};
/** Situação da OS como o cliente entende (acompanhamento pelo protocolo). */
const WORK_ORDER_LABEL: Record<string, string> = {
  open: 'Em análise na oficina',
  opened: 'Em análise na oficina',
  waiting: 'Aguardando peça',
  progress: 'Em manutenção',
  ready: 'Pronto para retirada',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
};

/* ── Catálogo de manutenções (painel) ───────────────────────────────────────── */

const optionSchema = z.object({
  id: z.string().trim().max(60).optional(),
  name: z.string().trim().min(1, 'Informe o nome da opção (ex.: Tela OLED).').max(80),
  price: z.number().min(0).max(1_000_000).nullable().default(null),
  /** Custo da peça/serviço para a loja (nunca vai para o cliente). */
  cost: z.number().min(0).max(1_000_000).nullable().default(null),
  stockItemId: z.string().trim().max(80).nullable().default(null),
  active: z.boolean().default(true),
});
const serviceSchema = z.object({
  /** Aparelho do cadastro de produtos (preenche marca e modelo). */
  productId: z.string().trim().max(80).nullable().default(null),
  brand: z.string().trim().min(1, 'Informe a marca.').max(60),
  model: z.string().trim().min(1, 'Informe o modelo.').max(80),
  category: text(40),
  name: z.string().trim().min(1, 'Informe o nome do serviço.').max(80),
  description: text(400),
  price: z.number().min(0).max(1_000_000).nullable().default(null),
  cost: z.number().min(0).max(1_000_000).nullable().default(null),
  estimatedMinutes: z.number().int().min(0).max(60 * 24 * 60).nullable().default(null),
  active: z.boolean().default(true),
  internalNotes: text(600),
  options: z.array(optionSchema).max(20).default([]),
  sort: z.number().int().min(0).max(9999).default(0),
});

const viewService = (row: any) => ({
  id: row.id,
  productId: row.product_id ?? null,
  brand: row.brand,
  model: row.model,
  category: row.category,
  name: row.name,
  description: row.description,
  price: num(row.price),
  cost: num(row.cost),
  estimatedMinutes: row.estimated_minutes === null || row.estimated_minutes === undefined ? null : Number(row.estimated_minutes),
  active: row.active !== false,
  internalNotes: row.internal_notes,
  options: Array.isArray(row.options) ? row.options : [],
  sort: Number(row.sort) || 0,
  updatedAt: row.updated_at,
});

/** O que o cliente vê: sem observação interna, sem vínculo de estoque e só opções ativas. */
const publicService = (row: any) => ({
  id: row.id,
  category: row.category,
  name: row.name,
  description: row.description,
  price: num(row.price),
  estimatedMinutes: row.estimated_minutes === null || row.estimated_minutes === undefined ? null : Number(row.estimated_minutes),
  options: (Array.isArray(row.options) ? row.options : [])
    .filter((option: any) => option.active !== false)
    .map((option: any) => ({ id: option.id, name: option.name, price: num(option.price) })),
});

/** O produto escolhido precisa ser desta loja. */
async function checkProduct(db: Db, storeId: string, productId: string | null) {
  if (!productId) return;
  const found = (await db.query('SELECT id FROM stock_items WHERE id = $1 AND store_id = $2', [productId, storeId])).rows[0];
  if (!found) throw httpError('O aparelho escolhido não é do cadastro desta loja.');
}

async function cleanOptions(db: Db, storeId: string, options: z.infer<typeof optionSchema>[]) {
  const out = [];
  for (const option of options) {
    if (option.stockItemId) {
      const found = (await db.query('SELECT id FROM stock_items WHERE id = $1 AND store_id = $2', [option.stockItemId, storeId])).rows[0];
      if (!found) throw httpError(`A peça vinculada à opção "${option.name}" não é do estoque desta loja.`);
    }
    out.push({ ...option, id: option.id || `OPT-${randomUUID().slice(0, 8)}` });
  }
  return out;
}

repairsRouter.get('/api/v1/repair-services', async (req, res, next) => {
  try {
    const productId = String(req.query.productId ?? '').trim();
    const rows = productId
      ? (await pool.query('SELECT * FROM repair_services WHERE store_id = $1 AND product_id = $2 ORDER BY sort, category, name', [req.storeId, productId])).rows
      : (await pool.query('SELECT * FROM repair_services WHERE store_id = $1 ORDER BY brand, model, sort, category, name', [req.storeId])).rows;
    res.json({ success: true, data: rows.map(viewService) });
  } catch (error) {
    next(error);
  }
});

repairsRouter.post('/api/v1/repair-services', async (req, res, next) => {
  try {
    const body = serviceSchema.parse(req.body ?? {});
    await checkProduct(pool, req.storeId!, body.productId);
    const options = await cleanOptions(pool, req.storeId!, body.options);
    const row = (
      await pool.query(
        `INSERT INTO repair_services (id, store_id, brand, model, category, name, description, price, estimated_minutes, active, internal_notes, options, sort, product_id, cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::numeric, $9::int, $10, $11, $12::jsonb, $13::int, $14, $15::numeric) RETURNING *`,
        [`RPS-${randomUUID()}`, req.storeId, body.brand, body.model, body.category, body.name, body.description, body.price, body.estimatedMinutes, body.active, body.internalNotes, JSON.stringify(options), body.sort, body.productId, body.cost],
      )
    ).rows[0];
    res.status(201).json({ success: true, data: viewService(row) });
  } catch (error) {
    next(error);
  }
});

repairsRouter.patch('/api/v1/repair-services/:id', async (req, res, next) => {
  try {
    const body = serviceSchema.parse(req.body ?? {});
    await checkProduct(pool, req.storeId!, body.productId);
    const options = await cleanOptions(pool, req.storeId!, body.options);
    const row = (
      await pool.query(
        `UPDATE repair_services SET brand = $3, model = $4, category = $5, name = $6, description = $7, price = $8::numeric, estimated_minutes = $9::int,
                active = $10, internal_notes = $11, options = $12::jsonb, sort = $13::int, product_id = $14, cost = $15::numeric, updated_at = now()
          WHERE id = $1 AND store_id = $2 RETURNING *`,
        [req.params.id, req.storeId, body.brand, body.model, body.category, body.name, body.description, body.price, body.estimatedMinutes, body.active, body.internalNotes, JSON.stringify(options), body.sort, body.productId, body.cost],
      )
    ).rows[0];
    if (!row) throw httpError('Serviço não encontrado nesta loja.', 404);
    res.json({ success: true, data: viewService(row) });
  } catch (error) {
    next(error);
  }
});

repairsRouter.delete('/api/v1/repair-services/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM repair_services WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
    if (!result.rowCount) throw httpError('Serviço não encontrado nesta loja.', 404);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── Solicitações de orçamento (fila do módulo de OS) ───────────────────────── */

const viewRequest = (row: any) => ({
  id: row.id,
  protocol: row.protocol,
  status: row.status,
  statusLabel: REPAIR_STATUS_LABEL[row.status] ?? row.status,
  origin: row.catalog_id ? 'Catálogo Digital' : 'Painel',
  catalogId: row.catalog_id,
  customerId: row.customer_id,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  brand: row.brand,
  model: row.model,
  items: Array.isArray(row.items) ? row.items : [],
  estimatedTotal: Number(row.estimated_total) || 0,
  hasEvaluation: row.has_evaluation === true,
  description: row.description,
  evaluation: row.evaluation && typeof row.evaluation === 'object' ? row.evaluation : {},
  history: Array.isArray(row.history) ? row.history : [],
  workOrderId: row.work_order_id,
  convertedAt: row.converted_at,
  convertedBy: row.converted_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

repairsRouter.get('/api/v1/repair-requests', async (req, res, next) => {
  try {
    const statuses = String(req.query.status ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value in REPAIR_STATUS_LABEL);
    const q = String(req.query.q ?? '').trim().slice(0, 80);
    const args: unknown[] = [req.storeId];
    let where = 'store_id = $1';
    if (statuses.length) {
      args.push(statuses);
      where += ` AND status = ANY($${args.length}::text[])`;
    }
    if (q) {
      args.push(`%${q.toLowerCase()}%`);
      const like = `$${args.length}`;
      const digits = q.replace(/\D/g, '');
      if (digits.length >= 4) {
        args.push(`%${digits}%`);
        where += ` AND (lower(protocol) LIKE ${like} OR lower(customer_name) LIKE ${like} OR lower(brand || ' ' || model) LIKE ${like} OR phone_digits LIKE $${args.length})`;
      } else {
        where += ` AND (lower(protocol) LIKE ${like} OR lower(customer_name) LIKE ${like} OR lower(brand || ' ' || model) LIKE ${like})`;
      }
    }
    const rows = (await pool.query(`SELECT * FROM repair_requests WHERE ${where} ORDER BY created_at DESC LIMIT 300`, args)).rows;
    res.json({ success: true, data: rows.map(viewRequest) });
  } catch (error) {
    next(error);
  }
});

/** Contagem por situação (indicador de novas solicitações no módulo de OS). */
repairsRouter.get('/api/v1/repair-requests/summary', async (req, res, next) => {
  try {
    const rows = (await pool.query('SELECT status, count(*)::int AS n FROM repair_requests WHERE store_id = $1 GROUP BY status', [req.storeId])).rows;
    const counts = Object.fromEntries(Object.keys(REPAIR_STATUS_LABEL).map((status) => [status, 0]));
    for (const row of rows) counts[row.status] = Number(row.n);
    res.json({ success: true, data: { counts, pending: counts.pending } });
  } catch (error) {
    next(error);
  }
});

repairsRouter.get('/api/v1/repair-requests/:id', async (req, res, next) => {
  try {
    const row = (await pool.query('SELECT * FROM repair_requests WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId])).rows[0];
    if (!row) throw httpError('Solicitação não encontrada nesta loja.', 404);
    res.json({ success: true, data: viewRequest(row) });
  } catch (error) {
    next(error);
  }
});

const finalItemSchema = z.object({
  serviceId: z.string().trim().max(80).nullable().default(null),
  name: z.string().trim().min(1).max(120),
  optionName: z.string().trim().max(80).default(''),
  stockItemId: z.string().trim().max(80).nullable().default(null),
  price: z.number().min(0).max(1_000_000).nullable().default(null),
  cost: z.number().min(0).max(1_000_000).nullable().default(null),
});
const evaluationSchema = z.object({
  customer: z
    .object({ name: text(120), phone: text(30), document: text(20), address: text(200) })
    .partial()
    .default({}),
  device: z
    .object({ color: text(40), capacity: text(20), imei: text(40), physicalState: text(200), screen: text(200), body: text(200), accessories: text(200), techNotes: text(600) })
    .partial()
    .default({}),
  diagnosis: z.object({ reported: text(1000), found: text(1000), risks: text(600) }).partial().default({}),
  items: z.array(finalItemSchema).max(20).optional(),
  finalTotal: z.number().min(0).max(1_000_000).nullable().optional(),
  /** Previsão de conclusão (data/hora local, ex.: 2026-10-18T17:00). */
  eta: z.string().trim().max(40).optional(),
});
const patchSchema = z.object({
  status: z.enum(['pending', 'awaiting_device', 'evaluating', 'awaiting_approval', 'cancelled']).optional(),
  note: text(400),
  evaluation: evaluationSchema.optional(),
});

repairsRouter.patch('/api/v1/repair-requests/:id', async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body ?? {});
    const row = (await pool.query('SELECT * FROM repair_requests WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId])).rows[0];
    if (!row) throw httpError('Solicitação não encontrada nesta loja.', 404);
    if (row.status === 'converted') throw httpError('Esta solicitação já virou OS. Altere pela própria OS.', 409);
    if (row.status === 'cancelled' && body.status !== 'pending') throw httpError('Solicitação cancelada. Reabra para alterar.', 409);

    const by = req.user?.name ?? '';
    const at = new Date().toISOString();
    const history = Array.isArray(row.history) ? [...row.history] : [];
    let evaluation = row.evaluation && typeof row.evaluation === 'object' ? { ...row.evaluation } : {};
    if (body.evaluation) {
      const next = body.evaluation;
      const etaHistory = Array.isArray(evaluation.etaHistory) ? [...evaluation.etaHistory] : [];
      // Previsão de conclusão: cada mudança fica registrada (quem, quando, de/para).
      if (next.eta !== undefined && next.eta !== (evaluation.eta ?? '')) {
        etaHistory.push({ at, by, from: evaluation.eta ?? '', to: next.eta });
        history.push({ at, by, action: 'eta', note: next.eta ? `Previsão: ${next.eta}` : 'Previsão removida' });
      }
      evaluation = {
        ...evaluation,
        customer: { ...(evaluation.customer ?? {}), ...next.customer },
        device: { ...(evaluation.device ?? {}), ...next.device },
        diagnosis: { ...(evaluation.diagnosis ?? {}), ...next.diagnosis },
        ...(next.items ? { items: next.items } : {}),
        ...(next.finalTotal !== undefined ? { finalTotal: next.finalTotal } : {}),
        ...(next.eta !== undefined ? { eta: next.eta } : {}),
        etaHistory,
        updatedAt: at,
        updatedBy: by,
      };
      history.push({ at, by, action: 'evaluation', note: 'Avaliação atualizada' });
    }
    let status = row.status;
    if (body.status && body.status !== row.status) {
      history.push({ at, by, action: 'status', from: row.status, to: body.status, note: body.note || REPAIR_STATUS_LABEL[body.status] });
      status = body.status;
    } else if (body.note) {
      history.push({ at, by, action: 'note', note: body.note });
    }
    const updated = (
      await pool.query(
        'UPDATE repair_requests SET status = $3, evaluation = $4::jsonb, history = $5::jsonb, updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *',
        [row.id, req.storeId, status, JSON.stringify(evaluation), JSON.stringify(history)],
      )
    ).rows[0];
    res.json({ success: true, data: viewRequest(updated) });
  } catch (error) {
    next(error);
  }
});

const APPROVAL_LABEL: Record<string, string> = { presencial: 'Presencial', whatsapp: 'WhatsApp', ligacao: 'Ligação', assinatura: 'Assinatura' };
const convertSchema = z.object({
  approvalMethod: z.enum(['presencial', 'whatsapp', 'ligacao', 'assinatura']),
  approvalNote: text(400),
});

/** Aprovar e abrir a OS: cria a OS real (work_orders) com tudo da solicitação, uma única vez. */
repairsRouter.post('/api/v1/repair-requests/:id/convert', async (req, res, next) => {
  const client = await pool.connect();
  let open = false;
  try {
    const body = convertSchema.parse(req.body ?? {});
    await client.query('BEGIN');
    open = true;
    const row = (await client.query('SELECT * FROM repair_requests WHERE id = $1 AND store_id = $2 FOR UPDATE', [req.params.id, req.storeId])).rows[0];
    if (!row) throw httpError('Solicitação não encontrada nesta loja.', 404);
    if (row.work_order_id) throw Object.assign(httpError('Esta solicitação já virou a OS ' + row.work_order_id + '.', 409), { workOrderId: row.work_order_id });
    if (row.status === 'cancelled') throw httpError('Solicitação cancelada. Reabra antes de abrir a OS.', 409);

    const evaluation = row.evaluation && typeof row.evaluation === 'object' ? row.evaluation : {};
    const items: any[] = Array.isArray(evaluation.items) && evaluation.items.length ? evaluation.items : Array.isArray(row.items) ? row.items : [];
    if (!items.length && !String(evaluation.diagnosis?.found ?? '').trim()) throw httpError('Confirme na avaliação os serviços (ou o diagnóstico) antes de abrir a OS.');
    const priced = items.filter((item) => item.price !== null && item.price !== undefined);
    const finalTotal = evaluation.finalTotal !== null && evaluation.finalTotal !== undefined ? Number(evaluation.finalTotal) : priced.reduce((sum, item) => sum + Number(item.price), 0);
    if (!(finalTotal >= 0)) throw httpError('Informe o valor final na avaliação.');

    const customer = evaluation.customer ?? {};
    const device = evaluation.device ?? {};
    const diagnosis = evaluation.diagnosis ?? {};
    const name = String(customer.name || row.customer_name).trim();
    const phone = String(customer.phone || row.customer_phone).trim();
    let customerId = row.customer_id;
    if (!customerId) {
      customerId = (await client.query('SELECT id FROM customers WHERE store_id = $1 AND phone_digits = $2 LIMIT 1', [req.storeId, digitsOf(phone)])).rows[0]?.id ?? null;
    }
    const serviceList = items.map((item) => `${item.name}${item.optionName ? ` (${item.optionName})` : ''}${item.price !== null && item.price !== undefined ? ` — R$ ${Number(item.price).toFixed(2).replace('.', ',')}` : ' — sob avaliação'}`);
    const condition = [
      device.capacity ? `Capacidade: ${device.capacity}` : '',
      device.physicalState ? `Estado físico: ${device.physicalState}` : '',
      device.screen ? `Tela: ${device.screen}` : '',
      device.body ? `Carcaça: ${device.body}` : '',
    ].filter(Boolean).join(' · ');
    const by = req.user?.name ?? '';
    const at = new Date().toISOString();
    const approval = `Aprovado pelo cliente (${APPROVAL_LABEL[body.approvalMethod]}) em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} por ${by || 'equipe'}${body.approvalNote ? ` — ${body.approvalNote}` : ''}.`;
    const notes = [`Origem: Catálogo Digital — protocolo ${row.protocol}.`, `Serviços aprovados: ${serviceList.join('; ') || '—'}.`, approval, customer.address ? `Endereço: ${customer.address}` : ''].filter(Boolean).join('\n');
    const techNotes = [device.techNotes, diagnosis.risks ? `Riscos/condições: ${diagnosis.risks}` : ''].filter(Boolean).join('\n');
    const osId = `OS-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
    const osHistory = [{ at, by, action: 'created', note: `OS aberta a partir da solicitação ${row.protocol} (Catálogo Digital). ${approval}` }];

    await client.query(
      `INSERT INTO work_orders (
        id, store_id, customer_id, customer_name, customer_phone, customer_document, customer_email,
        item_name, item_brand, item_model, item_color, item_ref, device_password,
        accessories, condition_on_entry, defect, defect_description, diagnosis, technical_report,
        notes, tech_notes, estimated_ready_at, technician, seller_id, priority, status,
        labor, labor_cost, parts, parts_cost, total_amount, operation_id,
        quote_status, quote_notes, quote_decided_at,
        checklist, photos, lines, comments, history, worklogs, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, '',
        $7, $8, $9, $10, $11, '',
        $12, $13, $14, $14, $15, $15,
        $16, $17, $18, '', '', 'normal', 'open',
        $19::numeric, $19::numeric, 0, 0, $19::numeric, '',
        'approved', $20, now(),
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, $21::jsonb, '[]'::jsonb, now(), now()
      )`,
      [
        osId,
        req.storeId,
        customerId,
        name,
        phone,
        String(customer.document ?? ''),
        `${row.brand} ${row.model}`.trim(),
        row.brand,
        row.model,
        String(device.color ?? ''),
        String(device.imei ?? ''),
        String(device.accessories ?? ''),
        condition,
        String(diagnosis.reported || row.description || serviceList.join('; ')).slice(0, 2000),
        String(diagnosis.found ?? ''),
        notes,
        techNotes,
        String(evaluation.eta ?? ''),
        finalTotal,
        serviceList.join('\n'),
        JSON.stringify(osHistory),
      ],
    );
    const history = [...(Array.isArray(row.history) ? row.history : []), { at, by, action: 'converted', from: row.status, to: 'converted', note: `${approval} OS ${osId}.` }];
    const updated = (
      await client.query(
        `UPDATE repair_requests SET status = 'converted', work_order_id = $3, converted_at = now(), converted_by = $4, customer_id = COALESCE(customer_id, $5),
                evaluation = $6::jsonb, history = $7::jsonb, updated_at = now()
          WHERE id = $1 AND store_id = $2 RETURNING *`,
        [row.id, req.storeId, osId, by, customerId, JSON.stringify({ ...evaluation, approval: { method: body.approvalMethod, note: body.approvalNote, at, by } }), JSON.stringify(history)],
      )
    ).rows[0];
    await client.query('COMMIT');
    open = false;
    res.status(201).json({ success: true, data: { request: viewRequest(updated), workOrderId: osId } });
  } catch (error) {
    if (open) await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

/* ── Público: link do catálogo ──────────────────────────────────────────────── */

/** Item da solicitação como o cliente pode ver (sem custo e sem vínculo de estoque). */
const publicItem = (item: any) => ({ serviceId: item.serviceId, name: item.name, optionName: item.optionName ?? '', price: item.price ?? null, estimatedMinutes: item.estimatedMinutes ?? null });

async function catalogByToken(token: string) {
  const row = (await pool.query('SELECT id, store_id, show_repairs FROM sales_catalogs WHERE token = $1', [String(token).slice(0, 64)])).rows[0];
  if (!row || row.show_repairs === false) throw httpError('Manutenção indisponível neste link.', 404);
  return row as { id: string; store_id: string };
}

// Limite por aparelho/IP: no máximo 6 envios a cada 10 minutos por catálogo (e 30 consultas de protocolo).
const recent = new Map<string, number[]>();
function rateLimit(key: string, max: number) {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((at) => now - at < 10 * 60_000);
  if (list.length >= max) throw httpError('Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.', 429);
  list.push(now);
  recent.set(key, list);
}

/** Marcas e modelos com serviço ativo (para o cliente escolher o aparelho). */
repairsRouter.get('/api/v1/public/sales-catalogs/:token/repairs', async (req, res, next) => {
  try {
    const catalog = await catalogByToken(req.params.token);
    const rows = (await pool.query('SELECT DISTINCT brand, model FROM repair_services WHERE store_id = $1 AND active = true ORDER BY brand, model', [catalog.store_id])).rows;
    const brands = new Map<string, string[]>();
    for (const row of rows) brands.set(row.brand, [...(brands.get(row.brand) ?? []), row.model]);
    res.setHeader('Cache-Control', 'no-store');
    // Ordem natural dos números (IPHONE 7 antes de IPHONE 13; A05 antes de A10).
    const natural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
    res.json({ success: true, data: { brands: [...brands].sort((a, b) => natural.compare(a[0], b[0])).map(([brand, models]) => ({ brand, models: [...models].sort(natural.compare) })) } });
  } catch (error) {
    next(error);
  }
});

repairsRouter.get('/api/v1/public/sales-catalogs/:token/repairs/services', async (req, res, next) => {
  try {
    const catalog = await catalogByToken(req.params.token);
    const brand = String(req.query.brand ?? '').trim().slice(0, 60);
    const model = String(req.query.model ?? '').trim().slice(0, 80);
    const rows = (await pool.query('SELECT * FROM repair_services WHERE store_id = $1 AND brand = $2 AND model = $3 AND active = true ORDER BY sort, category, name', [catalog.store_id, brand, model])).rows;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: rows.map(publicService) });
  } catch (error) {
    next(error);
  }
});

const requestSchema = z.object({
  requestKey: z.string().trim().min(8).max(80).optional(),
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  items: z.array(z.object({ serviceId: z.string().trim().min(1).max(80), optionId: z.string().trim().max(60).nullish() })).max(10).default([]),
  description: text(1000),
  customer: z.object({
    name: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
    phone: z.string().trim().max(30).refine((value) => value.replace(/\D/g, '').length >= 10, 'Informe o WhatsApp com DDD.'),
  }),
  /** Campo escondido: robô preenche, gente não. */
  website: z.string().max(200).optional(),
});

repairsRouter.post('/api/v1/public/sales-catalogs/:token/repairs', async (req, res, next) => {
  try {
    const catalog = await catalogByToken(req.params.token);
    const body = requestSchema.parse(req.body ?? {});
    if (body.website) throw httpError('Não foi possível enviar.', 400);
    if (!body.items.length && body.description.length < 10) throw httpError('Escolha um serviço ou conte o que está acontecendo com o aparelho.');
    const storeId = catalog.store_id;

    if (body.requestKey) {
      const again = (await pool.query('SELECT * FROM repair_requests WHERE store_id = $1 AND request_key = $2', [storeId, body.requestKey])).rows[0];
      if (again) {
        res.status(200).json({ success: true, data: { protocol: again.protocol, estimatedTotal: Number(again.estimated_total), hasEvaluation: again.has_evaluation, items: (Array.isArray(again.items) ? again.items : []).map(publicItem) } });
        return;
      }
    }
    rateLimit(`repair:${catalog.id}:${req.ip}`, 6);

    // Serviços e preços sempre do cadastro (nunca do que veio do navegador).
    const ids = [...new Set(body.items.map((item) => item.serviceId))];
    const services = ids.length
      ? (await pool.query('SELECT * FROM repair_services WHERE store_id = $1 AND id = ANY($2::text[]) AND active = true', [storeId, ids])).rows
      : [];
    const byId = new Map(services.map((row: any) => [row.id, row]));
    const items = body.items.map((wanted) => {
      const service = byId.get(wanted.serviceId);
      if (!service || service.brand !== body.brand || service.model !== body.model) throw httpError('Um dos serviços escolhidos não está mais disponível para este aparelho. Atualize a página.');
      const options = (Array.isArray(service.options) ? service.options : []).filter((option: any) => option.active !== false);
      let option: any = null;
      if (options.length) {
        option = options.find((entry: any) => entry.id === wanted.optionId);
        if (!option) throw httpError(`Escolha a opção de "${service.name}".`);
      }
      const price = option ? num(option.price) : num(service.price);
      const cost = option ? num(option.cost) : num(service.cost);
      return { serviceId: service.id, name: service.name, category: service.category, optionId: option?.id ?? null, optionName: option?.name ?? '', stockItemId: option?.stockItemId ?? null, price, cost, estimatedMinutes: service.estimated_minutes === null ? null : Number(service.estimated_minutes) };
    });
    const hasEvaluation = items.some((item) => item.price === null) || !items.length;
    const estimatedTotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
    const phoneDigits = digitsOf(body.customer.phone);
    // Cliente já cadastrado (pelo WhatsApp): só liga a solicitação; nada do cadastro volta para o navegador.
    const customerId = (await pool.query('SELECT id FROM customers WHERE store_id = $1 AND phone_digits = $2 LIMIT 1', [storeId, phoneDigits])).rows[0]?.id ?? null;
    const at = new Date().toISOString();

    let saved: any = null;
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const seq = Number((await pool.query('SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM repair_requests WHERE store_id = $1', [storeId])).rows[0].next) + attempt;
      const protocol = `MNT-${String(seq).padStart(5, '0')}`;
      try {
        saved = (
          await pool.query(
            `INSERT INTO repair_requests (id, store_id, seq, protocol, catalog_id, request_key, status, customer_id, customer_name, customer_phone, phone_digits, brand, model, items, estimated_total, has_evaluation, description, history)
             VALUES ($1, $2, $3::int, $4, $5, $6, 'pending', $7, $8, $9, $10, $11, $12, $13::jsonb, $14::numeric, $15, $16, $17::jsonb) RETURNING *`,
            [
              `RPR-${randomUUID()}`,
              storeId,
              seq,
              protocol,
              catalog.id,
              body.requestKey ?? null,
              customerId,
              body.customer.name,
              body.customer.phone,
              phoneDigits,
              body.brand,
              body.model,
              JSON.stringify(items),
              estimatedTotal,
              hasEvaluation,
              body.description,
              JSON.stringify([{ at, by: body.customer.name, action: 'created', to: 'pending', note: 'Solicitação enviada pelo Catálogo Digital' }]),
            ],
          )
        ).rows[0];
      } catch (error: any) {
        if (!/unique|duplicate/i.test(String(error?.message))) throw error;
      }
    }
    if (!saved) throw httpError('Não foi possível gerar o protocolo agora. Tente de novo.', 503);
    res.status(201).json({ success: true, data: { protocol: saved.protocol, estimatedTotal, hasEvaluation, items: items.map(publicItem) } });
  } catch (error) {
    next(error);
  }
});

/** Acompanhamento pelo protocolo + WhatsApp (sem expor nada além da situação). */
repairsRouter.get('/api/v1/public/sales-catalogs/:token/repairs/track', async (req, res, next) => {
  try {
    const catalog = await catalogByToken(req.params.token);
    rateLimit(`track:${catalog.id}:${req.ip}`, 30);
    const protocol = String(req.query.protocol ?? '').trim().toUpperCase().slice(0, 20);
    const phone = digitsOf(String(req.query.phone ?? ''));
    if (!protocol || phone.length < 10) throw httpError('Informe o protocolo e o WhatsApp usado na solicitação.');
    const row = (await pool.query('SELECT * FROM repair_requests WHERE store_id = $1 AND protocol = $2 AND phone_digits = $3', [catalog.store_id, protocol, phone])).rows[0];
    if (!row) throw httpError('Não encontramos uma solicitação com esse protocolo e WhatsApp.', 404);
    let workOrder: { status: string; statusLabel: string; estimatedReadyAt: string } | null = null;
    if (row.work_order_id) {
      const os = (await pool.query('SELECT status, estimated_ready_at FROM work_orders WHERE id = $1 AND store_id = $2', [row.work_order_id, catalog.store_id])).rows[0];
      if (os) workOrder = { status: os.status, statusLabel: WORK_ORDER_LABEL[os.status] ?? 'Em andamento', estimatedReadyAt: os.estimated_ready_at || '' };
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        protocol: row.protocol,
        status: row.status,
        statusLabel: REPAIR_STATUS_LABEL[row.status] ?? row.status,
        device: `${row.brand} ${row.model}`,
        items: (Array.isArray(row.items) ? row.items : []).map((item: any) => `${item.name}${item.optionName ? ` (${item.optionName})` : ''}`),
        createdAt: row.created_at,
        workOrder,
      },
    });
  } catch (error) {
    next(error);
  }
});
