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

const DEFAULT_CLIENT_ACCOUNT: ClientAccount = {
  id: 'CLI-001',
  legalName: 'Grupo Varejista do Brasil Ltda',
  tradeName: 'Grupo Varejo Brasil',
  document: '12.345.678/0001-90',
  email: 'contato@varejobrasil.com.br',
  phone: '(11) 3200-5500',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const DEFAULT_STORES: Store[] = [
  {
    id: 'store-matriz-01',
    clientAccountId: 'CLI-001',
    code: '001',
    name: 'Loja Matriz Centro',
    tradeName: 'Marthi Tech - Matriz Centro',
    cnpj: '12.345.678/0001-90',
    stateRegistration: '123.456.789.110',
    municipalRegistration: '9876543-2',
    email: 'matriz@varejobrasil.com.br',
    phone: '(11) 3200-5501',
    zipCode: '01001-000',
    street: 'Praça da Sé',
    number: '100',
    complement: 'Andar 2',
    neighborhood: 'Sé',
    city: 'São Paulo',
    state: 'SP',
    ibgeCityCode: '3550308',
    taxRegime: 'simples_nacional',
    active: true,
    isMatrix: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'store-filial-02',
    clientAccountId: 'CLI-001',
    code: '002',
    name: 'Loja Filial Shopping Plaza',
    tradeName: 'Marthi Tech - Shopping Plaza',
    cnpj: '12.345.678/0002-71',
    stateRegistration: '123.456.789.111',
    municipalRegistration: '9876543-3',
    email: 'filial1@varejobrasil.com.br',
    phone: '(11) 3200-5502',
    zipCode: '04578-000',
    street: 'Av. das Nações Unidas',
    number: '12551',
    complement: 'Loja 204 Piso 2',
    neighborhood: 'Brooklin',
    city: 'São Paulo',
    state: 'SP',
    ibgeCityCode: '3550308',
    taxRegime: 'simples_nacional',
    active: true,
    isMatrix: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_DISCOUNT_RULES: LicensingDiscountRule[] = [
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
  return readJson<ClientAccount>(STORAGE_KEY_CLIENT_ACCOUNT, DEFAULT_CLIENT_ACCOUNT);
}

export function saveClientAccount(account: ClientAccount): ClientAccount {
  account.updatedAt = new Date().toISOString();
  writeJson(STORAGE_KEY_CLIENT_ACCOUNT, account);
  window.dispatchEvent(new Event(MULTI_STORE_CHANGED_EVENT));
  return account;
}

// ----------------------------------------------------
// STORES
// ----------------------------------------------------
export function listStores(): Store[] {
  const stores = readJson<Store[]>(STORAGE_KEY_STORES, DEFAULT_STORES);
  return stores;
}

export function getStoreById(storeId: string): Store | null {
  const stores = listStores();
  return stores.find((s) => s.id === storeId) ?? null;
}

export function saveStore(store: Partial<Store> & { name: string; cnpj: string }): Store {
  const stores = listStores();
  const now = new Date().toISOString();
  let saved: Store;

  if (store.id) {
    const idx = stores.findIndex((s) => s.id === store.id);
    if (idx >= 0) {
      saved = {
        ...stores[idx],
        ...store,
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
        email: store.email || '',
        phone: store.phone || '',
        zipCode: store.zipCode || '',
        street: store.street || '',
        number: store.number || '',
        complement: store.complement || '',
        neighborhood: store.neighborhood || '',
        city: store.city || '',
        state: store.state || 'SP',
        ibgeCityCode: store.ibgeCityCode || '3550308',
        taxRegime: store.taxRegime || 'simples_nacional',
        active: store.active !== false,
        isMatrix: Boolean(store.isMatrix),
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
      email: store.email || '',
      phone: store.phone || '',
      zipCode: store.zipCode || '',
      street: store.street || '',
      number: store.number || '',
      complement: store.complement || '',
      neighborhood: store.neighborhood || '',
      city: store.city || '',
      state: store.state || 'SP',
      ibgeCityCode: store.ibgeCityCode || '3550308',
      taxRegime: store.taxRegime || 'simples_nacional',
      active: store.active !== false,
      isMatrix: stores.length === 0 ? true : Boolean(store.isMatrix),
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

  writeJson(STORAGE_KEY_STORES, stores);
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
  writeJson(STORAGE_KEY_STORES, filtered);

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
  const storedId = localStorage.getItem(STORAGE_KEY_ACTIVE_STORE_ID);
  if (storedId && stores.some((s) => s.id === storedId && s.active)) {
    return storedId;
  }
  // Fallback: matriz ou primeira ativa
  const matrix = stores.find((s) => s.isMatrix && s.active);
  const fallbackId = matrix ? matrix.id : (stores.find((s) => s.active)?.id ?? stores[0].id);
  localStorage.setItem(STORAGE_KEY_ACTIVE_STORE_ID, fallbackId);
  return fallbackId;
}

export function getActiveStore(): Store | null {
  const activeId = getActiveStoreId();
  return getStoreById(activeId);
}

export function setActiveStoreId(storeId: string): boolean {
  const store = getStoreById(storeId);
  if (!store || !store.active) return false;
  localStorage.setItem(STORAGE_KEY_ACTIVE_STORE_ID, storeId);
  window.dispatchEvent(new CustomEvent(STORE_CONTEXT_CHANGED_EVENT, { detail: { storeId, store } }));
  return true;
}

// ----------------------------------------------------
// DISCOUNT RULES & LICENSING ENGINE
// ----------------------------------------------------
export function listDiscountRules(): LicensingDiscountRule[] {
  return readJson<LicensingDiscountRule[]>(STORAGE_KEY_RULES, DEFAULT_DISCOUNT_RULES);
}

export function saveDiscountRules(rules: LicensingDiscountRule[]) {
  writeJson(STORAGE_KEY_RULES, rules);
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
  const licenses = readJson<StoreLicense[]>(STORAGE_KEY_LICENSES, []);
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
    planId: 'bronze',
    status: 'active',
    baseMonthlyPrice: item.basePrice,
    discountAmount: item.discountValue,
    finalMonthlyPrice: item.finalPrice,
    startDate: now,
    expiresDate: expires.toISOString(),
    active: item.store.active,
    createdAt: now,
  }));

  writeJson(STORAGE_KEY_LICENSES, licenses);
  return licenses;
}
