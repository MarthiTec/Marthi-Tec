import { nestDelete, nestGet, nestPatch, nestPost } from './nestClient';

/** Orçamento de manutenção: catálogo de serviços (painel), solicitações (fila da OS) e link do cliente. */

export type RepairOption = { id?: string; name: string; price: number | null; cost?: number | null; stockItemId?: string | null; active?: boolean };
export type RepairService = {
  id: string;
  /** Aparelho do cadastro de produtos (preenche marca e modelo). */
  productId: string | null;
  brand: string;
  model: string;
  category: string;
  name: string;
  description: string;
  /** null = valor sob avaliação. */
  price: number | null;
  /** Custo para a loja (nunca aparece para o cliente). */
  cost: number | null;
  estimatedMinutes: number | null;
  active: boolean;
  internalNotes: string;
  options: RepairOption[];
  sort: number;
  updatedAt?: string;
};
export type RepairServiceInput = Omit<RepairService, 'id' | 'updatedAt'>;

export type RepairStatus = 'pending' | 'awaiting_device' | 'evaluating' | 'awaiting_approval' | 'converted' | 'cancelled';
export const REPAIR_STATUS: Array<{ value: RepairStatus; label: string; tone: string }> = [
  { value: 'pending', label: 'Aguardando análise', tone: '#d97706' },
  { value: 'awaiting_device', label: 'Aguardando aparelho', tone: '#2563eb' },
  { value: 'evaluating', label: 'Em avaliação presencial', tone: '#7c3aed' },
  { value: 'awaiting_approval', label: 'Aguardando aprovação', tone: '#0891b2' },
  { value: 'converted', label: 'Convertida em OS', tone: '#16a34a' },
  { value: 'cancelled', label: 'Cancelada', tone: '#64748b' },
];

export type RepairItem = { serviceId: string | null; name: string; category?: string; optionId?: string | null; optionName?: string; stockItemId?: string | null; price: number | null; cost?: number | null; estimatedMinutes?: number | null };
export type RepairEvaluation = {
  customer?: { name?: string; phone?: string; document?: string; address?: string };
  device?: { color?: string; capacity?: string; imei?: string; physicalState?: string; screen?: string; body?: string; accessories?: string; techNotes?: string };
  diagnosis?: { reported?: string; found?: string; risks?: string };
  items?: RepairItem[];
  finalTotal?: number | null;
  eta?: string;
  etaHistory?: Array<{ at: string; by: string; from: string; to: string }>;
  approval?: { method: string; note: string; at: string; by: string };
};
export type RepairRequest = {
  id: string;
  protocol: string;
  status: RepairStatus;
  statusLabel: string;
  origin: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  brand: string;
  model: string;
  items: RepairItem[];
  estimatedTotal: number;
  hasEvaluation: boolean;
  /** Cliente não sabe o defeito: pediu só a avaliação técnica. */
  wantsDiagnosis: boolean;
  description: string;
  evaluation: RepairEvaluation;
  history: Array<{ at: string; by: string; action: string; from?: string; to?: string; note?: string }>;
  workOrderId: string | null;
  convertedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const apiListRepairServices = (productId?: string) => nestGet<RepairService[]>(`/repair-services${productId ? `?productId=${encodeURIComponent(productId)}` : ''}`);
export const apiCreateRepairService = (body: RepairServiceInput) => nestPost<RepairService>('/repair-services', body);
export const apiUpdateRepairService = (id: string, body: RepairServiceInput) => nestPatch<RepairService>(`/repair-services/${encodeURIComponent(id)}`, body);
export const apiDeleteRepairService = (id: string) => nestDelete<{ ok: true }>(`/repair-services/${encodeURIComponent(id)}`);

export const apiListRepairRequests = (params: { status?: string; q?: string } = {}) => {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.q) query.set('q', params.q);
  return nestGet<RepairRequest[]>(`/repair-requests${query.toString() ? `?${query}` : ''}`);
};
export const apiRepairRequestsSummary = () => nestGet<{ counts: Record<RepairStatus, number>; pending: number }>('/repair-requests/summary');
export const apiUpdateRepairRequest = (id: string, body: { status?: RepairStatus; note?: string; evaluation?: RepairEvaluation }) =>
  nestPatch<RepairRequest>(`/repair-requests/${encodeURIComponent(id)}`, body);
export const apiConvertRepairRequest = (id: string, body: { approvalMethod: 'presencial' | 'whatsapp' | 'ligacao' | 'assinatura'; approvalNote: string }) =>
  nestPost<{ request: RepairRequest; workOrderId: string }>(`/repair-requests/${encodeURIComponent(id)}/convert`, body);

/* Link do cliente (sem login). */
export type PublicRepairService = { id: string; category: string; name: string; description: string; price: number | null; estimatedMinutes: number | null; options: Array<{ id: string; name: string; price: number | null }> };
const pub = (token: string) => `/public/sales-catalogs/${encodeURIComponent(token)}/repairs`;
export const apiPublicRepairBrands = (token: string) => nestGet<{ brands: Array<{ brand: string; models: string[] }> }>(pub(token));
export const apiPublicRepairServices = (token: string, brand: string, model: string) =>
  nestGet<PublicRepairService[]>(`${pub(token)}/services?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`);
export const apiPublicSendRepair = (
  token: string,
  body: { requestKey: string; brand: string; model: string; items: Array<{ serviceId: string; optionId?: string | null }>; diagnosis?: boolean; description: string; customer: { name: string; phone: string }; website?: string },
) => nestPost<{ protocol: string; estimatedTotal: number; hasEvaluation: boolean; items: RepairItem[] }>(pub(token), body);
export type RepairTracking = { protocol: string; status: RepairStatus; statusLabel: string; device: string; items: string[]; createdAt: string; workOrder: { status: string; statusLabel: string; estimatedReadyAt: string } | null };
export const apiPublicTrackRepair = (token: string, protocol: string, phone: string) =>
  nestGet<RepairTracking>(`${pub(token)}/track?protocol=${encodeURIComponent(protocol)}&phone=${encodeURIComponent(phone)}`);

/** "2h", "45 min", "1 dia"… */
export function repairDuration(minutes: number | null | undefined) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}
export const repairMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
