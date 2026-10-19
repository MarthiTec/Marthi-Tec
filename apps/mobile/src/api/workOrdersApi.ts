import { apiRequest } from './client';

export type WorkOrderStatus =
  | 'backlog'
  | 'open'
  | 'diagnosis'
  | 'waiting'
  | 'progress'
  | 'reproved'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export const OS_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  backlog: 'Backlog',
  open: 'Aberta',
  diagnosis: 'Diagnóstico',
  waiting: 'Aguardando',
  progress: 'Em serviço',
  reproved: 'Reprovada',
  ready: 'Pronta',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
};

export const OS_FILTERS: Array<WorkOrderStatus | 'all'> = [
  'all',
  'open',
  'diagnosis',
  'waiting',
  'progress',
  'reproved',
  'ready',
  'delivered',
  'cancelled',
];

/** Transições permitidas (espelho da API). */
export const OS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  backlog: ['open', 'diagnosis', 'waiting', 'progress', 'cancelled'],
  open: ['diagnosis', 'waiting', 'progress', 'cancelled'],
  diagnosis: ['waiting', 'progress', 'reproved', 'ready', 'cancelled'],
  waiting: ['diagnosis', 'progress', 'cancelled'],
  progress: ['waiting', 'ready', 'reproved', 'cancelled'],
  reproved: ['diagnosis', 'progress', 'cancelled'],
  ready: ['delivered', 'progress', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export type WorkOrderHistoryEntry = {
  id: string;
  authorName?: string;
  field?: string;
  action?: string;
  fromValue?: string;
  toValue?: string;
  note?: string;
  createdAt?: string;
};

export type WorkOrder = {
  id: string;
  customerName: string;
  customerPhone: string;
  itemName: string;
  itemBrand: string;
  itemModel: string;
  itemRef: string;
  defect: string;
  diagnosis: string;
  notes: string;
  techNotes?: string;
  technician: string;
  priority: string;
  status: WorkOrderStatus | string;
  labor: number;
  parts: number;
  history: WorkOrderHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
};

type Auth = { token: string; storeId: string };

export async function listWorkOrders(
  opts: Auth & { status?: string; q?: string },
): Promise<WorkOrder[]> {
  const params = new URLSearchParams();
  if (opts.status && opts.status !== 'all') params.set('status', opts.status);
  if (opts.q?.trim()) params.set('q', opts.q.trim());
  const qs = params.toString();
  return apiRequest(`/work-orders${qs ? `?${qs}` : ''}`, { token: opts.token, storeId: opts.storeId });
}

export async function getWorkOrder(opts: Auth & { id: string }): Promise<WorkOrder> {
  return apiRequest(`/work-orders/${encodeURIComponent(opts.id)}`, {
    token: opts.token,
    storeId: opts.storeId,
  });
}

export async function updateWorkOrderStatus(
  opts: Auth & { id: string; status: WorkOrderStatus; note?: string },
): Promise<WorkOrder> {
  return apiRequest(`/work-orders/${encodeURIComponent(opts.id)}/status`, {
    method: 'POST',
    token: opts.token,
    storeId: opts.storeId,
    body: { status: opts.status, note: opts.note ?? '' },
  });
}
