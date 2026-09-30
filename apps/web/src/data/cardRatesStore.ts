/**
 * Registro de Maquininhas de Cartão e Taxas por Bandeira / Parcelamento.
 *
 * Arquitetura:
 *   - Cada maquininha possui N bandeiras (Mastercard, Visa, Elo, Hipercard, Amex, etc.).
 *   - Cada bandeira possui taxa de débito e taxas por parcela (1x, 2x, 3x ... até Nx).
 *   - Uma maquininha e bandeira são definidas como padrão para o Totem (ex.: Master em 12x).
 *   - As taxas são compartilhadas com o Totem e com o Financeiro para cálculo de recebimento líquido.
 */

import { tenantScopedKey } from './tenantContext';
import { isNestAuthed } from '../services/nestClient';
import { apiGetCardMachines, apiSaveCardMachines } from '../services/erpApi';

export type CardBrandInstallment = {
  installment: number; // 1, 2, 3, ... 12, 18, 24
  rate: number;        // Taxa em percentual (ex: 3.14 = 3,14%)
};

export type CardBrand = {
  id: string;          // 'master', 'visa', 'elo', 'hipercard', 'amex'
  name: string;        // 'Mastercard', 'Visa', 'Elo', 'Hipercard', 'American Express'
  debitRate: number;   // Taxa de débito em percentual (ex: 1.39)
  installments: CardBrandInstallment[];
  active: boolean;
};

export type CardMachine = {
  id: string;
  name: string;             // ex: 'Maquininha Principal (Stone / PagBank)'
  model?: string;           // ex: 'Smart POS P2'
  serialNumber?: string;
  isDefaultTotem: boolean;  // Se esta máquina é a referência para o Totem
  defaultBrandId: string;   // Bandeira usada para o cálculo padrão no Totem (ex: 'master')
  brands: CardBrand[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY_CARD_MACHINES = 'marthi.card_machines.v1';
export const CARD_RATES_CHANGED_EVENT = 'marthi-card-rates-changed';

/**
 * Gera as 12 parcelas padrão com base na taxa 1x e acréscimo linear
 */
function generateDefaultInstallments(rate1x: number, rate2x: number, step = 1.15): CardBrandInstallment[] {
  const list: CardBrandInstallment[] = [
    { installment: 1, rate: rate1x },
    { installment: 2, rate: rate2x },
  ];
  let prev = rate2x;
  for (let i = 3; i <= 12; i++) {
    prev = Number((prev + step).toFixed(2));
    list.push({ installment: i, rate: prev });
  }
  return list;
}

export const DEFAULT_CARD_BRANDS: CardBrand[] = [
  {
    id: 'master',
    name: 'Mastercard',
    debitRate: 1.39,
    installments: [
      { installment: 1, rate: 3.14 },
      { installment: 2, rate: 5.28 },
      { installment: 3, rate: 6.45 },
      { installment: 4, rate: 7.60 },
      { installment: 5, rate: 8.75 },
      { installment: 6, rate: 9.90 },
      { installment: 7, rate: 11.05 },
      { installment: 8, rate: 12.20 },
      { installment: 9, rate: 13.35 },
      { installment: 10, rate: 14.50 },
      { installment: 11, rate: 15.65 },
      { installment: 12, rate: 16.80 },
    ],
    active: true,
  },
  {
    id: 'visa',
    name: 'Visa',
    debitRate: 1.39,
    installments: [
      { installment: 1, rate: 3.14 },
      { installment: 2, rate: 5.28 },
      { installment: 3, rate: 6.45 },
      { installment: 4, rate: 7.60 },
      { installment: 5, rate: 8.75 },
      { installment: 6, rate: 9.90 },
      { installment: 7, rate: 11.05 },
      { installment: 8, rate: 12.20 },
      { installment: 9, rate: 13.35 },
      { installment: 10, rate: 14.50 },
      { installment: 11, rate: 15.65 },
      { installment: 12, rate: 16.80 },
    ],
    active: true,
  },
  {
    id: 'elo',
    name: 'Elo',
    debitRate: 1.85,
    installments: generateDefaultInstallments(3.80, 5.95, 1.15),
    active: true,
  },
  {
    id: 'hipercard',
    name: 'Hipercard',
    debitRate: 1.99,
    installments: generateDefaultInstallments(3.99, 6.15, 1.15),
    active: true,
  },
  {
    id: 'amex',
    name: 'American Express',
    debitRate: 2.20,
    installments: generateDefaultInstallments(4.20, 6.40, 1.15),
    active: true,
  },
];

export const DEFAULT_CARD_MACHINES: CardMachine[] = [
  {
    id: 'MACH-DEFAULT-01',
    name: 'Maquininha Principal (Loja)',
    model: 'Smart POS',
    isDefaultTotem: true,
    defaultBrandId: 'master',
    brands: DEFAULT_CARD_BRANDS,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: new Date().toISOString(),
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

export function listCardMachines(): CardMachine[] {
  const key = tenantScopedKey(STORAGE_KEY_CARD_MACHINES);
  const list = readJson<CardMachine[]>(key, DEFAULT_CARD_MACHINES);
  if (!Array.isArray(list) || list.length === 0) {
    return DEFAULT_CARD_MACHINES;
  }
  return list;
}

export function getCardMachineById(id: string): CardMachine | null {
  const machines = listCardMachines();
  return machines.find((m) => m.id === id) ?? null;
}

export function getDefaultTotemMachine(): CardMachine {
  const machines = listCardMachines();
  const def = machines.find((m) => m.isDefaultTotem && m.active) ?? machines.find((m) => m.active) ?? machines[0];
  return def || DEFAULT_CARD_MACHINES[0];
}

export function saveCardMachine(machine: CardMachine): CardMachine {
  const machines = listCardMachines();
  const now = new Date().toISOString();
  machine.updatedAt = now;

  const idx = machines.findIndex((m) => m.id === machine.id);
  if (idx >= 0) {
    machines[idx] = machine;
  } else {
    machines.push(machine);
  }

  // Se marcada como default totem, desmarca as outras
  if (machine.isDefaultTotem) {
    machines.forEach((m) => {
      if (m.id !== machine.id) m.isDefaultTotem = false;
    });
  }

  const key = tenantScopedKey(STORAGE_KEY_CARD_MACHINES);
  writeJson(key, machines);
  window.dispatchEvent(new Event(CARD_RATES_CHANGED_EVENT));

  // Sync com API se autenticado
  if (isNestAuthed()) {
    apiSaveCardMachines(machines).catch((e: unknown) => console.warn('Erro ao sincronizar maquininhas com a API', e));
  }

  return machine;
}

export function saveAllCardMachines(machines: CardMachine[]) {
  const key = tenantScopedKey(STORAGE_KEY_CARD_MACHINES);
  writeJson(key, machines);
  window.dispatchEvent(new Event(CARD_RATES_CHANGED_EVENT));

  if (isNestAuthed()) {
    apiSaveCardMachines(machines).catch((e: unknown) => console.warn('Erro ao sincronizar maquininhas com a API', e));
  }
}

export function deleteCardMachine(id: string): boolean {
  const machines = listCardMachines();
  if (machines.length <= 1) return false; // Impede apagar a única máquina
  const filtered = machines.filter((m) => m.id !== id);
  if (!filtered.some((m) => m.isDefaultTotem)) {
    filtered[0].isDefaultTotem = true;
  }
  saveAllCardMachines(filtered);
  return true;
}

/**
 * Retorna a taxa de cartão definida para o Totem no número de parcelas especificado (padrão: 12x).
 */
export function getTotemCardRate(parcels = 12): {
  machineId: string;
  machineName: string;
  brandId: string;
  brandName: string;
  parcels: number;
  rate: number;
} {
  const machine = getDefaultTotemMachine();
  const brand =
    machine.brands.find((b) => b.id === machine.defaultBrandId && b.active) ??
    machine.brands.find((b) => b.active) ??
    machine.brands[0];

  if (!brand) {
    return {
      machineId: machine.id,
      machineName: machine.name,
      brandId: 'master',
      brandName: 'Mastercard',
      parcels,
      rate: 16.80,
    };
  }

  const targetInst = brand.installments.find((it) => it.installment === parcels);
  const rate = targetInst
    ? targetInst.rate
    : (brand.installments[brand.installments.length - 1]?.rate ?? 16.80);

  return {
    machineId: machine.id,
    machineName: machine.name,
    brandId: brand.id,
    brandName: brand.name,
    parcels,
    rate,
  };
}

/**
 * Calcula o valor da parcela com a taxa da maquininha do Totem embutida
 */
export function calculateCardInstallment(price: number, parcels = 12): {
  parcels: number;
  parcelAmount: number;
  totalAdjusted: number;
  rate: number;
  brandName: string;
  formattedText: string;
} {
  const rateInfo = getTotemCardRate(parcels);
  const feeMultiplier = 1 + Math.max(0, rateInfo.rate) / 100;
  const totalAdjusted = Math.round(price * feeMultiplier * 100) / 100;
  const count = Math.max(1, parcels);
  const parcelAmount = Math.round((totalAdjusted / count) * 100) / 100;
  const formattedText = `${count} X R$ ${parcelAmount.toFixed(2).replace('.', ',')}`;

  return {
    parcels: count,
    parcelAmount,
    totalAdjusted,
    rate: rateInfo.rate,
    brandName: rateInfo.brandName,
    formattedText,
  };
}

/**
 * Calcula a taxa da maquininha e valor líquido a receber para uso no Financeiro / Caixa
 */
export function calculateCardNetReceived(
  grossAmount: number,
  brandId: string,
  parcels = 1,
  machineId?: string,
): {
  grossAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
  brandName: string;
} {
  const machines = listCardMachines();
  const machine = (machineId ? machines.find((m) => m.id === machineId) : null) ?? getDefaultTotemMachine();
  const brand = machine.brands.find((b) => b.id === brandId) ?? machine.brands[0];

  let feePercent = 0;
  if (parcels <= 0) {
    // Débito
    feePercent = brand.debitRate;
  } else {
    const inst = brand.installments.find((it) => it.installment === parcels);
    feePercent = inst ? inst.rate : (brand.installments[brand.installments.length - 1]?.rate ?? 0);
  }

  const feeAmount = Number(((grossAmount * feePercent) / 100).toFixed(2));
  const netAmount = Number((grossAmount - feeAmount).toFixed(2));

  return {
    grossAmount,
    feePercent,
    feeAmount,
    netAmount,
    brandName: brand.name,
  };
}

/**
 * Hidrata a configuração de maquininhas a partir do backend se logado
 */
export async function hydrateCardMachinesFromApi(): Promise<boolean> {
  if (!isNestAuthed()) return false;
  try {
    const data = await apiGetCardMachines().catch(() => null);
    if (Array.isArray(data) && data.length > 0) {
      const key = tenantScopedKey(STORAGE_KEY_CARD_MACHINES);
      writeJson(key, data);
      window.dispatchEvent(new Event(CARD_RATES_CHANGED_EVENT));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
