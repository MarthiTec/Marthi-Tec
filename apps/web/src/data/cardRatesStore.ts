import {getStoreCustomization} from './storeSegment';
import { readModuleState, loadModuleState, saveModuleState } from './moduleState';
/**
 * Registro de Maquininhas de Cartão e Taxas por Bandeira / Parcelamento.
 *
 * Arquitetura:
 *   - Cada maquininha possui N bandeiras (Mastercard, Visa, Elo, Hipercard, Amex, etc.).
 *   - Cada bandeira possui taxa de débito e taxas por parcela (1x, 2x, 3x ... até Nx).
 *   - Uma maquininha e bandeira são definidas como padrão para o Totem (ex.: Master em 12x).
 *   - As taxas são compartilhadas com o Totem e com o Financeiro para cálculo de recebimento líquido.
 */


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

export const CARD_RATES_CHANGED_EVENT = 'marthi-card-rates-changed';

/** Empty editable drafts: each store supplies its own negotiated rates. */
export const DEFAULT_CARD_BRANDS: CardBrand[] = ['Mastercard','Visa','Elo','Hipercard','American Express'].map((name,index)=>({
  id:['master','visa','elo','hipercard','amex'][index],name,debitRate:0,active:true,
  installments:Array.from({length:18},(_,i)=>({installment:i+1,rate:0})),
}));
export const DEFAULT_CARD_MACHINES: CardMachine[] = [{id:'',name:'',isDefaultTotem:false,defaultBrandId:'master',
 brands:DEFAULT_CARD_BRANDS,active:true,createdAt:'',updatedAt:''}];

export function listCardMachines(): CardMachine[] {
  return readModuleState<CardMachine[]>('card-rates', []);
}

export function getCardMachineById(id: string): CardMachine | null {
  const machines = listCardMachines();
  return machines.find((m) => m.id === id) ?? null;
}

export function getDefaultTotemMachine(): CardMachine {
  const machines = listCardMachines();
  const def = machines.find((m) => m.isDefaultTotem && m.active) ?? machines.find((m) => m.active) ?? machines[0];
  return def || {id:'',name:'Sem maquininha configurada',isDefaultTotem:false,defaultBrandId:'',brands:[],active:false,createdAt:'',updatedAt:''};
}

export async function saveCardMachine(machine: CardMachine): Promise<CardMachine> {
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

  await saveAllCardMachines(machines);

  return machine;
}

export async function saveAllCardMachines(machines: CardMachine[]) {
  await saveModuleState('card-rates', machines);
  window.dispatchEvent(new Event(CARD_RATES_CHANGED_EVENT));
}

export async function deleteCardMachine(id: string): Promise<boolean> {
  const machines = listCardMachines();
  if (machines.length <= 1) return false; // Impede apagar a única máquina
  const filtered = machines.filter((m) => m.id !== id);
  if (!filtered.some((m) => m.isDefaultTotem)) {
    filtered[0].isDefaultTotem = true;
  }
  await saveAllCardMachines(filtered);
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
  if (!getStoreCustomization().showCardRates) return {machineId:'',machineName:'Taxas desativadas',brandId:'',brandName:'Taxas desativadas',parcels,rate:0};
  const brand =
    machine.brands.find((b) => b.id === machine.defaultBrandId && b.active) ??
    machine.brands.find((b) => b.active) ??
    machine.brands[0];

  if (!brand) {
    return {
      machineId: machine.id,
      machineName: machine.name,
      brandId: '',
      brandName: 'Sem taxa configurada',
      parcels,
      rate: 0,
    };
  }

  const targetInst = brand.installments.find((it) => it.installment === parcels);
  const rate = targetInst
    ? targetInst.rate
    : (brand?.installments[brand.installments.length - 1]?.rate ?? 0);

  return {
    machineId: machine.id,
    machineName: machine.name,
    brandId: brand.id,
    brandName: brand?.name ?? 'Sem taxa configurada',
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
    feePercent = brand?.debitRate ?? 0;
  } else {
    const inst = brand?.installments.find((it) => it.installment === parcels);
    feePercent = inst ? inst.rate : (brand?.installments[brand.installments.length - 1]?.rate ?? 0);
  }

  const feeAmount = Number(((grossAmount * feePercent) / 100).toFixed(2));
  const netAmount = Number((grossAmount - feeAmount).toFixed(2));

  return {
    grossAmount,
    feePercent,
    feeAmount,
    netAmount,
    brandName: brand?.name ?? 'Sem taxa configurada',
  };
}

/**
 * Hidrata a configuração de maquininhas a partir do backend se logado
 */
export async function hydrateCardMachinesFromApi(): Promise<boolean> {
  await loadModuleState<CardMachine[]>('card-rates', []);
  window.dispatchEvent(new Event(CARD_RATES_CHANGED_EVENT));
  return true;
}
