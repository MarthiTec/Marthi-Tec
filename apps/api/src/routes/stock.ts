import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOrDemoAuth } from '../middlewares/authMiddleware.js';
import { unreservedQuantity } from '../services/commercialReservations.js';
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
  kind: z.enum(['part', 'device', 'supply', 'product', 'service']).default('part').transform(val => (val === 'product' || val === 'service') ? 'part' : val),
  condition: z.enum(['new', 'used', 'refurbished']).default('new'),
  category: z.string().default('Geral'),
  brand: z.string().default(''),
  supplierId: z.string().optional().nullable(),
  trackLot: z.boolean().default(false),
  isKit: z.boolean().default(false),
  active: z.boolean().default(true),
  attrs: z.record(z.any()).optional().default({}),
  color: z.string().optional().default(''),
  capacity: z.string().optional().default(''),
  cardRate: z.coerce.number().optional().default(0),
  showOnTotem: z.boolean().optional().default(true),
  images: z.array(z.string()).optional().default([]),
});

export function formatStockRow(row: any) {
  let attrs: Record<string, string> = {};
  if (typeof row.attrs === 'string') {
    try { attrs = JSON.parse(row.attrs); } catch {}
  } else if (row.attrs && typeof row.attrs === 'object') {
    attrs = row.attrs;
  }

  let images: string[] = [];
  if (typeof row.images === 'string') {
    try { images = JSON.parse(row.images); } catch {}
  } else if (Array.isArray(row.images)) {
    images = row.images;
  }

  return {
    id: row.id,
    name: row.name,
    sku: row.sku || '',
    barcode: row.barcode || '',
    imei: row.imei || '',
    unit: row.unit || 'UN',
    qty: Number(row.qty) || 0,
    minQty: Number(row.min_qty ?? row.minQty) || 0,
    cost: Number(row.cost) || 0,
    price: Number(row.price) || 0,
    kind: row.kind,
    condition: row.condition,
    category: row.category || 'Geral',
    brand: row.brand || '',
    supplierId: row.supplier_id || row.supplierId || undefined,
    trackLot: Boolean(row.track_lot ?? row.trackLot),
    isKit: Boolean(row.is_kit ?? row.isKit),
    active: Boolean(row.active),
    attrs,
    color: row.color || '',
    capacity: row.capacity || '',
    cardRate: Number(row.card_rate ?? row.cardRate) || 0,
    showOnTotem: row.show_on_totem !== undefined ? Boolean(row.show_on_totem) : (row.showOnTotem !== undefined ? Boolean(row.showOnTotem) : true),
    images,
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
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
stockRouter.get('/api/v1/stock', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const { kind, condition, q, low } = req.query;

    if (pool) {
      try {
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
                 kind, condition, category, brand, supplier_id, track_lot, is_kit, active,
                 attrs, color, capacity, card_rate, show_on_totem, images, created_at, updated_at
          FROM stock_items
          WHERE ${conditions.join(' AND ')}
          ORDER BY name ASC
        `;

        const result = await pool.query(sql, values);
        res.json({ success: true, data: result.rows.map(formatStockRow) });
        return;
      } catch (dbErr) {
        throw dbErr;
      }
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

    res.json({ success: true, data: items.map(formatStockRow) });
  } catch (error) {
    next(error);
  }
});

/**
 * Busca rápida por código (código de barras, SKU ou IMEI)
 */
stockRouter.get('/api/v1/stock/lookup', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const code = String(req.query.code || '').trim();
    if (!code) {
      res.json({ success: true, data: null });
      return;
    }

    if (pool) {
      try {
        const sql = `
          SELECT id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
                 kind, condition, category, brand, supplier_id, track_lot, is_kit, active,
                 attrs, color, capacity, card_rate, show_on_totem, images, created_at, updated_at
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
      } catch (dbErr) {
        throw dbErr;
      }
    }

    const item = Array.from(memoryStock.values()).find(
      (i) => i.storeId === storeId && (i.barcode === code || i.sku === code || i.imei === code),
    );
    res.json({ success: true, data: item ? formatStockRow(item) : null });
  } catch (error) {
    next(error);
  }
});

/**
 * Criar item de estoque
 */
stockRouter.post('/api/v1/stock', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const body = stockItemSchema.parse(req.body);
    const id = body.id || `STK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    if (pool) {
      let client: any = null;
      try {
        client = await pool.connect();
      } catch (connErr) {
        throw connErr;
      }

      if (client) {
        try {
          await client.query('BEGIN');

          await client.query(
            `INSERT INTO stock_items (
              id, store_id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
              kind, condition, category, brand, supplier_id, track_lot, is_kit, active,
              attrs, color, capacity, card_rate, show_on_totem, images
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
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
              JSON.stringify(body.attrs || {}),
              body.color || '',
              body.capacity || '',
              body.cardRate || 0,
              body.showOnTotem !== undefined ? body.showOnTotem : true,
              JSON.stringify(body.images || []),
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
          throw err;
        } finally {
          client.release();
        }
      }
    }

    // Memory fallback
    const memItem = {
      id,
      storeId,
      ...body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    memoryStock.set(id, memItem);
    res.status(201).json({ success: true, data: formatStockRow({ ...memItem, store_id: storeId }) });
  } catch (error) {
    next(error);
  }
});

/**
 * Atualizar item de estoque
 */
stockRouter.patch('/api/v1/stock/:id', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;
    const body = stockItemSchema.partial().parse(req.body);

    if (pool) {
      let client: any = null;
      try {
        client = await pool.connect();
      } catch (connErr) {
        throw connErr;
      }

      if (client) {
        try {
          await client.query('BEGIN');

          const currentRes = await client.query(`SELECT * FROM stock_items WHERE id = $1 AND store_id = $2 FOR UPDATE`, [id, storeId]);
          if (currentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            res.status(404).json({ success: false, error: { message: 'Item de estoque não encontrado.' } });
            return;
          }

          const curr = currentRes.rows[0];
          const nextQty = body.qty !== undefined ? body.qty : Number(curr.qty);
          const available=await unreservedQuantity(client,storeId,id,Number(curr.qty));
          const reserved=Number(curr.qty)-available;
          if(reserved>0 && (nextQty<reserved || body.active===false || ['name','brand','capacity','color','condition','attrs','cost'].some(k=>(body as any)[k]!==undefined && JSON.stringify((body as any)[k])!==JSON.stringify(curr[k])))) throw Object.assign(new Error('Produto reservado por encomenda. Libere a reserva antes de alterar sua variante, custo ou saldo.'),{status:409});


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
                 attrs = COALESCE($15, attrs),
                 color = COALESCE($16, color),
                 capacity = COALESCE($17, capacity),
                 card_rate = COALESCE($18, card_rate),
                 show_on_totem = COALESCE($19, show_on_totem),
                 images = COALESCE($20, images),
                 updated_at = now()
             WHERE id = $21 AND store_id = $22`,
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
              body.attrs !== undefined ? JSON.stringify(body.attrs) : null,
              body.color,
              body.capacity,
              body.cardRate,
              body.showOnTotem,
              body.images !== undefined ? JSON.stringify(body.images) : null,
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
          throw err;
        } finally {
          client.release();
        }
      }
    }

    // Memory fallback
    const current = memoryStock.get(id);
    if (!current) {
      res.status(404).json({ success: false, error: { message: 'Item de estoque não encontrado.' } });
      return;
    }
    const updated = { ...current, ...body, updatedAt: new Date().toISOString() };
    memoryStock.set(id, updated);
    res.json({ success: true, data: formatStockRow({ ...updated, store_id: storeId }) });
  } catch (error) {
    next(error);
  }
});

/**
 * Excluir item de estoque
 */
stockRouter.delete('/api/v1/stock/:id', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;
    const id = req.params.id;

    if (pool) {
      try {
        const linked=await pool.query("SELECT id FROM commercial_orders WHERE store_id=$1 AND (stock_id=$2 OR used_stock_id=$2) LIMIT 1",[storeId,id]);
        if(linked.rows[0])throw Object.assign(new Error('Produto vinculado ao histórico de encomenda. Utilize inativação após liberar reservas.'),{status:409});
        await pool.query(`DELETE FROM stock_items WHERE id = $1 AND store_id = $2`, [id, storeId]);
        res.json({ success: true, data: { ok: true } });
        return;
      } catch (dbErr) {
        throw dbErr;
      }
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
stockRouter.get('/api/v1/products', requireOrDemoAuth, async (req, res, next) => {
  try {
    const storeId = req.storeId!;

    if (pool) {
      try {
        const itemsRes = await pool.query(
          `SELECT id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
                  kind, condition, category, brand, supplier_id, track_lot, is_kit, active,
                  attrs, color, capacity, card_rate, show_on_totem, images, created_at, updated_at
           FROM stock_items
           WHERE store_id = $1 AND active = true
           ORDER BY name ASC`,
          [storeId],
        );
        res.json({ success: true, data: itemsRes.rows.map(formatStockRow) });
        return;
      } catch (dbErr) {
        throw dbErr;
      }
    }

    const items = Array.from(memoryStock.values()).filter((i) => i.storeId === storeId && i.active !== false);
    res.json({ success: true, data: items.map(formatStockRow) });
  } catch (error) {
    next(error);
  }
});

/** Aplica uma conferência física inteira ou desfaz todas as alterações. */
stockRouter.post('/api/v1/stock/inventory-adjustments', requireAuth, async (req, res, next) => {
  let db: PoolClient | undefined;
  try {
    db = await pool.connect();
    if (!['admin','manager','superadmin'].includes(req.user!.role ?? '')) { res.status(403).json({ success:false,error:{code:'FORBIDDEN',message:'Somente a gestão pode aplicar ajustes de estoque.'} }); return; }
    const body = z.object({ balanceId:z.string().min(1).max(160), items:z.array(z.object({ stockId:z.string().min(1), expectedQty:z.number().nonnegative(), countedQty:z.number().nonnegative() })).min(1).max(10000) }).parse(req.body);
    if (new Set(body.items.map(item=>item.stockId)).size !== body.items.length) throw Object.assign(new Error('Produtos duplicados na conferência.'),{status:400});
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${req.storeId}:inventory:${body.balanceId}`]);
    const previous=await db.query('SELECT result FROM stock_inventory_adjustments WHERE store_id=$1 AND balance_id=$2',[req.storeId,body.balanceId]);
    if (previous.rows[0]) { await db.query('COMMIT'); res.json({success:true,data:{...previous.rows[0].result,alreadyApplied:true}});return; }
    let totalUnitsDelta=0;
    for (const item of [...body.items].sort((a,b)=>a.stockId.localeCompare(b.stockId))) {
      const found=await db.query('SELECT * FROM stock_items WHERE id=$1 AND store_id=$2 FOR UPDATE',[item.stockId,req.storeId]);
      const stock=found.rows[0];
      if (!stock) throw Object.assign(new Error('Produto da conferência não encontrado nesta loja.'),{status:404});
      if (Math.abs(Number(stock.qty)-item.expectedQty)>0.000001) throw Object.assign(new Error('O estoque mudou após a conferência. Revise os saldos antes de aplicar o ajuste.'),{status:409});
      if (stock.unit !== 'KG' && !Number.isInteger(item.countedQty)) throw Object.assign(new Error('Produtos em unidade exigem quantidade inteira.'),{status:400});
      if (await unreservedQuantity(db,req.storeId!,item.stockId,item.countedQty)<0) throw Object.assign(new Error('O saldo contado é menor que a quantidade reservada em encomendas.'),{status:409});
      const delta=item.countedQty-Number(stock.qty);totalUnitsDelta+=delta;
      await db.query('UPDATE stock_items SET qty=$1,updated_at=now() WHERE id=$2 AND store_id=$3',[item.countedQty,item.stockId,req.storeId]);
      if (delta!==0) await db.query(`INSERT INTO stock_movements(id,store_id,stock_id,type,qty,previous_qty,new_qty,unit_cost,ref_type,operator_name,notes)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'adjustment',$9,$10)`,[randomUUID(),req.storeId,item.stockId,delta>0?'in':'out',Math.abs(delta),Number(stock.qty),item.countedQty,Number(stock.cost)||0,req.user!.name,`Conferência física ${body.balanceId}`]);
    }
    const result={ok:true,adjustedItemsCount:body.items.length,totalUnitsDelta,appliedAt:new Date().toISOString()};
    await db.query('INSERT INTO stock_inventory_adjustments(store_id,balance_id,result,applied_by) VALUES($1,$2,$3::jsonb,$4)',[req.storeId,body.balanceId,JSON.stringify(result),req.user!.id]);
    await db.query('COMMIT');res.json({success:true,data:result});
  } catch(error) { if (db) await db.query('ROLLBACK');next(error); }
  finally { db?.release(); }
});
