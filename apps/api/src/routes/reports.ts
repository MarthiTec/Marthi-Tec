import { Router } from 'express';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';
import * as XLSX from 'xlsx';

export const reportsRouter = Router();

/* ── 1. Relatório de Vendas e Metas (Gilvan & Mariana) ──────── */

reportsRouter.get('/api/v1/reports/sales-goals', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const userRole = req.user?.role || 'operator';

    // Permissão para visualizar custo e lucro: apenas admin ou operador expressamente autorizado
    const canViewProfit = userRole === 'admin' || userRole === 'superadmin';

    const {
      startDate,
      endDate,
      sellerId,
      productId,
      paymentMethod,
      saleType,
      customerId,
      goalId,
    } = req.query;

    if (!pool) {
      res.json({
        success: true,
        data: {
          summary: {
            totalSales: 0,
            totalCost: canViewProfit ? 0 : null,
            grossProfit: canViewProfit ? 0 : null,
            marginPercent: canViewProfit ? 0 : null,
            salesCount: 0,
            averageTicket: 0,
            goalTarget: null,
            goalRealized: null,
            goalPercent: null,
            goalRemaining: null,
            commissionAmount: 0,
          },
          rows: [],
          canViewProfit,
        },
      });
      return;
    }

    const conditions: string[] = ['s.store_id = $1', "s.status != 'cancelled'"];
    const values: any[] = [storeId];
    let pIdx = 2;

    if (startDate && typeof startDate === 'string') {
      conditions.push(`s.created_at::date >= $${pIdx++}::date`);
      values.push(startDate);
    }
    if (endDate && typeof endDate === 'string') {
      conditions.push(`s.created_at::date <= $${pIdx++}::date`);
      values.push(endDate);
    }
    if (sellerId && typeof sellerId === 'string' && sellerId !== 'all') {
      conditions.push(`s.seller_id = $${pIdx++}`);
      values.push(sellerId);
    }
    if (customerId && typeof customerId === 'string' && customerId !== 'all') {
      conditions.push(`s.customer_id = $${pIdx++}`);
      values.push(customerId);
    }
    if (saleType && typeof saleType === 'string' && saleType !== 'all') {
      conditions.push(`s.sale_type = $${pIdx++}`);
      values.push(saleType);
    }
    if (paymentMethod && typeof paymentMethod === 'string' && paymentMethod !== 'all') {
      conditions.push(`s.payment_name ILIKE $${pIdx++}`);
      values.push(`%${paymentMethod}%`);
    }

    const sql = `
      SELECT
        s.id,
        s.created_at,
        s.customer_name,
        s.seller_name,
        s.payment_name,
        s.subtotal,
        s.discount,
        s.surcharge,
        s.total_amount,
        s.trade_in_value,
        s.sale_type,
        s.cost_total,
        s.gross_profit,
        s.margin_percent,
        COALESCE(json_agg(
          json_build_object(
            'id', l.id,
            'name', l.name,
            'qty', l.qty,
            'unit_price', l.unit_price,
            'total_price', l.total_price,
            'unit_cost', l.unit_cost,
            'total_cost', l.total_cost,
            'imei', l.imei
          )
        ) FILTER (WHERE l.id IS NOT NULL), '[]'::json) as items
      FROM sales_orders s
      LEFT JOIN sales_order_lines l ON l.sale_id = s.id OR l.order_id = s.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `;

    const salesRes = await pool.query(sql, values);

    // Cálculos de Resumo
    let totalSales = 0;
    let totalCost = 0;
    let grossProfit = 0;
    const salesCount = salesRes.rows.length;

    const rows = salesRes.rows.map((r) => {
      const saleTotal = Number(r.total_amount) || 0;
      const saleCost = Number(r.cost_total) || 0;
      const saleProfit = Number(r.gross_profit) || (saleTotal - saleCost);
      const saleMargin = saleTotal > 0 ? (saleProfit / saleTotal) * 100 : 0;

      totalSales += saleTotal;
      totalCost += saleCost;
      grossProfit += saleProfit;

      const productNames = (r.items || []).map((it: any) => `${it.name} (x${it.qty})`).join(', ');

      return {
        id: r.id,
        date: r.created_at,
        productNames: productNames || 'Produto diverso',
        sellerName: r.seller_name || 'Mariana Marçal',
        customerName: r.customer_name || 'Consumidor Final',
        itemsCount: (r.items || []).reduce((sum: number, it: any) => sum + Number(it.qty), 0),
        subtotal: Number(r.subtotal),
        discount: Number(r.discount),
        surcharge: Number(r.surcharge),
        tradeInValue: Number(r.trade_in_value || 0),
        netAmount: saleTotal,
        paymentMethod: r.payment_name || 'Cartão',
        saleType: r.sale_type === 'external' ? 'Venda Externa' : 'PDV Balcão',
        // Oculta custos e lucros se o usuário não for autorizado
        costTotal: canViewProfit ? saleCost : null,
        grossProfit: canViewProfit ? saleProfit : null,
        marginPercent: canViewProfit ? Math.round(saleMargin * 100) / 100 : null,
        items: (r.items || []).map((it: any) => ({
          name: it.name,
          qty: Number(it.qty),
          unitPrice: Number(it.unit_price),
          totalPrice: Number(it.total_price),
          unitCost: canViewProfit ? Number(it.unit_cost || 0) : null,
          totalCost: canViewProfit ? Number(it.total_cost || 0) : null,
          imei: it.imei || '',
        })),
      };
    });

    const averageTicket = salesCount > 0 ? Math.round((totalSales / salesCount) * 100) / 100 : 0;
    const marginPercent = totalSales > 0 ? Math.round((grossProfit / totalSales) * 10000) / 100 : 0;

    // Buscar meta vinculada se solicitada ou ativa no período
    let goalTarget: number | null = null;
    let goalRealized: number | null = null;
    let goalPercent: number | null = null;
    let goalRemaining: number | null = null;
    let commissionAmount = 0;

    const goalFilter = goalId && typeof goalId === 'string' && goalId !== 'all'
      ? 'AND id = $2'
      : 'AND active = true ORDER BY start_date DESC LIMIT 1';
    const goalParams: any[] = [storeId];
    if (goalId && typeof goalId === 'string' && goalId !== 'all') goalParams.push(goalId);

    const goalRes = await pool.query(
      `SELECT * FROM sales_goals WHERE store_id = $1 ${goalFilter}`,
      goalParams,
    );

    if (goalRes.rows.length > 0) {
      const g = goalRes.rows[0];
      goalTarget = Number(g.target_value) || 0;
      goalRealized = g.goal_type === 'profit' ? grossProfit : totalSales;
      goalPercent = goalTarget > 0 ? Math.round((goalRealized / goalTarget) * 10000) / 100 : 0;
      goalRemaining = Math.max(0, goalTarget - goalRealized);

      const commRules = typeof g.commission_rules === 'string'
        ? JSON.parse(g.commission_rules)
        : (g.commission_rules || {});

      if (commRules.enabled) {
        const isReached = goalRealized >= goalTarget;
        if (!commRules.requiresGoalReached || isReached) {
          if (commRules.type === 'percent_revenue') {
            commissionAmount = Math.round(totalSales * (Number(commRules.percent ?? 0) / 100) * 100) / 100;
          } else if (commRules.type === 'percent_profit') {
            commissionAmount = Math.round(grossProfit * (Number(commRules.percent ?? 0) / 100) * 100) / 100;
          } else if (commRules.type === 'fixed_value') {
            commissionAmount = Number(commRules.fixedValue || 0);
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        summary: {
          totalSales,
          totalCost: canViewProfit ? totalCost : null,
          grossProfit: canViewProfit ? grossProfit : null,
          marginPercent: canViewProfit ? marginPercent : null,
          salesCount,
          averageTicket,
          goalTarget,
          goalRealized,
          goalPercent,
          goalRemaining,
          commissionAmount,
        },
        rows,
        canViewProfit,
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ── 2. Exportação de Relatório para Excel (XLSX) ──────────── */

reportsRouter.get('/api/v1/reports/sales-goals/export', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const userRole = req.user?.role || 'operator';
    const canViewProfit = userRole === 'admin' || userRole === 'superadmin';

    if (!pool) {
      res.status(503).send('Banco indisponível');
      return;
    }

    const { startDate, endDate, sellerId } = req.query;
    const conditions: string[] = ['store_id = $1', "status != 'cancelled'"];
    const values: any[] = [storeId];
    let pIdx = 2;

    if (startDate && typeof startDate === 'string') {
      conditions.push(`created_at::date >= $${pIdx++}::date`);
      values.push(startDate);
    }
    if (endDate && typeof endDate === 'string') {
      conditions.push(`created_at::date <= $${pIdx++}::date`);
      values.push(endDate);
    }
    if (sellerId && typeof sellerId === 'string' && sellerId !== 'all') {
      conditions.push(`seller_id = $${pIdx++}`);
      values.push(sellerId);
    }

    const query = `
      SELECT
        created_at::date as data,
        id as venda_numero,
        customer_name as cliente,
        seller_name as vendedor,
        payment_name as forma_pagamento,
        total_amount as valor_venda,
        cost_total as custo,
        gross_profit as lucro,
        margin_percent as margem_percent
      FROM sales_orders
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, values);

    // Formata linhas para o Excel
    const excelRows = result.rows.map((r) => {
      const base: Record<string, any> = {
        'Data': new Date(r.data).toLocaleDateString('pt-BR'),
        'Nº Venda': r.venda_numero,
        'Cliente': r.cliente,
        'Vendedor': r.vendedor,
        'Forma de Pagamento': r.forma_pagamento,
        'Valor da Venda (R$)': Number(r.valor_venda),
      };

      if (canViewProfit) {
        base['Custo (R$)'] = Number(r.custo);
        base['Lucro Bruto (R$)'] = Number(r.lucro);
        base['Margem (%)'] = Number(r.margem_percent);
      }

      return base;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendas e Metas');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Relatorio_Vendas_Metas.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});
