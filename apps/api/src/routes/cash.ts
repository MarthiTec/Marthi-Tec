import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { changeVariationQuantity } from '../services/variationInventory.js';

/**
 * Caixa do PDV no banco: sessões (abertura, aporte, sangria, gaveta, fechamento, reabertura),
 * vale-compra e trocas. A tela do caixa usa estas rotas; antes, sem elas, tudo ficava só no navegador.
 */
export const cashRouter = Router();

type Db = Pick<PoolClient, 'query'>;
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const newId = (prefix: string) => `${prefix}-${randomUUID()}`;
const num = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const operatorOf = (req: any, name?: string) => name?.trim() || req.user?.name || 'Operador';

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/* ── Sessões ─────────────────────────────────────────── */

async function sessionView(db: Db, storeId: string, id: string) {
  const s = (await db.query('SELECT * FROM cash_sessions WHERE id = $1 AND store_id = $2', [id, storeId])).rows[0];
  if (!s) throw httpError('Caixa não encontrado nesta loja.', 404);
  const moves = await db.query(
    `SELECT id, COALESCE(type, event_type) AS kind, amount, cash_amount, COALESCE(NULLIF(note, ''), notes, '') AS note, reason,
            beneficiary_type, beneficiary_name, operator_name, order_id, created_at
       FROM cash_session_events WHERE session_id = $1 ORDER BY created_at, id`,
    [id],
  );
  return {
    id: s.id,
    openedAt: s.opened_at,
    closedAt: s.closed_at ?? undefined,
    openingFloat: num(s.opening_float ?? s.initial_amount),
    expectedCash: num(s.expected_cash),
    countedCash: s.counted_cash === null || s.counted_cash === undefined ? undefined : num(s.counted_cash),
    difference: num(s.difference),
    closeBreakdown: s.closing_breakdown && Object.keys(s.closing_breakdown).length ? s.closing_breakdown : undefined,
    operatorName: s.operator_name || '',
    status: s.status === 'open' ? 'open' : 'closed',
    reopenCount: Number(s.reopen_count) || 0,
    movements: moves.rows.map((m) => ({
      id: m.id,
      kind: m.kind,
      amount: num(m.amount),
      cashAmount: num(m.cash_amount),
      note: m.note || '',
      reason: m.reason || undefined,
      beneficiaryType: m.beneficiary_type || undefined,
      beneficiaryName: m.beneficiary_name || undefined,
      orderId: m.order_id || undefined,
      createdAt: m.created_at,
      operatorName: m.operator_name || '',
    })),
  };
}

/** Caixa aberto da loja, travado para a operação (um caixa aberto por loja). */
async function lockOpenSession(db: Db, storeId: string, id?: string) {
  const row = (
    await db.query(
      `SELECT id, expected_cash FROM cash_sessions WHERE store_id = $1 AND status = 'open' ${id ? 'AND id = $2' : ''} ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
      id ? [storeId, id] : [storeId],
    )
  ).rows[0];
  if (!row) throw httpError('Abra o caixa antes de continuar.', 409);
  return { id: row.id as string, expectedCash: num(row.expected_cash) };
}

async function addEvent(
  db: Db,
  input: { sessionId: string; storeId: string; kind: string; amount: number; cashAmount?: number; note: string; operator: string; reason?: string; beneficiaryType?: string; beneficiaryName?: string; orderId?: string | null; at?: string | null },
) {
  const id = newId('MOV');
  await db.query(
    `INSERT INTO cash_session_events (id, session_id, store_id, type, amount, cash_amount, note, reason, beneficiary_type, beneficiary_name, operator_name, order_id, created_at)
     VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, now()))`,
    [
      id, input.sessionId, input.storeId, input.kind, input.amount, input.cashAmount ?? input.amount, input.note, input.reason ?? '',
      input.beneficiaryType ?? null, input.beneficiaryName ?? '', input.operator, input.orderId ?? null, input.at || null,
    ],
  );
  return id;
}

const moveCash = (db: Db, sessionId: string, delta: number) =>
  db.query('UPDATE cash_sessions SET expected_cash = expected_cash + $2::numeric WHERE id = $1', [sessionId, delta]);

cashRouter.get('/api/v1/cash/sessions', requireAuth, async (req, res, next) => {
  try {
    const rows = await pool.query('SELECT id FROM cash_sessions WHERE store_id = $1 ORDER BY opened_at DESC LIMIT 200', [req.storeId]);
    const data = [];
    for (const row of rows.rows) data.push(await sessionView(pool, req.storeId!, row.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

cashRouter.get('/api/v1/cash/sessions/open', requireAuth, async (req, res, next) => {
  try {
    const row = (await pool.query("SELECT id FROM cash_sessions WHERE store_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1", [req.storeId])).rows[0];
    res.json({ success: true, data: row ? await sessionView(pool, req.storeId!, row.id) : null });
  } catch (error) {
    next(error);
  }
});

cashRouter.get('/api/v1/cash/sessions/:id', requireAuth, async (req, res, next) => {
  try {
    res.json({ success: true, data: await sessionView(pool, req.storeId!, req.params.id) });
  } catch (error) {
    next(error);
  }
});

const openSchema = z.object({
  openingFloat: z.coerce.number().min(0).default(0),
  operatorName: z.string().trim().max(120).default(''),
  note: z.string().trim().max(300).optional(),
  openedAt: z.string().optional(),
});

cashRouter.post('/api/v1/cash/sessions/open', requireAuth, async (req, res, next) => {
  try {
    const body = openSchema.parse(req.body);
    const storeId = req.storeId!;
    const operator = operatorOf(req, body.operatorName);
    const at = body.openedAt && !Number.isNaN(Date.parse(body.openedAt)) ? new Date(body.openedAt).toISOString() : new Date().toISOString();
    const data = await inTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['cash:' + storeId]);
      if ((await client.query("SELECT 1 FROM cash_sessions WHERE store_id = $1 AND status = 'open'", [storeId])).rows.length) {
        throw httpError('Já existe um caixa aberto. Feche ou consulte os caixas.', 409);
      }
      const id = `CX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await client.query(
        `INSERT INTO cash_sessions (id, store_id, operator_name, opened_at, opening_float, initial_amount, expected_cash, status)
         VALUES ($1, $2, $3, $4::timestamptz, $5::numeric, $5::numeric, $5::numeric, 'open')`,
        [id, storeId, operator, at, body.openingFloat],
      );
      await addEvent(client, { sessionId: id, storeId, kind: 'open', amount: body.openingFloat, note: body.note || 'Abertura de caixa', operator, at });
      return sessionView(client, storeId, id);
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

const movementSchema = z.object({
  amount: z.coerce.number().positive('Informe um valor válido.'),
  note: z.string().trim().max(300).optional(),
  reason: z.string().trim().max(120).optional(),
  beneficiaryType: z.enum(['store', 'employee']).default('store'),
  beneficiaryId: z.string().optional(),
  beneficiaryName: z.string().trim().max(120).optional(),
  operatorName: z.string().trim().max(120).optional(),
  at: z.string().optional(),
});

for (const kind of ['aporte', 'sangria'] as const) {
  cashRouter.post(`/api/v1/cash/sessions/:id/${kind}`, requireAuth, async (req, res, next) => {
    try {
      const body = movementSchema.parse(req.body);
      const storeId = req.storeId!;
      const data = await inTransaction(async (client) => {
        const session = await lockOpenSession(client, storeId, req.params.id);
        if (kind === 'sangria' && body.amount > session.expectedCash + 0.001) throw httpError('Sangria maior que o saldo esperado do caixa.', 409);
        await addEvent(client, {
          sessionId: session.id, storeId, kind, amount: body.amount, operator: operatorOf(req, body.operatorName),
          note: body.note || body.reason || (kind === 'aporte' ? 'Aporte' : 'Sangria'), reason: body.reason,
          beneficiaryType: body.beneficiaryType, beneficiaryName: body.beneficiaryName || (body.beneficiaryType === 'employee' ? 'Funcionário' : 'Loja'),
          at: body.at && !Number.isNaN(Date.parse(body.at)) ? new Date(body.at).toISOString() : null,
        });
        await moveCash(client, session.id, kind === 'aporte' ? body.amount : -body.amount);
        return sessionView(client, storeId, session.id);
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  });
}

/** Corrige uma sangria ou um aporte do caixa aberto (valor, motivo, favorecido, horário). */
cashRouter.patch('/api/v1/cash/sessions/:id/movements/:movementId', requireAuth, async (req, res, next) => {
  try {
    const body = movementSchema.parse(req.body);
    const storeId = req.storeId!;
    const data = await inTransaction(async (client) => {
      const session = await lockOpenSession(client, storeId, req.params.id);
      const move = (await client.query('SELECT COALESCE(type, event_type) AS kind, amount FROM cash_session_events WHERE id = $1 AND session_id = $2', [req.params.movementId, session.id])).rows[0];
      if (!move) throw httpError('Movimento não encontrado.', 404);
      if (move.kind !== 'aporte' && move.kind !== 'sangria') throw httpError('Só é possível editar sangrias e aportes.', 409);
      const sign = move.kind === 'aporte' ? 1 : -1;
      const nextExpected = session.expectedCash - sign * num(move.amount) + sign * body.amount;
      if (nextExpected < -0.001) throw httpError('Sangria maior que o saldo esperado do caixa.', 409);
      await client.query(
        `UPDATE cash_session_events SET amount = $3::numeric, cash_amount = $3::numeric, note = COALESCE($4, note), reason = COALESCE($5, reason),
                beneficiary_type = $6, beneficiary_name = COALESCE($7, beneficiary_name), created_at = COALESCE($8::timestamptz, created_at)
          WHERE id = $1 AND session_id = $2`,
        [req.params.movementId, session.id, body.amount, body.note || body.reason || null, body.reason ?? null, body.beneficiaryType, body.beneficiaryName ?? null,
          body.at && !Number.isNaN(Date.parse(body.at)) ? new Date(body.at).toISOString() : null],
      );
      await moveCash(client, session.id, nextExpected - session.expectedCash);
      return sessionView(client, storeId, session.id);
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

cashRouter.delete('/api/v1/cash/sessions/:id/movements/:movementId', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const data = await inTransaction(async (client) => {
      const session = await lockOpenSession(client, storeId, req.params.id);
      const move = (await client.query('SELECT COALESCE(type, event_type) AS kind, amount FROM cash_session_events WHERE id = $1 AND session_id = $2', [req.params.movementId, session.id])).rows[0];
      if (!move) throw httpError('Movimento não encontrado.', 404);
      if (move.kind !== 'aporte' && move.kind !== 'sangria') throw httpError('Só é possível excluir sangrias e aportes.', 409);
      const delta = move.kind === 'aporte' ? -num(move.amount) : num(move.amount);
      if (session.expectedCash + delta < -0.001) throw httpError('O aporte já foi usado: o saldo do caixa ficaria negativo.', 409);
      await client.query('DELETE FROM cash_session_events WHERE id = $1 AND session_id = $2', [req.params.movementId, session.id]);
      await moveCash(client, session.id, delta);
      return sessionView(client, storeId, session.id);
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

cashRouter.post('/api/v1/cash/sessions/:id/drawer', requireAuth, async (req, res, next) => {
  try {
    const body = z.object({ note: z.string().trim().max(300).optional(), operatorName: z.string().trim().max(120).optional() }).parse(req.body ?? {});
    const storeId = req.storeId!;
    const data = await inTransaction(async (client) => {
      const session = await lockOpenSession(client, storeId, req.params.id);
      await addEvent(client, { sessionId: session.id, storeId, kind: 'drawer', amount: 0, cashAmount: 0, note: body.note || 'Gaveta aberta', operator: operatorOf(req, body.operatorName) });
      return sessionView(client, storeId, session.id);
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

const closeSchema = z.object({
  countedCash: z.coerce.number().min(0).default(0),
  operatorName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  closedAt: z.string().optional(),
  breakdown: z.record(z.any()).optional(),
});

cashRouter.post('/api/v1/cash/sessions/:id/close', requireAuth, async (req, res, next) => {
  try {
    const body = closeSchema.parse(req.body);
    const storeId = req.storeId!;
    const data = await inTransaction(async (client) => {
      const session = await lockOpenSession(client, storeId, req.params.id);
      const difference = num(body.countedCash - session.expectedCash);
      const at = body.closedAt && !Number.isNaN(Date.parse(body.closedAt)) ? new Date(body.closedAt).toISOString() : new Date().toISOString();
      await client.query(
        `UPDATE cash_sessions SET status = 'closed', closed_at = $3::timestamptz, counted_cash = $4::numeric, closed_amount = $4::numeric, difference = $5::numeric,
                closing_breakdown = $6::jsonb, notes = $7 WHERE id = $1 AND store_id = $2`,
        [session.id, storeId, at, body.countedCash, difference, JSON.stringify({ ...(body.breakdown ?? {}), countedCash: body.countedCash }), body.note ?? ''],
      );
      await addEvent(client, {
        sessionId: session.id, storeId, kind: 'close', amount: body.countedCash, operator: operatorOf(req, body.operatorName), at,
        note: body.note || `Fechamento · esperado ${session.expectedCash.toFixed(2)} · contado ${body.countedCash.toFixed(2)} · dif ${difference.toFixed(2)}`,
      });
      return sessionView(client, storeId, session.id);
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

cashRouter.post('/api/v1/cash/sessions/:id/reopen', requireAuth, async (req, res, next) => {
  try {
    const body = z.object({ operatorName: z.string().trim().max(120).optional(), note: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const storeId = req.storeId!;
    const data = await inTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['cash:' + storeId]);
      const session = (await client.query('SELECT id, status FROM cash_sessions WHERE id = $1 AND store_id = $2 FOR UPDATE', [req.params.id, storeId])).rows[0];
      if (!session) throw httpError('Caixa não encontrado nesta loja.', 404);
      if (session.status === 'open') throw httpError('Este caixa já está aberto.', 409);
      if ((await client.query("SELECT 1 FROM cash_sessions WHERE store_id = $1 AND status = 'open'", [storeId])).rows.length) {
        throw httpError('Feche o caixa aberto antes de reabrir outro.', 409);
      }
      await client.query(
        "UPDATE cash_sessions SET status = 'open', closed_at = NULL, counted_cash = NULL, closed_amount = NULL, difference = 0, reopen_count = reopen_count + 1 WHERE id = $1",
        [session.id],
      );
      await addEvent(client, { sessionId: session.id, storeId, kind: 'open', amount: 0, cashAmount: 0, note: body.note || 'Reabertura do caixa', operator: operatorOf(req, body.operatorName) });
      return sessionView(client, storeId, session.id);
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/* ── Vale-compra ─────────────────────────────────────── */

const creditRow = (row: any) => ({
  id: row.id,
  code: row.code,
  customerName: row.customer_name,
  customerPhone: row.customer_phone || '',
  amount: num(row.amount),
  remaining: num(row.remaining),
  note: row.note || '',
  createdAt: row.created_at,
  operatorName: row.operator_name || '',
  status: row.status,
  orderId: row.order_id || undefined,
});

async function issueCredit(
  db: Db,
  input: { storeId: string; customerName: string; customerPhone: string; amount: number; note: string; operator: string; orderId?: string | null; affectCash: boolean },
) {
  let sessionId: string | null = null;
  if (input.affectCash) {
    const session = await lockOpenSession(db, input.storeId);
    sessionId = session.id;
  }
  const id = newId('VALE');
  let code = '';
  for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
    const candidate = `VC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    if (!(await db.query('SELECT 1 FROM store_credits WHERE store_id = $1 AND code = $2', [input.storeId, candidate])).rows.length) code = candidate;
  }
  if (!code) throw httpError('Não foi possível gerar o código do vale. Tente de novo.', 409);
  await db.query(
    `INSERT INTO store_credits (id, store_id, code, customer_name, customer_phone, amount, remaining, note, order_id, session_id, operator_name)
     VALUES ($1, $2, $3, $4, $5, $6::numeric, $6::numeric, $7, $8, $9, $10)`,
    [id, input.storeId, code, input.customerName, input.customerPhone, input.amount, input.note, input.orderId ?? null, sessionId, input.operator],
  );
  if (sessionId) {
    await addEvent(db, { sessionId, storeId: input.storeId, kind: 'vale', amount: input.amount, note: `Vale ${code} · ${input.customerName}`, operator: input.operator });
    await moveCash(db, sessionId, -input.amount);
  }
  return creditRow((await db.query('SELECT * FROM store_credits WHERE id = $1', [id])).rows[0]);
}

cashRouter.get('/api/v1/cash/credits', requireAuth, async (req, res, next) => {
  try {
    const rows = await pool.query('SELECT * FROM store_credits WHERE store_id = $1 ORDER BY created_at DESC LIMIT 500', [req.storeId]);
    res.json({ success: true, data: rows.rows.map(creditRow) });
  } catch (error) {
    next(error);
  }
});

const creditSchema = z.object({
  customerName: z.string().trim().max(160).default('Cliente'),
  customerPhone: z.string().trim().max(30).default(''),
  amount: z.coerce.number().positive('Informe o valor do vale.'),
  note: z.string().trim().max(300).default(''),
  operatorName: z.string().trim().max(120).optional(),
  orderId: z.string().trim().max(80).optional(),
  affectCash: z.boolean().default(true),
});

cashRouter.post('/api/v1/cash/credits', requireAuth, async (req, res, next) => {
  try {
    const body = creditSchema.parse(req.body);
    const data = await inTransaction((client) =>
      issueCredit(client, {
        storeId: req.storeId!, customerName: body.customerName || 'Cliente', customerPhone: body.customerPhone, amount: body.amount,
        note: body.note || 'Vale-compra', operator: operatorOf(req, body.operatorName), orderId: body.orderId, affectCash: body.affectCash,
      }),
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/** Resgate (parcial ou total) pelo código ou pelo id do vale. */
cashRouter.post('/api/v1/cash/credits/:id/use', requireAuth, async (req, res, next) => {
  try {
    const body = z.object({ amount: z.coerce.number().positive('Informe o valor do resgate.'), operatorName: z.string().trim().max(120).optional() }).parse(req.body);
    const storeId = req.storeId!;
    const data = await inTransaction(async (client) => {
      const key = req.params.id.trim().toUpperCase();
      const credit = (await client.query('SELECT * FROM store_credits WHERE store_id = $1 AND (upper(code) = $2 OR id = $3) FOR UPDATE', [storeId, key, req.params.id])).rows[0];
      if (!credit || credit.status !== 'open') throw httpError('Vale não encontrado ou já usado.', 404);
      if (body.amount > num(credit.remaining) + 0.001) throw httpError(`Saldo do vale: ${num(credit.remaining).toFixed(2)}.`, 409);
      const remaining = num(num(credit.remaining) - body.amount);
      await client.query("UPDATE store_credits SET remaining = $2::numeric, status = CASE WHEN $2::numeric <= 0 THEN 'used' ELSE status END, updated_at = now() WHERE id = $1", [credit.id, remaining]);
      const open = (await client.query("SELECT id FROM cash_sessions WHERE store_id = $1 AND status = 'open' LIMIT 1 FOR UPDATE", [storeId])).rows[0];
      if (open) {
        await addEvent(client, { sessionId: open.id, storeId, kind: 'vale', amount: body.amount, note: `Resgate vale ${credit.code}`, operator: operatorOf(req, body.operatorName) });
        await moveCash(client, open.id, body.amount);
      }
      return creditRow((await client.query('SELECT * FROM store_credits WHERE id = $1', [credit.id])).rows[0]);
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

cashRouter.post('/api/v1/cash/credits/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const data = await inTransaction(async (client) => {
      const credit = (await client.query('SELECT * FROM store_credits WHERE store_id = $1 AND id = $2 FOR UPDATE', [storeId, req.params.id])).rows[0];
      if (!credit) throw httpError('Vale não encontrado.', 404);
      if (credit.status !== 'open') throw httpError('Vale já encerrado.', 409);
      await client.query("UPDATE store_credits SET status = 'cancelled', updated_at = now() WHERE id = $1", [credit.id]);
      return creditRow((await client.query('SELECT * FROM store_credits WHERE id = $1', [credit.id])).rows[0]);
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/* ── Trocas ──────────────────────────────────────────── */

const exchangeLine = z.object({
  stockId: z.string().trim().default(''),
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(80).optional(),
  qty: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().min(0),
  /** Variação (cor/capacidade/condição) do item, quando o produto tem grade. */
  attributes: z.array(z.object({ id: z.string(), value: z.string() })).optional(),
});

const exchangeSchema = z.object({
  orderId: z.string().trim().max(80).default(''),
  customerName: z.string().trim().max(160).default('Cliente'),
  customerPhone: z.string().trim().max(30).default(''),
  returnLines: z.array(exchangeLine).default([]),
  outLines: z.array(exchangeLine).default([]),
  note: z.string().trim().max(500).default(''),
  operatorName: z.string().trim().max(120).optional(),
  settleAs: z.enum(['cash', 'credit']).default('cash'),
});

const exchangeRow = (row: any) => ({
  id: row.id,
  orderId: row.order_id || '',
  customerName: row.customer_name,
  customerPhone: row.customer_phone || '',
  returnLines: row.return_lines ?? [],
  outLines: row.out_lines ?? [],
  returnTotal: num(row.return_total),
  outTotal: num(row.out_total),
  cashDelta: num(row.cash_delta),
  creditId: row.credit_id || undefined,
  note: row.note || '',
  createdAt: row.created_at,
  operatorName: row.operator_name || '',
});

/** Produto devolvido volta para o estoque; o que sai na troca baixa do estoque (com kardex). */
async function moveExchangeStock(db: Db, storeId: string, line: z.infer<typeof exchangeLine>, direction: 1 | -1, exchangeId: string, operator: string, orderId: string) {
  if (!line.stockId) return;
  // Devolução sem a variação informada: vale a da venda original.
  let attributes = line.attributes ?? [];
  if (!attributes.length && direction > 0 && orderId) {
    const sold = (await db.query('SELECT attributes FROM sales_order_lines WHERE (sale_id = $1 OR order_id = $1) AND stock_id = $2 LIMIT 1', [orderId, line.stockId])).rows[0];
    if (Array.isArray(sold?.attributes)) attributes = sold.attributes.map((a: any) => ({ id: String(a.id), value: String(a.value) }));
  }
  const stock = (await db.query('SELECT qty, cost, name FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE', [line.stockId, storeId])).rows[0];
  if (!stock) throw httpError(`Produto não encontrado no estoque: ${line.name}`, 404);
  const prev = Number(stock.qty) || 0;
  if (direction < 0 && prev < line.qty) throw httpError(`Estoque insuficiente para "${stock.name}". Disponível: ${prev}.`, 409);
  try {
    await changeVariationQuantity(db as PoolClient, storeId, line.stockId, attributes, direction * line.qty);
  } catch (error) {
    if (!attributes.length) throw httpError(`Informe a cor/capacidade de "${stock.name}" na troca.`, 400);
    throw error;
  }
  const next = prev + direction * line.qty;
  await db.query('UPDATE stock_items SET qty = $3, updated_at = now() WHERE id = $1 AND store_id = $2', [line.stockId, storeId, next]);
  await db.query(
    `INSERT INTO stock_movements (id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes)
     VALUES ($1, $2, $3, $4, $5, $6::int, $7::int, $8, 'exchange', $9, $10, $11)`,
    [newId('MOV'), storeId, line.stockId, direction > 0 ? 'in' : 'out', line.qty, prev, next, Number(stock.cost) || 0, exchangeId, operator,
      direction > 0 ? `Devolução na troca ${exchangeId}` : `Saída na troca ${exchangeId}`],
  );
}

cashRouter.get('/api/v1/cash/exchanges', requireAuth, async (req, res, next) => {
  try {
    const rows = await pool.query('SELECT * FROM cash_exchanges WHERE store_id = $1 ORDER BY created_at DESC LIMIT 500', [req.storeId]);
    res.json({ success: true, data: rows.rows.map(exchangeRow) });
  } catch (error) {
    next(error);
  }
});

cashRouter.post('/api/v1/cash/exchanges', requireAuth, async (req, res, next) => {
  try {
    const body = exchangeSchema.parse(req.body);
    if (!body.returnLines.length && !body.outLines.length) throw httpError('Informe produtos de devolução e/ou saída.');
    const storeId = req.storeId!;
    const operator = operatorOf(req, body.operatorName);
    const data = await inTransaction(async (client) => {
      const session = await lockOpenSession(client, storeId);
      const id = newId('TRC');
      const returnTotal = num(body.returnLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));
      const outTotal = num(body.outLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));
      const cashDelta = num(outTotal - returnTotal);
      // Cliente com crédito a receber: vale (sem dinheiro saindo da gaveta) ou devolução em dinheiro.
      const useCredit = body.settleAs === 'credit' && cashDelta < 0;
      let creditId: string | null = null;
      if (useCredit) {
        const credit = await issueCredit(client, {
          storeId, customerName: body.customerName, customerPhone: body.customerPhone, amount: Math.abs(cashDelta),
          note: `Troca pedido ${body.orderId || '—'}`, operator, orderId: body.orderId || null, affectCash: false,
        });
        creditId = credit.id;
      } else if (cashDelta < 0 && session.expectedCash + cashDelta < -0.001) {
        throw httpError('Não há dinheiro suficiente no caixa para devolver a diferença. Use vale-compra.', 409);
      }
      for (const line of body.returnLines) await moveExchangeStock(client, storeId, line, 1, id, operator, body.orderId);
      for (const line of body.outLines) await moveExchangeStock(client, storeId, line, -1, id, operator, body.orderId);
      await client.query(
        `INSERT INTO cash_exchanges (id, store_id, order_id, customer_name, customer_phone, return_lines, out_lines, return_total, out_total, cash_delta, credit_id, session_id, note, operator_name)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::numeric, $9::numeric, $10::numeric, $11, $12, $13, $14)`,
        [id, storeId, body.orderId, body.customerName || 'Cliente', body.customerPhone, JSON.stringify(body.returnLines), JSON.stringify(body.outLines),
          returnTotal, outTotal, useCredit ? 0 : cashDelta, creditId, session.id, body.note, operator],
      );
      if (!useCredit && cashDelta !== 0) {
        await addEvent(client, {
          sessionId: session.id, storeId, kind: 'exchange', amount: cashDelta, cashAmount: cashDelta, operator, orderId: null,
          note: body.note || `Troca ${body.orderId || ''} · devolve ${returnTotal.toFixed(2)} · sai ${outTotal.toFixed(2)}`,
        });
        await moveCash(client, session.id, cashDelta);
      }
      return exchangeRow((await client.query('SELECT * FROM cash_exchanges WHERE id = $1', [id])).rows[0]);
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
