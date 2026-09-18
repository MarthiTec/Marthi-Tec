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
  parts: number;
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

function uid() {
  return `OS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function seed(): WorkOrder[] {
  const created = daysAgo(1);
  return [
    {
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
      createdAt: created,
      updatedAt: created,
    },
    {
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
      createdAt: daysAgo(3),
      updatedAt: now(),
    },
    {
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
      createdAt: daysAgo(5),
      updatedAt: now(),
    },
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
    const parsed = JSON.parse(raw) as WorkOrder[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const items = seed();
      save(items);
      return items;
    }
    return parsed;
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
  input: Omit<WorkOrder, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
    status?: WorkOrderStatus;
  },
) {
  const stamp = now();
  const order: WorkOrder = {
    ...input,
    id: uid(),
    status: input.status ?? 'open',
    createdAt: stamp,
    updatedAt: stamp,
  };
  const next = [order, ...load()];
  save(next);
  return order;
}

export function updateWorkOrder(id: string, patch: Partial<Omit<WorkOrder, 'id' | 'createdAt'>>) {
  const next = load().map((item) =>
    item.id === id ? { ...item, ...patch, updatedAt: now() } : item,
  );
  save(next);
  return next.find((item) => item.id === id) ?? null;
}

export function workOrderTotal(order: Pick<WorkOrder, 'labor' | 'parts'>) {
  return order.labor + order.parts;
}
