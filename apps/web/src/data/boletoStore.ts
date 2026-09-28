const STORAGE_KEY = 'marthi.erp.boletos.v1';
export const BOLETO_EVENT = 'marthi-boletos';

export type BoletoKind = 'pix' | 'hybrid' | 'bank';
export type BoletoStatus = 'open' | 'paid' | 'cancelled' | 'expired';

export type Boleto = {
  id: string;
  kind: BoletoKind;
  status: BoletoStatus;
  customerName: string;
  customerDocument: string;
  description: string;
  amount: number;
  dueDate: string;
  bankAccountId?: string;
  nossoNumero?: string;
  remessaBatchId?: string;
  receivableId?: string;
  pixCopyPaste?: string;
  digitableLine?: string;
  barcode?: string;
  createdAt: string;
  paidAt?: string;
};

export const BOLETO_KIND_LABEL: Record<BoletoKind, string> = {
  pix: 'Boleto Pix',
  hybrid: 'Boleto híbrido',
  bank: 'Boleto bancário',
};

export const BOLETO_STATUS_LABEL: Record<BoletoStatus, string> = {
  open: 'Em aberto',
  paid: 'Pago',
  cancelled: 'Cancelado',
  expired: 'Vencido',
};

function uid() {
  return `BOL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function emit() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BOLETO_EVENT));
  }
}

function seed(): Boleto[] {
  return [];
}

function load(): Boleto[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return seed();
    }
    const parsed = JSON.parse(raw) as Boleto[];
    const cleaned = (Array.isArray(parsed) ? parsed : []).filter(
      (b) => b.id && !b.id.startsWith('BOL-DEMO')
    );
    if (cleaned.length !== (Array.isArray(parsed) ? parsed.length : 0)) {
      save(cleaned);
    }
    return cleaned;
  } catch {
    return [];
  }
}

function save(items: Boleto[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emit();
}

export function listBoletos() {
  return [...load()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function boletoSnapshot() {
  const items = listBoletos();
  const open = items.filter((item) => item.status === 'open');
  return {
    total: items.length,
    open: open.length,
    openAmount: open.reduce((sum, item) => sum + item.amount, 0),
    paid: items.filter((item) => item.status === 'paid').length,
  };
}

export function createBoleto(input: {
  kind: BoletoKind;
  customerName: string;
  customerDocument: string;
  description: string;
  amount: number;
  dueDate: string;
  bankAccountId?: string;
  receivableId?: string;
}) {
  const items = load();
  const id = uid();
  const boleto: Boleto = {
    id,
    kind: input.kind,
    status: 'open',
    customerName: input.customerName.trim(),
    customerDocument: input.customerDocument.trim(),
    description: input.description.trim(),
    amount: input.amount,
    dueDate: input.dueDate,
    bankAccountId: input.bankAccountId,
    receivableId: input.receivableId,
    createdAt: new Date().toISOString(),
  };

  if (input.kind === 'pix' || input.kind === 'hybrid') {
    boleto.pixCopyPaste = `00020126580014BR.GOV.BCB.PIX0136${id.toLowerCase()}52040000530398654${input.amount
      .toFixed(2)
      .padStart(10, '0')}5802BR5913Marthi ERP6009TRES RIOS62070503***6304XXXX`;
  }
  if (input.kind === 'hybrid' || input.kind === 'bank') {
    const cents = Math.round(input.amount * 100)
      .toString()
      .padStart(10, '0');
    boleto.digitableLine = `23793.38128 60000.000003 00000.000400 1 9666${cents}`;
    boleto.barcode = `237919666${cents}3381286000000000000000004`;
  }

  items.unshift(boleto);
  save(items);
  return boleto;
}

export function attachBoletoToRemessa(
  boletoIds: string[],
  remessaBatchId: string,
  nossoNumeros: Record<string, string>,
) {
  const items = load();
  let changed = false;
  for (const item of items) {
    if (!boletoIds.includes(item.id)) continue;
    item.remessaBatchId = remessaBatchId;
    item.nossoNumero = nossoNumeros[item.id] ?? item.nossoNumero;
    changed = true;
  }
  if (changed) save(items);
}

export function listOpenBankBoletos() {
  return listBoletos().filter(
    (item) => item.status === 'open' && (item.kind === 'bank' || item.kind === 'hybrid'),
  );
}

export function findBoletoByNossoNumero(nossoNumero: string) {
  const needle = nossoNumero.replace(/\D/g, '');
  return (
    listBoletos().find((item) => (item.nossoNumero ?? '').replace(/\D/g, '') === needle) ?? null
  );
}

export function markBoletoPaid(id: string) {
  const items = load();
  const target = items.find((item) => item.id === id);
  if (!target || target.status !== 'open') return null;
  target.status = 'paid';
  target.paidAt = new Date().toISOString();
  save(items);
  return target;
}

export function cancelBoleto(id: string) {
  const items = load();
  const target = items.find((item) => item.id === id);
  if (!target || target.status !== 'open') return null;
  target.status = 'cancelled';
  save(items);
  return target;
}
