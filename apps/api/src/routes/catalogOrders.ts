import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middlewares/authMiddleware.js';
import { findSalesCatalogByPublicKey, variantKey } from '../services/salesCatalog.js';
import { catalogItems, orderMethodOf } from './salesCatalogs.js';

/**
 * Pedido do catálogo pelo celular: o cliente se cadastra, escolhe os produtos (em estoque ou sob
 * encomenda), diz quem o atendeu, a forma de pagamento e, se quiser, adianta os dados do aparelho da
 * troca. O pedido cai na fila da venda externa: a loja aprova o cadastro e finaliza a venda.
 * Preço e disponibilidade são sempre os do estoque na hora do pedido (nunca os do celular).
 */
export const catalogOrdersRouter = Router();
catalogOrdersRouter.use('/api/v1/catalog-orders', requireAuth);

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
const round2 = (value: number) => Math.round(value * 100) / 100;

export const PAYMENT_CHOICES = ['PIX', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Transferência Bancária'] as const;

const text = (max: number) => z.string().trim().max(max).default('');
const customerSchema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.').max(120),
  documentType: z.enum(['cpf', 'cnpj']).default('cpf'),
  document: text(20).refine((value) => !value || [11, 14].includes(digits(value).length), 'CPF ou CNPJ inválido.'),
  rg: text(30),
  phone: z.string().trim().max(30).refine((value) => digits(value).length >= 10, 'Informe o celular com DDD.'),
  email: text(120).refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'E-mail inválido.'),
  zipCode: text(12),
  street: text(160),
  number: text(20),
  complement: text(80),
  district: text(80),
  city: text(80),
  state: text(2),
});
const tradeInSchema = z.object({
  device: z.string().trim().min(2, 'Informe o modelo do aparelho da troca.').max(120),
  capacity: text(30),
  color: text(40),
  imei: text(20),
  battery: z.coerce.number().int().min(0).max(100).nullable().default(null),
  condition: z.enum(['perfect', 'marks', 'damaged']).default('perfect'),
  screenReplaced: z.boolean().default(false),
  opened: z.boolean().default(false),
  faceIdOk: z.boolean().default(true),
  hasBox: z.boolean().default(false),
  hasInvoice: z.boolean().default(false),
  notes: text(500),
});
const orderSchema = z.object({
  kind: z.enum(['order', 'signup']).default('order'),
  requestKey: z.string().trim().min(8).max(80).optional(),
  customer: customerSchema,
  sellerId: z.string().trim().max(80).nullish(),
  items: z
    .array(z.object({ productId: z.string().min(1).max(80), attributes: z.array(z.object({ id: z.string().max(80), value: z.string().max(100) })).max(8).default([]), qty: z.coerce.number().int().min(1).max(3).default(1) }))
    .max(10, 'No máximo 10 itens por pedido.')
    .default([]),
  payment: z.enum(PAYMENT_CHOICES).default('PIX'),
  installments: z.coerce.number().int().min(1).max(18).default(1),
  fulfillment: z.enum(['store', 'delivery']).default('store'),
  tradeIn: tradeInSchema.nullish(),
  notes: text(500),
  /** Campo escondido: robô preenche, gente não. */
  website: z.string().max(200).optional(),
});

// Limite por aparelho/IP: no máximo 8 envios a cada 10 minutos por catálogo.
const recent = new Map<string, number[]>();
function rateLimit(key: string) {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((time) => now - time < 10 * 60_000);
  if (list.length >= 8) throw httpError('Muitos envios seguidos. Aguarde alguns minutos e tente de novo.', 429);
  list.push(now);
  recent.set(key, list);
}

const view = (row: any) => ({
  id: row.id,
  code: row.code,
  kind: row.kind,
  status: row.status,
  customer: row.customer ?? {},
  customerId: row.customer_id ?? null,
  sellerId: row.seller_id ?? null,
  sellerName: row.seller_name ?? '',
  items: Array.isArray(row.items) ? row.items : [],
  tradeIn: row.trade_in ?? null,
  payment: row.payment,
  installments: Number(row.installments) || 1,
  fulfillment: row.fulfillment,
  notes: row.notes,
  total: Number(row.total) || 0,
  saleId: row.sale_id ?? null,
  handledBy: row.handled_by,
  cancelReason: row.cancel_reason,
  catalogTitle: row.catalog_title ?? '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Cliente envia o pedido (ou só o cadastro) pelo link do catálogo. */
catalogOrdersRouter.post('/api/v1/public/sales-catalogs/:token/orders', async (req, res, next) => {
  try {
    const key = String(req.params.token ?? '').trim();
    if (!key) throw httpError('Catálogo não encontrado ou link desativado.', 404);
    const catalog = await findSalesCatalogByPublicKey(pool, key);
    if (!catalog) throw httpError('Catálogo não encontrado ou link desativado.', 404);
    const body = orderSchema.parse(req.body ?? {});
    if (body.website) throw httpError('Não foi possível enviar.', 400);
    // Catálogo digital é só vitrine: aceita o cadastro do cliente, mas não pedido com produtos.
    if (catalog.mode === 'catalog' && (body.items ?? []).length) throw httpError('Este catálogo é só para consulta. Fale com a loja pelo WhatsApp para comprar.', 400);
    rateLimit(`${catalog.id}:${req.ip}`);
    const storeId = catalog.store_id;

    if (body.requestKey) {
      const existing = (await pool.query('SELECT * FROM catalog_orders WHERE store_id = $1 AND request_key = $2', [storeId, body.requestKey])).rows[0];
      if (existing) {
        res.json({ success: true, data: { id: existing.id, code: existing.code, total: Number(existing.total) || 0 } });
        return;
      }
    }
    if (body.kind === 'order' && !body.items.length) throw httpError('Escolha pelo menos um produto.');
    if (body.sellerId) {
      const seller = (await pool.query('SELECT 1 FROM sellers WHERE id = $1 AND store_id = $2 AND active = true', [body.sellerId, storeId])).rows[0];
      if (!seller) throw httpError('Vendedor não encontrado. Escolha na lista.');
    }
    if (body.fulfillment === 'delivery' && (!body.customer.street || !body.customer.number || !body.customer.city)) {
      throw httpError('Para entrega, informe rua, número e cidade.');
    }

    // Itens com o preço e a disponibilidade de agora (o produto pode ter sido vendido nesse meio-tempo).
    const allowed: string[] = Array.isArray(catalog.product_ids) ? catalog.product_ids : [];
    const current = await catalogItems(pool, storeId, allowed, false, catalog.include_order_products !== false);
    const orderMethod = await orderMethodOf(pool, storeId);
    const lines = body.items.map((wanted) => {
      const item = current.find((entry) => entry.id === wanted.productId);
      if (!item) throw httpError('Um dos produtos não está mais neste catálogo. Atualize a página.', 409);
      const variant = item.variants.length
        ? item.variants.find((entry) => variantKey(entry.attributes) === variantKey(wanted.attributes))
        : { label: '', price: item.price, availability: item.soldOut ? 'sold_out' : 'in_stock', leadDays: null, attributes: [] as Array<{ id: string; name: string; value: string }>, condition: item.condition };
      if (!variant) throw httpError(`A opção escolhida de ${item.name} não está mais disponível. Atualize a página.`, 409);
      if (variant.availability === 'sold_out') throw httpError(`${item.name}${variant.label ? ` (${variant.label})` : ''} acabou de esgotar. Escolha outra opção.`, 409);
      return {
        productId: item.id,
        name: item.name,
        variantLabel: variant.label,
        condition: variant.condition,
        attributes: variant.attributes,
        qty: wanted.qty,
        price: variant.price,
        availability: variant.availability,
        leadDays: variant.leadDays,
        pickupMethodId: variant.availability === 'order' ? orderMethod?.id ?? null : null,
      };
    });
    const total = round2(lines.reduce((sum, line) => sum + line.price * line.qty, 0));
    const code = `${Math.floor(1000 + Math.random() * 9000)}`;
    const row = (
      await pool.query(
        `INSERT INTO catalog_orders (id, store_id, catalog_id, code, kind, customer, seller_id, items, trade_in, payment, installments, fulfillment, notes, total, request_key)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14::numeric, $15) RETURNING *`,
        [
          `PCT-${randomUUID()}`,
          storeId,
          catalog.id,
          code,
          body.kind,
          JSON.stringify(body.customer),
          body.sellerId || null,
          JSON.stringify(lines),
          body.tradeIn ? JSON.stringify(body.tradeIn) : null,
          body.payment,
          body.payment === 'Cartão de Crédito' ? body.installments : 1,
          body.fulfillment,
          body.notes,
          total,
          body.requestKey ?? null,
        ],
      )
    ).rows[0];
    res.status(201).json({ success: true, data: { id: row.id, code: row.code, total } });
  } catch (error) {
    next(error);
  }
});

/** Fila da loja: novos e em atendimento (?status=all para o histórico). */
catalogOrdersRouter.get('/api/v1/catalog-orders', async (req, res, next) => {
  try {
    const all = req.query.status === 'all';
    const rows = (
      await pool.query(
        `SELECT o.*, s.name AS seller_name, c.title AS catalog_title FROM catalog_orders o
           LEFT JOIN sellers s ON s.id = o.seller_id AND s.store_id = o.store_id
           LEFT JOIN sales_catalogs c ON c.id = o.catalog_id
          WHERE o.store_id = $1 ${all ? '' : "AND o.status IN ('new', 'in_service')"}
          ORDER BY o.created_at DESC LIMIT 200`,
        [req.storeId],
      )
    ).rows;
    res.json({ success: true, data: rows.map(view) });
  } catch (error) {
    next(error);
  }
});

/**
 * Atender: aprova o cadastro (ou acha o cliente que já existe pelo CPF/CNPJ ou telefone, completando o que
 * faltava) e marca o pedido em atendimento. A tela da venda externa usa o cliente e os itens para preencher a venda.
 */
catalogOrdersRouter.post('/api/v1/catalog-orders/:id/accept', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = (await client.query('SELECT * FROM catalog_orders WHERE id = $1 AND store_id = $2 FOR UPDATE', [req.params.id, req.storeId])).rows[0];
    if (!order) throw httpError('Pedido não encontrado nesta loja.', 404);
    if (order.status === 'sold' || order.status === 'cancelled') throw httpError('Este pedido já foi finalizado.', 409);
    const c = order.customer ?? {};
    const doc = digits(c.document);
    const phone = digits(c.phone);
    let customer = order.customer_id ? (await client.query('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [order.customer_id, req.storeId])).rows[0] : null;
    if (!customer && doc) {
      customer = (await client.query("SELECT * FROM customers WHERE store_id = $1 AND regexp_replace(COALESCE(document, ''), '\\D', '', 'g') = $2 LIMIT 1", [req.storeId, doc])).rows[0];
    }
    if (!customer && phone) customer = (await client.query('SELECT * FROM customers WHERE store_id = $1 AND phone_digits = $2 LIMIT 1', [req.storeId, phone])).rows[0];
    let created = false;
    if (customer) {
      // Já cadastrado: só completa o que estava em branco (nunca apaga o que a loja já tinha).
      await client.query(
        `UPDATE customers SET
            document = CASE WHEN COALESCE(document, '') = '' THEN $3 ELSE document END,
            document_type = CASE WHEN COALESCE(document, '') = '' THEN $4 ELSE document_type END,
            rg = CASE WHEN COALESCE(rg, '') = '' THEN $5 ELSE rg END,
            email = CASE WHEN COALESCE(email, '') = '' THEN $6 ELSE email END,
            zip_code = CASE WHEN COALESCE(zip_code, '') = '' THEN $7 ELSE zip_code END,
            street = CASE WHEN COALESCE(street, '') = '' THEN $8 ELSE street END,
            number = CASE WHEN COALESCE(number, '') = '' THEN $9 ELSE number END,
            complement = CASE WHEN COALESCE(complement, '') = '' THEN $10 ELSE complement END,
            district = CASE WHEN COALESCE(district, '') = '' THEN $11 ELSE district END,
            city = CASE WHEN COALESCE(city, '') = '' THEN $12 ELSE city END,
            state = CASE WHEN COALESCE(state, '') = '' THEN $13 ELSE state END,
            seller_id = COALESCE(seller_id, $14),
            updated_at = now()
          WHERE id = $1 AND store_id = $2`,
        [customer.id, req.storeId, c.document ?? '', c.documentType ?? 'cpf', c.rg ?? '', c.email ?? '', c.zipCode ?? '', c.street ?? '', c.number ?? '', c.complement ?? '', c.district ?? '', c.city ?? '', String(c.state ?? '').toUpperCase(), order.seller_id ?? null],
      );
    } else {
      const id = `CUS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await client.query(
        `INSERT INTO customers (id, store_id, name, trade_name, document_type, document, phone, phone_digits, email, zip_code, street, number, complement, district, city, state,
                                customer_group, credit_limit, notes, active, rg, seller_id)
         VALUES ($1, $2, $3, '', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'Padrão', 0, $16, true, $17, $18)`,
        [
          id,
          req.storeId,
          String(c.name ?? '').trim(),
          c.documentType ?? 'cpf',
          c.document ?? '',
          c.phone ?? '',
          phone || null,
          c.email ?? '',
          c.zipCode ?? '',
          c.street ?? '',
          c.number ?? '',
          c.complement ?? '',
          c.district ?? '',
          c.city ?? '',
          String(c.state ?? '').toUpperCase(),
          `Cadastro feito pelo cliente no catálogo (pedido ${order.code}).`,
          c.rg ?? '',
          order.seller_id ?? null,
        ],
      );
      created = true;
      customer = { id };
    }
    const updated = (
      await client.query(
        `UPDATE catalog_orders SET customer_id = $3, status = CASE WHEN kind = 'signup' AND trade_in IS NULL THEN 'sold' ELSE 'in_service' END, handled_by = $4, updated_at = now()
          WHERE id = $1 AND store_id = $2 RETURNING *`,
        [order.id, req.storeId, customer.id, req.user?.name ?? ''],
      )
    ).rows[0];
    const saved = (await client.query('SELECT * FROM customers WHERE id = $1 AND store_id = $2', [customer.id, req.storeId])).rows[0];
    await client.query('COMMIT');
    res.json({
      success: true,
      data: {
        order: view(updated),
        createdCustomer: created,
        customer: { id: saved.id, name: saved.name, phone: saved.phone ?? '', document: saved.document ?? '', email: saved.email ?? '' },
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally {
    client.release();
  }
});

catalogOrdersRouter.post('/api/v1/catalog-orders/:id/cancel', async (req, res, next) => {
  try {
    const reason = z.object({ reason: z.string().trim().max(300).default('') }).parse(req.body ?? {}).reason;
    const row = (
      await pool.query(
        `UPDATE catalog_orders SET status = 'cancelled', cancel_reason = $3, handled_by = $4, updated_at = now()
          WHERE id = $1 AND store_id = $2 AND status IN ('new', 'in_service') RETURNING *`,
        [req.params.id, req.storeId, reason, req.user?.name ?? ''],
      )
    ).rows[0];
    if (!row) throw httpError('Pedido não encontrado ou já finalizado.', 404);
    res.json({ success: true, data: view(row) });
  } catch (error) {
    next(error);
  }
});

/** A venda externa concluída com o pedido: sai da fila (chamado dentro da transação da venda). */
export async function closeCatalogOrder(db: { query: typeof pool.query }, storeId: string, orderId: string, saleId: string) {
  await db.query("UPDATE catalog_orders SET status = 'sold', sale_id = $3, updated_at = now() WHERE id = $1 AND store_id = $2 AND status IN ('new', 'in_service')", [orderId, storeId, saleId]);
}
