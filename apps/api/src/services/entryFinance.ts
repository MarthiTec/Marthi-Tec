import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

type Db = Pick<PoolClient, 'query'>;

/** Como a compra entra no financeiro: já paga (sai do caixa), a pagar (contas a pagar) ou sem lançamento. */
export type EntryPayment = 'paid' | 'pending' | 'none';

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Lança a compra da entrada no contas a pagar (categoria "Compra de mercadorias"), ligada à entrada.
 * Paga: a conta já nasce liquidada e a saída vai para o livro caixa (e debita a conta bancária, se
 * informada). Troca de cliente não gera conta: o valor da troca já é abatido na própria venda.
 */
export async function postEntryPayable(
  db: Db,
  input: {
    storeId: string;
    entryId: string;
    payment?: EntryPayment;
    dueDate?: string | null;
    accountId?: string | null;
    supplierId: string | null;
    supplierName: string;
    productName: string;
    qty: number;
    unitCost: number;
    imeis: string[];
    entryDate: string | null;
    operator: string;
  },
) {
  const payment = input.payment ?? 'pending';
  const amount = round2((Number(input.qty) || 0) * (Number(input.unitCost) || 0));
  if (payment === 'none' || amount <= 0) return null;
  const date = (input.entryDate || new Date().toISOString()).slice(0, 10);
  const due = (input.dueDate || date).slice(0, 10);
  const id = `PAY-${randomUUID()}`;
  const imeiText = input.imeis.length ? ` · IMEI ${input.imeis.join(', ')}` : '';
  const description = `Compra: ${input.productName} · ${input.qty} un${imeiText}`.slice(0, 480);
  await db.query(
    `INSERT INTO payables (id, store_id, description, supplier_id, supplier_name, category, amount, paid_amount, due_date, status, account_id, notes, document_number, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Compra de mercadorias', $6, 0, $7, 'open', $8, $9, $10, now(), now())`,
    [id, input.storeId, description, input.supplierId, input.supplierName, amount, due, input.accountId || null, 'Lançado pela entrada de estoque', input.entryId],
  );
  if (payment === 'paid') {
    await db.query(`UPDATE payables SET status = 'paid', paid_amount = amount, paid_at = $2::date, updated_at = now() WHERE id = $1`, [id, date]);
    await db.query(
      `INSERT INTO finance_entries (id, store_id, type, label, amount, source, ref_id, account_id, category, operator_name)
       VALUES ($1, $2, 'out', $3, $4, 'manual', $5, $6, 'Compra de mercadorias', $7)`,
      [`ENT-${randomUUID()}`, input.storeId, `Baixa total: ${description}`, amount, id, input.accountId || null, input.operator],
    );
    if (input.accountId) await db.query('UPDATE bank_accounts SET current_balance = current_balance - $1 WHERE id = $2 AND store_id = $3', [amount, input.accountId, input.storeId]);
  }
  await db.query('UPDATE stock_supplier_entries SET payable_id = $3 WHERE id = $1 AND store_id = $2', [input.entryId, input.storeId, id]);
  return id;
}

/** Entrada alterada: a conta ainda aberta acompanha a nova quantidade/custo. */
export async function syncEntryPayable(db: Db, storeId: string, entryId: string, qty: number, unitCost: number) {
  await db.query(
    `UPDATE payables p SET amount = $3, updated_at = now()
       FROM stock_supplier_entries e
      WHERE e.id = $1 AND e.store_id = $2 AND p.id = e.payable_id AND p.status = 'open' AND $3 > 0`,
    [entryId, storeId, round2(qty * unitCost)],
  );
}

/** Entrada removida: a conta ainda aberta é cancelada (a já paga continua no financeiro para o estorno manual). */
export async function cancelEntryPayables(db: Db, storeId: string, entryIds: string[]) {
  if (!entryIds.length) return;
  await db.query(
    `UPDATE payables p SET status = 'cancelled', notes = p.notes || ' · Entrada de estoque removida', updated_at = now()
       FROM stock_supplier_entries e
      WHERE e.store_id = $1 AND e.id = ANY($2::text[]) AND p.id = e.payable_id AND p.status = 'open'`,
    [storeId, entryIds],
  );
}
