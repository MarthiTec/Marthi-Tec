import type { PoolClient } from 'pg';

type Db = Pick<PoolClient, 'query'>;
const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

/**
 * Renomeia um valor de atributo (ex.: "roxo-profundo" → "Roxo-profundo") e leva o novo nome para
 * as variações e os atributos dos produtos da loja. Se o novo nome já existe no atributo, os dois
 * valores viram um só. Vendas já feitas guardam o nome da época (histórico).
 */
export async function renameAttributeValue(db: Db, storeId: string, attributeId: string, from: string, to: string) {
  if (from === to) return;
  const values = (await db.query('SELECT id, value FROM product_attribute_values WHERE attribute_id = $1', [attributeId])).rows;
  const source = values.find((row) => row.value === from);
  if (!source) throw httpError(`O valor "${from}" não existe neste atributo.`, 404);
  const target = values.find((row) => row.value === to);

  // Juntar dois valores não pode deixar um produto com duas variações iguais.
  const clash = await db.query(
    `SELECT s.name FROM stock_item_variations a
       JOIN stock_item_variations b ON b.stock_item_id = a.stock_item_id AND b.id <> a.id
       JOIN stock_items s ON s.id = a.stock_item_id
      WHERE a.store_id = $1 AND a.attrs ->> $2::text = $3::text AND b.attrs ->> $2::text = $4::text
        AND (a.attrs - $2::text) = (b.attrs - $2::text) AND COALESCE(a.condition, '') = COALESCE(b.condition, '')
      LIMIT 1`,
    [storeId, attributeId, from, to],
  );
  if (clash.rows[0]) throw httpError(`"${clash.rows[0].name}" já tem a variação "${to}" igual à "${from}": junte as duas no produto antes de renomear.`, 409);

  if (target) {
    await db.query('UPDATE product_allowed_values SET value_id = $2 WHERE value_id = $1', [source.id, target.id]);
    await db.query('DELETE FROM product_attribute_values WHERE id = $1', [source.id]);
  } else {
    await db.query('UPDATE product_attribute_values SET value = $2 WHERE id = $1', [source.id, to]);
  }

  await db.query(
    `UPDATE stock_item_variations SET attrs = jsonb_set(attrs, ARRAY[$2::text], to_jsonb($4::text)), updated_at = now()
      WHERE store_id = $1 AND attrs ->> $2::text = $3::text`,
    [storeId, attributeId, from, to],
  );
  // Grade gravada no próprio produto.
  await db.query(
    `UPDATE stock_items s
        SET variations = (
              SELECT jsonb_agg(CASE WHEN v -> 'attrs' ->> $2::text = $3::text THEN jsonb_set(v, ARRAY['attrs', $2::text], to_jsonb($4::text)) ELSE v END ORDER BY o)
                FROM jsonb_array_elements(s.variations) WITH ORDINALITY AS e(v, o)
            ),
            updated_at = now()
      WHERE s.store_id = $1 AND jsonb_typeof(s.variations) = 'array'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.variations) AS e(v) WHERE v -> 'attrs' ->> $2::text = $3::text)`,
    [storeId, attributeId, from, to],
  );
  // Atributos do produto sem grade: um valor ou a lista de valores.
  await db.query(
    `UPDATE stock_items
        SET attrs = CASE jsonb_typeof(attrs -> $2::text)
              WHEN 'string' THEN jsonb_set(attrs, ARRAY[$2::text], to_jsonb($4::text))
              ELSE jsonb_set(attrs, ARRAY[$2::text], (
                SELECT COALESCE(jsonb_agg(DISTINCT CASE WHEN x = $3::text THEN $4::text ELSE x END), '[]'::jsonb)
                  FROM jsonb_array_elements_text(attrs -> $2::text) AS x
              ))
            END,
            updated_at = now()
      WHERE store_id = $1
        AND (attrs ->> $2::text = $3::text OR (jsonb_typeof(attrs -> $2::text) = 'array' AND (attrs -> $2::text) ? $3::text))`,
    [storeId, attributeId, from, to],
  );
}
