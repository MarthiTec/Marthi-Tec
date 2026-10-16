import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

/**
 * Tesouraria (movimentos entre contas, depósitos e saques) e adiantamentos de clientes e a
 * fornecedores. Tudo gravado no banco da loja; o saldo das contas acompanha cada movimento.
 */
export const financeBookRouter = Router();

type Db = Pick<PoolClient, 'query'>;
const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const newId = (prefix: string) => `${prefix}-${randomUUID()}`;
const money = (value: unknown) => Number(value) || 0;

async function assertAccounts(db: Db, storeId: string, ids: Array<string | null | undefined>) {
  for (const id of ids.filter((value): value is string => Boolean(value))) {
    if (!(await db.query('SELECT 1 FROM bank_accounts WHERE id = $1 AND store_id = $2', [id, storeId])).rows.length) {
      throw httpError('Conta bancária não encontrada nesta loja.', 400);
    }
  }
}

const moveBalance = (db: Db, storeId: string, accountId: string, delta: number) =>
  db.query('UPDATE bank_accounts SET current_balance = current_balance + $3, updated_at = now() WHERE id = $1 AND store_id = $2', [accountId, storeId, delta]);

/* ── Tesouraria ───────────────────────────────────────── */

const treasurySchema = z
  .object({
    kind: z.enum(['transfer', 'deposit', 'withdraw', 'adjustment']),
    fromAccountId: z.string().trim().optional().nullable(),
    toAccountId: z.string().trim().optional().nullable(),
    amount: z.coerce.number().positive('Informe um valor maior que zero.'),
    description: z.string().trim().max(300).default(''),
    at: z.string().optional(),
  })
  .refine((move) => {
    if (move.kind === 'transfer') return Boolean(move.fromAccountId && move.toAccountId && move.fromAccountId !== move.toAccountId);
    if (move.kind === 'deposit') return Boolean(move.toAccountId);
    if (move.kind === 'withdraw') return Boolean(move.fromAccountId);
    return Boolean(move.fromAccountId || move.toAccountId);
  }, 'Escolha as contas do movimento (transferência entre duas contas diferentes).');

const treasuryRow = (row: any) => ({
  id: row.id,
  kind: row.kind,
  fromAccountId: row.from_account_id ?? '',
  toAccountId: row.to_account_id ?? '',
  amount: money(row.amount),
  description: row.description ?? '',
  at: row.at,
});

financeBookRouter.get('/api/v1/finance/treasury', requireAuth, async (req, res, next) => {
  try {
    const rows = await pool.query('SELECT * FROM treasury_moves WHERE store_id = $1 ORDER BY at DESC', [req.storeId]);
    res.json({ success: true, data: rows.rows.map(treasuryRow) });
  } catch (error) {
    next(error);
  }
});

financeBookRouter.post('/api/v1/finance/treasury', requireAuth, async (req, res, next) => {
  const db = await pool.connect();
  try {
    const body = treasurySchema.parse(req.body);
    const storeId = req.storeId!;
    await db.query('BEGIN');
    await assertAccounts(db, storeId, [body.fromAccountId, body.toAccountId]);
    const row = (
      await db.query(
        `INSERT INTO treasury_moves (id, store_id, kind, from_account_id, to_account_id, amount, description, at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now())) RETURNING *`,
        [newId('TRS'), storeId, body.kind, body.fromAccountId || null, body.toAccountId || null, body.amount, body.description, body.at || null],
      )
    ).rows[0];
    if (body.fromAccountId) await moveBalance(db, storeId, body.fromAccountId, -body.amount);
    if (body.toAccountId) await moveBalance(db, storeId, body.toAccountId, body.amount);
    await db.query('COMMIT');
    res.status(201).json({ success: true, data: treasuryRow(row) });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    db.release();
  }
});

/* ── Adiantamentos ────────────────────────────────────── */

const advanceSchema = z.object({
  kind: z.enum(['customer', 'supplier']),
  partyName: z.string().trim().min(1, 'Informe o cliente ou fornecedor.').max(200),
  amount: z.coerce.number().positive('Informe um valor maior que zero.'),
  accountId: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(500).default(''),
});

const advanceRow = (row: any) => ({
  id: row.id,
  kind: row.kind,
  partyName: row.party_name,
  amount: money(row.amount),
  usedAmount: money(row.used_amount),
  accountId: row.account_id ?? '',
  notes: row.notes ?? '',
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Dinheiro do adiantamento no caixa: cliente entra, fornecedor sai (o estorno faz o contrário). */
async function recordAdvanceCash(db: Db, storeId: string, advance: any, amount: number, refund: boolean, operator: string) {
  const incoming = (advance.kind === 'customer') !== refund;
  const who = advance.kind === 'customer' ? 'cliente' : 'fornecedor';
  await db.query(
    `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, account_id, category, operator_name)
     VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7, 'Adiantamentos', $8)`,
    [newId('ENT'), storeId, incoming ? 'in' : 'out', `${refund ? 'Estorno de adiantamento' : 'Adiantamento'} de ${who}: ${advance.party_name}`, amount, advance.id, advance.account_id || null, operator],
  );
  if (advance.account_id) await moveBalance(db, storeId, advance.account_id, incoming ? amount : -amount);
}

async function lockAdvance(db: Db, storeId: string, id: string) {
  const advance = (await db.query('SELECT * FROM advance_payments WHERE id = $1 AND store_id = $2 FOR UPDATE', [id, storeId])).rows[0];
  if (!advance) throw httpError('Adiantamento não encontrado nesta loja.', 404);
  if (advance.status !== 'open') throw httpError('Adiantamento já utilizado ou estornado.', 409);
  return advance;
}

financeBookRouter.get('/api/v1/finance/advances', requireAuth, async (req, res, next) => {
  try {
    const rows = await pool.query('SELECT * FROM advance_payments WHERE store_id = $1 ORDER BY created_at DESC', [req.storeId]);
    res.json({ success: true, data: rows.rows.map(advanceRow) });
  } catch (error) {
    next(error);
  }
});

financeBookRouter.post('/api/v1/finance/advances', requireAuth, async (req, res, next) => {
  const db = await pool.connect();
  try {
    const body = advanceSchema.parse(req.body);
    const storeId = req.storeId!;
    await db.query('BEGIN');
    await assertAccounts(db, storeId, [body.accountId]);
    const advance = (
      await db.query(
        `INSERT INTO advance_payments (id, store_id, kind, party_name, amount, used_amount, account_id, notes, status)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7, 'open') RETURNING *`,
        [newId('ADV'), storeId, body.kind, body.partyName, body.amount, body.accountId || null, body.notes],
      )
    ).rows[0];
    await recordAdvanceCash(db, storeId, advance, body.amount, false, req.user?.name || 'Operador');
    await db.query('COMMIT');
    res.status(201).json({ success: true, data: advanceRow(advance) });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    db.release();
  }
});

/** Abate parte (ou todo) o adiantamento numa venda ou conta; sem novo movimento de caixa. */
financeBookRouter.post('/api/v1/finance/advances/:id/apply', requireAuth, async (req, res, next) => {
  const db = await pool.connect();
  try {
    const { amount } = z.object({ amount: z.coerce.number().positive('Informe um valor maior que zero.') }).parse(req.body);
    await db.query('BEGIN');
    const advance = await lockAdvance(db, req.storeId!, req.params.id);
    const remaining = money(advance.amount) - money(advance.used_amount);
    if (amount > remaining + 0.001) throw httpError(`Saldo do adiantamento: R$ ${remaining.toFixed(2)}.`, 422);
    const used = Math.round((money(advance.used_amount) + amount) * 100) / 100;
    const row = (
      await db.query('UPDATE advance_payments SET used_amount = $2, status = $3, updated_at = now() WHERE id = $1 RETURNING *', [advance.id, used, used >= money(advance.amount) - 0.001 ? 'applied' : 'open'])
    ).rows[0];
    await db.query('COMMIT');
    res.json({ success: true, data: advanceRow(row) });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    db.release();
  }
});

/** Devolve o saldo não utilizado: o dinheiro faz o caminho inverso no caixa. */
financeBookRouter.post('/api/v1/finance/advances/:id/refund', requireAuth, async (req, res, next) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const advance = await lockAdvance(db, req.storeId!, req.params.id);
    const remaining = Math.round((money(advance.amount) - money(advance.used_amount)) * 100) / 100;
    if (remaining > 0) await recordAdvanceCash(db, req.storeId!, advance, remaining, true, req.user?.name || 'Operador');
    const row = (await db.query("UPDATE advance_payments SET status = 'refunded', updated_at = now() WHERE id = $1 RETURNING *", [advance.id])).rows[0];
    await db.query('COMMIT');
    res.json({ success: true, data: advanceRow(row) });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    db.release();
  }
});

/* ── DRE do mês (regime de caixa) ─────────────────────── */

/**
 * Receitas e despesas do mês pelos lançamentos do caixa, por categoria. Cada recebimento e cada
 * pagamento já gera o seu lançamento, então contas baixadas não são somadas de novo.
 */
financeBookRouter.get('/api/v1/finance/dre', requireAuth, async (req, res, next) => {
  try {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Mês inválido (AAAA-MM).').optional() }).parse(req.query);
    const period = month ?? (await pool.query("SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS month")).rows[0].month;
    const rows = (
      await pool.query(
        `SELECT type, COALESCE(NULLIF(category, ''), 'Sem categoria') AS category, sum(amount) AS total
           FROM finance_entries
          WHERE store_id = $1 AND to_char(created_at::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $2
          GROUP BY 1, 2 ORDER BY 3 DESC`,
        [req.storeId, period],
      )
    ).rows;
    const lines = (type: string, prefix: string, kind: 'revenue' | 'expense') =>
      rows.filter((row) => row.type === type).map((row) => ({ label: `${prefix} · ${row.category}`, amount: money(row.total), kind }));
    const revenue = rows.filter((row) => row.type === 'in').reduce((sum, row) => sum + money(row.total), 0);
    const expenses = rows.filter((row) => row.type === 'out').reduce((sum, row) => sum + money(row.total), 0);
    const result = Math.round((revenue - expenses) * 100) / 100;
    res.json({
      success: true,
      data: {
        month: period,
        revenue,
        expenses,
        result,
        lines: [
          ...lines('in', 'Receita', 'revenue'),
          { label: 'Receita bruta', amount: revenue, kind: 'total' },
          ...lines('out', 'Despesa', 'expense'),
          { label: 'Despesas totais', amount: expenses, kind: 'total' },
          { label: 'Resultado do período', amount: result, kind: 'total' },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ── Movimentos de uma conta (baixas no caixa) ─────────── */

/** Lançamentos do caixa ligados a uma conta a pagar/receber: as baixas que ela já teve. */
financeBookRouter.get('/api/v1/finance/movements', requireAuth, async (req, res, next) => {
  try {
    const { refId } = z.object({ refId: z.string().trim().min(1).max(120) }).parse(req.query);
    const rows = (
      await pool.query(
        `SELECT id, type, label, amount, account_id, category, operator_name, created_at
           FROM finance_entries WHERE store_id = $1 AND ref_id = $2 ORDER BY created_at`,
        [req.storeId, refId],
      )
    ).rows;
    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        label: row.label,
        amount: money(row.amount),
        accountId: row.account_id ?? '',
        category: row.category,
        operator: row.operator_name,
        at: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});
