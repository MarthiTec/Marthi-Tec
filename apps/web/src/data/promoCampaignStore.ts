/**
 * Motor de Campanhas de Desconto e Promoções Comerciais (ERP → PDV & Orçamentos).
 *
 * Suporta regras inteligentes:
 * SE:
 *   - Produto(s) específico(s)
 *   - Fornecedor específico
 *   - Categoria / Atributo
 *   - Quantidade mínima / faixas progressivas
 *   - Grupo de clientes
 *   - Período de vigência (data início e fim)
 * ENTÃO:
 *   - Percentual de desconto (%)
 *   - Valor fixo de desconto (R$)
 *   - Preço promocional fixo (R$)
 *   - Faixas de preço (N por R$ X)
 *   - Leve X Pague Y
 *   - Brinde por volume
 *
 * Inclui:
 * - Controle de prioridade entre campanhas concorrentes
 * - Bloqueio de acúmulo indevido de descontos
 * - Transparência para o operador e auditoria
 */

export const PROMO_EVENT = 'marthi-promo-campaigns';
const STORAGE_KEY = 'marthi.promo.campaigns.v1';

export type PromoKind =
  | 'tier'
  | 'gift'
  | 'percent'
  | 'fixed'
  | 'promo_price'
  | 'buy_x_pay_y';

export const PROMO_KIND_LABEL: Record<PromoKind, string> = {
  percent: 'Percentual de Desconto (% OFF)',
  fixed: 'Desconto em Valor Fixo (R$ OFF)',
  promo_price: 'Preço Promocional Fixo (R$)',
  tier: 'Faixas por Quantidade (N é R$ X)',
  buy_x_pay_y: 'Leve X Pague Y',
  gift: 'Brinde por Volume',
};

/** Faixa: ex. 1 un. = R$ 4,00 · 3 un. = R$ 10,00 */
export type PromoTier = {
  qty: number;
  totalPrice: number;
};

export type PromoRuleCriteria = {
  /** Se vazio, aplica a qualquer fornecedor */
  supplierId?: string;
  /** Nome ou ID da categoria / departamento */
  category?: string;
  /** Marca / Fabricante */
  brand?: string;
  /** Produtos específicos participantes (se vazio e fornecedor/categoria definido, aplica a todos do filtro) */
  stockIds: string[];
  /** Quantidade mínima na linha para disparar o benefício */
  minQty?: number;
  /** Valor mínimo de compra */
  minAmount?: number;
  /** Grupo de clientes (ex: 'Construtor', 'Revendedor', 'Padrão') */
  customerGroup?: string;
};

export type PromoCampaign = {
  id: string;
  name: string;
  active: boolean;
  kind: PromoKind;

  /** Regras condicionais */
  criteria: PromoRuleCriteria;

  /** Benefício quando kind = 'percent' (ex: 10 para 10%) */
  discountPercent?: number;

  /** Benefício quando kind = 'fixed' (ex: 5.00 para R$ 5,00 OFF por unidade ou linha) */
  discountAmount?: number;

  /** Benefício quando kind = 'promo_price' (ex: R$ 29,90) */
  promoPrice?: number;

  /** Benefício quando kind = 'tier' */
  tiers: PromoTier[];

  /** Benefício quando kind = 'buy_x_pay_y' */
  buyQty?: number;
  payQty?: number;

  /** Benefício quando kind = 'gift' */
  giftStockId: string;
  giftMinQty: number;

  /** Vigência */
  startDate?: string; // YYYY-MM-DD ou ISO
  endDate?: string; // YYYY-MM-DD ou ISO

  /** Prioridade (maior número tem precedência em caso de conflito) */
  priority: number;

  /** Se permite acumular com outras campanhas */
  accumulative: boolean;

  /** Compatibilidade com estrutura legado */
  stockIds: string[];

  note: string;
  createdAt: string;
};

type Store = { campaigns: PromoCampaign[] };

let memory: Store | null = null;

function uid(prefix = 'PROMO') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function seed(): Store {
  const today = new Date();
  const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  return {
    campaigns: [
      {
        id: 'PROMO-CIMENTO-VOL',
        name: 'Campanha Cimento 50+ un. - R$ 34,50',
        active: true,
        kind: 'promo_price',
        promoPrice: 34.5,
        criteria: {
          category: 'Cimento',
          stockIds: [],
          minQty: 50,
        },
        stockIds: [],
        tiers: [],
        giftStockId: '',
        giftMinQty: 0,
        priority: 10,
        accumulative: false,
        startDate: today.toISOString().slice(0, 10),
        endDate: nextMonth.toISOString().slice(0, 10),
        note: 'Preço especial de R$ 34,50 para pedidos a partir de 50 sacos de cimento.',
        createdAt: today.toISOString(),
      },
      {
        id: 'PROMO-TINTAS-10',
        name: 'Semana das Tintas - 10% OFF',
        active: true,
        kind: 'percent',
        discountPercent: 10,
        criteria: {
          category: 'Tintas',
          stockIds: [],
          minQty: 1,
        },
        stockIds: [],
        tiers: [],
        giftStockId: '',
        giftMinQty: 0,
        priority: 5,
        accumulative: false,
        startDate: today.toISOString().slice(0, 10),
        endDate: nextMonth.toISOString().slice(0, 10),
        note: '10% de desconto em todas as tintas.',
        createdAt: today.toISOString(),
      },
      {
        id: 'PROMO-DEMO-TIER',
        name: 'Leve 3 pague R$ 10 (Faixas)',
        active: true,
        kind: 'tier',
        criteria: {
          stockIds: [],
          minQty: 1,
        },
        stockIds: [],
        tiers: [
          { qty: 1, totalPrice: 4 },
          { qty: 3, totalPrice: 10 },
        ],
        giftStockId: '',
        giftMinQty: 10,
        priority: 1,
        accumulative: false,
        note: 'Exemplo: 1 é 4 · 3 é 10. Vincule produtos na Retaguarda.',
        createdAt: today.toISOString(),
      },
    ],
  };
}

function normalize(item: any): PromoCampaign {
  const stockIds = Array.isArray(item.stockIds) ? item.stockIds.map(String) : [];
  const criteriaStockIds = Array.isArray(item.criteria?.stockIds)
    ? item.criteria.stockIds.map(String)
    : stockIds;

  const kind: PromoKind =
    item.kind === 'percent' ||
    item.kind === 'fixed' ||
    item.kind === 'promo_price' ||
    item.kind === 'buy_x_pay_y' ||
    item.kind === 'gift'
      ? item.kind
      : 'tier';

  return {
    id: String(item.id || uid()),
    name: String(item.name ?? '').trim() || 'Campanha Comercial',
    active: item.active !== false,
    kind,
    criteria: {
      supplierId: item.criteria?.supplierId ? String(item.criteria.supplierId).trim() : undefined,
      category: item.criteria?.category ? String(item.criteria.category).trim() : undefined,
      brand: item.criteria?.brand ? String(item.criteria.brand).trim() : undefined,
      stockIds: criteriaStockIds,
      minQty: item.criteria?.minQty ? Math.max(1, Number(item.criteria.minQty)) : undefined,
      minAmount: item.criteria?.minAmount ? Math.max(0, Number(item.criteria.minAmount)) : undefined,
      customerGroup: item.criteria?.customerGroup ? String(item.criteria.customerGroup).trim() : undefined,
    },
    discountPercent: typeof item.discountPercent === 'number' ? Math.max(0, item.discountPercent) : undefined,
    discountAmount: typeof item.discountAmount === 'number' ? Math.max(0, item.discountAmount) : undefined,
    promoPrice: typeof item.promoPrice === 'number' ? Math.max(0, item.promoPrice) : undefined,
    tiers: Array.isArray(item.tiers)
      ? item.tiers
          .map((tier: any) => ({
            qty: Math.max(1, Math.round(Number(tier.qty) || 1)),
            totalPrice: Math.max(0, Math.round((Number(tier.totalPrice) || 0) * 100) / 100),
          }))
          .sort((a: any, b: any) => a.qty - b.qty)
      : [],
    buyQty: item.buyQty ? Math.max(1, Number(item.buyQty)) : undefined,
    payQty: item.payQty ? Math.max(1, Number(item.payQty)) : undefined,
    giftStockId: item.giftStockId ? String(item.giftStockId).trim() : '',
    giftMinQty: Math.max(1, Math.round(Number(item.giftMinQty) || 1)),
    startDate: item.startDate || undefined,
    endDate: item.endDate || undefined,
    priority: typeof item.priority === 'number' ? item.priority : 1,
    accumulative: Boolean(item.accumulative),
    stockIds: criteriaStockIds,
    note: item.note ?? '',
    createdAt: item.createdAt || new Date().toISOString(),
  };
}

function load(): Store {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      memory = {
        campaigns: Array.isArray(parsed.campaigns)
          ? parsed.campaigns.map(normalize)
          : seed().campaigns,
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PROMO_EVENT));
  }
}

export function listPromoCampaigns(activeOnly = false): PromoCampaign[] {
  const list = load().campaigns.map(normalize);
  if (!activeOnly) return list;

  const todayStr = new Date().toISOString().slice(0, 10);
  return list.filter((item) => {
    if (!item.active) return false;
    if (item.startDate && item.startDate > todayStr) return false;
    if (item.endDate && item.endDate < todayStr) return false;
    return true;
  });
}

export function getPromoCampaign(id: string): PromoCampaign | null {
  return listPromoCampaigns().find((item) => item.id === id) ?? null;
}

export function upsertPromoCampaign(
  input: Omit<PromoCampaign, 'id' | 'createdAt'> & { id?: string },
): PromoCampaign {
  const state = load();
  const saved = normalize({
    ...input,
    id: input.id || uid('PROMO'),
    createdAt: input.id
      ? state.campaigns.find((row) => row.id === input.id)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
  });
  const idx = state.campaigns.findIndex((row) => row.id === saved.id);
  if (idx >= 0) state.campaigns[idx] = saved;
  else state.campaigns.unshift(saved);
  save({ ...state, campaigns: [...state.campaigns] });
  return saved;
}

export function removePromoCampaign(id: string): void {
  const state = load();
  state.campaigns = state.campaigns.filter((row) => row.id !== id);
  save({ ...state });
}

/** Campanhas ativas que incluem o produto (compatibilidade legado). */
export function findCampaignsForStock(stockId: string): PromoCampaign[] {
  return listPromoCampaigns(true).filter((item) =>
    item.stockIds.includes(stockId) || item.criteria.stockIds.includes(stockId),
  );
}

/**
 * Calcula total da linha com faixas “N é R$ X”.
 * Empacota pela maior faixa possível; resto pela menor (ou preço base).
 */
export function applyTierTotal(qty: number, baseUnitPrice: number, tiers: PromoTier[]): number {
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

export type EvaluatedLinePromo = {
  appliedCampaign: PromoCampaign | null;
  unitPrice: number;
  lineBaseTotal: number;
  originalUnitPrice: number;
  discountAmount: number;
  promoLabel: string;
  explanation?: string;
  giftDescription?: string;
};

export type StockItemEvaluationInput = {
  id: string;
  name: string;
  sku?: string;
  supplierId?: string;
  category?: string;
  attrs?: Record<string, string>;
};

/**
 * Avalia de forma inteligente todas as campanhas ativas para uma linha do carrinho do PDV / Orçamento.
 * Respeita critérios (produto, fornecedor, categoria, quantidade mínima), vigência e prioridade.
 */
export function evaluateCampaignForLine(
  item: StockItemEvaluationInput,
  qty: number,
  baseUnitPrice: number,
  customerGroup?: string,
): EvaluatedLinePromo {
  const originalUnitPrice = baseUnitPrice;
  const standardTotal = Math.round(originalUnitPrice * qty * 100) / 100;

  if (qty <= 0 || baseUnitPrice <= 0) {
    return {
      appliedCampaign: null,
      unitPrice: baseUnitPrice,
      lineBaseTotal: standardTotal,
      originalUnitPrice,
      discountAmount: 0,
      promoLabel: '',
    };
  }

  const activeCampaigns = listPromoCampaigns(true);
  const eligibleCampaigns = activeCampaigns.filter((camp) => {
    const { criteria } = camp;

    // 1. Filtro de Grupo de Cliente
    if (criteria.customerGroup && customerGroup && criteria.customerGroup.toLowerCase() !== customerGroup.toLowerCase()) {
      return false;
    }

    // 2. Filtro de Quantidade Mínima
    if (criteria.minQty && qty < criteria.minQty) {
      return false;
    }

    // 3. Filtro de Produtos Específicos
    const hasSpecificProducts = criteria.stockIds && criteria.stockIds.length > 0;
    if (hasSpecificProducts) {
      if (!criteria.stockIds.includes(item.id)) return false;
    }

    // 4. Filtro de Fornecedor
    if (criteria.supplierId) {
      if (!item.supplierId || item.supplierId !== criteria.supplierId) {
        return false;
      }
    }

    // 5. Filtro de Categoria
    if (criteria.category) {
      const matchCat =
        (item.category && item.category.toLowerCase().includes(criteria.category.toLowerCase())) ||
        (item.name && item.name.toLowerCase().includes(criteria.category.toLowerCase())) ||
        Object.values(item.attrs || {}).some((val) =>
          String(val).toLowerCase().includes(criteria.category!.toLowerCase()),
        );
      if (!matchCat) return false;
    }

    // Se a campanha não tem produto, nem fornecedor, nem categoria específica,
    // e não é brinde/tier geral, só aplica se explicitamente genérica
    if (!hasSpecificProducts && !criteria.supplierId && !criteria.category && camp.kind !== 'gift') {
      // Permitir se tiver faixa ou for genérica
    }

    return true;
  });

  if (eligibleCampaigns.length === 0) {
    return {
      appliedCampaign: null,
      unitPrice: baseUnitPrice,
      lineBaseTotal: standardTotal,
      originalUnitPrice,
      discountAmount: 0,
      promoLabel: '',
    };
  }

  // Ordena por maior prioridade (descendente)
  eligibleCampaigns.sort((a, b) => (b.priority || 1) - (a.priority || 1));
  const bestCampaign = eligibleCampaigns[0];

  let calculatedLineTotal = standardTotal;
  let calculatedUnitPrice = originalUnitPrice;
  let explanation = '';
  let giftDescription = '';

  switch (bestCampaign.kind) {
    case 'percent': {
      const pct = bestCampaign.discountPercent || 0;
      calculatedUnitPrice = Math.round(originalUnitPrice * (1 - pct / 100) * 100) / 100;
      calculatedLineTotal = Math.round(calculatedUnitPrice * qty * 100) / 100;
      explanation = `${pct}% OFF · ${bestCampaign.name}`;
      break;
    }
    case 'fixed': {
      const discount = bestCampaign.discountAmount || 0;
      calculatedUnitPrice = Math.max(0, Math.round((originalUnitPrice - discount) * 100) / 100);
      calculatedLineTotal = Math.round(calculatedUnitPrice * qty * 100) / 100;
      explanation = `R$ ${discount.toFixed(2)} OFF por un. · ${bestCampaign.name}`;
      break;
    }
    case 'promo_price': {
      const price = bestCampaign.promoPrice || originalUnitPrice;
      calculatedUnitPrice = Math.round(price * 100) / 100;
      calculatedLineTotal = Math.round(calculatedUnitPrice * qty * 100) / 100;
      explanation = `Preço Promocional R$ ${calculatedUnitPrice.toFixed(2)} · ${bestCampaign.name}`;
      break;
    }
    case 'buy_x_pay_y': {
      const buy = bestCampaign.buyQty || 1;
      const pay = bestCampaign.payQty || 1;
      if (buy > pay && qty >= buy) {
        const sets = Math.floor(qty / buy);
        const remainder = qty % buy;
        calculatedLineTotal = Math.round((sets * pay * originalUnitPrice + remainder * originalUnitPrice) * 100) / 100;
        calculatedUnitPrice = Math.round((calculatedLineTotal / qty) * 100) / 100;
        explanation = `Leve ${buy} Pague ${pay} · ${bestCampaign.name}`;
      }
      break;
    }
    case 'tier': {
      if (bestCampaign.tiers && bestCampaign.tiers.length > 0) {
        calculatedLineTotal = applyTierTotal(qty, originalUnitPrice, bestCampaign.tiers);
        calculatedUnitPrice = qty > 0 ? Math.round((calculatedLineTotal / qty) * 100) / 100 : originalUnitPrice;
        explanation = `Faixa de Quantidade · ${bestCampaign.name}`;
      }
      break;
    }
    case 'gift': {
      if (bestCampaign.giftStockId && qty >= bestCampaign.giftMinQty) {
        giftDescription = `Brinde incluso por volume (a partir de ${bestCampaign.giftMinQty} un.)`;
        explanation = `Ganhe Brinde · ${bestCampaign.name}`;
      }
      break;
    }
  }

  const discountAmount = Math.max(0, Math.round((standardTotal - calculatedLineTotal) * 100) / 100);

  return {
    appliedCampaign: bestCampaign,
    unitPrice: calculatedUnitPrice,
    lineBaseTotal: calculatedLineTotal,
    originalUnitPrice,
    discountAmount,
    promoLabel: bestCampaign.name,
    explanation,
    giftDescription,
  };
}
