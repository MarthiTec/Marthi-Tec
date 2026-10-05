import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';

export const brandsRouter = Router();

const brandSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da marca.').max(80, 'Nome da marca muito longo.'),
  active: z.boolean().optional(),
});

const MANAGER_ROLES = ['admin', 'manager', 'superadmin'];

export function brandSlug(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function toBrand(row: any) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    active: Boolean(row.active),
    productCount: Number(row.product_count ?? 0),
  };
}

function forbidden(res: any) {
  res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Sem permissão para alterar marcas.' } });
}

function duplicate(res: any) {
  res.status(409).json({ success: false, error: { code: 'BRAND_EXISTS', message: 'Já existe uma marca com esse nome nesta loja.' } });
}

const LIST_SQL = `
  SELECT b.id, b.name, b.slug, b.active,
         (SELECT count(*) FROM stock_items s
           WHERE s.store_id = b.store_id AND lower(trim(s.brand)) IN (b.slug, lower(b.name))) AS product_count
  FROM store_brands b
  WHERE b.store_id = $1`;

brandsRouter.get('/api/v1/brands', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(`${LIST_SQL} ORDER BY b.name ASC`, [req.storeId]);
    res.json({ success: true, data: result.rows.map(toBrand) });
  } catch (error) {
    next(error);
  }
});

brandsRouter.post('/api/v1/brands', requireAuth, async (req, res, next) => {
  try {
    if (!MANAGER_ROLES.includes(req.user!.role ?? '')) return forbidden(res);
    const body = brandSchema.parse(req.body);
    const slug = brandSlug(body.name);
    const inserted = await pool.query(
      `INSERT INTO store_brands (id, store_id, slug, name, active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id, slug) DO NOTHING
       RETURNING id`,
      [`BRD-${randomUUID()}`, req.storeId, slug, body.name, body.active ?? true],
    );
    if (!inserted.rows[0]) return duplicate(res);
    const row = await pool.query(`${LIST_SQL} AND b.id = $2`, [req.storeId, inserted.rows[0].id]);
    res.status(201).json({ success: true, data: toBrand(row.rows[0]) });
  } catch (error) {
    next(error);
  }
});

brandsRouter.patch('/api/v1/brands/:id', requireAuth, async (req, res, next) => {
  if (!MANAGER_ROLES.includes(req.user!.role ?? '')) return forbidden(res);
  let client: PoolClient | undefined;
  try {
    const body = brandSchema.partial().parse(req.body);
    client = await pool.connect();
    await client.query('BEGIN');
    const current = await client.query('SELECT id, name, slug, active FROM store_brands WHERE id = $1 AND store_id = $2 FOR UPDATE', [req.params.id, req.storeId]);
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Marca não encontrada.' } });
      return;
    }
    const previous = current.rows[0];
    const name = body.name ?? previous.name;
    const slug = brandSlug(name);
    await client.query(`UPDATE store_brands SET name = $3, slug = $4, active = $5, updated_at = now() WHERE id = $1 AND store_id = $2`, [req.params.id, req.storeId, name, slug, body.active ?? previous.active]);
    if (slug !== previous.slug || name !== previous.name) {
      await client.query(`UPDATE stock_items SET brand = $3, updated_at = now() WHERE store_id = $1 AND lower(trim(brand)) IN ($2, $4)`, [req.storeId, previous.slug, slug, previous.name.toLowerCase()]);
    }
    const row = await client.query(`${LIST_SQL} AND b.id = $2`, [req.storeId, req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, data: toBrand(row.rows[0]) });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') { duplicate(res); return; }
    next(error);
  } finally { client?.release(); }
});

brandsRouter.delete('/api/v1/brands/:id', requireAuth, async (req, res, next) => {
  try {
    if (!MANAGER_ROLES.includes(req.user!.role ?? '')) return forbidden(res);
    const row = await pool.query(`${LIST_SQL} AND b.id = $2`, [req.storeId, req.params.id]);
    if (!row.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Marca não encontrada.' } });
      return;
    }
    if (Number(row.rows[0].product_count) > 0) {
      res.status(409).json({
        success: false,
        error: {
          code: 'BRAND_IN_USE',
          message: `Esta marca está em ${row.rows[0].product_count} produto(s). Inative-a em vez de excluir.`,
        },
      });
      return;
    }
    await pool.query('DELETE FROM store_brands WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});
