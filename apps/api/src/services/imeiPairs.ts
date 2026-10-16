import type { PoolClient } from 'pg';

/**
 * Aparelhos com dois IMEIs (dual chip): cada unidade tem o IMEI principal (é ele que conta como 1
 * unidade e aparece na venda) e pode ter um segundo IMEI guardado junto ({ principal: segundo }).
 * Nenhum IMEI se repete na loja, seja principal ou segundo.
 */
type Db = Pick<PoolClient, 'query'>;
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

export type ImeiPairs = Record<string, string>;

/** Pares válidos: o principal está na entrada e o segundo não repete nenhum IMEI dela. */
export function cleanImeiPairs(imeis: string[], pairs: ImeiPairs | undefined): ImeiPairs {
  const out: ImeiPairs = {};
  for (const [primary, secondary] of Object.entries(pairs ?? {})) {
    const second = String(secondary ?? '').replace(/\s+/g, '');
    if (!second) continue;
    if (!imeis.includes(primary)) throw httpError(`O 2º IMEI ${second} está ligado a um IMEI que não está na entrada.`);
    if (second === primary || imeis.includes(second)) throw httpError(`O 2º IMEI ${second} repete um IMEI da entrada.`);
    out[primary] = second;
  }
  const seconds = Object.values(out);
  const dup = seconds.find((value, index) => seconds.indexOf(value) !== index);
  if (dup) throw httpError(`O 2º IMEI ${dup} está repetido.`);
  return out;
}

/** Todos os IMEIs (principais e segundos) de uma lista de entradas. */
export const allImeisOf = (entries: Array<{ imeis: string[]; secondaryImeis?: ImeiPairs }>) =>
  entries.flatMap((entry) => [...entry.imeis, ...Object.values(entry.secondaryImeis ?? {})]);

/** Algum desses IMEIs (principal ou segundo) já é de outro produto da loja? Devolve o primeiro achado. */
export async function takenImei(db: Db, storeId: string, imeis: string[], exceptStockId?: string) {
  if (!imeis.length) return null;
  const row = (
    await db.query(
      `SELECT found.imei, s.name FROM (
         SELECT x.stock_item_id, e.imei FROM stock_supplier_entries x CROSS JOIN LATERAL jsonb_array_elements_text(x.imeis) AS e(imei) WHERE x.store_id = $1
         UNION ALL
         SELECT x.stock_item_id, p.value FROM stock_supplier_entries x CROSS JOIN LATERAL jsonb_each_text(COALESCE(x.imei_pairs, '{}'::jsonb)) AS p(key, value) WHERE x.store_id = $1
       ) found JOIN stock_items s ON s.id = found.stock_item_id
       WHERE found.imei = ANY($2::text[]) AND ($3::text IS NULL OR found.stock_item_id <> $3) LIMIT 1`,
      [storeId, imeis, exceptStockId ?? null],
    )
  ).rows[0];
  return row ? { imei: row.imei as string, name: row.name as string } : null;
}

/** Digitou/leu o 2º IMEI? Devolve o IMEI principal do aparelho (ou o próprio, se não for um segundo). */
export async function primaryImei(db: Db, storeId: string, imei: string) {
  const value = imei.trim();
  if (!value) return value;
  const row = (
    await db.query(
      `SELECT p.key FROM stock_supplier_entries x CROSS JOIN LATERAL jsonb_each_text(COALESCE(x.imei_pairs, '{}'::jsonb)) AS p(key, value)
        WHERE x.store_id = $1 AND p.value = $2 LIMIT 1`,
      [storeId, value],
    )
  ).rows[0];
  return row ? String(row.key) : value;
}
