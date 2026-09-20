/**
 * Adapter fiscal (MVP).
 * Hoje: emissão simulada (homologação local).
 * Próximo passo: trocar `provider` para ACBr API / Focus sem mudar a UI.
 */

const STORAGE_KEY = 'marthi.fiscal.docs.v1';

export type FiscalDocKind = 'nfe' | 'nfce' | 'nfse' | 'receipt';
export type FiscalDocStatus = 'authorized' | 'pending' | 'cancelled' | 'error';
export type FiscalRefType = 'sale' | 'os';

export type FiscalDocument = {
  id: string;
  kind: FiscalDocKind;
  status: FiscalDocStatus;
  refType: FiscalRefType;
  refId: string;
  customerName: string;
  customerDocument?: string;
  amount: number;
  number: string;
  series: string;
  accessKey: string;
  provider: 'mock';
  createdAt: string;
  message: string;
};

type State = { documents: FiscalDocument[] };

export const FISCAL_KIND_LABEL: Record<FiscalDocKind, string> = {
  nfe: 'NF-e',
  nfce: 'NFC-e',
  nfse: 'NFS-e',
  receipt: 'Notinha',
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { documents: [] };
    const parsed = JSON.parse(raw) as Partial<State>;
    return { documents: Array.isArray(parsed.documents) ? parsed.documents : [] };
  } catch {
    return { documents: [] };
  }
}

function save(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-fiscal-docs-updated'));
}

function fakeAccessKey() {
  let key = '';
  for (let i = 0; i < 44; i += 1) key += String(Math.floor(Math.random() * 10));
  return key;
}

export function listFiscalDocuments() {
  return load().documents;
}

export function getFiscalDocument(id: string) {
  return load().documents.find((item) => item.id === id) ?? null;
}

export function getFiscalDocumentForRef(refType: FiscalRefType, refId: string) {
  return (
    load().documents.find(
      (item) => item.refType === refType && item.refId === refId && item.status === 'authorized',
    ) ?? null
  );
}

/** Último documento fiscal do pedido (qualquer status). */
export function getLatestFiscalDocumentForRef(refType: FiscalRefType, refId: string) {
  return (
    load().documents.find((item) => item.refType === refType && item.refId === refId) ?? null
  );
}

export const FISCAL_STATUS_LABEL: Record<FiscalDocStatus, string> = {
  authorized: 'Autorizada SEFAZ',
  pending: 'Pendente SEFAZ',
  cancelled: 'Cancelada',
  error: 'Rejeitada SEFAZ',
};

export function cancelFiscalDocumentForSale(
  orderId: string,
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  const state = load();
  const document = state.documents.find(
    (item) => item.refType === 'sale' && item.refId === orderId && item.status === 'authorized',
  );
  if (!document) return { ok: false, error: 'Nenhum documento autorizado para cancelar.' };
  document.status = 'cancelled';
  document.message = `Cancelamento simulado · ${document.message}`;
  save(state);
  return { ok: true, document };
}

export function reprintFiscalDocument(
  orderId: string,
): { ok: true; document: FiscalDocument; text: string } | { ok: false; error: string } {
  const document = getLatestFiscalDocumentForRef('sale', orderId);
  if (!document) return { ok: false, error: 'Nada para reimprimir neste pedido.' };
  const text = [
    `${FISCAL_KIND_LABEL[document.kind]} ${document.number}/${document.series}`,
    `Status: ${FISCAL_STATUS_LABEL[document.status]}`,
    `Cliente: ${document.customerName}`,
    `Valor: ${document.amount.toFixed(2)}`,
    document.accessKey ? `Chave: ${document.accessKey}` : '',
    document.message,
  ]
    .filter(Boolean)
    .join('\n');
  return { ok: true, document, text };
}

export function emitNfeFromSale(input: {
  orderId: string;
  customerName: string;
  amount: number;
  asNfce?: boolean;
  customerDocument?: string;
}): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  if (!input.orderId) return { ok: false, error: 'Pedido inválido.' };
  if (input.amount <= 0) return { ok: false, error: 'Valor deve ser maior que zero.' };

  const existing = getFiscalDocumentForRef('sale', input.orderId);
  if (existing) return { ok: false, error: `Já existe ${FISCAL_KIND_LABEL[existing.kind]} para este pedido.` };

  const kind: FiscalDocKind = input.asNfce ? 'nfce' : 'nfe';
  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind,
    status: 'authorized',
    refType: 'sale',
    refId: input.orderId,
    customerName: input.customerName || 'Consumidor Final',
    customerDocument: input.customerDocument || '',
    amount: input.amount,
    number: String(1000 + state.documents.length + 1),
    series: '1',
    accessKey: fakeAccessKey(),
    provider: 'mock',
    createdAt: new Date().toISOString(),
    message: `${FISCAL_KIND_LABEL[kind]} simulada (homologação local). Integrar ACBr API / SEFAZ em produção.`,
  };
  state.documents.unshift(document);
  save(state);
  return { ok: true, document };
}

/** Emite NFC-e se o plano tem Emissor Fiscal; senão, notinha de venda. */
export function emitSaleCheckoutDocument(input: {
  orderId: string;
  customerName: string;
  amount: number;
  customerDocument?: string;
  fiscalIntegrated: boolean;
}): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  if (input.fiscalIntegrated) {
    return emitNfeFromSale({
      orderId: input.orderId,
      customerName: input.customerName,
      amount: input.amount,
      asNfce: true,
      customerDocument: input.customerDocument,
    });
  }

  if (!input.orderId) return { ok: false, error: 'Pedido inválido.' };
  if (input.amount <= 0) return { ok: false, error: 'Valor deve ser maior que zero.' };

  const existing = getFiscalDocumentForRef('sale', input.orderId);
  if (existing) return { ok: false, error: `Já existe ${FISCAL_KIND_LABEL[existing.kind]} para este pedido.` };

  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind: 'receipt',
    status: 'authorized',
    refType: 'sale',
    refId: input.orderId,
    customerName: input.customerName || 'Consumidor Final',
    customerDocument: input.customerDocument || '',
    amount: input.amount,
    number: String(5000 + state.documents.length + 1),
    series: 'NV',
    accessKey: `NV${Date.now()}`,
    provider: 'mock',
    createdAt: new Date().toISOString(),
    message: 'Notinha de venda (sem emissor fiscal). Ative o módulo Emissor Fiscal para NFC-e.',
  };
  state.documents.unshift(document);
  save(state);
  return { ok: true, document };
}

export function emitNfseFromOs(input: {
  workOrderId: string;
  customerName: string;
  amount: number;
}): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  if (!input.workOrderId) return { ok: false, error: 'OS inválida.' };
  if (input.amount <= 0) return { ok: false, error: 'Valor do serviço deve ser maior que zero.' };

  const existing = getFiscalDocumentForRef('os', input.workOrderId);
  if (existing) return { ok: false, error: 'Já existe NFS-e para esta OS.' };

  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind: 'nfse',
    status: 'authorized',
    refType: 'os',
    refId: input.workOrderId,
    customerName: input.customerName || 'Tomador',
    amount: input.amount,
    number: String(2000 + state.documents.length + 1),
    series: 'U',
    accessKey: fakeAccessKey(),
    provider: 'mock',
    createdAt: new Date().toISOString(),
    message: 'NFS-e simulada (homologação local). Integrar ACBr API / prefeitura em produção.',
  };
  state.documents.unshift(document);
  save(state);
  return { ok: true, document };
}
