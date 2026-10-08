import { randomUUID } from 'node:crypto';

type Queryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> };

/** "256GB", "256 gb" e "256 GB" são o mesmo valor; "Preto" e "preto" também. */
export function attributeValueKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Garante que cada valor usado (na venda ou no cadastro do produto) exista no atributo da loja.
 * Valor parecido com um existente é trocado pelo cadastrado; valor novo (ex.: cor sugerida pelo
 * catálogo de aparelhos) é criado no atributo, sem travar a venda ou o cadastro.
 * Devolve o valor como ficou gravado no atributo.
 */
export async function ensureAttributeValue(db: Queryable, storeId: string, attributeId: string, rawValue: string) {
  const value = rawValue.trim();
  if (!value) return value;
  const attr = (await db.query('SELECT id FROM product_attributes WHERE id = $1 AND store_id = $2', [attributeId, storeId])).rows[0];
  if (!attr) return value;
  const existing = (await db.query('SELECT value, sort FROM product_attribute_values WHERE attribute_id = $1', [attributeId])).rows;
  const match = existing.find((row) => attributeValueKey(String(row.value)) === attributeValueKey(value));
  if (match) return String(match.value);
  const sort = existing.reduce((max, row) => Math.max(max, Number(row.sort) || 0), -1) + 1;
  await db.query(
    `INSERT INTO product_attribute_values(id, attribute_id, value, price_delta, sort) VALUES($1, $2, $3, 0, $4)
     ON CONFLICT(attribute_id, value) DO NOTHING`,
    [`ATV-${randomUUID()}`, attributeId, value, sort],
  );
  return value;
}

/** Todos os valores de atributo usados por um produto (atributos simples e grade de variações). */
export async function ensureProductAttributeValues(
  db: Queryable,
  storeId: string,
  product: { attrs?: Record<string, unknown> | null; variations?: Array<{ attrs?: Record<string, unknown> | null }> | null },
) {
  const pairs: Array<[string, string]> = [];
  const collect = (attrs?: Record<string, unknown> | null) => {
    for (const [attributeId, raw] of Object.entries(attrs ?? {})) {
      for (const item of Array.isArray(raw) ? raw : [raw]) {
        if (typeof item === 'string' && item.trim()) pairs.push([attributeId, item]);
      }
    }
  };
  collect(product.attrs);
  for (const variation of product.variations ?? []) collect(variation.attrs);
  const seen = new Set<string>();
  for (const [attributeId, value] of pairs) {
    const key = `${attributeId}:${attributeValueKey(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await ensureAttributeValue(db, storeId, attributeId, value);
  }
}
