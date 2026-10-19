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
  /** Aparelhos compatíveis marcados direto na peça. */
  devices: Array<{ brand: string; model: string }>;
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

/* ── Aparelhos compatíveis ─────────────────────────────────────────────── */
export type RepairPartDevice = { brand: string; model: string };
export const apiSetRepairPartDevices = (id: string, devices: RepairPartDevice[]) => nestPut<RepairPart>(`/repair-parts/${id}/devices`, { devices });

/* ── Encomendas de peça (OS sem a peça no estoque) ─────────────────────── */
export type PartOrderStatus = 'ordered' | 'arrived' | 'cancelled';
export type PartOrder = {
  id: string;
  workOrderId: string | null;
  stockId: string | null;
  partName: string;
  description: string;
  qty: number;
  unitCost: number | null;
  supplierId: string | null;
  supplierName: string;
  expectedAt: string | null;
  deviceAtStore: boolean;
  status: PartOrderStatus;
  late: boolean;
  notes: string;
  customerName: string;
  customerPhone: string;
  itemName: string;
  workOrderStatus: string | null;
  createdBy: string;
  createdAt: string;
  arrivedAt: string | null;
  arrivedBy: string;
};
/** Encomenda escolhida na abertura da OS (sai junto com a OS). */
export type PartOrderInput = {
  stockId: string | null;
  description: string;
  qty: number;
  unitCost: number | null;
  supplierId: string | null;
  supplierName: string;
  expectedAt: string | null;
  deviceAtStore: boolean;
  notes: string;
};
export const PART_ORDER_STATUS: Record<PartOrderStatus, string> = { ordered: 'Encomendada', arrived: 'Chegou', cancelled: 'Cancelada' };
export const apiListPartOrders = (query?: { status?: PartOrderStatus; workOrderId?: string }) => {
  const params = new URLSearchParams();
  if (query?.status) params.set('status', query.status);
  if (query?.workOrderId) params.set('workOrderId', query.workOrderId);
  const qs = params.toString();
  return nestGet<PartOrder[]>(`/repair-part-orders${qs ? `?${qs}` : ''}`);
};
export const apiCreatePartOrder = (workOrderId: string | null, order: PartOrderInput) => nestPost<PartOrder>('/repair-part-orders', { workOrderId, order });
export const apiUpdatePartOrder = (id: string, body: { expectedAt?: string | null; deviceAtStore?: boolean; notes?: string; status?: 'cancelled' }) => nestPatch<PartOrder>(`/repair-part-orders/${id}`, body);
export const apiArrivePartOrder = (id: string, body: { unitCost: number; payment: 'paid' | 'pending' | 'none'; dueDate?: string; useOnOrder?: boolean }) =>
  nestPost<{ order: PartOrder; usedOn: string | null }>(`/repair-part-orders/${id}/arrive`, body);

/* ── Relatório ─────────────────────────────────────────────────────────── */
export type PartsReport = {
  from: string;
  to: string;
  stock: { parts: number; units: number; value: number; low: Array<{ id: string; name: string; sku: string; qty: number; minQty: number; cost: number; missing: number }> };
  usage: Array<{ id: string; name: string; sku: string; qty: number; cost: number; orders: number }>;
  entries: Array<{ id: string; name: string; sku: string; qty: number; cost: number }>;
  orders: { pending: number; late: number; list: PartOrder[] };
};
export const apiPartsReport = (from: string, to: string) => nestGet<PartsReport>(`/repair-part-orders/report?from=${from}&to=${to}`);
