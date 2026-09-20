/**
 * E-commerce: canais, credenciais por plataforma, anúncios ligados ao estoque.
 * Sync MVP local (qty/preço/imagens). OAuth real fica no Nest.
 */

import {
  getAdminState,
  saveStock,
  stockItemImages,
  type StockItem,
} from './adminStore';

const STORAGE_KEY = 'marthi.ecommerce.v2';

export type EcommerceChannelId =
  | 'mercadolivre'
  | 'shopee'
  | 'ifood'
  | 'amazon'
  | 'tray';

export type EcommerceChannelKind = 'marketplace' | 'hub';
export type EcommerceConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type EcommerceCredentialField = {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

export type EcommerceChannel = {
  id: EcommerceChannelId;
  kind: EcommerceChannelKind;
  name: string;
  blurb: string;
  status: EcommerceConnectionStatus;
  storeName: string;
  lastSyncAt: string;
  message: string;
  openOrders: number;
  activeListings: number;
  /** Credenciais específicas do canal (nunca logar secrets no UI de auditoria). */
  credentials: Record<string, string>;
};

export type EcommerceListing = {
  id: string;
  channelId: EcommerceChannelId;
  stockId: string;
  externalId: string;
  title: string;
  sku: string;
  price: number;
  qty: number;
  images: string[];
  status: 'active' | 'paused' | 'error' | 'draft';
  syncedAt: string;
  message: string;
};

export type EcommerceOrder = {
  id: string;
  channelId: EcommerceChannelId;
  externalId: string;
  customerName: string;
  amount: number;
  status: 'new' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: string;
  stockId?: string;
  listingId?: string;
  qty?: number;
};

type State = {
  channels: EcommerceChannel[];
  orders: EcommerceOrder[];
  listings: EcommerceListing[];
};

export const CHANNEL_LABEL: Record<EcommerceChannelId, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  ifood: 'iFood',
  amazon: 'Amazon',
  tray: 'Tray',
};

export const ORDER_STATUS_LABEL: Record<EcommerceOrder['status'], string> = {
  new: 'Novo',
  paid: 'Pago',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

/** Campos oficiais / típicos para conectar cada plataforma. */
export const CHANNEL_CREDENTIAL_FIELDS: Record<EcommerceChannelId, EcommerceCredentialField[]> = {
  mercadolivre: [
    { key: 'appId', label: 'App ID (Client ID)', required: true, placeholder: 'APP_ID do Developers ML' },
    { key: 'clientSecret', label: 'Client Secret', required: true, secret: true },
    {
      key: 'redirectUri',
      label: 'Redirect URI',
      required: true,
      placeholder: 'https://sua-api/oauth/mercadolivre/callback',
      hint: 'Deve bater com o app no developers.mercadolibre.com',
    },
    { key: 'accessToken', label: 'Access Token', secret: true, hint: 'Preenchido após OAuth (ou colado manualmente no MVP)' },
    { key: 'refreshToken', label: 'Refresh Token', secret: true },
    { key: 'userId', label: 'User / Seller ID', placeholder: 'ID do vendedor ML' },
    { key: 'storeName', label: 'Nome da loja', required: true },
  ],
  shopee: [
    { key: 'partnerId', label: 'Partner ID', required: true },
    { key: 'partnerKey', label: 'Partner Key', required: true, secret: true },
    { key: 'shopId', label: 'Shop ID', required: true },
    { key: 'accessToken', label: 'Access Token', secret: true },
    { key: 'refreshToken', label: 'Refresh Token', secret: true },
    { key: 'storeName', label: 'Nome da loja', required: true },
  ],
  ifood: [
    { key: 'clientId', label: 'Client ID', required: true },
    { key: 'clientSecret', label: 'Client Secret', required: true, secret: true },
    { key: 'merchantId', label: 'Merchant ID', required: true },
    { key: 'accessToken', label: 'Access Token', secret: true, hint: 'Token Merchant API' },
    { key: 'catalogId', label: 'Catalog ID', placeholder: 'Opcional' },
    { key: 'storeName', label: 'Nome da loja / merchant', required: true },
  ],
  amazon: [
    { key: 'lwaClientId', label: 'LWA Client ID', required: true },
    { key: 'lwaClientSecret', label: 'LWA Client Secret', required: true, secret: true },
    { key: 'refreshToken', label: 'Refresh Token (LWA)', required: true, secret: true },
    { key: 'sellerId', label: 'Seller ID', required: true },
    {
      key: 'marketplaceId',
      label: 'Marketplace ID',
      required: true,
      placeholder: 'A2Q3Y263D00KWC (Amazon.br)',
      hint: 'Brasil costuma usar A2Q3Y263D00KWC',
    },
    { key: 'awsAccessKeyId', label: 'AWS Access Key ID', secret: true, hint: 'Se usar IAM user na SP-API' },
    { key: 'awsSecretAccessKey', label: 'AWS Secret Access Key', secret: true },
    { key: 'roleArn', label: 'IAM Role ARN', placeholder: 'arn:aws:iam::…:role/…' },
    { key: 'storeName', label: 'Nome da conta / seller', required: true },
  ],
  tray: [
    {
      key: 'apiHost',
      label: 'URL da loja / API Host',
      required: true,
      placeholder: 'https://sualoja.commercesuite.com.br',
    },
    { key: 'consumerKey', label: 'Consumer Key', required: true },
    { key: 'consumerSecret', label: 'Consumer Secret', required: true, secret: true },
    { key: 'code', label: 'Code (autorização)', secret: true, hint: 'Código gerado na Tray ao autorizar o app' },
    { key: 'accessToken', label: 'Access Token', secret: true },
    { key: 'refreshToken', label: 'Refresh Token', secret: true },
    { key: 'storeName', label: 'Nome da loja Tray', required: true },
  ],
};

export const CHANNEL_CONNECT_GUIDE: Record<EcommerceChannelId, string> = {
  mercadolivre:
    'Crie o app em developers.mercadolibre.com → App ID + Secret → Redirect URI → OAuth (access + refresh). Anúncios usam /items com fotos públicas.',
  shopee:
    'Shopee Open Platform → Partner ID/Key → autorizar Shop ID → tokens. Catálogo exige imagens HTTPS.',
  ifood:
    'Portal do Desenvolvedor iFood → Client ID/Secret → Merchant ID → token Merchant API. Cardápio/fotos no catálogo.',
  amazon:
    'Seller Central + SP-API: LWA (Client ID/Secret + Refresh Token), Seller ID, Marketplace ID BR e credenciais AWS/IAM.',
  tray:
    'Painel Tray → Aplicativos → Consumer Key/Secret + URL da loja → autorizar (code) → Access Token. Hub sincroniza estoque e fotos.',
};

function emptyCredentials(id: EcommerceChannelId): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of CHANNEL_CREDENTIAL_FIELDS[id]) out[field.key] = '';
  if (id === 'amazon') out.marketplaceId = 'A2Q3Y263D00KWC';
  return out;
}

const SEED_CHANNELS: EcommerceChannel[] = [
  {
    id: 'mercadolivre',
    kind: 'marketplace',
    name: 'Mercado Livre',
    blurb: 'Anúncios, perguntas e pedidos via API oficial ML.',
    status: 'disconnected',
    storeName: '',
    lastSyncAt: '',
    message: 'Preencha App ID, Secret e tokens OAuth.',
    openOrders: 0,
    activeListings: 0,
    credentials: emptyCredentials('mercadolivre'),
  },
  {
    id: 'shopee',
    kind: 'marketplace',
    name: 'Shopee',
    blurb: 'Pedidos e catálogo Shopee Open Platform.',
    status: 'disconnected',
    storeName: '',
    lastSyncAt: '',
    message: 'Informe Partner ID, Partner Key e Shop ID.',
    openOrders: 0,
    activeListings: 0,
    credentials: emptyCredentials('shopee'),
  },
  {
    id: 'ifood',
    kind: 'marketplace',
    name: 'iFood',
    blurb: 'Pedidos de delivery / marketplace iFood Merchant.',
    status: 'disconnected',
    storeName: '',
    lastSyncAt: '',
    message: 'Client ID, Secret e Merchant ID obrigatórios.',
    openOrders: 0,
    activeListings: 0,
    credentials: emptyCredentials('ifood'),
  },
  {
    id: 'amazon',
    kind: 'marketplace',
    name: 'Amazon',
    blurb: 'SP-API — pedidos e inventário Amazon.br.',
    status: 'disconnected',
    storeName: '',
    lastSyncAt: '',
    message: 'Configure LWA + Seller ID + Marketplace ID.',
    openOrders: 0,
    activeListings: 0,
    credentials: emptyCredentials('amazon'),
  },
  {
    id: 'tray',
    kind: 'hub',
    name: 'Tray',
    blurb: 'Hub Tray Commerce — sincroniza loja e marketplaces.',
    status: 'disconnected',
    storeName: '',
    lastSyncAt: '',
    message: 'URL da loja + Consumer Key/Secret.',
    openOrders: 0,
    activeListings: 0,
    credentials: emptyCredentials('tray'),
  },
];

const SEED_ORDERS: EcommerceOrder[] = [
  {
    id: 'ECO-1001',
    channelId: 'mercadolivre',
    externalId: 'ML-2000456789',
    customerName: 'Ana Souza',
    amount: 1299.9,
    status: 'paid',
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    qty: 1,
  },
  {
    id: 'ECO-1002',
    channelId: 'shopee',
    externalId: 'SP-998877',
    customerName: 'Carlos Lima',
    amount: 189.5,
    status: 'new',
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
    qty: 1,
  },
  {
    id: 'ECO-1003',
    channelId: 'ifood',
    externalId: 'IF-445566',
    customerName: 'Fernanda Dias',
    amount: 74.9,
    status: 'shipped',
    createdAt: new Date(Date.now() - 10_800_000).toISOString(),
    qty: 1,
  },
];

function seed(): State {
  return {
    channels: SEED_CHANNELS.map((item) => ({
      ...item,
      credentials: { ...item.credentials },
    })),
    orders: [...SEED_ORDERS],
    listings: [],
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // migrate from v1 if present
    if (!raw) {
      const legacy = localStorage.getItem('marthi.ecommerce.channels.v1');
      if (legacy) {
        const parsed = JSON.parse(legacy) as Partial<State>;
        const next = mergeChannels(parsed.channels);
        const state: State = {
          channels: next,
          orders: Array.isArray(parsed.orders) ? parsed.orders : SEED_ORDERS,
          listings: [],
        };
        save(state);
        return state;
      }
      const initial = seed();
      save(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      channels: mergeChannels(parsed.channels),
      orders: Array.isArray(parsed.orders) && parsed.orders.length ? parsed.orders : SEED_ORDERS,
      listings: Array.isArray(parsed.listings) ? parsed.listings : [],
    };
  } catch {
    return seed();
  }
}

function mergeChannels(raw: EcommerceChannel[] | undefined): EcommerceChannel[] {
  const byId = new Map((Array.isArray(raw) ? raw : []).map((item) => [item.id, item]));
  return SEED_CHANNELS.map((seedItem) => {
    const prev = byId.get(seedItem.id);
    return {
      ...seedItem,
      ...prev,
      id: seedItem.id,
      kind: seedItem.kind,
      name: seedItem.name,
      blurb: seedItem.blurb,
      credentials: {
        ...emptyCredentials(seedItem.id),
        ...(prev?.credentials ?? {}),
      },
    };
  });
}

function save(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-ecommerce-updated'));
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function refreshChannelCounts(state: State, channelId: EcommerceChannelId) {
  const index = state.channels.findIndex((item) => item.id === channelId);
  if (index < 0) return;
  state.channels[index] = {
    ...state.channels[index],
    activeListings: state.listings.filter(
      (item) => item.channelId === channelId && item.status === 'active',
    ).length,
    openOrders: state.orders.filter(
      (item) =>
        item.channelId === channelId && (item.status === 'new' || item.status === 'paid'),
    ).length,
  };
}

export function listEcommerceChannels() {
  return load().channels;
}

export function getEcommerceChannel(id: EcommerceChannelId) {
  return load().channels.find((item) => item.id === id) ?? null;
}

export function listEcommerceOrders(channelId?: EcommerceChannelId) {
  const orders = load().orders;
  return channelId ? orders.filter((item) => item.channelId === channelId) : orders;
}

export function listEcommerceListings(channelId?: EcommerceChannelId) {
  const listings = load().listings;
  return channelId ? listings.filter((item) => item.channelId === channelId) : listings;
}

export function ecommerceSnapshot() {
  const channels = listEcommerceChannels();
  const orders = listEcommerceOrders();
  const listings = listEcommerceListings();
  return {
    connected: channels.filter((item) => item.status === 'connected').length,
    total: channels.length,
    openOrders: orders.filter((item) => item.status === 'new' || item.status === 'paid').length,
    activeListings: listings.filter((item) => item.status === 'active').length,
    marketplaces: channels.filter((item) => item.kind === 'marketplace'),
    hubs: channels.filter((item) => item.kind === 'hub'),
  };
}

export function saveChannelCredentials(
  id: EcommerceChannelId,
  credentials: Record<string, string>,
): { ok: true; channel: EcommerceChannel } | { ok: false; error: string } {
  const state = load();
  const index = state.channels.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'Canal inválido.' };
  const cleaned: Record<string, string> = { ...emptyCredentials(id) };
  for (const field of CHANNEL_CREDENTIAL_FIELDS[id]) {
    cleaned[field.key] = String(credentials[field.key] ?? '').trim();
  }
  state.channels[index] = {
    ...state.channels[index],
    credentials: cleaned,
    storeName: cleaned.storeName || state.channels[index].storeName,
    message: 'Credenciais salvas. Clique em Conectar para validar.',
  };
  save(state);
  return { ok: true, channel: state.channels[index] };
}

function missingRequired(id: EcommerceChannelId, credentials: Record<string, string>) {
  return CHANNEL_CREDENTIAL_FIELDS[id]
    .filter((field) => field.required)
    .filter((field) => !String(credentials[field.key] ?? '').trim())
    .map((field) => field.label);
}

/** Valida campos obrigatórios e marca o canal como conectado (MVP local). */
export function connectEcommerceChannel(
  id: EcommerceChannelId,
  credentials?: Record<string, string>,
): { ok: true; channel: EcommerceChannel } | { ok: false; error: string } {
  const state = load();
  const index = state.channels.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false, error: 'Canal inválido.' };

  const nextCreds = {
    ...state.channels[index].credentials,
    ...(credentials ?? {}),
  };
  const missing = missingRequired(id, nextCreds);
  if (missing.length) {
    return { ok: false, error: `Preencha: ${missing.join(', ')}.` };
  }

  // Tokens: no MVP aceita sem accessToken se App/Partner keys existirem (fluxo “salvar app, OAuth depois”).
  const channel: EcommerceChannel = {
    ...state.channels[index],
    credentials: nextCreds,
    storeName: nextCreds.storeName,
    status: 'connected',
    lastSyncAt: new Date().toISOString(),
    message: `Conectado a ${CHANNEL_LABEL[id]} (MVP). Tokens reais serão renovados no Nest.`,
  };
  state.channels[index] = channel;
  refreshChannelCounts(state, id);
  save(state);
  return { ok: true, channel };
}

export function disconnectEcommerceChannel(id: EcommerceChannelId) {
  const state = load();
  const index = state.channels.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false as const, error: 'Canal inválido.' };
  state.channels[index] = {
    ...state.channels[index],
    status: 'disconnected',
    lastSyncAt: '',
    message: `Desconectado. Credenciais mantidas para reconectar ${CHANNEL_LABEL[id]}.`,
    openOrders: 0,
    activeListings: state.listings.filter(
      (item) => item.channelId === id && item.status === 'active',
    ).length,
  };
  save(state);
  return { ok: true as const, channel: state.channels[index] };
}

function stockById(stockId: string): StockItem | null {
  return getAdminState().stock.find((item) => item.id === stockId) ?? null;
}

function patchStock(stockId: string, patch: Partial<Pick<StockItem, 'qty' | 'price' | 'images'>>) {
  const state = getAdminState();
  const next = state.stock.map((item) =>
    item.id === stockId
      ? {
          ...item,
          qty: patch.qty ?? item.qty,
          price: patch.price ?? item.price,
          images: patch.images ?? item.images,
        }
      : item,
  );
  saveStock(next);
}

/** Publica / atualiza anúncio a partir do item de estoque (exige imagem). */
export function publishStockToChannel(
  channelId: EcommerceChannelId,
  stockId: string,
): { ok: true; listing: EcommerceListing } | { ok: false; error: string } {
  const channel = getEcommerceChannel(channelId);
  if (!channel || channel.status !== 'connected') {
    return { ok: false, error: 'Conecte o canal antes de publicar.' };
  }
  const stock = stockById(stockId);
  if (!stock) return { ok: false, error: 'Produto não encontrado no estoque.' };
  const images = stockItemImages(stock);
  if (!images.length) {
    return {
      ok: false,
      error: 'Inclua ao menos 1 imagem no cadastro do produto (Estoque) para publicar nas plataformas.',
    };
  }
  if (stock.qty < 0) return { ok: false, error: 'Quantidade inválida no estoque.' };

  const state = load();
  const existing = state.listings.find(
    (item) => item.channelId === channelId && item.stockId === stockId,
  );
  const now = new Date().toISOString();
  const listing: EcommerceListing = {
    id: existing?.id ?? uid('LST'),
    channelId,
    stockId,
    externalId: existing?.externalId ?? `${channelId.toUpperCase()}-${stock.sku || stock.id}`,
    title: stock.name,
    sku: stock.sku || stock.id,
    price: stock.price,
    qty: stock.qty,
    images: [...images],
    status: 'active',
    syncedAt: now,
    message: `Publicado a partir do estoque · ${images.length} imagem(ns)`,
  };

  if (existing) {
    const idx = state.listings.findIndex((item) => item.id === existing.id);
    state.listings[idx] = listing;
  } else {
    state.listings.unshift(listing);
  }
  refreshChannelCounts(state, channelId);
  const cIdx = state.channels.findIndex((item) => item.id === channelId);
  if (cIdx >= 0) {
    state.channels[cIdx] = {
      ...state.channels[cIdx],
      lastSyncAt: now,
      message: `Anúncio ${listing.externalId} sincronizado com o estoque.`,
    };
  }
  save(state);
  return { ok: true, listing };
}

export function pauseListing(listingId: string) {
  const state = load();
  const idx = state.listings.findIndex((item) => item.id === listingId);
  if (idx < 0) return { ok: false as const, error: 'Anúncio não encontrado.' };
  state.listings[idx] = {
    ...state.listings[idx],
    status: 'paused',
    message: 'Anúncio pausado.',
    syncedAt: new Date().toISOString(),
  };
  refreshChannelCounts(state, state.listings[idx].channelId);
  save(state);
  return { ok: true as const, listing: state.listings[idx] };
}

export function removeListing(listingId: string) {
  const state = load();
  const listing = state.listings.find((item) => item.id === listingId);
  if (!listing) return { ok: false as const, error: 'Anúncio não encontrado.' };
  state.listings = state.listings.filter((item) => item.id !== listingId);
  refreshChannelCounts(state, listing.channelId);
  save(state);
  return { ok: true as const };
}

/**
 * Sync canal ↔ estoque:
 * - Anúncios ativos recebem qty, preço e imagens do estoque.
 * - Pedidos pagos vinculados baixam estoque uma vez (ref no message).
 */
export function syncEcommerceChannel(id: EcommerceChannelId) {
  const state = load();
  const index = state.channels.findIndex((item) => item.id === id);
  if (index < 0) return { ok: false as const, error: 'Canal inválido.' };
  if (state.channels[index].status !== 'connected') {
    return { ok: false as const, error: 'Conecte o canal antes de sincronizar.' };
  }

  const now = new Date().toISOString();
  let updated = 0;
  let skippedNoImage = 0;

  state.listings = state.listings.map((listing) => {
    if (listing.channelId !== id || listing.status === 'paused') return listing;
    const stock = stockById(listing.stockId);
    if (!stock) {
      return {
        ...listing,
        status: 'error' as const,
        message: 'Produto removido do estoque.',
        syncedAt: now,
      };
    }
    const images = stockItemImages(stock);
    if (!images.length) {
      skippedNoImage += 1;
      return {
        ...listing,
        status: 'error' as const,
        message: 'Sem imagem no estoque — plataformas exigem foto.',
        syncedAt: now,
      };
    }
    updated += 1;
    return {
      ...listing,
      title: stock.name,
      sku: stock.sku || stock.id,
      price: stock.price,
      qty: stock.qty,
      images: [...images],
      status: 'active' as const,
      syncedAt: now,
      message: 'Sincronizado com estoque (qty · preço · imagens).',
    };
  });

  // Baixa estoque de pedidos pagos ainda não aplicados
  for (const order of state.orders) {
    if (order.channelId !== id || order.status !== 'paid' || !order.stockId) continue;
    if (order.externalId.includes('|stocked')) continue;
    const qty = order.qty ?? 1;
    const stock = stockById(order.stockId);
    if (!stock) continue;
    patchStock(order.stockId, { qty: Math.max(0, stock.qty - qty) });
    order.externalId = `${order.externalId}|stocked`;
    // mirror listing qty
    const listing = state.listings.find((item) => item.stockId === order.stockId && item.channelId === id);
    if (listing) {
      const fresh = stockById(order.stockId);
      if (fresh) listing.qty = fresh.qty;
    }
  }

  refreshChannelCounts(state, id);
  state.channels[index] = {
    ...state.channels[index],
    lastSyncAt: now,
    message: `Sync estoque: ${updated} anúncio(s)${
      skippedNoImage ? ` · ${skippedNoImage} sem imagem` : ''
    }.`,
  };
  save(state);
  return { ok: true as const, channel: state.channels[index], updated, skippedNoImage };
}

/** Empurra alteração do estoque para todos os anúncios ativos daquele produto. */
export function syncStockItemToChannels(stockId: string) {
  const stock = stockById(stockId);
  if (!stock) return { ok: false as const, error: 'Produto não encontrado.' };
  const images = stockItemImages(stock);
  const state = load();
  const now = new Date().toISOString();
  let count = 0;
  state.listings = state.listings.map((listing) => {
    if (listing.stockId !== stockId || listing.status === 'paused') return listing;
    const channel = state.channels.find((item) => item.id === listing.channelId);
    if (!channel || channel.status !== 'connected') return listing;
    if (!images.length) {
      return {
        ...listing,
        status: 'error' as const,
        message: 'Estoque sem imagem — anúncio bloqueado nas plataformas.',
        syncedAt: now,
      };
    }
    count += 1;
    return {
      ...listing,
      title: stock.name,
      sku: stock.sku || stock.id,
      price: stock.price,
      qty: stock.qty,
      images: [...images],
      status: 'active' as const,
      syncedAt: now,
      message: 'Atualizado automaticamente a partir do estoque.',
    };
  });
  for (const channel of state.channels) {
    refreshChannelCounts(state, channel.id);
  }
  save(state);
  return { ok: true as const, updated: count };
}

/** Hook leve: após salvar estoque no painel, chamar isto. */
export function onStockChanged(stockId?: string) {
  if (stockId) return syncStockItemToChannels(stockId);
  const state = getAdminState();
  let total = 0;
  for (const item of state.stock) {
    const result = syncStockItemToChannels(item.id);
    if (result.ok) total += result.updated;
  }
  return { ok: true as const, updated: total };
}
