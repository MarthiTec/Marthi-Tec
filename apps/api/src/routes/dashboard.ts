import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Painel da operação: números da loja direto do banco (caixa, tesouraria, contas, vendas,
 * estoque e oficina). Dias no horário de Brasília; `::timestamptz` porque em produção algumas
 * colunas de data são timestamp sem fuso.
 */
export const dashboardRouter = Router();

const TZ = 'America/Sao_Paulo';
const OPEN_WORK_ORDER = ['backlog', 'open', 'opened', 'diagnosis', 'waiting', 'progress', 'reproved', 'ready'];
const SOURCE_LABEL: Record<string, string> = { pos: 'PDV', os_revenue: 'OS', manual: 'Manual' };
const SOURCE_TONE: Record<string, string> = { pos: '#0f766e', os_revenue: '#2563eb', manual: '#ca8a04', os_part: '#7c3aed', os_purchase: '#dc2626', os_reversal: '#64748b' };

type TechnicianRank = { name: string; closedCount: number; revenue: number; returns: number; inProgress: number; avgTicket: number };

/** Ranking da oficina: entregas, faturamento, em andamento e retornos (mesmo aparelho voltando depois de entregue). */
function rankTechnicians(orders: Array<{ technician: string; status: string; total: number; itemRef: string; createdAt: string; delivered: boolean }>) {
  const ranks = new Map<string, TechnicianRank>();
  const rank = (name: string) => {
    if (!ranks.has(name)) ranks.set(name, { name, closedCount: 0, revenue: 0, returns: 0, inProgress: 0, avgTicket: 0 });
    return ranks.get(name)!;
  };
  for (const order of orders) {
    const row = rank(order.technician);
    if (order.status === 'delivered') {
      row.closedCount += 1;
      row.revenue += order.total;
    }
    if (OPEN_WORK_ORDER.includes(order.status)) row.inProgress += 1;
  }
  const byItem = new Map<string, typeof orders>();
  for (const order of orders.filter((item) => item.status !== 'cancelled' && item.itemRef.length >= 4)) {
    byItem.set(order.itemRef, [...(byItem.get(order.itemRef) ?? []), order]);
  }
  for (const list of byItem.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    list.forEach((_order, index) => {
      const prior = list.slice(0, index).reverse().find((item) => item.status === 'delivered' || item.delivered);
      if (prior) rank(prior.technician).returns += 1;
    });
  }
  return [...ranks.values()]
    .map((row) => ({ ...row, avgTicket: row.closedCount ? row.revenue / row.closedCount : 0 }))
    .sort((a, b) => b.closedCount - a.closedCount || b.revenue - a.revenue);
}

dashboardRouter.get('/api/v1/dashboard/summary', requireAuth, async (req, res, next) => {
  try {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).parse(req.query);
    const storeId = req.storeId!;
    const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, [storeId, ...args])).rows;
    const num = (value: unknown) => Number(value) || 0;

    // Primeiro dia do período (hoje em Brasília e os dias anteriores).
    const [period] = (await pool.query(`SELECT ((now() AT TIME ZONE '${TZ}')::date - ($1::int - 1))::text AS start`, [days])).rows;
    const start = String(period.start);
    const local = (column: string) => `(${column}::timestamptz AT TIME ZONE '${TZ}')::date`;

    const [cash] = await q(
      `SELECT COALESCE(sum(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS balance,
              COALESCE(sum(amount) FILTER (WHERE type = 'in' AND ${local('created_at')} >= $2::date), 0) AS revenue,
              COALESCE(sum(amount) FILTER (WHERE type = 'out' AND ${local('created_at')} >= $2::date), 0) AS expense
         FROM finance_entries WHERE store_id = $1`,
      [start],
    );
    const daily = await q(
      `SELECT ${local('created_at')}::text AS day, type, sum(amount) AS total FROM finance_entries
        WHERE store_id = $1 AND ${local('created_at')} >= $2::date GROUP BY 1, 2`,
      [start],
    );
    const dailySales = await q(
      `SELECT ${local('created_at')}::text AS day, sum(final_amount) AS total FROM sales_orders
        WHERE store_id = $1 AND status = 'completed' AND ${local('created_at')} >= $2::date GROUP BY 1`,
      [start],
    );
    const mixRows = await q(
      `SELECT source::text AS source, sum(amount) AS total FROM finance_entries
        WHERE store_id = $1 AND type = 'in' AND ${local('created_at')} >= $2::date GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
      [start],
    );
    // Saldo das contas: inicial + tesouraria + contas pagas/recebidas + adiantamentos pela conta (como o livro financeiro da tela).
    const [treasury] = await q(
      `SELECT COALESCE(sum(a.initial_balance
                + COALESCE((SELECT sum(amount) FROM treasury_moves t WHERE t.store_id = $1 AND t.to_account_id = a.id), 0)
                - COALESCE((SELECT sum(amount) FROM treasury_moves t WHERE t.store_id = $1 AND t.from_account_id = a.id), 0)
                - COALESCE((SELECT sum(paid_amount) FROM payables p WHERE p.store_id = $1 AND p.account_id = a.id), 0)
                + COALESCE((SELECT sum(received_amount) FROM receivables r WHERE r.store_id = $1 AND r.account_id = a.id), 0)
                + COALESCE((SELECT sum((CASE WHEN v.kind = 'customer' THEN 1 ELSE -1 END) * (CASE WHEN v.status = 'refunded' THEN v.used_amount ELSE v.amount END))
                              FROM advance_payments v WHERE v.store_id = $1 AND v.account_id = a.id), 0)), 0) AS total
         FROM bank_accounts a WHERE a.store_id = $1 AND a.active = true`,
    );
    const [open] = await q(
      `SELECT (SELECT COALESCE(sum(amount - paid_amount), 0) FROM payables WHERE store_id = $1 AND status::text IN ('open', 'partial')) AS payables,
              (SELECT COALESCE(sum(amount - received_amount), 0) FROM receivables WHERE store_id = $1 AND status::text IN ('open', 'partial')) AS receivables,
              (SELECT COALESCE(sum(amount - used_amount), 0) FROM advance_payments WHERE store_id = $1 AND status = 'open') AS advances,
              (SELECT count(*) FROM sales_orders WHERE store_id = $1 AND status = 'completed') AS sold,
              (SELECT count(*) FROM stock_items WHERE store_id = $1 AND active = true AND qty <= min_qty) AS low_stock,
              (SELECT count(*) FROM stock_items WHERE store_id = $1 AND active = true) AS skus,
              (SELECT COALESCE(sum(qty), 0) FROM stock_items WHERE store_id = $1 AND active = true) AS units,
              (SELECT count(*) FROM pos_tickets WHERE store_id = $1 AND status = 'open') AS open_tickets`,
    );
    const workOrders = (
      await q(`SELECT technician, status, total_amount, item_ref, created_at, delivered_at FROM work_orders WHERE store_id = $1`)
    ).map((row) => ({
      technician: String(row.technician || '').trim() || 'Sem técnico',
      status: String(row.status),
      total: num(row.total_amount),
      itemRef: String(row.item_ref || '').replace(/\s+/g, '').toUpperCase(),
      createdAt: new Date(row.created_at).toISOString(),
      delivered: Boolean(row.delivered_at),
    }));

    const series = Array.from({ length: days }, (_value, index) => {
      const date = new Date(`${start}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const inflow = num(daily.find((row) => row.day === key && row.type === 'in')?.total);
      const outflow = num(daily.find((row) => row.day === key && row.type === 'out')?.total);
      const sales = num(dailySales.find((row) => row.day === key)?.total);
      return { key, label: date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', timeZone: 'UTC' }), inflow, outflow, sales: sales || inflow };
    });
    const technicians = rankTechnicians(workOrders);
    const deliveredCount = technicians.reduce((sum, row) => sum + row.closedCount, 0);
    const returnCount = technicians.reduce((sum, row) => sum + row.returns, 0);
    const revenuePeriod = num(cash.revenue);
    const expensePeriod = num(cash.expense);

    res.json({
      success: true,
      data: {
        cashBalance: num(cash.balance),
        treasury: num(treasury.total),
        payablesOpen: num(open.payables),
        receivablesOpen: num(open.receivables),
        advancesOpen: num(open.advances),
        soldCount: num(open.sold),
        revenuePeriod,
        expensePeriod,
        resultPeriod: revenuePeriod - expensePeriod,
        openOs: workOrders.filter((order) => OPEN_WORK_ORDER.includes(order.status)).length,
        lowStock: num(open.low_stock),
        series,
        mix: mixRows.map((row) => ({ label: SOURCE_LABEL[row.source] ?? row.source, value: num(row.total), tone: SOURCE_TONE[row.source] ?? '#64748b' })),
        technicians,
        topCloser: technicians[0] ?? null,
        topEarner: [...technicians].sort((a, b) => b.revenue - a.revenue || b.closedCount - a.closedCount)[0] ?? null,
        topReturns: [...technicians].filter((row) => row.returns > 0).sort((a, b) => b.returns - a.returns || b.closedCount - a.closedCount)[0] ?? null,
        deliveredCount,
        returnRate: deliveredCount ? returnCount / deliveredCount : 0,
        openPosTickets: num(open.open_tickets),
        skuCount: num(open.skus),
        stockUnits: num(open.units),
      },
    });
  } catch (error) {
    next(error);
  }
});
