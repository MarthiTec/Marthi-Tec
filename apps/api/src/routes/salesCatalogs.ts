import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { buildCatalogItems } from '../services/salesCatalog.js';
import { isStoreManagement } from '../services/saleHistory.js';
import { getStoreBrandProfile } from './storeProfile.js';

/**
 * Catálogo de produtos para o cliente (painel do lojista). A loja marca os produtos, escolhe a capa e
 * manda o link; o cliente vê foto, nome, preço e as variações com cor, capacidade, condição e bateria,
 * sempre com o estoque e o preço atuais.
 */
export const salesCatalogsRouter = Router();
salesCatalogsRouter.use('/api/v1/sales-catalogs', requireAuth);

type Db = { query: typeof pool.query };
const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const newToken = () => randomBytes(18).toString('base64url');

const image = z
  .string()
  .max(2_000_000)
  .refine((value) => !value || value === 'none' || /^https:\/\//i.test(value) || /^data:image\//i.test(value), 'A foto da capa precisa ser HTTPS ou uma imagem do produto.');
const catalogSchema = z.object({
  title: z.string().trim().min(1, 'Informe o título do catálogo.').max(60),
  subtitle: z.string().trim().max(80).default(''),
  showCover: z.boolean().default(true),
  coverStyle: z.enum(['diagonal', 'band']).default('diagonal'),
  coverImage: image.default(''),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i, 'Cor inválida.').default('#e4572e'),
  showPrices: z.boolean().default(true),
  hideSoldOut: z.boolean().default(true),
  /** Produtos sob encomenda entram sempre (mesmo sem marcar). */
  includeOrderProducts: z.boolean().default(true),
  note: z.string().trim().max(300).default(''),
  productIds: z.array(z.string().min(1).max(80)).max(500).default([]),
  /** Produtos em destaque (faixa no topo da página de venda). */
  featuredIds: z.array(z.string().min(1).max(80)).max(30).default([]),
});

const view = (row: any) => ({
  id: row.id,
  title: row.title,
  subtitle: row.subtitle,
  showCover: row.show_cover,
  coverStyle: row.cover_style,
  coverImage: row.cover_image,
  accent: row.accent,
  showPrices: row.show_prices,
  hideSoldOut: row.hide_sold_out,
  includeOrderProducts: row.include_order_products !== false,
  note: row.note,
  productIds: Array.isArray(row.product_ids) ? row.product_ids : [],
  featuredIds: Array.isArray(row.featured_ids) ? row.featured_ids : [],
  token: row.token,
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Itens atuais do estoque para os produtos escolhidos (sem custo e sem IMEI). Com includeOrder, os
 * produtos sob encomenda da loja (sem unidade, mas com encomenda) entram no fim mesmo sem estar marcados.
 */
export async function catalogItems(db: Db, storeId: string, chosenIds: string[], hideSoldOut: boolean, includeOrder = false) {
  const extraIds = includeOrder
    ? (await db.query('SELECT id FROM stock_items WHERE store_id = $1 AND active = true AND NOT (id = ANY($2::text[])) ORDER BY name', [storeId, chosenIds])).rows.map((row) => String(row.id))
    : [];
  const productIds = [...chosenIds, ...extraIds];
  if (!productIds.length) return [];
  const products = (
    await db.query(
      `SELECT s.id, s.name, s.brand, s.images, s.price, s.qty, s.variations, s.condition, s.battery_level, s.color, s.capacity, s.active, s.created_at, s.pickup_prices, s.video_url, s.specs,
              (SELECT max(e.created_at) FROM stock_supplier_entries e WHERE e.store_id = s.store_id AND e.stock_item_id = s.id) AS last_purchase_at
         FROM stock_items s WHERE s.store_id = $1 AND s.id = ANY($2::text[])`,
      [storeId, productIds],
    )
  ).rows;
  const attributes = (await db.query('SELECT id, name FROM product_attributes WHERE store_id = $1', [storeId])).rows;
  const entries = (
    await db.query(
      `SELECT e.stock_item_id, e.variation_id, e.battery_level,
              e.qty - (SELECT count(*) FROM stock_sold_units u WHERE u.entry_id = e.id AND u.reverted_at IS NULL) AS free
         FROM stock_supplier_entries e WHERE e.store_id = $1 AND e.stock_item_id = ANY($2::text[])`,
      [storeId, productIds],
    )
  ).rows;
  const units = new Map<string, Array<{ variationId: string | null; battery: number | null; free: number }>>();
  for (const entry of entries) {
    const list = units.get(entry.stock_item_id) ?? [];
    list.push({ variationId: entry.variation_id ?? null, battery: entry.battery_level === null ? null : Number(entry.battery_level), free: Number(entry.free) || 0 });
    units.set(entry.stock_item_id, list);
  }
  const orderMethod = await orderMethodOf(db, storeId);
  const chosen = buildCatalogItems(products, chosenIds, attributes, units, { hideSoldOut, orderMethod });
  const extra = extraIds.length ? buildCatalogItems(products, extraIds, attributes, units, { hideSoldOut: true, orderMethod }).filter((item) => item.orderOnly) : [];
  return [...chosen, ...extra];
}

/** Modalidade "sob encomenda" ativa da loja (prazo e preço por produto). */
export async function orderMethodOf(db: Db, storeId: string) {
  const row = (await db.query("SELECT id, lead_days FROM pickup_methods WHERE store_id = $1 AND kind = 'order' AND active = true ORDER BY name LIMIT 1", [storeId])).rows[0];
  if (!row) return null;
  // Prazo por dia da semana: o catálogo mostra o maior ("até N dias").
  const days = row.lead_days && typeof row.lead_days === 'object' ? Object.values(row.lead_days).map(Number).filter((n) => Number.isFinite(n)) : [Number(row.lead_days) || 0];
  return { id: String(row.id), leadDays: Math.max(0, ...days) };
}

/** Vendedores ativos para o cliente dizer quem o atendeu (só o nome). */
async function activeSellers(db: Db, storeId: string) {
  return (await db.query('SELECT id, name FROM sellers WHERE store_id = $1 AND active = true ORDER BY name', [storeId])).rows.map((row) => ({ id: row.id, name: row.name }));
}

async function storeInfo(db: Db, storeId: string) {
  const profile = await getStoreBrandProfile(db as any, storeId);
  return profile
    ? { name: profile.name, logo: profile.logo, phone: profile.phone, instagram: profile.instagram, website: profile.website }
    : { name: '', logo: null, phone: '', instagram: '', website: '' };
}

salesCatalogsRouter.get('/api/v1/sales-catalogs', async (req, res, next) => {
  try {
    const rows = (await pool.query('SELECT * FROM sales_catalogs WHERE store_id = $1 ORDER BY updated_at DESC', [req.storeId])).rows;
    res.json({ success: true, data: rows.map(view) });
  } catch (error) {
    next(error);
  }
});

/** Prévia ao vivo do que está na tela (ainda sem salvar). */
salesCatalogsRouter.post('/api/v1/sales-catalogs/preview', async (req, res, next) => {
  try {
    const body = catalogSchema.partial({ title: true }).parse(req.body ?? {});
    const items = await catalogItems(pool, req.storeId!, body.productIds ?? [], body.hideSoldOut ?? true, body.includeOrderProducts ?? true);
    res.json({ success: true, data: { store: await storeInfo(pool, req.storeId!), items } });
  } catch (error) {
    next(error);
  }
});

salesCatalogsRouter.post('/api/v1/sales-catalogs', async (req, res, next) => {
  try {
    const body = catalogSchema.parse(req.body ?? {});
    const row = (
      await pool.query(
        `INSERT INTO sales_catalogs (id, store_id, title, subtitle, show_cover, cover_style, cover_image, accent, show_prices, hide_sold_out, note, product_ids, token, created_by, include_order_products, featured_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16::jsonb) RETURNING *`,
        [
          `CAT-${randomUUID()}`,
          req.storeId,
          body.title,
          body.subtitle,
          body.showCover,
          body.coverStyle,
          body.coverImage,
          body.accent,
          body.showPrices,
          body.hideSoldOut,
          body.note,
          JSON.stringify(body.productIds),
          newToken(),
          req.user?.name ?? '',
          body.includeOrderProducts,
          JSON.stringify(body.featuredIds),
        ],
      )
    ).rows[0];
    res.status(201).json({ success: true, data: view(row) });
  } catch (error) {
    next(error);
  }
});

salesCatalogsRouter.patch('/api/v1/sales-catalogs/:id', async (req, res, next) => {
  try {
    const body = catalogSchema.parse(req.body ?? {});
    const row = (
      await pool.query(
        `UPDATE sales_catalogs SET title = $3, subtitle = $4, show_cover = $5, cover_style = $6, cover_image = $7, accent = $8, show_prices = $9,
                hide_sold_out = $10, note = $11, product_ids = $12::jsonb, include_order_products = $13, featured_ids = $14::jsonb, updated_at = now()
          WHERE id = $1 AND store_id = $2 RETURNING *`,
        [
          req.params.id,
          req.storeId,
          body.title,
          body.subtitle,
          body.showCover,
          body.coverStyle,
          body.coverImage,
          body.accent,
          body.showPrices,
          body.hideSoldOut,
          body.note,
          JSON.stringify(body.productIds),
          body.includeOrderProducts,
          JSON.stringify(body.featuredIds),
        ],
      )
    ).rows[0];
    if (!row) throw httpError('Catálogo não encontrado nesta loja.', 404);
    res.json({ success: true, data: view(row) });
  } catch (error) {
    next(error);
  }
});

/** Novo link (o antigo deixa de abrir). */
salesCatalogsRouter.post('/api/v1/sales-catalogs/:id/new-link', async (req, res, next) => {
  try {
    const row = (await pool.query('UPDATE sales_catalogs SET token = $3, updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING *', [req.params.id, req.storeId, newToken()])).rows[0];
    if (!row) throw httpError('Catálogo não encontrado nesta loja.', 404);
    res.json({ success: true, data: view(row) });
  } catch (error) {
    next(error);
  }
});

salesCatalogsRouter.delete('/api/v1/sales-catalogs/:id', async (req, res, next) => {
  try {
    if (!isStoreManagement(req.user?.role)) throw httpError('Só a gestão exclui catálogos.', 403);
    const result = await pool.query('DELETE FROM sales_catalogs WHERE id = $1 AND store_id = $2', [req.params.id, req.storeId]);
    if (!result.rowCount) throw httpError('Catálogo não encontrado nesta loja.', 404);
    res.json({ success: true, data: { ok: true } });
  } catch (error) {
    next(error);
  }
});

/** Página do cliente (sem login): só pelo token do link. */
salesCatalogsRouter.get('/api/v1/public/sales-catalogs/:token', async (req, res, next) => {
  try {
    const row = (await pool.query('SELECT * FROM sales_catalogs WHERE token = $1', [String(req.params.token).slice(0, 64)])).rows[0];
    if (!row) throw httpError('Catálogo não encontrado ou link desativado.', 404);
    const catalog = view(row);
    const items = await catalogItems(pool, row.store_id, catalog.productIds, catalog.hideSoldOut, catalog.includeOrderProducts);
    const { token: _token, createdBy: _by, productIds: _ids, ...publicCatalog } = catalog;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { catalog: publicCatalog, sellers: await activeSellers(pool, row.store_id), store: await storeInfo(pool, row.store_id), items: catalog.showPrices ? items : items.map((item) => ({ ...item, price: 0, variants: item.variants.map((variant) => ({ ...variant, price: 0 })) })) } });
  } catch (error) {
    next(error);
  }
});
