import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canManageArea } from '../services/employeeAccess.js';
import { attributeValueKey } from '../services/attributeValues.js';
import { conditionCode } from '../services/productCondition.js';
import { attachSupplierEntries, supplierEntrySchema } from '../services/supplierEntries.js';
import { stockDetails } from '../services/stockDetails.js';
import { formatStockRow } from './stock.js';

/**
 * Entrada de estoque: escolhe o produto e lança a compra (ou o aparelho de upgrade) com
 * fornecedor, data, quantidade, custo, IMEIs, condição e bateria. A variação (cor/capacidade/
 * condição) é achada ou criada; estoque e custo médio sobem com a entrada.
 */
export const stockEntriesRouter = Router();

const entryRequestSchema = z.object({
  variation: z
    .object({
      id: z.string().optional(),
      attrs: z.record(z.string()).default({}),
      condition: z.enum(['new', 'used', 'refurbished']).default('new'),
      /** Preço de venda da variação nova (variação existente mantém o preço dela). */
      price: z.coerce.number().finite().nonnegative().optional(),
    })
    .optional(),
  entry: supplierEntrySchema,
});

const same = (a: unknown, b: unknown) => attributeValueKey(a == null ? '' : String(a)) === attributeValueKey(b == null ? '' : String(b));
const round2 = (value: number) => Math.round(value * 100) / 100;

stockEntriesRouter.post('/api/v1/stock/:id/entries', requireAuth, async (req, res, next) => {
  const storeId = req.storeId!;
  const db = await pool.connect();
  try {
    if (!canManageArea(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Sem permissão para dar entrada no estoque.' } });
      return;
    }
    const body = entryRequestSchema.parse(req.body);
    const entry = body.entry;
    await db.query('BEGIN');
    const product = (await db.query('SELECT * FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE', [req.params.id, storeId])).rows[0];
    if (!product) throw Object.assign(new Error('Produto não encontrado nesta loja.'), { status: 404 });

    // IMEI não se repete na loja.
    const dup = entry.imeis.find((imei, index) => entry.imeis.indexOf(imei) !== index);
    if (dup) throw Object.assign(new Error(`O IMEI ${dup} está repetido na entrada.`), { status: 400 });
    if (entry.imeis.length) {
      const taken = await db.query(
        `SELECT e.imei, s.name FROM stock_supplier_entries x CROSS JOIN LATERAL jsonb_array_elements_text(x.imeis) AS e(imei)
           JOIN stock_items s ON s.id = x.stock_item_id
          WHERE x.store_id = $1 AND e.imei = ANY($2::text[]) LIMIT 1`,
        [storeId, entry.imeis],
      );
      if (taken.rows[0]) throw Object.assign(new Error(`O IMEI ${taken.rows[0].imei} já está no produto "${taken.rows[0].name}".`), { status: 409 });
    }
    const supplierId = entry.supplierId || product.supplier_id || null;
    let supplierName = '';
    if (supplierId) {
      const supplier = (await db.query(`SELECT COALESCE(NULLIF(trade_name, ''), name) AS name FROM suppliers WHERE id = $1 AND store_id = $2`, [supplierId, storeId])).rows[0];
      if (!supplier) throw Object.assign(new Error('Fornecedor não encontrado nesta loja.'), { status: 400 });
      supplierName = supplier.name;
    }

    const qty = entry.qty;
    const unitCost = Number(entry.unitCost) || 0;
    const variations: any[] = Array.isArray(product.variations) ? product.variations : [];
    let variationId: string | null = null;
    const wanted = body.variation;
    const hasGrid = variations.length > 0 || (wanted && Object.values(wanted.attrs).some(Boolean));
    if (hasGrid && wanted) {
      const condition = conditionCode(wanted.condition) || 'new';
      let index = wanted.id ? variations.findIndex((v) => v.id === wanted.id) : -1;
      if (index < 0) {
        index = variations.findIndex(
          (v) => (conditionCode(v.condition) || 'new') === condition && Object.entries(wanted.attrs).every(([id, value]) => same(v.attrs?.[id], value)) && Object.keys(v.attrs ?? {}).every((id) => wanted.attrs[id] !== undefined),
        );
      }
      if (index >= 0) {
        const v = variations[index];
        const oldQty = Number(v.qty) || 0;
        const avg = round2((oldQty * (Number(v.avgCost ?? v.cost) || 0) + qty * unitCost) / (oldQty + qty));
        variations[index] = { ...v, qty: oldQty + qty, cost: avg, avgCost: avg };
        variationId = v.id ?? null;
        if (v.id) await db.query('UPDATE stock_item_variations SET qty = $4, cost = $5, avg_cost = $5, updated_at = now() WHERE store_id = $1 AND stock_item_id = $2 AND id = $3', [storeId, product.id, v.id, oldQty + qty, avg]);
      } else {
        const created = {
          id: `var_${randomUUID()}`,
          attrs: wanted.attrs,
          price: wanted.price ?? (Number(product.price) || 0),
          cost: unitCost,
          avgCost: unitCost,
          qty,
          minQty: 0,
          condition,
          batteryLevel: condition === 'new' ? 100 : entry.batteryLevel ?? null,
          barcode: '',
          imei: '',
          pickupPrices: {},
        };
        variations.push(created);
        variationId = created.id;
        await db.query(
          `INSERT INTO stock_item_variations (id, store_id, stock_item_id, attrs, price, cost, avg_cost, qty, min_qty, condition, battery_level)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6, $7, 0, $8, $9)`,
          [created.id, storeId, product.id, JSON.stringify(created.attrs), created.price, unitCost, qty, condition, created.batteryLevel],
        );
      }
      await db.query('UPDATE stock_items SET variations = $3::jsonb WHERE id = $1 AND store_id = $2', [product.id, storeId, JSON.stringify(variations)]);
    }

    const previousQty = Number(product.qty) || 0;
    const productAvg = round2((previousQty * (Number(product.avg_cost ?? product.cost) || 0) + qty * unitCost) / (previousQty + qty));
    await db.query(
      `UPDATE stock_items SET qty = qty + $3, avg_cost = $4, cost = CASE WHEN $5 THEN cost ELSE $4 END, updated_at = now() WHERE id = $1 AND store_id = $2`,
      [product.id, storeId, qty, productAvg, hasGrid],
    );

    const entryId = `SEN-${randomUUID()}`;
    await db.query(
      `INSERT INTO stock_supplier_entries (id, store_id, stock_item_id, variation_id, supplier_id, entry_date, qty, unit_cost, imeis, notes, battery_level)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8, $9::jsonb, $10, $11)`,
      [entryId, storeId, product.id, variationId, supplierId, entry.entryDate || null, qty, unitCost, JSON.stringify(entry.imeis), entry.notes, entry.batteryLevel ?? null],
    );
    await db.query(
      `INSERT INTO stock_movements (id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, ref_id, operator_name, notes)
       VALUES ($1, $2, $3, 'in', $4, $5, $6, $7, 'supplier_entry', $8, $9, $10)`,
      [`MOV-${randomUUID()}`, storeId, product.id, qty, previousQty, previousQty + qty, unitCost, entryId, req.user?.name || 'Operador', supplierName ? `Entrada do fornecedor ${supplierName}` : 'Entrada sem fornecedor informado'],
    );
    await db.query('COMMIT');

    const fresh = await pool.query(
      `SELECT s.*, (SELECT name FROM catalog_types ct WHERE ct.id = s.catalog_type_id) AS catalog_type_name,
              (SELECT name FROM catalog_models cm WHERE cm.id = s.catalog_model_id) AS catalog_model_name
         FROM stock_items s WHERE s.id = $1`,
      [product.id],
    );
    const [data] = await attachSupplierEntries(pool, storeId, [formatStockRow((await stockDetails(pool, storeId, fresh.rows))[0])]);
    res.status(201).json({ success: true, data: { product: data, entryId, variationId } });
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    db.release();
  }
});
