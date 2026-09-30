/**
 * Gerenciamento Multi-Loja & Licenciamento por CNPJ.
 *
 * Arquitetura:
 *   ClientAccount (Conta / Cliente contratante)
 *       └── Stores (Lojas / Filiais / CNPJs individuais)
 *              └── StoreLicenses (1 licença por CNPJ com desconto por multi-loja)
 *   UserStores (Vínculo de usuário a lojas autorizadas + loja padrão)
 *   LicensingDiscountRules (Regras dinâmicas e configuráveis de desconto progressivo)
 */

import { isNestAuthed } from '../services/nestClient';
import {
  apiGetClientAccount,
  apiListStores,
} from '../services/erpApi';
import { getActiveTenantKey, tenantScopedKey } from './tenantContext';
import type { StoreSegmentId } from './storeSegment';

export type ClientAccount = {
  id: string;
  legalName: string;
  tradeName: string;
  document: string; // CNPJ da matriz ou CPF do titular
  email: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
};

export type StoreTaxRegime = 'simples_nacional' | 'lucro_presumido' | 'lucro_real' | 'mei';

export type Store = {
  id: string;
  clientAccountId: string;
  code: string;
  name: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  accessToken?: string;
  email: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  ibgeCityCode: string;
  taxRegime: StoreTaxRegime;
  active: boolean;
  isMatrix: boolean;
  segmentId?: StoreSegmentId;
  createdAt: string;
  updatedAt: string;
};

export type DiscountType = 'percent' | 'fixed';

export type LicensingDiscountRule = {
  id: string;
  name: string;
  minStores: number;
  maxStores: number | null; // null = sem teto (ex: 6+ lojas)
  discountType: DiscountType;
  discountValue: number; // e.g. 15 (%) ou R$ 50,00
  active: boolean;
  notes: string;
};

export type LicenseStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

export type StoreLicense = {
  id: string;
  storeId: string;
  planId: string;
  status: LicenseStatus;
  baseMonthlyPrice: number;
  discountAmount: number;
  finalMonthlyPrice: number;
  startDate: string;
  expiresDate: string;
  active: boolean;
  createdAt: string;
};

export type UserStoreAccess = {
  id: string;
  userId: string;
  storeId: string;
  isDefault: boolean;
  role: 'admin' | 'manager' | 'operator' | 'cashier';
};

const STORAGE_KEY_CLIENT_ACCOUNT = 'marthi.multi_store.client_account.v1';
const STORAGE_KEY_STORES = 'marthi.multi_store.stores.v1';
const STORAGE_KEY_RULES = 'marthi.multi_store.discount_rules.v1';
const STORAGE_KEY_LICENSES = 'marthi.multi_store.licenses.v1';
const STORAGE_KEY_ACTIVE_STORE_ID = 'marthi.multi_store.active_store_id.v1';

export const MULTI_STORE_CHANGED_EVENT = 'marthi-multi-store-changed';
export const STORE_CONTEXT_CHANGED_EVENT = 'marthi-store-context-changed';

/**
 * Gera um Token de Acesso exclusivo para a empresa/filial a partir do seu CNPJ, E-mail e Identificador.
 * Vincula credenciais individuais e seguras em todos os módulos (Totem, Retaguarda, OS, PDV, Fiscal, E-commerce, Usuários).
 */
export function generateStoreAccessToken(cnpj: string, email: string, storeId?: string): string {
  const cleanDoc = (cnpj || '').replace(/\D/g, '') || '00000000000000';
  const docPart = cleanDoc.slice(-6);
  const hashPart = Math.abs(
    (cleanDoc + (email || '')).split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0),
  )
    .toString(36)
    .toUpperCase()
    .padStart(5, '0')
    .slice(-5);
  const prefix = (storeId || 'STR').replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase();
  const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TK-${prefix || 'STR'}-${docPart}-${hashPart}-${randPart}`;
}

/**
 * Conta comercial padrão para a empresa habilitada Cell Ponto (Gilvan Teodoro)
 */
export const DEFAULT_CLIENT_ACCOUNT: ClientAccount = {
  id: 'ACC-MARTHI-DEMO',
  legalName: 'Cell Ponto Telecomunicações LTDA',
  tradeName: 'Cell Ponto',
  document: '61.506.270/0001-63',
  email: 'gilvanteodo@gmail.com',
  phone: '(24) 98124-4253',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: new Date().toISOString(),
};

/**
 * Loja padrão única habilitada para a Cell Ponto (Matriz em Três Rios / RJ)
 */
export const DEFAULT_STORES: Store[] = [
  {
    id: 'STR-DEMO-01',
    clientAccountId: 'ACC-MARTHI-DEMO',
    code: '001',
    name: 'Cell Ponto Matriz',
    tradeName: 'Cell Ponto',
    cnpj: '61.506.270/0001-63',
    stateRegistration: 'ISENTO',
    municipalRegistration: '12345',
    accessToken: 'TK-001-000163-CPTR-88A1',
    email: 'matriz@cellponto.com.br',
    phone: '(24) 98124-4253',
    zipCode: '25800-000',
    street: 'Rua Prefeito Walter Franklin',
    number: '120',
    complement: 'Loja 01',
    neighborhood: 'Centro',
    city: 'Três Rios',
    state: 'RJ',
    ibgeCityCode: '3306008',
    taxRegime: 'simples_nacional',
    active: true,
    isMatrix: true,
    segmentId: 'assistencia_tecnica',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
  },
];

export const DEFAULT_DISCOUNT_RULES: LicensingDiscountRule[] = [
  {
    id: 'rule-single',
    name: '1 Loja (Sem Desconto Multi-Loja)',
    minStores: 1,
    maxStores: 1,
    discountType: 'percent',
    discountValue: 0,
    active: true,
    notes: 'Preço integral para a primeira loja contratada',
  },
  {
    id: 'rule-2-stores',
    name: '2 Lojas (15% de Desconto na 2ª loja)',
    minStores: 2,
    maxStores: 2,
    discountType: 'percent',
    discountValue: 15,
    active: true,
    notes: 'Desconto comercial para abertura de 2ª filial',
  },
  {
    id: 'rule-3-5-stores',
    name: '3 a 5 Lojas (25% de Desconto a partir da 2ª loja)',
    minStores: 3,
    maxStores: 5,
    discountType: 'percent',
    discountValue: 25,
    active: true,
    notes: 'Rede média em expansão regional',
  },
  {
    id: 'rule-6-plus-stores',
    name: '6+ Lojas (35% de Desconto a partir da 2ª loja)',
    minStores: 6,
    maxStores: null,
    discountType: 'percent',
    discountValue: 35,
    active: true,
    notes: 'Rede corporativa / grande porte',
  },
];

let hasCleanedLegacyMocks = false;

/**
 * Remove permanentemente quaisquer resíduos de mocks anteriores
 * (como "Grupo Varejista do Brasil" ou CNPJ 12.345.678) do localStorage.
 */
export function cleanLegacyMocks() {
  if (hasCleanedLegacyMocks || typeof window === 'undefined') return;
  hasCleanedLegacyMocks = true;
  try {
    const isMock = (val: string | null) =>
      Boolean(
        val &&
          (val.includes('Grupo Varejista') ||
            val.includes('12.345.678') ||
            val.includes('Shopping Plaza') ||
            val.includes('Loja Matriz Centro') ||
            val.includes('00.000.000/0001-00') ||
            val.includes('varejobrasil.com.br')),
      );

    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('marthi.multi_store') || k.includes('multi_store'))) {
        const v = localStorage.getItem(k);
        if (isMock(v)) {
          keysToRemove.push(k);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // Expurga cache residual de marthi.store.segment_config se possuir restaurante ou flags de salão
    const segRaw = localStorage.getItem('marthi.store.segment_config');
    if (segRaw) {
      try {
        const parsedSeg = JSON.parse(segRaw);
        if (
          parsedSeg.showCardapioDigital === true ||
          parsedSeg.showTablesAndKitchen === true ||
          parsedSeg.segmentId === 'restaurante_gastronomia'
        ) {
          localStorage.removeItem('marthi.store.segment_config');
        }
      } catch {
        localStorage.removeItem('marthi.store.segment_config');
      }
    }
  } catch (e) {
    console.warn('[multiStore] cleanLegacyMocks error', e);
  }
}

if (typeof window !== 'undefined') {
  cleanLegacyMocks();
}

function getLocalMarthiClients(): Array<{
  clientId: string;
  tradeName: string;
  legalName?: string;
  document?: string;
  email: string;
  phone?: string;
  contractedAt?: string;
}> {
  try {
    const raw = localStorage.getItem('marthi.ops.clients.v2');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.clients) ? parsed.clients : [];
  } catch {
    return [];
  }
}

export function resolveDefaultClientAccount(): ClientAccount {
  cleanLegacyMocks();
  const tenantKey = getActiveTenantKey();
  if (tenantKey.startsWith('client_')) {
    const clientId = tenantKey.slice('client_'.length);
    const client = getLocalMarthiClients().find((c) => c.clientId === clientId);
    if (client) {
      const realDoc =
        client.document && client.document !== '00.000.000/0001-00'
          ? client.document
          : '61.506.270/0001-63';
      const realTrade =
        client.tradeName && !client.tradeName.includes('demo') && client.tradeName !== 'Cliente'
          ? client.tradeName
          : 'Cell Ponto';
      const realLegal =
        client.legalName ||
        (realTrade.toLowerCase().includes('cell')
          ? 'Cell Ponto Telecomunicações LTDA'
          : realTrade);

      return {
        id: client.clientId,
        legalName: realLegal,
        tradeName: realTrade,
        document: realDoc,
        email: client.email || 'gilvanteodo@gmail.com',
        phone: client.phone || '(24) 98124-4253',
        createdAt: client.contractedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }
  return DEFAULT_CLIENT_ACCOUNT;
}

export function resolveDefaultStores(): Store[] {
  cleanLegacyMocks();
  const tenantKey = getActiveTenantKey();
  if (tenantKey.startsWith('client_')) {
    const clientId = tenantKey.slice('client_'.length);
    const client = getLocalMarthiClients().find((c) => c.clientId === clientId);
    if (client) {
      const realDoc =
        client.document && client.document !== '00.000.000/0001-00'
          ? client.document
          : '61.506.270/0001-63';
      const realTrade =
        client.tradeName && !client.tradeName.includes('demo') && client.tradeName !== 'Cliente'
          ? client.tradeName
          : 'Cell Ponto Matriz';

      return [
        {
          id: `store-${client.clientId}`,
          clientAccountId: client.clientId,
          code: '001',
          name: realTrade,
          tradeName: realTrade,
          cnpj: realDoc,
          stateRegistration: 'ISENTO',
          municipalRegistration: '12345',
          accessToken: `TK-001-${(realDoc.replace(/\D/g, '') || '000163').slice(-6)}-CPTR-88A1`,
          email: client.email || 'matriz@cellponto.com.br',
          phone: client.phone || '(24) 98124-4253',
          zipCode: '25800-000',
          street: 'Rua Prefeito Walter Franklin',
          number: '120',
          complement: 'Loja 01',
          neighborhood: 'Centro',
          city: 'Três Rios',
          state: 'RJ',
          ibgeCityCode: '',
          taxRegime: 'simples_nacional',
          active: true,
          isMatrix: true,
          segmentId: 'assistencia_tecnica',
          createdAt: client.contractedAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
    }
  }
  return DEFAULT_STORES;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Erro ao salvar ${key}:`, e);
  }
}

// ----------------------------------------------------
// CLIENT ACCOUNT
// ----------------------------------------------------
export function getClientAccount(): ClientAccount {
  cleanLegacyMocks();
  const key = tenantScopedKey(STORAGE_KEY_CLIENT_ACCOUNT);
  const account = readJson<ClientAccount>(key, resolveDefaultClientAccount());
  if (account.legalName.includes('Grupo Varejista') || account.document.includes('12.345.678')) {
    return resolveDefaultClientAccount();
  }
  return account;
}

export function saveClientAccount(account: ClientAccount): ClientAccount {
  account.updatedAt = new Date().toISOString();
  const key = tenantScopedKey(STORAGE_KEY_CLIENT_ACCOUNT);
  writeJson(key, account);
  window.dispatchEvent(new Event(MULTI_STORE_CHANGED_EVENT));
  return account;
}

// ----------------------------------------------------
// STORES
// ----------------------------------------------------
export function listStores(): Store[] {
  cleanLegacyMocks();
  const key = tenantScopedKey(STORAGE_KEY_STORES);
  const fallback = resolveDefaultStores();
  const stores = readJson<Store[]>(key, fallback);

  // Filtragem definitiva para evitar que qualquer mock residual seja exibido
  const filtered = stores.filter(
    (s) =>
      !s.cnpj.includes('12.345.678') &&
      !s.name.includes('Shopping Plaza') &&
      !s.name.includes('Loja Matriz Centro') &&
      !s.email.includes('varejobrasil.com.br'),
  );

  const list = filtered.length === 0 ? fallback : filtered;

  // Garante que toda loja tenha seu Token de Acesso exclusivo preenchido
  let hasMissingToken = false;
  const withTokens = list.map((s) => {
    if (!s.accessToken) {
      hasMissingToken = true;
      return {
        ...s,
        accessToken: generateStoreAccessToken(s.cnpj, s.email, s.id),
      };
    }
    return s;
  });

  if (hasMissingToken) {
    writeJson(key, withTokens);
  }

  return withTokens;
}

export function getStoreById(storeId: string): Store | null {
  const stores = listStores();
  return stores.find((s) => s.id === storeId) ?? null;
}

export function getStoreAccessToken(storeId: string): string {
  const store = getStoreById(storeId);
  if (store?.accessToken) return store.accessToken;
  if (store) {
    const token = generateStoreAccessToken(store.cnpj, store.email, store.id);
    saveStore({ ...store, accessToken: token });
    return token;
  }
  return '';
}

export function regenerateStoreAccessToken(storeId: string): string {
  const store = getStoreById(storeId);
  if (!store) return '';
  const token = generateStoreAccessToken(store.cnpj, store.email, store.id);
  saveStore({ ...store, accessToken: token });
  return token;
}

export function saveStore(store: Partial<Store> & { name: string; cnpj: string }): Store {
  const stores = listStores();
  const now = new Date().toISOString();
  let saved: Store;

  const existing = store.id ? stores.find((s) => s.id === store.id) : undefined;
  const token =
    store.accessToken ||
    existing?.accessToken ||
    generateStoreAccessToken(store.cnpj, store.email || '', store.id);

  if (store.id) {
    const idx = stores.findIndex((s) => s.id === store.id);
    if (idx >= 0) {
      saved = {
        ...stores[idx],
        ...store,
        accessToken: token,
        updatedAt: now,
      };
      stores[idx] = saved;
    } else {
      saved = {
        id: store.id,
        clientAccountId: store.clientAccountId || getClientAccount().id,
        code: store.code || String(stores.length + 1).padStart(3, '0'),
        name: store.name.trim(),
        tradeName: (store.tradeName || store.name).trim(),
        cnpj: store.cnpj.trim(),
        stateRegistration: store.stateRegistration || '',
        municipalRegistration: store.municipalRegistration || '',
        accessToken: token,
        email: store.email || '',
        phone: store.phone || '',
        zipCode: store.zipCode || '',
        street: store.street || '',
        number: store.number || '',
        complement: store.complement || '',
        neighborhood: store.neighborhood || '',
        city: store.city || '',
        state: store.state || 'RJ',
        ibgeCityCode: store.ibgeCityCode || '',
        taxRegime: store.taxRegime || 'simples_nacional',
        active: store.active !== false,
        isMatrix: Boolean(store.isMatrix),
        segmentId: store.segmentId || 'assistencia_tecnica',
        createdAt: now,
        updatedAt: now,
      };
      stores.push(saved);
    }
  } else {
    saved = {
      id: `store-${Date.now().toString(36)}`,
      clientAccountId: store.clientAccountId || getClientAccount().id,
      code: store.code || String(stores.length + 1).padStart(3, '0'),
      name: store.name.trim(),
      tradeName: (store.tradeName || store.name).trim(),
      cnpj: store.cnpj.trim(),
      stateRegistration: store.stateRegistration || '',
      municipalRegistration: store.municipalRegistration || '',
      accessToken: token,
      email: store.email || '',
      phone: store.phone || '',
      zipCode: store.zipCode || '',
      street: store.street || '',
      number: store.number || '',
      complement: store.complement || '',
      neighborhood: store.neighborhood || '',
      city: store.city || '',
      state: store.state || 'RJ',
      ibgeCityCode: store.ibgeCityCode || '',
      taxRegime: store.taxRegime || 'simples_nacional',
      active: store.active !== false,
      isMatrix: stores.length === 0 ? true : Boolean(store.isMatrix),
      segmentId: store.segmentId || 'assistencia_tecnica',
      createdAt: now,
      updatedAt: now,
    };
    stores.push(saved);
  }

  // Se marcada como matriz, desmarca as outras
  if (saved.isMatrix) {
    stores.forEach((s) => {
      if (s.id !== saved.id) s.isMatrix = false;
    });
  }

  const key = tenantScopedKey(STORAGE_KEY_STORES);
  writeJson(key, stores);
  recalculateAllStoreLicenses();
  window.dispatchEvent(new Event(MULTI_STORE_CHANGED_EVENT));
  return saved;
}

export function deleteStore(storeId: string): boolean {
  const stores = listStores();
  const target = stores.find((s) => s.id === storeId);
  if (!target || target.isMatrix) {
    // Matriz não pode ser apagada se houver filiais
    if (stores.length > 1 && target?.isMatrix) return false;
  }
  const filtered = stores.filter((s) => s.id !== storeId);
  const key = tenantScopedKey(STORAGE_KEY_STORES);
  writeJson(key, filtered);

  if (getActiveStoreId() === storeId && filtered.length > 0) {
    setActiveStoreId(filtered[0].id);
  }

  recalculateAllStoreLicenses();
  window.dispatchEvent(new Event(MULTI_STORE_CHANGED_EVENT));
  return true;
}

// ----------------------------------------------------
// ACTIVE STORE CONTEXT
// ----------------------------------------------------
export function getActiveStoreId(): string {
  const stores = listStores();
  if (stores.length === 0) return '';
  const key = tenantScopedKey(STORAGE_KEY_ACTIVE_STORE_ID);
  const storedId = localStorage.getItem(key);
  if (storedId && stores.some((s) => s.id === storedId && s.active)) {
    return storedId;
  }
  // Fallback: matriz ou primeira ativa
  const matrix = stores.find((s) => s.isMatrix && s.active);
  const fallbackId = matrix ? matrix.id : (stores.find((s) => s.active)?.id ?? stores[0].id);
  localStorage.setItem(key, fallbackId);
  return fallbackId;
}

export function getActiveStore(): Store | null {
  const activeId = getActiveStoreId();
  return getStoreById(activeId);
}

export function setActiveStoreId(storeId: string): boolean {
  const store = getStoreById(storeId);
  if (!store || !store.active) return false;
  const key = tenantScopedKey(STORAGE_KEY_ACTIVE_STORE_ID);
  localStorage.setItem(key, storeId);
  window.dispatchEvent(new CustomEvent(STORE_CONTEXT_CHANGED_EVENT, { detail: { storeId, store } }));
  return true;
}

// ----------------------------------------------------
// DISCOUNT RULES & LICENSING ENGINE
// ----------------------------------------------------
export function listDiscountRules(): LicensingDiscountRule[] {
  const key = tenantScopedKey(STORAGE_KEY_RULES);
  return readJson<LicensingDiscountRule[]>(key, DEFAULT_DISCOUNT_RULES);
}

export function saveDiscountRules(rules: LicensingDiscountRule[]) {
  const key = tenantScopedKey(STORAGE_KEY_RULES);
  writeJson(key, rules);
  recalculateAllStoreLicenses();
  window.dispatchEvent(new Event(MULTI_STORE_CHANGED_EVENT));
}

export function deleteDiscountRule(ruleId: string) {
  const current = listDiscountRules();
  const next = current.filter((r) => r.id !== ruleId);
  saveDiscountRules(next);
}

export function resetDiscountRulesToDefault() {
  saveDiscountRules(DEFAULT_DISCOUNT_RULES);
}

/**
 * Encontra a regra comercial aplicável dado o número total de lojas contratadas.
 */
export function getApplicableDiscountRule(totalStores: number): LicensingDiscountRule | null {
  const rules = listDiscountRules().filter((r) => r.active);
  for (const rule of rules) {
    if (totalStores >= rule.minStores) {
      if (rule.maxStores === null || totalStores <= rule.maxStores) {
        return rule;
      }
    }
  }
  return null;
}

export type StoreLicensingSummary = {
  totalStores: number;
  activeStores: number;
  basePricePerStore: number;
  applicableRule: LicensingDiscountRule | null;
  items: Array<{
    store: Store;
    isMatrix: boolean;
    basePrice: number;
    discountPercent: number;
    discountValue: number;
    finalPrice: number;
  }>;
  totalBase: number;
  totalDiscount: number;
  totalFinal: number;
};

export function calculateLicensingSummary(basePrice = 197): StoreLicensingSummary {
  const stores = listStores();
  const activeStoresList = stores.filter((s) => s.active);
  const totalCount = activeStoresList.length;
  const rule = getApplicableDiscountRule(totalCount);

  let totalBase = 0;
  let totalDiscount = 0;
  let totalFinal = 0;

  const items = activeStoresList.map((store, index) => {
    const isFirst = index === 0 || store.isMatrix;
    const base = basePrice;
    totalBase += base;

    let discPercent = 0;
    let discVal = 0;

    // Regra comercial: A primeira loja (Matriz) paga integral; a partir da 2ª loja aplica-se o desconto multi-loja
    if (!isFirst && rule && rule.discountValue > 0) {
      if (rule.discountType === 'percent') {
        discPercent = rule.discountValue;
        discVal = Number(((base * discPercent) / 100).toFixed(2));
      } else {
        discVal = Math.min(base, rule.discountValue);
        discPercent = Number(((discVal / base) * 100).toFixed(1));
      }
    }

    const final = Number((base - discVal).toFixed(2));
    totalDiscount += discVal;
    totalFinal += final;

    return {
      store,
      isMatrix: store.isMatrix,
      basePrice: base,
      discountPercent: discPercent,
      discountValue: discVal,
      finalPrice: final,
    };
  });

  return {
    totalStores: stores.length,
    activeStores: totalCount,
    basePricePerStore: basePrice,
    applicableRule: rule,
    items,
    totalBase: Number(totalBase.toFixed(2)),
    totalDiscount: Number(totalDiscount.toFixed(2)),
    totalFinal: Number(totalFinal.toFixed(2)),
  };
}

export function listStoreLicenses(): StoreLicense[] {
  const key = tenantScopedKey(STORAGE_KEY_LICENSES);
  const licenses = readJson<StoreLicense[]>(key, []);
  if (licenses.length === 0) {
    return recalculateAllStoreLicenses();
  }
  return licenses;
}

export function recalculateAllStoreLicenses(basePrice = 197): StoreLicense[] {
  const summary = calculateLicensingSummary(basePrice);
  const now = new Date().toISOString();
  const expires = new Date();
  expires.setMonth(expires.getMonth() + 1);

  const licenses: StoreLicense[] = summary.items.map((item) => ({
    id: `LIC-${item.store.id}`,
    storeId: item.store.id,
    planId: 'golden',
    status: 'active',
    baseMonthlyPrice: item.basePrice,
    discountAmount: item.discountValue,
    finalMonthlyPrice: item.finalPrice,
    startDate: now,
    expiresDate: expires.toISOString(),
    active: item.store.active,
    createdAt: now,
  }));

  const key = tenantScopedKey(STORAGE_KEY_LICENSES);
  writeJson(key, licenses);
  return licenses;
}

/**
 * Sincroniza a unificação de uma loja filial com a matriz no módulo Multi-Loja.
 */
export function syncBranchToMultiStore(
  matrix: { clientId: string; tradeName: string; document?: string; email: string; phone?: string },
  branch: { clientId: string; tradeName: string; branchName?: string; document?: string; email: string; phone?: string; status?: string },
) {
  const stores = listStores();
  // Garante que a matriz esteja registrada
  let matrixStore = stores.find((s) => s.clientAccountId === matrix.clientId && s.isMatrix);
  if (!matrixStore) {
    matrixStore = saveStore({
      clientAccountId: matrix.clientId,
      name: matrix.tradeName,
      tradeName: matrix.tradeName,
      cnpj: matrix.document || '00.000.000/0001-00',
      email: matrix.email,
      phone: matrix.phone || '',
      isMatrix: true,
      active: true,
    });
  }

  // Verifica se a filial já está cadastrada
  const branchName = branch.branchName || `${branch.tradeName} (Filial)`;
  let branchStore = stores.find(
    (s) =>
      s.clientAccountId === matrix.clientId &&
      (s.id === `store-${branch.clientId}` ||
        s.email.toLowerCase() === branch.email.toLowerCase() ||
        (branch.document && s.cnpj === branch.document)),
  );

  if (branchStore) {
    saveStore({
      ...branchStore,
      name: branchName,
      tradeName: branch.tradeName,
      cnpj: branch.document || branchStore.cnpj,
      email: branch.email,
      phone: branch.phone || branchStore.phone,
      active: branch.status !== 'inactive' && branch.status !== 'blocked',
      isMatrix: false,
    });
  } else {
    saveStore({
      id: `store-${branch.clientId}`,
      clientAccountId: matrix.clientId,
      name: branchName,
      tradeName: branch.tradeName,
      cnpj: branch.document || '00.000.000/0002-00',
      email: branch.email,
      phone: branch.phone || '',
      isMatrix: false,
      active: branch.status !== 'inactive' && branch.status !== 'blocked',
    });
  }
}

/**
 * Remove a filial unificada caso ela seja desconectada ou separada.
 */
export function removeBranchFromMultiStore(branchClientId: string) {
  const stores = listStores();
  const branchStore = stores.find((s) => s.id === `store-${branchClientId}`);
  if (branchStore) {
    deleteStore(branchStore.id);
  }
}

/**
 * Hidrata a conta comercial contratante e as lojas reais conectadas ao backend Nest
 */
export async function hydrateMultiStoreFromApi(): Promise<boolean> {
  if (!isNestAuthed()) return false;
  try {
    const [accountRow, storesRows] = await Promise.all([
      apiGetClientAccount().catch(() => null),
      apiListStores().catch(() => null),
    ]);

    let changed = false;

    if (accountRow && accountRow.id) {
      const mappedAccount: ClientAccount = {
        id: accountRow.id,
        legalName: accountRow.legalName,
        tradeName: accountRow.tradeName || accountRow.legalName,
        document: accountRow.document,
        email: accountRow.email || '',
        phone: accountRow.phone || '',
        createdAt: accountRow.createdAt || new Date().toISOString(),
        updatedAt: accountRow.updatedAt || new Date().toISOString(),
      };
      saveClientAccount(mappedAccount);
      changed = true;
    }

    if (Array.isArray(storesRows) && storesRows.length > 0) {
      const mappedStores: Store[] = storesRows.map((s, idx) => ({
        id: s.id,
        clientAccountId: s.clientAccountId,
        code: String(idx + 1).padStart(3, '0'),
        name: s.tradeName || s.legalName,
        tradeName: s.tradeName || s.legalName,
        cnpj: s.document,
        stateRegistration: s.stateRegistration || '',
        municipalRegistration: s.municipalRegistration || '',
        email: s.email || '',
        phone: s.phone || '',
        zipCode: s.zipCode || '',
        street: s.street || '',
        number: s.number || '',
        complement: s.complement || '',
        neighborhood: s.district || '',
        city: s.city || '',
        state: s.state || 'RJ',
        ibgeCityCode: '',
        taxRegime: (s.taxRegime as StoreTaxRegime) || 'simples_nacional',
        active: s.active !== false,
        isMatrix: Boolean(s.isMatrix),
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
      }));

      const key = tenantScopedKey(STORAGE_KEY_STORES);
      writeJson(key, mappedStores);
      recalculateAllStoreLicenses();
      changed = true;
    }

    if (changed) {
      window.dispatchEvent(new Event(MULTI_STORE_CHANGED_EVENT));
    }
    return true;
  } catch (err) {
    console.warn('[multiStore] Failed to hydrate from API:', err);
    return false;
  }
}
