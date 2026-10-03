import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const goalsRouter = Router();

const tierSchema = z.object({
  name: z.string().min(1),
  value: z.coerce.number().min(0),
});

const goalSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome da meta é obrigatório.'),
  goalType: z.enum(['revenue', 'profit', 'sales_count', 'products_count']).default('revenue'),
  targetValue: z.coerce.number().min(0.01, 'Valor da meta deve ser maior que zero.'),
  startDate: z.string().min(4, 'Data inicial é obrigatória.'),
  endDate: z.string().min(4, 'Data final é obrigatória.'),
  sellerId: z.string().optional().nullable(),
  active: z.boolean().default(true),
  progressiveTiers: z.array(tierSchema).optional().default([]),
  commissionRules: z.object({
    enabled: z.boolean().default(true),
    percent: z.coerce.number().default(10),
    type: z.enum(['percent_revenue', 'percent_profit', 'fixed_value']).default('percent_revenue'),
    requiresGoalReached: z.boolean().default(true),
    fixedValue: z.coerce.number().default(0),
  }).optional().default({
    enabled: true,
    percent: 10,
    type: 'percent_revenue',
    requiresGoalReached: true,
    fixedValue: 0,
  }),
});

export async function computeGoalMetrics(goal: any, storeId: string) {
  if (!pool) {
    return {
      id: goal.id,
      name: goal.name,
      goalType: goal.goal_type || goal.goalType,
      targetValue: Number(goal.target_value ?? goal.targetValue) || 0,
      startDate: goal.start_date ?? goal.startDate,
      endDate: goal.end_date ?? goal.endDate,
      sellerId: goal.seller_id ?? goal.sellerId,
      sellerName: '',
      active: Boolean(goal.active),
      realized: 0,
      percent: 0,
      remaining: Number(goal.target_value ?? goal.targetValue) || 0,
      salesCount: 0,
      accumulatedProfit: 0,
      averageTicket: 0,
      isReached: false,
      currentTierName: '',
      commissionAmount: 0,
      progressiveTiers: goal.progressive_tiers || goal.progressiveTiers || [],
      commissionRules: goal.commission_rules || goal.commissionRules || {},
    };
  }

  const sellerFilter = goal.seller_id ? 'AND seller_id = $4' : '';
  const params: any[] = [storeId, goal.start_date, goal.end_date];
  if (goal.seller_id) params.push(goal.seller_id);

  const query = `
    SELECT
      COUNT(*)::int as sales_count,
      COALESCE(SUM(total_amount), 0)::numeric as total_revenue,
      COALESCE(SUM(gross_profit), 0)::numeric as total_profit
    FROM sales_orders
    WHERE store_id = $1
      AND status != 'cancelled'
      AND created_at::date >= $2::date
      AND created_at::date <= $3::date
      ${sellerFilter}
  `;

  const res = await pool.query(query, params);
  const row = res.rows[0];

  const salesCount = Number(row?.sales_count) || 0;
  const totalRevenue = Number(row?.total_revenue) || 0;
  const totalProfit = Number(row?.total_profit) || 0;
  const target = Number(goal.target_value) || 0;

  let realized = totalRevenue;
  if (goal.goal_type === 'profit') realized = totalProfit;
  else if (goal.goal_type === 'sales_count') realized = salesCount;

  const percent = target > 0 ? Math.round((realized / target) * 10000) / 100 : 0;
  const remaining = Math.max(0, Math.round((target - realized) * 100) / 100);
  const isReached = realized >= target;
  const averageTicket = salesCount > 0 ? Math.round((totalRevenue / salesCount) * 100) / 100 : 0;

  // Avaliação de níveis progressivos
  const tiers: Array<{ name: string; value: number }> = Array.isArray(goal.progressive_tiers)
    ? goal.progressive_tiers
    : (typeof goal.progressive_tiers === 'string' ? JSON.parse(goal.progressive_tiers) : []);

  let currentTierName = '';
  for (const t of tiers.sort((a, b) => b.value - a.value)) {
    if (realized >= t.value) {
      currentTierName = t.name;
      break;
    }
  }

  // Regra de comissão configurável
  const commRules = typeof goal.commission_rules === 'string'
    ? JSON.parse(goal.commission_rules)
    : (goal.commission_rules || {});

  let commissionAmount = 0;
  if (commRules.enabled) {
    const canPay = !commRules.requiresGoalReached || isReached;
    if (canPay) {
      if (commRules.type === 'percent_revenue') {
        commissionAmount = Math.round(totalRevenue * (Number(commRules.percent || 10) / 100) * 100) / 100;
      } else if (commRules.type === 'percent_profit') {
        commissionAmount = Math.round(totalProfit * (Number(commRules.percent || 10) / 100) * 100) / 100;
      } else if (commRules.type === 'fixed_value') {
        commissionAmount = Number(commRules.fixedValue || 0);
      }
    }
  }

  // Nome do vendedor se houver
  let sellerName = 'Toda a Equipe';
  if (goal.seller_id) {
    const sRes = await pool.query('SELECT name FROM sellers WHERE id = $1', [goal.seller_id]);
    if (sRes.rows.length > 0) sellerName = sRes.rows[0].name;
  }

  return {
    id: goal.id,
    name: goal.name,
    goalType: goal.goal_type,
    targetValue: target,
    startDate: goal.start_date,
    endDate: goal.end_date,
    sellerId: goal.seller_id,
    sellerName,
    active: Boolean(goal.active),
    realized,
    percent,
    remaining,
    salesCount,
    accumulatedProfit: totalProfit,
    averageTicket,
    isReached,
    currentTierName,
    commissionAmount,
    progressiveTiers: tiers,
    commissionRules: commRules,
    createdAt: goal.created_at,
  };
}

/* ── 1. Listar Metas da Empresa com Cálculo Dinâmico ───────── */

goalsRouter.get('/api/v1/goals', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    if (!pool) {
      res.json({ success: true, data: [] });
      return;
    }

    const goalsRes = await pool.query(
      `SELECT * FROM sales_goals WHERE store_id = $1 ORDER BY active DESC, start_date DESC`,
      [storeId],
    );

    const calculated = await Promise.all(
      goalsRes.rows.map((g) => computeGoalMetrics(g, storeId)),
    );

    res.json({ success: true, data: calculated });
  } catch (error) {
    next(error);
  }
});

/* ── 2. Criar Nova Meta ─────────────────────────────────────── */

goalsRouter.post('/api/v1/goals', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = goalSchema.parse(req.body);
    const id = body.id || `GOL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (!pool) {
      res.status(503).json({ success: false, error: { message: 'Banco de dados indisponível.' } });
      return;
    }

    await pool.query(
      `INSERT INTO sales_goals (
        id, store_id, name, goal_type, target_value, start_date, end_date, seller_id,
        active, progressive_tiers, commission_rules
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        storeId,
        body.name.trim(),
        body.goalType,
        body.targetValue,
        body.startDate,
        body.endDate,
        body.sellerId || null,
        body.active,
        JSON.stringify(body.progressiveTiers),
        JSON.stringify(body.commissionRules),
      ],
    );

    const createdRes = await pool.query('SELECT * FROM sales_goals WHERE id = $1', [id]);
    const computed = await computeGoalMetrics(createdRes.rows[0], storeId);
    res.status(201).json({ success: true, data: computed });
  } catch (error) {
    next(error);
  }
});

/* ── 3. Atualizar Meta ──────────────────────────────────────── */

goalsRouter.patch('/api/v1/goals/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = goalSchema.partial().parse(req.body);

    if (!pool) {
      res.status(503).json({ success: false, error: { message: 'Banco de dados indisponível.' } });
      return;
    }

    await pool.query(
      `UPDATE sales_goals
       SET name = COALESCE($1, name),
           goal_type = COALESCE($2, goal_type),
           target_value = COALESCE($3, target_value),
           start_date = COALESCE($4, start_date),
           end_date = COALESCE($5, end_date),
           seller_id = COALESCE($6, seller_id),
           active = COALESCE($7, active),
           progressive_tiers = COALESCE($8, progressive_tiers),
           commission_rules = COALESCE($9, commission_rules),
           updated_at = now()
       WHERE id = $10 AND store_id = $11`,
      [
        body.name,
        body.goalType,
        body.targetValue,
        body.startDate,
        body.endDate,
        body.sellerId,
        body.active,
        body.progressiveTiers ? JSON.stringify(body.progressiveTiers) : null,
        body.commissionRules ? JSON.stringify(body.commissionRules) : null,
        id,
        storeId,
      ],
    );

    const updatedRes = await pool.query('SELECT * FROM sales_goals WHERE id = $1', [id]);
    if (updatedRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Meta não encontrada.' } });
      return;
    }
    const computed = await computeGoalMetrics(updatedRes.rows[0], storeId);
    res.json({ success: true, data: computed });
  } catch (error) {
    next(error);
  }
});

/* ── 4. Excluir Meta ────────────────────────────────────────── */

goalsRouter.delete('/api/v1/goals/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;

    if (!pool) {
      res.status(503).json({ success: false, error: { message: 'Banco indisponível.' } });
      return;
    }

    await pool.query('DELETE FROM sales_goals WHERE id = $1 AND store_id = $2', [id, storeId]);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── 5. Dashboard / KPIs de Metas da Loja ────────────────────── */

goalsRouter.get('/api/v1/goals/dashboard', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    if (!pool) {
      res.json({
        success: true,
        data: {
          activeGoalsCount: 0,
          primaryGoal: null,
          totalRealized: 0,
          totalTarget: 0,
          percent: 0,
          remaining: 0,
          accumulatedProfit: 0,
          salesCount: 0,
          averageTicket: 0,
        },
      });
      return;
    }

    const goalsRes = await pool.query(
      `SELECT * FROM sales_goals WHERE store_id = $1 AND active = true ORDER BY start_date DESC`,
      [storeId],
    );

    const calculated = await Promise.all(
      goalsRes.rows.map((g) => computeGoalMetrics(g, storeId)),
    );

    const primaryGoal = calculated[0] || null;
    const totalRealized = calculated.reduce((sum, g) => sum + g.realized, 0);
    const totalTarget = calculated.reduce((sum, g) => sum + g.targetValue, 0);
    const percent = totalTarget > 0 ? Math.round((totalRealized / totalTarget) * 10000) / 100 : 0;
    const remaining = Math.max(0, totalTarget - totalRealized);

    res.json({
      success: true,
      data: {
        activeGoalsCount: calculated.length,
        primaryGoal,
        totalRealized,
        totalTarget,
        percent,
        remaining,
        accumulatedProfit: primaryGoal?.accumulatedProfit || 0,
        salesCount: primaryGoal?.salesCount || 0,
        averageTicket: primaryGoal?.averageTicket || 0,
        allGoals: calculated,
      },
    });
  } catch (error) {
    next(error);
  }
});
