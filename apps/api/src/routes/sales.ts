import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOrDemoAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';
import { sendEvolutionText, normalizeBrazilPhone } from '../services/evolutionWhatsApp.js';

export const salesRouter = Router();

/* ── Schemas de Validação ───────────────────────────────── */

const tradeInSchema = z.object({
  deviceName: z.string().min(1, 'Nome do aparelho entregue é obrigatório.'),
  imei: z.string().default(''),
  capacity: z.string().default(''),
  color: z.string().default(''),
  conditionState: z.enum(['used', 'refurbished', 'damaged']).default('used'),
  notes: z.string().default(''),
  tradeValue: z.coerce.number().min(0, 'Valor de crédito do aparelho não pode ser negativo.'),
});

const saleLineSchema = z.object({
  stockId: z.string().optional().nullable(),
  name: z.string().min(1, 'Nome do item é obrigatório.'),
  qty: z.coerce.number().int().min(1, 'Quantidade inválida.'),
  unitPrice: z.coerce.number().min(0, 'Preço unitário inválido.'),
  unitCost: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).default(0),
  surcharge: z.coerce.number().min(0).default(0),
  imei: z.string().default(''),
  isAdHoc: z.boolean().default(false),
  itemType: z.string().default('product'),
});

const externalSaleSchema = z.object({
  requestId: z.string().min(16).max(80).optional(),
  customerId: z.string().optional().nullable(),
  customerName: z.string().default('Consumidor Final'),
  customerPhone: z.string().default(''),
  customerDocument: z.string().default(''),
  sellerId: z.string().optional().nullable(),
  sellerName: z.string().default(''),
  paymentMethod: z.string().default('Cartão de Crédito'), // 'dinheiro', 'cartao_credito', 'cartao_debito', 'pix', etc.
  installments: z.coerce.number().int().min(1).max(36).default(1),
  discount: z.coerce.number().min(0).default(0),
  surcharge: z.coerce.number().min(0).default(0),
  notes: z.string().default(''),
  warrantyMonths: z.coerce.number().int().min(0).default(3),
  warrantyTerms: z.string().default('Garantia legal de 90 dias balcão cobrindo defeitos de fabricação. Não cobre quedas ou umidade.'),
  lines: z.array(saleLineSchema).min(1, 'Informe ao menos um produto para a venda.'),
  tradeIn: tradeInSchema.optional().nullable(),
});

/* ── 1. Criar Venda Externa / Venda sem Caixa ─────────────── */

salesRouter.post('/api/v1/sales/external', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = externalSaleSchema.parse(req.body);

    const orderId = `VND-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const today = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    if (!pool) {
      res.status(503).json({
        success: false,
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados PostgreSQL MarthiDB não está conectado.' },
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (body.requestId) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [storeId + ':' + body.requestId]);
        const existing = await client.query('SELECT id FROM sales_orders WHERE store_id = $1 AND request_key = $2', [storeId, body.requestId]);
        if (existing.rows.length) {
          await client.query('COMMIT');
          res.status(200).json({success: true, data: {id: existing.rows[0].id}});
          return;
        }
      }
      body.sellerName = req.user!.name;
      for (const [table, id] of [['customers', body.customerId], ['sellers', body.sellerId]] as const) {
        if (!id) continue;
        const related = await client.query(`SELECT * FROM ${table} WHERE id = $1 AND store_id = $2`, [id, storeId]);
        if (!related.rows.length) throw Object.assign(new Error('Cliente ou vendedor não pertence à loja selecionada.'), {status: 400});
        if (table === 'customers') {
          body.customerName = related.rows[0].name;
          body.customerPhone = related.rows[0].phone || '';
          body.customerDocument = related.rows[0].document || '';
        } else body.sellerName = related.rows[0].name;
      }
      const requested = new Map<string, number>();
      for (const line of body.lines) {
        if (!line.stockId) throw Object.assign(new Error('Selecione um produto cadastrado no estoque da loja.'), {status: 400});
        requested.set(line.stockId, (requested.get(line.stockId) || 0) + line.qty);
      }
      // Lock in a stable order and check aggregate quantity, including repeated items.
      for (const [id, qty] of [...requested].sort(([a], [b]) => a.localeCompare(b))) {
        const stock = await client.query('SELECT qty FROM stock_items WHERE id = $1 AND store_id = $2 AND active = true FOR UPDATE', [id, storeId]);
        if (!stock.rows.length || Number(stock.rows[0].qty) < qty) throw Object.assign(new Error('Produto indisponível ou estoque insuficiente na loja selecionada.'), {status: 400});
      }
      // 1. Obter custos e calcular totais
      let subtotal = 0;
      let totalCost = 0;
      const linesWithCosts = [];

      for (const line of body.lines) {
        let lineCost = 0;

        if (line.stockId) {
          const stockCheck = await client.query(
            `SELECT qty, cost, price, name, imei FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE`,
            [line.stockId, storeId],
          );
          if (stockCheck.rows.length === 0) {
            throw new Error(`Produto não encontrado no estoque da loja: ${line.name}`);
          }

          const stockRow = stockCheck.rows[0];
          line.name = stockRow.name;
          line.imei = stockRow.imei || "";
          const currentQty = Number(stockRow.qty);
          if (currentQty < line.qty) {
            throw new Error(`Estoque insuficiente para o produto "${stockRow.name}". Disponível: ${currentQty}, Solicitado: ${line.qty}`);
          }

          // Custo unitário real registrado no cadastro de estoque (imutável por usuário comum)
          lineCost = Number(stockRow.cost) || 0;
        } else if (line.unitCost !== undefined && req.user?.role === 'admin') {
          lineCost = Number(line.unitCost) || 0;
        }

        const lineTotal = Math.round((line.qty * line.unitPrice - line.discount + line.surcharge) * 100) / 100;
        if (lineTotal < 0) throw Object.assign(new Error('Desconto superior ao valor do produto.'), {status: 400});
        subtotal += lineTotal;
        totalCost += lineCost * line.qty;

        linesWithCosts.push({
          ...line,
          unitCost: lineCost,
          totalCost: lineCost * line.qty,
          lineTotal,
        });
      }

      // Cálculo financeiro da venda
      const grossAmount = subtotal - body.discount + body.surcharge;
      const tradeInCredit = body.tradeIn?.tradeValue || 0;
      if (grossAmount < 0 || tradeInCredit > grossAmount) throw Object.assign(new Error('Desconto ou crédito de troca superior ao valor da venda.'), {status: 400});
      const netAmountToPay = Math.round((grossAmount - tradeInCredit) * 100) / 100;

      const grossProfit = Math.round((grossAmount - totalCost) * 100) / 100;
      const marginPercent = grossAmount > 0 ? Math.round((grossProfit / grossAmount) * 10000) / 100 : 0;

      const isCash = body.paymentMethod.toLowerCase().includes('dinheiro');
      const externalCashStatus = isCash ? 'pending_pickup' : 'not_applicable';

      // 2. Inserir registro principal da venda em sales_orders
      await client.query(
        `INSERT INTO sales_orders (
          id, local_id, store_id, session_id, customer_id, customer_name, customer_document, customer_phone,
          seller_id, seller_name, operator_name, subtotal, discount, surcharge, total_amount, payment_name, notes,
          status, sale_type, cost_total, gross_profit, margin_percent, trade_in_value, trade_in_notes,
          external_cash_status, warranty_terms, warranty_months, created_at, updated_at
        ) VALUES (
          $1, $1, $2, NULL, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14, $23,
          'completed', 'external', $15, $16, $17, $18, $19,
          $20, $21, $22, now(), now()
        )`,
        [
          orderId,
          storeId,
          body.customerId || null,
          body.customerName,
          body.customerDocument,
          body.customerPhone,
          body.sellerId || null,
          body.sellerName,
          req.user?.name || 'Operador',
          subtotal,
          body.discount,
          body.surcharge,
          netAmountToPay,
          body.paymentMethod,
          totalCost,
          grossProfit,
          marginPercent,
          tradeInCredit,
          body.tradeIn ? `${body.tradeIn.deviceName} (IMEI: ${body.tradeIn.imei || 'N/A'})` : '',
          externalCashStatus,
          body.warrantyTerms,
          body.warrantyMonths,
          body.notes,
        ],
      );

      // 3. Inserir itens da venda e dar BAIXA NO ESTOQUE
      for (const line of linesWithCosts) {
        const lineId = `LIN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO sales_order_lines (
            id, sale_id, order_id, stock_id, name, qty, unit_price, total_price, unit_cost, total_cost, imei, is_ad_hoc, item_type
          ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            lineId,
            orderId,
            line.stockId || null,
            line.name,
            line.qty,
            line.unitPrice,
            line.lineTotal,
            line.unitCost,
            line.totalCost,
            line.imei,
            line.isAdHoc,
            line.itemType,
          ],
        );

        if (line.stockId) {
          const prevRes = await client.query(`SELECT qty FROM stock_items WHERE id = $1 AND store_id = $2`, [line.stockId, storeId]);
          const prevQty = Number(prevRes.rows[0].qty);
          const newQty = prevQty - line.qty;

          await client.query(
            `UPDATE stock_items SET qty = $1, updated_at = now() WHERE id = $2 AND store_id = $3`,
            [newQty, line.stockId, storeId],
          );

          const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO stock_movements (
              id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes
            ) VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7, 'sale_external', $8, $9, $10)`,
            [
              movId,
              storeId,
              line.stockId,
              line.qty,
              prevQty,
              newQty,
              line.unitCost,
              orderId,
              body.sellerName || req.user?.name || 'Operador',
              `Venda Externa #${orderId} - Cliente: ${body.customerName}`,
            ],
          );
        }
      }

      // 4. Se houver UPGRADE / TRADE-IN: dar ENTRADA no estoque do aparelho usado
      let createdTradeInStockId: string | null = null;
      if (body.tradeIn && body.tradeIn.tradeValue > 0) {
        const tradeInItemId = `STK-USED-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        createdTradeInStockId = tradeInItemId;

        // Cria o aparelho usado no estoque com custo = tradeValue e quantidade 1
        await client.query(
          `INSERT INTO stock_items (
            id, store_id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
            kind, condition, category, brand, active, color, capacity, attrs, images
          ) VALUES ($1, $2, $3, $4, '', $5, 'UN', 1, 0, $6, $7, 'device', 'used', 'Smartphones Usados', '', true, $8, $9, $10, '[]'::jsonb)`,
          [
            tradeInItemId,
            storeId,
            `${body.tradeIn.deviceName} (Trade-in)`,
            `TI-${Date.now().toString(36).toUpperCase()}`,
            body.tradeIn.imei,
            body.tradeIn.tradeValue, // Custo de aquisição = valor atribuído na troca
            0, // Preço sugerido base (+25%)
            body.tradeIn.color,
            body.tradeIn.capacity,
            JSON.stringify({
              origem: 'Trade-in / Upgrade',
              vendaOrigemId: orderId,
              cliente: body.customerName,
              estado: body.tradeIn.conditionState,
              observacoes: body.tradeIn.notes,
            }),
          ],
        );

        // Movimentação de ENTRADA do usado no Kardex
        const tradeMovId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO stock_movements (
            id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes
          ) VALUES ($1, $2, $3, 'in', 1, 0, 1, $4, 'trade_in', $5, $6, $7)`,
          [
            tradeMovId,
            storeId,
            tradeInItemId,
            body.tradeIn.tradeValue,
            orderId,
            body.sellerName || req.user?.name || 'Operador',
            `Entrada Aparelho Usado (Trade-in / Upgrade) - Venda #${orderId}`,
          ],
        );

        // Registro específico na tabela sale_trade_ins
        const tradeInRecordId = `TI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO sale_trade_ins (
            id, sale_id, store_id, device_name, imei, capacity, color, condition_state,
            notes, trade_value, stock_item_id, status, received_by_seller_id, customer_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'received', $12, $13)`,
          [
            tradeInRecordId,
            orderId,
            storeId,
            body.tradeIn.deviceName,
            body.tradeIn.imei,
            body.tradeIn.capacity,
            body.tradeIn.color,
            body.tradeIn.conditionState,
            body.tradeIn.notes,
            body.tradeIn.tradeValue,
            tradeInItemId,
            body.sellerId || null,
            body.customerId || null,
          ],
        );
      }

      // 5. Registrar Formas de Pagamento em sale_payments
      const payId = `PAY-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await client.query(
        `INSERT INTO sale_payments (id, sale_id, method_name, method, amount, installments)
         VALUES ($1, $2, $3, $3, $4, $5)`,
        [payId, orderId, body.paymentMethod, netAmountToPay, body.installments],
      );

      // 6. Integração Financeira: Contas a Receber (Receivables)
      if (body.installments > 1) {
        // Venda parcelada (ex: 10x no cartão): gera parcelas com vencimentos a cada 30 dias
        const installmentAmount = Math.round((netAmountToPay / body.installments) * 100) / 100;
        let runningTotal = 0;

        for (let i = 1; i <= body.installments; i++) {
          const recId = `REC-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 5)}`;
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + (i * 30));
          const dueIso = dueDate.toISOString().slice(0, 10);

          const isLast = i === body.installments;
          const currAmount = isLast ? Math.round((netAmountToPay - runningTotal) * 100) / 100 : installmentAmount;
          runningTotal += currAmount;

          await client.query(
            `INSERT INTO receivables (
              id, store_id, description, customer_id, customer_name, category, amount,
              received_amount, due_date, status, sale_id, notes
            ) VALUES ($1, $2, $3, $4, $5, 'Vendas Externas', $6, 0, $7, 'open', $8, $9)`,
            [
              recId,
              storeId,
              `Venda #${orderId} (${i}/${body.installments}) - ${body.paymentMethod}`,
              body.customerId || null,
              body.customerName,
              currAmount,
              dueIso,
              orderId,
              `Parcela ${i} de ${body.installments} da Venda Externa #${orderId}`,
            ],
          );
        }
      } else {
        // Venda à vista (Dinheiro, PIX, Débito, Cartão 1x)
        const recId = `REC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO receivables (
            id, store_id, description, customer_id, customer_name, category, amount,
            received_amount, due_date, status, sale_id, received_at, notes
          ) VALUES ($1, $2, $3, $4, $5, 'Vendas Externas', $6, $6, $7, 'paid', $8, now(), $9)`,
          [
            recId,
            storeId,
            `Venda Externa #${orderId} - ${body.paymentMethod}`,
            body.customerId || null,
            body.customerName,
            netAmountToPay,
            today,
            orderId,
            isCash ? 'Recebimento externo em dinheiro (aguardando recolhimento)' : 'Recebimento confirmado',
          ],
        );
      }

      if (body.installments === 1) {
      // 7. Lançamento no Livro Caixa (finance_entries)
      const entId = `ENT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await client.query(
        `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, category, operator_name)
         VALUES ($1, $2, 'in', $3, $4, 'manual', $5, 'Vendas Externas', $6)`,
        [
          entId,
          storeId,
          `Venda Externa #${orderId} - ${body.customerName} (${body.paymentMethod})`,
          netAmountToPay,
          orderId,
          body.sellerName || req.user?.name || 'Operador',
        ],
      );

      }
      if (body.requestId) await client.query('UPDATE sales_orders SET request_key = $1 WHERE id = $2 AND store_id = $3', [body.requestId, orderId, storeId]);
      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        data: {
          id: orderId,
          customerName: body.customerName,
          sellerName: body.sellerName,
          subtotal,
          discount: body.discount,
          surcharge: body.surcharge,
          grossAmount,
          tradeInCredit,
          totalPaid: netAmountToPay,
          paymentMethod: body.paymentMethod,
          installments: body.installments,
          costTotal: totalCost,
          grossProfit,
          marginPercent,
          externalCashStatus,
          tradeInStockId: createdTradeInStockId,
          warrantyMonths: body.warrantyMonths,
          linesCount: body.lines.length,
          createdAt: nowIso,
        },
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[sales/external] Erro na transação de venda externa:', err);
      next(err);
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

/* ── 2. Comprovante / Garantia da Venda (SEM CUSTO NEM LUCRO) ─── */

salesRouter.get('/api/v1/sales/:id/receipt', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId || 'STR-DEMO-01';
    const saleId = req.params.id;

    if (!pool) {
      res.status(404).json({ success: false, error: { message: 'Venda não encontrada.' } });
      return;
    }

    const saleRes = await pool.query(
      `SELECT s.*, st.trade_name as store_name, st.phone as store_phone, st.email as store_email, st.city as store_city
       FROM sales_orders s
       JOIN stores st ON st.id = s.store_id
       WHERE s.id = $1 AND s.store_id = $2`,
      [saleId, storeId],
    );

    if (saleRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Venda não encontrada.' } });
      return;
    }

    const s = saleRes.rows[0];

    const linesRes = await pool.query(
      `SELECT name, qty, unit_price, total_price, imei FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1`,
      [saleId],
    );

    const tradeInRes = await pool.query(
      `SELECT device_name, imei, capacity, color, trade_value FROM sale_trade_ins WHERE sale_id = $1`,
      [saleId],
    );

    // DADOS PURIFICADOS: NUNCA EXIBE CUSTO, LUCRO OU MARGEM
    const receiptData = {
      store: {
        id: storeId,
        name: s.store_name || '',
        phone: s.store_phone || '',
        email: s.store_email || '',
        city: s.store_city || '',
      },
      sale: {
        id: s.id,
        date: s.created_at,
        seller: s.seller_name || 'Operador',
        customer: {
          name: s.customer_name || 'Consumidor Final',
          document: s.customer_document || '',
          phone: s.customer_phone || '',
        },
        items: linesRes.rows.map((r) => ({
          name: r.name,
          qty: Number(r.qty),
          unitPrice: Number(r.unit_price),
          totalPrice: Number(r.total_price),
          imei: r.imei || '',
        })),
        tradeIn: tradeInRes.rows.length > 0 ? {
          device: tradeInRes.rows[0].device_name,
          imei: tradeInRes.rows[0].imei,
          capacity: tradeInRes.rows[0].capacity,
          color: tradeInRes.rows[0].color,
          creditValue: Number(tradeInRes.rows[0].trade_value),
        } : null,
        financial: {
          subtotal: Number(s.subtotal),
          discount: Number(s.discount),
          surcharge: Number(s.surcharge),
          tradeInCredit: Number(s.trade_in_value || 0),
          totalPaid: Number(s.total_amount),
          paymentMethod: s.payment_name || 'Cartão de Crédito',
        },
        warranty: {
          months: s.warranty_months ?? 3,
          terms: s.warranty_terms || 'Garantia legal de 90 dias balcão cobrindo exclusivamente defeitos de fabricação.',
        },
      },
    };

    res.json({ success: true, data: receiptData });
  } catch (error) {
    next(error);
  }
});

/* ── 3. Enviar Garantia / Comprovante via WhatsApp ─────────── */

salesRouter.post('/api/v1/sales/:id/send-warranty-whatsapp', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const saleId = req.params.id;
    const body = z.object({
      phone: z.string().min(8, 'Telefone do cliente é obrigatório.'),
      customNote: z.string().optional(),
    }).parse(req.body);

    if (!pool) {
      res.status(503).json({ success: false, error: { message: 'Banco indisponível.' } });
      return;
    }

    const saleRes = await pool.query(
      `SELECT s.*, st.trade_name as store_name, st.phone as store_phone
       FROM sales_orders s
       JOIN stores st ON st.id = s.store_id
       WHERE s.id = $1 AND s.store_id = $2`,
      [saleId, storeId],
    );

    if (saleRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { message: 'Venda não encontrada.' } });
      return;
    }

    const s = saleRes.rows[0];
    const linesRes = await pool.query(
      `SELECT name, qty, unit_price, total_price, imei FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1`,
      [saleId],
    );
    const tradeInRes = await pool.query(
      `SELECT device_name, trade_value FROM sale_trade_ins WHERE sale_id = $1`,
      [saleId],
    );

    const itemsSummary = linesRes.rows
      .map((it) => `• *${it.name}* (Qtd: ${it.qty}) - R$ ${Number(it.total_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}${it.imei ? `\n  IMEI: ${it.imei}` : ''}`)
      .join('\n');

    let tradeInSummary = '';
    if (tradeInRes.rows.length > 0) {
      tradeInSummary = `\n🔄 *Aparelho Entregue (Upgrade):* ${tradeInRes.rows[0].device_name}\n   Crédito concedido: -R$ ${Number(tradeInRes.rows[0].trade_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }

    const messageText = [
      `📱 *COMPROVANTE DE VENDA & GARANTIA — ${s.store_name?.toUpperCase() || ''}*`,
      `───────────────────────────────`,
      `Olá, *${s.customer_name || 'Cliente'}*! Agradecemos pela sua preferência.`,
      ``,
      `📄 *Pedido:* #${s.id}`,
      `📅 *Data:* ${new Date(s.created_at).toLocaleDateString('pt-BR')}`,
      `👤 *Atendimento:* ${s.seller_name || 'Operador'}`,
      ``,
      `🛒 *PRODUTOS ADQUIRIDOS:*`,
      itemsSummary,
      tradeInSummary,
      ``,
      `💳 *Forma de Pagamento:* ${s.payment_name}`,
      `💰 *Total Pago:* R$ ${Number(s.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      ``,
      `🛡️ *GARANTIA DO APARELHO:*`,
      `• Prazo: *${s.warranty_months || 3} meses*`,
      `• Termos: ${s.warranty_terms || 'Garantia balcão para defeitos técnicos de fabricação. Não cobre quedas, quebras, contato com líquidos ou violação de lacres.'}`,
      ``,
      `───────────────────────────────`,
      `Qualquer dúvida, estamos à disposição pelo WhatsApp ${s.store_phone || ''}.`,
      `*${s.store_name || ''}*`,
    ].join('\n');

    // Tenta envio direto via Evolution API se configurado
    let sentViaEvolution = false;
    let evolutionError: string | null = null;

    try {
      const cfgRes = await pool.query(`SELECT whatsapp_settings FROM stores WHERE id = $1`, [storeId]);
      const cfg = cfgRes.rows[0]?.whatsapp_settings || {};
      const baseUrl = cfg.baseUrl || '';
      const instance = cfg.instance || '';
      const apiKey = cfg.apiKey || '';

      if (baseUrl && instance && apiKey) {
        const evoRes = await sendEvolutionText(body.phone, messageText, {
          baseUrl,
          instance,
          apiKey,
        });
        if (evoRes.ok) {
          sentViaEvolution = true;
        } else {
          evolutionError = typeof evoRes.body === 'string' ? evoRes.body : JSON.stringify(evoRes.body);
        }
      }
    } catch (e: any) {
      evolutionError = e.message;
    }

    res.json({
      success: true,
      data: {
        sentViaEvolution,
        evolutionError,
        messageText,
        directUrl: `https://api.whatsapp.com/send?phone=${normalizeBrazilPhone(body.phone)}&text=${encodeURIComponent(messageText)}`,
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ── 4. Pendências do Dia (Mariana & Gilvan) ─────────────────── */

salesRouter.get('/api/v1/sales/external/daily-tasks', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const today = new Date().toISOString().slice(0, 10);

    if (!pool) {
      res.json({
        success: true,
        data: {
          pendingCashSalesCount: 0,
          pendingCashTotal: 0,
          pendingTradeInsCount: 0,
          overduePayablesCount: 0,
          payablesDueTodayCount: 0,
          receivablesDueTodayCount: 0,
        },
      });
      return;
    }

    // 1. Dinheiro físico em espécie aguardando recolhimento
    const cashRes = await pool.query(
      `SELECT COUNT(*)::int as count, COALESCE(SUM(total_amount), 0)::numeric as total
       FROM sales_orders
       WHERE store_id = $1 AND external_cash_status = 'pending_pickup' AND status = 'completed'`,
      [storeId],
    );

    // 2. Aparelhos de upgrade/trade-in recebidos aguardando inspeção/conferência
    const tradeRes = await pool.query(
      `SELECT COUNT(*)::int as count, COALESCE(SUM(trade_value), 0)::numeric as total
       FROM sale_trade_ins
       WHERE store_id = $1 AND status = 'received'`,
      [storeId],
    );

    // 3. Contas a pagar vencendo hoje ou atrasadas
    const payRes = await pool.query(
      `SELECT
         COUNT(CASE WHEN due_date::text <= $2 AND status IN ('open', 'partial') THEN 1 END)::int as due_or_overdue,
         COALESCE(SUM(CASE WHEN due_date::text <= $2 AND status IN ('open', 'partial') THEN (amount - paid_amount) ELSE 0 END), 0)::numeric as due_amount
       FROM payables
       WHERE store_id = $1`,
      [storeId, today],
    );

    // 4. Contas a receber vencendo hoje
    const recRes = await pool.query(
      `SELECT
         COUNT(*)::int as count,
         COALESCE(SUM(amount - received_amount), 0)::numeric as total
       FROM receivables
       WHERE store_id = $1 AND due_date::text = $2 AND status IN ('open', 'partial')`,
      [storeId, today],
    );

    res.json({
      success: true,
      data: {
        pendingCashSalesCount: Number(cashRes.rows[0]?.count) || 0,
        pendingCashTotal: Number(cashRes.rows[0]?.total) || 0,
        pendingTradeInsCount: Number(tradeRes.rows[0]?.count) || 0,
        pendingTradeInsTotal: Number(tradeRes.rows[0]?.total) || 0,
        payablesDueCount: Number(payRes.rows[0]?.due_or_overdue) || 0,
        payablesDueAmount: Number(payRes.rows[0]?.due_amount) || 0,
        receivablesDueCount: Number(recRes.rows[0]?.count) || 0,
        receivablesDueAmount: Number(recRes.rows[0]?.total) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ── 5. Cancelamento de Venda com Estorno Completo ───────────── */

salesRouter.post('/api/v1/sales/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    if (!['admin', 'superadmin', 'manager'].includes(req.user!.role || '')) throw Object.assign(new Error('Sem permissão para cancelar vendas.'), {status: 403});
    const storeId = req.storeId!;
    const saleId = req.params.id;
    const body = z.object({ reason: z.string().default('Cancelamento solicitado pelo cliente') }).parse(req.body);

    if (!pool) {
      res.status(503).json({ success: false, error: { message: 'Banco indisponível.' } });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const saleRes = await client.query(
        `SELECT * FROM sales_orders WHERE id = $1 AND store_id = $2 FOR UPDATE`,
        [saleId, storeId],
      );
      if (saleRes.rows.length === 0) {
        throw Object.assign(new Error('Venda não encontrada.'), {status: 404});
      }

      const sale = saleRes.rows[0];
      if (sale.status === 'cancelled') {
        throw Object.assign(new Error('Esta venda já foi cancelada anteriormente.'), {status: 409});
      }

      // 1. Marca venda como cancelada
      await client.query(
        `UPDATE sales_orders
         SET status = 'cancelled', cancelled_at = now(), cancel_reason = $1, cancel_operator = $2, updated_at = now()
         WHERE id = $3`,
        [body.reason, req.user?.name || 'Operador', saleId],
      );

      // 2. Estorna itens vendidos devolvendo para o estoque
      const linesRes = await client.query(
        `SELECT * FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1`,
        [saleId],
      );
      for (const line of linesRes.rows) {
        if (line.stock_id) {
          const sRes = await client.query(`SELECT qty FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE`, [line.stock_id, storeId]);
          if (sRes.rows.length > 0) {
            const prev = Number(sRes.rows[0].qty);
            const nextQty = prev + Number(line.qty);
            await client.query(`UPDATE stock_items SET qty = $1, updated_at = now() WHERE id = $2 AND store_id = $3`, [nextQty, line.stock_id, storeId]);

            const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            await client.query(
              `INSERT INTO stock_movements (
                id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes
              ) VALUES ($1, $2, $3, 'in', $4, $5, $6, $7, 'reversal', $8, $9, $10)`,
              [movId, storeId, line.stock_id, line.qty, prev, nextQty, line.unit_cost || 0, saleId, req.user?.name || 'Operador', `Estorno de venda cancelada #${saleId}`],
            );
          }
        }
      }

      // 3. Estorna o aparelho usado (trade-in) caso tenha sido recebido
      const tradeRes = await client.query(
        `SELECT * FROM sale_trade_ins WHERE sale_id = $1`,
        [saleId],
      );
      for (const trade of tradeRes.rows) {
        if (trade.stock_item_id) {
          const item = await client.query('SELECT qty FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE', [trade.stock_item_id, storeId]);
          if (!item.rows.length || Number(item.rows[0].qty) !== 1 || trade.status === 'resold') throw Object.assign(new Error('Aparelho da troca já movimentado; cancelamento exige conferência do estoque.'), {status: 409});
          // Remove ou inativa o item usado cadastrado
          await client.query(`UPDATE stock_items SET active = false, qty = 0, updated_at = now() WHERE id = $1 AND store_id = $2`, [trade.stock_item_id, storeId]);
          await client.query(`UPDATE sale_trade_ins SET status = 'cancelled', updated_at = now() WHERE id = $1`, [trade.id]);
        }
      }

      // 4. Cancela recebíveis gerados pela venda
      await client.query(
        `UPDATE receivables SET status = 'cancelled', notes = notes || ' · Venda cancelada', updated_at = now() WHERE sale_id = $1 AND store_id = $2`,
        [saleId, storeId],
      );

      const received = await client.query("SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS amount FROM finance_entries WHERE ref_id = $1 AND store_id = $2", [saleId, storeId]);
      const receivedAmount = Number(received.rows[0].amount);
      if (receivedAmount > 0) {
      // 5. Registra estorno no livro caixa (finance_entries)
      const entId = `ENT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await client.query(
        `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, category, operator_name)
         VALUES ($1, $2, 'out', $3, $4, 'manual', $5, 'Estorno de Venda', $6)`,
        [
          entId,
          storeId,
          `Estorno de Venda #${saleId} (${body.reason})`,
          receivedAmount,
          saleId,
          req.user?.name || 'Operador',
        ],
      );

      }
      await client.query('COMMIT');
      res.json({ success: true, data: { ok: true, saleId, status: 'cancelled' } });
    } catch (err: any) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});
