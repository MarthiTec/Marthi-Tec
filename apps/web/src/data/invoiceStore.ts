import { getAdminState } from './adminStore';
import { getSupplier } from './erpRegistry';
import { applyStockMovement } from './stockLedger';
import type { FiscalDocPurpose } from './fiscalTaxTables';

const STORAGE_KEY = 'marthi.invoices.v1';

export type InvoiceKind = 'entry' | 'exit';
export type InvoiceStatus = 'draft' | 'posted' | 'cancelled';
export type { FiscalDocPurpose };

export type InvoiceLine = {
  id: string;
  stockId: string;
  name: string;
  qty: number;
  unitCost: number;
  unitPrice: number;
};

export type Invoice = {
  id: string;
  kind: InvoiceKind;
  number: string;
  status: InvoiceStatus;
  /** Tipo do documento fiscal na emissão (finNFe / reforma). */
  documentPurpose: FiscalDocPurpose;
  supplierId: string;
  customerName: string;
  issuedAt: string;
  notes: string;
  lines: InvoiceLine[];
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
};

type InvoiceState = {
  invoices: Invoice[];
};

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  entry: 'Nota de entrada',
  exit: 'Nota de saída',
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Rascunho',
  posted: 'Lançada',
  cancelled: 'Cancelada',
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

function load(): InvoiceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { invoices: [] };
    const parsed = JSON.parse(raw) as Partial<InvoiceState>;
    const invoices = Array.isArray(parsed.invoices)
      ? parsed.invoices.map((item) => ({
          ...item,
          documentPurpose: (item as Invoice).documentPurpose ?? 'normal',
        }))
      : [];
    return { invoices };
  } catch {
    return { invoices: [] };
  }
}

function save(state: InvoiceState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-invoices-updated'));
}

export function listInvoices(kind?: InvoiceKind) {
  const items = load().invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return kind ? items.filter((item) => item.kind === kind) : items;
}

export function getInvoice(id: string) {
  return load().invoices.find((item) => item.id === id) ?? null;
}

export function invoiceTotal(invoice: Invoice) {
  return invoice.lines.reduce((sum, line) => {
    const unit = invoice.kind === 'entry' ? line.unitCost : line.unitPrice;
    return sum + unit * line.qty;
  }, 0);
}

export type InvoiceResult =
  | { ok: true; invoice: Invoice }
  | { ok: false; error: string };

export function createInvoice(input: {
  kind: InvoiceKind;
  number?: string;
  supplierId?: string;
  customerName?: string;
  issuedAt?: string;
  notes?: string;
}): InvoiceResult {
  if (input.kind === 'entry' && input.supplierId && !getSupplier(input.supplierId)) {
    return { ok: false, error: 'Fornecedor inválido.' };
  }
  const stamp = now();
  const invoice: Invoice = {
    id: uid(input.kind === 'entry' ? 'NFE' : 'NFS'),
    kind: input.kind,
    number: (input.number ?? '').trim() || uid('DOC'),
    status: 'draft',
    documentPurpose: 'normal',
    supplierId: input.supplierId ?? '',
    customerName: (input.customerName ?? '').trim(),
    issuedAt: input.issuedAt || stamp.slice(0, 10),
    notes: (input.notes ?? '').trim(),
    lines: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  const state = load();
  state.invoices = [invoice, ...state.invoices];
  save(state);
  return { ok: true, invoice };
}

export function updateInvoiceDraft(
  id: string,
  patch: Partial<
    Pick<
      Invoice,
      'number' | 'supplierId' | 'customerName' | 'issuedAt' | 'notes' | 'lines' | 'documentPurpose'
    >
  >,
): InvoiceResult {
  const state = load();
  const current = state.invoices.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'Nota não encontrada.' };
  if (current.status !== 'draft') return { ok: false, error: 'Só rascunho pode ser editado.' };
  const invoice: Invoice = {
    ...current,
    ...patch,
    id: current.id,
    kind: current.kind,
    status: 'draft',
    updatedAt: now(),
  };
  state.invoices = state.invoices.map((item) => (item.id === id ? invoice : item));
  save(state);
  return { ok: true, invoice };
}

export function addInvoiceLine(
  id: string,
  input: { stockId: string; qty: number; unitCost?: number; unitPrice?: number },
): InvoiceResult {
  const state = load();
  const current = state.invoices.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'Nota não encontrada.' };
  if (current.status !== 'draft') return { ok: false, error: 'Nota já lançada.' };
  const stock = getAdminState().stock.find((item) => item.id === input.stockId);
  if (!stock) return { ok: false, error: 'Item de estoque não encontrado.' };
  const qty = Math.max(1, Math.floor(input.qty) || 1);
  const line: InvoiceLine = {
    id: uid('IL'),
    stockId: stock.id,
    name: stock.name,
    qty,
    unitCost: input.unitCost ?? stock.cost,
    unitPrice: input.unitPrice ?? stock.price,
  };
  return updateInvoiceDraft(id, { lines: [...current.lines, line] });
}

export function removeInvoiceLine(id: string, lineId: string): InvoiceResult {
  const current = getInvoice(id);
  if (!current) return { ok: false, error: 'Nota não encontrada.' };
  return updateInvoiceDraft(id, {
    lines: current.lines.filter((line) => line.id !== lineId),
  });
}

function applyStockDelta(lines: InvoiceLine[], direction: 1 | -1): { ok: true } | { ok: false; error: string } {
  for (const line of lines) {
    const result = applyStockMovement({
      stockId: line.stockId,
      type: direction === 1 ? 'purchase' : 'exit',
      qty: line.qty,
      direction,
      unitCost: line.unitCost,
      note: direction === 1 ? `NF entrada · ${line.name}` : `NF saída · ${line.name}`,
      skipAvgCost: direction !== 1,
    });
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** Lança a nota: entrada soma estoque; saída baixa. */
export function postInvoice(id: string): InvoiceResult {
  const state = load();
  const current = state.invoices.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'Nota não encontrada.' };
  if (current.status !== 'draft') return { ok: false, error: 'Nota já processada.' };
  if (current.lines.length === 0) return { ok: false, error: 'Inclua ao menos um item.' };
  if (current.kind === 'entry' && !current.supplierId) {
    return { ok: false, error: 'Informe o fornecedor na entrada.' };
  }

  const delta = current.kind === 'entry' ? 1 : -1;
  const stockResult = applyStockDelta(current.lines, delta as 1 | -1);
  if (!stockResult.ok) return stockResult;

  const invoice: Invoice = {
    ...current,
    status: 'posted',
    postedAt: now(),
    updatedAt: now(),
  };
  state.invoices = state.invoices.map((item) => (item.id === id ? invoice : item));
  save(state);
  return { ok: true, invoice };
}

export function cancelInvoice(id: string): InvoiceResult {
  const state = load();
  const current = state.invoices.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'Nota não encontrada.' };
  if (current.status === 'cancelled') return { ok: false, error: 'Já cancelada.' };

  if (current.status === 'posted') {
    const reverse = current.kind === 'entry' ? -1 : 1;
    const stockResult = applyStockDelta(current.lines, reverse as 1 | -1);
    if (!stockResult.ok) return stockResult;
  }

  const invoice: Invoice = {
    ...current,
    status: 'cancelled',
    updatedAt: now(),
  };
  state.invoices = state.invoices.map((item) => (item.id === id ? invoice : item));
  save(state);
  return { ok: true, invoice };
}

export function newInvoiceLineId() {
  return uid('IL');
}
