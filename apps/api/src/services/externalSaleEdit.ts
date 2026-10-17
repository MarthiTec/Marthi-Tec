import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { changeVariationQuantity } from './variationInventory.js';
import { saleCardInterest, stripCardInterestNote } from './receiptCustomerView.js';

/**
 * Correção de venda externa já concluída: desfaz tudo o que a venda gerou (estoque, IMEIs, troca,
 * recebíveis, caixa) para a venda corrigida ser gravada de novo com o mesmo número, e guarda a
 * venda completa antes e depois.
 */
type Db = Pick<PoolClient, 'query'>;
const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

/** Venda completa (para o histórico da correção). */
export async function saleSnapshot(db: Db, storeId: string, saleId: string) {
  const rows = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows;
  const [sale] = await rows('SELECT * FROM sales_orders WHERE id = $1 AND store_id = $2', [saleId, storeId]);
  return {
    sale,
    lines: await rows('SELECT * FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1 ORDER BY id', [saleId]),
    payments: await rows('SELECT * FROM sale_payments WHERE sale_id = $1', [saleId]),
    tradeIns: await rows('SELECT * FROM sale_trade_ins WHERE sale_id = $1 AND store_id = $2', [saleId, storeId]),
    receivables: await rows('SELECT * FROM receivables WHERE sale_id = $1 AND store_id = $2 ORDER BY due_date', [saleId, storeId]),
    units: await rows('SELECT * FROM stock_sold_units WHERE sale_id = $1 AND store_id = $2 AND reverted_at IS NULL', [saleId, storeId]),
  };
}

/**
 * Desfaz o aparelho recebido na troca (usado no cancelamento e na correção). Aparelho já
 * revendido ou movimentado não volta: a operação para e pede conferência do estoque.
 */
export async function reverseTradeIn(db: Db, storeId: string, saleId: string, trade: any, operator: string, note: string) {
  if (trade.stock_preexisting) {
    // O aparelho já estava no estoque antes da venda: sai só o crédito da troca.
  } else if (trade.stock_item_id && trade.stock_merged) {
    // Aparelho que entrou num produto já existente: sai só a unidade da troca.
    const item = await db.query('SELECT qty FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE', [trade.stock_item_id, storeId]);
    if (!item.rows.length || Number(item.rows[0].qty) < 1 || trade.status === 'resold') throw httpError('Aparelho da troca já movimentado; confira o estoque antes de desfazer a troca.', 409);
    const attributes = Array.isArray(trade.stock_attributes) ? trade.stock_attributes : [];
    if (attributes.length) await changeVariationQuantity(db, storeId, trade.stock_item_id, attributes, -1);
    const previous = Number(item.rows[0].qty);
    await db.query('UPDATE stock_items SET qty = qty - 1, updated_at = now() WHERE id = $1 AND store_id = $2', [trade.stock_item_id, storeId]);
    await db.query(
      `INSERT INTO stock_movements (id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes)
       VALUES ($1, $2, $3, 'out', 1, $4, $5, $6, 'trade_in_reversal', $7, $8, $9)`,
      [`MOV-${randomUUID()}`, storeId, trade.stock_item_id, previous, previous - 1, Number(trade.trade_value) || 0, saleId, operator, note],
    );
    await db.query('DELETE FROM stock_supplier_entries WHERE store_id = $1 AND ref_id = $2', [storeId, trade.id]);
  } else if (trade.stock_item_id) {
    const item = await db.query('SELECT qty FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE', [trade.stock_item_id, storeId]);
    if (!item.rows.length || Number(item.rows[0].qty) !== 1 || trade.status === 'resold') throw httpError('Aparelho da troca já movimentado; confira o estoque antes de desfazer a troca.', 409);
    await db.query('UPDATE stock_items SET active = false, qty = 0, updated_at = now() WHERE id = $1 AND store_id = $2', [trade.stock_item_id, storeId]);
    await db.query('DELETE FROM stock_supplier_entries WHERE store_id = $1 AND ref_id = $2', [storeId, trade.id]);
  }
  await db.query(`UPDATE sale_trade_ins SET status = 'cancelled', updated_at = now() WHERE id = $1`, [trade.id]);
}

/**
 * Desfaz a venda para a correção. A troca com o mesmo IMEI na venda corrigida é mantida (o aparelho
 * pode até já ter sido revendido); devolve o id dela para a gravação só atualizar o crédito.
 */
export async function undoExternalSale(db: Db, storeId: string, sale: any, newTradeInImei: string, operator: string) {
  const saleId = sale.id;
  const installments = Number((await db.query('SELECT max(installments) AS n FROM sale_payments WHERE sale_id = $1', [saleId])).rows[0]?.n) || 1;
  if (installments > 1) {
    // Só as parcelas contam: o que foi pago à vista na venda (ex.: PIX + cartão) já nasce recebido.
    const received = await db.query("SELECT 1 FROM receivables WHERE sale_id = $1 AND store_id = $2 AND received_amount > 0 AND notes LIKE 'Parcela %' LIMIT 1", [saleId, storeId]);
    if (received.rows.length) throw httpError('Esta venda tem parcela já recebida: estorne o recebimento no Financeiro antes de alterar a venda.', 409);
  }
  const delivered = await db.query("SELECT 1 FROM pickup_requests WHERE store_id = $1 AND reference_id = $2 AND status = 'completed' LIMIT 1", [storeId, saleId]);
  if (delivered.rows.length) throw httpError('Encomenda já entregue: registre a devolução pelo estoque antes de alterar a venda.', 409);

  // Aparelhos e quantidades voltam ao estoque.
  await db.query('DELETE FROM stock_sold_units WHERE store_id = $1 AND sale_id = $2', [storeId, saleId]);
  const lines = (await db.query('SELECT * FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1', [saleId])).rows;
  for (const line of lines) {
    if (!line.stock_id || line.pickup_kind === 'order') continue;
    await changeVariationQuantity(db, storeId, line.stock_id, line.attributes, Number(line.qty));
    await db.query('UPDATE stock_items SET qty = qty + $3, updated_at = now() WHERE id = $1 AND store_id = $2', [line.stock_id, storeId, Number(line.qty)]);
  }

  // Troca: mantida se o mesmo aparelho continua na venda; senão é desfeita.
  let keptTradeInId: string | null = null;
  for (const trade of (await db.query("SELECT * FROM sale_trade_ins WHERE sale_id = $1 AND store_id = $2 AND status <> 'cancelled'", [saleId, storeId])).rows) {
    if (!keptTradeInId && newTradeInImei && String(trade.imei ?? '').trim() === newTradeInImei) {
      keptTradeInId = trade.id;
      continue;
    }
    await reverseTradeIn(db, storeId, saleId, trade, operator, 'Troca desfeita na correção da venda');
    await db.query('DELETE FROM sale_trade_ins WHERE id = $1', [trade.id]);
  }

  // O que a venda gerou é gravado de novo pela venda corrigida.
  const keepTradeInMove = keptTradeInId ? "AND ref_type <> 'trade_in'" : '';
  await db.query(`DELETE FROM stock_movements WHERE store_id = $1 AND ref_id = $2 ${keepTradeInMove}`, [storeId, saleId]);
  await db.query('DELETE FROM receivables WHERE store_id = $1 AND sale_id = $2', [storeId, saleId]);
  await db.query('DELETE FROM finance_entries WHERE store_id = $1 AND ref_id = $2', [storeId, saleId]);
  await db.query('DELETE FROM sale_payments WHERE sale_id = $1', [saleId]);
  await db.query('DELETE FROM pickup_requests WHERE store_id = $1 AND reference_id = $2', [storeId, saleId]);
  await db.query('DELETE FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1', [saleId]);
  return { keptTradeInId };
}

/** Dados da venda no formato do formulário da venda externa (para corrigir). */
export async function saleForEdit(db: Db, storeId: string, saleId: string) {
  const sale = (
    await db.query(
      `SELECT s.*, to_char(s.created_at::timestamptz AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS sale_date
         FROM sales_orders s WHERE s.id = $1 AND s.store_id = $2`,
      [saleId, storeId],
    )
  ).rows[0];
  if (!sale) throw httpError('Venda não encontrada nesta loja.', 404);
  if (sale.sale_type !== 'external') throw httpError('Só vendas externas podem ser alteradas por aqui.', 409);
  if (sale.status === 'cancelled') throw httpError('Venda cancelada não pode ser alterada.', 409);
  const paymentRows = (await db.query('SELECT method_name, method, amount, installments, card_interest FROM sale_payments WHERE sale_id = $1 ORDER BY created_at, id', [saleId])).rows;
  const payment = paymentRows[0];
  const lines = (await db.query('SELECT * FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1 ORDER BY id', [saleId])).rows;
  const trade = (await db.query("SELECT * FROM sale_trade_ins WHERE sale_id = $1 AND store_id = $2 AND status <> 'cancelled' ORDER BY created_at LIMIT 1", [saleId, storeId])).rows[0];
  const battery = trade ? (await db.query("SELECT battery_level FROM stock_supplier_entries WHERE store_id = $1 AND ref_id = $2 LIMIT 1", [storeId, trade.id])).rows[0]?.battery_level ?? null : null;
  const revisions = (await db.query('SELECT id, reason, operator_name, created_at FROM sale_revisions WHERE store_id = $1 AND sale_id = $2 ORDER BY created_at DESC', [storeId, saleId])).rows;
  const cardInterest = saleCardInterest(sale.card_interest, sale.notes);
  return {
    id: sale.id,
    saleDate: sale.sale_date,
    customerId: sale.customer_id,
    customerName: sale.customer_name,
    customerPhone: sale.customer_phone || '',
    customerDocument: sale.customer_document || '',
    sellerId: sale.seller_id,
    paymentMethod: payment?.method_name || sale.payment_name || '',
    installments: Number(payment?.installments) || 1,
    // Cada meio com o valor combinado (sem os juros do cartão; a tela recalcula pela taxa das parcelas).
    payments: paymentRows.map((row) => ({
      method: row.method_name || row.method || '',
      amount: Math.max(0, Math.round(((Number(row.amount) || 0) - (paymentRows.length === 1 ? cardInterest : Number(row.card_interest) || 0)) * 100) / 100),
      installments: Number(row.installments) || 1,
    })),
    discount: Number(sale.discount) || 0,
    // Acréscimo combinado sem os juros do cartão (a tela recalcula os juros pela taxa das parcelas).
    surcharge: Math.max(0, Math.round(((Number(sale.surcharge) || 0) - cardInterest) * 100) / 100),
    cardInterest,
    notes: stripCardInterestNote(sale.notes),
    warrantyType: sale.warranty_type || 'store',
    warrantyMonths: Number(sale.warranty_months) || 0,
    warrantyTerms: sale.warranty_terms || '',
    lines: lines.map((line) => ({
      stockId: line.stock_id,
      name: line.name,
      qty: Number(line.qty) || 1,
      unitPrice: Number(line.unit_price) || 0,
      imei: line.imei || '',
      attributes: Array.isArray(line.attributes) ? line.attributes : [],
    })),
    tradeIn: trade
      ? {
          deviceName: trade.device_name,
          imei: trade.imei || '',
          capacity: trade.capacity || '',
          color: trade.color || '',
          conditionState: trade.condition_state || 'used',
          notes: trade.notes || '',
          batteryLevel: battery,
          tradeValue: Number(trade.trade_value) || 0,
        }
      : null,
    revisions: revisions.map((row) => ({ id: row.id, reason: row.reason, operator: row.operator_name, at: row.created_at })),
  };
}
