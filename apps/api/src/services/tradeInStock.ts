import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { attributeValueKey } from './attributeValues.js';

type Db = Pick<PoolClient, 'query'>;

/** Nome comparável: sem acento, maiúsculas, espaços repetidos nem o "(Trade-in)" do cadastro antigo. */
export function productNameKey(value: string) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(\s*trade-?in\s*\)/gi, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const same = (a: unknown, b: unknown) => attributeValueKey(a == null ? '' : String(a)) === attributeValueKey(b == null ? '' : String(b));
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Aparelho da troca com o mesmo nome de um produto ativo da loja: entra no estoque desse produto
 * (na variação de mesma cor/capacidade, ou numa variação nova) em vez de criar um cadastro duplicado.
 * Devolve o produto e a variação usados, ou null quando não existe produto com esse nome.
 */
export async function receiveTradeInIntoExistingProduct(
  db: Db,
  storeId: string,
  tradeIn: { deviceName: string; color?: string; capacity?: string; imei?: string; tradeValue: number },
): Promise<{ stockId: string; previousQty: number; attributes: Array<{ id: string; value: string }> } | null> {
  const key = productNameKey(tradeIn.deviceName);
  if (!key) return null;
  const candidates = await db.query('SELECT id, name, qty, cost, avg_cost, price, variations FROM stock_items WHERE store_id = $1 AND active = true ORDER BY created_at', [storeId]);
  const product = candidates.rows.find((row) => productNameKey(row.name) === key);
  if (!product) return null;
  await db.query('SELECT 1 FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE', [product.id, storeId]);

  const value = Number(tradeIn.tradeValue) || 0;
  const qty = Number(product.qty) || 0;
  const avg = Number(product.avg_cost ?? product.cost) || 0;
  const nextAvg = round2((qty * avg + value) / (qty + 1));
  let attributes: Array<{ id: string; value: string }> = [];

  const variations: any[] = Array.isArray(product.variations) ? product.variations : [];
  if (variations.length) {
    const attrs = (await db.query('SELECT id, name FROM product_attributes WHERE store_id = $1', [storeId])).rows;
    // Atributo usado na grade deste produto (a loja pode ter mais de um "Cor").
    const pick = (pattern: RegExp) => {
      const ids = attrs.filter((a) => pattern.test(String(a.name).trim())).map((a) => String(a.id));
      return ids.find((id) => variations.some((v) => v.attrs && Object.hasOwn(v.attrs, id))) ?? ids[0];
    };
    const colorId = pick(/^cor$/i);
    const capacityId = pick(/^capacidade$/i);
    const wanted: Record<string, string> = {};
    if (colorId && tradeIn.color?.trim()) wanted[colorId] = tradeIn.color.trim();
    if (capacityId && tradeIn.capacity?.trim()) wanted[capacityId] = tradeIn.capacity.trim();
    // Sem cor/capacidade não dá para saber em qual grade entra: cadastro próprio, como antes.
    if (!Object.keys(wanted).length) return null;
    attributes = Object.entries(wanted).map(([id, v]) => ({ id, value: v }));
    const index = variations.findIndex((variation) => Object.entries(wanted).every(([id, val]) => same(variation.attrs?.[id], val)));
    if (index >= 0) {
      const variation = variations[index];
      const vQty = Number(variation.qty) || 0;
      const vCost = round2((vQty * (Number(variation.avgCost ?? variation.cost) || 0) + value) / (vQty + 1));
      variations[index] = { ...variation, qty: vQty + 1, cost: vCost, avgCost: vCost };
      // A grade usa os valores já cadastrados (ex.: "128 GB" do produto, não "128GB" da troca).
      attributes = Object.keys(wanted).map((id) => ({ id, value: String(variation.attrs?.[id] ?? wanted[id]) }));
      if (variation.id) {
        await db.query('UPDATE stock_item_variations SET qty = $4, cost = $5, avg_cost = $5, updated_at = now() WHERE store_id = $1 AND stock_item_id = $2 AND id = $3', [storeId, product.id, variation.id, vQty + 1, vCost]);
      }
    } else {
      const created = {
        id: `var_${randomUUID()}`,
        attrs: wanted,
        price: Number(product.price) || 0,
        cost: value,
        avgCost: value,
        qty: 1,
        minQty: 0,
        condition: 'used',
        barcode: '',
        imei: tradeIn.imei ?? '',
        pickupPrices: {},
      };
      variations.push(created);
      await db.query(
        `INSERT INTO stock_item_variations (id, store_id, stock_item_id, attrs, price, cost, avg_cost, qty, min_qty, condition, imei)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6, 1, 0, 'used', $7)`,
        [created.id, storeId, product.id, JSON.stringify(wanted), created.price, value, created.imei],
      );
    }
    await db.query('UPDATE stock_items SET variations = $3::jsonb WHERE id = $1 AND store_id = $2', [product.id, storeId, JSON.stringify(variations)]);
  }

  await db.query('UPDATE stock_items SET qty = qty + 1, avg_cost = $3, updated_at = now() WHERE id = $1 AND store_id = $2', [product.id, storeId, nextAvg]);
  return { stockId: product.id, previousQty: qty, attributes };
}
