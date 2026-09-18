const STORAGE_KEY = 'marthi.os.v1';

export type WorkOrderStatus =
  | 'open'
  | 'diagnosis'
  | 'waiting'
  | 'progress'
  | 'ready'
  | 'delivered'
  | 'cancelled';

export type WorkOrderPriority = 'low' | 'normal' | 'high';

export type WorkOrderLineKind = 'part' | 'labor';

export type AssetDisposition = 'customer' | 'purchased' | 'scrapped';

export type WorkOrderLine = {
  id: string;
  stockId: string;
  name: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
  kind: WorkOrderLineKind;
  financeId?: string;
};

export type WorkOrder = {
  id: string;
  customerName: string;
  customerPhone: string;
  itemName: string;
  itemRef: string;
  defect: string;
  notes: string;
  technician: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  labor: number;
  /** Derived from part lines when present; kept for legacy totals. */
  parts: number;
  lines: WorkOrderLine[];
  assetDisposition: AssetDisposition;
  purchaseCost?: number;
  purchaseAt?: string;
  purchaseStockId?: string;
  purchaseFinanceId?: string;
  revenueFinanceId?: string;
  createdAt: string;
  updatedAt: string;
};

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  open: 'Aberta',
  diagnosis: 'Diagnóstico',
  waiting: 'Aguardando',
  progress: 'Em serviço',
  ready: 'Pronta',
  delivered: 'Entregue',
  cancelled: 'Cancelada',
};

export const BOARD_COLUMNS: WorkOrderStatus[] = [
  'open',
  'diagnosis',
  'waiting',
  'progress',
  'ready',
];

export const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
};

export const DISPOSITION_LABEL: Record<AssetDisposition, string> = {
  customer: 'Permanece do cliente',
  purchased: 'Comprado para estoque',
  scrapped: 'Sucata',
};

function uid() {
  return `OS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function lineUid() {
  return `OL-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export function partsTotalFromLines(lines: WorkOrderLine[]) {
  return lines
    .filter((line) => line.kind === 'part')
    .reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

function normalizeWorkOrder(raw: Partial<WorkOrder> & Pick<WorkOrder, 'id'>): WorkOrder {
  const lines = Array.isArray(raw.lines) ? raw.lines : [];
  const labor = Number(raw.labor) || 0;
  const parts =
    lines.some((line) => line.kind === 'part')
      ? partsTotalFromLines(lines)
      : Number(raw.parts) || 0;
  return {
    id: raw.id,
    customerName: raw.customerName ?? '',
    customerPhone: raw.customerPhone ?? '',
    itemName: raw.itemName ?? '',
    itemRef: raw.itemRef ?? '',
    defect: raw.defect ?? '',
    notes: raw.notes ?? '',
    technician: raw.technician ?? '',
    priority: raw.priority ?? 'normal',
    status: raw.status ?? 'open',
    labor,
    parts,
    lines,
    assetDisposition: raw.assetDisposition ?? 'customer',
    purchaseCost: raw.purchaseCost,
    purchaseAt: raw.purchaseAt,
    purchaseStockId: raw.purchaseStockId,
    purchaseFinanceId: raw.purchaseFinanceId,
    revenueFinanceId: raw.revenueFinanceId,
    createdAt: raw.createdAt ?? now(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now(),
  };
}

function seed(): WorkOrder[] {
  const created = daysAgo(1);
  return [
    normalizeWorkOrder({
      id: uid(),
      customerName: 'Ana Souza',
      customerPhone: '(24) 99811-2200',
      itemName: 'iPhone 15',
      itemRef: 'IMEI 3598 4412',
      defect: 'Tela trincada e toque falhando no canto.',
      notes: 'Cliente deixou a capa e pediu orçamento antes de autorizar.',
      technician: 'Ana Costa',
      priority: 'high',
      status: 'diagnosis',
      labor: 80,
      parts: 620,
      lines: [],
      assetDisposition: 'customer',
      createdAt: created,
      updatedAt: created,
    }),
    normalizeWorkOrder({
      id: uid(),
      customerName: 'Carlos Lima',
      customerPhone: '(24) 99200-1188',
      itemName: 'Notebook Dell',
      itemRef: 'S/N 7XK22',
      defect: 'Não liga. Só o LED da fonte acende.',
      notes: '',
      technician: 'Marthi Teste',
      priority: 'normal',
      status: 'progress',
      labor: 150,
      parts: 0,
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(3),
      updatedAt: now(),
    }),
    normalizeWorkOrder({
      id: uid(),
      customerName: 'Fernanda Dias',
      customerPhone: '(24) 98810-4411',
      itemName: 'Óculos de grau',
      itemRef: 'OS armação 882',
      defect: 'Troca de lentes e ajuste da haste.',
      notes: 'Retirada combinada para sexta.',
      technician: 'Ana Costa',
      priority: 'low',
      status: 'ready',
      labor: 40,
      parts: 280,
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(5),
      updatedAt: now(),
    }),
  ];
}

function load(): WorkOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const items = seed();
      save(items);
      return items;
    }
    const parsed = JSON.parse(raw) as Partial<WorkOrder>[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const items = seed();
      save(items);
      return items;
    }
    return parsed.map((item) => normalizeWorkOrder(item as Partial<WorkOrder> & Pick<WorkOrder, 'id'>));
  } catch {
    const items = seed();
    save(items);
    return items;
  }
}

function save(items: WorkOrder[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function listWorkOrders() {
  return load().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWorkOrder(id: string) {
  return load().find((item) => item.id === id) ?? null;
}

export function createWorkOrder(
  input: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'lines' | 'assetDisposition'> & {
    status?: WorkOrderStatus;
    lines?: WorkOrderLine[];
    assetDisposition?: AssetDisposition;
  },
) {
  const stamp = now();
  const lines = input.lines ?? [];
  const order = normalizeWorkOrder({
    ...input,
    id: uid(),
    status: input.status ?? 'open',
    lines,
    parts: lines.length ? partsTotalFromLines(lines) : input.parts,
    assetDisposition: input.assetDisposition ?? 'customer',
    createdAt: stamp,
    updatedAt: stamp,
  });
  const next = [order, ...load()];
  save(next);
  return order;
}

export function updateWorkOrder(id: string, patch: Partial<Omit<WorkOrder, 'id' | 'createdAt'>>) {
  const next = load().map((item) => {
    if (item.id !== id) return item;
    const merged = normalizeWorkOrder({ ...item, ...patch, id: item.id, createdAt: item.createdAt });
    return { ...merged, updatedAt: now() };
  });
  save(next);
  return next.find((item) => item.id === id) ?? null;
}

export function workOrderTotal(order: Pick<WorkOrder, 'labor' | 'parts' | 'lines'>) {
  const parts =
    order.lines?.some((line) => line.kind === 'part')
      ? partsTotalFromLines(order.lines)
      : order.parts;
  return order.labor + parts;
}

export function newWorkOrderLineId() {
  return lineUid();
}
