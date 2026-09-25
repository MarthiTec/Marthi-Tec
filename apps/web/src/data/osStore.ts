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

const STORAGE_KEY = 'marthi.os.v2';
export const OS_STATE_EVENT = 'marthi-os-state';

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
  avatarUrl: string;
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

export const TECHNICIANS_LIST: TechnicianInfo[] = [
  {
    id: 'tech-1',
    name: 'Ana Costa',
    role: 'Especialista Apple & Microeletrônica',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
    specialty: 'Placas e iPhones',
    active: true,
  },
  {
    id: 'tech-2',
    name: 'Carlos Lima',
    role: 'Técnico Sênior de Hardware & Notebooks',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    specialty: 'Notebooks e PCs',
    active: true,
  },
  {
    id: 'tech-3',
    name: 'Lucas Silva',
    role: 'Técnico de Bancada & Telas',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    specialty: 'Troca de Telas e Baterias',
    active: true,
  },
  {
    id: 'tech-4',
    name: 'Marthi Teste',
    role: 'Operador Master & Triagem',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    specialty: 'Revisão Técnica e Triagem',
    active: true,
  },
];

export function getTechnicianByName(name?: string | null): TechnicianInfo | undefined {
  if (!name) return undefined;
  return TECHNICIANS_LIST.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

const OPERATIONS_STORAGE_KEY = 'marthi.os.operations.v1';

export const DEFAULT_OPERATIONS: WorkOrderOperation[] = [
  {
    id: 'op-2026-09',
    code: 'OP-2026-09',
    title: 'Operação Setembro 2026',
    status: 'active',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    masterOperatorName: 'Marthi Master',
    targetOrdersCount: 20,
  },
  {
    id: 'op-2026-08',
    code: 'OP-2026-08',
    title: 'Operação Agosto 2026',
    status: 'completed',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    completedAt: '2026-08-31T23:59:59.000Z',
    masterOperatorName: 'Marthi Master',
    targetOrdersCount: 25,
  },
  {
    id: 'op-2026-07',
    code: 'OP-2026-07',
    title: 'Operação Julho 2026',
    status: 'completed',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    completedAt: '2026-07-31T23:59:59.000Z',
    masterOperatorName: 'Marthi Master',
    targetOrdersCount: 22,
  },
];

export function listOperations(): WorkOrderOperation[] {
  try {
    const raw = localStorage.getItem(OPERATIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_OPERATIONS;
}

export function saveOperations(ops: WorkOrderOperation[]) {
  try {
    localStorage.setItem(OPERATIONS_STORAGE_KEY, JSON.stringify(ops));
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

function seed(): WorkOrder[] {
  return [
    normalizeWorkOrder({
      id: 'OS-7101',
      operationId: 'op-2026-09',
      customerName: 'Juliana Silveira',
      customerPhone: '(11) 98765-4321',
      customerDocument: '321.654.987-00',
      customerEmail: 'juliana.silveira@email.com',
      itemName: 'iPhone 13 Pro 128GB',
      itemBrand: 'Apple',
      itemModel: 'iPhone 13 Pro',
      itemColor: 'Grafite',
      itemRef: 'IMEI 3548 9210 4928 112',
      devicePassword: '2580',
      accessories: 'Capa anti-impacto preta e película trincada',
      conditionOnEntry: 'Vidro frontal trincado no canto superior, saúde da bateria 74%',
      defect: 'Aparelho desliga sozinho com 20% e vidro quebrou após queda na calçada.',
      diagnosis: 'Avaliação visual realizada. Troca de display OLED original + Troca de bateria original recomendada.',
      notes: 'Cliente autorizou orçamento verbal até R$ 800. Prioridade máxima pois utiliza para trabalho de vendas.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 1)),
      technician: 'Carlos Lima',
      priority: 'urgent',
      status: 'open',
      labor: 120,
      parts: 590,
      spentMinutes: 10,
      comments: [
        {
          id: 'cmt-1',
          authorName: 'Triagem Marthi',
          authorRole: 'Atendimento',
          content: 'Cliente deu entrada no balcão com muita urgência. Equipamento de uso corporativo.',
          kind: 'system',
          createdAt: daysAgo(0),
        },
        {
          id: 'cmt-2',
          authorName: 'Carlos Lima',
          authorRole: 'Técnico Especialista',
          content: 'Recebido na bancada 1. Bateria com risco de estufamento. Desconectada para segurança.',
          kind: 'internal',
          createdAt: daysAgo(0),
        },
      ],
      attachments: [
        {
          id: 'att-1',
          name: 'foto-entrada-frontal.jpg',
          size: 184000,
          type: 'image/jpeg',
          dataUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&auto=format&fit=crop&q=80',
          createdAt: daysAgo(0),
          uploaderName: 'Carlos Lima',
        },
      ],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(0),
      updatedAt: daysAgo(0),
    }),
    normalizeWorkOrder({
      id: 'OS-7102',
      operationId: 'op-2026-09',
      customerName: 'Marcos Vinicius',
      customerPhone: '(21) 97123-4567',
      customerDocument: '445.667.889-11',
      customerEmail: 'marcos.v@empresa.com.br',
      itemName: 'Samsung Galaxy S22 Ultra',
      itemBrand: 'Samsung',
      itemModel: 'Galaxy S22 Ultra 256GB',
      itemColor: 'Verde Botânico',
      itemRef: 'IMEI 3587 6109 2837 415',
      devicePassword: 'Padrão em L',
      accessories: 'S-Pen original inclusa (sem carregador)',
      conditionOnEntry: 'Tampa traseira sem riscos, marcas no conector de carga',
      defect: 'Não carrega na tomada, esquenta muito próximo à entrada Type-C.',
      diagnosis: 'Subplaca de carga oxidada com resíduos de umidade. Linha VBUS em fuga para GND.',
      notes: 'Testar se carregamento por indução continua operacional antes de mexer na placa principal.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 2)),
      technician: 'Roberto Costa',
      priority: 'high',
      status: 'open',
      labor: 140,
      parts: 180,
      spentMinutes: 15,
      comments: [
        {
          id: 'cmt-3',
          authorName: 'Roberto Costa',
          authorRole: 'Técnico Bancada',
          content: 'Subplaca desoxidação concluída. Testando carregamento rápido Super Fast Charging 45W.',
          kind: 'internal',
          createdAt: daysAgo(0),
        },
      ],
      attachments: [],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(1),
      updatedAt: daysAgo(0),
    }),
    normalizeWorkOrder({
      id: 'OS-7103',
      operationId: 'op-2026-09',
      customerName: 'Patrícia Mendes',
      customerPhone: '(24) 99345-6789',
      customerDocument: '112.233.445-55',
      customerEmail: 'patricia.mendes@advocacia.com',
      itemName: 'MacBook Air M1 13" (A2337)',
      itemBrand: 'Apple',
      itemModel: 'MacBook Air M1 256GB',
      itemColor: 'Cinza Espacial',
      itemRef: 'S/N C02G90PMQ05D',
      devicePassword: 'marthi2026',
      accessories: 'Carregador Apple 30W original e cabo USB-C MagSafe',
      conditionOnEntry: 'Excelente estado, sem marcas',
      defect: 'Não liga após queda de raio na residência durante a chuva de ontem.',
      diagnosis: 'Placa lógica em análise. Fonte indica 5V 0.02A travado. Controlador USB-C CD3217 avariado. Necessária microsolda.',
      notes: 'Equipamento contém documentos jurídicos sigilosos. Preservar o chip SSD NAND onboard a todo custo.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 3)),
      technician: 'Lucas Silveira',
      priority: 'urgent',
      status: 'diagnosis',
      labor: 350,
      parts: 220,
      spentMinutes: 48,
      isTimerRunning: true,
      timerStartedAt: daysAgo(0),
      comments: [
        {
          id: 'cmt-4',
          authorName: 'Lucas Silveira',
          authorRole: 'Especialista em Microsolda',
          content: 'Injetado 5V na linha PPBUS_G3H. Aquecimento identificado no componente U3100. Chip novo separado no estoque.',
          kind: 'internal',
          createdAt: daysAgo(0),
        },
      ],
      attachments: [
        {
          id: 'att-2',
          name: 'laudo-tensao-placa.pdf',
          size: 450000,
          type: 'application/pdf',
          dataUrl: 'data:text/plain;base64,TGF1ZG8=',
          createdAt: daysAgo(0),
          uploaderName: 'Lucas Silveira',
        },
      ],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(1),
      updatedAt: daysAgo(0),
    }),
    normalizeWorkOrder({
      id: 'OS-7104',
      operationId: 'op-2026-09',
      customerName: 'Fernando Albuquerque',
      customerPhone: '(11) 98112-3344',
      customerDocument: '556.778.990-22',
      customerEmail: 'fernando.alb@gmail.com',
      itemName: 'Motorola Edge 40 Neo',
      itemBrand: 'Motorola',
      itemModel: 'Edge 40 Neo 5G',
      itemColor: 'Caneel Bay (Azul)',
      itemRef: 'IMEI 3567 8219 0345 678',
      devicePassword: '0000',
      accessories: 'Nenhum acessório deixado',
      conditionOnEntry: 'Vidro frontal estilhaçado com manchas pretas (vazamento de OLED)',
      defect: 'Display apagou completamente após impacto de moto.',
      diagnosis: 'Orçamento aprovado pelo cliente. Display curvo pOLED solicitado ao distribuidor oficial. Previsão de chegada em 2 dias úteis.',
      notes: 'Peça sob encomenda com código de rastreio #BR91823746. Aguardando entrega dos Correios.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 3)),
      technician: 'Ana Costa',
      priority: 'normal',
      status: 'waiting',
      quoteStatus: 'approved',
      labor: 110,
      parts: 530,
      spentMinutes: 20,
      comments: [
        {
          id: 'cmt-5',
          authorName: 'Ana Costa',
          authorRole: 'Técnica Responsável',
          content: 'Peça despachada pelo fornecedor parceiro. Notificado cliente sobre o prazo estimado.',
          kind: 'internal',
          createdAt: daysAgo(1),
        },
      ],
      attachments: [],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(2),
      updatedAt: daysAgo(1),
    }),
    normalizeWorkOrder({
      id: 'OS-7105',
      operationId: 'op-2026-09',
      customerName: 'Rodrigo Peixoto',
      customerPhone: '(21) 99887-1122',
      customerDocument: '889.990.112-33',
      customerEmail: 'rodrigo.games@hotmail.com',
      itemName: 'PlayStation 5 Disc Edition',
      itemBrand: 'Sony',
      itemModel: 'PS5 CFI-1114A',
      itemColor: 'Branco',
      itemRef: 'S/N 03-27451908-51',
      devicePassword: 'Sem senha',
      accessories: '1 Controle DualSense branco e cabo HDMI 2.1',
      conditionOnEntry: 'Poeira interna moderada, conector HDMI com folga visível',
      defect: 'Desliga sozinho após 15 minutos em jogos pesados acusando temperatura alta; tela pisca em 4K.',
      diagnosis: 'Oxidação e deslocamento do metal líquido sobre a APU. Pinos 3 e 7 do HDMI rompidos da trilha. Limpeza profunda, metal líquido com barreira e HDMI novo.',
      notes: 'Fazer teste de 2 horas no jogo Spider-Man 2 em modo Desempenho antes de liberar.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 1)),
      technician: 'Roberto Costa',
      priority: 'high',
      status: 'progress',
      labor: 220,
      parts: 130,
      spentMinutes: 75,
      isTimerRunning: true,
      timerStartedAt: daysAgo(0),
      comments: [
        {
          id: 'cmt-6',
          authorName: 'Roberto Costa',
          authorRole: 'Técnico Console & Hardware',
          content: 'Conector HDMI 2.1 novo soldado com sucesso. Limpeza de fluxo e alinhamento de pinos OK.',
          kind: 'internal',
          createdAt: daysAgo(0),
        },
        {
          id: 'cmt-7',
          authorName: 'Roberto Costa',
          authorRole: 'Técnico Console & Hardware',
          content: 'Metal líquido original removido da APU. Aplicado Thermal Grizzly com vedação protetora.',
          kind: 'internal',
          createdAt: daysAgo(0),
        },
      ],
      attachments: [
        {
          id: 'att-3',
          name: 'conector-hdmi-microscopio.jpg',
          size: 312000,
          type: 'image/jpeg',
          dataUrl: 'https://images.unsplash.com/photo-1597733336794-12d05021d510?w=300&auto=format&fit=crop&q=80',
          createdAt: daysAgo(0),
          uploaderName: 'Roberto Costa',
        },
      ],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(2),
      updatedAt: daysAgo(0),
    }),
    normalizeWorkOrder({
      id: 'OS-7106',
      operationId: 'op-2026-09',
      customerName: 'Mariana Goulart',
      customerPhone: '(24) 98122-8899',
      customerDocument: '667.889.001-44',
      customerEmail: 'mariana.goulart@gmail.com',
      itemName: 'Notebook Dell Inspiron 15 3520',
      itemBrand: 'Dell',
      itemModel: 'Inspiron 15 3520 Core i5',
      itemColor: 'Cinza Grafite',
      itemRef: 'Service Tag BRG8712X',
      devicePassword: '123456',
      accessories: 'Carregador Dell 65W original',
      conditionOnEntry: 'Aparelho muito conservado',
      defect: 'Lentidão excessiva para abrir programas e boot demorando mais de 5 minutos.',
      diagnosis: 'HD mecânico antigo de 1TB com setores defeituosos. Realizado upgrade para SSD NVMe 1TB, clonagem de dados e limpeza interna.',
      notes: 'Serviço concluído com êxito. Sistema inicializando em 8 segundos. Mensagem de pronto enviada no WhatsApp da cliente.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 0)),
      technician: 'Carlos Lima',
      priority: 'normal',
      status: 'ready',
      labor: 150,
      parts: 380,
      spentMinutes: 85,
      comments: [
        {
          id: 'cmt-8',
          authorName: 'Carlos Lima',
          authorRole: 'Técnico Responsável',
          content: 'Benchmark CrystalDiskMark: 3500 MB/s leitura e 2800 MB/s escrita. Aparelho pronto na estante de retiradas.',
          kind: 'internal',
          createdAt: daysAgo(0),
        },
      ],
      attachments: [],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(3),
      updatedAt: daysAgo(0),
    }),
    normalizeWorkOrder({
      id: 'OS-7107',
      operationId: 'op-2026-09',
      customerName: 'Tiago Barbosa',
      customerPhone: '(11) 97654-3210',
      customerDocument: '223.334.445-66',
      customerEmail: 'tiago.barbosa@outlook.com',
      itemName: 'Xiaomi Redmi Note 12 4G',
      itemBrand: 'Xiaomi',
      itemModel: 'Redmi Note 12 128GB',
      itemColor: 'Azul Céu',
      itemRef: 'IMEI 8675 4321 0987 654',
      devicePassword: '7890',
      accessories: 'Capa de silicone transparente',
      conditionOnEntry: 'Tampa traseira descolando levemente pela pressão da bateria',
      defect: 'Bateria inchou e aparelho descarrega muito rápido.',
      diagnosis: 'Substituição da bateria por modelo original BN5D de 5000mAh e nova fita de fixação. Higienização das saídas de áudio.',
      notes: 'Equipamento entregue ao cliente com termo de garantia de 90 dias assinado.',
      estimatedReadyAt: toDateKey(addDays(new Date(), -1)),
      technician: 'Lucas Silveira',
      priority: 'normal',
      status: 'delivered',
      labor: 90,
      parts: 160,
      spentMinutes: 40,
      deliveredAt: daysAgo(1),
      customerSignedName: 'Tiago Barbosa',
      comments: [
        {
          id: 'cmt-9',
          authorName: 'Lucas Silveira',
          authorRole: 'Técnico Responsável',
          content: 'Entregue no balcão pelo operador. Cliente conferiu 100% das funções.',
          kind: 'system',
          createdAt: daysAgo(1),
        },
      ],
      attachments: [],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(4),
      updatedAt: daysAgo(1),
    }),
    normalizeWorkOrder({
      id: 'OS-7108',
      operationId: 'op-2026-09',
      customerName: 'Beatriz Faria',
      customerPhone: '(24) 99988-7766',
      customerDocument: '778.889.990-55',
      customerEmail: 'beatriz.faria@gmail.com',
      itemName: 'Apple Watch Series 7 45mm',
      itemBrand: 'Apple',
      itemModel: 'Watch Series 7 GPS',
      itemColor: 'Meia-noite',
      itemRef: 'S/N FGG770K1N7',
      devicePassword: '1988',
      accessories: 'Pulseira esportiva preta original',
      conditionOnEntry: 'Vidro superior com trincado superficial no canto direito',
      defect: 'Vidro trincou ao bater na mesa de escritório; imagem e toque continuam perfeitos.',
      diagnosis: 'Recondicionamento do vidro com laminação OCA a vácuo, mantendo o display Retina OLED original.',
      notes: 'Avisar cliente que após recondicionamento a vedação para natação profunda não é recomendada.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 2)),
      technician: 'Ana Costa',
      priority: 'normal',
      status: 'open',
      labor: 180,
      parts: 140,
      spentMinutes: 15,
      comments: [
        {
          id: 'cmt-10',
          authorName: 'Ana Costa',
          authorRole: 'Técnica Responsável',
          content: 'Touch testado em 100% da área útil com aplicativo de desenho. Display intacto.',
          kind: 'internal',
          createdAt: daysAgo(0),
        },
      ],
      attachments: [],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(1),
      updatedAt: daysAgo(0),
    }),
    normalizeWorkOrder({
      id: 'OS-7109',
      operationId: 'op-2026-09',
      customerName: 'Gabriel Nogueira',
      customerPhone: '(11) 98765-4321',
      customerDocument: '334.556.778-99',
      customerEmail: 'gabriel.nogueira@gmail.com',
      itemName: 'Xiaomi Redmi Note 12',
      itemBrand: 'Xiaomi',
      itemModel: 'Redmi Note 12 128GB',
      itemColor: 'Azul',
      itemRef: 'IMEI 8675 4321 0987 654',
      devicePassword: '7890',
      accessories: 'Capa de silicone',
      conditionOnEntry: 'Tela frontal quebrada',
      defect: 'Trocar tela e ajustar botões de volume',
      diagnosis: 'Tela frontal substituída com sucesso. Durante teste de entrega ao cliente, os botões de volume não estavam funcionando. Reprovada para que o técnico revise e finalize o reparo.',
      notes: 'Reprovada na entrega ao cliente: tela trocada com sucesso, porém cliente testou e botões de volume continuam sem clique/travados. Retornado para o técnico dar continuidade e ajustar o flat dos botões.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 1)),
      technician: 'Carlos Lima',
      priority: 'high',
      status: 'reproved',
      labor: 160,
      parts: 220,
      spentMinutes: 65,
      comments: [
        {
          id: 'cmt-11',
          authorName: 'Carlos Lima',
          authorRole: 'Técnico Especialista',
          content: 'Troca da tela concluída. Módulo testado com imagem e touch 100%.',
          kind: 'internal',
          createdAt: daysAgo(1),
        },
        {
          id: 'cmt-12',
          authorName: 'Triagem Marthi',
          authorRole: 'Controle de Entrega',
          content: 'REPROVADA na entrega ao cliente: Foi solicitado a troca de tela e ajuste dos botões de volume. O técnico trocou a tela mas esqueceu de ajustar os botões de volume (estão duros sem clique). Retornado para o técnico Carlos Lima dar continuidade e finalizar.',
          kind: 'system',
          createdAt: daysAgo(0),
        },
        {
          id: 'cmt-13',
          authorName: 'Ramon de Freitas',
          authorRole: 'Analista de Suporte',
          content: 'Erro no vendas:\n1 - COMBATE DIST. DE BEBIDAS E ALIMENTOS\n\nData/Hora..: 25/09/2026 09:15:22\nAplicação..: C:\\SIG2000\\EXECUTAVEIS\\Vendas-ERP2-2081.exe\nBuild......:\nData App...: 25/09/2026 08:35:38\nVersão B.D.: 27.01.00\nFormulário.: TcxCustomInnerTextEdit\nUsuário....: SIG2000',
          kind: 'internal',
          createdAt: daysAgo(0),
        },
      ],
      attachments: [
        {
          id: 'att-rf-1',
          name: 'image-20260925-121611.png',
          size: 245000,
          type: 'image/png',
          dataUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=300&auto=format&fit=crop&q=80',
          createdAt: daysAgo(0),
          uploaderName: 'Ramon de Freitas',
        },
      ],
      history: [
        {
          id: 'hist-1',
          authorName: 'Ramon de Freitas',
          field: 'Status',
          action: 'alterou',
          fromValue: 'Em teste',
          toValue: 'tarefas reprovada',
          createdAt: daysAgo(0),
        },
        {
          id: 'hist-2',
          authorName: 'Ramon de Freitas',
          field: 'Anexo',
          action: 'adicionou',
          fromValue: 'Nenhuma',
          toValue: 'image-20260925-121611.png',
          createdAt: daysAgo(0),
        },
        {
          id: 'hist-3',
          authorName: 'Ramon de Freitas',
          field: 'Status',
          action: 'alterou',
          fromValue: 'Aguardando Teste',
          toValue: 'Em teste',
          createdAt: daysAgo(0),
        },
        {
          id: 'hist-4',
          authorName: 'Matheus Henrique Marçal Marques',
          authorPhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          field: 'Classificação',
          action: 'atualizou',
          fromValue: 'Nenhuma',
          toValue: 'Ranked higher',
          createdAt: daysAgo(1),
        },
        {
          id: 'hist-5',
          authorName: 'Matheus Henrique Marçal Marques',
          authorPhoto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          field: 'Status',
          action: 'alterou',
          fromValue: 'Aberta',
          toValue: 'Em serviço',
          createdAt: daysAgo(1),
        },
      ],
      worklogs: [
        {
          id: 'wlog-1',
          technicianName: 'Carlos Lima',
          technicianRole: 'Técnico Especialista',
          minutesSpent: 65,
          timeSpentFormatted: '1h 05m',
          description: 'Troca da tela frontal, limpeza da carcaça e testes iniciais.',
          startedAt: daysAgo(1),
          createdAt: daysAgo(1),
        },
      ],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(2),
      updatedAt: daysAgo(0),
    }),
    normalizeWorkOrder({
      id: 'OS-7110',
      operationId: 'op-2026-09',
      customerName: 'Camila Duarte',
      customerPhone: '(21) 98877-6655',
      customerDocument: '556.667.778-88',
      customerEmail: 'camila.duarte@empresa.com.br',
      itemName: 'Notebook Dell Inspiron 15',
      itemBrand: 'Dell',
      itemModel: 'Inspiron 15 3520',
      itemColor: 'Preto',
      itemRef: 'S/N 8XYZ123',
      devicePassword: 'dell2026',
      accessories: 'Fonte de alimentação original 65W',
      conditionOnEntry: 'Bom estado geral, carcaça sem trincas',
      defect: 'Upgrade para SSD NVMe 512GB e instalação do sistema operacional',
      diagnosis: 'Aparelho aguardando triagem técnica inicial e entrada na fila de bancada.',
      notes: 'OS cadastrada no totem / balcão de entrada. Ainda não inicializada nas operações ativas.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 3)),
      technician: '',
      priority: 'normal',
      status: 'backlog',
      labor: 150,
      parts: 260,
      spentMinutes: 0,
      comments: [
        {
          id: 'cmt-13',
          authorName: 'Totem de Entrada',
          authorRole: 'Sistema de Atendimento',
          content: 'Chamado criado pelo cliente no totem. Tarefa não inicializada (Backlog da oficina).',
          kind: 'system',
          createdAt: daysAgo(0),
        },
      ],
      attachments: [],
      lines: [],
      assetDisposition: 'customer',
      createdAt: daysAgo(0),
      updatedAt: daysAgo(0),
    }),
  ];
}

function load(): WorkOrder[] {
  if (memoryOrders) {
    return memoryOrders.map((item) => normalizeWorkOrder(item));
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const items = seed();
      save(items);
      return items;
    }
    const parsed = JSON.parse(raw) as Partial<WorkOrder>[];
    if (!Array.isArray(parsed) || parsed.length < 6) {
      const items = seed();
      save(items);
      return items;
    }
    const normalized = parsed.map((item) =>
      normalizeWorkOrder(item as Partial<WorkOrder> & Pick<WorkOrder, 'id'>),
    );
    // Assegura que novos status como backlog e reproved existam no estado local para demonstração imediata
    const seeds = seed();
    const hasReproved = normalized.some((o) => o.status === 'reproved');
    const hasBacklog = normalized.some((o) => o.status === 'backlog');
    let updated = false;
    if (!hasReproved) {
      const reprovedSeed = seeds.find((s) => s.status === 'reproved');
      if (reprovedSeed && !normalized.some((o) => o.id === reprovedSeed.id)) {
        normalized.unshift(reprovedSeed);
        updated = true;
      }
    }
    if (!hasBacklog) {
      const backlogSeed = seeds.find((s) => s.status === 'backlog');
      if (backlogSeed && !normalized.some((o) => o.id === backlogSeed.id)) {
        normalized.unshift(backlogSeed);
        updated = true;
      }
    }
    if (updated) {
      save(normalized);
    }
    return normalized;
  } catch {
    const items = seed();
    save(items);
    return items;
  }
}

function save(items: WorkOrder[]) {
  memoryOrders = items;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OS_STATE_EVENT));
  }
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
      if (patch.status !== undefined && patch.status !== item.status) {
        historyEntries.push({
          id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          authorName: 'Ramon de Freitas',
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
          authorName: 'Ramon de Freitas',
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
          authorName: 'Ramon de Freitas',
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

export function listTechnicians() {
  const names = new Set<string>();
  for (const order of listWorkOrders()) {
    const name = order.technician.trim();
    if (name) names.add(name);
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


