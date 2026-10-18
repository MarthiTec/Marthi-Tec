import { nestGet, nestPatch, nestPost, nestPut } from './nestClient';

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
  scope: 'store' | 'workshop';
  images: string[];
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
export const apiUpdateRepairPart = (id: string, body: { name?: string; images?: string[]; minQty?: number; cost?: number; price?: number }) => nestPatch<RepairPart>(`/repair-parts/${id}`, body);
export type RepairPartInput = { name: string; sku?: string; category?: string; brand?: string; cost: number; price: number; minQty: number; images: string[] };
export const apiCreateRepairPart = (body: RepairPartInput) => nestPost<RepairPart>('/repair-parts', body);
export type RepairPartEntry = { qty: number; unitCost: number; supplierId?: string | null; entryDate?: string; notes?: string; payment: 'paid' | 'pending' | 'none'; dueDate?: string };
/** Entrada de peças pela oficina (soma o saldo, custo médio e lança a compra no financeiro). */
export const apiRepairPartEntry = (id: string, body: RepairPartEntry) => nestPost<RepairPart>(`/repair-parts/${id}/entries`, body);
export const apiSetRepairPartLinks = (id: string, links: Array<{ serviceId: string; optionId: string }>) => nestPut<RepairPart>(`/repair-parts/${id}/links`, { links });
