import type { PoolClient } from 'pg';
import { z } from 'zod';
import { applyDayOffersToLines } from './dayOffers.js';
import { pickupSelection, recordPickup, validatePickupLines } from './pickup.js';
import { changeVariationQuantity } from './variationInventory.js';
import { receiveTradeInIntoExistingProduct } from './tradeInStock.js';
import { recordTradeInEntry } from './supplierEntries.js';
import { markUnitsSold } from './soldUnits.js';
import { primaryImei } from './imeiPairs.js';
import { applyRealSaleCost, findEntryByImei, moveSaleToDate } from './saleHistory.js';
import { pickedAttributeSchema, validateSaleAttributes } from './saleAttributes.js';
import { unreservedQuantity } from './commercialReservations.js';

/**
 * Venda externa: validação dos dados e a gravação completa (venda, itens, baixa do estoque por IMEI,
 * troca, pagamento, recebíveis e caixa). Usada ao criar a venda e ao corrigir uma venda já concluída.
 */

/* ── Schemas de Validação ───────────────────────────────── */

const tradeInSchema = z.object({
  brand: z.string().trim().max(80).default(''),
  deviceName: z.string().min(1, 'Nome do aparelho entregue é obrigatório.'),
  imei: z.string().default(''),
  capacity: z.string().default(''),
  color: z.string().default(''),
  conditionState: z.enum(['used', 'refurbished', 'damaged']).default('used'),
  notes: z.string().default(''),
  /** Bateria (%) do aparelho recebido. */
  batteryLevel: z.coerce.number().int().min(0).max(100).nullable().optional(),
  tradeValue: z.coerce.number().min(0, 'Valor de crédito do aparelho não pode ser negativo.'),
});

const saleLineSchema = z.object({
  ...pickupSelection,
  pickupKind:z.string().optional(),
  attributes: pickedAttributeSchema,
  stockId: z.string().optional().nullable(),
  name: z.string().min(1, 'Nome do item é obrigatório.'),
  qty: z.coerce.number().int().min(1, 'Quantidade inválida.'),
  unitPrice: z.coerce.number().min(0, 'Preço unitário inválido.'),
  unitCost: z.coerce.number().min(0).optional(),
  discount: z.coerce.number().min(0).default(0),
  surcharge: z.coerce.number().min(0).default(0),
  /** Campanha que deu o desconto da linha (conferida no servidor). */
  campaignId: z.string().optional().nullable(),
  imei: z.string().default(''),
  isAdHoc: z.boolean().default(false),
  itemType: z.string().default('product'),
});

export const externalSaleSchema = z.object({
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
  /** Parte do acréscimo que é juros do cartão (taxa repassada): informação da loja, não sai no comprovante do cliente. */
  cardInterest: z.coerce.number().min(0).default(0),
  /**
   * Mais de um meio de pagamento (ex.: PIX + cartão 4x). Cada valor já inclui os juros do cartão dele e a soma
   * fecha o total a pagar. Sem a lista, vale paymentMethod/installments com o total.
   */
  payments: z
    .array(
      z.object({
        method: z.string().trim().min(1, 'Escolha o meio de pagamento.'),
        amount: z.coerce.number().min(0),
        installments: z.coerce.number().int().min(1).max(36).default(1),
        cardInterest: z.coerce.number().min(0).default(0),
      }),
    )
    .max(6, 'No máximo 6 meios de pagamento por venda.')
    .optional(),
  /** Venda que já aconteceu (lançamento de histórico): só gestão, não futura e até 120 dias atrás. */
  saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data da venda inválida.').optional(),
  notes: z.string().default(''),
  warrantyMonths: z.coerce.number().int().min(0).default(3),
  /** Da loja (com prazo), somente do fabricante ou sem garantia. */
  warrantyType: z.enum(['store', 'manufacturer', 'none']).default('store'),
  warrantyTerms: z.string().default('Garantia legal de 90 dias balcão cobrindo defeitos de fabricação. Não cobre quedas ou umidade.'),
  lines: z.array(saleLineSchema).min(1, 'Informe ao menos um produto para a venda.'),
  tradeIn: tradeInSchema.optional().nullable(),
});

export type ExternalSaleInput = z.infer<typeof externalSaleSchema>;

export type ExternalSaleContext = { storeId: string; userName: string; userRole?: string };

export type ExternalSaleOptions = {
  /** Número da venda (novo ou o da venda que está sendo corrigida). */
  orderId: string;
  /** Hoje (AAAA-MM-DD, UTC), base do deslocamento dos vencimentos. */
  today: string;
  /** Momento da venda quando não é agora (venda passada ou correção). */
  saleAt: string | null;
  /** Correção que mantém a troca já registrada (mesmo IMEI). */
  keepTradeInId?: string | null;
  /** Correção de venda em dinheiro: mantém a situação do recolhimento. */
  keepCashStatus?: string | null;
};

/** Troca mantida na correção: atualiza crédito e dados do aparelho; estoque e entrada continuam os mesmos. */
async function updateKeptTradeIn(client: PoolClient, storeId: string, orderId: string, tradeInId: string, body: ExternalSaleInput) {
  const tradeIn = body.tradeIn!;
  await client.query(
    `UPDATE sale_trade_ins SET device_name = $3, capacity = $4, color = $5, condition_state = $6, notes = $7, trade_value = $8,
            received_by_seller_id = $9, customer_id = $10, status = 'received', updated_at = now()
      WHERE id = $1 AND store_id = $2`,
    [tradeInId, storeId, tradeIn.deviceName, tradeIn.capacity, tradeIn.color, tradeIn.conditionState, tradeIn.notes, tradeIn.tradeValue, body.sellerId || null, body.customerId || null],
  );
  // O custo do aparelho da troca é o crédito dado ao cliente.
  await client.query("UPDATE stock_supplier_entries SET unit_cost = $3, updated_at = now() WHERE store_id = $1 AND ref_id = $2 AND origin = 'trade_in'", [storeId, tradeInId, tradeIn.tradeValue]);
  await client.query("UPDATE stock_movements SET unit_cost = $3, cost = $3 WHERE store_id = $1 AND ref_id = $2 AND ref_type = 'trade_in'", [storeId, orderId, tradeIn.tradeValue]);
}

/** Grava a venda externa dentro da transação do chamador e devolve o resumo da venda. */
export async function recordExternalSale(client: PoolClient, ctx: ExternalSaleContext, body: ExternalSaleInput, options: ExternalSaleOptions) {
  const { storeId } = ctx;
  const { orderId, today, saleAt } = options;
  const operator = ctx.userName || 'Operador';
  const nowIso = new Date().toISOString();
  for (const line of body.lines) line.pickupKind = undefined;
  await validateSaleAttributes(client, storeId, body.lines, 'external');
  await validatePickupLines(client,storeId,body.lines);
  await applyDayOffersToLines(client,storeId,body.lines,'external');
  body.sellerName = ctx.userName;
  // Loja com vendedores cadastrados: a venda precisa do vendedor (antes caía no usuário logado e ia para a meta errada).
  if (!body.sellerId) {
    const active = await client.query('SELECT 1 FROM sellers WHERE store_id = $1 AND active = true LIMIT 1', [storeId]);
    if (active.rows.length) throw Object.assign(new Error('Escolha o vendedor responsável pela venda.'), { status: 422 });
  }
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
    if(line.pickupKind!=='order') requested.set(line.stockId, (requested.get(line.stockId) || 0) + line.qty);
  }
  // Lock in a stable order and check aggregate quantity, including repeated items.
  for (const [id, qty] of [...requested].sort(([a], [b]) => a.localeCompare(b))) {
    const stock = await client.query('SELECT qty FROM stock_items WHERE id = $1 AND store_id = $2 AND active = true FOR UPDATE', [id, storeId]);
    if (!stock.rows.length || await unreservedQuantity(client,storeId,id,Number(stock.rows[0].qty)) < qty) throw Object.assign(new Error('Produto indisponível, reservado ou estoque insuficiente na loja selecionada.'), {status: 400});
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
      // Dual chip: a venda guarda o IMEI principal do aparelho, mesmo que tenham digitado o 2º.
      line.imei = await primaryImei(client, storeId, String(line.imei ?? '').trim() || stockRow.imei || "");
      const currentQty = Number(stockRow.qty);
      if (currentQty < line.qty && line.pickupKind!=='order') {
        throw new Error(`Estoque insuficiente para o produto "${stockRow.name}". Disponível: ${currentQty}, Solicitado: ${line.qty}`);
      }

      // Custo unitário real registrado no cadastro de estoque (imutável por usuário comum)
      lineCost = Number(stockRow.cost) || 0;
    } else if (line.unitCost !== undefined && ctx.userRole === 'admin') {
      lineCost = Number(line.unitCost) || 0;
    }

    // Campanha da linha: precisa ser desta loja, estar ativa, na vigência e valer na venda externa.
    let campaignName = '';
    if (line.campaignId) {
      const campaign = (await client.query('SELECT name, active, rules FROM promo_campaigns WHERE id = $1 AND store_id = $2', [line.campaignId, storeId])).rows[0];
      const rules = campaign?.rules ?? {};
      const today = new Date().toISOString().slice(0, 10);
      const channels: string[] = Array.isArray(rules.channels) ? rules.channels : [];
      if (
        !campaign || !campaign.active || rules.dayOffer ||
        (channels.length && !channels.includes('external')) ||
        (rules.startDate && String(rules.startDate).slice(0, 10) > today) ||
        (rules.endDate && String(rules.endDate).slice(0, 10) < today)
      ) {
        throw Object.assign(new Error(`A campanha aplicada em "${line.name}" não vale mais na venda externa. Atualize a tela e tente de novo.`), { status: 409 });
      }
      campaignName = campaign.name;
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
      campaignName,
    });
  }

  // Cálculo financeiro da venda
  const grossAmount = subtotal - body.discount + body.surcharge;
  const tradeInCredit = body.tradeIn?.tradeValue || 0;
  if (grossAmount < 0 || tradeInCredit > grossAmount) throw Object.assign(new Error('Desconto ou crédito de troca superior ao valor da venda.'), {status: 400});
  const netAmountToPay = Math.round((grossAmount - tradeInCredit) * 100) / 100;

  // Meios de pagamento: a soma precisa fechar o total a pagar (crédito da troca já descontado).
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const split = (body.payments ?? []).filter((payment, _index, all) => payment.amount > 0 || all.length === 1);
  const payments = split.length
    ? split.map((payment) => ({ ...payment, amount: round2(payment.amount), cardInterest: round2(payment.cardInterest) }))
    : [{ method: body.paymentMethod, amount: netAmountToPay, installments: body.installments, cardInterest: body.cardInterest }];
  if (split.length) {
    const paid = round2(payments.reduce((sum, payment) => sum + payment.amount, 0));
    if (Math.abs(paid - netAmountToPay) > 0.01) {
      const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      throw Object.assign(new Error(`A soma dos pagamentos (${brl(paid)}) não fecha com o total a pagar (${brl(netAmountToPay)}).`), { status: 400 });
    }
    body.cardInterest = round2(payments.reduce((sum, payment) => sum + payment.cardInterest, 0));
    body.paymentMethod = payments.length === 1 ? payments[0].method : payments.map((p) => (p.installments > 1 ? `${p.method} ${p.installments}x` : p.method)).join(' + ');
    body.installments = Math.max(...payments.map((p) => p.installments));
  }
  const isCashMethod = (method: string) => method.toLowerCase().includes('dinheiro');
  const cashAmount = round2(payments.filter((p) => isCashMethod(p.method)).reduce((sum, p) => sum + p.amount, 0));

  // Juros do cartão repassados ao cliente são da operadora: não entram no lucro nem na margem.
  const storeRevenue = grossAmount - Math.min(body.cardInterest, body.surcharge);
  const grossProfit = Math.round((storeRevenue - totalCost) * 100) / 100;
  const marginPercent = storeRevenue > 0 ? Math.round((grossProfit / storeRevenue) * 10000) / 100 : 0;

  const isCash = payments.some((p) => isCashMethod(p.method));
  const externalCashStatus = isCash && options.keepCashStatus ? options.keepCashStatus : isCash && !saleAt ? 'pending_pickup' : 'not_applicable';

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
    )
    ON CONFLICT (id) DO UPDATE SET
      customer_id = EXCLUDED.customer_id, customer_name = EXCLUDED.customer_name, customer_document = EXCLUDED.customer_document,
      customer_phone = EXCLUDED.customer_phone, seller_id = EXCLUDED.seller_id, seller_name = EXCLUDED.seller_name,
      operator_name = EXCLUDED.operator_name, subtotal = EXCLUDED.subtotal, discount = EXCLUDED.discount, surcharge = EXCLUDED.surcharge,
      total_amount = EXCLUDED.total_amount, payment_name = EXCLUDED.payment_name, notes = EXCLUDED.notes, status = 'completed',
      cost_total = EXCLUDED.cost_total, gross_profit = EXCLUDED.gross_profit, margin_percent = EXCLUDED.margin_percent,
      trade_in_value = EXCLUDED.trade_in_value, trade_in_notes = EXCLUDED.trade_in_notes, external_cash_status = EXCLUDED.external_cash_status,
      warranty_terms = EXCLUDED.warranty_terms, warranty_months = EXCLUDED.warranty_months, updated_at = now()
    WHERE sales_orders.store_id = EXCLUDED.store_id AND sales_orders.sale_type = 'external'`,
    [
      orderId,
      storeId,
      body.customerId || null,
      body.customerName,
      body.customerDocument,
      body.customerPhone,
      body.sellerId || null,
      body.sellerName,
      operator,
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
  await client.query(
    "UPDATE sales_orders SET warranty_type = $2, warranty_months = CASE WHEN $2 = 'store' THEN warranty_months ELSE 0 END, card_interest = LEAST($3::numeric, surcharge), cash_amount = $4::numeric WHERE id = $1",
    [orderId, body.warrantyType, body.cardInterest, isCash ? cashAmount : null],
  );

  // 3. Inserir itens da venda e dar BAIXA NO ESTOQUE
  for (const line of linesWithCosts) {
    const lineId = `LIN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await client.query(
      `INSERT INTO sales_order_lines (
        id, sale_id, order_id, stock_id, name, qty, unit_price, total_price, unit_cost, total_cost, imei, is_ad_hoc, item_type, attributes
      ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
        JSON.stringify(line.attributes),
      ],
    );

    await client.query('UPDATE sales_order_lines SET pickup_kind=$2, campaign_id=$3, campaign_name=$4, discount_amount=$5 WHERE id=$1',[lineId,line.pickupKind||'',line.campaignId||null,line.campaignName||'',line.discount||0]);
    await recordPickup(client,storeId,orderId,body,line);
    if (line.stockId && line.pickupKind!=='order') {
      const soldVariationId = await changeVariationQuantity(client,storeId,line.stockId,line.attributes,-line.qty);
      // Marca o aparelho vendido (IMEI informado ou a entrada mais antiga): ele deixa de estar em estoque.
      await markUnitsSold(client, { storeId, stockId: line.stockId, variationId: soldVariationId, qty: line.qty, imei: line.imei, saleId: orderId, lineId, unitPrice: line.unitPrice, operator: operator });
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
          body.sellerName || operator,
          `Venda Externa #${orderId} - Cliente: ${body.customerName}`,
        ],
      );
    }
  }

  // Custo e lucro pelos aparelhos que realmente saíram (IMEI ou entrada mais antiga).
  await applyRealSaleCost(client, storeId, orderId, storeRevenue);

  // 4. Se houver UPGRADE / TRADE-IN: dar ENTRADA no estoque do aparelho usado
  let createdTradeInStockId: string | null = null;
  // Aparelho da troca já cadastrado (mesmo IMEI): registra só o crédito, sem duplicar o estoque.
  const tradeInImei = body.tradeIn?.imei?.trim() ?? '';
  const keptTradeInId = body.tradeIn && body.tradeIn.tradeValue > 0 ? options.keepTradeInId ?? null : null;
  const alreadyInStock = keptTradeInId ? null : await findEntryByImei(client, storeId, tradeInImei);
  if (body.tradeIn && keptTradeInId) {
    await updateKeptTradeIn(client, storeId, orderId, keptTradeInId, body);
  } else if (body.tradeIn && body.tradeIn.tradeValue > 0 && alreadyInStock) {
    await client.query(
      `INSERT INTO sale_trade_ins (id, sale_id, store_id, device_name, imei, capacity, color, condition_state, notes, trade_value, stock_item_id, status, received_by_seller_id, customer_id, stock_preexisting)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'received', $12, $13, true)`,
      [
        `TI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, orderId, storeId, body.tradeIn.deviceName, tradeInImei, body.tradeIn.capacity, body.tradeIn.color,
        body.tradeIn.conditionState, [body.tradeIn.notes, 'Aparelho já estava cadastrado no estoque (entrada anterior com este IMEI).'].filter(Boolean).join(' · '),
        body.tradeIn.tradeValue, alreadyInStock.stock_item_id, body.sellerId || null, body.customerId || null,
      ],
    );
  } else if (body.tradeIn && body.tradeIn.tradeValue > 0) {
    if (body.tradeIn.brand) {
      const brand = await client.query('SELECT 1 FROM store_brands WHERE store_id = $1 AND slug = $2 AND active = true', [storeId, body.tradeIn.brand]);
      if (!brand.rows[0]) throw Object.assign(new Error('Selecione uma marca ativa cadastrada nesta loja.'), { status: 400 });
    }

    // Já existe produto com esse nome? O aparelho entra no estoque dele (sem cadastro duplicado).
    const merged = await receiveTradeInIntoExistingProduct(client, storeId, body.tradeIn);
    const tradeInItemId = merged?.stockId ?? `STK-USED-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    createdTradeInStockId = tradeInItemId;

    // Senão, cria o aparelho usado no estoque com custo = tradeValue e quantidade 1
    if (!merged) await client.query(
      `INSERT INTO stock_items (
        id, store_id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
        kind, condition, category, brand, active, color, capacity, attrs, images
      ) VALUES ($1, $2, $3, $4, '', $5, 'UN', 1, 0, $6, $7, 'device', 'used', 'Smartphones Usados', $11, true, $8, $9, $10, '[]'::jsonb)`,
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
        body.tradeIn.brand,
      ],
    );

    // Movimentação de ENTRADA do usado no Kardex
    const tradeMovId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await client.query(
      `INSERT INTO stock_movements (
        id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes
      ) VALUES ($1, $2, $3, 'in', 1, $8::int, $8::int + 1, $4, 'trade_in', $5, $6, $7)`,
      [
        tradeMovId,
        storeId,
        tradeInItemId,
        body.tradeIn.tradeValue,
        orderId,
        body.sellerName || operator,
        `Entrada Aparelho Usado (Trade-in / Upgrade) - Venda #${orderId}`,
        merged?.previousQty ?? 0,
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
    if (merged) {
      await client.query('UPDATE sale_trade_ins SET stock_merged = true, stock_attributes = $2::jsonb WHERE id = $1', [tradeInRecordId, JSON.stringify(merged.attributes)]);
    }
    // O aparelho vira uma entrada do estoque: cliente como origem e as observações da troca.
    await recordTradeInEntry(client, storeId, {
      stockId: tradeInItemId,
      variationId: merged?.variationId ?? null,
      customerId: body.customerId || null,
      customerName: body.customerName,
      tradeValue: body.tradeIn.tradeValue,
      imei: body.tradeIn.imei,
      notes: body.tradeIn.notes,
      batteryLevel: body.tradeIn.batteryLevel ?? null,
      refId: tradeInRecordId,
    });
  }

  // 5–7. Cada meio de pagamento: sale_payments, contas a receber (parcelas a cada 30 dias quando parcelado)
  // e, à vista, o lançamento no livro caixa.
  const multiple = payments.length > 1;
  for (const [index, payment] of payments.entries()) {
    const label = multiple ? `${payment.method}${payment.installments > 1 ? ` ${payment.installments}x` : ''}` : body.paymentMethod;
    const payId = `PAY-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`;
    await client.query(
      `INSERT INTO sale_payments (id, sale_id, method_name, method, amount, installments, card_interest, created_at)
       VALUES ($1, $2, $3, $3, $4::numeric, $5::int, $6::numeric, now() + ($7::int * interval '1 millisecond'))`,
      [payId, orderId, payment.method, payment.amount, payment.installments, payment.cardInterest, index],
    );

    if (payment.installments > 1) {
      const installmentAmount = round2(payment.amount / payment.installments);
      let runningTotal = 0;
      for (let i = 1; i <= payment.installments; i++) {
        const recId = `REC-${Date.now().toString(36)}-${index}-${i}-${Math.random().toString(36).slice(2, 5)}`;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + i * 30);
        const currAmount = i === payment.installments ? round2(payment.amount - runningTotal) : installmentAmount;
        runningTotal += currAmount;
        await client.query(
          `INSERT INTO receivables (
            id, store_id, description, customer_id, customer_name, category, amount,
            received_amount, due_date, status, sale_id, notes
          ) VALUES ($1, $2, $3, $4, $5, 'Vendas Externas', $6, 0, $7, 'open', $8, $9)`,
          [
            recId,
            storeId,
            `Venda #${orderId} (${i}/${payment.installments}) - ${multiple ? payment.method : body.paymentMethod}`,
            body.customerId || null,
            body.customerName,
            currAmount,
            dueDate.toISOString().slice(0, 10),
            orderId,
            `Parcela ${i} de ${payment.installments} da Venda Externa #${orderId}`,
          ],
        );
      }
      continue;
    }

    // À vista (Dinheiro, PIX, Débito, Cartão 1x): recebido na hora e no livro caixa.
    const recId = `REC-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`;
    await client.query(
      `INSERT INTO receivables (
        id, store_id, description, customer_id, customer_name, category, amount,
        received_amount, due_date, status, sale_id, received_at, notes
      ) VALUES ($1, $2, $3, $4, $5, 'Vendas Externas', $6, $6, $7, 'paid', $8, now(), $9)`,
      [
        recId,
        storeId,
        `Venda Externa #${orderId} - ${label}`,
        body.customerId || null,
        body.customerName,
        payment.amount,
        today,
        orderId,
        isCashMethod(payment.method) ? 'Recebimento externo em dinheiro (aguardando recolhimento)' : 'Recebimento confirmado',
      ],
    );
    const entId = `ENT-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`;
    await client.query(
      `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, category, operator_name)
       VALUES ($1, $2, 'in', $3, $4, 'manual', $5, 'Vendas Externas', $6)`,
      [entId, storeId, `Venda Externa #${orderId} - ${body.customerName} (${label})`, payment.amount, orderId, body.sellerName || operator],
    );
  }
  if (saleAt && body.saleDate) await moveSaleToDate(client, { storeId, saleId: orderId, saleDate: body.saleDate, saleAt, today });

  return {
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
    payments,
    cashAmount: isCash ? cashAmount : 0,
    costTotal: totalCost,
    grossProfit,
    marginPercent,
    externalCashStatus,
    tradeInStockId: createdTradeInStockId,
    warrantyMonths: body.warrantyMonths,
    linesCount: body.lines.length,
    createdAt: saleAt ?? nowIso,
  };
}
