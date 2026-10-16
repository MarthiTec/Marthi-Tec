import type { PoolClient } from 'pg';

/**
 * Regras das contas a pagar e a receber (como num ERP financeiro): conta com baixa precisa de
 * estorno antes de excluir ou mudar o valor, e conta gerada por outro módulo (venda, entrada de
 * estoque) é corrigida na origem — senão o financeiro deixa de bater com a venda ou o estoque.
 */
type Db = Pick<PoolClient, 'query'>;
export type BillKind = 'payable' | 'receivable';
const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

/** Conta, quanto já foi baixado e de onde ela veio. */
async function loadBill(db: Db, kind: BillKind, storeId: string, id: string) {
  const sql =
    kind === 'payable'
      ? `SELECT p.amount, p.paid_amount AS settled, (SELECT e.id FROM stock_supplier_entries e WHERE e.store_id = p.store_id AND e.payable_id = p.id LIMIT 1) AS stock_entry_id, NULL AS sale_id
           FROM payables p WHERE p.id = $1 AND p.store_id = $2`
      : `SELECT r.amount, r.received_amount AS settled, NULL AS stock_entry_id, r.sale_id
           FROM receivables r WHERE r.id = $1 AND r.store_id = $2`;
  const bill = (await db.query(sql, [id, storeId])).rows[0];
  if (!bill) throw httpError('Conta não encontrada nesta loja.', 404);
  return { amount: Number(bill.amount) || 0, settled: Number(bill.settled) || 0, stockEntryId: bill.stock_entry_id as string | null, saleId: bill.sale_id as string | null };
}

function originMessage(bill: { stockEntryId: string | null; saleId: string | null }, action: string) {
  if (bill.saleId) return `Conta gerada pela venda ${bill.saleId}: para ${action}, corrija ou cancele a venda.`;
  if (bill.stockEntryId) return `Conta gerada pela entrada de estoque: para ${action}, ajuste a entrada do produto.`;
  return '';
}

/** Excluir: só conta sem baixa e que não veio de venda ou de entrada de estoque. */
export async function assertBillDeletable(db: Db, kind: BillKind, storeId: string, id: string) {
  const bill = await loadBill(db, kind, storeId, id);
  if (bill.settled > 0) throw httpError('Conta com baixa: estorne a baixa antes de excluir.', 409);
  const origin = originMessage(bill, 'excluir');
  if (origin) throw httpError(origin, 409);
}

/** Mudar o valor: só sem baixa e fora de venda/entrada de estoque. Os outros dados podem ser editados. */
export async function assertBillAmountEditable(db: Db, kind: BillKind, storeId: string, id: string, amount: number | undefined) {
  if (amount === undefined) return;
  const bill = await loadBill(db, kind, storeId, id);
  if (Math.abs(bill.amount - amount) < 0.005) return;
  if (bill.settled > 0) throw httpError('Conta com baixa: estorne a baixa antes de mudar o valor.', 409);
  const origin = originMessage(bill, 'mudar o valor');
  if (origin) throw httpError(origin, 409);
}

/**
 * Estornar recebimento: a venda à vista já nasce recebida e o caixa fica ligado à venda, não à
 * conta; esse recebimento é corrigido pela venda (correção ou cancelamento).
 */
export async function assertBillRevertible(db: Db, kind: BillKind, storeId: string, id: string) {
  if (kind !== 'receivable') return;
  const bill = await loadBill(db, kind, storeId, id);
  if (!bill.saleId) return;
  const own = await db.query('SELECT 1 FROM finance_entries WHERE store_id = $1 AND ref_id = $2 LIMIT 1', [storeId, id]);
  if (!own.rows.length) throw httpError(`Recebimento feito na própria venda ${bill.saleId}: corrija ou cancele a venda.`, 409);
}
