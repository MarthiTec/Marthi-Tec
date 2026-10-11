import { env } from '../../config/env.js';

type Db = { query: (sql: string, args?: unknown[]) => Promise<{ rows: any[] }> };

const CONDITION_LABEL: Record<string, string> = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };
const PICKUP_LABEL: Record<string, string> = { immediate: 'Retirada na loja', delivery: 'Entrega', order: 'Encomenda' };

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const parse = (value: unknown) => (typeof value === 'string' ? JSON.parse(value || 'null') : value);

/**
 * Dados PÚBLICOS do produto (ou da variação escolhida) para anúncio e página pública: nome, marca,
 * atributos, condição, bateria, preço, fotos, disponibilidade e formas de retirada.
 * Nunca inclui IMEI, custo, margem, fornecedor nem dados internos.
 */
export async function publicOffer(db: Db, storeId: string, productId: string, variationId?: string | null) {
  const product = (
    await db.query(
      `SELECT s.id, s.name, s.brand, s.price, s.qty, s.condition, s.battery_level, s.images, s.variations, s.attrs, s.pickup_prices, s.active,
              (SELECT name FROM catalog_types ct WHERE ct.id = s.catalog_type_id) AS type_name,
              (SELECT name FROM catalog_models cm WHERE cm.id = s.catalog_model_id) AS model_name,
              (SELECT b.name FROM store_brands b WHERE b.store_id = s.store_id AND (b.slug = s.brand OR lower(b.name) = lower(s.brand)) LIMIT 1) AS brand_name
         FROM stock_items s WHERE s.id = $1 AND s.store_id = $2`,
      [productId, storeId],
    )
  ).rows[0];
  if (!product || product.active === false) throw Object.assign(new Error('Produto não encontrado ou inativo.'), { status: 404 });
  const variations: any[] = Array.isArray(parse(product.variations)) ? parse(product.variations) : [];
  const variation = variationId ? variations.find((v) => v.id === variationId) : variations.length === 1 ? variations[0] : undefined;
  if (variationId && !variation) throw Object.assign(new Error('Variação não encontrada neste produto.'), { status: 404 });
  if (variations.length > 1 && !variation) throw Object.assign(new Error('Escolha a variação (cor, capacidade, condição) que será anunciada.'), { status: 400 });

  const attributes = (await db.query('SELECT id, name FROM product_attributes WHERE store_id = $1', [storeId])).rows;
  const attrName = new Map(attributes.map((attr) => [String(attr.id), String(attr.name)]));
  const attrs = Object.entries(variation?.attrs ?? (parse(product.attrs) || {}))
    .filter(([id, value]) => typeof value === 'string' && value && !id.startsWith('__'))
    .map(([id, value]) => ({ name: attrName.get(id) ?? '', value: String(value) }));
  const condition = String(variation?.condition ?? product.condition ?? 'new');
  const battery = condition === 'new' ? null : variation?.batteryLevel ?? product.battery_level ?? null;
  const price = Number(variation?.price ?? product.price) || 0;
  const qty = Number(variation ? variation.qty : product.qty) || 0;

  const pickupPrices = (variation?.pickupPrices && Object.keys(variation.pickupPrices).length ? variation.pickupPrices : parse(product.pickup_prices)) || {};
  const methods = (await db.query('SELECT id, name, kind, lead_days FROM pickup_methods WHERE store_id = $1 AND active = true ORDER BY kind, name', [storeId])).rows;
  const pickup = methods
    .filter((method) => pickupPrices[method.id] !== null)
    // Retirada imediata e entrega dependem de estoque; encomenda não.
    .filter((method) => method.kind === 'order' || qty > 0)
    .map((method) => ({ kind: String(method.kind), label: PICKUP_LABEL[method.kind] ?? String(method.name), price: Number(pickupPrices[method.id] ?? price) || price }));

  const images: string[] = (Array.isArray(parse(product.images)) ? parse(product.images) : []).filter((src: unknown) => typeof src === 'string' && src);
  const store = (await db.query('SELECT trade_name, phone, instagram, logo FROM stores WHERE id = $1', [storeId])).rows[0] ?? {};
  const title = [product.name, ...attrs.map((attr) => attr.value)].join(' ').replace(/\s+/g, ' ').trim();
  const details = [CONDITION_LABEL[condition] ?? condition, battery != null ? `bateria ${battery}%` : '', ...attrs.map((attr) => (attr.name ? `${attr.name}: ${attr.value}` : attr.value))].filter(Boolean);
  return {
    storeId,
    productId: String(product.id),
    variationId: variation?.id ?? null,
    title,
    brand: product.brand_name || product.brand || '',
    typeName: product.type_name || '',
    modelName: product.model_name || '',
    attrs,
    condition,
    conditionLabel: CONDITION_LABEL[condition] ?? condition,
    batteryLevel: battery,
    price,
    priceLabel: money(price),
    available: qty > 0 || pickup.some((item) => item.kind === 'order'),
    inStock: qty > 0,
    pickup,
    images,
    details,
    store: { name: store.trade_name || '', phone: store.phone && store.phone !== '(24) 99999-9999' ? store.phone : '', instagram: store.instagram || '', logo: store.logo || null },
    url: offerUrl(storeId, String(product.id), variation?.id ?? null),
  };
}

/** Endereço público do produto (destino do anúncio). */
export function offerUrl(storeId: string, productId: string, variationId: string | null) {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const url = new URL(`${base}/oferta/${encodeURIComponent(storeId)}/${encodeURIComponent(productId)}`);
  if (variationId) url.searchParams.set('v', variationId);
  return url.toString();
}

/** Texto inicial do anúncio (o lojista edita à vontade; o cadastro não muda). */
export function defaultAdCopy(offer: Awaited<ReturnType<typeof publicOffer>>) {
  const delivery = offer.pickup.map((item) => item.label).join(', ');
  const message = [
    `${offer.title} — ${offer.conditionLabel}${offer.batteryLevel != null ? `, bateria ${offer.batteryLevel}%` : ''}.`,
    `Por ${offer.priceLabel}.`,
    delivery ? `${delivery}.` : '',
    offer.store.name ? `${offer.store.name}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { headline: offer.title.slice(0, 40), message, description: offer.priceLabel };
}

