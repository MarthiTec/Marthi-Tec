import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { pool } from '../db/pool.js';

export const stockRouter = Router();

const stockItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Nome do item é obrigatório.'),
  sku: z.string().default(''),
  barcode: z.string().default(''),
  imei: z.string().default(''),
  unit: z.string().default('UN'),
  qty: z.coerce.number().default(0),
  minQty: z.coerce.number().default(0),
  cost: z.coerce.number().default(0),
  price: z.coerce.number().default(0),
  kind: z.enum(['part', 'device', 'supply']).default('part'),
  condition: z.enum(['new', 'used', 'refurbished']).default('new'),
  category: z.string().default('Geral'),
  brand: z.string().default(''),
  supplierId: z.string().optional().nullable(),
  trackLot: z.boolean().default(false),
  isKit: z.boolean().default(false),
  active: z.boolean().default(true),
});

function formatStockRow(row: any) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku || '',
    barcode: row.barcode || '',
    imei: row.imei || '',
    unit: row.unit || 'UN',
    qty: Number(row.qty) || 0,
    minQty: Number(row.min_qty) || 0,
    cost: Number(row.cost) || 0,
    price: Number(row.price) || 0,
    kind: row.kind,
    condition: row.condition,
    category: row.category || 'Geral',
    brand: row.brand || '',
    supplierId: row.supplier_id || undefined,
    trackLot: Boolean(row.track_lot),
    isKit: Boolean(row.is_kit),
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const memoryStock = new Map<string, any>();

export function reduceStockQtyInMemory(stockId: string, qty: number): boolean {
  const item = memoryStock.get(stockId);
  if (item) {
    item.qty = Math.max(0, (Number(item.qty) || 0) - qty);
    item.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

/**
 * Listar estoque com filtros
 */
stockRouter.get('/api/v1/stock', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const { kind, condition, q, low } = req.query;

    if (pool) {
      const conditions: string[] = ['store_id = $1'];
      const values: any[] = [storeId];
      let pIdx = 2;

      if (kind && typeof kind === 'string') {
        conditions.push(`kind = $${pIdx++}`);
        values.push(kind);
      }
      if (condition && typeof condition === 'string') {
        conditions.push(`condition = $${pIdx++}`);
        values.push(condition);
      }
      if (q && typeof q === 'string' && q.trim()) {
        conditions.push(`(name ILIKE $${pIdx} OR sku ILIKE $${pIdx} OR barcode ILIKE $${pIdx} OR imei ILIKE $${pIdx})`);
        values.push(`%${q.trim()}%`);
        pIdx++;
      }
      if (low === '1' || low === 'true') {
        conditions.push(`qty <= min_qty`);
      }

      const sql = `
        SELECT id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
               kind, condition, category, brand, supplier_id, track_lot, is_kit, active, created_at, updated_at
        FROM stock_items
        WHERE ${conditions.join(' AND ')}
        ORDER BY name ASC
      `;

      const result = await pool.query(sql, values);
      res.json({ success: true, data: result.rows.map(formatStockRow) });
      return;
    }

    // Memory fallback
    let items = Array.from(memoryStock.values()).filter((item) => item.storeId === storeId);
    if (kind) items = items.filter((item) => item.kind === kind);
    if (condition) items = items.filter((item) => item.condition === condition);
    if (q && typeof q === 'string') {
      const needle = q.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(needle) || i.barcode?.includes(needle) || i.sku?.includes(needle));
    }
    if (low === '1' || low === 'true') {
      items = items.filter((i) => i.qty <= i.minQty);
    }

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

/**
 * Busca rápida por código (código de barras, SKU ou IMEI)
 */
stockRouter.get('/api/v1/stock/lookup', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const code = String(req.query.code || '').trim();
    if (!code) {
      res.json({ success: true, data: null });
      return;
    }

    if (pool) {
      const sql = `
        SELECT id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
               kind, condition, category, brand, supplier_id, track_lot, is_kit, active, created_at, updated_at
        FROM stock_items
        WHERE store_id = $1 AND (barcode = $2 OR sku = $2 OR imei = $2)
        LIMIT 1
      `;
      const resQuery = await pool.query(sql, [storeId, code]);
      if (resQuery.rows.length === 0) {
        res.json({ success: true, data: null });
        return;
      }
      res.json({ success: true, data: formatStockRow(resQuery.rows[0]) });
      return;
    }

    const item = Array.from(memoryStock.values()).find(
      (i) => i.storeId === storeId && (i.barcode === code || i.sku === code || i.imei === code),
    );
    res.json({ success: true, data: item || null });
  } catch (error) {
    next(error);
  }
});

/**
 * Criar item de estoque
 */
stockRouter.post('/api/v1/stock', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = stockItemSchema.parse(req.body);
    const id = body.id || `STK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO stock_items (
            id, store_id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
            kind, condition, category, brand, supplier_id, track_lot, is_kit, active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
          [
            id,
            storeId,
            body.name.trim(),
            body.sku.trim(),
            body.barcode.trim(),
            body.imei.trim(),
            body.unit.trim(),
            body.qty,
            body.minQty,
            body.cost,
            body.price,
            body.kind,
            body.condition,
            body.category.trim(),
            body.brand.trim(),
            body.supplierId || null,
            body.trackLot,
            body.isKit,
            body.active,
          ],
        );

        // Se qty inicial > 0, registra kardex
        if (body.qty > 0) {
          const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO stock_movements (
              id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, operator_name, notes
            ) VALUES ($1, $2, $3, 'in', $4, 0, $4, $5, 'manual', $6, 'Saldo inicial no cadastro')`,
            [movId, storeId, id, body.qty, body.cost, req.user?.name || 'Operador'],
          );
        }

        await client.query('COMMIT');

        const createdRes = await pool.query(`SELECT * FROM stock_items WHERE id = $1`, [id]);
        res.status(201).json({ success: true, data: formatStockRow(createdRes.rows[0]) });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const record = {
      id,
      storeId,
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryStock.set(id, record);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

/**
 * Atualizar item de estoque
 */
stockRouter.patch('/api/v1/stock/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = stockItemSchema.partial().parse(req.body);

    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const currentRes = await client.query(`SELECT * FROM stock_items WHERE id = $1 AND store_id = $2`, [id, storeId]);
        if (currentRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.status(404).json({ success: false, error: { message: 'Item de estoque não encontrado.' } });
          return;
        }

        const curr = currentRes.rows[0];
        const nextQty = body.qty !== undefined ? body.qty : Number(curr.qty);

        // Se qty mudou, registra movimentação no kardex
        if (body.qty !== undefined && body.qty !== Number(curr.qty)) {
          const delta = body.qty - Number(curr.qty);
          const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await client.query(
            `INSERT INTO stock_movements (
              id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, operator_name, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'adjustment', $9, 'Ajuste manual de estoque')`,
            [
              movId,
              storeId,
              id,
              delta > 0 ? 'in' : 'out',
              Math.abs(delta),
              Number(curr.qty),
              nextQty,
              body.cost !== undefined ? body.cost : Number(curr.cost),
              req.user?.name || 'Operador',
            ],
          );
        }

        await client.query(
          `UPDATE stock_items
           SET name = COALESCE($1, name),
               sku = COALESCE($2, sku),
               barcode = COALESCE($3, barcode),
               imei = COALESCE($4, imei),
               unit = COALESCE($5, unit),
               qty = COALESCE($6, qty),
               min_qty = COALESCE($7, min_qty),
               cost = COALESCE($8, cost),
               price = COALESCE($9, price),
               kind = COALESCE($10, kind),
               condition = COALESCE($11, condition),
               category = COALESCE($12, category),
               brand = COALESCE($13, brand),
               active = COALESCE($14, active),
               updated_at = now()
           WHERE id = $15 AND store_id = $16`,
          [
            body.name,
            body.sku,
            body.barcode,
            body.imei,
            body.unit,
            body.qty,
            body.minQty,
            body.cost,
            body.price,
            body.kind,
            body.condition,
            body.category,
            body.brand,
            body.active,
            id,
            storeId,
          ],
        );

        await client.query('COMMIT');

        const updatedRes = await pool.query(`SELECT * FROM stock_items WHERE id = $1`, [id]);
        res.json({ success: true, data: formatStockRow(updatedRes.rows[0]) });
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const current = memoryStock.get(id);
    if (!current || current.storeId !== storeId) {
      res.status(404).json({ success: false, error: { message: 'Item não encontrado.' } });
      return;
    }
    const updated = { ...current, ...body, updatedAt: new Date().toISOString() };
    memoryStock.set(id, updated);
    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * Excluir item de estoque
 */
stockRouter.delete('/api/v1/stock/:id', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;

    if (pool) {
      await pool.query(`DELETE FROM stock_items WHERE id = $1 AND store_id = $2`, [id, storeId]);
      res.json({ success: true, data: { ok: true } });
      return;
    }

    memoryStock.delete(id);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/**
 * Catálogo de produtos (para totem / PDV)
 */
stockRouter.get('/api/v1/products', requireAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;

    if (pool) {
      const itemsRes = await pool.query(
        `SELECT id, name, sku, barcode, price, qty, category, brand, active
         FROM stock_items
         WHERE store_id = $1 AND active = true
         ORDER BY name ASC`,
        [storeId],
      );
      res.json({ success: true, data: itemsRes.rows.map(formatStockRow) });
      return;
    }

    const items = Array.from(memoryStock.values()).filter((i) => i.storeId === storeId && i.active !== false);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});
