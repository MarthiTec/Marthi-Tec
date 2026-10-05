import { nestGet, nestPost, nestDelete } from '../services/nestClient';
import { getActiveStoreId } from './multiStoreStore';
import {storeScopedKey} from './storeCache';
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
let memoryStoreId: string | null = null;

function uid(prefix = 'PROMO') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function seed(): Store {
  return {
    campaigns: [],
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

function sanitizeCampaigns(campaigns: PromoCampaign[]): PromoCampaign[] {
  return campaigns.map((camp) => {
    const hasTarget =
      (camp.criteria?.stockIds && camp.criteria.stockIds.length > 0) ||
      Boolean(camp.criteria?.category) ||
      Boolean(camp.criteria?.brand) ||
      Boolean(camp.criteria?.supplierId);

    if (camp.id === 'PROMO-DEMO-TIER' && camp.active) {
      return {
        ...camp,
        active: false,
        note: 'Campanha de demonstração (desativada por padrão).',
      };
    }

    // Proteção de segurança: se a campanha for de preço fixo, faixas de volume ou leve X pague Y sem NENHUM target:
    // Desativa para evitar que altere preços indevidamente de produtos não participantes.
    if ((camp.kind === 'tier' || camp.kind === 'promo_price' || camp.kind === 'buy_x_pay_y') && !hasTarget) {
      if (camp.active) {
        return {
          ...camp,
          active: false,
          note: camp.note
            ? `${camp.note} [Pausada por segurança: requer vincular produto ou categoria]`
            : 'Pausada por segurança: requer vincular produto ou categoria',
        };
      }
    }
    return camp;
  });
}

function load(): Store {
  const storeId = getActiveStoreId();
  if (memoryStoreId !== storeId) { memory = null; memoryStoreId = storeId; }
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(storeScopedKey(STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      const rawCampaigns = Array.isArray(parsed.campaigns) ? parsed.campaigns.map(normalize) : [];
      const loaded = rawCampaigns.filter(
        (c) => c.id && !c.id.startsWith('PROMO-DEMO') && !c.id.startsWith('PROMO-CIMENTO') && !c.id.startsWith('PROMO-TINTAS')
      );
      const sanitized = sanitizeCampaigns(loaded);
      memory = { campaigns: sanitized };
      if (JSON.stringify(sanitized) !== JSON.stringify(rawCampaigns)) {
        try {
          localStorage.setItem(storeScopedKey(STORAGE_KEY), JSON.stringify(memory));
        } catch {
          /* ignore */
        }
      }
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
    localStorage.setItem(storeScopedKey(STORAGE_KEY), JSON.stringify(next));
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

export async function upsertPromoCampaign(
  input: Omit<PromoCampaign, 'id' | 'createdAt'> & { id?: string },
): Promise<PromoCampaign> {
  const state = load();
  const saved = normalize({
    ...input,
    id: input.id || uid('PROMO'),
    createdAt: input.id
      ? state.campaigns.find((row) => row.id === input.id)?.createdAt || new Date().toISOString()
      : new Date().toISOString(),
  });
  const persisted = normalize(await nestPost<PromoCampaign>('/promotions', saved));
  const idx = state.campaigns.findIndex((row) => row.id === persisted.id);
  if (idx >= 0) state.campaigns[idx] = persisted;
  else state.campaigns.unshift(persisted);
  save({ ...state, campaigns: [...state.campaigns] });
  return persisted;
}

export async function removePromoCampaign(id: string): Promise<void> {
  await nestDelete('/promotions/' + encodeURIComponent(id));
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
 * Empacota pela maior faixa possível; resto pela menor faixa unitária (ou preço base).
 * Garante que o valor final NUNCA seja maior que o preço padrão da quantidade.
 */
/**
 * Calcula total da linha com faixas “N é R$ X”.
 * Empacota pela maior faixa possível; resto pela menor faixa unitária (ou preço base).
 * Garante com rigor absoluto que NENHUMA faixa seja aplicada se não proporcionar desconto
 * real frente ao preço unitário padrão do produto (totalPrice < qty * baseUnitPrice).
 */
export function applyTierTotal(qty: number, baseUnitPrice: number, tiers: PromoTier[]): number {
  if (qty <= 0 || baseUnitPrice <= 0) return 0;
  const standardTotal = Math.round(baseUnitPrice * qty * 100) / 100;
  if (!tiers || !tiers.length) return standardTotal;

  // Filtro de segurança: somente faixas que oferecem desconto real em relação ao preço unitário base
  const beneficialTiers = tiers
    .filter(
      (t) =>
        t.qty > 0 &&
        t.totalPrice > 0 &&
        t.totalPrice < Math.round(t.qty * baseUnitPrice * 100) / 100,
    )
    .sort((a, b) => b.qty - a.qty);

  if (!beneficialTiers.length) return standardTotal;

  // Se a quantidade solicitada for menor que a menor faixa vantajosa, não há promoção aplicável
  const minTierQty = beneficialTiers[beneficialTiers.length - 1].qty;
  if (qty < minTierQty) return standardTotal;

  // Unidade avulsa do restante se tiver faixa unitária mais barata que o preço base
  const tierOne = beneficialTiers.find((tier) => tier.qty === 1);
  const remainderUnit = tierOne && tierOne.totalPrice < baseUnitPrice ? tierOne.totalPrice : baseUnitPrice;

  let remaining = qty;
  let total = 0;
  for (const tier of beneficialTiers) {
    if (tier.qty <= 1) continue;
    const packs = Math.floor(remaining / tier.qty);
    if (packs <= 0) continue;
    total += packs * tier.totalPrice;
    remaining -= packs * tier.qty;
  }
  total += remaining * remainderUnit;
  const calculatedTotal = Math.round(total * 100) / 100;

  // Regra de ouro comercial inegociável: promoção NUNCA encarece o produto
  return calculatedTotal < standardTotal ? calculatedTotal : standardTotal;
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
  brand?: string;
  attrs?: Record<string, string>;
};

/**
 * Avalia de forma inteligente todas as campanhas ativas para uma linha do carrinho do PDV / Orçamento.
 * Respeita critérios (produto, fornecedor, categoria, quantidade mínima), vigência e prioridade.
 * NUNCA aplica campanhas de faixas ou preços fixos em produtos que não atendam estritamente aos critérios.
 * Avalia todos os candidatos elegíveis e seleciona aquele que proporciona o maior benefício comercial.
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

    // 1. Filtro de Grupo de Cliente (se a campanha exige grupo específico, cliente precisa pertencer)
    if (criteria.customerGroup) {
      if (!customerGroup || criteria.customerGroup.toLowerCase() !== customerGroup.toLowerCase()) {
        return false;
      }
    }

    // 2. Proteção Crítica: Campanhas de Preço Fixo, Faixas ou Leve X Pague Y PRECISAM ter alvo específico!
    // Evita catástrofes como vender um item de R$ 709.000,00 por R$ 4,00 ou R$ 10,00.
    const hasSpecificTarget =
      (criteria.stockIds && criteria.stockIds.length > 0) ||
      Boolean(criteria.category) ||
      Boolean(criteria.brand) ||
      Boolean(criteria.supplierId);

    if (
      (camp.kind === 'tier' || camp.kind === 'promo_price' || camp.kind === 'buy_x_pay_y' || camp.kind === 'gift') &&
      !hasSpecificTarget
    ) {
      return false;
    }

    // 3. Filtro de Produtos Específicos
    if (criteria.stockIds && criteria.stockIds.length > 0) {
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
      const catNeedle = criteria.category.toLowerCase().trim();
      const matchCat =
        (item.category && item.category.toLowerCase().includes(catNeedle)) ||
        Object.values(item.attrs || {}).some((val) =>
          String(val).toLowerCase().includes(catNeedle),
        );
      if (!matchCat) return false;
    }

    // 6. Filtro de Marca
    if (criteria.brand) {
      const brandNeedle = criteria.brand.toLowerCase().trim();
      const matchBrand =
        (item.brand && item.brand.toLowerCase().includes(brandNeedle)) ||
        (item.attrs?.marca && item.attrs.marca.toLowerCase().includes(brandNeedle)) ||
        (item.attrs?.brand && item.attrs.brand.toLowerCase().includes(brandNeedle)) ||
        (item.name && item.name.toLowerCase().includes(brandNeedle));
      if (!matchBrand) return false;
    }

    // 7. Filtro de Quantidade Mínima geral
    if (criteria.minQty && qty < criteria.minQty) {
      return false;
    }

    // 8. Filtro de Valor Mínimo da Linha
    if (criteria.minAmount && standardTotal < criteria.minAmount) {
      return false;
    }

    // 9. Validações específicas por tipo de benefício
    if (camp.kind === 'buy_x_pay_y') {
      const buy = camp.buyQty || 2;
      const pay = camp.payQty || 1;
      if (buy <= pay || qty < buy) return false;
    }

    if (camp.kind === 'tier') {
      if (!camp.tiers || camp.tiers.length === 0) return false;
      // Requer que exista ao menos uma faixa que forneça preço menor por unidade
      const hasAnyBeneficialTier = camp.tiers.some(
        (t) => t.qty > 0 && t.totalPrice > 0 && t.totalPrice < Math.round(t.qty * originalUnitPrice * 100) / 100,
      );
      if (!hasAnyBeneficialTier) return false;
    }

    if (camp.kind === 'gift') {
      if (!camp.giftStockId || qty < (camp.giftMinQty || 1)) return false;
    }

    if (camp.kind === 'promo_price') {
      // Preço promocional deve ser estritamente menor que o preço unitário para fazer sentido
      if (typeof camp.promoPrice === 'number' && camp.promoPrice >= originalUnitPrice) {
        return false;
      }
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

  type CandidateEvaluation = {
    campaign: PromoCampaign;
    calculatedLineTotal: number;
    calculatedUnitPrice: number;
    discountAmount: number;
    explanation: string;
    giftDescription: string;
  };

  const candidates: CandidateEvaluation[] = [];

  for (const camp of eligibleCampaigns) {
    let lineTotal = standardTotal;
    let unitPrice = originalUnitPrice;
    let explanation = '';
    let giftDescription = '';

    switch (camp.kind) {
      case 'percent': {
        const pct = Math.min(100, Math.max(0, camp.discountPercent || 0));
        if (pct > 0) {
          unitPrice = Math.round(originalUnitPrice * (1 - pct / 100) * 100) / 100;
          lineTotal = Math.round(unitPrice * qty * 100) / 100;
          explanation = `${pct}% OFF · ${camp.name}`;
        }
        break;
      }
      case 'fixed': {
        const discount = Math.max(0, camp.discountAmount || 0);
        if (discount > 0) {
          unitPrice = Math.max(0, Math.round((originalUnitPrice - discount) * 100) / 100);
          lineTotal = Math.round(unitPrice * qty * 100) / 100;
          explanation = `R$ ${discount.toFixed(2).replace('.', ',')} OFF por un. · ${camp.name}`;
        }
        break;
      }
      case 'promo_price': {
        const price = camp.promoPrice;
        if (typeof price === 'number' && price > 0 && price < originalUnitPrice) {
          unitPrice = Math.round(price * 100) / 100;
          lineTotal = Math.round(unitPrice * qty * 100) / 100;
          explanation = `Preço Especial R$ ${unitPrice.toFixed(2).replace('.', ',')} · ${camp.name}`;
        }
        break;
      }
      case 'buy_x_pay_y': {
        const buy = camp.buyQty || 2;
        const pay = camp.payQty || 1;
        if (buy > pay && qty >= buy) {
          const sets = Math.floor(qty / buy);
          const remainder = qty % buy;
          lineTotal = Math.round((sets * pay * originalUnitPrice + remainder * originalUnitPrice) * 100) / 100;
          unitPrice = Math.round((lineTotal / qty) * 100) / 100;
          explanation = `Leve ${buy} Pague ${pay} · ${camp.name}`;
        }
        break;
      }
      case 'tier': {
        if (camp.tiers && camp.tiers.length > 0) {
          const tierTotal = applyTierTotal(qty, originalUnitPrice, camp.tiers);
          if (tierTotal < standardTotal) {
            lineTotal = tierTotal;
            unitPrice = qty > 0 ? Math.round((lineTotal / qty) * 100) / 100 : originalUnitPrice;
            explanation = `Faixas por Volume · ${camp.name}`;
          }
        }
        break;
      }
      case 'gift': {
        if (camp.giftStockId && qty >= (camp.giftMinQty || 1)) {
          giftDescription = `Brinde incluso por volume (a partir de ${camp.giftMinQty} un.)`;
          explanation = `Ganhe Brinde · ${camp.name}`;
        }
        break;
      }
    }

    const discountAmount = Math.max(0, Math.round((standardTotal - lineTotal) * 100) / 100);
    const hasEffectiveBenefit = discountAmount > 0 || Boolean(giftDescription);

    // CRÍTICO: Só aceita candidato se ele efetivamente gerar desconto real e NÃO aumentar o preço
    if (hasEffectiveBenefit && lineTotal <= standardTotal) {
      candidates.push({
        campaign: camp,
        calculatedLineTotal: lineTotal,
        calculatedUnitPrice: unitPrice,
        discountAmount,
        explanation,
        giftDescription,
      });
    }
  }

  if (candidates.length === 0) {
    return {
      appliedCampaign: null,
      unitPrice: originalUnitPrice,
      lineBaseTotal: standardTotal,
      originalUnitPrice,
      discountAmount: 0,
      promoLabel: '',
    };
  }

  // Ordena candidatos:
  // 1º: Maior prioridade declarada na campanha
  // 2º: Maior economia real em R$ (desconto) para o cliente
  candidates.sort((a, b) => {
    const prioDiff = (b.campaign.priority || 1) - (a.campaign.priority || 1);
    if (prioDiff !== 0) return prioDiff;
    return b.discountAmount - a.discountAmount;
  });

  const best = candidates[0];

  return {
    appliedCampaign: best.campaign,
    unitPrice: best.calculatedUnitPrice,
    lineBaseTotal: best.calculatedLineTotal,
    originalUnitPrice,
    discountAmount: best.discountAmount,
    promoLabel: best.campaign.name,
    explanation: best.explanation,
    giftDescription: best.giftDescription,
  };
}

export async function hydratePromoCampaigns() {
  const storeId = getActiveStoreId();
  const rows = await nestGet<PromoCampaign[]>('/promotions');
  if (storeId !== getActiveStoreId()) throw new Error('A loja mudou durante a consulta.');
  memoryStoreId = storeId;
  save({ campaigns: rows.map(normalize) });
}
