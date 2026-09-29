import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';
import { reduceStockQtyInMemory } from './stock.js';

export const posRouter = Router();

/* ── Schemas ───────────────────────────────────────────── */

const openSessionSchema = z.object({
  openingFloat: z.coerce.number().min(0).default(0),
  operatorName: z.string().default('Operador'),
  terminalId: z.string().optional(),
  note: z.string().optional(),
  openedAt: z.string().optional(),
});

const cashMovementSchema = z.object({
  amount: z.coerce.number().min(0.01, 'Valor deve ser positivo.'),
  note: z.string().optional(),
  reason: z.string().default('Outros'),
  beneficiaryType: z.enum(['store', 'employee']).default('store'),
  beneficiaryId: z.string().optional(),
  beneficiaryName: z.string().optional(),
  operatorName: z.string().optional(),
  at: z.string().optional(),
});

const closeSessionSchema = z.object({
  countedCash: z.coerce.number().default(0),
  operatorName: z.string().default('Operador'),
  note: z.string().optional(),
  breakdown: z.record(z.any()).optional(),
});

const saleLineSchema = z.object({
  stockId: z.string().optional().nullable(),
  name: z.string().min(1, 'Nome do item é obrigatório.'),
  qty: z.coerce.number().min(0.001, 'Quantidade inválida.'),
  unitPrice: z.coerce.number().min(0, 'Preço unitário inválido.'),
  imei: z.string().default(''),
  isAdHoc: z.boolean().default(false),
  itemType: z.string().default('product'),
});

const closeSaleSchema = z.object({
  ticketId: z.string().optional().nullable(),
  localId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  customerName: z.string().default('Consumidor Final'),
  customerPhone: z.string().default(''),
  customerDocument: z.string().default(''),
  paymentName: z.string().default('Dinheiro'),
  priceTableName: z.string().default('Padrão'),
  paymentMethodId: z.string().optional().nullable(),
  priceTableId: z.string().optional().nullable(),
  discount: z.coerce.number().default(0),
  surcharge: z.coerce.number().default(0),
  sellerId: z.string().optional().nullable(),
  sellerName: z.string().default(''),
  lines: z.array(saleLineSchema).min(1, 'Informe ao menos um item.'),
});

/* ── 1. Sessões de Caixa ────────────────────────────────── */

posRouter.get('/api/v1/pos/sessions/open', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;

    if (pool) {
      const sessionRes = await pool.query(
        `SELECT * FROM cash_sessions WHERE store_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
        [storeId],
      );
      if (sessionRes.rows.length === 0) {
        res.json({ success: true, data: null });
        return;
      }
      const s = sessionRes.rows[0];
      const movesRes = await pool.query(
        `SELECT id, type as kind, amount, cash_amount, note, reason, beneficiary_type, beneficiary_name, created_at, operator_name
         FROM cash_session_events WHERE session_id = $1 ORDER BY created_at ASC`,
        [s.id],
      );

      res.json({
        success: true,
        data: {
          id: s.id,
          openedAt: s.opened_at,
          closedAt: s.closed_at,
          openingFloat: Number(s.opening_float) || 0,
          expectedCash: Number(s.expected_cash) || 0,
          countedCash: s.counted_cash !== null ? Number(s.counted_cash) : undefined,
          difference: Number(s.difference) || 0,
          operatorName: s.operator_name,
          status: s.status,
          reopenCount: Number(s.reopen_count) || 0,
          movements: movesRes.rows.map((m) => ({
            id: m.id,
            kind: m.kind,
            amount: Number(m.amount) || 0,
            cashAmount: Number(m.cash_amount) || 0,
            note: m.note || '',
            reason: m.reason || '',
            beneficiaryType: m.beneficiary_type,
            beneficiaryName: m.beneficiary_name,
            createdAt: m.created_at,
            operatorName: m.operator_name,
          })),
        },
      });
      return;
    }

    res.json({ success: true, data: null });
  } catch (error) {
    next(error);
  }
});

posRouter.post('/api/v1/pos/sessions/open', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = openSessionSchema.parse(req.body);
    const id = `CX-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const openedAt = body.openedAt || new Date().toISOString();

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Fecha caixas abertos anteriormente por segurança
        await client.query(
          `UPDATE cash_sessions SET status = 'closed', closed_at = now() WHERE store_id = $1 AND status = 'open'`,
          [storeId],
        );

        await client.query(
          `INSERT INTO cash_sessions (id, store_id, terminal_id, operator_name, opened_at, opening_float, expected_cash, status)
           VALUES ($1, $2, $3, $4, $5, $6, $6, 'open')`,
          [id, storeId, body.terminalId || null, body.operatorName, openedAt, body.openingFloat],
        );

        // Movimento de abertura
        const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO cash_session_events (id, session_id, store_id, type, amount, cash_amount, note, operator_name, created_at)
           VALUES ($1, $2, $3, 'open', $4, $4, $5, $6, $7)`,
          [movId, id, storeId, body.openingFloat, body.note || 'Abertura de caixa', body.operatorName, openedAt],
        );

        await client.query('COMMIT');

        res.status(201).json({
          success: true,
          data: {
            id,
            openedAt,
            openingFloat: body.openingFloat,
            expectedCash: body.openingFloat,
            operatorName: body.operatorName,
            status: 'open',
            reopenCount: 0,
            movements: [
              {
                id: movId,
                kind: 'open',
                amount: body.openingFloat,
                note: body.note || 'Abertura de caixa',
                createdAt: openedAt,
                operatorName: body.operatorName,
              },
            ],
          },
        });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id,
        openedAt,
        openingFloat: body.openingFloat,
        expectedCash: body.openingFloat,
        operatorName: body.operatorName,
        status: 'open',
        reopenCount: 0,
        movements: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

posRouter.post('/api/v1/pos/sessions/:id/aporte', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const sessionId = req.params.id;
    const body = cashMovementSchema.parse(req.body);
    const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const at = body.at || new Date().toISOString();

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO cash_session_events (id, session_id, store_id, type, amount, cash_amount, reason, note, beneficiary_type, beneficiary_name, operator_name, created_at)
           VALUES ($1, $2, $3, 'aporte', $4, $4, $5, $6, $7, $8, $9, $10)`,
          [
            movId,
            sessionId,
            storeId,
            body.amount,
            body.reason,
            body.note || body.reason,
            body.beneficiaryType,
            body.beneficiaryName || 'Loja',
            body.operatorName || req.user?.name || 'Operador',
            at,
          ],
        );

        await client.query(
          `UPDATE cash_sessions SET expected_cash = expected_cash + $1 WHERE id = $2 AND store_id = $3`,
          [body.amount, sessionId, storeId],
        );

        await client.query('COMMIT');
        res.json({ success: true, data: { ok: true, movementId: movId } });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

posRouter.post('/api/v1/pos/sessions/:id/sangria', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const sessionId = req.params.id;
    const body = cashMovementSchema.parse(req.body);
    const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const at = body.at || new Date().toISOString();

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO cash_session_events (id, session_id, store_id, type, amount, cash_amount, reason, note, beneficiary_type, beneficiary_name, operator_name, created_at)
           VALUES ($1, $2, $3, 'sangria', $4, $4, $5, $6, $7, $8, $9, $10)`,
          [
            movId,
            sessionId,
            storeId,
            body.amount,
            body.reason,
            body.note || body.reason,
            body.beneficiaryType,
            body.beneficiaryName || 'Loja',
            body.operatorName || req.user?.name || 'Operador',
            at,
          ],
        );

        await client.query(
          `UPDATE cash_sessions SET expected_cash = expected_cash - $1 WHERE id = $2 AND store_id = $3`,
          [body.amount, sessionId, storeId],
        );

        await client.query('COMMIT');
        res.json({ success: true, data: { ok: true, movementId: movId } });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

posRouter.post('/api/v1/pos/sessions/:id/close', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const sessionId = req.params.id;
    const body = closeSessionSchema.parse(req.body);

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const sRes = await client.query(`SELECT expected_cash FROM cash_sessions WHERE id = $1 AND store_id = $2`, [sessionId, storeId]);
        const expCash = sRes.rows[0] ? Number(sRes.rows[0].expected_cash) : 0;
        const diff = body.countedCash - expCash;

        await client.query(
          `UPDATE cash_sessions
           SET status = 'closed', closed_at = now(), counted_cash = $1, difference = $2, closing_breakdown = $3, notes = $4
           WHERE id = $5 AND store_id = $6`,
          [body.countedCash, diff, JSON.stringify(body.breakdown || {}), body.note || '', sessionId, storeId],
        );

        const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO cash_session_events (id, session_id, store_id, type, amount, note, operator_name)
           VALUES ($1, $2, $3, 'close', $4, $5, $6)`,
          [movId, sessionId, storeId, body.countedCash, body.note || 'Fechamento de caixa', body.operatorName],
        );

        await client.query('COMMIT');
        res.json({ success: true, data: { ok: true, difference: diff } });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── 2. Fechamento de Venda com Baixa de Estoque e Integração Financeira ── */

posRouter.post('/api/v1/pos/sales', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = closeSaleSchema.parse(req.body);

    const subtotal = body.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0);
    const total = Math.max(0, Math.round((subtotal - body.discount + body.surcharge) * 100) / 100);
    const orderId = body.localId || `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Idempotência: se já existir venda com mesma idempotencyKey, retorna a existente
        if (body.idempotencyKey) {
          const dupRes = await client.query(
            `SELECT id FROM sales_orders WHERE store_id = $1 AND id = $2`,
            [storeId, body.idempotencyKey],
          );
          if (dupRes.rows.length > 0) {
            await client.query('ROLLBACK');
            res.json({ success: true, data: { id: dupRes.rows[0].id, alreadyProcessed: true } });
            return;
          }
        }

        // 2. Localiza sessão de caixa aberta se houver
        const sessRes = await client.query(
          `SELECT id FROM cash_sessions WHERE store_id = $1 AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
          [storeId],
        );
        const openSessionId = sessRes.rows[0]?.id || null;

        // 3. Insere a venda (sales_orders)
        await client.query(
          `INSERT INTO sales_orders (
            id, local_id, store_id, session_id, customer_name, customer_document, customer_phone,
            seller_id, seller_name, subtotal, discount, surcharge, total_amount, payment_name, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'completed')`,
          [
            orderId,
            body.localId || orderId,
            storeId,
            openSessionId,
            body.customerName,
            body.customerDocument,
            body.customerPhone,
            body.sellerId || null,
            body.sellerName || '',
            subtotal,
            body.discount,
            body.surcharge,
            total,
            body.paymentName,
          ],
        );

        // 4. Insere as linhas e BAIXA O ESTOQUE
        for (const line of body.lines) {
          const lineId = `LIN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO sales_order_lines (id, order_id, stock_id, name, qty, unit_price, total_price, imei, is_ad_hoc, item_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              lineId,
              orderId,
              line.stockId || null,
              line.name,
              line.qty,
              line.unitPrice,
              line.qty * line.unitPrice,
              line.imei,
              line.isAdHoc,
              line.itemType,
            ],
          );

          // Se tem stockId cadastrado, debita estoque e gera kardex
          if (line.stockId) {
            const stockCheck = await client.query(
              `SELECT qty, cost FROM stock_items WHERE id = $1 AND store_id = $2`,
              [line.stockId, storeId],
            );
            if (stockCheck.rows.length > 0) {
              const prev = Number(stockCheck.rows[0].qty);
              const cost = Number(stockCheck.rows[0].cost);
              const newQty = prev - line.qty;

              await client.query(
                `UPDATE stock_items SET qty = $1, updated_at = now() WHERE id = $2 AND store_id = $3`,
                [newQty, line.stockId, storeId],
              );

              const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
              await client.query(
                `INSERT INTO stock_movements (
                  id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes
                ) VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7, 'sale', $8, $9, $10)`,
                [
                  movId,
                  storeId,
                  line.stockId,
                  line.qty,
                  prev,
                  newQty,
                  cost,
                  orderId,
                  body.sellerName || req.user?.name || 'Operador',
                  `Venda PDV #${orderId}`,
                ],
              );
            }
          }
        }

        // 5. Integração com Financeiro: Cria Recebível Baixado e Lançamento no Livro Caixa
        const recId = `REC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const today = new Date().toISOString().slice(0, 10);
        await client.query(
          `INSERT INTO receivables (
            id, store_id, description, customer_name, category, amount, received_amount, due_date, status, sale_id, received_at, notes
          ) VALUES ($1, $2, $3, $4, 'Vendas', $5, $5, $6, 'paid', $7, now(), $8)`,
          [
            recId,
            storeId,
            `Venda PDV: ${body.paymentName} (${body.customerName})`,
            body.customerName,
            total,
            today,
            orderId,
            `Venda PDV #${orderId} realizada`,
          ],
        );

        const entId = `ENT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, category, operator_name)
           VALUES ($1, $2, 'in', $3, $4, 'pos', $5, 'Vendas', $6)`,
          [entId, storeId, `Venda PDV #${orderId} - ${body.paymentName}`, total, orderId, req.user?.name || 'Operador'],
        );

        // 6. Se o pagamento foi em dinheiro e há caixa aberto, atualiza expected_cash e gera evento no caixa
        if (openSessionId && body.paymentName.toLowerCase().includes('dinheiro')) {
          await client.query(
            `UPDATE cash_sessions SET expected_cash = expected_cash + $1 WHERE id = $2`,
            [total, openSessionId],
          );

          const cMovId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO cash_session_events (id, session_id, store_id, type, amount, cash_amount, note, order_id, operator_name)
             VALUES ($1, $2, $3, 'sale', $4, $4, $5, $6, $7)`,
            [cMovId, openSessionId, storeId, total, `Venda PDV #${orderId}`, orderId, req.user?.name || 'Operador'],
          );
        }

        await client.query('COMMIT');

        res.status(201).json({
          success: true,
          data: {
            id: orderId,
            total,
            paymentName: body.paymentName,
            status: 'completed',
            linesCount: body.lines.length,
          },
        });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    for (const line of body.lines) {
      if (line.stockId) {
        reduceStockQtyInMemory(line.stockId, line.qty);
      }
    }

    res.status(201).json({
      success: true,
      data: {
        id: orderId,
        total,
        paymentName: body.paymentName,
        status: 'completed',
        linesCount: body.lines.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

posRouter.get('/api/v1/orders', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    if (pool) {
      const ordersRes = await pool.query(
        `SELECT * FROM sales_orders WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [storeId],
      );
      res.json({ success: true, data: ordersRes.rows });
      return;
    }
    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});
