import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { canManageArea } from '../services/employeeAccess.js';

/**
 * Cadastros de apoio do produto: grupos/subgrupos (com o nome que a loja preferir,
 * ex.: Família) e o histórico de entradas e saídas de cada produto.
 */
export const productCatalogRouter = Router();

const nameSchema = z.string().trim().min(1, 'Informe o nome.').max(80, 'Nome muito longo.');
const groupSchema = z.object({ name: nameSchema, parentId: z.string().nullable().optional(), active: z.boolean().optional() });
const labelsSchema = z.object({
  group: z.string().trim().min(1, 'Informe como chamar o grupo.').max(30),
  subgroup: z.string().trim().min(1, 'Informe como chamar o subgrupo.').max(30),
});

const forbidden = (res: any) => res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Sem permissão para alterar este cadastro.' } });
const notFound = (res: any) => res.status(404).json({ success: false, error: { message: 'Registro não encontrado nesta loja.' } });
const isDuplicate = (error: any) => error?.code === '23505';
const duplicate = (res: any, what: string) => res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: `Já existe ${what} com esse nome.` } });

/* ── Grupos e subgrupos ───────────────────────────────────── */

const toGroup = (row: any) => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id ?? null,
  active: Boolean(row.active),
  productCount: Number(row.product_count ?? 0),
});

async function groupLabels(storeId: string) {
  const row = (await pool.query('SELECT product_group_label, product_subgroup_label FROM stores WHERE id = $1', [storeId])).rows[0];
  return { group: row?.product_group_label || 'Grupo', subgroup: row?.product_subgroup_label || 'Subgrupo' };
}

productCatalogRouter.get('/api/v1/product-groups', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT g.*, (SELECT count(*) FROM stock_items s WHERE s.store_id = g.store_id AND (s.group_id = g.id OR s.subgroup_id = g.id)) AS product_count
         FROM product_groups g WHERE g.store_id = $1 ORDER BY lower(g.name)`,
      [req.storeId],
    );
    res.json({ success: true, data: { labels: await groupLabels(req.storeId!), groups: result.rows.map(toGroup) } });
  } catch (error) {
    next(error);
  }
});

productCatalogRouter.put('/api/v1/product-groups/labels', requireAuth, async (req, res, next) => {
  try {
    if (!canManageArea(req)) return forbidden(res);
    const body = labelsSchema.parse(req.body);
    await pool.query('UPDATE stores SET product_group_label = $2, product_subgroup_label = $3 WHERE id = $1', [req.storeId, body.group, body.subgroup]);
    res.json({ success: true, data: await groupLabels(req.storeId!) });
  } catch (error) {
    next(error);
  }
});

/** Subgrupo só pode ficar dentro de um grupo (um nível) da mesma loja. */
async function validParent(storeId: string, parentId: string | null | undefined, selfId?: string) {
  if (!parentId) return true;
  if (parentId === selfId) return false;
  const parent = (await pool.query('SELECT parent_id FROM product_groups WHERE id = $1 AND store_id = $2', [parentId, storeId])).rows[0];
  return Boolean(parent) && !parent.parent_id;
}

productCatalogRouter.post('/api/v1/product-groups', requireAuth, async (req, res, next) => {
  try {
    if (!canManageArea(req)) return forbidden(res);
    const body = groupSchema.parse(req.body);
    if (!(await validParent(req.storeId!, body.parentId))) {
      return res.status(400).json({ success: false, error: { message: 'Escolha um grupo válido para o subgrupo.' } });
    }
    const result = await pool.query(
      `INSERT INTO product_groups (id, store_id, parent_id, name, active) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [`PGR-${randomUUID()}`, req.storeId, body.parentId || null, body.name, body.active ?? true],
    );
    res.status(201).json({ success: true, data: toGroup(result.rows[0]) });
  } catch (error) {
    if (isDuplicate(error)) return duplicate(res, 'um registro neste nível');
    next(error);
  }
});

productCatalogRouter.patch('/api/v1/product-groups/:id', requireAuth, async (req, res, next) => {
  try {
    if (!canManageArea(req)) return forbidden(res);
    const body = groupSchema.partial().parse(req.body);
    const current = (await pool.query('SELECT * FROM product_groups WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId])).rows[0];
    if (!current) return notFound(res);
    const parentId = body.parentId === undefined ? current.parent_id : body.parentId || null;
    if (parentId && !(await validParent(req.storeId!, parentId, current.id))) {
      return res.status(400).json({ success: false, error: { message: 'Escolha um grupo válido para o subgrupo.' } });
    }
    if (parentId && (await pool.query('SELECT 1 FROM product_groups WHERE parent_id = $1 AND store_id = $2 LIMIT 1', [current.id, req.storeId])).rows.length) {
      return res.status(400).json({ success: false, error: { message: 'Este grupo tem subgrupos; ele não pode virar subgrupo.' } });
    }
    const result = await pool.query(
      `UPDATE product_groups SET name = COALESCE($3, name), active = COALESCE($4, active), parent_id = $5, updated_at = now()
        WHERE id = $1 AND store_id = $2 RETURNING *`,
      [current.id, req.storeId, body.name ?? null, body.active ?? null, parentId],
    );
    res.json({ success: true, data: toGroup(result.rows[0]) });
  } catch (error) {
    if (isDuplicate(error)) return duplicate(res, 'um registro neste nível');
    next(error);
  }
});

productCatalogRouter.delete('/api/v1/product-groups/:id', requireAuth, async (req, res, next) => {
  try {
    if (!canManageArea(req)) return forbidden(res);
    const result = await pool.query('DELETE FROM product_groups WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
    if (!result.rowCount) return notFound(res);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/* ── Últimas entradas e saídas do produto ─────────────────── */

const ENTRY_TYPES = new Set(['in', 'entry', 'return']);

productCatalogRouter.get('/api/v1/stock/:id/movements', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const exists = await pool.query('SELECT 1 FROM stock_items WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
    if (!exists.rows.length) return notFound(res);
    const result = await pool.query(
      `SELECT m.id, m.type::text AS type, m.qty, m.unit_cost, m.ref_type, m.ref_id, m.operator_name, m.notes, m.created_at,
              i.id AS invoice_id, i.number AS invoice_number, i.series AS invoice_series, i.issue_date AS invoice_issued_at,
              sup.id AS supplier_id, COALESCE(NULLIF(sup.trade_name, ''), sup.name) AS supplier_name,
              o.id AS sale_id, o.customer_id, o.customer_name
         FROM stock_movements m
         LEFT JOIN stock_invoices i ON i.id = m.ref_id AND i.store_id = m.store_id
         LEFT JOIN suppliers sup ON sup.id = i.supplier_id AND sup.store_id = m.store_id
         LEFT JOIN sales_orders o ON o.id = m.ref_id AND o.store_id = m.store_id
        WHERE m.store_id = $1 AND m.stock_id = $2
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $3`,
      [req.storeId, req.params.id, limit],
    );
    res.json({
      success: true,
      data: result.rows.map((row) => ({
        id: row.id,
        direction: ENTRY_TYPES.has(row.type) ? 'in' : row.type === 'adjustment' ? 'adjustment' : 'out',
        type: row.type,
        origin: row.ref_type ?? '',
        qty: Number(row.qty) || 0,
        unitCost: Number(row.unit_cost) || 0,
        at: row.created_at,
        operator: row.operator_name ?? '',
        notes: row.notes ?? '',
        invoice: row.invoice_id ? { id: row.invoice_id, number: row.invoice_number ?? '', series: row.invoice_series ?? '', issuedAt: row.invoice_issued_at } : null,
        supplier: row.supplier_id ? { id: row.supplier_id, name: row.supplier_name ?? '' } : null,
        customer: row.sale_id && (row.customer_id || row.customer_name) ? { id: row.customer_id ?? null, name: row.customer_name ?? '' } : null,
        saleId: row.sale_id ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});
