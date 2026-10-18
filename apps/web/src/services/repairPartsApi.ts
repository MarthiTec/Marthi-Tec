import { nestGet, nestPatch, nestPut } from './nestClient';

/** Peças de manutenção: itens do estoque ligados às qualidades do catálogo de manutenções. */

export type RepairPartLink = { serviceId: string; serviceName: string; optionId: string; optionName: string; brand: string; model: string; price: number | null; serviceActive: boolean };
export type RepairPartStatus = 'ok' | 'low' | 'out';
export type RepairPart = {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  kind: string;
  qty: number;
  minQty: number;
  cost: number;
  price: number;
  active: boolean;
  status: RepairPartStatus;
  links: RepairPartLink[];
};

/** Peça escolhida para sair do estoque junto com a OS. */
export type StockPartChoice = {
  stockId: string;
  qty: number;
  /** 0 = incluída no valor do serviço. */
  unitPrice: number;
  improvised: boolean;
  note: string;
};

export const REPAIR_PART_STATUS: Record<RepairPartStatus, string> = { ok: 'Em estoque', low: 'Estoque baixo', out: 'Sem estoque' };

export const apiListRepairParts = (device?: { brand: string; model: string }) =>
  nestGet<RepairPart[]>(`/repair-parts${device?.model ? `?brand=${encodeURIComponent(device.brand)}&model=${encodeURIComponent(device.model)}` : ''}`);
export const apiUpdateRepairPart = (id: string, body: { minQty?: number; cost?: number; price?: number }) => nestPatch<RepairPart>(`/repair-parts/${id}`, body);
export const apiSetRepairPartLinks = (id: string, links: Array<{ serviceId: string; optionId: string }>) => nestPut<RepairPart>(`/repair-parts/${id}/links`, { links });
