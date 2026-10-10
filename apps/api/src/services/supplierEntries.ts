import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';

/**
 * Entradas do mesmo produto por fornecedor (ex.: iPhone 17 Pro Max comprado de vários fornecedores).
 * Cada entrada tem fornecedor, data, quantidade, custo unitário e IMEIs. O preço de venda não muda
 * com o fornecedor: ele é da variação (cor/capacidade) e do tipo de retirada.
 */
export const supplierEntrySchema = z
  .object({
    id: z.string().optional(),
    supplierId: z.string().nullable().optional(),
    entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data da entrada inválida.').optional().or(z.literal('')),
    qty: z.coerce.number().int('A quantidade da entrada é em unidades inteiras.').positive('A quantidade da entrada deve ser maior que zero.'),
    unitCost: z.coerce.number().finite().min(0, 'Custo da entrada inválido.'),
    imeis: z.array(z.string().trim().min(1)).default([]),
    notes: z.string().max(500).default(''),
    /** Bateria (%) do aparelho desta entrada (usados). */
    batteryLevel: z.coerce.number().int().min(0).max(100).nullable().optional(),
  })
  .refine((entry) => entry.imeis.length <= entry.qty, 'Há mais IMEIs do que unidades em uma entrada.');

export type SupplierEntryInput = z.infer<typeof supplierEntrySchema>;
type Group = { variationId: string | null; entries: SupplierEntryInput[] };
type Db = Pick<PoolClient, 'query'>;

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

/**
 * Grava as entradas do produto (substitui as anteriores pelas enviadas). Entradas novas lançam
 * uma movimentação de entrada com o fornecedor. Devolve a quantidade que entrou por entradas novas,
 * para o ajuste de saldo não contar a mesma quantidade de novo.
 */
export async function saveSupplierEntries(
  db: Db,
  storeId: string,
  stockId: string,
  groups: Group[],
  options: { defaultSupplierId?: string | null; operator: string; previousQty: number },
) {
  const existing = new Map<string, any>(
    (await db.query('SELECT * FROM stock_supplier_entries WHERE store_id = $1 AND stock_item_id = $2', [storeId, stockId])).rows.map((row) => [row.id, row]),
  );
  const all = groups.flatMap((group) => group.entries.map((entry) => ({ ...entry, variationId: group.variationId })));

  // IMEI não se repete: nem dentro do produto, nem em outro produto da loja.
  const imeis = all.flatMap((entry) => entry.imeis);
  const dup = imeis.find((imei, index) => imeis.indexOf(imei) !== index);
  if (dup) throw httpError(`O IMEI ${dup} aparece mais de uma vez nas entradas.`);
  if (imeis.length) {
    const taken = await db.query(
      `SELECT e.imei, s.name FROM stock_supplier_entries x CROSS JOIN LATERAL jsonb_array_elements_text(x.imeis) AS e(imei)
         JOIN stock_items s ON s.id = x.stock_item_id
        WHERE x.store_id = $1 AND x.stock_item_id <> $2 AND e.imei = ANY($3::text[]) LIMIT 1`,
      [storeId, stockId, imeis],
    );
    if (taken.rows[0]) throw httpError(`O IMEI ${taken.rows[0].imei} já está no produto "${taken.rows[0].name}".`, 409);
  }

  const suppliers = [...new Set(all.map((entry) => entry.supplierId || options.defaultSupplierId).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (suppliers.length) {
    const found = await db.query(`SELECT id, COALESCE(NULLIF(trade_name, ''), name) AS name FROM suppliers WHERE store_id = $1 AND id = ANY($2::text[])`, [storeId, suppliers]);
    for (const row of found.rows) names.set(row.id, row.name);
    const missing = suppliers.find((id) => !names.has(id));
    if (missing) throw httpError('Fornecedor da entrada não encontrado nesta loja.');
  }

  const kept = new Set<string>();
  let newQty = 0;
  let runningQty = options.previousQty;
  for (const entry of all) {
    const supplierId = entry.supplierId || options.defaultSupplierId || null;
    const entryDate = entry.entryDate || null;
    const current = entry.id ? existing.get(entry.id) : undefined;
    if (current) {
      kept.add(current.id);
      await db.query(
        `UPDATE stock_supplier_entries
            SET variation_id = $3, supplier_id = $4, entry_date = COALESCE($5::date, entry_date), qty = $6, unit_cost = $7, imeis = $8::jsonb, notes = $9, battery_level = $10, updated_at = now()
          WHERE id = $1 AND store_id = $2`,
        [current.id, storeId, entry.variationId, current.origin === 'trade_in' ? current.supplier_id : supplierId, entryDate, entry.qty, entry.unitCost, JSON.stringify(entry.imeis), entry.notes, entry.batteryLevel ?? null],
      );
      continue;
    }
    const id = `SEN-${randomUUID()}`;
    kept.add(id);
    await db.query(
      `INSERT INTO stock_supplier_entries (id, store_id, stock_item_id, variation_id, supplier_id, entry_date, qty, unit_cost, imeis, notes, battery_level)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9::jsonb, $10, $11)`,
      [id, storeId, stockId, entry.variationId, supplierId, entryDate, entry.qty, entry.unitCost, JSON.stringify(entry.imeis), entry.notes, entry.batteryLevel ?? null],
    );
    newQty += entry.qty;
    const supplierName = supplierId ? names.get(supplierId) ?? '' : '';
    await db.query(
      `INSERT INTO stock_movements (id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes)
       VALUES ($1, $2, $3, 'in', $4, $5, $6, $7, 'supplier_entry', $8, $9, $10)`,
      [
        `MOV-${randomUUID()}`,
        storeId,
        stockId,
        entry.qty,
        runningQty,
        runningQty + entry.qty,
        entry.unitCost,
        id,
        options.operator,
        supplierName ? `Entrada do fornecedor ${supplierName}` : 'Entrada sem fornecedor informado',
      ],
    );
    runningQty += entry.qty;
  }
  const removed = [...existing.keys()].filter((id) => !kept.has(id));
  if (removed.length) await db.query('DELETE FROM stock_supplier_entries WHERE store_id = $1 AND id = ANY($2::text[])', [storeId, removed]);
  return newQty;
}

/**
 * Aparelho recebido na troca da venda externa vira uma entrada do produto: o cliente é a origem,
 * o valor da troca é o custo e as observações da troca entram na observação do estoque.
 */
export async function recordTradeInEntry(
  db: Db,
  storeId: string,
  input: { stockId: string; variationId: string | null; customerId?: string | null; customerName: string; tradeValue: number; imei?: string; notes?: string; batteryLevel?: number | null; refId: string },
) {
  await db.query(
    `INSERT INTO stock_supplier_entries (id, store_id, stock_item_id, variation_id, customer_id, customer_name, origin, entry_date, qty, unit_cost, imeis, notes, battery_level, ref_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'trade_in', CURRENT_DATE, 1, $7, $8::jsonb, $9, $10, $11)`,
    [
      `SEN-${randomUUID()}`,
      storeId,
      input.stockId,
      input.variationId,
      input.customerId || null,
      input.customerName || '',
      Number(input.tradeValue) || 0,
      JSON.stringify(input.imei?.trim() ? [input.imei.trim()] : []),
      input.notes?.trim() ?? '',
      input.batteryLevel ?? null,
      input.refId,
    ],
  );
}

/** DATE do banco como AAAA-MM-DD (alguns drivers entregam meia-noite UTC, outros meia-noite local). */
function dateOnly(value: unknown) {
  if (!value) return '';
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  const utc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0;
  const [y, m, d] = utc ? [value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()] : [value.getFullYear(), value.getMonth(), value.getDate()];
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const toEntry = (row: any) => ({
  id: row.id,
  supplierId: row.supplier_id ?? '',
  supplierName: row.supplier_name ?? '',
  entryDate: dateOnly(row.entry_date),
  qty: Number(row.qty) || 0,
  unitCost: Number(row.unit_cost) || 0,
  imeis: Array.isArray(row.imeis) ? row.imeis.map(String) : [],
  notes: row.notes ?? '',
  batteryLevel: row.battery_level === null || row.battery_level === undefined ? null : Number(row.battery_level),
  /** 'supplier' = compra de fornecedor; 'trade_in' = aparelho recebido na troca (o cliente é a origem). */
  origin: row.origin ?? 'supplier',
  customerId: row.customer_id ?? '',
  customerName: row.customer_name_live ?? row.customer_name ?? '',
});

/** Coloca as entradas por fornecedor nos produtos já formatados (no produto simples ou em cada variação). */
export async function attachSupplierEntries<T extends { id: string; variations?: any[] }>(db: Db, storeId: string, items: T[]) {
  if (!items.length) return items;
  const rows = (
    await db.query(
      `SELECT e.*, COALESCE(NULLIF(s.trade_name, ''), s.name) AS supplier_name, COALESCE(c.name, NULLIF(e.customer_name, '')) AS customer_name_live
         FROM stock_supplier_entries e
         LEFT JOIN suppliers s ON s.id = e.supplier_id
         LEFT JOIN customers c ON c.id = e.customer_id
        WHERE e.store_id = $1 AND e.stock_item_id = ANY($2::text[])
        ORDER BY e.entry_date, e.created_at`,
      [storeId, items.map((item) => item.id)],
    )
  ).rows;
  const byItem = new Map<string, any[]>();
  for (const row of rows) byItem.set(row.stock_item_id, [...(byItem.get(row.stock_item_id) ?? []), row]);
  return items.map((item) => {
    const list = byItem.get(item.id) ?? [];
    const variations = (item.variations ?? []).map((variation) => ({
      ...variation,
      supplierEntries: list.filter((row) => row.variation_id === variation.id).map(toEntry),
    }));
    const variationIds = new Set(variations.map((variation) => variation.id));
    return {
      ...item,
      variations,
      // Entradas sem variação (produto simples) ou de uma variação que não existe mais.
      supplierEntries: list.filter((row) => !row.variation_id || !variationIds.has(row.variation_id)).map(toEntry),
    };
  });
}
