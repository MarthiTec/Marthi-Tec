import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

type Db = Pick<PoolClient, 'query'>;
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

/**
 * Marca as unidades que a venda tirou do estoque. Com IMEI informado, é aquele aparelho (e ele não
 * pode ter sido vendido antes). O restante sai da entrada mais antiga da mesma variação que ainda
 * tem unidade sem venda — preferindo os IMEIs ainda não vendidos dessa entrada.
 */
export async function markUnitsSold(
  db: Db,
  input: { storeId: string; stockId: string; variationId: string | null; qty: number; imei?: string; saleId: string; lineId?: string | null },
) {
  const qty = Math.max(0, Math.floor(Number(input.qty) || 0));
  if (!qty) return;
  const imei = (input.imei ?? '').trim();
  let remaining = qty;

  if (imei) {
    const sold = (await db.query('SELECT sale_id FROM stock_sold_units WHERE store_id = $1 AND imei = $2', [input.storeId, imei])).rows[0];
    if (sold) throw httpError(`O aparelho de IMEI ${imei} já foi vendido e não está mais no estoque.`, 409);
    const entry = (
      await db.query(
        `SELECT id, variation_id FROM stock_supplier_entries WHERE store_id = $1 AND stock_item_id = $2 AND imeis ? $3 LIMIT 1`,
        [input.storeId, input.stockId, imei],
      )
    ).rows[0];
    if (entry) {
      await insert(db, input, entry.variation_id ?? input.variationId, entry.id, imei);
      remaining -= 1;
    }
  }

  if (!remaining) return;
  // Entradas da mesma variação (ou do produto simples), da mais antiga para a mais nova, com o que já saiu de cada uma.
  const entries = (
    await db.query(
      `SELECT e.id, e.variation_id, e.qty, e.imeis,
              COALESCE((SELECT jsonb_agg(u.imei) FROM stock_sold_units u WHERE u.entry_id = e.id AND u.imei <> ''), '[]'::jsonb) AS sold_imeis,
              (SELECT count(*) FROM stock_sold_units u WHERE u.entry_id = e.id)::int AS sold
         FROM stock_supplier_entries e
        WHERE e.store_id = $1 AND e.stock_item_id = $2 AND e.variation_id IS NOT DISTINCT FROM $3
        ORDER BY e.entry_date, e.created_at
        FOR UPDATE OF e`,
      [input.storeId, input.stockId, input.variationId],
    )
  ).rows;
  for (const entry of entries) {
    let free = (Number(entry.qty) || 0) - (Number(entry.sold) || 0);
    const soldImeis = new Set<string>((entry.sold_imeis ?? []).map(String));
    const freeImeis = (Array.isArray(entry.imeis) ? entry.imeis.map(String) : []).filter((value: string) => !soldImeis.has(value));
    while (free > 0 && remaining > 0) {
      await insert(db, input, entry.variation_id ?? input.variationId, entry.id, freeImeis.shift() ?? '');
      free -= 1;
      remaining -= 1;
    }
    if (!remaining) break;
  }
  // Estoque sem entrada registrada (saldo inicial, ajuste): a venda segue, só não há aparelho para marcar.
}

async function insert(
  db: Db,
  input: { storeId: string; stockId: string; saleId: string; lineId?: string | null },
  variationId: string | null,
  entryId: string | null,
  imei: string,
) {
  await db.query(
    `INSERT INTO stock_sold_units (id, store_id, stock_item_id, variation_id, entry_id, imei, sale_id, sale_line_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [`SOLD-${randomUUID()}`, input.storeId, input.stockId, variationId, entryId, imei, input.saleId, input.lineId ?? null],
  );
}

/** Venda cancelada: os aparelhos voltam a ficar "em estoque". */
export async function unmarkSaleUnits(db: Db, storeId: string, saleId: string) {
  await db.query('DELETE FROM stock_sold_units WHERE store_id = $1 AND sale_id = $2', [storeId, saleId]);
}

/** Vendas de cada entrada: quantas unidades e quais IMEIs já saíram (com a data da venda). */
export async function soldByEntry(db: Db, storeId: string, entryIds: string[]) {
  const map = new Map<string, { qty: number; imeis: Array<{ imei: string; saleId: string; soldAt: string }> }>();
  if (!entryIds.length) return map;
  const rows = (
    await db.query('SELECT entry_id, imei, sale_id, sold_at FROM stock_sold_units WHERE store_id = $1 AND entry_id = ANY($2::text[]) ORDER BY sold_at', [storeId, entryIds])
  ).rows;
  for (const row of rows) {
    const current = map.get(row.entry_id) ?? { qty: 0, imeis: [] };
    current.qty += 1;
    if (row.imei) current.imeis.push({ imei: row.imei, saleId: row.sale_id, soldAt: row.sold_at instanceof Date ? row.sold_at.toISOString() : String(row.sold_at) });
    map.set(row.entry_id, current);
  }
  return map;
}

/** Não deixa tirar da entrada um aparelho que já foi vendido (nem apagar a entrada com unidades vendidas). */
export async function assertSoldUnitsKept(db: Db, storeId: string, stockId: string, kept: Array<{ id?: string; qty: number; imeis: string[] }>) {
  const rows = (await db.query('SELECT entry_id, imei FROM stock_sold_units WHERE store_id = $1 AND stock_item_id = $2 AND entry_id IS NOT NULL', [storeId, stockId])).rows;
  if (!rows.length) return;
  const byId = new Map(kept.filter((entry) => entry.id).map((entry) => [entry.id as string, entry]));
  const soldCount = new Map<string, number>();
  for (const row of rows) {
    const entry = byId.get(row.entry_id);
    if (!entry) throw httpError('Esta entrada tem aparelho vendido e não pode ser removida. Cancele a venda antes.', 409);
    if (row.imei && !entry.imeis.includes(row.imei)) throw httpError(`O IMEI ${row.imei} já foi vendido e não pode sair da entrada.`, 409);
    soldCount.set(row.entry_id, (soldCount.get(row.entry_id) ?? 0) + 1);
  }
  for (const [id, sold] of soldCount) {
    const entry = byId.get(id)!;
    if (entry.qty < sold) throw httpError(`A entrada tem ${sold} unidade(s) vendida(s); a quantidade não pode ficar menor que isso.`, 409);
  }
}
