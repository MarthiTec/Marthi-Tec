import {rowToClient} from '../services/rowMapper.js';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const financeRouter = Router();

// Reject references to records belonging to a different store before any mutation.
financeRouter.use('/api/v1/finance',requireAuth,async(req,_res,next)=>{
 try {
  if(!['POST','PUT','PATCH'].includes(req.method)){next();return;}
  for(const [field,table] of [['accountId','bank_accounts'],['supplierId','suppliers'],['customerId','customers'],['invoiceId','stock_invoices']] as const){
   const id=req.body?.[field];if(id==null||id==='')continue;
   if(typeof id!=='string'||!(await pool.query(`SELECT id FROM ${table} WHERE id=$1 AND store_id=$2`,[id,req.storeId])).rows.length)throw Object.assign(new Error('Registro vinculado não disponível nesta loja.'),{status:400});
  }
  next();
 }catch(error){next(error);}
});

// Linked commercial balances follow the order ledger to avoid duplicate settlements.
financeRouter.use('/api/v1/finance/receivables/:id', requireAuth, async (req, _res, next) => {
  if (req.method === 'GET') { next(); return; }
  try {
    const linked = await pool.query('SELECT id FROM commercial_orders WHERE receivable_id=$1 AND store_id=$2 LIMIT 1', [req.params.id, req.storeId]);
    if (linked.rows[0]) throw Object.assign(new Error('Registre pagamentos, reavaliações e devoluções pela encomenda vinculada.'), {status:409});
    next();
  } catch (error) { next(error); }
});


/* ── Schemas ───────────────────────────────────────────── */

const payableSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1, 'Descrição é obrigatória.'),
  supplierId: z.string().optional().nullable(),
  supplierName: z.string().default(''),
  category: z.string().default('Geral'),
  amount: z.coerce.number().min(0.01, 'Valor deve ser maior que zero.'),
  dueDate: z.string().min(4, 'Data de vencimento é obrigatória.'),
  accountId: z.string().optional().nullable(),
  notes: z.string().default(''),
  documentNumber: z.string().optional().default(''),
  invoiceId: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().default(''),
  invoiceType: z.string().optional().default(''),
});

const receivableSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1, 'Descrição é obrigatória.'),
  customerId: z.string().optional().nullable(),
  customerName: z.string().default(''),
  category: z.string().default('Vendas'),
  amount: z.coerce.number().min(0.01, 'Valor deve ser maior que zero.'),
  dueDate: z.string().min(4, 'Data de vencimento é obrigatória.'),
  accountId: z.string().optional().nullable(),
  notes: z.string().default(''),
  documentNumber: z.string().optional().default(''),
  invoiceId: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().default(''),
  invoiceType: z.string().optional().default(''),
});

const settleBillSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Valor da baixa deve ser maior que zero.').optional(),
  interestAmount: z.coerce.number().min(0).default(0).optional(),
  fineAmount: z.coerce.number().min(0).default(0).optional(),
  discountAmount: z.coerce.number().min(0).default(0).optional(),
  paymentDate: z.string().optional(),
  accountId: z.string().optional().nullable(),
  documentNumber: z.string().optional().default(''),
  invoiceId: z.string().optional().nullable(),
  invoiceNumber: z.string().optional().default(''),
  invoiceType: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

const bankAccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome da conta é obrigatório.'),
  bank: z.string().default(''),
  agency: z.string().default(''),
  number: z.string().default(''),
  type: z.enum(['checking', 'savings', 'cash', 'digital']).default('checking'),
  initialBalance: z.coerce.number().default(0),
  active: z.boolean().default(true),
});

const manualEntrySchema = z.object({
  type: z.enum(['in', 'out']),
  amount: z.coerce.number().min(0.01, 'Valor deve ser maior que zero.'),
  label: z.string().min(1, 'Identificação é obrigatória.'),
  category: z.string().default('Operacional'),
  accountId: z.string().optional().nullable(),
});

/* ── In-Memory Fallbacks ────────────────────────────────── */

const memoryPayables = new Map<string, any>();
const memoryReceivables = new Map<string, any>();
const memoryAccounts = new Map<string, any>();
const memoryEntries = new Map<string, any>();

/* ── 1. Contas Bancárias & Tesouraria ──────────────────── */

financeRouter.get('/api/v1/finance/accounts', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;

    if (pool) {
      const result = await pool.query(
        `SELECT id, name, bank, agency, number, type, initial_balance, current_balance, active, created_at
         FROM bank_accounts
         WHERE store_id = $1 AND active = true
         ORDER BY name ASC`,
        [storeId],
      );
      res.json({
        success: true,
        data: result.rows.map((r) => ({
          id: r.id,
          name: r.name,
          bank: r.bank || '',
          agency: r.agency || '',
          number: r.number || '',
          type: r.type,
          initialBalance: Number(r.initial_balance) || 0,
          currentBalance: Number(r.current_balance) || 0,
          active: Boolean(r.active),
          createdAt: r.created_at,
        })),
      });
      return;
    }

    const items = Array.from(memoryAccounts.values()).filter((a) => a.storeId === storeId);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/api/v1/finance/accounts', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = bankAccountSchema.parse(req.body);
    const id = body.id || `ACC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      await pool.query(
        `INSERT INTO bank_accounts (id, store_id, name, bank, agency, number, type, initial_balance, current_balance, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)`,
        [id, storeId, body.name.trim(), body.bank.trim(), body.agency.trim(), body.number.trim(), body.type, body.initialBalance, body.active],
      );
      const resQuery = await pool.query(`SELECT * FROM bank_accounts WHERE id = $1 AND store_id = $2`, [id, storeId]);
      const r = resQuery.rows[0];
      res.status(201).json({
        success: true,
        data: {
          id: r.id,
          name: r.name,
          bank: r.bank || '',
          agency: r.agency || '',
          number: r.number || '',
          type: r.type,
          initialBalance: Number(r.initial_balance) || 0,
          currentBalance: Number(r.current_balance) || 0,
          active: Boolean(r.active),
          createdAt: r.created_at,
        },
      });
      return;
    }

    const record = {
      id,
      storeId,
      ...body,
      currentBalance: body.initialBalance,
      createdAt: new Date().toISOString(),
    };
    memoryAccounts.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

financeRouter.patch('/api/v1/finance/accounts/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = bankAccountSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE bank_accounts
         SET name = COALESCE($1, name), bank = COALESCE($2, bank), agency = COALESCE($3, agency),
             number = COALESCE($4, number), type = COALESCE($5, type), active = COALESCE($6, active), updated_at = now()
         WHERE id = $7 AND store_id = $8`,
        [body.name, body.bank, body.agency, body.number, body.type, body.active, id, storeId],
      );
      const updated = await pool.query(`SELECT * FROM bank_accounts WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: rowToClient(updated.rows[0]) });
      return;
    }

    const curr = memoryAccounts.get(id);
    if (!curr || curr.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Conta não encontrada.' } });
      return;
    }
    const updated = { ...curr, ...body };
    memoryAccounts.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/* ── 2. Contas a Pagar (Payables) ───────────────────────── */

financeRouter.get('/api/v1/finance/payables', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;

    if (pool) {
      const result = await pool.query(
        `SELECT id, description, supplier_id, supplier_name, category, amount, paid_amount,
                due_date, status, account_id, paid_at, notes, document_number, interest_amount,
                fine_amount, discount_amount, invoice_id, invoice_number, invoice_type, created_at, updated_at
         FROM payables
         WHERE store_id = $1
         ORDER BY due_date ASC`,
        [storeId],
      );
      res.json({
        success: true,
        data: result.rows.map((r) => ({
          id: r.id,
          description: r.description,
          supplierId: r.supplier_id || undefined,
          supplierName: r.supplier_name || '',
          category: r.category || 'Geral',
          amount: Number(r.amount) || 0,
          paidAmount: Number(r.paid_amount) || 0,
          dueDate: r.due_date,
          status: r.status,
          accountId: r.account_id || undefined,
          paidAt: r.paid_at || undefined,
          notes: r.notes || '',
          documentNumber: r.document_number || '',
          interestAmount: Number(r.interest_amount) || 0,
          fineAmount: Number(r.fine_amount) || 0,
          discountAmount: Number(r.discount_amount) || 0,
          invoiceId: r.invoice_id || undefined,
          invoiceNumber: r.invoice_number || '',
          invoiceType: r.invoice_type || undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
      return;
    }

    const items = Array.from(memoryPayables.values()).filter((p) => p.storeId === storeId);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/api/v1/finance/payables', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = payableSchema.parse(req.body);
    const id = body.id || `PAG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      await pool.query(
        `INSERT INTO payables (
          id, store_id, description, supplier_id, supplier_name, category, amount,
          paid_amount, due_date, status, account_id, notes, document_number,
          interest_amount, fine_amount, discount_amount, invoice_id, invoice_number, invoice_type,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, 'open', $9, $10, $11, 0, 0, 0, $12, $13, $14, now(), now())`,
        [
          id,
          storeId,
          body.description.trim(),
          body.supplierId || null,
          body.supplierName.trim(),
          body.category.trim(),
          body.amount,
          body.dueDate,
          body.accountId || null,
          body.notes.trim(),
          body.documentNumber || '',
          body.invoiceId || null,
          body.invoiceNumber || '',
          body.invoiceType || '',
        ],
      );
      const resQuery = await pool.query(`SELECT * FROM payables WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.status(201).json({ success: true, data: rowToClient(resQuery.rows[0]) });
      return;
    }

    const record = {
      id,
      storeId,
      ...body,
      status: 'open',
      paidAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryPayables.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

financeRouter.patch('/api/v1/finance/payables/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = payableSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE payables
         SET description = COALESCE($1, description), supplier_id = COALESCE($2, supplier_id),
             supplier_name = COALESCE($3, supplier_name), category = COALESCE($4, category),
             amount = COALESCE($5, amount), due_date = COALESCE($6, due_date),
             account_id = COALESCE($7, account_id), notes = COALESCE($8, notes),
             document_number = COALESCE($9, document_number), invoice_id = COALESCE($10, invoice_id),
             invoice_number = COALESCE($11, invoice_number), invoice_type = COALESCE($12, invoice_type),
             updated_at = now()
         WHERE id = $13 AND store_id = $14`,
        [
          body.description,
          body.supplierId,
          body.supplierName,
          body.category,
          body.amount,
          body.dueDate,
          body.accountId,
          body.notes,
          body.documentNumber,
          body.invoiceId,
          body.invoiceNumber,
          body.invoiceType,
          id,
          storeId,
        ],
      );
      const updated = await pool.query(`SELECT * FROM payables WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: rowToClient(updated.rows[0]) });
      return;
    }

    const curr = memoryPayables.get(id);
    if (!curr || curr.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Conta a pagar não encontrada.' } });
      return;
    }
    const updated = { ...curr, ...body, updatedAt: new Date().toISOString() };
    memoryPayables.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * Baixar conta a pagar (com movimentação atômica, juros, multa, desconto, pagamento parcial e vínculo fiscal)
 */
financeRouter.post(['/api/v1/finance/payables/:id/pay', '/api/v1/finance/payables/:id/settle'], requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = settleBillSchema.parse(req.body || {});
    const paidAt = body.paymentDate || new Date().toISOString();

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const currentRes = await client.query(`SELECT * FROM payables WHERE id = $1 AND store_id = $2 FOR UPDATE`, [id, storeId]);
        if (currentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ success: false, error: { message: 'Conta a pagar não encontrada.' } });
          return;
        }

        const curr = currentRes.rows[0];
        if (curr.status === 'paid' || curr.status === 'cancelled') throw Object.assign(new Error('Conta já liquidada ou cancelada.'), { status: 409 });
        const totalAmount = Number(curr.amount) || 0;
        const currentPaid = Number(curr.paid_amount) || 0;
        const remaining = Math.max(0, totalAmount - currentPaid);
        const payAmount = body.amount && body.amount > 0 ? Math.min(body.amount, remaining) : remaining;

        const interest = Number(body.interestAmount) || 0;
        const fine = Number(body.fineAmount) || 0;
        const discount = Number(body.discountAmount) || 0;
        if (discount > payAmount + interest + fine) throw Object.assign(new Error('Desconto superior ao pagamento.'), { status: 400 });
        const netAmount = Math.round((payAmount + interest + fine - discount) * 100) / 100;

        const newPaidAmount = currentPaid + payAmount;
        const isFullyPaid = newPaidAmount >= totalAmount - 0.001;
        const nextStatus = isFullyPaid ? 'paid' : 'partial';

        const accountId = body.accountId || curr.account_id;
        const docNum = body.documentNumber || curr.document_number || '';
        const invId = body.invoiceId || curr.invoice_id;
        const invNum = body.invoiceNumber || curr.invoice_number || '';

        await client.query(
          `UPDATE payables
           SET status = $1, paid_amount = $2, paid_at = $3, updated_at = now(),
               interest_amount = COALESCE(interest_amount, 0) + $4,
               fine_amount = COALESCE(fine_amount, 0) + $5,
               discount_amount = COALESCE(discount_amount, 0) + $6,
               account_id = COALESCE($7, account_id),
               document_number = COALESCE(NULLIF($8, ''), document_number),
               invoice_id = COALESCE($9, invoice_id),
               invoice_number = COALESCE(NULLIF($10, ''), invoice_number)
           WHERE id = $11`,
          [nextStatus, newPaidAmount, paidAt, interest, fine, discount, accountId, docNum, invId, invNum, id],
        );

        // Registra saída líquida no livro caixa
        const entryId = `ENT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const noteParts = [
          `Baixa ${isFullyPaid ? 'total' : 'parcial'}: ${curr.description}`,
          docNum ? `Doc: ${docNum}` : null,
          invNum ? `NF: ${invNum}` : null,
          interest ? `+Juros R$ ${interest.toFixed(2)}` : null,
          fine ? `+Multa R$ ${fine.toFixed(2)}` : null,
          discount ? `-Desc R$ ${discount.toFixed(2)}` : null,
        ].filter(Boolean).join(' · ');

        await client.query(
          `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, account_id, category, operator_name)
           VALUES ($1, $2, 'out', $3, $4, 'manual', $5, $6, $7, $8)`,
          [entryId, storeId, noteParts, netAmount, id, accountId, curr.category, req.user?.name || 'Operador'],
        );

        // Debita da conta bancária se vinculada
        if (accountId) {
          await client.query(
            `UPDATE bank_accounts SET current_balance = current_balance - $1 WHERE id = $2 AND store_id = $3`,
            [netAmount, accountId, storeId],
          );
        }

        await client.query('COMMIT');

        const updated = await pool.query(`SELECT * FROM payables WHERE id = $1 AND store_id = $2`, [id, storeId]);
        res.json({ success: true, data: rowToClient(updated.rows[0]) });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const curr = memoryPayables.get(id);
    if (!curr || curr.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Conta não encontrada.' } });
      return;
    }
    const payAmount = body.amount && body.amount > 0 ? body.amount : (curr.amount - curr.paidAmount);
    curr.paidAmount = (curr.paidAmount || 0) + payAmount;
    curr.status = curr.paidAmount >= curr.amount - 0.001 ? 'paid' : 'partial';
    curr.paidAt = paidAt;
    curr.documentNumber = body.documentNumber || curr.documentNumber;
    curr.invoiceId = body.invoiceId || curr.invoiceId;
    curr.invoiceNumber = body.invoiceNumber || curr.invoiceNumber;
    res.json({ success: true, data: curr });
  } catch (error) {
    next(error);
  }
});

/**
 * Estornar pagamento de conta a pagar (suporta /revert e /reverse)
 */
financeRouter.post(['/api/v1/finance/payables/:id/revert', '/api/v1/finance/payables/:id/reverse'], requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const currentRes = await client.query(`SELECT * FROM payables WHERE id = $1 AND store_id = $2 FOR UPDATE`, [id, storeId]);
        if (currentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ success: false, error: { message: 'Conta a pagar não encontrada.' } });
          return;
        }

        const curr = currentRes.rows[0];
        const entries = await client.query('SELECT account_id, amount, type FROM finance_entries WHERE ref_id = $1 AND store_id = $2 FOR UPDATE', [id, storeId]);
        if (!entries.rows.length && Number(curr.paid_amount) === 0) throw Object.assign(new Error('Conta sem pagamento para estornar.'), { status: 409 });

        await client.query(
          `UPDATE payables SET status = 'open', paid_amount = 0, paid_at = null, interest_amount = 0, fine_amount = 0, discount_amount = 0, updated_at = now() WHERE id = $1`,
          [id],
        );

        for (const entry of entries.rows) {
          if (entry.account_id) await client.query('UPDATE bank_accounts SET current_balance = current_balance + $1 WHERE id = $2 AND store_id = $3', [entry.type === 'out' ? Number(entry.amount) : -Number(entry.amount), entry.account_id, storeId]);
        }

        // Remove ou estorna lançamento
        await client.query(`DELETE FROM finance_entries WHERE ref_id = $1 AND store_id = $2`, [id, storeId]);

        await client.query('COMMIT');

        const updated = await pool.query(`SELECT * FROM payables WHERE id = $1 AND store_id = $2`, [id, storeId]);
        res.json({ success: true, data: rowToClient(updated.rows[0]) });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const curr = memoryPayables.get(id);
    if (!curr) return res.status(404).json({ success: false });
    curr.status = 'open';
    curr.paidAmount = 0;
    curr.paidAt = undefined;
    res.json({ success: true, data: curr });
  } catch (error) {
    next(error);
  }
});

financeRouter.delete('/api/v1/finance/payables/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    if (pool) {
      await pool.query(`DELETE FROM payables WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ok: true } });
      return;
    }
    memoryPayables.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── 3. Contas a Receber (Receivables) ──────────────────── */

financeRouter.get('/api/v1/finance/receivables', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;

    if (pool) {
      const result = await pool.query(
        `SELECT id, description, customer_id, customer_name, category, amount, received_amount,
                due_date, status, account_id, received_at, notes, document_number, interest_amount,
                fine_amount, discount_amount, invoice_id, invoice_number, invoice_type, created_at, updated_at
         FROM receivables
         WHERE store_id = $1
         ORDER BY due_date ASC`,
        [storeId],
      );
      res.json({
        success: true,
        data: result.rows.map((r) => ({
          id: r.id,
          description: r.description,
          customerId: r.customer_id || undefined,
          customerName: r.customer_name || '',
          category: r.category || 'Vendas',
          amount: Number(r.amount) || 0,
          receivedAmount: Number(r.received_amount) || 0,
          dueDate: r.due_date,
          status: r.status,
          accountId: r.account_id || undefined,
          receivedAt: r.received_at || undefined,
          notes: r.notes || '',
          documentNumber: r.document_number || '',
          interestAmount: Number(r.interest_amount) || 0,
          fineAmount: Number(r.fine_amount) || 0,
          discountAmount: Number(r.discount_amount) || 0,
          invoiceId: r.invoice_id || undefined,
          invoiceNumber: r.invoice_number || '',
          invoiceType: r.invoice_type || undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
      return;
    }

    const items = Array.from(memoryReceivables.values()).filter((p) => p.storeId === storeId);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/api/v1/finance/receivables', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = receivableSchema.parse(req.body);
    const id = body.id || `REC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      await pool.query(
        `INSERT INTO receivables (
          id, store_id, description, customer_id, customer_name, category, amount,
          received_amount, due_date, status, account_id, notes, document_number,
          interest_amount, fine_amount, discount_amount, invoice_id, invoice_number, invoice_type,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, 'open', $9, $10, $11, 0, 0, 0, $12, $13, $14, now(), now())`,
        [
          id,
          storeId,
          body.description.trim(),
          body.customerId || null,
          body.customerName.trim(),
          body.category.trim(),
          body.amount,
          body.dueDate,
          body.accountId || null,
          body.notes.trim(),
          body.documentNumber || '',
          body.invoiceId || null,
          body.invoiceNumber || '',
          body.invoiceType || '',
        ],
      );
      const resQuery = await pool.query(`SELECT * FROM receivables WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.status(201).json({ success: true, data: rowToClient(resQuery.rows[0]) });
      return;
    }

    const record = {
      id,
      storeId,
      ...body,
      status: 'open',
      receivedAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryReceivables.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

financeRouter.patch('/api/v1/finance/receivables/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = receivableSchema.partial().parse(req.body);

    if (pool) {
      await pool.query(
        `UPDATE receivables
         SET description = COALESCE($1, description), customer_id = COALESCE($2, customer_id),
             customer_name = COALESCE($3, customer_name), category = COALESCE($4, category),
             amount = COALESCE($5, amount), due_date = COALESCE($6, due_date),
             account_id = COALESCE($7, account_id), notes = COALESCE($8, notes),
             document_number = COALESCE($9, document_number), invoice_id = COALESCE($10, invoice_id),
             invoice_number = COALESCE($11, invoice_number), invoice_type = COALESCE($12, invoice_type),
             updated_at = now()
         WHERE id = $13 AND store_id = $14`,
        [
          body.description,
          body.customerId,
          body.customerName,
          body.category,
          body.amount,
          body.dueDate,
          body.accountId,
          body.notes,
          body.documentNumber,
          body.invoiceId,
          body.invoiceNumber,
          body.invoiceType,
          id,
          storeId,
        ],
      );
      const updated = await pool.query(`SELECT * FROM receivables WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: rowToClient(updated.rows[0]) });
      return;
    }

    const curr = memoryReceivables.get(id);
    if (!curr || curr.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Conta a receber não encontrada.' } });
      return;
    }
    const updated = { ...curr, ...body, updatedAt: new Date().toISOString() };
    memoryReceivables.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * Baixar conta a receber (com movimentação atômica, juros, multa, desconto, recebimento parcial e vínculo fiscal)
 */
financeRouter.post(['/api/v1/finance/receivables/:id/receive', '/api/v1/finance/receivables/:id/settle'], requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = settleBillSchema.parse(req.body || {});
    const receivedAt = body.paymentDate || new Date().toISOString();

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const currentRes = await client.query(`SELECT * FROM receivables WHERE id = $1 AND store_id = $2 FOR UPDATE`, [id, storeId]);
        if (currentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ success: false, error: { message: 'Conta a receber não encontrada.' } });
          return;
        }

        const curr = currentRes.rows[0];
        if (curr.status === 'paid' || curr.status === 'cancelled') throw Object.assign(new Error('Conta já liquidada ou cancelada.'), { status: 409 });
        const totalAmount = Number(curr.amount) || 0;
        const currentReceived = Number(curr.received_amount) || 0;
        const remaining = Math.max(0, totalAmount - currentReceived);
        const receiveAmount = body.amount && body.amount > 0 ? Math.min(body.amount, remaining) : remaining;

        const interest = Number(body.interestAmount) || 0;
        const fine = Number(body.fineAmount) || 0;
        const discount = Number(body.discountAmount) || 0;
        const netAmount = Math.max(0, receiveAmount + interest + fine - discount);

        const newReceivedAmount = currentReceived + receiveAmount;
        const isFullyReceived = newReceivedAmount >= totalAmount - 0.001;
        const nextStatus = isFullyReceived ? 'paid' : 'partial';

        const accountId = body.accountId || curr.account_id;
        const docNum = body.documentNumber || curr.document_number || '';
        const invId = body.invoiceId || curr.invoice_id;
        const invNum = body.invoiceNumber || curr.invoice_number || '';

        await client.query(
          `UPDATE receivables
           SET status = $1, received_amount = $2, received_at = $3, updated_at = now(),
               interest_amount = COALESCE(interest_amount, 0) + $4,
               fine_amount = COALESCE(fine_amount, 0) + $5,
               discount_amount = COALESCE(discount_amount, 0) + $6,
               account_id = COALESCE($7, account_id),
               document_number = COALESCE(NULLIF($8, ''), document_number),
               invoice_id = COALESCE($9, invoice_id),
               invoice_number = COALESCE(NULLIF($10, ''), invoice_number)
           WHERE id = $11`,
          [nextStatus, newReceivedAmount, receivedAt, interest, fine, discount, accountId, docNum, invId, invNum, id],
        );

        // Registra entrada líquida no livro caixa
        const entryId = `ENT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const noteParts = [
          `Recebimento ${isFullyReceived ? 'total' : 'parcial'}: ${curr.description}`,
          docNum ? `Doc: ${docNum}` : null,
          invNum ? `NF: ${invNum}` : null,
          interest ? `+Juros R$ ${interest.toFixed(2)}` : null,
          fine ? `+Multa R$ ${fine.toFixed(2)}` : null,
          discount ? `-Desc R$ ${discount.toFixed(2)}` : null,
        ].filter(Boolean).join(' · ');

        await client.query(
          `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, account_id, category, operator_name)
           VALUES ($1, $2, 'in', $3, $4, 'manual', $5, $6, $7, $8)`,
          [entryId, storeId, noteParts, netAmount, id, accountId, curr.category, req.user?.name || 'Operador'],
        );

        // Credita na conta bancária se vinculada
        if (accountId) {
          await client.query(
            `UPDATE bank_accounts SET current_balance = current_balance + $1 WHERE id = $2 AND store_id = $3`,
            [netAmount, accountId, storeId],
          );
        }

        await client.query('COMMIT');

        const updated = await pool.query(`SELECT * FROM receivables WHERE id = $1 AND store_id = $2`, [id, storeId]);
        res.json({ success: true, data: rowToClient(updated.rows[0]) });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const curr = memoryReceivables.get(id);
    if (!curr || curr.storeId !== storeId) return res.status(404).json({ success: false });
    const receiveAmount = body.amount && body.amount > 0 ? body.amount : (curr.amount - curr.receivedAmount);
    curr.receivedAmount = (curr.receivedAmount || 0) + receiveAmount;
    curr.status = curr.receivedAmount >= curr.amount - 0.001 ? 'paid' : 'partial';
    curr.receivedAt = receivedAt;
    curr.documentNumber = body.documentNumber || curr.documentNumber;
    curr.invoiceId = body.invoiceId || curr.invoiceId;
    curr.invoiceNumber = body.invoiceNumber || curr.invoiceNumber;
    res.json({ success: true, data: curr });
  } catch (error) {
    next(error);
  }
});

/**
 * Estornar recebimento (suporta /revert e /reverse)
 */
financeRouter.post(['/api/v1/finance/receivables/:id/revert', '/api/v1/finance/receivables/:id/reverse'], requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const currentRes = await client.query(`SELECT * FROM receivables WHERE id = $1 AND store_id = $2 FOR UPDATE`, [id, storeId]);
        if (currentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ success: false, error: { message: 'Conta a receber não encontrada.' } });
          return;
        }

        const curr = currentRes.rows[0];
        const entries = await client.query('SELECT account_id, amount, type FROM finance_entries WHERE ref_id = $1 AND store_id = $2 FOR UPDATE', [id, storeId]);
        if (!entries.rows.length && Number(curr.received_amount) === 0) throw Object.assign(new Error('Conta sem pagamento para estornar.'), { status: 409 });

        await client.query(
          `UPDATE receivables SET status = 'open', received_amount = 0, received_at = null, interest_amount = 0, fine_amount = 0, discount_amount = 0, updated_at = now() WHERE id = $1`,
          [id],
        );

        for (const entry of entries.rows) {
          if (entry.account_id) await client.query('UPDATE bank_accounts SET current_balance = current_balance + $1 WHERE id = $2 AND store_id = $3', [entry.type === 'out' ? Number(entry.amount) : -Number(entry.amount), entry.account_id, storeId]);
        }

        await client.query(`DELETE FROM finance_entries WHERE ref_id = $1 AND store_id = $2`, [id, storeId]);

        await client.query('COMMIT');

        const updated = await pool.query(`SELECT * FROM receivables WHERE id = $1 AND store_id = $2`, [id, storeId]);
        res.json({ success: true, data: rowToClient(updated.rows[0]) });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const curr = memoryReceivables.get(id);
    if (!curr) return res.status(404).json({ success: false });
    curr.status = 'open';
    curr.receivedAmount = 0;
    curr.receivedAt = undefined;
    res.json({ success: true, data: curr });
  } catch (error) {
    next(error);
  }
});

financeRouter.delete('/api/v1/finance/receivables/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    if (pool) {
      await pool.query(`DELETE FROM receivables WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ok: true } });
      return;
    }
    memoryReceivables.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── 4. Fluxo de Caixa Geral (Finance Entries) ──────────── */

financeRouter.get('/api/v1/finance', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const { source, from, to } = req.query;

    if (pool) {
      const conditions = ['store_id = $1'];
      const values: any[] = [storeId];
      let pIdx = 2;

      if (source && typeof source === 'string') {
        conditions.push(`source = $${pIdx++}`);
        values.push(source);
      }
      if (from && typeof from === 'string') {
        conditions.push(`created_at >= $${pIdx++}`);
        values.push(from);
      }
      if (to && typeof to === 'string') {
        conditions.push(`created_at <= $${pIdx++}`);
        values.push(to);
      }

      const sql = `SELECT * FROM finance_entries WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 500`;
      const result = await pool.query(sql, values);
      res.json({
        success: true,
        data: result.rows.map((r) => ({
          id: r.id,
          type: r.type,
          label: r.label,
          amount: Number(r.amount) || 0,
          source: r.source,
          refId: r.ref_id || undefined,
          accountId: r.account_id || undefined,
          category: r.category || 'Operacional',
          operatorName: r.operator_name || '',
          createdAt: r.created_at,
        })),
      });
      return;
    }

    const items = Array.from(memoryEntries.values()).filter((e) => e.storeId === storeId);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/api/v1/finance', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = manualEntrySchema.parse(req.body);
    const id = `ENT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO finance_entries (id, store_id, type, label, amount, source, account_id, category, operator_name)
           VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7, $8)`,
          [id, storeId, body.type, body.label.trim(), body.amount, body.accountId || null, body.category.trim(), req.user?.name || 'Operador'],
        );

        if (body.accountId) {
          const delta = body.type === 'in' ? body.amount : -body.amount;
          await client.query(
            `UPDATE bank_accounts SET current_balance = current_balance + $1 WHERE id = $2 AND store_id = $3`,
            [delta, body.accountId, storeId],
          );
        }

        await client.query('COMMIT');

        const createdRes = await pool.query(`SELECT * FROM finance_entries WHERE id = $1 AND store_id = $2`, [id, storeId]);
        res.status(201).json({ success: true, data: rowToClient(createdRes.rows[0]) });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const record = { id, storeId, ...body, source: 'manual', createdAt: new Date().toISOString() };
    memoryEntries.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

/* ── 5. Recolhimento de Valores em Espécie (Gilvan Teodo) ──── */

const pickupSchema = z.object({
  responsibleName: z.string().min(1, 'Nome do responsável é obrigatório.').default('Gilvan Teodo'),
  amount: z.coerce.number().min(0.01, 'Valor de recolhimento deve ser positivo.'),
  origin: z.string().default('vendas_externas'),
  paymentMethod: z.string().default('dinheiro'),
  pickupDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  notes: z.string().default(''),
});

financeRouter.get('/api/v1/finance/pickups', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    if (!pool) {
      res.json({ success: true, data: { pendingCashBalance: 0, pickups: [] } });
      return;
    }

    // 1. Saldo físico de vendas em dinheiro ainda não recolhidas
    const pendingRes = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0)::numeric as pending_total
       FROM sales_orders
       WHERE store_id = $1 AND external_cash_status = 'pending_pickup' AND status = 'completed'`,
      [storeId],
    );

    // 2. Histórico de recolhimentos efetuados
    const pickupsRes = await pool.query(
      `SELECT * FROM cash_pickups WHERE store_id = $1 ORDER BY pickup_date DESC, created_at DESC LIMIT 100`,
      [storeId],
    );

    res.json({
      success: true,
      data: {
        pendingCashBalance: Number(pendingRes.rows[0]?.pending_total) || 0,
        pickups: pickupsRes.rows.map((r) => ({
          id: r.id,
          responsibleName: r.responsible_name,
          amount: Number(r.amount),
          origin: r.origin,
          paymentMethod: r.payment_method,
          pickupDate: r.pickup_date,
          notes: r.notes || '',
          createdAt: r.created_at,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/api/v1/finance/pickups', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = pickupSchema.parse(req.body);
    const pickupId = `PCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (!pool) {
      res.status(503).json({ success: false, error: { message: 'Banco indisponível.' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lança saída de tesouraria / recolhimento no livro caixa
      const entryId = `ENT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await client.query(
        `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, category, operator_name)
         VALUES ($1, $2, 'out', $3, $4, 'manual', $5, 'Recolhimento / Retirada', $6)`,
        [
          entryId,
          storeId,
          `Recolhimento de dinheiro em espécie - Responsável: ${body.responsibleName}`,
          body.amount,
          pickupId,
          req.user?.name || 'Gilvan Teodo',
        ],
      );

      // 2. Insere registro formal na tabela cash_pickups
      await client.query(
        `INSERT INTO cash_pickups (
          id, store_id, responsible_name, amount, origin, payment_method, pickup_date, notes, finance_entry_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          pickupId,
          storeId,
          body.responsibleName.trim(),
          body.amount,
          body.origin,
          body.paymentMethod,
          body.pickupDate,
          body.notes.trim(),
          entryId,
        ],
      );

      // 3. Atualiza status de vendas em dinheiro pendentes até o montante recolhido
      let remainingToClear = body.amount;
      const pendingSales = await client.query(
        `SELECT id, total_amount FROM sales_orders
         WHERE store_id = $1 AND external_cash_status = 'pending_pickup' AND status = 'completed'
         ORDER BY created_at ASC`,
        [storeId],
      );

      for (const s of pendingSales.rows) {
        if (remainingToClear <= 0) break;
        const sAmount = Number(s.total_amount);
        await client.query(
          `UPDATE sales_orders SET external_cash_status = 'collected', updated_at = now() WHERE id = $1`,
          [s.id],
        );
        remainingToClear -= sAmount;
      }

      await client.query('COMMIT');

      const updatedPending = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0)::numeric as pending_total
         FROM sales_orders
         WHERE store_id = $1 AND external_cash_status = 'pending_pickup' AND status = 'completed'`,
        [storeId],
      );

      res.status(201).json({
        success: true,
        data: {
          id: pickupId,
          responsibleName: body.responsibleName,
          amount: body.amount,
          pickupDate: body.pickupDate,
          notes: body.notes,
          remainingPendingCash: Number(updatedPending.rows[0]?.pending_total) || 0,
        },
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, error: { message: err.message || 'Erro ao registrar recolhimento.' } });
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

