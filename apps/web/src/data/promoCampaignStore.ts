/** Campanhas de desconto / promoção (ERP → PDV). */

export const PROMO_EVENT = 'marthi-promo-campaigns';
const STORAGE_KEY = 'marthi.promo.campaigns.v1';

export type PromoKind = 'tier' | 'gift';

/** Faixa: ex. 1 un. = R$ 4,00 · 3 un. = R$ 10,00 */
export type PromoTier = {
  qty: number;
  totalPrice: number;
};

export type PromoCampaign = {
  id: string;
  name: string;
  active: boolean;
  kind: PromoKind;
  /** Produtos participantes. */
  stockIds: string[];
  /** Regras “N é R$ X” (kind=tier). */
  tiers: PromoTier[];
  /** Brinde (kind=gift). */
  giftStockId: string;
  giftMinQty: number;
  note: string;
  createdAt: string;
};

type Store = { campaigns: PromoCampaign[] };

let memory: Store | null = null;

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function seed(): Store {
  return {
    campaigns: [
      {
        id: 'PROMO-DEMO-TIER',
        name: 'Leve 3 pague R$ 10',
        active: true,
        kind: 'tier',
        stockIds: [],
        tiers: [
          { qty: 1, totalPrice: 4 },
          { qty: 3, totalPrice: 10 },
        ],
        giftStockId: '',
        giftMinQty: 10,
        note: 'Exemplo: 1 é 4 · 3 é 10. Vincule produtos no ERP.',
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

function load(): Store {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      memory = {
        campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns.map(normalize) : seed().campaigns,
      };
      return memory;
    }
  } catch {
    /* ignore */
  }
  memory = seed();
  return memory;
}

function save(next: Store) {
  memory = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(PROMO_EVENT));
}

function normalize(item: PromoCampaign): PromoCampaign {
  return {
    ...item,
    name: String(item.name ?? '').trim() || 'Campanha',
    active: item.active !== false,
    kind: item.kind === 'gift' ? 'gift' : 'tier',
    stockIds: Array.isArray(item.stockIds) ? item.stockIds.map(String) : [],
    tiers: Array.isArray(item.tiers)
      ? item.tiers
          .map((tier) => ({
            qty: Math.max(1, Math.round(Number(tier.qty) || 1)),
            totalPrice: Math.max(0, Math.round((Number(tier.totalPrice) || 0) * 100) / 100),
          }))
          .sort((a, b) => a.qty - b.qty)
      : [],
    giftStockId: item.giftStockId ?? '',
    giftMinQty: Math.max(1, Math.round(Number(item.giftMinQty) || 1)),
    note: item.note ?? '',
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

export function listPromoCampaigns(activeOnly = false) {
  const list = load().campaigns.map(normalize);
  return activeOnly ? list.filter((item) => item.active) : list;
}

export function getPromoCampaign(id: string) {
  return listPromoCampaigns().find((item) => item.id === id) ?? null;
}

export function upsertPromoCampaign(
  input: Omit<PromoCampaign, 'id' | 'createdAt'> & { id?: string },
) {
  const state = load();
  const saved = normalize({
    ...input,
    id: input.id || uid('PROMO'),
    createdAt: input.id
      ? state.campaigns.find((row) => row.id === input.id)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
  } as PromoCampaign);
  const idx = state.campaigns.findIndex((row) => row.id === saved.id);
  if (idx >= 0) state.campaigns[idx] = saved;
  else state.campaigns.unshift(saved);
  save({ ...state, campaigns: [...state.campaigns] });
  return saved;
}

export function removePromoCampaign(id: string) {
  const state = load();
  state.campaigns = state.campaigns.filter((row) => row.id !== id);
  save({ ...state });
}

/** Campanhas ativas que incluem o produto. */
export function findCampaignsForStock(stockId: string) {
  return listPromoCampaigns(true).filter((item) => item.stockIds.includes(stockId));
}

/**
 * Calcula total da linha com faixas “N é R$ X”.
 * Empacota pela maior faixa possível; resto pela menor (ou preço base).
 */
export function applyTierTotal(qty: number, baseUnitPrice: number, tiers: PromoTier[]) {
  if (qty <= 0) return 0;
  if (!tiers.length) return Math.round(baseUnitPrice * qty * 100) / 100;
  const sortedDesc = [...tiers].sort((a, b) => b.qty - a.qty);
  const one = [...tiers].sort((a, b) => a.qty - b.qty).find((tier) => tier.qty === 1);
  const remainderUnit = one ? one.totalPrice : baseUnitPrice;
  let remaining = qty;
  let total = 0;
  for (const tier of sortedDesc) {
    if (tier.qty <= 0) continue;
    const packs = Math.floor(remaining / tier.qty);
    if (packs <= 0) continue;
    total += packs * tier.totalPrice;
    remaining -= packs * tier.qty;
  }
  total += remaining * remainderUnit;
  return Math.round(total * 100) / 100;
}

export const PROMO_KIND_LABEL: Record<PromoKind, string> = {
  tier: 'Faixas (N é R$)',
  gift: 'Brinde por volume',
};
