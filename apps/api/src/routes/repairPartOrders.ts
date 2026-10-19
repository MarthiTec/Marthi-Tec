import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { addWorkshopEntry, consumeStockPart } from './repairParts.js';

/**
 * Encomenda de peça para a OS e relatório das peças de manutenção.
 *  - Sem a peça no estoque da oficina, a loja encomenda ao fornecedor com prazo combinado; o aparelho
 *    fica na loja ou o cliente traz quando a peça chegar. A OS fica "Aguardando" até a peça chegar.
 *  - Quando chega: entrada no estoque da oficina e, se a encomenda é de uma OS, a peça já vai para ela.
 */
export const repairPartOrdersRouter = Router();
repairPartOrdersRouter.use('/api/v1/repair-part-orders', requireAuth);

type Db = { query: typeof pool.query };
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

export const partOrderSchema = z
  .object({
    stockId: z.string().trim().max(80).nullable().default(null),
    /** Peça ainda não cadastrada (ex.: "TELA MOTO G04 COM ARO"). */
    description: z.string().trim().max(200).default(''),
    qty: z.coerce.number().int().min(1).max(999).default(1),
    unitCost: z.coerce.number().min(0).max(1_000_000).nullable().default(null),
    supplierId: z.string().trim().max(80).nullable().default(null),
    supplierName: z.string().trim().max(120).default(''),
    expectedAt: day.nullable().default(null),
    /** true = aparelho fica na loja; false = o cliente traz quando a peça chegar. */
    deviceAtStore: z.boolean().default(true),
    notes: z.string().trim().max(300).default(''),
  })
  .refine((order) => order.stockId || order.description.length >= 2, 'Escolha a peça ou descreva o que vai ser encomendado.');
export type PartOrderInput = z.infer<typeof partOrderSchema>;

const viewOrder = (row: any) => ({
  id: row.id,
  workOrderId: row.work_order_id,
  stockId: row.stock_item_id,
  partName: row.part_name || row.description,
  description: row.description,
  qty: Number(row.qty) || 1,
  unitCost: row.unit_cost === null || row.unit_cost === undefined ? null : Number(row.unit_cost),
  supplierId: row.supplier_id,
  supplierName: row.supplier_name || '',
  expectedAt: row.expected_at ? String(row.expected_at instanceof Date ? row.expected_at.toISOString() : row.expected_at).slice(0, 10) : null,
  deviceAtStore: row.device_at_store !== false,
  status: row.status,
  late: row.status === 'ordered' && Boolean(row.is_late),
  notes: row.notes || '',
  customerName: row.customer_name || '',
  customerPhone: row.customer_phone || '',
  itemName: row.item_name || '',
  workOrderStatus: row.os_status || null,
  createdBy: row.created_by || '',
  createdAt: row.created_at,
  arrivedAt: row.arrived_at,
  arrivedBy: row.arrived_by || '',
});
const ORDER_SELECT = `SELECT o.*, s.name AS part_name, w.customer_name, w.customer_phone, w.item_name, w.status AS os_status,
       (o.expected_at IS NOT NULL AND o.expected_at < CURRENT_DATE) AS is_late
  FROM repair_part_orders o
  LEFT JOIN stock_items s ON s.id = o.stock_item_id AND s.store_id = o.store_id
  LEFT JOIN work_orders w ON w.id = o.work_order_id AND w.store_id = o.store_id`;

async function supplierNameOf(db: Db, storeId: string, supplierId: string | null, fallback: string) {
  if (!supplierId) return fallback;
  const row = (await db.query(`SELECT COALESCE(NULLIF(trade_name, ''), name) AS name FROM suppliers WHERE id = $1 AND store_id = $2`, [supplierId, storeId])).rows[0];
  if (!row) throw httpError('Fornecedor não encontrado nesta loja.');
  return row.name as string;
}

/** Grava as encomendas (usado também pela abertura da OS, na mesma transação). */
export async function createPartOrders(db: Db, input: { storeId: string; workOrderId: string | null; orders: PartOrderInput[]; operator: string }) {
  const ids: string[] = [];
  for (const order of input.orders) {
    if (order.stockId) {
      const found = (await db.query('SELECT id FROM stock_items WHERE id = $1 AND store_id = $2', [order.stockId, input.storeId])).rows[0];
      if (!found) throw httpError('Peça da encomenda não encontrada nesta loja.', 404);
    }
    const supplierName = await supplierNameOf(db, input.storeId, order.supplierId, order.supplierName);
    const id = `RPO-${randomUUID()}`;
    await db.query(
      `INSERT INTO repair_part_orders (id, store_id, work_order_id, stock_item_id, description, qty, unit_cost, supplier_id, supplier_name, expected_at, device_at_store, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::int, $7::numeric, $8, $9, $10::date, $11, $12, $13)`,
      [id, input.storeId, input.workOrderId, order.stockId, order.description, order.qty, order.unitCost, order.supplierId, supplierName, order.expectedAt, order.deviceAtStore, order.notes, input.operator],
    );
    ids.push(id);
  }
  return ids;
}

repairPartOrdersRouter.get('/api/v1/repair-part-orders', async (req, res, next) => {
  try {
    const args: unknown[] = [req.storeId];
    const where = ['o.store_id = $1'];
    const status = String(req.query.status ?? '');
    if (['ordered', 'arrived', 'cancelled'].includes(status)) {
      args.push(status);
      where.push(`o.status = $${args.length}`);
    }
    if (req.query.workOrderId) {
      args.push(String(req.query.workOrderId));
      where.push(`o.work_order_id = $${args.length}`);
    }
    const rows = (await pool.query(`${ORDER_SELECT} WHERE ${where.join(' AND ')} ORDER BY (o.status = 'ordered') DESC, o.expected_at ASC NULLS LAST, o.created_at DESC LIMIT 500`, args)).rows;
    res.json({ success: true, data: rows.map(viewOrder) });
  } catch (error) {
    next(error);
  }
});

const createSchema = z.object({ workOrderId: z.string().trim().max(80).nullable().default(null), order: partOrderSchema });

/** Nova encomenda (de uma OS já aberta ou avulsa, para repor o estoque da oficina). */
repairPartOrdersRouter.post('/api/v1/repair-part-orders', async (req, res, next) => {
  const client = await pool.connect();
  let open = false;
  try {
    const body = createSchema.parse(req.body ?? {});
    const storeId = req.storeId!;
    await client.query('BEGIN');
    open = true;
    if (body.workOrderId) {
      const os = (await client.query('SELECT id, status FROM work_orders WHERE id = $1 AND store_id = $2 FOR UPDATE', [body.workOrderId, storeId])).rows[0];
      if (!os) throw httpError('OS não encontrada nesta loja.', 404);
      if (['delivered', 'cancelled'].includes(os.status)) throw httpError('OS encerrada — não dá para encomendar peça para ela.', 409);
      await markWaiting(client, storeId, os.id, req.user?.name ?? '', body.order);
    }
    const [id] = await createPartOrders(client, { storeId, workOrderId: body.workOrderId, orders: [body.order], operator: req.user?.name ?? '' });
    await client.query('COMMIT');
    open = false;
    res.status(201).json({ success: true, data: viewOrder((await pool.query(`${ORDER_SELECT} WHERE o.id = $1 AND o.store_id = $2`, [id, storeId])).rows[0]) });
  } catch (error) {
    if (open) await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

/** OS passa para "Aguardando" (peça encomendada) com a anotação no histórico. */
export async function markWaiting(db: Db, storeId: string, osId: string, by: string, order: { description?: string; expectedAt: string | null }) {
  const when = order.expectedAt ? ` · previsão ${order.expectedAt.split('-').reverse().join('/')}` : '';
  await db.query(
    `UPDATE work_orders SET status = CASE WHEN status IN ('delivered', 'cancelled', 'ready') THEN status ELSE 'waiting' END,
            history = COALESCE(history, '[]'::jsonb) || $3::jsonb, updated_at = now()
      WHERE id = $1 AND store_id = $2`,
    [osId, storeId, JSON.stringify([{ at: new Date().toISOString(), by, action: 'part_ordered', note: `Peça encomendada${order.description ? `: ${order.description}` : ''}${when}` }])],
  );
}

const patchSchema = z.object({
  expectedAt: day.nullable().optional(),
  deviceAtStore: z.boolean().optional(),
  notes: z.string().trim().max(300).optional(),
  status: z.literal('cancelled').optional(),
});

repairPartOrdersRouter.patch('/api/v1/repair-part-orders/:id', async (req, res, next) => {
  try {
    const body = patchSchema.parse(req.body ?? {});
    const row = (
      await pool.query(
        `UPDATE repair_part_orders SET expected_at = CASE WHEN $3::boolean THEN $4::date ELSE expected_at END, device_at_store = COALESCE($5, device_at_store),
                notes = COALESCE($6, notes), status = COALESCE($7, status), updated_at = now()
          WHERE id = $1 AND store_id = $2 AND status = 'ordered' RETURNING id`,
        [req.params.id, req.storeId, body.expectedAt !== undefined, body.expectedAt ?? null, body.deviceAtStore ?? null, body.notes ?? null, body.status ?? null],
      )
    ).rows[0];
    if (!row) throw httpError('Encomenda não encontrada ou já recebida.', 404);
    res.json({ success: true, data: viewOrder((await pool.query(`${ORDER_SELECT} WHERE o.id = $1 AND o.store_id = $2`, [row.id, req.storeId])).rows[0]) });
  } catch (error) {
    next(error);
  }
});

const arriveSchema = z.object({
  unitCost: z.coerce.number().min(0).max(1_000_000),
  payment: z.enum(['paid', 'pending', 'none']).default('paid'),
  dueDate: day.optional().or(z.literal('')),
  /** Encomenda de uma OS: a peça já sai do estoque para ela (incluída no serviço). */
  useOnOrder: z.boolean().default(true),
});

/**
 * Peça chegou: entra no estoque da oficina (peça nova é cadastrada pela descrição) e, se for de uma
 * OS, já é usada nela; a OS que estava "Aguardando" volta para "Aberta".
 */
repairPartOrdersRouter.post('/api/v1/repair-part-orders/:id/arrive', async (req, res, next) => {
  const client = await pool.connect();
  let open = false;
  try {
    const body = arriveSchema.parse(req.body ?? {});
    const storeId = req.storeId!;
    const by = req.user?.name ?? '';
    await client.query('BEGIN');
    open = true;
    const order = (await client.query('SELECT * FROM repair_part_orders WHERE id = $1 AND store_id = $2 FOR UPDATE', [req.params.id, storeId])).rows[0];
    if (!order) throw httpError('Encomenda não encontrada nesta loja.', 404);
    if (order.status !== 'ordered') throw httpError(order.status === 'arrived' ? 'Esta encomenda já foi recebida.' : 'Encomenda cancelada.', 409);
    let partId: string | null = order.stock_item_id;
    if (!partId) {
      partId = `STK-${randomUUID()}`;
      await client.query(
        `INSERT INTO stock_items (id, store_id, name, sku, unit, qty, min_qty, cost, avg_cost, price, kind, condition, category, brand, active, show_on_totem, images, scope)
         VALUES ($1, $2, $3, $4, 'UN', 0, 0, $5::numeric, $5::numeric, 0, 'part', 'new', 'PEÇA', '', true, false, '[]'::jsonb, 'workshop')`,
        [partId, storeId, String(order.description).toUpperCase(), `PEC-${randomUUID().slice(0, 6).toUpperCase()}`, body.unitCost],
      );
    }
    const { entryId } = await addWorkshopEntry(client, {
      storeId,
      partId,
      qty: Number(order.qty),
      unitCost: body.unitCost,
      supplierId: order.supplier_id,
      entryDate: '',
      notes: order.work_order_id ? `Encomenda da OS ${order.work_order_id}` : 'Encomenda da oficina',
      payment: body.payment,
      dueDate: body.dueDate || '',
      operator: by,
    });
    let usedOn: string | null = null;
    if (order.work_order_id && body.useOnOrder) {
      const os = (await client.query('SELECT id, status, lines FROM work_orders WHERE id = $1 AND store_id = $2 FOR UPDATE', [order.work_order_id, storeId])).rows[0];
      if (os && !['delivered', 'cancelled'].includes(os.status)) {
        const line = await consumeStockPart(client, { stockId: partId, qty: Number(order.qty), unitPrice: 0, improvised: false, note: 'Peça encomendada', storeId, osId: os.id, operator: by });
        const lines = [...(Array.isArray(os.lines) ? os.lines : []), line];
        const parts = lines.filter((l: any) => l.kind === 'part').reduce((sum: number, l: any) => sum + (Number(l.unitPrice) || 0) * (Number(l.qty) || 0), 0);
        await client.query(
          `UPDATE work_orders SET lines = $3::jsonb, parts = $4::numeric, parts_cost = $4::numeric,
                  status = CASE WHEN status = 'waiting' THEN 'open' ELSE status END,
                  history = COALESCE(history, '[]'::jsonb) || $5::jsonb, updated_at = now()
            WHERE id = $1 AND store_id = $2`,
          [os.id, storeId, JSON.stringify(lines), parts, JSON.stringify([{ at: new Date().toISOString(), by, action: 'part_arrived', note: `Peça chegou e foi separada para a OS: ${line.name}` }])],
        );
        usedOn = os.id;
      }
    }
    await client.query(
      `UPDATE repair_part_orders SET status = 'arrived', stock_item_id = $3, unit_cost = $4::numeric, entry_id = $5, arrived_at = now(), arrived_by = $6, updated_at = now()
        WHERE id = $1 AND store_id = $2`,
      [order.id, storeId, partId, body.unitCost, entryId, by],
    );
    await client.query('COMMIT');
    open = false;
    const fresh = viewOrder((await pool.query(`${ORDER_SELECT} WHERE o.id = $1 AND o.store_id = $2`, [order.id, storeId])).rows[0]);
    res.json({ success: true, data: { order: fresh, usedOn } });
  } catch (error) {
    if (open) await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

/* ── Relatório de peças de manutenção ─────────────────────────────────────── */

/** Estoque (valor, no mínimo, sem estoque), consumo nas OS e compras do período, encomendas pendentes. */
repairPartOrdersRouter.get('/api/v1/repair-part-orders/report', async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const today = new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from)) ? String(req.query.from) : `${today.slice(0, 8)}01`;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to)) ? String(req.query.to) : today;
    const parts = (
      await pool.query(
        `SELECT id, name, sku, category, qty, min_qty, cost, price FROM stock_items
          WHERE store_id = $1 AND active = true
            AND (scope = 'workshop' OR EXISTS (
              SELECT 1 FROM repair_services r, jsonb_array_elements(CASE WHEN jsonb_typeof(r.options) = 'array' THEN r.options ELSE '[]'::jsonb END) o
               WHERE r.store_id = stock_items.store_id AND o->>'stockItemId' = stock_items.id))
          ORDER BY name`,
        [storeId],
      )
    ).rows.map((row: any) => ({ id: row.id, name: row.name, sku: row.sku || '', category: row.category || '', qty: Number(row.qty) || 0, minQty: Number(row.min_qty) || 0, cost: Number(row.cost) || 0, price: Number(row.price) || 0 }));
    const ids = parts.map((part) => part.id);
    const moves = ids.length
      ? (
          await pool.query(
            `SELECT stock_id, ref_type, COALESCE(SUM(qty), 0)::numeric AS qty, COALESCE(SUM(qty * unit_cost), 0)::numeric AS cost, COUNT(DISTINCT ref_id) AS refs
               FROM stock_movements
              WHERE store_id = $1 AND stock_id = ANY($2::text[]) AND ref_type IN ('work_order', 'work_order_reversal', 'supplier_entry')
                AND created_at >= $3::date AND created_at < ($4::date + 1)
              GROUP BY stock_id, ref_type`,
            [storeId, ids, from, to],
          )
        ).rows
      : [];
    const byPart = new Map(parts.map((part) => [part.id, part]));
    const usage = new Map<string, { qty: number; cost: number; orders: number }>();
    const entries = new Map<string, { qty: number; cost: number }>();
    for (const move of moves) {
      const qty = Number(move.qty) || 0;
      const cost = Number(move.cost) || 0;
      if (move.ref_type === 'supplier_entry') entries.set(move.stock_id, { qty, cost });
      else {
        const current = usage.get(move.stock_id) ?? { qty: 0, cost: 0, orders: 0 };
        const sign = move.ref_type === 'work_order' ? 1 : -1;
        usage.set(move.stock_id, { qty: current.qty + sign * qty, cost: current.cost + sign * cost, orders: current.orders + (sign > 0 ? Number(move.refs) || 0 : 0) });
      }
    }
    const named = <T,>(map: Map<string, T>) =>
      [...map.entries()].map(([id, value]) => ({ id, name: byPart.get(id)?.name ?? '', sku: byPart.get(id)?.sku ?? '', ...value })).filter((row: any) => row.qty > 0);
    const pendingOrders = (await pool.query(`${ORDER_SELECT} WHERE o.store_id = $1 AND o.status = 'ordered' ORDER BY o.expected_at ASC NULLS LAST`, [storeId])).rows.map(viewOrder);
    res.json({
      success: true,
      data: {
        from,
        to,
        stock: {
          parts: parts.length,
          units: parts.reduce((sum, part) => sum + Math.max(0, part.qty), 0),
          value: Math.round(parts.reduce((sum, part) => sum + Math.max(0, part.qty) * part.cost, 0) * 100) / 100,
          low: parts.filter((part) => part.qty <= part.minQty).map((part) => ({ ...part, missing: Math.max(part.minQty - part.qty, part.qty <= 0 ? 1 : 0) })),
        },
        usage: named(usage).sort((a: any, b: any) => b.qty - a.qty),
        entries: named(entries).sort((a: any, b: any) => b.cost - a.cost),
        orders: { pending: pendingOrders.length, late: pendingOrders.filter((order) => order.late).length, list: pendingOrders },
      },
    });
  } catch (error) {
    next(error);
  }
});
