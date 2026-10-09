import { canManageArea } from '../services/employeeAccess.js';
import {productSku,supplierSkuName} from '../services/productSku.js';
import { attachSupplierEntries, saveSupplierEntries, supplierEntrySchema, type SupplierEntryInput } from '../services/supplierEntries.js';
import {stockDetails} from '../services/stockDetails.js';
import { validatePickupPrices } from '../services/pickup.js';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOrDemoAuth } from '../middlewares/authMiddleware.js';
import { unreservedQuantity } from '../services/commercialReservations.js';
import { pool } from '../db/pool.js';
import { ensureProductAttributeValues } from '../services/attributeValues.js';

export const stockRouter = Router();

const stockVariationSchema = z.object({
  id: z.string().optional(),
  attrs: z.record(z.any()).default({}),
  price: z.coerce.number().finite().nonnegative().default(0),
  cost: z.coerce.number().finite().nonnegative().default(0),
  avgCost: z.coerce.number().finite().nonnegative().optional(),
  pricingPolicy: z.object({basis:z.enum(['markup','margin']),percent:z.number().finite().nonnegative()}).refine(p=>p.basis!=='margin'||p.percent<100,'A margem deve ser menor que 100%.').nullable().optional(),
  lastEntry: z.any().optional().nullable(),
  cardRate: z.coerce.number().optional(),
  qty: z.coerce.number().default(0),
  minQty: z.coerce.number().default(0),
  condition: z.enum(['new', 'used', 'refurbished']).default('new'),
  barcode: z.string().optional().default(''),
  imei: z.string().optional().default(''),
  pickupMethodId: z.string().optional().nullable(),
  pickupPrices: z.record(z.number().finite().nonnegative().nullable()).optional().default({}),
  /** Entradas desta variação por fornecedor (custo, quantidade, IMEIs). */
  supplierEntries: z.array(supplierEntrySchema).optional(),
  /** Nível de bateria (%) — novo é sempre 100. */
  batteryLevel: z.coerce.number().int().min(0).max(100).nullable().optional(),
});

const stockItemSchema = z.object({
  /** Entradas do produto simples por fornecedor. */
  supplierEntries: z.array(supplierEntrySchema).optional(),
  /** Nível de bateria (%) do produto simples — novo é sempre 100. */
  batteryLevel: z.coerce.number().int().min(0).max(100).nullable().optional(),
  /** Mostra condição e bateria no totem (padrão: sim). */
  showConditionOnTotem: z.boolean().optional(),
  pickupPrices: z.record(z.number().finite().nonnegative().nullable()).default({}),
  id: z.string().optional(),
  name: z.string().min(1, 'Nome do item é obrigatório.'),
  sku: z.string().max(200).default(''),
  skuAuto: z.boolean().optional(),
  skuWithSupplier: z.boolean().optional(),
  groupId: z.string().nullable().optional(),
  subgroupId: z.string().nullable().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de entrada inválida.').nullable().optional().or(z.literal('')),
  dun14: z.string().trim().regex(/^(\d{14})?$/, 'O DUN-14 tem 14 números.').optional(),
  purchaseUnit: z.string().trim().max(10).optional(),
  purchaseFactor: z.coerce.number().finite().positive('A quantidade por embalagem deve ser maior que zero.').optional(),
  avgCost: z.coerce.number().finite().nonnegative().optional(),
  pricingPolicy: z.object({basis:z.enum(['markup','margin']),percent:z.number().finite().nonnegative()}).refine(p=>p.basis!=='margin'||p.percent<100,'A margem deve ser menor que 100%.').nullable().optional(),
  barcode: z.string().default(''),
  imei: z.string().default(''),
  unit: z.string().default('UN'),
  qty: z.coerce.number().default(0),
  minQty: z.coerce.number().default(0),
  cost: z.coerce.number().finite().nonnegative().default(0),
  price: z.coerce.number().finite().nonnegative().default(0),
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
  variations: z.array(stockVariationSchema).optional().default([]),
});

/**
 * IDs de variações são internos ao banco. Registros antigos podiam chegar do
 * JSON do produto com valores de apresentação como `var_0`, repetidos entre
 * produtos. Só preservamos um ID que já pertence ao próprio produto; os demais
 * recebem um ID novo e globalmente único.
 */
/** Variações com a bateria coerente com a condição (novo = 100%). */
function withBattery<T extends { condition?: string; batteryLevel?: number | null }>(variations: T[]): T[] {
  return variations.map((variation) => ({ ...variation, batteryLevel: batteryFor(variation.condition, variation.batteryLevel) }));
}

function persistableVariations(
  variations: Array<z.infer<typeof stockVariationSchema>>,
  existingIds: Iterable<string> = [],
) {
  const existing = new Set(existingIds);
  const kept = new Set<string>();
  return withBattery(variations).map((variation) => {
    const requestedId = variation.id?.trim();
    const id = requestedId && existing.has(requestedId) && !kept.has(requestedId)
      ? requestedId
      : `var_${randomUUID()}`;
    kept.add(id);
    return { ...variation, id };
  });
}

/**
 * Separa as entradas por fornecedor do corpo (produto simples + cada variação, já com o id final da
 * variação) e tira essas listas do JSON das variações. Sem entradas no corpo, nada muda (null).
 */
function supplierEntryGroups(body: any): Array<{ variationId: string | null; entries: SupplierEntryInput[] }> | null {
  const variations: any[] = Array.isArray(body.variations) ? body.variations : [];
  const provided = body.supplierEntries !== undefined || variations.some((v) => v.supplierEntries !== undefined);
  const groups = [
    { variationId: null, entries: (body.supplierEntries ?? []) as SupplierEntryInput[] },
    ...variations.map((v) => ({ variationId: String(v.id), entries: (v.supplierEntries ?? []) as SupplierEntryInput[] })),
  ];
  for (const v of variations) delete v.supplierEntries;
  delete body.supplierEntries;
  return provided ? groups : null;
}

/** Bateria: aparelho novo é 100%; usado/recondicionado usa o nível informado (ou nenhum). */
function batteryFor(condition: unknown, level: unknown): number | null {
  if (!condition || condition === 'new') return 100;
  const value = Number(level);
  return level === null || level === undefined || level === '' || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, Math.round(value)));
}

/** DATE do banco (Date ou texto) como AAAA-MM-DD, sem fuso deslocando o dia. */
function dateOnly(value: unknown) {
  if (!value) return '';
  if (value instanceof Date) {
    // Alguns drivers entregam o DATE à meia-noite UTC, outros à meia-noite local.
    const utc = value.getUTCHours() === 0 && value.getUTCMinutes() === 0;
    const [y, m, d] = utc ? [value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()] : [value.getFullYear(), value.getMonth(), value.getDate()];
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

/**
 * Campos do cadastro completo (grupo/subgrupo, data de entrada, DUN-14 e conversão de unidade).
 * Só grava o que veio no corpo; os grupos precisam ser da mesma loja e o subgrupo, do grupo escolhido.
 */
async function saveProductDetails(db: PoolClient, storeId: string, id: string, body: any) {
  const own = async (table: string, value: string | null | undefined, message: string) => {
    if (value && !(await db.query(`SELECT 1 FROM ${table} WHERE id = $1 AND store_id = $2`, [value, storeId])).rows.length) {
      throw Object.assign(new Error(message), { status: 400 });
    }
  };
  await own('product_groups', body.groupId, 'Grupo não encontrado nesta loja.');
  const groupCleared = body.groupId !== undefined && !body.groupId;
  if (body.subgroupId && !groupCleared) {
    const sub = (await db.query('SELECT parent_id FROM product_groups WHERE id = $1 AND store_id = $2', [body.subgroupId, storeId])).rows[0];
    const groupId = body.groupId !== undefined ? body.groupId : (await db.query('SELECT group_id FROM stock_items WHERE id = $1', [id])).rows[0]?.group_id;
    if (!sub || !sub.parent_id || sub.parent_id !== groupId) throw Object.assign(new Error('O subgrupo não pertence ao grupo escolhido.'), { status: 400 });
  }
  const fields: Array<[string, unknown]> = [];
  if (body.groupId !== undefined) fields.push(['group_id', body.groupId || null]);
  if (groupCleared) fields.push(['subgroup_id', null]);
  else if (body.subgroupId !== undefined) fields.push(['subgroup_id', body.subgroupId || null]);
  if (body.entryDate !== undefined) fields.push(['entry_date', body.entryDate || null]);
  if (body.dun14 !== undefined) fields.push(['dun14', body.dun14]);
  if (body.purchaseUnit !== undefined) fields.push(['purchase_unit', body.purchaseUnit.toUpperCase()]);
  if (body.purchaseFactor !== undefined) fields.push(['purchase_factor', body.purchaseFactor]);
  if (body.batteryLevel !== undefined || body.condition !== undefined) {
    const condition = body.condition ?? (await db.query('SELECT condition FROM stock_items WHERE id = $1', [id])).rows[0]?.condition;
    fields.push(['battery_level', batteryFor(condition, body.batteryLevel)]);
  }
  if (body.showConditionOnTotem !== undefined) fields.push(['show_condition_on_totem', body.showConditionOnTotem]);
  if (!fields.length) return;
  await db.query(
    `UPDATE stock_items SET ${fields.map(([column], index) => `${column} = $${index + 3}`).join(', ')} WHERE id = $1 AND store_id = $2`,
    [id, storeId, ...fields.map(([, value]) => value)],
  );
}

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

  let variations: any[] = [];
  if (typeof row.variations === 'string') {
    try { variations = JSON.parse(row.variations); } catch {}
  } else if (Array.isArray(row.variations)) {
    variations = row.variations;
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
    avgCost: Number(row.avg_cost ?? row.avgCost ?? row.cost) || 0,
    pricingPolicy: (() => {
      const policy = row.pricing_policy ?? row.pricingPolicy;
      return policy && (policy.basis === 'markup' || policy.basis === 'margin') && Number.isFinite(policy.percent) ? policy : null;
    })(),
    lastEntry: row.last_entry ?? row.lastEntry ?? null,
    lastPurchaseAt: row.last_entry?.enteredAt ?? '',
    lastPurchaseCost: Number(row.last_entry?.unitCost ?? 0),
    price: Number(row.price) || 0,
    kind: row.kind,
    condition: row.condition,
    category: row.category || 'Geral',
    brand: row.brand || '',
    supplierId: row.supplier_id || row.supplierId || undefined,
    skuWithSupplier: (row.sku_with_supplier ?? row.skuWithSupplier) !== false,
    groupId: row.group_id ?? row.groupId ?? '',
    subgroupId: row.subgroup_id ?? row.subgroupId ?? '',
    entryDate: dateOnly(row.entry_date ?? row.entryDate),
    dun14: row.dun14 ?? '',
    purchaseUnit: row.purchase_unit ?? row.purchaseUnit ?? '',
    purchaseFactor: Number(row.purchase_factor ?? row.purchaseFactor) || 1,
    batteryLevel: batteryFor(row.condition, row.battery_level ?? row.batteryLevel),
    showConditionOnTotem: (row.show_condition_on_totem ?? row.showConditionOnTotem) !== false,
    trackLot: Boolean(row.track_lot ?? row.trackLot),
    isKit: Boolean(row.is_kit ?? row.isKit),
    active: Boolean(row.active),
    pickupPrices: row.pickup_prices || row.pickupPrices || {},
    attrs,
    color: row.color || '',
    capacity: row.capacity || '',
    cardRate: Number(row.card_rate ?? row.cardRate) || 0,
    showOnTotem: row.show_on_totem !== undefined ? Boolean(row.show_on_totem) : (row.showOnTotem !== undefined ? Boolean(row.showOnTotem) : true),
    images,
    variations: variations.map((v: any, idx: number) => ({
      id: v.id || `var_${idx}`,
      attrs: typeof v.attrs === 'object' && v.attrs ? v.attrs : {},
      price: Number(v.price) || 0,
      cost: Number(v.cost) || 0,
      avgCost: Number(v.avgCost ?? v.avg_cost ?? v.cost) || 0,
      pricingPolicy: v.pricingPolicy ?? v.pricing_policy ?? null,
      lastEntry: v.lastEntry ?? v.last_entry ?? null,
      cardRate: v.cardRate !== undefined ? Number(v.cardRate) : (v.card_rate !== undefined ? Number(v.card_rate) : undefined),
      qty: Number(v.qty) || 0,
      minQty: Number(v.minQty ?? v.min_qty) || 0,
      condition: v.condition || 'new',
      batteryLevel: batteryFor(v.condition, v.batteryLevel ?? v.battery_level),
      barcode: v.barcode || '',
      imei: v.imei || '',
      pickupMethodId: v.pickupMethodId ?? v.pickup_method_id,
      pickupPrices: v.pickupPrices ?? v.pickup_prices ?? {},
    })),
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
                 pickup_prices, attrs, color, capacity, card_rate, show_on_totem, images, variations, created_at, updated_at, sku_with_supplier, group_id, subgroup_id, entry_date, dun14, purchase_unit, purchase_factor, battery_level, show_condition_on_totem
          FROM stock_items
          WHERE ${conditions.join(' AND ')}
          ORDER BY name ASC
        `;

        const result = await pool.query(sql, values);
        res.json({ success: true, data: await attachSupplierEntries(pool, storeId, (await stockDetails(pool,storeId,result.rows)).map(formatStockRow)) });
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
                 pickup_prices, attrs, color, capacity, card_rate, show_on_totem, images, variations, created_at, updated_at, sku_with_supplier, group_id, subgroup_id, entry_date, dun14, purchase_unit, purchase_factor, battery_level, show_condition_on_totem
          FROM stock_items
          WHERE store_id = $1 AND (barcode = $2 OR sku = $2 OR imei = $2)
          LIMIT 1
        `;
        const resQuery = await pool.query(sql, [storeId, code]);
        if (resQuery.rows.length === 0) {
          res.json({ success: true, data: null });
          return;
        }
        res.json({ success: true, data: formatStockRow((await stockDetails(pool,storeId,resQuery.rows))[0]) });
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
          if (body.variations && body.variations.length > 0) {
            body.variations = persistableVariations(body.variations);
            body.qty = body.variations.reduce((acc, v) => acc + (Number(v.qty) || 0), 0);
            body.minQty = body.variations.reduce((acc, v) => acc + (Number(v.minQty) || 0), 0);
            if (body.cost <= 0 && body.variations[0].cost > 0) body.cost = Number(body.variations[0].cost);
            if (body.price <= 0 && body.variations[0].price > 0) body.price = Number(body.variations[0].price);
          }
          const entryGroups = supplierEntryGroups(body);
          body.sku = await allocateSku(client, storeId, body, id);
          if (body.supplierId && !(await client.query('SELECT 1 FROM suppliers WHERE id = $1 AND store_id = $2', [body.supplierId, storeId])).rows.length) {
            throw Object.assign(new Error('Fornecedor não encontrado nesta loja.'), { status: 400 });
          }

          await client.query(
            `INSERT INTO stock_items (
              id, store_id, name, sku, barcode, imei, unit, qty, min_qty, cost, price,
              kind, condition, category, brand, supplier_id, track_lot, is_kit, active,
              attrs, color, capacity, card_rate, show_on_totem, images, variations
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
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
              JSON.stringify(body.variations || []),
            ],
          );
          if (body.skuWithSupplier === false) await client.query('UPDATE stock_items SET sku_with_supplier = false WHERE id = $1 AND store_id = $2', [id, storeId]);
          await saveProductDetails(client, storeId, id, body);
          // Data de entrada: a escolhida no cadastro ou, sem ela, o dia de hoje.
          await client.query('UPDATE stock_items SET entry_date = COALESCE(entry_date, CURRENT_DATE) WHERE id = $1 AND store_id = $2', [id, storeId]);

          if (body.variations && body.variations.length > 0) {
            for (const v of body.variations) {
              await client.query(
                `INSERT INTO stock_item_variations (
                  id, store_id, stock_item_id, attrs, price, cost, avg_cost, qty, min_qty,
                  card_rate, condition, barcode, imei, pickup_prices, pricing_policy, battery_level
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                  v.id,
                  storeId,
                  id,
                  JSON.stringify(v.attrs || {}),
                  v.price,
                  v.cost,
                  v.avgCost ?? v.cost,
                  v.qty,
                  v.minQty,
                  v.cardRate ?? null,
                  v.condition,
                  v.barcode || '',
                  v.imei || '',
                  JSON.stringify(v.pickupPrices || {}),
                  v.pricingPolicy ? JSON.stringify(v.pricingPolicy) : null,
                  v.batteryLevel ?? null,
                ],
              );
            }
          }

          await client.query('UPDATE stock_items SET avg_cost=$3,pricing_policy=$4 WHERE id=$1 AND store_id=$2',[id,storeId,body.avgCost??body.cost,JSON.stringify(body.pricingPolicy??{})]);
          await validatePickupPrices(client,storeId,body.pickupPrices);
          await client.query('UPDATE stock_items SET pickup_prices=$1 WHERE id=$2 AND store_id=$3',[JSON.stringify(body.pickupPrices),id,storeId]);
          // Entradas por fornecedor lançam a própria movimentação; o restante do saldo inicial vai como "manual".
          const entryQty = entryGroups
            ? await saveSupplierEntries(client, storeId, id, entryGroups, { defaultSupplierId: body.supplierId || null, operator: req.user?.name || 'Operador', previousQty: 0 })
            : 0;
          // Se qty inicial > 0, registra kardex
          if (body.qty - entryQty > 0) {
            const movId = `MOV-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            await client.query(
              `INSERT INTO stock_movements (
                id, store_id, stock_id, type, qty, previous_qty, new_qty, unit_cost, ref_type, operator_name, notes
              ) VALUES ($1, $2, $3, 'in', $4, $5, $6, $7, 'manual', $8, 'Saldo inicial no cadastro')`,
              [movId, storeId, id, body.qty - entryQty, entryQty, body.qty, body.cost, req.user?.name || 'Operador'],
            );
          }

          // Cor/capacidade sugeridas pelo catálogo que ainda não existiam no atributo são criadas nele.
          await ensureProductAttributeValues(client, storeId, { attrs: body.attrs, variations: body.variations });
          const createdRes = await client.query(`SELECT * FROM stock_items WHERE id = $1 AND store_id = $2`, [id, storeId]);
          const [created] = await attachSupplierEntries(client, storeId, [formatStockRow((await stockDetails(client, storeId, createdRes.rows))[0])]);
          await client.query('COMMIT');
          res.status(201).json({ success: true, data: created });
          return;
        } catch (err) {
          await client.query('ROLLBACK');
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
          if (body.variations !== undefined && body.variations.length > 0) {
            const existingVariations = await client.query(
              'SELECT id FROM stock_item_variations WHERE store_id = $1 AND stock_item_id = $2',
              [storeId, id],
            );
            body.variations = persistableVariations(
              body.variations,
              existingVariations.rows.map((row: { id: string }) => row.id),
            );
            body.qty = body.variations.reduce((acc, v) => acc + (Number(v.qty) || 0), 0);
            body.minQty = body.variations.reduce((acc, v) => acc + (Number(v.minQty) || 0), 0);
          }
          const entryGroups = supplierEntryGroups(body);
          if(body.skuAuto||body.sku!==undefined&&body.sku!==curr.sku)body.sku=await allocateSku(client,storeId,{...curr,...body},id);
          if(body.avgCost!==undefined||body.pricingPolicy!==undefined)await client.query('UPDATE stock_items SET avg_cost=COALESCE($3,avg_cost),pricing_policy=COALESCE($4,pricing_policy) WHERE id=$1 AND store_id=$2',[id,storeId,body.avgCost,body.pricingPolicy!==undefined?JSON.stringify(body.pricingPolicy??{}):null]);
          const nextQty = body.qty !== undefined ? body.qty : Number(curr.qty);
          const available=await unreservedQuantity(client,storeId,id,Number(curr.qty));
          const reserved=Number(curr.qty)-available;
          if(reserved>0 && (nextQty<reserved || body.active===false || ['name','brand','capacity','color','condition','attrs','cost'].some(k=>(body as any)[k]!==undefined && JSON.stringify((body as any)[k])!==JSON.stringify(curr[k])))) throw Object.assign(new Error('Produto reservado por encomenda. Libere a reserva antes de alterar sua variante, custo ou saldo.'),{status:409});


          if (body.supplierId !== undefined) {
            const supplierId = body.supplierId || null;
            if (supplierId && !(await client.query('SELECT 1 FROM suppliers WHERE id = $1 AND store_id = $2', [supplierId, storeId])).rows.length) {
              throw Object.assign(new Error('Fornecedor não encontrado nesta loja.'), { status: 400 });
            }
            await client.query('UPDATE stock_items SET supplier_id = $3 WHERE id = $1 AND store_id = $2', [id, storeId, supplierId]);
          }
          if (body.skuWithSupplier !== undefined) await client.query('UPDATE stock_items SET sku_with_supplier = $3 WHERE id = $1 AND store_id = $2', [id, storeId, body.skuWithSupplier]);
          await saveProductDetails(client, storeId, id, body);
          if(body.pickupPrices!==undefined){await validatePickupPrices(client,storeId,body.pickupPrices);await client.query('UPDATE stock_items SET pickup_prices=$1 WHERE id=$2 AND store_id=$3',[JSON.stringify(body.pickupPrices),id,storeId]);}
          const entryQty = entryGroups
            ? await saveSupplierEntries(client, storeId, id, entryGroups, { defaultSupplierId: body.supplierId !== undefined ? body.supplierId || null : curr.supplier_id, operator: req.user?.name || 'Operador', previousQty: Number(curr.qty) })
            : 0;
          // Se qty mudou além do que entrou pelas entradas de fornecedor, registra o ajuste no kardex
          if (body.qty !== undefined && body.qty - entryQty !== Number(curr.qty)) {
            const delta = body.qty - entryQty - Number(curr.qty);
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
                Number(curr.qty) + entryQty,
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
                 variations = COALESCE($21, variations),
                 updated_at = now()
             WHERE id = $22 AND store_id = $23`,
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
              body.variations !== undefined ? JSON.stringify(body.variations) : null,
              id,
              storeId,
            ],
          );

          if (body.variations !== undefined) {
            await client.query('DELETE FROM stock_item_variations WHERE store_id = $1 AND stock_item_id = $2', [storeId, id]);
            for (const v of body.variations) {
              await client.query(
                `INSERT INTO stock_item_variations (
                  id, store_id, stock_item_id, attrs, price, cost, avg_cost, qty, min_qty,
                  card_rate, condition, barcode, imei, pickup_prices, pricing_policy, battery_level
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                  v.id,
                  storeId,
                  id,
                  JSON.stringify(v.attrs || {}),
                  v.price,
                  v.cost,
                  v.avgCost ?? v.cost,
                  v.qty,
                  v.minQty,
                  v.cardRate ?? null,
                  v.condition,
                  v.barcode || '',
                  v.imei || '',
                  JSON.stringify(v.pickupPrices || {}),
                  v.pricingPolicy ? JSON.stringify(v.pricingPolicy) : null,
                  v.batteryLevel ?? null,
                ],
              );
            }
          }
          if (body.attrs !== undefined || body.variations !== undefined) {
            await ensureProductAttributeValues(client, storeId, { attrs: body.attrs, variations: body.variations });
          }

          await client.query('COMMIT');

          const updatedRes = await pool.query(`SELECT * FROM stock_items WHERE id = $1`, [id]);
          res.json({ success: true, data: (await attachSupplierEntries(pool, storeId, [formatStockRow((await stockDetails(pool,storeId,updatedRes.rows))[0])]))[0] });
          return;
        } catch (err) {
          await client.query('ROLLBACK');
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
        const exists = await pool.query('SELECT 1 FROM stock_items WHERE id = $1 AND store_id = $2', [id, storeId]);
        if (!exists.rows.length) throw Object.assign(new Error('Produto não encontrado nesta loja.'), { status: 404 });
        // Produto com histórico de verdade (venda, nota, troca) não some do banco: notas, vendas e
        // relatórios dependem dele. Ele é inativado e sai do PDV, do totem e das vendas.
        // As movimentações do próprio cadastro (saldo inicial, entradas de fornecedor, ajustes) não
        // contam: sem histórico de verdade, o produto é excluído junto com elas.
        const history = await pool.query(
          `SELECT 1 FROM stock_movements WHERE store_id = $1 AND stock_id = $2 AND COALESCE(ref_type, '') NOT IN ('manual', 'adjustment', 'supplier_entry')
           UNION ALL SELECT 1 FROM sales_order_lines l JOIN sales_orders o ON o.id = l.sale_id WHERE o.store_id = $1 AND l.stock_id = $2
           UNION ALL SELECT 1 FROM stock_invoice_lines il JOIN stock_invoices i ON i.id = il.invoice_id WHERE i.store_id = $1 AND il.stock_item_id = $2
           UNION ALL SELECT 1 FROM sale_trade_ins t WHERE t.store_id = $1 AND t.stock_item_id = $2
           LIMIT 1`,
          [storeId, id],
        );
        const deactivate = async () => {
          await pool.query('UPDATE stock_items SET active = false, show_on_totem = false, updated_at = now() WHERE id = $1 AND store_id = $2', [id, storeId]);
          res.json({ success: true, data: { ok: true, deactivated: true, message: 'O produto tem vendas, notas ou trocas, então foi inativado (some do PDV, do totem e das vendas) e o histórico foi mantido.' } });
        };
        if (history.rows.length) return void (await deactivate());
        const db = await pool.connect();
        try {
          await db.query('BEGIN');
          await db.query('DELETE FROM stock_movements WHERE store_id = $1 AND stock_id = $2', [storeId, id]);
          await db.query('DELETE FROM stock_items WHERE id = $1 AND store_id = $2', [id, storeId]);
          await db.query('COMMIT');
        } catch (deleteError) {
          await db.query('ROLLBACK');
          // Algum outro registro ainda aponta para o produto (ex.: kit, lote): fica inativado.
          console.warn('[stock/delete] exclusão bloqueada, inativando:', (deleteError as Error).message);
          db.release();
          return void (await deactivate());
        }
        db.release();
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
                  pickup_prices, attrs, color, capacity, card_rate, show_on_totem, images, variations, created_at, updated_at, sku_with_supplier, group_id, subgroup_id, entry_date, dun14, purchase_unit, purchase_factor, battery_level, show_condition_on_totem
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
    if (!canManageArea(req)) { res.status(403).json({ success:false,error:{code:'FORBIDDEN',message:'Somente a gestão pode aplicar ajustes de estoque.'} }); return; }
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

async function allocateSku(db:PoolClient,storeId:string,body:any,id:string){
 await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',['sku:'+storeId]);
 const automatic=body.skuAuto===true||!body.sku?.trim();
 let supplier='';
 const supplierId=body.supplierId!==undefined?body.supplierId:body.supplier_id;
 const withSupplier=(body.skuWithSupplier??body.sku_with_supplier)!==false;
 if(automatic&&withSupplier&&supplierId){
  const row=(await db.query('SELECT name,trade_name,sku_name FROM suppliers WHERE id=$1 AND store_id=$2',[supplierId,storeId])).rows[0];
  supplier=supplierSkuName(row&&{name:row.name,tradeName:row.trade_name,skuName:row.sku_name});
 }
 const base=automatic?productSku({...body,supplier}):body.sku.trim();
 const existing=await db.query('SELECT sku FROM stock_items WHERE store_id=$1 AND id<>$2 AND (sku=$3 OR sku LIKE $4)',[storeId,id,base,base+'-%']);
 const used=new Set(existing.rows.map(r=>r.sku));
 if(!automatic&&used.has(base))throw Object.assign(new Error('Este SKU já pertence a outro produto da loja.'),{status:409});
 let candidate=base;let n=2;while(used.has(candidate))candidate=base+'-'+n++;
 return candidate;
}
