/**
 * Store de Orçamentos Comerciais do PDV (Marthi-Tec).
 *
 * Características principais:
 * - Ciclo comercial: Rascunho, Aberto, Enviado, Aguardando Aprovação, Aprovado, Recusado, Expirado, Cancelado, Convertido.
 * - Congelamento de preços praticados (tabelas, descontos, campanhas promocionais ativas no momento da emissão).
 * - Numeração sequencial própria (ex: 000123 / ORC-000123).
 * - Validade configurável com alerta automático de expiração.
 * - NÃO baixa estoque e NÃO gera financeiro na fase de orçamento.
 * - Rastreabilidade completa e histórico de eventos estilo auditoria.
 * - Suporte a duplicação e conversão direta em venda no PDV.
 */

export const POS_QUOTES_EVENT = 'marthi-pos-quotes-updated';
const STORAGE_KEY = 'marthi.pos.quotes.v1';
const SETTINGS_KEY = 'marthi.pos.quotes.settings.v1';

export type PosQuoteStatus =
  | 'draft'
  | 'open'
  | 'sent'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'converted';

export const QUOTE_STATUS_LABEL: Record<PosQuoteStatus, string> = {
  draft: 'Rascunho',
  open: 'Aberto',
  sent: 'Enviado ao Cliente',
  pending_approval: 'Aguardando Aprovação',
  approved: 'Aprovado',
  rejected: 'Recusado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
  converted: 'Convertido em Venda',
};

export const QUOTE_STATUS_COLOR: Record<PosQuoteStatus, { bg: string; text: string; border: string }> = {
  draft: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  open: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  sent: { bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4' },
  pending_approval: { bg: '#fefce8', text: '#a16207', border: '#fef08a' },
  approved: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  rejected: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  expired: { bg: '#fff1f2', text: '#be123c', border: '#fecdd3' },
  cancelled: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  converted: { bg: '#f0fdf4', text: '#15803d', border: '#86efac' },
};

export type PosQuoteLine = {
  id: string;
  stockId: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  basePrice: number;
  unitPrice: number;
  lineDiscount: number;
  lineDiscountMode: 'money' | 'percent';
  lineSurcharge: number;
  lineSurchargeMode: 'money' | 'percent';
  total: number;
  promoLabel?: string;
  campaignId?: string;
  isAdHoc?: boolean;
  itemType?: 'product' | 'ad_hoc';
};

export type PosQuoteHistoryEntry = {
  id: string;
  actorName: string;
  action: 'criou' | 'alterou' | 'enviou' | 'aprovou' | 'recusou' | 'imprimiu' | 'duplicou' | 'converteu' | 'cancelou';
  details: string;
  createdAt: string;
};

export type PosQuote = {
  id: string;
  quoteNumber: string;
  sequenceNumber: number;
  customerId: string;
  customerName: string;
  customerDocument: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress?: string;
  sellerId: string;
  sellerName: string;
  status: PosQuoteStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  validityDays: number;
  priceTableName?: string;
  priceTableId?: string;
  deliveryTerm?: string;
  paymentConditions?: string;
  notes: string;
  subtotal: number;
  discount: number;
  discountMode: 'money' | 'percent';
  surcharge: number;
  surchargeMode: 'money' | 'percent';
  total: number;
  lines: PosQuoteLine[];
  history: PosQuoteHistoryEntry[];
  convertedOrderId?: string;
  convertedAt?: string;
  printedCount: number;
};

export type PosQuoteSettings = {
  defaultValidityDays: number;
  defaultDeliveryTerm: string;
  defaultPaymentConditions: string;
  defaultNotes: string;
  autoExpireCheck: boolean;
};

export const DEFAULT_QUOTE_SETTINGS: PosQuoteSettings = {
  defaultValidityDays: 7,
  defaultDeliveryTerm: 'Imediato / Conforme disponibilidade de estoque',
  defaultPaymentConditions: 'À vista no Pix / Dinheiro ou Cartão em até 12x',
  defaultNotes: 'Preços válidos exclusivamente durante o prazo da proposta. Materiais sujeitos à confirmação de disponibilidade no momento do fechamento.',
  autoExpireCheck: true,
};

type State = {
  quotes: PosQuote[];
  lastSequence: number;
};

function uid(prefix = 'ORC') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function formatSequence(num: number): string {
  return String(num).padStart(6, '0');
}

function loadSettings(): PosQuoteSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_QUOTE_SETTINGS };
    return { ...DEFAULT_QUOTE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_QUOTE_SETTINGS };
  }
}

export function saveQuoteSettings(next: Partial<PosQuoteSettings>): PosQuoteSettings {
  const current = loadSettings();
  const merged = { ...current, ...next };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  return merged;
}

export function getQuoteSettings(): PosQuoteSettings {
  return loadSettings();
}

function seedQuotes(): State {
  return {
    quotes: [],
    lastSequence: 100,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedQuotes();
      save(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<State>;
    const rawQuotes = Array.isArray(parsed.quotes) ? parsed.quotes.map(normalizeQuote) : [];
    const quotes = rawQuotes.filter((q) => q.id && !q.id.startsWith('ORC-DEMO-'));
    const maxSeq = quotes.reduce((acc, q) => Math.max(acc, q.sequenceNumber || 0), parsed.lastSequence || 100);
    const state: State = {
      quotes,
      lastSequence: maxSeq,
    };
    if (quotes.length !== rawQuotes.length) {
      save(state);
    }
    return state;
  } catch {
    return seedQuotes();
  }
}

function save(state: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(POS_QUOTES_EVENT));
  }
}

function normalizeQuote(raw: any): PosQuote {
  const seq = Number(raw.sequenceNumber) || 1;
  const quoteNumber = raw.quoteNumber || formatSequence(seq);
  const now = new Date().toISOString();
  return {
    id: String(raw.id || uid()),
    quoteNumber,
    sequenceNumber: seq,
    customerId: String(raw.customerId || ''),
    customerName: String(raw.customerName || 'Consumidor Final'),
    customerDocument: String(raw.customerDocument || ''),
    customerPhone: String(raw.customerPhone || ''),
    customerEmail: String(raw.customerEmail || ''),
    customerAddress: String(raw.customerAddress || ''),
    sellerId: String(raw.sellerId || ''),
    sellerName: String(raw.sellerName || 'Vendedor'),
    status: (raw.status || 'open') as PosQuoteStatus,
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    expiresAt: raw.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
    validityDays: Number(raw.validityDays) || 7,
    priceTableName: raw.priceTableName || 'Padrão',
    priceTableId: raw.priceTableId || '',
    deliveryTerm: raw.deliveryTerm || '',
    paymentConditions: raw.paymentConditions || '',
    notes: raw.notes || '',
    subtotal: Math.max(0, Number(raw.subtotal) || 0),
    discount: Math.max(0, Number(raw.discount) || 0),
    discountMode: raw.discountMode === 'percent' ? 'percent' : 'money',
    surcharge: Math.max(0, Number(raw.surcharge) || 0),
    surchargeMode: raw.surchargeMode === 'percent' ? 'percent' : 'money',
    total: Math.max(0, Number(raw.total) || 0),
    lines: Array.isArray(raw.lines) ? raw.lines.map(normalizeLine) : [],
    history: Array.isArray(raw.history) ? raw.history.map(normalizeHistory) : [],
    convertedOrderId: raw.convertedOrderId || undefined,
    convertedAt: raw.convertedAt || undefined,
    printedCount: Number(raw.printedCount) || 0,
  };
}

function normalizeLine(raw: any): PosQuoteLine {
  return {
    id: String(raw.id || uid('line')),
    stockId: String(raw.stockId || ''),
    sku: String(raw.sku || ''),
    name: String(raw.name || 'Produto'),
    unit: String(raw.unit || 'UN'),
    qty: Math.max(0.001, Number(raw.qty) || 1),
    basePrice: Math.max(0, Number(raw.basePrice) || 0),
    unitPrice: Math.max(0, Number(raw.unitPrice) || 0),
    lineDiscount: Math.max(0, Number(raw.lineDiscount) || 0),
    lineDiscountMode: raw.lineDiscountMode === 'percent' ? 'percent' : 'money',
    lineSurcharge: Math.max(0, Number(raw.lineSurcharge) || 0),
    lineSurchargeMode: raw.lineSurchargeMode === 'percent' ? 'percent' : 'money',
    total: Math.max(0, Number(raw.total) || 0),
    promoLabel: raw.promoLabel || undefined,
    campaignId: raw.campaignId || undefined,
  };
}

function normalizeHistory(raw: any): PosQuoteHistoryEntry {
  return {
    id: String(raw.id || uid('hist')),
    actorName: String(raw.actorName || 'Sistema'),
    action: raw.action || 'alterou',
    details: String(raw.details || ''),
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

/** Verifica se um orçamento está expirado comparando a data atual com expiresAt. */
export function isQuoteExpired(quote: PosQuote, nowMs = Date.now()): boolean {
  if (quote.status === 'converted' || quote.status === 'cancelled') return false;
  if (!quote.expiresAt) return false;
  const expTime = Date.parse(quote.expiresAt);
  if (Number.isNaN(expTime)) return false;
  return expTime < nowMs;
}

/** Atualiza status de orçamentos expirados automaticamente caso configurado. */
export function autoSyncExpiredQuotes(): void {
  const settings = getQuoteSettings();
  if (!settings.autoExpireCheck) return;
  const state = load();
  const nowMs = Date.now();
  let changed = false;

  for (const quote of state.quotes) {
    if ((quote.status === 'open' || quote.status === 'sent' || quote.status === 'pending_approval') && isQuoteExpired(quote, nowMs)) {
      quote.status = 'expired';
      quote.updatedAt = new Date().toISOString();
      quote.history.push({
        id: uid('hist'),
        actorName: 'Sistema',
        action: 'alterou',
        details: `Prazo de validade expirou em ${new Date(quote.expiresAt).toLocaleDateString('pt-BR')}.`,
        createdAt: new Date().toISOString(),
      });
      changed = true;
    }
  }

  if (changed) {
    save(state);
  }
}

/** Retorna todos os orçamentos, ordenados por data decrescente. */
export function listPosQuotes(): PosQuote[] {
  autoSyncExpiredQuotes();
  return load().quotes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Retorna um orçamento por ID ou número. */
export function getPosQuote(idOrNumber: string): PosQuote | null {
  const all = listPosQuotes();
  return (
    all.find(
      (q) =>
        q.id === idOrNumber ||
        q.quoteNumber === idOrNumber ||
        `ORC-${q.quoteNumber}` === idOrNumber ||
        q.id.toLowerCase() === idOrNumber.toLowerCase(),
    ) ?? null
  );
}

export type CreatePosQuoteInput = {
  customerId?: string;
  customerName?: string;
  customerDocument?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  sellerId?: string;
  sellerName?: string;
  validityDays?: number;
  expiresAt?: string;
  priceTableName?: string;
  priceTableId?: string;
  deliveryTerm?: string;
  paymentConditions?: string;
  notes?: string;
  discount?: number;
  discountMode?: 'money' | 'percent';
  surcharge?: number;
  surchargeMode?: 'money' | 'percent';
  lines: Omit<PosQuoteLine, 'id'>[];
  actorName: string;
};

/** Cria um novo orçamento a partir do PDV ou Retaguarda. */
export function createPosQuote(input: CreatePosQuoteInput): PosQuote {
  const state = load();
  const settings = getQuoteSettings();
  const now = new Date();
  const nextSeq = state.lastSequence + 1;
  const quoteNumber = formatSequence(nextSeq);

  const validityDays = input.validityDays ?? settings.defaultValidityDays ?? 7;
  let expiresAt = input.expiresAt;
  if (!expiresAt) {
    const expDate = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
    expDate.setHours(23, 59, 59, 999);
    expiresAt = expDate.toISOString();
  }

  const lines: PosQuoteLine[] = input.lines.map((line, idx) => ({
    ...line,
    id: `line-${nextSeq}-${idx + 1}-${Date.now()}`,
    total: Math.round(line.qty * line.unitPrice * 100) / 100,
  }));

  const subtotal = lines.reduce((acc, l) => acc + l.total, 0);
  const discountVal =
    input.discountMode === 'percent'
      ? Math.round(((subtotal * (input.discount || 0)) / 100) * 100) / 100
      : (input.discount || 0);
  const surchargeVal =
    input.surchargeMode === 'percent'
      ? Math.round(((subtotal * (input.surcharge || 0)) / 100) * 100) / 100
      : (input.surcharge || 0);
  const total = Math.max(0, Math.round((subtotal - discountVal + surchargeVal) * 100) / 100);

  const newQuote: PosQuote = {
    id: uid('ORC'),
    quoteNumber,
    sequenceNumber: nextSeq,
    customerId: input.customerId?.trim() || '',
    customerName: input.customerName?.trim() || 'Consumidor Final',
    customerDocument: input.customerDocument?.trim() || '',
    customerPhone: input.customerPhone?.trim() || '',
    customerEmail: input.customerEmail?.trim() || '',
    customerAddress: input.customerAddress?.trim() || '',
    sellerId: input.sellerId?.trim() || '',
    sellerName: input.sellerName?.trim() || input.actorName || 'Vendedor',
    status: 'open',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt,
    validityDays,
    priceTableName: input.priceTableName || 'Padrão',
    priceTableId: input.priceTableId || '',
    deliveryTerm: input.deliveryTerm ?? settings.defaultDeliveryTerm,
    paymentConditions: input.paymentConditions ?? settings.defaultPaymentConditions,
    notes: input.notes ?? settings.defaultNotes,
    subtotal: Math.round(subtotal * 100) / 100,
    discount: input.discount || 0,
    discountMode: input.discountMode || 'money',
    surcharge: input.surcharge || 0,
    surchargeMode: input.surchargeMode || 'money',
    total,
    lines,
    printedCount: 0,
    history: [
      {
        id: uid('hist'),
        actorName: input.actorName || 'Operador',
        action: 'criou',
        details: `Orçamento nº ${quoteNumber} emitido com validade de ${validityDays} dias (até ${new Date(expiresAt).toLocaleDateString('pt-BR')}).`,
        createdAt: now.toISOString(),
      },
    ],
  };

  state.quotes.unshift(newQuote);
  state.lastSequence = nextSeq;
  save(state);
  return newQuote;
}

/** Atualiza dados de um orçamento existente (se não estiver convertido ou cancelado). */
export function updatePosQuote(
  id: string,
  patch: Partial<Omit<PosQuote, 'id' | 'quoteNumber' | 'sequenceNumber' | 'createdAt' | 'history'>>,
  actorName: string,
): { ok: true; quote: PosQuote } | { ok: false; error: string } {
  const state = load();
  const index = state.quotes.findIndex((q) => q.id === id);
  if (index === -1) return { ok: false, error: 'Orçamento não encontrado.' };

  const current = state.quotes[index];
  if (current.status === 'converted') {
    return { ok: false, error: 'Não é possível alterar um orçamento já convertido em venda.' };
  }

  const now = new Date().toISOString();
  const nextLines = patch.lines ?? current.lines;
  const subtotal = nextLines.reduce((acc, l) => acc + l.total, 0);

  const discMode = patch.discountMode ?? current.discountMode;
  const discRaw = patch.discount ?? current.discount;
  const discountVal =
    discMode === 'percent'
      ? Math.round(((subtotal * discRaw) / 100) * 100) / 100
      : discRaw;

  const surMode = patch.surchargeMode ?? current.surchargeMode;
  const surRaw = patch.surcharge ?? current.surcharge;
  const surchargeVal =
    surMode === 'percent'
      ? Math.round(((subtotal * surRaw) / 100) * 100) / 100
      : surRaw;

  const total = Math.max(0, Math.round((subtotal - discountVal + surchargeVal) * 100) / 100);

  const updated: PosQuote = {
    ...current,
    ...patch,
    subtotal: Math.round(subtotal * 100) / 100,
    total,
    lines: nextLines,
    updatedAt: now,
  };

  updated.history.push({
    id: uid('hist'),
    actorName: actorName || 'Operador',
    action: 'alterou',
    details: 'Dados do orçamento revisados e atualizados.',
    createdAt: now,
  });

  state.quotes[index] = updated;
  save(state);
  return { ok: true, quote: updated };
}

/** Atualiza status de um orçamento (ex: Aprovado, Recusado, Cancelado, Enviado). */
export function changeQuoteStatus(
  id: string,
  newStatus: PosQuoteStatus,
  actorName: string,
  reason?: string,
): { ok: true; quote: PosQuote } | { ok: false; error: string } {
  const state = load();
  const quote = state.quotes.find((q) => q.id === id);
  if (!quote) return { ok: false, error: 'Orçamento não encontrado.' };

  if (quote.status === 'converted' && newStatus !== 'converted') {
    return { ok: false, error: 'Orçamento já foi convertido em venda e não pode ter status revertido.' };
  }

  const now = new Date().toISOString();
  const oldLabel = QUOTE_STATUS_LABEL[quote.status];
  const newLabel = QUOTE_STATUS_LABEL[newStatus];

  quote.status = newStatus;
  quote.updatedAt = now;
  quote.history.push({
    id: uid('hist'),
    actorName: actorName || 'Operador',
    action:
      newStatus === 'approved'
        ? 'aprovou'
        : newStatus === 'rejected'
          ? 'recusou'
          : newStatus === 'cancelled'
            ? 'cancelou'
            : newStatus === 'sent'
              ? 'enviou'
              : 'alterou',
    details: `Status alterado de "${oldLabel}" para "${newLabel}"${reason ? `. Motivo: ${reason}` : ''}.`,
    createdAt: now,
  });

  save(state);
  return { ok: true, quote };
}

/** Duplica um orçamento gerando uma nova proposta preservando os produtos e condições. */
export function duplicatePosQuote(
  id: string,
  actorName: string,
): { ok: true; quote: PosQuote } | { ok: false; error: string } {
  const original = getPosQuote(id);
  if (!original) return { ok: false, error: 'Orçamento de origem não encontrado.' };

  const settings = getQuoteSettings();
  const created = createPosQuote({
    customerId: original.customerId,
    customerName: original.customerName,
    customerDocument: original.customerDocument,
    customerPhone: original.customerPhone,
    customerEmail: original.customerEmail,
    customerAddress: original.customerAddress,
    sellerId: original.sellerId,
    sellerName: original.sellerName,
    validityDays: original.validityDays || settings.defaultValidityDays,
    priceTableName: original.priceTableName,
    priceTableId: original.priceTableId,
    deliveryTerm: original.deliveryTerm,
    paymentConditions: original.paymentConditions,
    notes: original.notes,
    discount: original.discount,
    discountMode: original.discountMode,
    surcharge: original.surcharge,
    surchargeMode: original.surchargeMode,
    lines: original.lines.map((l) => ({
      stockId: l.stockId,
      sku: l.sku,
      name: l.name,
      unit: l.unit,
      qty: l.qty,
      basePrice: l.basePrice,
      unitPrice: l.unitPrice,
      lineDiscount: l.lineDiscount,
      lineDiscountMode: l.lineDiscountMode,
      lineSurcharge: l.lineSurcharge,
      lineSurchargeMode: l.lineSurchargeMode,
      total: l.total,
      promoLabel: l.promoLabel,
      campaignId: l.campaignId,
    })),
    actorName,
  });

  created.history.push({
    id: uid('hist'),
    actorName,
    action: 'duplicou',
    details: `Duplicado a partir do orçamento original nº ${original.quoteNumber}.`,
    createdAt: new Date().toISOString(),
  });

  const state = load();
  const idx = state.quotes.findIndex((q) => q.id === created.id);
  if (idx !== -1) {
    state.quotes[idx] = created;
    save(state);
  }

  return { ok: true, quote: created };
}

/** Registra impressão de um orçamento para histórico de auditoria. */
export function registerQuotePrint(id: string, actorName: string): void {
  const state = load();
  const quote = state.quotes.find((q) => q.id === id);
  if (!quote) return;

  quote.printedCount = (quote.printedCount || 0) + 1;
  quote.history.push({
    id: uid('hist'),
    actorName: actorName || 'Operador',
    action: 'imprimiu',
    details: `Documento impresso / visualizado (${quote.printedCount}ª via).`,
    createdAt: new Date().toISOString(),
  });
  save(state);
}

/** Converte orçamento em venda (acionado quando a venda do PDV é concluída). */
export function markQuoteConverted(
  quoteId: string,
  orderId: string,
  actorName: string,
): { ok: true; quote: PosQuote } | { ok: false; error: string } {
  const state = load();
  const quote = state.quotes.find((q) => q.id === quoteId);
  if (!quote) return { ok: false, error: 'Orçamento não encontrado.' };

  const now = new Date().toISOString();
  quote.status = 'converted';
  quote.convertedOrderId = orderId;
  quote.convertedAt = now;
  quote.updatedAt = now;
  quote.history.push({
    id: uid('hist'),
    actorName: actorName || 'Operador PDV',
    action: 'converteu',
    details: `Orçamento convertido com sucesso na Venda #${orderId}.`,
    createdAt: now,
  });

  save(state);
  return { ok: true, quote };
}

/** Exclui um orçamento (caso não esteja convertido). */
export function deletePosQuote(id: string): { ok: true } | { ok: false; error: string } {
  const state = load();
  const quote = state.quotes.find((q) => q.id === id);
  if (!quote) return { ok: false, error: 'Orçamento não encontrado.' };
  if (quote.status === 'converted') {
    return { ok: false, error: 'Não é permitido excluir um orçamento já convertido em venda.' };
  }

  state.quotes = state.quotes.filter((q) => q.id !== id);
  save(state);
  return { ok: true };
}

/** Orçamentos de um cliente específico (pelo ID, documento ou telefone). */
export function listQuotesForCustomer(
  customerId?: string,
  document?: string,
  phone?: string,
): PosQuote[] {
  const all = listPosQuotes();
  const cleanDoc = (document || '').replace(/\D/g, '');
  const cleanPhone = (phone || '').replace(/\D/g, '');

  return all.filter((q) => {
    if (customerId && q.customerId && q.customerId === customerId) return true;
    if (cleanDoc && q.customerDocument && q.customerDocument.replace(/\D/g, '') === cleanDoc) return true;
    if (cleanPhone && cleanPhone.length >= 8 && q.customerPhone && q.customerPhone.replace(/\D/g, '').includes(cleanPhone)) return true;
    return false;
  });
}

/** KPIs consolidados para o Dashboard de Orçamentos. */
export function getQuotesDashboardKpis() {
  const quotes = listPosQuotes();
  const now = Date.now();

  const openCount = quotes.filter((q) => q.status === 'open' || q.status === 'sent' || q.status === 'pending_approval').length;
  const approvedCount = quotes.filter((q) => q.status === 'approved').length;
  const convertedCount = quotes.filter((q) => q.status === 'converted').length;
  const expiredCount = quotes.filter((q) => q.status === 'expired' || isQuoteExpired(q, now)).length;

  // Orçamentos expirando nas próximas 48 horas
  const expiringSoonCount = quotes.filter((q) => {
    if (q.status !== 'open' && q.status !== 'sent' && q.status !== 'pending_approval') return false;
    const exp = Date.parse(q.expiresAt);
    if (Number.isNaN(exp)) return false;
    const diffHours = (exp - now) / (1000 * 60 * 60);
    return diffHours > 0 && diffHours <= 48;
  }).length;

  const totalInNegotiation = quotes
    .filter((q) => q.status === 'open' || q.status === 'sent' || q.status === 'pending_approval' || q.status === 'approved')
    .reduce((sum, q) => sum + q.total, 0);

  const totalConverted = quotes
    .filter((q) => q.status === 'converted')
    .reduce((sum, q) => sum + q.total, 0);

  return {
    totalQuotes: quotes.length,
    openCount,
    approvedCount,
    convertedCount,
    expiredCount,
    expiringSoonCount,
    totalInNegotiation,
    totalConverted,
  };
}
