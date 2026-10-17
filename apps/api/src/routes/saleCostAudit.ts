import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { lineUnitCost } from '../services/saleCost.js';
import { isStoreManagement } from '../services/saleHistory.js';

/**
 * Conferência do custo das vendas já lançadas. Até a correção, a venda gravava o custo do produto (o da
 * primeira variação) e o PDV não gravava custo nenhum: lucro, margem, metas de lucro e comissão saíam errados.
 * GET mostra, venda a venda, o custo gravado e o certo (aparelho que saiu → variação → produto);
 * POST grava só as vendas escolhidas, com histórico em sale_revisions.
 */
export const saleCostAuditRouter = Router();
saleCostAuditRouter.use('/api/v1/sales/cost-audit', requireAuth);

type Db = Pick<PoolClient, 'query'>;
const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: unknown) => Number(value) || 0;
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

async function auditSale(db: Db, storeId: string, sale: any) {
  const lines = (await db.query('SELECT * FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1 ORDER BY id', [sale.id])).rows;
  const fixed = [];
  for (const line of lines) {
    let unit = 0;
    // O aparelho que realmente saiu (entrada do IMEI ou a mais antiga) manda; senão a variação; senão o produto.
    const sold = (
      await db.query(
        `SELECT avg(e.unit_cost) AS cost FROM stock_sold_units u JOIN stock_supplier_entries e ON e.id = u.entry_id
          WHERE u.store_id = $1 AND u.sale_line_id = $2 AND u.reverted_at IS NULL`,
        [storeId, line.id],
      )
    ).rows[0];
    const recorded = round2(num(line.unit_cost));
    if (num(sold?.cost) > 0) unit = round2(num(sold.cost));
    else if (line.stock_id) {
      // Sem entrada: só corrige o erro conhecido (custo zero do PDV ou o custo do produto no lugar do da
      // variação). Custo gravado diferente disso foi o da época; a média da variação pode ter mudado depois.
      const productCost = round2(num((await db.query('SELECT cost FROM stock_items WHERE id = $1 AND store_id = $2', [line.stock_id, storeId])).rows[0]?.cost));
      const expected = round2(await lineUnitCost(db, { storeId, stockId: line.stock_id, attributes: Array.isArray(line.attributes) ? line.attributes : [], imei: line.imei }));
      unit = recorded <= 0 || Math.abs(recorded - productCost) < 0.01 ? expected : recorded;
    } else unit = recorded;
    fixed.push({ id: line.id, stockId: line.stock_id, name: line.name, qty: num(line.qty) || 1, attributes: line.attributes, imei: line.imei || '', recordedUnitCost: num(line.unit_cost), unitCost: unit });
  }
  // Receita da loja: o que o cliente pagou + crédito da troca − juros do cartão (são da operadora).
  const revenue = round2(num(sale.total_amount) + num(sale.trade_in_value) - num(sale.card_interest));
  const cost = round2(fixed.reduce((sum, line) => sum + line.unitCost * line.qty, 0));
  const profit = round2(revenue - cost);
  return {
    id: sale.id,
    saleType: sale.sale_type || 'pos',
    createdAt: sale.created_at,
    customerName: sale.customer_name,
    sellerName: sale.seller_name,
    total: num(sale.total_amount),
    recordedCost: num(sale.cost_total),
    recordedProfit: num(sale.gross_profit),
    cost,
    profit,
    margin: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0,
    lines: fixed,
  };
}

async function salesInRange(db: Db, storeId: string, days: number, ids?: string[]) {
  return (
    await db.query(
      `SELECT * FROM sales_orders
        WHERE store_id = $1 AND status = 'completed' AND COALESCE(source, '') <> 'commercial'
          AND created_at::timestamptz >= now() - ($2::int * interval '1 day')
          AND ($3::text[] IS NULL OR id = ANY($3::text[]))
        ORDER BY created_at DESC LIMIT 500`,
      [storeId, days, ids ?? null],
    )
  ).rows;
}

const changed = (audit: Awaited<ReturnType<typeof auditSale>>) =>
  Math.abs(audit.cost - audit.recordedCost) > 0.009 || audit.lines.some((line) => Math.abs(line.unitCost - line.recordedUnitCost) > 0.009);

saleCostAuditRouter.get('/api/v1/sales/cost-audit', async (req, res, next) => {
  try {
    if (!isStoreManagement(req.user?.role)) throw httpError('Só a gestão confere o custo das vendas.', 403);
    const days = Math.min(400, Math.max(1, Number(req.query.days) || 60));
    const audits = [];
    for (const sale of await salesInRange(pool, req.storeId!, days)) audits.push(await auditSale(pool, req.storeId!, sale));
    const wrong = audits.filter(changed);
    res.json({
      data: {
        checked: audits.length,
        wrong: wrong.length,
        profitDifference: round2(wrong.reduce((sum, audit) => sum + (audit.profit - audit.recordedProfit), 0)),
        sales: wrong,
      },
    });
  } catch (error) {
    next(error);
  }
});

const applySchema = z.object({ saleIds: z.array(z.string().min(1)).min(1).max(500), days: z.coerce.number().int().min(1).max(400).default(400) });

saleCostAuditRouter.post('/api/v1/sales/cost-audit/apply', async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!isStoreManagement(req.user?.role)) throw httpError('Só a gestão corrige o custo das vendas.', 403);
    const body = applySchema.parse(req.body);
    const storeId = req.storeId!;
    await client.query('BEGIN');
    const updated = [];
    for (const sale of await salesInRange(client, storeId, body.days, body.saleIds)) {
      const audit = await auditSale(client, storeId, sale);
      if (!changed(audit)) continue;
      for (const line of audit.lines) {
        await client.query('UPDATE sales_order_lines SET unit_cost = $2::numeric, total_cost = $3::numeric WHERE id = $1', [line.id, line.unitCost, round2(line.unitCost * line.qty)]);
        if (line.stockId) {
          await client.query("UPDATE stock_movements SET unit_cost = $4::numeric, cost = $4::numeric WHERE store_id = $1 AND ref_id = $2 AND stock_id = $3 AND type = 'sale'", [
            storeId,
            sale.id,
            line.stockId,
            line.unitCost,
          ]);
        }
      }
      await client.query('UPDATE sales_orders SET cost_total = $2::numeric, gross_profit = $3::numeric, margin_percent = $4::numeric WHERE id = $1', [sale.id, audit.cost, audit.profit, audit.margin]);
      await client.query(
        `INSERT INTO sale_revisions (id, store_id, sale_id, reason, operator_name, before, after) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
        [
          `REV-${randomUUID()}`,
          storeId,
          sale.id,
          'Custo recalculado pela variação/aparelho vendido (antes usava o custo do produto)',
          req.user?.name || 'Gestão',
          JSON.stringify({ cost: audit.recordedCost, profit: audit.recordedProfit, lines: audit.lines.map((l) => ({ id: l.id, unitCost: l.recordedUnitCost })) }),
          JSON.stringify({ cost: audit.cost, profit: audit.profit, lines: audit.lines.map((l) => ({ id: l.id, unitCost: l.unitCost })) }),
        ],
      );
      updated.push({ id: sale.id, cost: audit.cost, profit: audit.profit });
    }
    await client.query('COMMIT');
    res.json({ data: { updated } });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});
