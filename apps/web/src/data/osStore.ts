import {storeScopedKey} from './storeCache';
import {
  apiAddPhoto,
  apiClearSignature,
  apiCreateWorkOrder,
  apiPatchChecklist,
  apiQuoteApprove,
  apiQuoteDraft,
  apiQuoteReject,
  apiQuoteReopen,
  apiQuoteSend,
  apiRemovePhoto,
  apiSignWorkOrder,
  apiUpdateWorkOrder,
} from '../services/erpApi';
import { isNestAuthed, NestApiError } from '../services/nestClient';
import { listEmployees, EMPLOYEE_ROLE_LABEL } from './erpRegistry';
import {
  getActiveStoreId,
  STORE_CONTEXT_CHANGED_EVENT,
} from './multiStoreStore';

export const OS_STATE_EVENT = 'marthi-os-state';

export function getOsStorageKey(): string {
  try {
    const storeId = getActiveStoreId();
    if (storeId) {
      return `marthi.os.v2:${storeId}`;
    }
  } catch {
    /* ignore */
  }
  return 'marthi.os.v2';
}

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

export type WorkOrderPaymentStatus = 'pending' | 'partially_paid' | 'paid' | 'cancelled';

export const PAYMENT_STATUS_LABEL: Record<WorkOrderPaymentStatus, string> = {
  pending: 'Pendente',
  partially_paid: 'Parcialmente pago',
  paid: 'Pago',
  cancelled: 'Cancelado',
};

export type WorkOrderPaymentEntry = {
  id: string;
  method: string;
  amount: number;
  receivedAmount?: number;
  change?: number;
  discount?: number;
  discountMode?: 'money' | 'percent';
  surcharge?: number;
  surchargeMode?: 'money' | 'percent';
  note?: string;
  paidAt: string;
  cashierOperator?: string;
};

export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent';

export type WorkOrderLineKind = 'part' | 'labor';

export type AssetDisposition = 'customer' | 'purchased' | 'scrapped';

/** Ciclo do orçamento apresentado ao cliente. */
export type QuoteStatus = 'none' | 'draft' | 'sent' | 'approved' | 'rejected';

export type WorkOrderPhotoKind = 'entry' | 'exit' | 'other';

export type WorkOrderPhoto = {
  id: string;
  kind: WorkOrderPhotoKind;
  /** data URL JPEG comprimida (MVP localStorage). */
  dataUrl: string;
  caption: string;
  createdAt: string;
};

/** Comentário no chamado estilo Jira. */
export type WorkOrderComment = {
  id: string;
  authorName: string;
  authorPhoto?: string;
  authorRole?: string;
  content: string;
  kind: 'internal' | 'customer' | 'system';
  createdAt: string;
};

/** Registro de histórico / auditoria estilo Jira. */
export type WorkOrderHistoryEntry = {
  id: string;
  authorName: string;
  authorPhoto?: string;
  authorRole?: string;
  field: string;
  action: 'alterou' | 'adicionou' | 'atualizou' | 'removeu';
  fromValue?: string;
  toValue: string;
  createdAt: string;
};

/** Registro de tempo / worklog estilo Jira. */
export type WorkOrderWorklog = {
  id: string;
  technicianName: string;
  technicianPhoto?: string;
  technicianRole?: string;
  minutesSpent: number;
  timeSpentFormatted: string;
  description: string;
  startedAt?: string;
  createdAt: string;
};

/** Arquivo / documento anexado à OS. */
export type WorkOrderAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  createdAt: string;
  uploaderName: string;
};

/** Operação / Sprint mensal da oficina. */
export type WorkOrderOperation = {
  id: string;
  code: string;
  title: string;
  status: 'active' | 'completed' | 'planned';
  startDate: string;
  endDate: string;
  completedAt?: string;
  masterOperatorName?: string;
  targetOrdersCount: number;
};

/** Cadastro de técnico com foto e especialidade. */
export type TechnicianInfo = {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
  specialty: string;
  active: boolean;
};

/** Resultado de cada item do checklist de entrada. */
export type ChecklistMark = 'unchecked' | 'ok' | 'fail' | 'na';

export type WorkOrderChecklistItem = {
  id: string;
  label: string;
  mark: ChecklistMark;
  note: string;
};

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
  operationId?: string;
  customerName: string;
  customerPhone: string;
  customerDocument: string;
  customerEmail: string;
  itemName: string;
  itemBrand: string;
  itemModel: string;
  itemColor: string;
  itemRef: string;
  /** Senha / padrão / PIN do aparelho (uso interno da oficina). */
  devicePassword: string;
  /** Acessórios deixados com o equipamento. */
  accessories: string;
  /** Estado estético / condições na entrada. */
  conditionOnEntry: string;
  defect: string;
  diagnosis: string;
  notes: string;
  /** Observações do técnico / bancada técnica. */
  techNotes?: string;
  /** Previsão de pronto (ISO date ou texto curto). */
  estimatedReadyAt: string;
  technician: string;
  /** Vendedor responsável (cadastro ERP). */
  sellerId: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  labor: number;
  /** Derived from part lines when present; kept for legacy totals. */
  parts: number;
  lines: WorkOrderLine[];
  photos: WorkOrderPhoto[];
  comments?: WorkOrderComment[];
  attachments?: WorkOrderAttachment[];
  history?: WorkOrderHistoryEntry[];
  worklogs?: WorkOrderWorklog[];
  /** Minutos gastos em bancada / cronômetro */
  spentMinutes?: number;
  isTimerRunning?: boolean;
  timerStartedAt?: string;
  /** Checklist padronizado (entrada / inspeção). */
  checklist: WorkOrderChecklistItem[];
  /** Assinatura digital do cliente (data URL PNG). */
  customerSignature: string;
  customerSignedAt?: string;
  customerSignedName: string;
  assetDisposition: AssetDisposition;
  quoteStatus: QuoteStatus;
  /** Texto livre do orçamento (escopo / condições). */
  quoteNotes: string;
  quoteValidUntil: string;
  quoteSentAt?: string;
  quoteDecidedAt?: string;
  purchaseCost?: number;
  purchaseAt?: string;
  purchaseStockId?: string;
  purchaseFinanceId?: string;
  revenueFinanceId?: string;
  /** Início efetivo do serviço na bancada. */
  progressStartedAt?: string;
  /** Horário de saída / entrega ao cliente. */
  deliveredAt?: string;
  /** Status do pagamento (recebimento). */
  paymentStatus?: WorkOrderPaymentStatus;
  /** Valor total já pago/recebido. */
  paidAmount?: number;
  /** Desconto concedido no fechamento (valor ou percentual). */
  discount?: number;
  discountMode?: 'money' | 'percent';
  /** Acréscimo no fechamento (valor ou percentual). */
  surcharge?: number;
  surchargeMode?: 'money' | 'percent';
  /** Valor final líquido a pagar. */
  finalAmount?: number;
  /** Histórico detalhado de pagamentos recebidos nesta OS. */
  payments?: WorkOrderPaymentEntry[];
  createdAt: string;
  updatedAt: string;
};

let memoryOrders: WorkOrder[] | null = null;

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
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

export const BOARD_COLUMNS: WorkOrderStatus[] = [
  'open',
  'diagnosis',
  'waiting',
  'progress',
  'reproved',
  'ready',
];

export const BACKLOG_STATUS: WorkOrderStatus = 'backlog';

export const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export function listTechnicianInfos(): TechnicianInfo[] {
  const map = new Map<string, TechnicianInfo>();
  try {
    const employees = listEmployees().filter((e) => e.active);
    for (const e of employees) {
      map.set(e.name.toLowerCase(), {
        id: e.id,
        name: e.name,
        role: EMPLOYEE_ROLE_LABEL[e.role] ?? 'Técnico',
        avatarUrl: undefined,
        specialty: e.role === 'admin' ? 'Administração' : 'Bancada Técnica',
        active: e.active,
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const orders = listWorkOrders();
    for (const o of orders) {
      const name = (o.technician || '').trim();
      if (name && !map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), {
          id: `tech-${name.toLowerCase().replace(/\s+/g, '-')}`,
          name,
          role: 'Técnico Responsável',
          avatarUrl: undefined,
          specialty: 'Bancada Técnica',
          active: true,
        });
      }
    }
  } catch {
    /* ignore */
  }

  return [...map.values()];
}

export const TECHNICIANS_LIST: TechnicianInfo[] = new Proxy([] as TechnicianInfo[], {
  get(target, prop, receiver) {
    const current = listTechnicianInfos();
    if (prop === 'length') return current.length;
    if (typeof prop === 'string' && !isNaN(Number(prop))) {
      return current[Number(prop)];
    }
    const val = (current as any)[prop];
    if (typeof val === 'function') {
      return val.bind(current);
    }
    return Reflect.get(target, prop, receiver);
  },
});

export function getTechnicianByName(name?: string | null): TechnicianInfo | undefined {
  if (!name) return undefined;
  return TECHNICIANS_LIST.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

const OPERATIONS_STORAGE_KEY = 'marthi.os.operations.v1';

export function createDefaultOperation(): WorkOrderOperation {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const firstDay = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).toISOString().split('T')[0];

  return {
    id: `op-${year}-${month}`,
    code: `OP-${year}-${month}`,
    title: `Operação ${capitalized} ${year}`,
    status: 'active',
    startDate: firstDay,
    endDate: lastDay,
    masterOperatorName: 'Operador',
    targetOrdersCount: 20,
  };
}

export const DEFAULT_OPERATIONS: WorkOrderOperation[] = [];

export function listOperations(): WorkOrderOperation[] {
  try {
    const raw = localStorage.getItem(storeScopedKey(OPERATIONS_STORAGE_KEY));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clean = parsed.filter(
          (op: WorkOrderOperation) =>
            op.id !== 'op-2026-08' &&
            op.id !== 'op-2026-07' &&
            op.masterOperatorName !== 'Marthi Master',
        );
        if (clean.length > 0) return clean;
      }
    }
  } catch {
    /* ignore */
  }
  const defaultOp = createDefaultOperation();
  saveOperations([defaultOp]);
  return [defaultOp];
}

export function saveOperations(ops: WorkOrderOperation[]) {
  try {
    localStorage.setItem(storeScopedKey(OPERATIONS_STORAGE_KEY), JSON.stringify(ops));
    window.dispatchEvent(new Event(OS_STATE_EVENT));
  } catch {
    /* ignore */
  }
}

export function getActiveOperation(): WorkOrderOperation {
  const ops = listOperations();
  return ops.find((op) => op.status === 'active') || ops[0];
}

export function finishActiveOperation(
  currentOpId: string,
  nextTitle: string,
  masterOperatorName = 'Operador Master',
): { oldOp: WorkOrderOperation; newOp: WorkOrderOperation } {
  const ops = listOperations();
  const stamp = new Date().toISOString();
  const nextId = `op-${Date.now().toString(36)}`;
  const nextCode = `OP-${stamp.slice(0, 7)}`;

  const updated = ops.map((op) => {
    if (op.id === currentOpId) {
      return {
        ...op,
        status: 'completed' as const,
        completedAt: stamp,
        masterOperatorName,
      };
    }
    return op;
  });

  const newOp: WorkOrderOperation = {
    id: nextId,
    code: nextCode,
    title: nextTitle || `Operação ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`,
    status: 'active',
    startDate: stamp.split('T')[0],
    endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    masterOperatorName,
    targetOrdersCount: 25,
  };

  const allOps = [newOp, ...updated];
  saveOperations(allOps);

  // Mover OSs pendentes da operação anterior para a nova sprint
  const currentOrders = listWorkOrders();
  const migrated = currentOrders.map((order) => {
    if (order.operationId === currentOpId && !['delivered', 'cancelled'].includes(order.status)) {
      return { ...order, operationId: newOp.id, updatedAt: stamp };
    }
    return order;
  });
  save(migrated);

  const oldOp = updated.find((op) => op.id === currentOpId) ?? ops[0];
  return { oldOp, newOp };
}

export const DISPOSITION_LABEL: Record<AssetDisposition, string> = {
  customer: 'Permanece do cliente',
  purchased: 'Comprado para estoque',
  scrapped: 'Sucata',
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  none: 'Sem orçamento',
  draft: 'Rascunho',
  sent: 'Aguardando aprovação',
  approved: 'Aprovado',
  rejected: 'Recusado',
};

export const PHOTO_KIND_LABEL: Record<WorkOrderPhotoKind, string> = {
  entry: 'Entrada',
  exit: 'Saída',
  other: 'Outra',
};

export const CHECKLIST_MARK_LABEL: Record<ChecklistMark, string> = {
  unchecked: '—',
  ok: 'OK',
  fail: 'Falha',
  na: 'N/A',
};

export const MAX_WORK_ORDER_PHOTOS = 8;

/** Template padrão (celular / assist. técnica). */
export const DEFAULT_CHECKLIST_LABELS = [
  'Liga / carrega',
  'Touch / display',
  'Áudio (alto-falante / microfone)',
  'Câmeras',
  'Wi-Fi / Bluetooth',
  'Face ID / biometria',
  'Botões físicos',
  'Carcaça / estética',
  'Bateria / aquecimento',
  'Sensores / outros',
] as const;

export function buildDefaultChecklist(): WorkOrderChecklistItem[] {
  return DEFAULT_CHECKLIST_LABELS.map((label, index) => ({
    id: `CL-${String(index + 1).padStart(2, '0')}`,
    label,
    mark: 'unchecked' as ChecklistMark,
    note: '',
  }));
}

function normalizeChecklist(raw: unknown): WorkOrderChecklistItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return buildDefaultChecklist();
  const items = (raw as Partial<WorkOrderChecklistItem>[])
    .filter((item) => item?.id && item?.label)
    .map((item) => ({
      id: String(item.id),
      label: String(item.label),
      mark: (['unchecked', 'ok', 'fail', 'na'].includes(String(item.mark))
        ? item.mark
        : 'unchecked') as ChecklistMark,
      note: String(item.note ?? ''),
    }));
  return items.length > 0 ? items : buildDefaultChecklist();
}

/** Chave comparável para IMEI / série (só alfanumérico). */
export function normalizeItemRefKey(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function normalizePhoneKey(value: string) {
  return value.replace(/\D/g, '');
}

function uid() {
  return `OS-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function lineUid() {
  return `OL-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function photoUid() {
  return `PH-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
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
    customerDocument: raw.customerDocument ?? '',
    customerEmail: raw.customerEmail ?? '',
    itemName: raw.itemName ?? '',
    itemBrand: raw.itemBrand ?? '',
    itemModel: raw.itemModel ?? '',
    itemColor: raw.itemColor ?? '',
    itemRef: raw.itemRef ?? '',
    devicePassword: raw.devicePassword ?? '',
    accessories: raw.accessories ?? '',
    conditionOnEntry: raw.conditionOnEntry ?? '',
    defect: raw.defect ?? '',
    diagnosis: raw.diagnosis ?? '',
    notes: raw.notes ?? '',
    techNotes: raw.techNotes ?? '',
    estimatedReadyAt: raw.estimatedReadyAt ?? '',
    technician: raw.technician ?? '',
    sellerId: raw.sellerId ?? '',
    priority: raw.priority ?? 'normal',
    status: raw.status ?? 'open',
    labor,
    parts,
    lines,
    photos: Array.isArray(raw.photos)
      ? (raw.photos as WorkOrderPhoto[]).filter((photo) => photo?.id && photo?.dataUrl)
      : [],
    checklist: normalizeChecklist(raw.checklist),
    customerSignature:
      typeof raw.customerSignature === 'string' && raw.customerSignature.startsWith('data:image')
        ? raw.customerSignature
        : '',
    customerSignedAt: raw.customerSignedAt,
    customerSignedName: raw.customerSignedName ?? '',
    assetDisposition: raw.assetDisposition ?? 'customer',
    quoteStatus: raw.quoteStatus ?? 'none',
    quoteNotes: raw.quoteNotes ?? '',
    quoteValidUntil: raw.quoteValidUntil ?? '',
    quoteSentAt: raw.quoteSentAt,
    quoteDecidedAt: raw.quoteDecidedAt,
    purchaseCost: raw.purchaseCost,
    purchaseAt: raw.purchaseAt,
    purchaseStockId: raw.purchaseStockId,
    purchaseFinanceId: raw.purchaseFinanceId,
    operationId: raw.operationId ?? 'op-2026-09',
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    worklogs: Array.isArray(raw.worklogs) ? raw.worklogs : [],
    spentMinutes: Number(raw.spentMinutes) || 0,
    isTimerRunning: Boolean(raw.isTimerRunning),
    timerStartedAt: raw.timerStartedAt,
    progressStartedAt: raw.progressStartedAt,
    deliveredAt: raw.deliveredAt,
    createdAt: raw.createdAt ?? now(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now(),
  };
}



let memoryOrdersKey: string | null = null;

function load(): WorkOrder[] {
  const currentKey = getOsStorageKey();
  if (memoryOrders && memoryOrdersKey === currentKey) {
    return memoryOrders
      .filter((item) => !item.id?.startsWith('OS-710') && item.operationId !== 'op-2026-09')
      .map((item) => normalizeWorkOrder(item));
  }

  try {
    let raw = localStorage.getItem(currentKey);

    if (!raw) {
      memoryOrders = [];
      memoryOrdersKey = currentKey;
      return [];
    }

    const parsed = JSON.parse(raw) as Partial<WorkOrder>[];
    if (!Array.isArray(parsed)) {
      memoryOrders = [];
      memoryOrdersKey = currentKey;
      return [];
    }

    const cleaned = parsed
      .filter((item) => item.id && !item.id.startsWith('OS-710') && item.operationId !== 'op-2026-09')
      .map((item) =>
        normalizeWorkOrder(item as Partial<WorkOrder> & Pick<WorkOrder, 'id'>),
      );
    memoryOrders = cleaned;
    memoryOrdersKey = currentKey;
    if (cleaned.length !== parsed.length) {
      save(cleaned);
    }
    return cleaned;
  } catch {
    memoryOrders = [];
    memoryOrdersKey = currentKey;
    return [];
  }
}

function save(items: WorkOrder[]) {
  const currentKey = getOsStorageKey();
  memoryOrders = items;
  memoryOrdersKey = currentKey;
  try {
    localStorage.setItem(currentKey, JSON.stringify(items));

  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OS_STATE_EVENT));
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, () => {
    memoryOrders = null;
    memoryOrdersKey = null;
    window.dispatchEvent(new Event(OS_STATE_EVENT));
  });
}

export function replaceWorkOrders(items: WorkOrder[]) {
  save(items.map((item) => normalizeWorkOrder(item)));
}

function osApiError(error: unknown, fallback: string) {
  if (error instanceof NestApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function upsertLocal(order: WorkOrder) {
  const next = [order, ...load().filter((item) => item.id !== order.id)];
  save(next);
  return order;
}

export function listWorkOrders() {
  return load().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWorkOrder(id: string) {
  return load().find((item) => item.id === id) ?? null;
}

export async function createWorkOrder(
  input: Omit<
    WorkOrder,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'status'
    | 'lines'
    | 'photos'
    | 'checklist'
    | 'customerSignature'
    | 'customerSignedAt'
    | 'customerSignedName'
    | 'assetDisposition'
    | 'quoteStatus'
    | 'quoteNotes'
    | 'quoteValidUntil'
    | 'quoteSentAt'
    | 'quoteDecidedAt'
  > & {
    status?: WorkOrderStatus;
    lines?: WorkOrderLine[];
    photos?: WorkOrderPhoto[];
    checklist?: WorkOrderChecklistItem[];
    customerSignature?: string;
    customerSignedName?: string;
    assetDisposition?: AssetDisposition;
    quoteStatus?: QuoteStatus;
    quoteNotes?: string;
    quoteValidUntil?: string;
  },
) {
  if (isNestAuthed()) {
    try {
      const created = await apiCreateWorkOrder({
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerDocument: input.customerDocument,
        customerEmail: input.customerEmail,
        itemName: input.itemName,
        itemBrand: input.itemBrand,
        itemModel: input.itemModel,
        itemColor: input.itemColor,
        itemRef: input.itemRef,
        devicePassword: input.devicePassword,
        accessories: input.accessories,
        conditionOnEntry: input.conditionOnEntry,
        defect: input.defect,
        diagnosis: input.diagnosis,
        notes: input.notes,
        estimatedReadyAt: input.estimatedReadyAt,
        technician: input.technician,
        sellerId: input.sellerId,
        priority: input.priority,
        labor: input.labor,
      });
      return upsertLocal(normalizeWorkOrder(created));
    } catch (error) {
      throw new Error(osApiError(error, 'Falha ao criar OS.'));
    }
  }

  const stamp = now();
  const lines = input.lines ?? [];
  const order = normalizeWorkOrder({
    ...input,
    id: uid(),
    status: input.status ?? 'open',
    lines,
    photos: input.photos ?? [],
    checklist: input.checklist ?? buildDefaultChecklist(),
    customerSignature: input.customerSignature ?? '',
    customerSignedName: input.customerSignedName ?? '',
    parts: lines.length ? partsTotalFromLines(lines) : input.parts,
    assetDisposition: input.assetDisposition ?? 'customer',
    quoteStatus: input.quoteStatus ?? 'none',
    quoteNotes: input.quoteNotes ?? '',
    quoteValidUntil: input.quoteValidUntil ?? '',
    createdAt: stamp,
    updatedAt: stamp,
  });
  const next = [order, ...load()];
  save(next);
  return order;
}

export async function updateWorkOrder(
  id: string,
  patch: Partial<Omit<WorkOrder, 'id' | 'createdAt'>>,
) {
  if (isNestAuthed()) {
    try {
      if (patch.status === 'delivered' || patch.status === 'cancelled') {
        throw new Error('Use entrega/cancelamento via ledger.');
      }
      const body: Record<string, unknown> = {};
      const keys = [
        'status',
        'labor',
        'notes',
        'diagnosis',
        'priority',
        'technician',
        'sellerId',
        'estimatedReadyAt',
        'assetDisposition',
        'quoteNotes',
        'quoteValidUntil',
        'customerName',
        'customerPhone',
        'customerDocument',
        'customerEmail',
        'itemName',
        'itemBrand',
        'itemModel',
        'itemColor',
        'itemRef',
        'devicePassword',
        'accessories',
        'conditionOnEntry',
      ] as const;
      for (const key of keys) {
        if (patch[key] !== undefined) body[key] = patch[key];
      }
      const updated = await apiUpdateWorkOrder(id, body);
      return upsertLocal(normalizeWorkOrder(updated));
    } catch (error) {
      throw new Error(osApiError(error, 'Falha ao atualizar OS.'));
    }
  }

  const next = load().map((item) => {
    if (item.id !== id) return item;
    const stamp = now();
    const merged = normalizeWorkOrder({ ...item, ...patch, id: item.id, createdAt: item.createdAt });
    if (patch.status === 'progress' && item.status !== 'progress' && !merged.progressStartedAt) {
      merged.progressStartedAt = stamp;
    }
    if (patch.status !== undefined) {
      if (patch.status === 'delivered') {
        merged.deliveredAt = item.deliveredAt || stamp;
      } else {
        merged.deliveredAt = undefined;
      }
    }
    if (!patch.history) {
      const historyEntries: WorkOrderHistoryEntry[] = [];
      const author = (patch as any).authorName || 'Operador';
      if (patch.status !== undefined && patch.status !== item.status) {
        historyEntries.push({
          id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          authorName: author,
          field: 'Status',
          action: 'alterou',
          fromValue: STATUS_LABEL[item.status] ?? item.status,
          toValue: STATUS_LABEL[patch.status] ?? patch.status,
          createdAt: stamp,
        });
      }
      if (patch.priority !== undefined && patch.priority !== item.priority) {
        historyEntries.push({
          id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          authorName: author,
          field: 'Prioridade',
          action: 'alterou',
          fromValue: PRIORITY_LABEL[item.priority] ?? item.priority,
          toValue: PRIORITY_LABEL[patch.priority] ?? patch.priority,
          createdAt: stamp,
        });
      }
      if (patch.technician !== undefined && patch.technician !== item.technician) {
        historyEntries.push({
          id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          authorName: author,
          field: 'Técnico Responsável',
          action: 'alterou',
          fromValue: item.technician || 'Nenhum',
          toValue: patch.technician || 'Não atribuído',
          createdAt: stamp,
        });
      }
      if (historyEntries.length > 0) {
        merged.history = [...(item.history ?? []), ...historyEntries];
      }
    }
    return { ...merged, updatedAt: stamp };
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

export function workOrderFinancialSummary(order: WorkOrder) {
  const baseTotal = workOrderTotal(order);
  const discount = order.discount || 0;
  const discountMode = order.discountMode || 'money';
  const surcharge = order.surcharge || 0;
  const surchargeMode = order.surchargeMode || 'money';

  const discValue =
    discountMode === 'percent'
      ? Math.round(((baseTotal * discount) / 100) * 100) / 100
      : discount;
  const surValue =
    surchargeMode === 'percent'
      ? Math.round(((baseTotal * surcharge) / 100) * 100) / 100
      : surcharge;
  const finalTotal = Math.max(
    0,
    order.finalAmount !== undefined && order.finalAmount > 0
      ? order.finalAmount
      : Math.round((baseTotal - discValue + surValue) * 100) / 100,
  );

  const payments = order.payments ?? [];
  const paid =
    payments.reduce((sum, p) => sum + p.amount, 0) || (order.paidAmount ?? 0);
  const remaining = Math.max(0, Math.round((finalTotal - paid) * 100) / 100);

  let status: WorkOrderPaymentStatus = order.paymentStatus ?? 'pending';
  if (order.status === 'cancelled') {
    status = 'cancelled';
  } else if (paid >= finalTotal && finalTotal > 0) {
    status = 'paid';
  } else if (paid > 0) {
    status = 'partially_paid';
  } else {
    status = 'pending';
  }

  return {
    baseTotal,
    discount,
    discountMode,
    discValue,
    surcharge,
    surchargeMode,
    surValue,
    finalTotal,
    paid,
    remaining,
    status,
    payments,
  };
}

export async function registerWorkOrderPayment(
  osId: string,
  payment: {
    method: string;
    amount: number;
    receivedAmount?: number;
    change?: number;
    discount?: number;
    discountMode?: 'money' | 'percent';
    surcharge?: number;
    surchargeMode?: 'money' | 'percent';
    note?: string;
    operatorName?: string;
  },
): Promise<WorkOrder | null> {
  const order = getWorkOrder(osId);
  if (!order) return null;

  const discount = payment.discount !== undefined ? payment.discount : (order.discount || 0);
  const discountMode = payment.discountMode ?? order.discountMode ?? 'money';
  const surcharge = payment.surcharge !== undefined ? payment.surcharge : (order.surcharge || 0);
  const surchargeMode = payment.surchargeMode ?? order.surchargeMode ?? 'money';

  const baseTotal = workOrderTotal(order);
  const discValue =
    discountMode === 'percent'
      ? Math.round(((baseTotal * discount) / 100) * 100) / 100
      : discount;
  const surValue =
    surchargeMode === 'percent'
      ? Math.round(((baseTotal * surcharge) / 100) * 100) / 100
      : surcharge;
  const finalTotal = Math.max(0, Math.round((baseTotal - discValue + surValue) * 100) / 100);

  const prevPayments = order.payments ?? [];
  const prevPaid = prevPayments.reduce((sum, p) => sum + p.amount, 0) || (order.paidAmount ?? 0);
  const newTotalPaid = Math.round((prevPaid + payment.amount) * 100) / 100;

  const entry: WorkOrderPaymentEntry = {
    id: `PAY-${Date.now().toString(36).toUpperCase()}`,
    method: payment.method,
    amount: payment.amount,
    receivedAmount: payment.receivedAmount,
    change: payment.change,
    discount,
    discountMode,
    surcharge,
    surchargeMode,
    note: payment.note,
    paidAt: new Date().toISOString(),
    cashierOperator: payment.operatorName,
  };

  const nextPayments = [...prevPayments, entry];
  const isPaid = newTotalPaid >= finalTotal && finalTotal > 0;
  const paymentStatus: WorkOrderPaymentStatus = isPaid
    ? 'paid'
    : newTotalPaid > 0
    ? 'partially_paid'
    : 'pending';

  const historyEntry: WorkOrderHistoryEntry = {
    id: `HIST-${Date.now().toString(36).toUpperCase()}`,
    authorName: payment.operatorName || 'Caixa',
    authorRole: 'Operador Financeiro',
    field: 'Pagamento',
    action: 'adicionou',
    toValue: `Recebimento de ${payment.amount.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })} via ${payment.method} (${paymentStatus === 'paid' ? 'OS Quitada' : 'Parcial'})`,
    createdAt: new Date().toISOString(),
  };

  const patch: Partial<WorkOrder> = {
    paymentStatus,
    paidAmount: newTotalPaid,
    discount,
    discountMode,
    surcharge,
    surchargeMode,
    finalAmount: finalTotal,
    payments: nextPayments,
    status: isPaid ? 'delivered' : order.status,
    deliveredAt: isPaid && !order.deliveredAt ? new Date().toISOString() : order.deliveredAt,
    history: [...(order.history ?? []), historyEntry],
  };

  return updateWorkOrder(osId, patch);
}

export function newWorkOrderLineId() {
  return lineUid();
}

export type QuoteActionResult =
  | { ok: true; order: WorkOrder }
  | { ok: false; error: string };

/** Marca orçamento como rascunho (ainda editável). */
export async function draftQuote(
  id: string,
  input: { labor?: number; parts?: number; quoteNotes?: string; quoteValidUntil?: string },
): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiQuoteDraft(id, {
        labor: input.labor,
        notes: input.quoteNotes,
        validUntil: input.quoteValidUntil,
      });
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao salvar orçamento.') };
    }
  }
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada — não dá para alterar orçamento.' };
  }
  if (current.quoteStatus === 'approved') {
    return { ok: false, error: 'Orçamento já aprovado. Crie revisão nas observações se precisar.' };
  }
  const order = await updateWorkOrder(id, {
    labor: input.labor ?? current.labor,
    parts: input.parts ?? current.parts,
    quoteNotes: input.quoteNotes ?? current.quoteNotes,
    quoteValidUntil: input.quoteValidUntil ?? current.quoteValidUntil,
    quoteStatus: 'draft',
    quoteDecidedAt: undefined,
  });
  if (!order) return { ok: false, error: 'Falha ao salvar orçamento.' };
  return { ok: true, order };
}

/** Envia orçamento ao cliente → status da OS vai para Aguardando. */
export async function sendQuote(id: string): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiQuoteSend(id);
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao enviar orçamento.') };
    }
  }
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada.' };
  }
  const total = workOrderTotal(current);
  if (total <= 0 && !current.quoteNotes.trim()) {
    return { ok: false, error: 'Informe valores ou descrição do orçamento antes de enviar.' };
  }
  const order = await updateWorkOrder(id, {
    quoteStatus: 'sent',
    quoteSentAt: now(),
    quoteDecidedAt: undefined,
    status: current.status === 'open' || current.status === 'diagnosis' ? 'waiting' : current.status,
  });
  if (!order) return { ok: false, error: 'Falha ao enviar orçamento.' };
  return { ok: true, order };
}

/** Cliente aprovou → pode seguir para serviço. */
export async function approveQuote(id: string, moveToProgress = true): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiQuoteApprove(id, { moveToProgress });
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao aprovar orçamento.') };
    }
  }
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.quoteStatus !== 'sent' && current.quoteStatus !== 'draft') {
    return { ok: false, error: 'Só dá para aprovar orçamento enviado ou em rascunho.' };
  }
  const order = await updateWorkOrder(id, {
    quoteStatus: 'approved',
    quoteDecidedAt: now(),
    status: moveToProgress ? 'progress' : current.status,
  });
  if (!order) return { ok: false, error: 'Falha ao aprovar orçamento.' };
  return { ok: true, order };
}

/** Cliente recusou. */
export async function rejectQuote(id: string): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiQuoteReject(id);
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao recusar orçamento.') };
    }
  }
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.quoteStatus !== 'sent' && current.quoteStatus !== 'draft') {
    return { ok: false, error: 'Só dá para recusar orçamento enviado ou em rascunho.' };
  }
  const order = await updateWorkOrder(id, {
    quoteStatus: 'rejected',
    quoteDecidedAt: now(),
    status: 'waiting',
  });
  if (!order) return { ok: false, error: 'Falha ao recusar orçamento.' };
  return { ok: true, order };
}

/** Volta orçamento para edição após recusa. */
export async function reopenQuote(id: string): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiQuoteReopen(id);
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao reabrir orçamento.') };
    }
  }
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.quoteStatus !== 'rejected' && current.quoteStatus !== 'sent') {
    return { ok: false, error: 'Nada para reabrir.' };
  }
  const order = await updateWorkOrder(id, {
    quoteStatus: 'draft',
    quoteDecidedAt: undefined,
  });
  if (!order) return { ok: false, error: 'Falha ao reabrir orçamento.' };
  return { ok: true, order };
}

/** Comprime imagem para caber no localStorage (lado longo ≤ 1280). */
export async function fileToWorkOrderPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Arquivo precisa ser uma imagem.');
  }
  const bitmap = await createImageBitmap(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Não foi possível processar a imagem.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}

export async function addWorkOrderPhoto(
  osId: string,
  input: { kind: WorkOrderPhotoKind; dataUrl: string; caption?: string },
): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiAddPhoto(osId, input);
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao salvar foto.') };
    }
  }
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'cancelled') return { ok: false, error: 'OS cancelada.' };
  if (current.photos.length >= MAX_WORK_ORDER_PHOTOS) {
    return { ok: false, error: `Limite de ${MAX_WORK_ORDER_PHOTOS} fotos por OS.` };
  }
  const photo: WorkOrderPhoto = {
    id: photoUid(),
    kind: input.kind,
    dataUrl: input.dataUrl,
    caption: input.caption?.trim() ?? '',
    createdAt: now(),
  };
  const order = await updateWorkOrder(osId, { photos: [...current.photos, photo] });
  if (!order) return { ok: false, error: 'Falha ao salvar foto.' };
  return { ok: true, order };
}

export async function removeWorkOrderPhoto(osId: string, photoId: string): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiRemovePhoto(osId, photoId);
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao remover foto.') };
    }
  }
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada — não dá para remover fotos.' };
  }
  const order = await updateWorkOrder(osId, {
    photos: current.photos.filter((photo) => photo.id !== photoId),
  });
  if (!order) return { ok: false, error: 'Falha ao remover foto.' };
  return { ok: true, order };
}

export async function updateWorkOrderPhotoCaption(
  osId: string,
  photoId: string,
  caption: string,
): Promise<QuoteActionResult> {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  const order = await updateWorkOrder(osId, {
    photos: current.photos.map((photo) =>
      photo.id === photoId ? { ...photo, caption: caption.trim() } : photo,
    ),
  });
  if (!order) return { ok: false, error: 'Falha ao atualizar legenda.' };
  return { ok: true, order };
}

export async function setChecklistItem(
  osId: string,
  itemId: string,
  patch: { mark?: ChecklistMark; note?: string },
): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiPatchChecklist(osId, itemId, patch);
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao atualizar checklist.') };
    }
  }
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada — checklist bloqueado.' };
  }
  const checklist = current.checklist.map((item) =>
    item.id === itemId
      ? {
          ...item,
          mark: patch.mark ?? item.mark,
          note: patch.note !== undefined ? patch.note.trim() : item.note,
        }
      : item,
  );
  const order = await updateWorkOrder(osId, { checklist });
  if (!order) return { ok: false, error: 'Falha ao atualizar checklist.' };
  return { ok: true, order };
}

export async function resetWorkOrderChecklist(osId: string): Promise<QuoteActionResult> {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada.' };
  }
  const order = await updateWorkOrder(osId, { checklist: buildDefaultChecklist() });
  if (!order) return { ok: false, error: 'Falha ao reiniciar checklist.' };
  return { ok: true, order };
}

export function checklistSummary(order: Pick<WorkOrder, 'checklist'>) {
  const total = order.checklist.length;
  const ok = order.checklist.filter((item) => item.mark === 'ok').length;
  const fail = order.checklist.filter((item) => item.mark === 'fail').length;
  const na = order.checklist.filter((item) => item.mark === 'na').length;
  const pending = order.checklist.filter((item) => item.mark === 'unchecked').length;
  return { total, ok, fail, na, pending };
}

/** Outras OS do mesmo IMEI / série. */
export function findWorkOrdersByItemRef(itemRef: string, excludeId?: string): WorkOrder[] {
  const key = normalizeItemRefKey(itemRef);
  if (key.length < 4) return [];
  return listWorkOrders().filter((order) => {
    if (excludeId && order.id === excludeId) return false;
    return normalizeItemRefKey(order.itemRef) === key;
  });
}

/** Outras OS do mesmo cliente (telefone ou documento). */
export function findWorkOrdersByCustomer(
  input: { phone?: string; document?: string },
  excludeId?: string,
): WorkOrder[] {
  const phone = normalizePhoneKey(input.phone ?? '');
  const document = normalizeItemRefKey(input.document ?? '');
  if (phone.length < 8 && document.length < 5) return [];
  return listWorkOrders().filter((order) => {
    if (excludeId && order.id === excludeId) return false;
    const orderPhone = normalizePhoneKey(order.customerPhone);
    const orderDoc = normalizeItemRefKey(order.customerDocument);
    if (phone.length >= 8 && orderPhone.endsWith(phone.slice(-8))) return true;
    if (document.length >= 5 && orderDoc === document) return true;
    return false;
  });
}

export async function saveCustomerSignature(
  osId: string,
  input: { dataUrl: string; signedName?: string },
): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiSignWorkOrder(osId, input);
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao salvar assinatura.') };
    }
  }
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'cancelled') return { ok: false, error: 'OS cancelada.' };
  if (!input.dataUrl.startsWith('data:image')) {
    return { ok: false, error: 'Assinatura inválida.' };
  }
  const order = await updateWorkOrder(osId, {
    customerSignature: input.dataUrl,
    customerSignedAt: now(),
    customerSignedName: (input.signedName ?? current.customerName).trim(),
  });
  if (!order) return { ok: false, error: 'Falha ao salvar assinatura.' };
  return { ok: true, order };
}

export async function clearCustomerSignature(osId: string): Promise<QuoteActionResult> {
  if (isNestAuthed()) {
    try {
      const order = await apiClearSignature(osId);
      return { ok: true, order: upsertLocal(normalizeWorkOrder(order)) };
    } catch (error) {
      return { ok: false, error: osApiError(error, 'Falha ao limpar assinatura.') };
    }
  }
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada.' };
  }
  const order = await updateWorkOrder(osId, {
    customerSignature: '',
    customerSignedAt: undefined,
    customerSignedName: '',
  });
  if (!order) return { ok: false, error: 'Falha ao limpar assinatura.' };
  return { ok: true, order };
}

/** Data YYYY-MM-DD da previsão, se válida. */
export function workOrderReadyDate(order: Pick<WorkOrder, 'estimatedReadyAt'>): string | null {
  const value = order.estimatedReadyAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateKey(parsed);
}

export function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Segunda-feira da semana da data (local). */
export function startOfWeekMonday(date: Date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  return next;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function listTechnicians(): string[] {
  const names = new Set<string>();
  for (const t of listTechnicianInfos()) {
    if (t.name) names.add(t.name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const AGENDA_ACTIVE: WorkOrderStatus[] = [
  'open',
  'diagnosis',
  'waiting',
  'progress',
  'reproved',
  'ready',
];

function matchesTechnician(order: WorkOrder, technician?: string) {
  if (!technician || technician === 'all') return true;
  if (technician === 'unassigned') return !order.technician.trim();
  return order.technician.trim() === technician;
}

export type AgendaDay = {
  date: string;
  orders: WorkOrder[];
};

/** Semana (seg–dom) com OS pela previsão de pronto. */
export function getAgendaWeek(anchorDate: Date, technician = 'all'): AgendaDay[] {
  const monday = startOfWeekMonday(anchorDate);
  const days: AgendaDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = toDateKey(addDays(monday, i));
    days.push({ date, orders: [] });
  }
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const order of listWorkOrders()) {
    if (!AGENDA_ACTIVE.includes(order.status)) continue;
    if (!matchesTechnician(order, technician)) continue;
    const ready = workOrderReadyDate(order);
    if (!ready) continue;
    const bucket = byDate.get(ready);
    if (bucket) bucket.orders.push(order);
  }
  for (const day of days) {
    day.orders.sort((a, b) => {
      const priMap: Record<WorkOrderPriority, number> = { urgent: -1, high: 0, normal: 1, low: 2 };
      const pri = (priMap[a.priority] ?? 1) - (priMap[b.priority] ?? 1);
      if (pri !== 0) return pri;
      return a.customerName.localeCompare(b.customerName, 'pt-BR');
    });
  }
  return days;
}

/** OS ativas sem previsão (para o painel lateral). */
export function listUnscheduledWorkOrders(technician = 'all') {
  return listWorkOrders()
    .filter((order) => {
      if (!AGENDA_ACTIVE.includes(order.status)) return false;
      if (!matchesTechnician(order, technician)) return false;
      return !workOrderReadyDate(order);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** OS com previsão no passado e ainda não entregues. */
export function listOverdueWorkOrders(technician = 'all', today = toDateKey(new Date())) {
  return listWorkOrders()
    .filter((order) => {
      if (!AGENDA_ACTIVE.includes(order.status)) return false;
      if (order.status === 'ready') return false;
      if (!matchesTechnician(order, technician)) return false;
      const ready = workOrderReadyDate(order);
      return Boolean(ready && ready < today);
    })
    .sort((a, b) => (workOrderReadyDate(a) ?? '').localeCompare(workOrderReadyDate(b) ?? ''));
}

export async function setWorkOrderReadyDate(osId: string, date: string): Promise<QuoteActionResult> {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada.' };
  }
  const value = date.trim();
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: 'Data inválida.' };
  }
  try {
    const order = await updateWorkOrder(osId, { estimatedReadyAt: value });
    if (!order) return { ok: false, error: 'Falha ao salvar previsão.' };
    return { ok: true, order };
  } catch (error) {
    return { ok: false, error: osApiError(error, 'Falha ao salvar previsão.') };
  }
}

export function searchWorkOrders(query: string, limit = 12): WorkOrder[] {
  const needle = query.trim().toLowerCase();
  const items = listWorkOrders();
  if (!needle) return items.slice(0, limit);
  return items
    .filter((order) =>
      `${order.id} ${order.customerName} ${order.customerPhone} ${order.customerDocument} ${order.itemName} ${order.itemRef} ${order.technician}`
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, limit);
}

export function workOrderPartsLines(order: Pick<WorkOrder, 'lines'>) {
  return (order.lines ?? []).filter((line) => line.kind === 'part');
}

export function workOrderLaborLines(order: Pick<WorkOrder, 'lines'>) {
  return (order.lines ?? []).filter((line) => line.kind === 'labor');
}

/** Tempo na oficina: entrada → saída (ou agora se ainda aberta). */
export function workOrderShopDurationMs(
  order: Pick<WorkOrder, 'createdAt' | 'deliveredAt' | 'status' | 'updatedAt'>,
) {
  const start = new Date(order.createdAt).getTime();
  if (Number.isNaN(start)) return 0;
  const exit = workOrderExitAt(order);
  const end = exit ? new Date(exit).getTime() : Date.now();
  if (Number.isNaN(end) || end < start) return 0;
  return end - start;
}

export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

export function workOrderExitAt(order: Pick<WorkOrder, 'deliveredAt' | 'status' | 'updatedAt'>) {
  if (order.deliveredAt) return order.deliveredAt;
  if (order.status === 'delivered') return order.updatedAt;
  return null;
}

export async function addWorkOrderComment(
  osId: string,
  input: { authorName: string; authorRole?: string; authorPhoto?: string; content: string; kind?: 'internal' | 'customer' | 'system' },
): Promise<WorkOrder | null> {
  const order = getWorkOrder(osId);
  if (!order) return null;
  const newComment: WorkOrderComment = {
    id: `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    authorName: input.authorName || 'Operador',
    authorRole: input.authorRole || 'Técnico',
    authorPhoto: input.authorPhoto,
    content: input.content.trim(),
    kind: input.kind || 'internal',
    createdAt: now(),
  };
  const historyEntry: WorkOrderHistoryEntry = {
    id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    authorName: input.authorName || 'Operador',
    authorPhoto: input.authorPhoto,
    authorRole: input.authorRole,
    field: 'Comentário',
    action: 'adicionou',
    toValue: input.content.trim(),
    createdAt: now(),
  };
  const nextComments = [...(order.comments ?? []), newComment];
  const nextHistory = [...(order.history ?? []), historyEntry];
  return updateWorkOrder(osId, { comments: nextComments, history: nextHistory } as Partial<WorkOrder>);
}

export async function addWorkOrderAttachment(
  osId: string,
  attachment: { name: string; size: number; type: string; dataUrl: string; uploaderName: string; uploaderPhoto?: string },
): Promise<WorkOrder | null> {
  const order = getWorkOrder(osId);
  if (!order) return null;
  const newAttachment: WorkOrderAttachment = {
    id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: attachment.name,
    size: attachment.size,
    type: attachment.type,
    dataUrl: attachment.dataUrl,
    createdAt: now(),
    uploaderName: attachment.uploaderName || 'Operador',
  };
  const historyEntry: WorkOrderHistoryEntry = {
    id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    authorName: attachment.uploaderName || 'Operador',
    authorPhoto: attachment.uploaderPhoto,
    field: 'Anexo',
    action: 'adicionou',
    fromValue: 'Nenhuma',
    toValue: attachment.name,
    createdAt: now(),
  };
  const nextAttachments = [...(order.attachments ?? []), newAttachment];
  const nextHistory = [...(order.history ?? []), historyEntry];
  return updateWorkOrder(osId, { attachments: nextAttachments, history: nextHistory } as Partial<WorkOrder>);
}

export async function addWorkOrderWorklog(
  osId: string,
  input: {
    technicianName: string;
    technicianRole?: string;
    technicianPhoto?: string;
    minutesSpent: number;
    description: string;
    startedAt?: string;
  },
): Promise<WorkOrder | null> {
  const order = getWorkOrder(osId);
  if (!order) return null;
  const mins = Math.max(1, input.minutesSpent);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const formatted = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;

  const newLog: WorkOrderWorklog = {
    id: `wlog-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    technicianName: input.technicianName || 'Técnico',
    technicianRole: input.technicianRole || 'Bancada Técnica',
    technicianPhoto: input.technicianPhoto,
    minutesSpent: mins,
    timeSpentFormatted: formatted,
    description: input.description.trim(),
    startedAt: input.startedAt || now(),
    createdAt: now(),
  };

  const historyEntry: WorkOrderHistoryEntry = {
    id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    authorName: input.technicianName || 'Técnico',
    authorPhoto: input.technicianPhoto,
    authorRole: input.technicianRole,
    field: 'Registro de atividades',
    action: 'adicionou',
    toValue: `${formatted} — ${input.description.trim()}`,
    createdAt: now(),
  };

  const nextWorklogs = [...(order.worklogs ?? []), newLog];
  const nextHistory = [...(order.history ?? []), historyEntry];
  const nextSpent = (Number(order.spentMinutes) || 0) + mins;

  return updateWorkOrder(osId, {
    worklogs: nextWorklogs,
    history: nextHistory,
    spentMinutes: nextSpent,
  } as Partial<WorkOrder>);
}

export async function removeWorkOrderAttachment(osId: string, attachmentId: string): Promise<WorkOrder | null> {
  const order = getWorkOrder(osId);
  if (!order) return null;
  const nextAttachments = (order.attachments ?? []).filter((a) => a.id !== attachmentId);
  return updateWorkOrder(osId, { attachments: nextAttachments } as Partial<WorkOrder>);
}

export async function toggleWorkOrderTimer(osId: string): Promise<WorkOrder | null> {
  const order = getWorkOrder(osId);
  if (!order) return null;
  const isRunning = Boolean(order.isTimerRunning);
  const currentSpent = Number(order.spentMinutes) || 0;
  if (isRunning) {
    let added = 0;
    if (order.timerStartedAt) {
      added = Math.max(1, Math.round((Date.now() - new Date(order.timerStartedAt).getTime()) / 60000));
    }
    return updateWorkOrder(osId, {
      isTimerRunning: false,
      timerStartedAt: undefined,
      spentMinutes: currentSpent + added,
    } as Partial<WorkOrder>);
  } else {
    return updateWorkOrder(osId, {
      isTimerRunning: true,
      timerStartedAt: now(),
    } as Partial<WorkOrder>);
  }
}

export async function logWorkOrderActivity(
  osId: string,
  field: string,
  action: 'alterou' | 'adicionou' | 'atualizou' | 'removeu',
  toValue: string,
  authorName: string = 'Operador',
): Promise<WorkOrder | null> {
  const order = getWorkOrder(osId);
  if (!order) return null;
  const historyEntry: WorkOrderHistoryEntry = {
    id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    authorName,
    field,
    action,
    toValue,
    createdAt: now(),
  };
  const nextHistory = [...(order.history ?? []), historyEntry];
  return updateWorkOrder(osId, { history: nextHistory } as Partial<WorkOrder>);
}


