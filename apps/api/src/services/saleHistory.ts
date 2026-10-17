import type { PoolClient } from 'pg';
import { primaryImei } from './imeiPairs.js';

/**
 * Venda com a data em que aconteceu e com o custo dos aparelhos que realmente saíram do estoque.
 * Usado pela venda externa: lançamento de histórico (vendas antigas) e lucro por aparelho.
 */
type Db = Pick<PoolClient, 'query'>;

const DAY_MS = 86_400_000;
/** Até quantos dias atrás a gestão pode lançar uma venda que já aconteceu. */
export const MAX_BACKDATE_DAYS = 120;
/** Hora gravada na venda lançada com data anterior: meio-dia no horário de Brasília. */
const BACKDATED_TIME = 'T12:00:00-03:00';
/** Papéis da gestão da loja: lançam venda passada, trocam vendedor e cancelam venda. */
const MANAGEMENT_ROLES = ['admin', 'superadmin', 'manager'];

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

export const isStoreManagement = (role: unknown) => MANAGEMENT_ROLES.includes(String(role ?? ''));

/**
 * Momento da venda informada (AAAA-MM-DD): null quando não veio ou é hoje. Só a gestão lança;
 * não pode ser futura nem passar de MAX_BACKDATE_DAYS.
 */
export function resolveSaleMoment(saleDate: string | undefined, role: unknown, today: string): string | null {
  if (!saleDate) return null;
  if (!isStoreManagement(role)) throw httpError('Só a gestão da loja lança venda com data anterior.', 403);
  const oldest = new Date(Date.now() - MAX_BACKDATE_DAYS * DAY_MS).toISOString().slice(0, 10);
  if (saleDate > today) throw httpError('A data da venda não pode ser no futuro.', 422);
  if (saleDate < oldest) throw httpError(`Lance vendas de até ${MAX_BACKDATE_DAYS} dias atrás.`, 422);
  return saleDate < today ? new Date(saleDate + BACKDATED_TIME).toISOString() : null;
}

/** Entrada da loja com esse IMEI (o aparelho já foi cadastrado no estoque), a mais recente. */
export async function findEntryByImei(db: Db, storeId: string, imei: string): Promise<{ id: string; stock_item_id: string } | null> {
  if (!imei.trim()) return null;
  imei = await primaryImei(db, storeId, imei);
  const result = await db.query(
    `SELECT x.id, x.stock_item_id FROM stock_supplier_entries x CROSS JOIN LATERAL jsonb_array_elements_text(x.imeis) AS e(imei)
      WHERE x.store_id = $1 AND e.imei = $2 ORDER BY x.entry_date DESC, x.created_at DESC LIMIT 1`,
    [storeId, imei.trim()],
  );
  return result.rows[0] ?? null;
}

/**
 * Custo real da venda: o das entradas das unidades que saíram (pelo IMEI ou pela entrada mais
 * antiga). Atualiza itens, movimentos de saída e custo, lucro e margem da venda.
 * storeRevenue: valor da venda sem os juros do cartão (esses são da operadora).
 */
export async function applyRealSaleCost(db: Db, storeId: string, saleId: string, storeRevenue: number) {
  const lines = await db.query(
    `UPDATE sales_order_lines l SET unit_cost = x.cost, total_cost = round(x.cost * l.qty, 2)
       FROM (SELECT u.sale_line_id, avg(e.unit_cost) AS cost
               FROM stock_sold_units u JOIN stock_supplier_entries e ON e.id = u.entry_id
              WHERE u.store_id = $1 AND u.sale_id = $2 AND u.reverted_at IS NULL
              GROUP BY u.sale_line_id) x
      WHERE l.id = x.sale_line_id AND (l.sale_id = $2 OR l.order_id = $2)
      RETURNING l.id`,
    [storeId, saleId],
  );
  if (!lines.rows.length) return;
  await db.query(
    `UPDATE stock_movements m SET unit_cost = x.cost, cost = x.cost
       FROM (SELECT stock_id, avg(unit_cost) AS cost FROM sales_order_lines WHERE sale_id = $2 OR order_id = $2 GROUP BY stock_id) x
      WHERE m.store_id = $1 AND m.ref_id = $2 AND m.type = 'sale' AND m.stock_id = x.stock_id`,
    [storeId, saleId],
  );
  const cost = Number((await db.query('SELECT COALESCE(sum(total_cost), 0) AS cost FROM sales_order_lines WHERE sale_id = $1 OR order_id = $1', [saleId])).rows[0].cost) || 0;
  const profit = Math.round((storeRevenue - cost) * 100) / 100;
  const margin = storeRevenue > 0 ? Math.round((profit / storeRevenue) * 10000) / 100 : 0;
  await db.query('UPDATE sales_orders SET cost_total = $2, gross_profit = $3, margin_percent = $4 WHERE id = $1', [saleId, cost, profit, margin]);
}

/**
 * Leva para a data da venda tudo o que ela gerou: venda, pagamento, movimentos, caixa, unidades
 * vendidas, recebíveis (vencimentos deslocados) e a entrada dos aparelhos de troca.
 * Casts explícitos: em produção algumas colunas são timestamp sem fuso e o vencimento é texto.
 */
export async function moveSaleToDate(db: Db, input: { storeId: string; saleId: string; saleDate: string; saleAt: string; today: string }) {
  const { storeId, saleId, saleDate, saleAt, today } = input;
  const shiftDays = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${saleDate}T12:00:00Z`)) / DAY_MS);
  await db.query('UPDATE sales_orders SET created_at = $2::timestamptz, updated_at = $2::timestamptz WHERE id = $1', [saleId, saleAt]);
  await db.query('UPDATE sale_payments SET created_at = $2::timestamptz WHERE sale_id = $1', [saleId, saleAt]);
  await db.query('UPDATE stock_movements SET created_at = $3::timestamptz WHERE store_id = $1 AND ref_id = $2', [storeId, saleId, saleAt]);
  await db.query('UPDATE finance_entries SET created_at = $3::timestamptz WHERE store_id = $1 AND ref_id = $2', [storeId, saleId, saleAt]);
  await db.query('UPDATE stock_sold_units SET sold_at = $3::timestamptz WHERE store_id = $1 AND sale_id = $2', [storeId, saleId, saleAt]);
  await db.query(
    `UPDATE receivables SET created_at = $3::timestamptz, due_date = due_date::date - $4::int,
            received_at = CASE WHEN received_at IS NULL THEN NULL ELSE $3::timestamptz END
      WHERE store_id = $1 AND sale_id = $2`,
    [storeId, saleId, saleAt, shiftDays],
  );
  const tradeIns = (await db.query('UPDATE sale_trade_ins SET created_at = $2::timestamptz WHERE sale_id = $1 RETURNING id', [saleId, saleAt])).rows.map((row) => row.id);
  if (tradeIns.length) {
    await db.query('UPDATE stock_supplier_entries SET entry_date = $3::date, created_at = $4::timestamptz WHERE store_id = $1 AND ref_id = ANY($2::text[])', [storeId, tradeIns, saleDate, saleAt]);
  }
}
