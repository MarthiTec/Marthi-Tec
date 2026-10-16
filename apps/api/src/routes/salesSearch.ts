import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { employeeHasPermission } from '../services/employeeAccess.js';
import { markUnitsSold } from '../services/soldUnits.js';
import { changeVariationQuantity } from '../services/variationInventory.js';

/**
 * Consulta de vendas (PDV e painel) no banco: busca por texto, por IMEI enquanto digita, por cliente,
 * vendedor, período e caixa. A venda externa tem caixa próprio: só aparece para quem tem a permissão
 * "Ver vendas e caixa da Venda Externa" (gerência sempre vê).
 */
export const salesSearchRouter = Router();

const querySchema = z.object({
  q: z.string().trim().max(120).default(''),
  imei: z.string().trim().max(30).default(''),
  customer: z.string().trim().max(120).default(''),
  sellerId: z.string().trim().max(100).default(''),
  from: z.string().optional(),
  to: z.string().optional(),
  /** Id do caixa do PDV, ou "external" para o caixa da venda externa. */
  session: z.string().trim().max(100).default(''),
  type: z.enum(['all', 'pos', 'external']).default('all'),
  status: z.enum(['all', 'sold', 'cancelled']).default('all'),
  limit: z.coerce.number().int().min(1).max(300).default(80),
});

const like = (value: string) => `%${value.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
const validDate = (value?: string) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);

export async function canSeeExternalSales(req: any) {
  return employeeHasPermission(pool, { storeId: req.storeId, email: req.user?.email ?? '', role: req.user?.role ?? '' }, 'viewExternalSales');
}

salesSearchRouter.get('/api/v1/sales/search', requireAuth, async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const external = await canSeeExternalSales(req);
    const type = external ? (q.session === 'external' ? 'external' : q.type) : 'pos';
    const where: string[] = ['s.store_id = $1'];
    const args: unknown[] = [req.storeId];
    const add = (sql: string, value: unknown) => {
      args.push(value);
      where.push(sql.replaceAll('?', `$${args.length}`));
    };
    if (type === 'pos') where.push("COALESCE(s.sale_type, 'pos') <> 'external'");
    if (type === 'external') where.push("s.sale_type = 'external'");
    if (q.status === 'sold') where.push("s.status <> 'cancelled'");
    if (q.status === 'cancelled') where.push("s.status = 'cancelled'");
    if (q.session && q.session !== 'external') add('s.session_id = ?', q.session);
    if (q.sellerId) add('s.seller_id = ?', q.sellerId);
    const from = validDate(q.from);
    const to = validDate(q.to);
    if (from) add('s.created_at >= ?::timestamptz', from);
    if (to) add('s.created_at <= ?::timestamptz', to);
    if (q.customer) {
      const digits = q.customer.replace(/\D/g, '');
      args.push(like(q.customer));
      const textParam = `$${args.length}`;
      if (digits.length >= 3) {
        args.push(`%${digits}%`);
        where.push(`(s.customer_name ILIKE ${textParam} OR regexp_replace(COALESCE(s.customer_phone, '') || ' ' || COALESCE(s.customer_document, ''), '\\D', '', 'g') LIKE $${args.length})`);
      } else where.push(`s.customer_name ILIKE ${textParam}`);
    }
    // IMEI digitado aos poucos: a partir de 3 dígitos já filtra.
    const imeiDigits = q.imei.replace(/\D/g, '');
    if (imeiDigits.length >= 3) {
      // Também pelo 2º IMEI do aparelho dual chip (guardado na entrada).
    add(
      `EXISTS (SELECT 1 FROM sales_order_lines li WHERE (li.sale_id = s.id OR li.order_id = s.id) AND (li.imei LIKE ? OR EXISTS (
         SELECT 1 FROM stock_supplier_entries x CROSS JOIN LATERAL jsonb_each_text(COALESCE(x.imei_pairs, '{}'::jsonb)) AS p(key, value)
          WHERE x.store_id = s.store_id AND ((p.key = li.imei AND p.value LIKE ?) OR (p.value = li.imei AND p.key LIKE ?)))))`,
      `%${imeiDigits}%`,
    );
    }
    if (q.q) {
      args.push(like(q.q));
      const p = `$${args.length}`;
      where.push(`(s.id ILIKE ${p} OR s.customer_name ILIKE ${p} OR s.seller_name ILIKE ${p} OR COALESCE(s.payment_name, '') ILIKE ${p}
        OR EXISTS (SELECT 1 FROM sales_order_lines li WHERE (li.sale_id = s.id OR li.order_id = s.id) AND (li.name ILIKE ${p} OR li.imei ILIKE ${p})))`);
    }
    args.push(q.limit);
    const rows = await pool.query(
      `SELECT s.id, COALESCE(s.sale_type, 'pos') AS sale_type, s.created_at, s.customer_name, s.customer_phone, s.customer_document,
              s.seller_id, s.seller_name, s.status, s.session_id, s.cancelled_at, s.cancel_reason,
              COALESCE(NULLIF(s.final_amount, 0), s.total_amount, s.total, 0) AS amount,
              COALESCE((SELECT p.method_name || CASE WHEN p.installments > 1 THEN ' · ' || p.installments || 'x' ELSE '' END
                          FROM sale_payments p WHERE p.sale_id = s.id ORDER BY p.created_at LIMIT 1), s.payment_name, '') AS payment,
              (SELECT string_agg(li.qty::text || 'x ' || li.name, ', ' ORDER BY li.name) FROM sales_order_lines li WHERE li.sale_id = s.id OR li.order_id = s.id) AS items,
              (SELECT COALESCE(jsonb_agg(DISTINCT li.imei) FILTER (WHERE li.imei <> ''), '[]'::jsonb) FROM sales_order_lines li WHERE li.sale_id = s.id OR li.order_id = s.id) AS imeis
         FROM sales_orders s
        WHERE ${where.join(' AND ')}
        ORDER BY s.created_at DESC
        LIMIT $${args.length}`,
      args,
    );
    res.json({
      success: true,
      data: {
        canSeeExternal: external,
        items: rows.rows.map((row) => ({
          id: row.id,
          type: row.sale_type === 'external' ? 'external' : 'pos',
          createdAt: row.created_at,
          customerName: row.customer_name || 'Consumidor Final',
          customerPhone: row.customer_phone || '',
          customerDocument: row.customer_document || '',
          sellerId: row.seller_id || '',
          sellerName: row.seller_name || '',
          status: row.status === 'cancelled' ? 'cancelled' : 'sold',
          sessionId: row.sale_type === 'external' ? 'external' : row.session_id || '',
          amount: Number(row.amount) || 0,
          payment: row.payment || '',
          items: row.items || '',
          imeis: Array.isArray(row.imeis) ? row.imeis : [],
          cancelledAt: row.cancelled_at,
          cancelReason: row.cancel_reason || '',
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

const posEditSchema = z.object({
  customerName: z.string().trim().min(1, 'Informe o cliente.').max(160),
  customerDocument: z.string().trim().max(20).default(''),
  saleAt: z.string().optional(),
  reason: z.string().trim().min(3, 'Informe o motivo da alteração.').max(500),
});

/**
 * Corrige a venda do PDV (cliente, documento e data/hora), com histórico. Valor e itens não mudam
 * por aqui: para isso há troca ou cancelamento, que acertam estoque, caixa e financeiro.
 */
salesSearchRouter.patch('/api/v1/pos/sales/:id', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = posEditSchema.parse(req.body);
    const storeId = req.storeId!;
    const allowed = await employeeHasPermission(pool, { storeId, email: req.user?.email ?? '', role: req.user?.role ?? '' }, 'canEdit');
    if (!allowed) throw Object.assign(new Error('Sem permissão para alterar vendas.'), { status: 403 });
    await client.query('BEGIN');
    const sale = (await client.query('SELECT * FROM sales_orders WHERE id = $1 AND store_id = $2 FOR UPDATE', [req.params.id, storeId])).rows[0];
    if (!sale) throw Object.assign(new Error('Venda não encontrada nesta loja.'), { status: 404 });
    if (sale.sale_type === 'external') throw Object.assign(new Error('Venda externa: corrija pela tela de Venda Externa.'), { status: 409 });
    if (sale.status === 'cancelled') throw Object.assign(new Error('Venda cancelada não pode ser alterada.'), { status: 409 });
    const saleAt = validDate(body.saleAt);
    const before = { customerName: sale.customer_name, customerDocument: sale.customer_document, createdAt: sale.created_at };
    await client.query(
      `UPDATE sales_orders SET customer_name = $3, customer_document = $4, created_at = COALESCE($5::timestamptz, created_at), updated_at = now()
        WHERE id = $1 AND store_id = $2`,
      [sale.id, storeId, body.customerName, body.customerDocument, saleAt],
    );
    await client.query('UPDATE receivables SET customer_name = $3, updated_at = now() WHERE sale_id = $1 AND store_id = $2', [sale.id, storeId, body.customerName]);
    await client.query(
      'INSERT INTO sale_revisions (id, store_id, sale_id, reason, operator_name, before, after) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)',
      [`REV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, storeId, sale.id, body.reason, req.user?.name || 'Operador', JSON.stringify(before),
        JSON.stringify({ customerName: body.customerName, customerDocument: body.customerDocument, createdAt: saleAt ?? sale.created_at })],
    );
    await client.query('COMMIT');
    res.json({ success: true, data: { id: sale.id, customerName: body.customerName, customerDocument: body.customerDocument, createdAt: saleAt ?? sale.created_at } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

/**
 * Estorno do cancelamento (até 24h) da venda do PDV: o estoque sai de novo (o aparelho do IMEI volta a
 * constar como vendido), o recebível volta a pago, a receita volta ao financeiro e o dinheiro, ao caixa.
 */
salesSearchRouter.post('/api/v1/sales/:id/restore', requireAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const storeId = req.storeId!;
    const operator = req.user?.name || 'Operador';
    const allowed = await employeeHasPermission(pool, { storeId, email: req.user?.email ?? '', role: req.user?.role ?? '' }, 'posCancelSale');
    if (!allowed) throw Object.assign(new Error('Sem permissão para estornar cancelamentos.'), { status: 403 });
    await client.query('BEGIN');
    const sale = (await client.query('SELECT * FROM sales_orders WHERE id = $1 AND store_id = $2 FOR UPDATE', [req.params.id, storeId])).rows[0];
    if (!sale) throw Object.assign(new Error('Venda não encontrada nesta loja.'), { status: 404 });
    if (sale.sale_type === 'external') throw Object.assign(new Error('Venda externa: lance novamente pela tela de Venda Externa.'), { status: 409 });
    if (sale.status !== 'cancelled') throw Object.assign(new Error('Esta venda não está cancelada.'), { status: 409 });
    const cancelledAt = sale.cancelled_at ? Date.parse(String(sale.cancelled_at instanceof Date ? sale.cancelled_at.toISOString() : sale.cancelled_at)) : NaN;
    if (!Number.isFinite(cancelledAt) || Date.now() - cancelledAt > 24 * 3600000) throw Object.assign(new Error('O estorno do cancelamento só vale até 24 horas.'), { status: 409 });

    const lines = (await client.query('SELECT * FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1', [sale.id])).rows;
    for (const line of lines) {
      if (!line.stock_id || line.pickup_kind === 'order') continue;
      const stock = (await client.query('SELECT qty, cost, name FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE', [line.stock_id, storeId])).rows[0];
      if (!stock) continue;
      const qty = Number(line.qty) || 0;
      if (Number(stock.qty) < qty) throw Object.assign(new Error(`"${stock.name}" não está mais em estoque para restaurar a venda.`), { status: 409 });
      const variationId = await changeVariationQuantity(client, storeId, line.stock_id, Array.isArray(line.attributes) ? line.attributes : [], -qty);
      await markUnitsSold(client, { storeId, stockId: line.stock_id, variationId, qty, imei: line.imei || '', saleId: sale.id, lineId: line.id, unitPrice: Number(line.unit_price) || 0, operator });
      const prev = Number(stock.qty);
      await client.query('UPDATE stock_items SET qty = $3, updated_at = now() WHERE id = $1 AND store_id = $2', [line.stock_id, storeId, prev - qty]);
      await client.query(
        `INSERT INTO stock_movements (id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes)
         VALUES ($1, $2, $3, 'sale', $4, $5::int, $6::int, $7, 'sale', $8, $9, $10)`,
        [`MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, storeId, line.stock_id, qty, prev, prev - qty, Number(stock.cost) || 0, sale.id, operator, `Venda restaurada #${sale.id}`],
      );
    }
    await client.query("UPDATE receivables SET status = 'paid', notes = notes || ' · Venda restaurada', updated_at = now() WHERE sale_id = $1 AND store_id = $2 AND status = 'cancelled'", [sale.id, storeId]);
    const reversal = (await client.query("SELECT COALESCE(SUM(amount), 0) AS amount FROM finance_entries WHERE store_id = $1 AND ref_id = $2 AND type = 'out' AND category = 'Estorno de Venda'", [storeId, sale.id])).rows[0];
    if (Number(reversal.amount) > 0) {
      await client.query(
        `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, category, operator_name) VALUES ($1, $2, 'in', $3, $4, 'pos', $5, 'Vendas', $6)`,
        [`ENT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, storeId, `Venda restaurada #${sale.id} (estorno do cancelamento)`, Number(reversal.amount), sale.id, operator],
      );
    }
    await client.query("UPDATE sales_orders SET status = 'completed', cancelled_at = NULL, cancel_reason = '', cancel_operator = '', updated_at = now() WHERE id = $1", [sale.id]);
    // O dinheiro devolvido no cancelamento volta para a gaveta do caixa aberto.
    const cancelEvents = (await client.query("SELECT COALESCE(SUM(amount), 0) AS total, COALESCE(SUM(cash_amount), 0) AS cash FROM cash_session_events WHERE store_id = $1 AND order_id = $2 AND COALESCE(type, event_type) = 'sale' AND amount < 0", [storeId, sale.id])).rows[0];
    const open = (await client.query("SELECT id FROM cash_sessions WHERE store_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1 FOR UPDATE", [storeId])).rows[0];
    if (open && Number(cancelEvents.total) < 0) {
      await client.query(
        `INSERT INTO cash_session_events (id, session_id, store_id, type, amount, cash_amount, note, order_id, operator_name) VALUES ($1, $2, $3, 'sale', $4::numeric, $5::numeric, $6, $7, $8)`,
        [`MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, open.id, storeId, -Number(cancelEvents.total), -Number(cancelEvents.cash), `Venda restaurada #${sale.id}`, sale.id, operator],
      );
      if (Number(cancelEvents.cash) < 0) await client.query('UPDATE cash_sessions SET expected_cash = expected_cash + $2::numeric WHERE id = $1', [open.id, -Number(cancelEvents.cash)]);
    }
    await client.query('COMMIT');
    res.json({ success: true, data: { id: sale.id, status: 'sold' } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});
