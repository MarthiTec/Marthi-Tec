import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Avaliação interna do aparelho de troca. O vendedor (venda externa) pede, a oficina vê na esteira
 * "Avaliação de produto pendente · cliente X · IMEI Y", registra bateria, se já foi aberto, se está
 * quebrado/trincado, observação e preço sugerido; o vendedor consulta pelo IMEI e aprova ou recusa.
 * Sem custo para o cliente: não cria OS, orçamento nem lançamento financeiro.
 */
export const tradeEvaluationsRouter = Router();
tradeEvaluationsRouter.use('/api/v1/trade-evaluations', requireAuth);

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const cleanImei = (value: string) => value.replace(/\s+/g, '').trim();
const money = (value: unknown) => (value === null || value === undefined ? null : Math.round(Number(value) * 100) / 100);
const who = (req: any) => req.user?.name || req.user?.email || 'Usuário';

const OPEN = ['pending', 'evaluated'];

const view = (row: any) => ({
  id: row.id,
  status: row.status,
  customerId: row.customer_id ?? null,
  customerName: row.customer_name,
  deviceName: row.device_name,
  imei: row.imei,
  capacity: row.capacity,
  color: row.color,
  requestNotes: row.request_notes,
  requestedBy: row.requested_by,
  batteryLevel: row.battery_level === null ? null : Number(row.battery_level),
  opened: row.opened,
  cracked: row.cracked,
  evaluationNotes: row.evaluation_notes,
  suggestedPrice: money(row.suggested_price),
  evaluatedBy: row.evaluated_by,
  evaluatedAt: row.evaluated_at,
  approvedPrice: money(row.approved_price),
  decisionNotes: row.decision_notes,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function load(storeId: string, id: string) {
  const row = (await pool.query('SELECT * FROM trade_evaluations WHERE id = $1 AND store_id = $2', [id, storeId])).rows[0];
  if (!row) throw httpError('Avaliação não encontrada nesta loja.', 404);
  return row;
}

/** Lista: ?status=open (pendentes + avaliadas, o padrão), pending, evaluated, approved, rejected, all; ?imei= filtra. */
tradeEvaluationsRouter.get('/api/v1/trade-evaluations', async (req, res, next) => {
  try {
    const status = String(req.query.status ?? 'open');
    const imei = cleanImei(String(req.query.imei ?? ''));
    const args: unknown[] = [req.storeId];
    let where = 'store_id = $1';
    if (status === 'open') where += ` AND status = ANY($${args.push(OPEN)}::text[])`;
    else if (status !== 'all') where += ` AND status = $${args.push(status)}`;
    if (imei) where += ` AND imei = $${args.push(imei)}`;
    const rows = await pool.query(`SELECT * FROM trade_evaluations WHERE ${where} ORDER BY created_at DESC LIMIT 200`, args);
    res.json({ data: rows.rows.map(view) });
  } catch (error) {
    next(error);
  }
});

/** A avaliação mais recente do IMEI (cancelada não conta); null quando nunca foi avaliado. */
tradeEvaluationsRouter.get('/api/v1/trade-evaluations/by-imei/:imei', async (req, res, next) => {
  try {
    const row = (
      await pool.query(
        "SELECT * FROM trade_evaluations WHERE store_id = $1 AND imei = $2 AND status <> 'canceled' ORDER BY created_at DESC LIMIT 1",
        [req.storeId, cleanImei(req.params.imei)],
      )
    ).rows[0];
    res.json({ data: row ? view(row) : null });
  } catch (error) {
    next(error);
  }
});

const requestSchema = z.object({
  customerId: z.string().trim().max(120).nullish(),
  customerName: z.string().trim().max(200).default(''),
  deviceName: z.string().trim().min(1, 'Informe o aparelho.').max(200),
  imei: z.string().trim().min(1, 'Informe o IMEI do aparelho.').max(40),
  capacity: z.string().trim().max(60).default(''),
  color: z.string().trim().max(60).default(''),
  notes: z.string().trim().max(500).default(''),
});

tradeEvaluationsRouter.post('/api/v1/trade-evaluations', async (req, res, next) => {
  try {
    const body = requestSchema.parse(req.body);
    const imei = cleanImei(body.imei);
    const open = (
      await pool.query('SELECT id FROM trade_evaluations WHERE store_id = $1 AND imei = $2 AND status = ANY($3::text[]) LIMIT 1', [req.storeId, imei, OPEN])
    ).rows[0];
    if (open) throw httpError(`O IMEI ${imei} já tem uma avaliação em aberto.`, 409);
    const id = `TEV-${randomUUID()}`;
    const row = (
      await pool.query(
        `INSERT INTO trade_evaluations (id, store_id, customer_id, customer_name, device_name, imei, capacity, color, request_notes, requested_by, requested_by_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [id, req.storeId, body.customerId || null, body.customerName, body.deviceName, imei, body.capacity, body.color, body.notes, who(req), req.user?.email ?? ''],
      )
    ).rows[0];
    res.status(201).json({ data: view(row) });
  } catch (error) {
    next(error);
  }
});

const evaluateSchema = z.object({
  batteryLevel: z.number().int().min(0).max(100).nullable(),
  opened: z.boolean(),
  cracked: z.boolean(),
  notes: z.string().trim().max(1000).default(''),
  suggestedPrice: z.number().min(0),
});

/** A oficina registra (ou corrige, enquanto o vendedor não decidiu) a avaliação. */
tradeEvaluationsRouter.post('/api/v1/trade-evaluations/:id/evaluate', async (req, res, next) => {
  try {
    const body = evaluateSchema.parse(req.body);
    const current = await load(req.storeId!, req.params.id);
    if (!OPEN.includes(current.status)) throw httpError('O vendedor já decidiu esta avaliação.', 409);
    const row = (
      await pool.query(
        `UPDATE trade_evaluations
            SET status = 'evaluated', battery_level = $3, opened = $4, cracked = $5, evaluation_notes = $6, suggested_price = $7::numeric,
                evaluated_by = $8, evaluated_at = now(), updated_at = now()
          WHERE id = $1 AND store_id = $2 RETURNING *`,
        [current.id, req.storeId, body.batteryLevel, body.opened, body.cracked, body.notes, body.suggestedPrice, who(req)],
      )
    ).rows[0];
    res.json({ data: view(row) });
  } catch (error) {
    next(error);
  }
});

const decisionSchema = z.object({ price: z.number().min(0).optional(), notes: z.string().trim().max(500).default('') });

/** O vendedor aprova (o preço sugerido, ou o combinado) ou recusa o preço da oficina. */
for (const action of ['approve', 'reject'] as const) {
  tradeEvaluationsRouter.post(`/api/v1/trade-evaluations/:id/${action}`, async (req, res, next) => {
    try {
      const body = decisionSchema.parse(req.body ?? {});
      const current = await load(req.storeId!, req.params.id);
      if (current.status !== 'evaluated') throw httpError(current.status === 'pending' ? 'A oficina ainda não avaliou este aparelho.' : 'Esta avaliação já foi decidida.', 409);
      const price = action === 'approve' ? (body.price ?? money(current.suggested_price)) : null;
      const row = (
        await pool.query(
          `UPDATE trade_evaluations SET status = $3, approved_price = $4::numeric, decision_notes = $5, decided_by = $6, decided_at = now(), updated_at = now()
            WHERE id = $1 AND store_id = $2 RETURNING *`,
          [current.id, req.storeId, action === 'approve' ? 'approved' : 'rejected', price, body.notes, who(req)],
        )
      ).rows[0];
      res.json({ data: view(row) });
    } catch (error) {
      next(error);
    }
  });
}

/** Desistiu de avaliar (cliente foi embora, pedido errado): sai da esteira. */
tradeEvaluationsRouter.post('/api/v1/trade-evaluations/:id/cancel', async (req, res, next) => {
  try {
    const current = await load(req.storeId!, req.params.id);
    if (!OPEN.includes(current.status)) throw httpError('Esta avaliação já foi decidida.', 409);
    const row = (
      await pool.query("UPDATE trade_evaluations SET status = 'canceled', decided_by = $3, decided_at = now(), updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *", [
        current.id,
        req.storeId,
        who(req),
      ])
    ).rows[0];
    res.json({ data: view(row) });
  } catch (error) {
    next(error);
  }
});
