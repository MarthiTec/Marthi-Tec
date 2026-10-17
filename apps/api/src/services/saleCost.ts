import type { PoolClient } from 'pg';
import { findVariation } from './variationInventory.js';
import { primaryImei } from './imeiPairs.js';

type Db = Pick<PoolClient, 'query'>;
const num = (value: unknown) => Number(value) || 0;

/**
 * Custo unitário de uma linha de venda, do mais certo para o mais genérico:
 * 1. o da entrada do aparelho vendido (pelo IMEI, principal ou 2º);
 * 2. o da variação vendida (cor/capacidade/condição) — cada uma tem o seu custo;
 * 3. o do produto (cadastro).
 * Antes ia sempre o custo do produto, que é o da primeira variação: um iPhone 18 Bordô de R$ 11.000
 * saía com o custo do Preto (R$ 8.900), inflando lucro e comissão.
 */
export async function lineUnitCost(
  db: Db,
  input: { storeId: string; stockId: string; attributes?: Array<{ id: string; value: string }> | null; imei?: string | null },
) {
  const imei = input.imei?.trim() ? await primaryImei(db, input.storeId, input.imei.trim()) : '';
  if (imei) {
    const entry = (
      await db.query(
        `SELECT x.unit_cost FROM stock_supplier_entries x CROSS JOIN LATERAL jsonb_array_elements_text(x.imeis) AS e(imei)
          WHERE x.store_id = $1 AND x.stock_item_id = $2 AND e.imei = $3 ORDER BY x.entry_date DESC, x.created_at DESC LIMIT 1`,
        [input.storeId, input.stockId, imei],
      )
    ).rows[0];
    if (entry && num(entry.unit_cost) > 0) return num(entry.unit_cost);
  }
  const stock = (await db.query('SELECT cost, variations FROM stock_items WHERE id = $1 AND store_id = $2', [input.stockId, input.storeId])).rows[0];
  if (!stock) return 0;
  const variations = Array.isArray(stock.variations) ? stock.variations : [];
  // O aparelho da variação pode estar marcado pelo IMEI no próprio cadastro (sem entrada).
  const variation = (imei && variations.find((v: any) => String(v?.imei ?? '').trim() === imei)) || findVariation(variations, input.attributes ?? []);
  if (variation && num(variation.cost) > 0) return num(variation.cost);
  return num(stock.cost);
}
