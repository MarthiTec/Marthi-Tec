import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

export const workOrdersRouter = Router();
workOrdersRouter.use('/api/v1/work-orders', requireAuth);

/* ── Helpers ───────────────────────────────────────────── */

export type WorkOrderRow = {
  id: string;
  store_id: string;
  customer_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_document: string;
  customer_email: string;
  item_name: string;
  item_brand: string;
  item_model: string;
  item_color: string;
  item_ref: string;
  device_password: string;
  accessories: string;
  condition_on_entry: string;
  defect: string;
  diagnosis: string;
  notes: string;
  tech_notes?: string;
  estimated_ready_at: string;
  technician: string;
  seller_id: string;
  priority: string;
  status: string;
  labor: number | string;
  parts: number | string;
  operation_id?: string;
  asset_disposition: string;
  quote_status: string;
  quote_notes: string;
  quote_valid_until: string;
  quote_sent_at?: string | null;
  quote_decided_at?: string | null;
  purchase_cost?: number | string | null;
  purchase_at?: string | null;
  purchase_stock_id?: string | null;
  purchase_finance_id?: string | null;
  revenue_finance_id?: string | null;
  progress_started_at?: string | null;
  delivered_at?: string | null;
  customer_signature: string;
  customer_signed_at?: string | null;
  customer_signed_name: string;
  payment_status: string;
  spent_minutes: number;
  checklist: any;
  photos: any;
  comments: any;
  attachments: any;
  history: any;
  worklogs: any;
  lines: any;
  created_at: string;
  updated_at: string;
};

function safeJson(val: any, fallback: any = []) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function rowToWorkOrder(row: any) {
  const lines = safeJson(row.lines, []);
  const photos = safeJson(row.photos, []);
  const checklist = safeJson(row.checklist, []);
  const comments = safeJson(row.comments, []);
  const attachments = safeJson(row.attachments, []);
  const history = safeJson(row.history, []);
  const worklogs = safeJson(row.worklogs, []);

  const labor = Number(row.labor ?? row.labor_cost) || 0;
  const parts = Number(row.parts ?? row.parts_cost) || 0;

  return {
    id: row.id,
    operationId: row.operation_id || undefined,
    customerName: row.customer_name || '',
    customerPhone: row.customer_phone || '',
    customerDocument: row.customer_document || '',
    customerEmail: row.customer_email || '',
    itemName: row.item_name || row.device_model || '',
    itemBrand: row.item_brand || row.device_brand || '',
    itemModel: row.item_model || row.device_model || '',
    itemColor: row.item_color || '',
    itemRef: row.item_ref || row.serial_or_imei || '',
    devicePassword: row.device_password || '',
    accessories: row.accessories || '',
    conditionOnEntry: row.condition_on_entry || '',
    defect: row.defect || row.defect_description || '',
    diagnosis: row.diagnosis || row.technical_report || '',
    notes: row.notes || '',
    techNotes: row.tech_notes || '',
    estimatedReadyAt: row.estimated_ready_at || '',
    technician: row.technician || '',
    sellerId: row.seller_id || '',
    priority: row.priority || 'normal',
    status: row.status || 'open',
    labor,
    parts,
    lines,
    photos,
    comments,
    attachments,
    history,
    worklogs,
    spentMinutes: Number(row.spent_minutes) || 0,
    checklist,
    customerSignature: row.customer_signature || '',
    customerSignedAt: row.customer_signed_at ? new Date(row.customer_signed_at).toISOString() : undefined,
    customerSignedName: row.customer_signed_name || '',
    assetDisposition: row.asset_disposition || 'customer',
    quoteStatus: row.quote_status || 'none',
    quoteNotes: row.quote_notes || '',
    quoteValidUntil: row.quote_valid_until || '',
    quoteSentAt: row.quote_sent_at ? new Date(row.quote_sent_at).toISOString() : undefined,
    quoteDecidedAt: row.quote_decided_at ? new Date(row.quote_decided_at).toISOString() : undefined,
    purchaseCost: row.purchase_cost != null ? Number(row.purchase_cost) : undefined,
    purchaseAt: row.purchase_at ? new Date(row.purchase_at).toISOString() : undefined,
    purchaseStockId: row.purchase_stock_id || undefined,
    purchaseFinanceId: row.purchase_finance_id || undefined,
    revenueFinanceId: row.revenue_finance_id || undefined,
    progressStartedAt: row.progress_started_at ? new Date(row.progress_started_at).toISOString() : undefined,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : undefined,
    paymentStatus: row.payment_status || 'pending',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

/* ── Schemas ───────────────────────────────────────────── */

const createWorkOrderSchema = z.object({
  customerName: z.string().min(1, 'Nome do cliente é obrigatório.'),
  customerPhone: z.string().default(''),
  customerDocument: z.string().default(''),
  customerEmail: z.string().default(''),
  itemName: z.string().min(1, 'Aparelho / Equipamento é obrigatório.'),
  itemBrand: z.string().default(''),
  itemModel: z.string().default(''),
  itemColor: z.string().default(''),
  itemRef: z.string().default(''),
  devicePassword: z.string().default(''),
  accessories: z.string().default(''),
  conditionOnEntry: z.string().default(''),
  defect: z.string().min(1, 'Defeito relatado é obrigatório.'),
  diagnosis: z.string().default(''),
  notes: z.string().default(''),
  techNotes: z.string().optional().default(''),
  estimatedReadyAt: z.string().default(''),
  technician: z.string().default(''),
  sellerId: z.string().default(''),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  labor: z.coerce.number().default(0),
  parts: z.coerce.number().default(0),
  operationId: z.string().optional(),
});

/* ── Rotas ─────────────────────────────────────────────── */

// 1. Listar Ordens de Serviço
workOrdersRouter.get('/api/v1/work-orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.json({ success: true, data: [] });
    const storeId = req.storeId!;
    const { status, technician, q } = req.query;

    const conditions: string[] = ['store_id = $1'];
    const values: any[] = [storeId];
    let pIdx = 2;

    if (status && typeof status === 'string') {
      conditions.push(`status = $${pIdx++}`);
      values.push(status);
    }
    if (technician && typeof technician === 'string' && technician.trim()) {
      conditions.push(`technician ILIKE $${pIdx++}`);
      values.push(`%${technician.trim()}%`);
    }
    if (q && typeof q === 'string' && q.trim()) {
      conditions.push(`(
        id ILIKE $${pIdx} OR
        customer_name ILIKE $${pIdx} OR
        customer_phone ILIKE $${pIdx} OR
        customer_document ILIKE $${pIdx} OR
        item_name ILIKE $${pIdx} OR
        item_ref ILIKE $${pIdx} OR
        technician ILIKE $${pIdx}
      )`);
      values.push(`%${q.trim()}%`);
      pIdx++;
    }

    const query = `SELECT * FROM work_orders WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 300`;
    const result = await pool.query(query, values);
    res.json({ success: true, data: result.rows.map(rowToWorkOrder) });
  } catch (error) {
    next(error);
  }
});

// 2. Obter OS por ID
workOrdersRouter.get('/api/v1/work-orders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    const storeId = req.storeId!;
    const result = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [req.params.id, storeId]);
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    }
    res.json({ success: true, data: rowToWorkOrder(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 3. Criar Ordem de Serviço
workOrdersRouter.post('/api/v1/work-orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) {
      return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' } });
    }
    const storeId = req.storeId!;
    const body = createWorkOrderSchema.parse(req.body);

    const osId = `OS-${Date.now().toString().slice(-6)}${Math.floor(10 + Math.random() * 90)}`;
    const now = new Date().toISOString();

    const insertSql = `
      INSERT INTO work_orders (
        id, store_id, customer_name, customer_phone, customer_document, customer_email,
        item_name, item_brand, item_model, item_color, item_ref, device_password,
        accessories, condition_on_entry, defect, defect_description, diagnosis, technical_report,
        notes, tech_notes, estimated_ready_at, technician, seller_id, priority, status,
        labor, labor_cost, parts, parts_cost, total_amount, operation_id,
        checklist, photos, lines, comments, history, worklogs,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $15, $16, $16,
        $17, $18, $19, $20, $21, $22, 'open',
        $23, $23, $24, $24, $25, $26,
        '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
        $27, $27
      )
      RETURNING *
    `;

    const totalAmount = (body.labor || 0) + (body.parts || 0);

    const values = [
      osId,
      storeId,
      body.customerName.trim(),
      body.customerPhone.trim(),
      body.customerDocument.trim(),
      body.customerEmail.trim(),
      body.itemName.trim(),
      body.itemBrand.trim(),
      body.itemModel.trim(),
      body.itemColor.trim(),
      body.itemRef.trim(),
      body.devicePassword.trim(),
      body.accessories.trim(),
      body.conditionOnEntry.trim(),
      body.defect.trim(),
      body.diagnosis.trim(),
      body.notes.trim(),
      body.techNotes?.trim() || '',
      body.estimatedReadyAt.trim(),
      body.technician.trim(),
      body.sellerId.trim(),
      body.priority,
      body.labor || 0,
      body.parts || 0,
      totalAmount,
      body.operationId || '',
      now,
    ];

    const result = await pool.query(insertSql, values);
    res.status(201).json({ success: true, data: rowToWorkOrder(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 4. Atualizar OS (PATCH)
workOrdersRouter.patch('/api/v1/work-orders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;

    const currentRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!currentRes.rows[0]) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    }

    const current = currentRes.rows[0];
    const b = req.body;

    const fields: string[] = ['updated_at = now()'];
    const values: any[] = [osId, storeId];
    let pIdx = 3;

    if (b.status !== undefined) { fields.push(`status = $${pIdx++}`); values.push(b.status); }
    if (b.customerName !== undefined) { fields.push(`customer_name = $${pIdx++}`); values.push(b.customerName); }
    if (b.customerPhone !== undefined) { fields.push(`customer_phone = $${pIdx++}`); values.push(b.customerPhone); }
    if (b.customerDocument !== undefined) { fields.push(`customer_document = $${pIdx++}`); values.push(b.customerDocument); }
    if (b.customerEmail !== undefined) { fields.push(`customer_email = $${pIdx++}`); values.push(b.customerEmail); }
    if (b.itemName !== undefined) { fields.push(`item_name = $${pIdx++}`); values.push(b.itemName); }
    if (b.itemBrand !== undefined) { fields.push(`item_brand = $${pIdx++}`); values.push(b.itemBrand); }
    if (b.itemModel !== undefined) { fields.push(`item_model = $${pIdx++}`); values.push(b.itemModel); }
    if (b.itemColor !== undefined) { fields.push(`item_color = $${pIdx++}`); values.push(b.itemColor); }
    if (b.itemRef !== undefined) { fields.push(`item_ref = $${pIdx++}`); values.push(b.itemRef); }
    if (b.defect !== undefined) { fields.push(`defect = $${pIdx++}, defect_description = $${pIdx - 1}`); values.push(b.defect); }
    if (b.diagnosis !== undefined) { fields.push(`diagnosis = $${pIdx++}, technical_report = $${pIdx - 1}`); values.push(b.diagnosis); }
    if (b.notes !== undefined) { fields.push(`notes = $${pIdx++}`); values.push(b.notes); }
    if (b.techNotes !== undefined) { fields.push(`tech_notes = $${pIdx++}`); values.push(b.techNotes); }
    if (b.technician !== undefined) { fields.push(`technician = $${pIdx++}`); values.push(b.technician); }
    if (b.sellerId !== undefined) { fields.push(`seller_id = $${pIdx++}`); values.push(b.sellerId); }
    if (b.priority !== undefined) { fields.push(`priority = $${pIdx++}`); values.push(b.priority); }
    if (b.estimatedReadyAt !== undefined) { fields.push(`estimated_ready_at = $${pIdx++}`); values.push(b.estimatedReadyAt); }
    if (b.labor !== undefined) {
      fields.push(`labor = $${pIdx++}, labor_cost = $${pIdx - 1}`);
      values.push(Number(b.labor) || 0);
    }
    if (b.parts !== undefined) {
      fields.push(`parts = $${pIdx++}, parts_cost = $${pIdx - 1}`);
      values.push(Number(b.parts) || 0);
    }
    if (b.lines !== undefined) { fields.push(`lines = $${pIdx++}::jsonb`); values.push(JSON.stringify(b.lines)); }
    if (b.photos !== undefined) { fields.push(`photos = $${pIdx++}::jsonb`); values.push(JSON.stringify(b.photos)); }
    if (b.checklist !== undefined) { fields.push(`checklist = $${pIdx++}::jsonb`); values.push(JSON.stringify(b.checklist)); }
    if (b.comments !== undefined) { fields.push(`comments = $${pIdx++}::jsonb`); values.push(JSON.stringify(b.comments)); }
    if (b.history !== undefined) { fields.push(`history = $${pIdx++}::jsonb`); values.push(JSON.stringify(b.history)); }
    if (b.assetDisposition !== undefined) { fields.push(`asset_disposition = $${pIdx++}`); values.push(b.assetDisposition); }
    if (b.quoteStatus !== undefined) { fields.push(`quote_status = $${pIdx++}`); values.push(b.quoteStatus); }
    if (b.quoteNotes !== undefined) { fields.push(`quote_notes = $${pIdx++}`); values.push(b.quoteNotes); }
    if (b.quoteValidUntil !== undefined) { fields.push(`quote_valid_until = $${pIdx++}`); values.push(b.quoteValidUntil); }
    if (b.quoteDecidedAt !== undefined) { fields.push(`quote_decided_at = $${pIdx++}`); values.push(b.quoteDecidedAt); }
    if (b.quoteSentAt !== undefined) { fields.push(`quote_sent_at = $${pIdx++}`); values.push(b.quoteSentAt); }
    if (b.customerSignature !== undefined) { fields.push(`customer_signature = $${pIdx++}`); values.push(b.customerSignature); }
    if (b.customerSignedName !== undefined) { fields.push(`customer_signed_name = $${pIdx++}`); values.push(b.customerSignedName); }
    if (b.customerSignedAt !== undefined) { fields.push(`customer_signed_at = $${pIdx++}`); values.push(b.customerSignedAt); }

    const updateSql = `UPDATE work_orders SET ${fields.join(', ')} WHERE id = $1 AND store_id = $2 RETURNING *`;
    const result = await pool.query(updateSql, values);
    res.json({ success: true, data: rowToWorkOrder(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 5. Consumir peça (POST /parts)
workOrdersRouter.post('/api/v1/work-orders/:id/parts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;
    const { stockId, qty, unitPrice } = req.body;

    const osRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!osRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });

    const stockRes = await pool.query('SELECT * FROM stock_items WHERE id = $1 AND store_id = $2', [stockId, storeId]);
    if (!stockRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Item de estoque não encontrado.' } });

    const stockItem = stockRes.rows[0];
    const consumeQty = Math.max(1, Number(qty) || 1);
    const itemPrice = unitPrice !== undefined ? Number(unitPrice) : Number(stockItem.price || 0);
    const itemCost = Number(stockItem.cost || 0);

    // Baixa estoque
    await pool.query('UPDATE stock_items SET qty = GREATEST(0, qty - $1), updated_at = now() WHERE id = $2', [consumeQty, stockId]);

    // Registra lançamento financeiro de custo
    const finId = `FIN-${Date.now()}`;
    await pool.query(
      `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, created_at)
       VALUES ($1, $2, 'out', $3, $4, 'os_part', $5, now())`,
      [finId, storeId, `Consumo de peça OS ${osId}: ${stockItem.name}`, itemCost * consumeQty, osId]
    );

    const currentLines = safeJson(osRes.rows[0].lines, []);
    const newLine = {
      id: `OL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      stockId,
      name: stockItem.name,
      qty: consumeQty,
      unitCost: itemCost,
      unitPrice: itemPrice,
      kind: 'part',
      financeId: finId,
    };
    const nextLines = [...currentLines, newLine];
    const newPartsTotal = nextLines.reduce((sum: number, l: any) => sum + (l.unitPrice * l.qty), 0);

    const updated = await pool.query(
      `UPDATE work_orders SET lines = $1::jsonb, parts = $2, parts_cost = $2, updated_at = now() WHERE id = $3 AND store_id = $4 RETURNING *`,
      [JSON.stringify(nextLines), newPartsTotal, osId, storeId]
    );

    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 6. Estornar peça (DELETE /parts/:lineId)
workOrdersRouter.delete('/api/v1/work-orders/:id/parts/:lineId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const { id: osId, lineId } = req.params;

    const osRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!osRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });

    const currentLines = safeJson(osRes.rows[0].lines, []);
    const lineIndex = currentLines.findIndex((l: any) => l.id === lineId);
    if (lineIndex < 0) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Linha de peça não encontrada.' } });

    const [removed] = currentLines.splice(lineIndex, 1);
    if (removed.stockId) {
      await pool.query('UPDATE stock_items SET qty = qty + $1, updated_at = now() WHERE id = $2 AND store_id = $3', [removed.qty, removed.stockId, storeId]);
    }

    const finId = `FIN-${Date.now()}`;
    await pool.query(
      `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, created_at)
       VALUES ($1, $2, 'in', $3, $4, 'os_reversal', $5, now())`,
      [finId, storeId, `Estorno de peça OS ${osId}: ${removed.name}`, (removed.unitCost || 0) * (removed.qty || 1), osId]
    );

    const newPartsTotal = currentLines.reduce((sum: number, l: any) => sum + (l.unitPrice * l.qty), 0);
    const updated = await pool.query(
      `UPDATE work_orders SET lines = $1::jsonb, parts = $2, parts_cost = $2, updated_at = now() WHERE id = $3 AND store_id = $4 RETURNING *`,
      [JSON.stringify(currentLines), newPartsTotal, osId, storeId]
    );

    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 7. Entregar OS (POST /deliver)
workOrdersRouter.post('/api/v1/work-orders/:id/deliver', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;

    const osRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!osRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });

    const row = osRes.rows[0];
    const totalRevenue = (Number(row.labor || row.labor_cost) || 0) + (Number(row.parts || row.parts_cost) || 0);

    let revFinId = row.revenue_finance_id;
    if (totalRevenue > 0 && !revFinId) {
      revFinId = `FIN-${Date.now()}`;
      await pool.query(
        `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, created_at)
         VALUES ($1, $2, 'in', $3, $4, 'os_revenue', $5, now())`,
        [revFinId, storeId, `Receita de encerramento OS ${osId} (${row.customer_name})`, totalRevenue, osId]
      );
    }

    const updated = await pool.query(
      `UPDATE work_orders SET status = 'delivered', delivered_at = now(), revenue_finance_id = $1, updated_at = now() WHERE id = $2 AND store_id = $3 RETURNING *`,
      [revFinId, osId, storeId]
    );

    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 8. Cancelar OS (POST /cancel)
workOrdersRouter.post('/api/v1/work-orders/:id/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;

    const osRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!osRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });

    const row = osRes.rows[0];
    const currentLines = safeJson(row.lines, []);

    // Reverte todas as peças consumidas
    for (const line of currentLines) {
      if (line.stockId && line.kind === 'part') {
        await pool.query('UPDATE stock_items SET qty = qty + $1, updated_at = now() WHERE id = $2 AND store_id = $3', [line.qty || 1, line.stockId, storeId]);
      }
    }

    const updated = await pool.query(
      `UPDATE work_orders SET status = 'cancelled', updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *`,
      [osId, storeId]
    );

    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 9. Comprar equipamento / recondicionado (POST /purchase)
workOrdersRouter.post('/api/v1/work-orders/:id/purchase', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;
    const { cost, price, sku, imei, name, kind } = req.body;

    const osRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!osRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });

    const row = osRes.rows[0];
    const purchaseCost = Number(cost) || 0;
    const purchasePrice = price !== undefined ? Number(price) : Math.round(purchaseCost * 1.35 * 100) / 100;
    const purchaseStockId = `STK-REC-${Date.now().toString().slice(-6)}`;
    const finId = `FIN-${Date.now()}`;

    // Cria item no estoque como usado/recondicionado
    await pool.query(
      `INSERT INTO stock_items (
        id, store_id, name, sku, imei, cost, price, qty, min_qty, kind, condition, active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, 0, $8, 'refurbished', true, now(), now())`,
      [
        purchaseStockId,
        storeId,
        name || row.item_name || 'Aparelho Recondicionado',
        sku || `REC-${osId}`,
        imei || row.item_ref || '',
        purchaseCost,
        purchasePrice,
        kind || 'device',
      ]
    );

    // Registra saída financeira de compra
    await pool.query(
      `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, created_at)
       VALUES ($1, $2, 'out', $3, $4, 'os_purchase', $5, now())`,
      [finId, storeId, `Compra de aparelho usado/recondicionado na OS ${osId}`, purchaseCost, osId]
    );

    const updated = await pool.query(
      `UPDATE work_orders SET
         asset_disposition = 'purchased',
         purchase_cost = $1,
         purchase_at = now(),
         purchase_stock_id = $2,
         purchase_finance_id = $3,
         updated_at = now()
       WHERE id = $4 AND store_id = $5 RETURNING *`,
      [purchaseCost, purchaseStockId, finId, osId, storeId]
    );

    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 10. Fotos (POST & DELETE)
workOrdersRouter.post('/api/v1/work-orders/:id/photos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;
    const { kind, dataUrl, caption } = req.body;

    const osRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!osRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });

    const currentPhotos = safeJson(osRes.rows[0].photos, []);
    const newPhoto = {
      id: `PH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind: kind || 'entry',
      dataUrl,
      caption: caption || '',
      createdAt: new Date().toISOString(),
    };
    const nextPhotos = [...currentPhotos, newPhoto];

    const updated = await pool.query(
      'UPDATE work_orders SET photos = $1::jsonb, updated_at = now() WHERE id = $2 AND store_id = $3 RETURNING *',
      [JSON.stringify(nextPhotos), osId, storeId]
    );

    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

workOrdersRouter.delete('/api/v1/work-orders/:id/photos/:photoId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const { id: osId, photoId } = req.params;

    const osRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!osRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });

    const currentPhotos = safeJson(osRes.rows[0].photos, []);
    const nextPhotos = currentPhotos.filter((p: any) => p.id !== photoId);

    const updated = await pool.query(
      'UPDATE work_orders SET photos = $1::jsonb, updated_at = now() WHERE id = $2 AND store_id = $3 RETURNING *',
      [JSON.stringify(nextPhotos), osId, storeId]
    );

    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 11. Checklist (PATCH /checklist/:itemId)
workOrdersRouter.patch('/api/v1/work-orders/:id/checklist/:itemId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const { id: osId, itemId } = req.params;
    const { mark, note } = req.body;

    const osRes = await pool.query('SELECT * FROM work_orders WHERE id = $1 AND store_id = $2', [osId, storeId]);
    if (!osRes.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });

    const currentChecklist = safeJson(osRes.rows[0].checklist, []);
    const nextChecklist = currentChecklist.map((it: any) =>
      it.id === itemId ? { ...it, ...(mark !== undefined ? { mark } : {}), ...(note !== undefined ? { note } : {}) } : it
    );

    const updated = await pool.query(
      'UPDATE work_orders SET checklist = $1::jsonb, updated_at = now() WHERE id = $2 AND store_id = $3 RETURNING *',
      [JSON.stringify(nextChecklist), osId, storeId]
    );

    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 12. Assinatura (POST & DELETE /signature)
workOrdersRouter.post('/api/v1/work-orders/:id/signature', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;
    const { dataUrl, signedName } = req.body;

    const updated = await pool.query(
      `UPDATE work_orders SET
         customer_signature = $1,
         customer_signed_name = $2,
         customer_signed_at = now(),
         updated_at = now()
       WHERE id = $3 AND store_id = $4 RETURNING *`,
      [dataUrl || '', signedName || '', osId, storeId]
    );

    if (!updated.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

workOrdersRouter.delete('/api/v1/work-orders/:id/signature', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;

    const updated = await pool.query(
      `UPDATE work_orders SET
         customer_signature = '',
         customer_signed_name = '',
         customer_signed_at = null,
         updated_at = now()
       WHERE id = $1 AND store_id = $2 RETURNING *`,
      [osId, storeId]
    );

    if (!updated.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

// 13. Orçamentos (draft, send, approve, reject, reopen)
workOrdersRouter.post('/api/v1/work-orders/:id/quote/draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;
    const { notes, validUntil, labor } = req.body;

    const fields = [`quote_status = 'draft'`, 'updated_at = now()'];
    const values: any[] = [osId, storeId];
    let pIdx = 3;

    if (notes !== undefined) { fields.push(`quote_notes = $${pIdx++}`); values.push(notes); }
    if (validUntil !== undefined) { fields.push(`quote_valid_until = $${pIdx++}`); values.push(validUntil); }
    if (labor !== undefined) { fields.push(`labor = $${pIdx++}, labor_cost = $${pIdx - 1}`); values.push(Number(labor) || 0); }

    const updated = await pool.query(
      `UPDATE work_orders SET ${fields.join(', ')} WHERE id = $1 AND store_id = $2 RETURNING *`,
      values
    );

    if (!updated.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

workOrdersRouter.post('/api/v1/work-orders/:id/quote/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;

    const updated = await pool.query(
      `UPDATE work_orders SET quote_status = 'sent', quote_sent_at = now(), updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *`,
      [osId, storeId]
    );

    if (!updated.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

workOrdersRouter.post('/api/v1/work-orders/:id/quote/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;
    const { moveToProgress } = req.body || {};

    const statusClause = moveToProgress ? `, status = 'progress'` : '';
    const updated = await pool.query(
      `UPDATE work_orders SET quote_status = 'approved', quote_decided_at = now()${statusClause}, updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *`,
      [osId, storeId]
    );

    if (!updated.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

workOrdersRouter.post('/api/v1/work-orders/:id/quote/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;

    const updated = await pool.query(
      `UPDATE work_orders SET quote_status = 'rejected', quote_decided_at = now(), status = 'waiting', updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *`,
      [osId, storeId]
    );

    if (!updated.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});

workOrdersRouter.post('/api/v1/work-orders/:id/quote/reopen', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!pool) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' } });
    const storeId = req.storeId!;
    const osId = req.params.id;

    const updated = await pool.query(
      `UPDATE work_orders SET quote_status = 'draft', quote_decided_at = null, updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *`,
      [osId, storeId]
    );

    if (!updated.rows[0]) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'OS não encontrada.' } });
    res.json({ success: true, data: rowToWorkOrder(updated.rows[0]) });
  } catch (error) {
    next(error);
  }
});
