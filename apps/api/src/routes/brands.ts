import { canManageArea } from '../services/employeeAccess.js';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { fetchBrandLogo } from '../services/brandLogo.js';

export const brandsRouter = Router();

const brandSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da marca.').max(80, 'Nome da marca muito longo.'),
  active: z.boolean().optional(),
  /** Ícone enviado pela loja (data URL de imagem) ou null para remover. */
  logo: z.string().startsWith('data:image/').max(400_000, 'Imagem do ícone muito grande.').nullable().optional(),
});


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
    logo: row.logo ?? null,
    logoSource: row.logo_source ?? '',
  };
}

function forbidden(res: any) {
  res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Sem permissão para alterar marcas.' } });
}

function duplicate(res: any) {
  res.status(409).json({ success: false, error: { code: 'BRAND_EXISTS', message: 'Já existe uma marca com esse nome nesta loja.' } });
}

const LIST_SQL = `
  SELECT b.id, b.name, b.slug, b.active, b.logo, b.logo_source,
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
    if (!canManageArea(req)) return forbidden(res);
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
    // Marca nova já tenta trazer o ícone padrão pelo nome; sem ícone, a loja envia depois.
    const logo = await fetchBrandLogo(body.name);
    if (logo) await pool.query(`UPDATE store_brands SET logo = $3, logo_source = 'auto' WHERE id = $1 AND store_id = $2`, [inserted.rows[0].id, req.storeId, logo]);
    const row = await pool.query(`${LIST_SQL} AND b.id = $2`, [req.storeId, inserted.rows[0].id]);
    res.status(201).json({ success: true, data: toBrand(row.rows[0]) });
  } catch (error) {
    next(error);
  }
});

brandsRouter.patch('/api/v1/brands/:id', requireAuth, async (req, res, next) => {
  if (!canManageArea(req)) return forbidden(res);
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
    if (body.logo !== undefined) {
      await client.query(`UPDATE store_brands SET logo = $3, logo_source = $4 WHERE id = $1 AND store_id = $2`, [req.params.id, req.storeId, body.logo, body.logo ? 'upload' : '']);
    }
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
    if (!canManageArea(req)) return forbidden(res);
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

/** Busca o ícone padrão de uma marca pelo nome (substitui só se a loja ainda não enviou um). */
brandsRouter.post('/api/v1/brands/:id/logo/auto', requireAuth, async (req, res, next) => {
  try {
    if (!canManageArea(req)) return forbidden(res);
    const current = await pool.query('SELECT id, name FROM store_brands WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
    if (!current.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Marca não encontrada.' } });
      return;
    }
    const logo = await fetchBrandLogo(current.rows[0].name);
    if (!logo) {
      res.status(404).json({ success: false, error: { code: 'LOGO_NOT_FOUND', message: 'Não encontramos o ícone desta marca automaticamente. Envie a imagem do ícone.' } });
      return;
    }
    await pool.query(`UPDATE store_brands SET logo = $3, logo_source = 'auto', updated_at = now() WHERE id = $1 AND store_id = $2`, [req.params.id, req.storeId, logo]);
    const row = await pool.query(`${LIST_SQL} AND b.id = $2`, [req.storeId, req.params.id]);
    res.json({ success: true, data: toBrand(row.rows[0]) });
  } catch (error) {
    next(error);
  }
});

/** Preenche de uma vez o ícone de todas as marcas da loja que ainda estão sem ícone. */
brandsRouter.post('/api/v1/brands/logos/auto', requireAuth, async (req, res, next) => {
  try {
    if (!canManageArea(req)) return forbidden(res);
    const pending = await pool.query(`SELECT id, name FROM store_brands WHERE store_id = $1 AND (logo IS NULL OR logo = '') ORDER BY name`, [req.storeId]);
    const found: string[] = [];
    const missing: string[] = [];
    // Busca em paralelo: cada marca pode tentar várias fontes até achar o ícone.
    const logos = await Promise.all(pending.rows.map((brand) => fetchBrandLogo(brand.name)));
    for (const [index, brand] of pending.rows.entries()) {
      const logo = logos[index];
      if (!logo) { missing.push(brand.name); continue; }
      await pool.query(`UPDATE store_brands SET logo = $3, logo_source = 'auto', updated_at = now() WHERE id = $1 AND store_id = $2`, [brand.id, req.storeId, logo]);
      found.push(brand.name);
    }
    res.json({ success: true, data: { found, missing } });
  } catch (error) {
    next(error);
  }
});
