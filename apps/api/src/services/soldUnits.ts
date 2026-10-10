import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

type Db = Pick<PoolClient, 'query'>;
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

/** Tipos de saída do aparelho. A venda é marcada pela própria venda; os demais são baixas manuais. */
export type UnitOutputKind = 'sale' | 'bonus' | 'internal' | 'loss';
export const OUTPUT_LABEL: Record<UnitOutputKind, string> = { sale: 'Venda', bonus: 'Bonificação', internal: 'Uso interno', loss: 'Perda / defeito' };

/**
 * Marca as unidades que a venda tirou do estoque. Com IMEI informado, é aquele aparelho (e ele não
 * pode já ter saído). O restante sai da entrada mais antiga da mesma variação que ainda tem unidade
 * em estoque — preferindo os IMEIs dessa entrada que ainda não saíram.
 */
export async function markUnitsSold(
  db: Db,
  input: { storeId: string; stockId: string; variationId: string | null; qty: number; imei?: string; saleId: string; lineId?: string | null; unitPrice?: number; operator?: string },
) {
  const qty = Math.max(0, Math.floor(Number(input.qty) || 0));
  if (!qty) return;
  const imei = (input.imei ?? '').trim();
  let remaining = qty;

  if (imei) {
    const out = (await db.query('SELECT kind FROM stock_sold_units WHERE store_id = $1 AND imei = $2 AND reverted_at IS NULL', [input.storeId, imei])).rows[0];
    if (out) throw httpError(`O aparelho de IMEI ${imei} já saiu do estoque (${OUTPUT_LABEL[out.kind as UnitOutputKind] ?? out.kind}).`, 409);
    const entry = (
      await db.query(`SELECT id, variation_id FROM stock_supplier_entries WHERE store_id = $1 AND stock_item_id = $2 AND imeis ? $3 LIMIT 1`, [input.storeId, input.stockId, imei])
    ).rows[0];
    if (entry) {
      await insertOutput(db, { ...input, kind: 'sale' }, entry.variation_id ?? input.variationId, entry.id, imei);
      remaining -= 1;
    }
  }

  if (!remaining) return;
  const entries = (
    await db.query(
      `SELECT e.id, e.variation_id, e.qty, e.imeis,
              COALESCE((SELECT jsonb_agg(u.imei) FROM stock_sold_units u WHERE u.entry_id = e.id AND u.imei <> '' AND u.reverted_at IS NULL), '[]'::jsonb) AS out_imeis,
              (SELECT count(*) FROM stock_sold_units u WHERE u.entry_id = e.id AND u.reverted_at IS NULL)::int AS out_qty
         FROM stock_supplier_entries e
        WHERE e.store_id = $1 AND e.stock_item_id = $2 AND e.variation_id IS NOT DISTINCT FROM $3
        ORDER BY e.entry_date, e.created_at
        FOR UPDATE OF e`,
      [input.storeId, input.stockId, input.variationId],
    )
  ).rows;
  for (const entry of entries) {
    let free = (Number(entry.qty) || 0) - (Number(entry.out_qty) || 0);
    const outImeis = new Set<string>((entry.out_imeis ?? []).map(String));
    const freeImeis = (Array.isArray(entry.imeis) ? entry.imeis.map(String) : []).filter((value: string) => !outImeis.has(value));
    while (free > 0 && remaining > 0) {
      await insertOutput(db, { ...input, kind: 'sale' }, entry.variation_id ?? input.variationId, entry.id, freeImeis.shift() ?? '');
      free -= 1;
      remaining -= 1;
    }
    if (!remaining) break;
  }
  // Estoque sem entrada registrada (saldo inicial, ajuste): a venda segue, só não há aparelho para marcar.
}

async function insertOutput(
  db: Db,
  input: { storeId: string; stockId: string; saleId?: string | null; lineId?: string | null; unitPrice?: number; operator?: string; notes?: string; kind: UnitOutputKind },
  variationId: string | null,
  entryId: string | null,
  imei: string,
) {
  const id = `OUT-${randomUUID()}`;
  await db.query(
    `INSERT INTO stock_sold_units (id, store_id, stock_item_id, variation_id, entry_id, imei, kind, sale_id, sale_line_id, unit_price, notes, operator_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, input.storeId, input.stockId, variationId, entryId, imei, input.kind, input.saleId ?? null, input.lineId ?? null, input.unitPrice ?? null, input.notes ?? '', input.operator ?? ''],
  );
  return id;
}

/** Venda cancelada: os aparelhos voltam a ficar em estoque (o histórico do IMEI guarda a venda e o cancelamento). */
export async function unmarkSaleUnits(db: Db, storeId: string, saleId: string, operator = '') {
  await db.query(
    `UPDATE stock_sold_units SET reverted_at = now(), reverted_reason = 'Venda cancelada', reverted_by = $3
      WHERE store_id = $1 AND sale_id = $2 AND reverted_at IS NULL`,
    [storeId, saleId, operator],
  );
}

/** Saídas ativas de cada entrada: quantas unidades e quais IMEIs (com o tipo e a data). */
export async function soldByEntry(db: Db, storeId: string, entryIds: string[]) {
  const map = new Map<string, { qty: number; imeis: Array<{ imei: string; saleId: string; soldAt: string; kind: string }> }>();
  if (!entryIds.length) return map;
  const rows = (
    await db.query(
      'SELECT entry_id, imei, sale_id, sold_at, kind FROM stock_sold_units WHERE store_id = $1 AND entry_id = ANY($2::text[]) AND reverted_at IS NULL ORDER BY sold_at',
      [storeId, entryIds],
    )
  ).rows;
  for (const row of rows) {
    const current = map.get(row.entry_id) ?? { qty: 0, imeis: [] };
    current.qty += 1;
    if (row.imei) current.imeis.push({ imei: row.imei, saleId: row.sale_id ?? '', soldAt: iso(row.sold_at), kind: row.kind });
    map.set(row.entry_id, current);
  }
  return map;
}

/** Não deixa tirar da entrada um aparelho que já saiu (nem apagar a entrada com saídas). */
export async function assertSoldUnitsKept(db: Db, storeId: string, stockId: string, kept: Array<{ id?: string; qty: number; imeis: string[] }>) {
  const rows = (
    await db.query('SELECT entry_id, imei FROM stock_sold_units WHERE store_id = $1 AND stock_item_id = $2 AND entry_id IS NOT NULL AND reverted_at IS NULL', [storeId, stockId])
  ).rows;
  if (!rows.length) return;
  const byId = new Map(kept.filter((entry) => entry.id).map((entry) => [entry.id as string, entry]));
  const outCount = new Map<string, number>();
  for (const row of rows) {
    const entry = byId.get(row.entry_id);
    if (!entry) throw httpError('Esta entrada tem aparelho vendido ou baixado e não pode ser removida. Cancele a venda ou estorne a baixa antes.', 409);
    if (row.imei && !entry.imeis.includes(row.imei)) throw httpError(`O IMEI ${row.imei} já saiu do estoque e não pode ser tirado da entrada.`, 409);
    outCount.set(row.entry_id, (outCount.get(row.entry_id) ?? 0) + 1);
  }
  for (const [id, out] of outCount) {
    const entry = byId.get(id)!;
    if (entry.qty < out) throw httpError(`A entrada tem ${out} unidade(s) que já saíram; a quantidade não pode ficar menor que isso.`, 409);
  }
}

/** Muda o saldo da variação (e da grade gravada no produto) e do produto, com o movimento de estoque. */
async function moveUnit(db: Db, storeId: string, stockId: string, variationId: string | null, delta: number, unitCost: number, refType: string, refId: string, operator: string, notes: string) {
  const product = (await db.query('SELECT qty, variations FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE', [stockId, storeId])).rows[0];
  if (!product) throw httpError('Produto do IMEI não encontrado.', 404);
  const previousQty = Number(product.qty) || 0;
  if (previousQty + delta < 0) throw httpError('O produto não tem saldo em estoque para esta baixa.', 409);
  if (variationId) {
    const variations: any[] = Array.isArray(product.variations) ? product.variations : [];
    const index = variations.findIndex((v) => v.id === variationId);
    if (index >= 0) {
      const qty = (Number(variations[index].qty) || 0) + delta;
      if (qty < 0) throw httpError('A variação do IMEI não tem saldo em estoque para esta baixa.', 409);
      variations[index] = { ...variations[index], qty };
      await db.query('UPDATE stock_items SET variations = $3::jsonb WHERE id = $1 AND store_id = $2', [stockId, storeId, JSON.stringify(variations)]);
      await db.query('UPDATE stock_item_variations SET qty = $4, updated_at = now() WHERE store_id = $1 AND stock_item_id = $2 AND id = $3', [storeId, stockId, variationId, qty]);
    }
  }
  await db.query('UPDATE stock_items SET qty = $3, updated_at = now() WHERE id = $1 AND store_id = $2', [stockId, storeId, previousQty + delta]);
  await db.query(
    `INSERT INTO stock_movements (id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [`MOV-${randomUUID()}`, storeId, stockId, delta < 0 ? 'out' : 'in', Math.abs(delta), previousQty, previousQty + delta, unitCost, refType, refId, operator, notes],
  );
}

/** Baixa manual de um IMEI: bonificação, uso interno ou perda. O aparelho sai do estoque. */
export async function writeOffImei(db: Db, input: { storeId: string; imei: string; kind: Exclude<UnitOutputKind, 'sale'>; notes: string; operator: string }) {
  const imei = input.imei.trim();
  const entry = (
    await db.query(
      `SELECT e.*, s.name AS product_name FROM stock_supplier_entries e JOIN stock_items s ON s.id = e.stock_item_id
        WHERE e.store_id = $1 AND e.imeis ? $2 LIMIT 1 FOR UPDATE OF e`,
      [input.storeId, imei],
    )
  ).rows[0];
  if (!entry) throw httpError(`O IMEI ${imei} não está em nenhuma entrada de estoque desta loja.`, 404);
  const out = (await db.query('SELECT kind FROM stock_sold_units WHERE store_id = $1 AND imei = $2 AND reverted_at IS NULL', [input.storeId, imei])).rows[0];
  if (out) throw httpError(`O aparelho de IMEI ${imei} já saiu do estoque (${OUTPUT_LABEL[out.kind as UnitOutputKind] ?? out.kind}).`, 409);
  const id = await insertOutput(db, { storeId: input.storeId, stockId: entry.stock_item_id, kind: input.kind, notes: input.notes, operator: input.operator }, entry.variation_id, entry.id, imei);
  await moveUnit(db, input.storeId, entry.stock_item_id, entry.variation_id, -1, Number(entry.unit_cost) || 0, 'imei_writeoff', id, input.operator, `${OUTPUT_LABEL[input.kind]} · IMEI ${imei}${input.notes ? ` · ${input.notes}` : ''}`);
  return { id, stockId: entry.stock_item_id, productName: entry.product_name };
}

/** Estorna a baixa manual: o aparelho volta para o estoque (venda se desfaz cancelando a venda). */
export async function revertWriteOff(db: Db, input: { storeId: string; outputId: string; reason: string; operator: string }) {
  const row = (
    await db.query(
      `SELECT u.*, e.unit_cost FROM stock_sold_units u LEFT JOIN stock_supplier_entries e ON e.id = u.entry_id
        WHERE u.id = $1 AND u.store_id = $2 FOR UPDATE OF u`,
      [input.outputId, input.storeId],
    )
  ).rows[0];
  if (!row) throw httpError('Baixa não encontrada.', 404);
  if (row.reverted_at) throw httpError('Esta baixa já foi estornada.', 409);
  if (row.kind === 'sale') throw httpError('Saída por venda: cancele a venda para o aparelho voltar ao estoque.', 409);
  await db.query('UPDATE stock_sold_units SET reverted_at = now(), reverted_reason = $2, reverted_by = $3 WHERE id = $1', [row.id, input.reason || 'Baixa estornada', input.operator]);
  await moveUnit(db, input.storeId, row.stock_item_id, row.variation_id, 1, Number(row.unit_cost) || 0, 'imei_writeoff_reversal', row.id, input.operator, `Estorno de ${OUTPUT_LABEL[row.kind as UnitOutputKind] ?? row.kind} · IMEI ${row.imei}`);
}

const brl = (value: unknown) => (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : '');
const dateOnly = (value: unknown) => {
  if (!value) return '';
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const utc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0;
  const [y, m, d] = utc ? [value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()] : [value.getFullYear(), value.getMonth(), value.getDate()];
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Histórico do IMEI: entrada, cada saída (venda, bonificação, uso interno, perda) e cada estorno/cancelamento. */
export async function imeiHistory(db: Db, storeId: string, imei: string) {
  const entry = (
    await db.query(
      `SELECT e.*, s.name AS product_name, COALESCE(NULLIF(sp.trade_name, ''), sp.name) AS supplier_name, sp.origin AS supplier_origin
         FROM stock_supplier_entries e
         JOIN stock_items s ON s.id = e.stock_item_id
         LEFT JOIN suppliers sp ON sp.id = e.supplier_id
        WHERE e.store_id = $1 AND e.imeis ? $2 LIMIT 1`,
      [storeId, imei],
    )
  ).rows[0];
  const outputs = (
    await db.query(
      `SELECT u.*, o.customer_name, l.unit_price AS line_price
         FROM stock_sold_units u
         LEFT JOIN sales_orders o ON o.id = u.sale_id
         LEFT JOIN sales_order_lines l ON l.id = u.sale_line_id
        WHERE u.store_id = $1 AND u.imei = $2 ORDER BY u.sold_at`,
      [storeId, imei],
    )
  ).rows;
  const events: Array<{ at: string; type: string; label: string; detail: string; outputId?: string; canRevert?: boolean }> = [];
  if (entry) {
    const origin = entry.origin === 'trade_in' ? `Troca do cliente ${entry.customer_name || ''}`.trim() : entry.supplier_name ? `Fornecedor ${entry.supplier_name}${entry.supplier_origin === 'upgrade' ? ' (Upgrade)' : ''}` : 'Sem fornecedor';
    events.push({ at: dateOnly(entry.entry_date), type: 'entry', label: 'Entrada no estoque', detail: `${entry.product_name} · ${origin} · custo ${brl(entry.unit_cost)}${entry.notes ? ` · ${entry.notes}` : ''}` });
  }
  for (const out of outputs) {
    const price = out.unit_price ?? out.line_price;
    events.push({
      at: iso(out.sold_at),
      type: out.kind,
      label: OUTPUT_LABEL[out.kind as UnitOutputKind] ?? out.kind,
      detail: [out.sale_id ? `Venda ${out.sale_id}` : '', out.customer_name ? `Cliente ${out.customer_name}` : '', price != null ? brl(price) : '', out.notes, out.operator_name ? `por ${out.operator_name}` : ''].filter(Boolean).join(' · '),
      outputId: out.id,
      canRevert: !out.reverted_at && out.kind !== 'sale',
    });
    if (out.reverted_at) events.push({ at: iso(out.reverted_at), type: 'reverted', label: out.kind === 'sale' ? 'Venda cancelada — voltou ao estoque' : 'Baixa estornada — voltou ao estoque', detail: [out.reverted_reason, out.reverted_by ? `por ${out.reverted_by}` : ''].filter(Boolean).join(' · ') });
  }
  const active = outputs.find((out) => !out.reverted_at);
  return {
    imei,
    productId: entry?.stock_item_id ?? null,
    productName: entry?.product_name ?? '',
    status: !entry ? 'unknown' : active ? active.kind : 'in_stock',
    events: events.sort((a, b) => a.at.localeCompare(b.at)),
  };
}

/**
 * Relatório de estoque por IMEI: cada aparelho das entradas com modelo, descrição, variação,
 * condição, bateria, origem, custo, preço de venda (o da venda quando saiu), situação e datas.
 */
export async function imeiReport(db: Db, storeId: string) {
  const rows = (
    await db.query(
      `SELECT e.id AS entry_id, e.stock_item_id, e.variation_id, e.entry_date, e.unit_cost, e.notes, e.battery_level, e.origin, e.customer_name,
              x.imei,
              s.name AS product_name, s.brand, s.price AS product_price, s.condition AS product_condition, s.images,
              (SELECT name FROM catalog_types ct WHERE ct.id = s.catalog_type_id) AS type_name,
              (SELECT name FROM catalog_models cm WHERE cm.id = s.catalog_model_id) AS model_name,
              v.attrs AS variation_attrs, v.price AS variation_price, v.condition AS variation_condition,
              COALESCE(NULLIF(sp.trade_name, ''), sp.name) AS supplier_name, sp.origin AS supplier_origin,
              u.id AS output_id, u.kind AS output_kind, u.sold_at, u.sale_id, u.notes AS output_notes, u.unit_price AS output_price,
              o.customer_name AS sale_customer, l.unit_price AS line_price
         FROM stock_supplier_entries e
         CROSS JOIN LATERAL jsonb_array_elements_text(e.imeis) AS x(imei)
         JOIN stock_items s ON s.id = e.stock_item_id
         LEFT JOIN stock_item_variations v ON v.id = e.variation_id
         LEFT JOIN suppliers sp ON sp.id = e.supplier_id
         LEFT JOIN stock_sold_units u ON u.store_id = e.store_id AND u.imei = x.imei AND u.reverted_at IS NULL
         LEFT JOIN sales_orders o ON o.id = u.sale_id
         LEFT JOIN sales_order_lines l ON l.id = u.sale_line_id
        WHERE e.store_id = $1
        ORDER BY e.entry_date DESC, s.name, x.imei`,
      [storeId],
    )
  ).rows;
  return rows.map((row) => {
    const salePrice = row.output_price ?? row.line_price;
    return {
      imei: row.imei,
      productId: row.stock_item_id,
      variationId: row.variation_id,
      entryId: row.entry_id,
      productName: row.product_name,
      brand: row.brand ?? '',
      typeName: row.type_name ?? '',
      modelName: row.model_name ?? '',
      image: Array.isArray(row.images) ? row.images[0] ?? '' : '',
      attrs: row.variation_attrs ?? {},
      condition: row.variation_condition ?? row.product_condition ?? 'new',
      batteryLevel: row.battery_level == null ? null : Number(row.battery_level),
      origin: row.origin === 'trade_in' ? `Troca · ${row.customer_name || 'cliente'}` : row.supplier_name ?? '',
      originKind: row.origin === 'trade_in' ? 'trade_in' : row.supplier_origin === 'upgrade' ? 'upgrade' : 'company',
      entryDate: dateOnly(row.entry_date),
      cost: Number(row.unit_cost) || 0,
      price: salePrice != null ? Number(salePrice) : Number(row.variation_price ?? row.product_price) || 0,
      status: row.output_id ? row.output_kind : 'in_stock',
      outputId: row.output_id ?? null,
      exitDate: row.sold_at ? iso(row.sold_at) : '',
      saleId: row.sale_id ?? '',
      customerName: row.sale_customer ?? '',
      notes: [row.notes, row.output_notes].filter(Boolean).join(' · '),
    };
  });
}
