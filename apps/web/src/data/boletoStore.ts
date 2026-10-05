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

export function createBoleto(_input: {
  kind: BoletoKind;
  customerName: string;
  customerDocument: string;
  description: string;
  amount: number;
  dueDate: string;
  bankAccountId?: string;
  receivableId?: string;
}) {
  throw new Error('Emissão de cobrança indisponível: configure um provedor bancário. Nenhum boleto ou Pix foi emitido.');
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
