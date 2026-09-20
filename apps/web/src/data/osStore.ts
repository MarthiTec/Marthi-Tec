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
    revenueFinanceId: raw.revenueFinanceId,
    progressStartedAt: raw.progressStartedAt,
    deliveredAt: raw.deliveredAt,
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
      customerDocument: '123.456.789-00',
      customerEmail: 'ana@email.com',
      itemName: 'iPhone 15',
      itemBrand: 'Apple',
      itemModel: 'iPhone 15',
      itemColor: 'Preto',
      itemRef: 'IMEI 3598 4412',
      devicePassword: '1234',
      accessories: 'Capa + cabo',
      conditionOnEntry: 'Tela trincada; laterais ok',
      defect: 'Tela trincada e toque falhando no canto.',
      diagnosis: '',
      notes: 'Pediu orçamento antes de autorizar.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 2)),
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
      customerDocument: '',
      customerEmail: '',
      itemName: 'Notebook Dell',
      itemBrand: 'Dell',
      itemModel: 'Inspiron',
      itemColor: '',
      itemRef: 'S/N 7XK22',
      devicePassword: '',
      accessories: 'Fonte',
      conditionOnEntry: 'Sem marcas aparentes',
      defect: 'Não liga. Só o LED da fonte acende.',
      diagnosis: '',
      notes: '',
      estimatedReadyAt: toDateKey(addDays(new Date(), 0)),
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
      customerDocument: '',
      customerEmail: '',
      itemName: 'Óculos de grau',
      itemBrand: '',
      itemModel: '',
      itemColor: '',
      itemRef: 'OS armação 882',
      devicePassword: '',
      accessories: '',
      conditionOnEntry: '',
      defect: 'Troca de lentes e ajuste da haste.',
      diagnosis: '',
      notes: 'Retirada combinada para sexta.',
      estimatedReadyAt: toDateKey(addDays(new Date(), 4)),
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

export function updateWorkOrder(id: string, patch: Partial<Omit<WorkOrder, 'id' | 'createdAt'>>) {
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

export function newWorkOrderLineId() {
  return lineUid();
}

export type QuoteActionResult =
  | { ok: true; order: WorkOrder }
  | { ok: false; error: string };

/** Marca orçamento como rascunho (ainda editável). */
export function draftQuote(
  id: string,
  input: { labor?: number; parts?: number; quoteNotes?: string; quoteValidUntil?: string },
): QuoteActionResult {
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada — não dá para alterar orçamento.' };
  }
  if (current.quoteStatus === 'approved') {
    return { ok: false, error: 'Orçamento já aprovado. Crie revisão nas observações se precisar.' };
  }

  const order = updateWorkOrder(id, {
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
export function sendQuote(id: string): QuoteActionResult {
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada.' };
  }
  const total = workOrderTotal(current);
  if (total <= 0 && !current.quoteNotes.trim()) {
    return { ok: false, error: 'Informe valores ou descrição do orçamento antes de enviar.' };
  }

  const order = updateWorkOrder(id, {
    quoteStatus: 'sent',
    quoteSentAt: now(),
    quoteDecidedAt: undefined,
    status: current.status === 'open' || current.status === 'diagnosis' ? 'waiting' : current.status,
  });
  if (!order) return { ok: false, error: 'Falha ao enviar orçamento.' };
  return { ok: true, order };
}

/** Cliente aprovou → pode seguir para serviço. */
export function approveQuote(id: string, moveToProgress = true): QuoteActionResult {
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.quoteStatus !== 'sent' && current.quoteStatus !== 'draft') {
    return { ok: false, error: 'Só dá para aprovar orçamento enviado ou em rascunho.' };
  }

  const order = updateWorkOrder(id, {
    quoteStatus: 'approved',
    quoteDecidedAt: now(),
    status: moveToProgress ? 'progress' : current.status,
  });
  if (!order) return { ok: false, error: 'Falha ao aprovar orçamento.' };
  return { ok: true, order };
}

/** Cliente recusou. */
export function rejectQuote(id: string): QuoteActionResult {
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.quoteStatus !== 'sent' && current.quoteStatus !== 'draft') {
    return { ok: false, error: 'Só dá para recusar orçamento enviado ou em rascunho.' };
  }

  const order = updateWorkOrder(id, {
    quoteStatus: 'rejected',
    quoteDecidedAt: now(),
    status: 'waiting',
  });
  if (!order) return { ok: false, error: 'Falha ao recusar orçamento.' };
  return { ok: true, order };
}

/** Volta orçamento para edição após recusa. */
export function reopenQuote(id: string): QuoteActionResult {
  const current = getWorkOrder(id);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.quoteStatus !== 'rejected' && current.quoteStatus !== 'sent') {
    return { ok: false, error: 'Nada para reabrir.' };
  }
  const order = updateWorkOrder(id, {
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

export function addWorkOrderPhoto(
  osId: string,
  input: { kind: WorkOrderPhotoKind; dataUrl: string; caption?: string },
): QuoteActionResult {
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
  const order = updateWorkOrder(osId, { photos: [...current.photos, photo] });
  if (!order) return { ok: false, error: 'Falha ao salvar foto.' };
  return { ok: true, order };
}

export function removeWorkOrderPhoto(osId: string, photoId: string): QuoteActionResult {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada — não dá para remover fotos.' };
  }
  const order = updateWorkOrder(osId, {
    photos: current.photos.filter((photo) => photo.id !== photoId),
  });
  if (!order) return { ok: false, error: 'Falha ao remover foto.' };
  return { ok: true, order };
}

export function updateWorkOrderPhotoCaption(
  osId: string,
  photoId: string,
  caption: string,
): QuoteActionResult {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  const order = updateWorkOrder(osId, {
    photos: current.photos.map((photo) =>
      photo.id === photoId ? { ...photo, caption: caption.trim() } : photo,
    ),
  });
  if (!order) return { ok: false, error: 'Falha ao atualizar legenda.' };
  return { ok: true, order };
}

export function setChecklistItem(
  osId: string,
  itemId: string,
  patch: { mark?: ChecklistMark; note?: string },
): QuoteActionResult {
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
  const order = updateWorkOrder(osId, { checklist });
  if (!order) return { ok: false, error: 'Falha ao atualizar checklist.' };
  return { ok: true, order };
}

export function resetWorkOrderChecklist(osId: string): QuoteActionResult {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada.' };
  }
  const order = updateWorkOrder(osId, { checklist: buildDefaultChecklist() });
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

export function saveCustomerSignature(
  osId: string,
  input: { dataUrl: string; signedName?: string },
): QuoteActionResult {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'cancelled') return { ok: false, error: 'OS cancelada.' };
  if (!input.dataUrl.startsWith('data:image')) {
    return { ok: false, error: 'Assinatura inválida.' };
  }
  const order = updateWorkOrder(osId, {
    customerSignature: input.dataUrl,
    customerSignedAt: now(),
    customerSignedName: (input.signedName ?? current.customerName).trim(),
  });
  if (!order) return { ok: false, error: 'Falha ao salvar assinatura.' };
  return { ok: true, order };
}

export function clearCustomerSignature(osId: string): QuoteActionResult {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada — assinatura bloqueada.' };
  }
  const order = updateWorkOrder(osId, {
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
      const pri = { high: 0, normal: 1, low: 2 }[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority];
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

export function setWorkOrderReadyDate(osId: string, date: string): QuoteActionResult {
  const current = getWorkOrder(osId);
  if (!current) return { ok: false, error: 'OS não encontrada.' };
  if (current.status === 'delivered' || current.status === 'cancelled') {
    return { ok: false, error: 'OS encerrada.' };
  }
  const value = date.trim();
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: 'Data inválida.' };
  }
  const order = updateWorkOrder(osId, { estimatedReadyAt: value });
  if (!order) return { ok: false, error: 'Falha ao salvar previsão.' };
  return { ok: true, order };
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

