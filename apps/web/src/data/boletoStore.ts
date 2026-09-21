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
  const today = new Date();
  const due = new Date(today);
  due.setDate(due.getDate() + 7);
  const dueIso = due.toISOString().slice(0, 10);
  return [
    {
      id: 'BOL-DEMO1',
      kind: 'pix',
      status: 'open',
      customerName: 'Loja Exemplo Ltda',
      customerDocument: '12.345.678/0001-90',
      description: 'Mensalidade Marthi ERP',
      amount: 289,
      dueDate: dueIso,
      pixCopyPaste: '00020126580014BR.GOV.BCB.PIX0136marthi-demo-pix520400005303986540528.905802BR5913Marthi Demo6009TRES RIOS62070503***6304ABCD',
      createdAt: today.toISOString(),
    },
    {
      id: 'BOL-DEMO2',
      kind: 'hybrid',
      status: 'open',
      customerName: 'Cliente Varejo SP',
      customerDocument: '123.456.789-00',
      description: 'Pedido #4821 — restante',
      amount: 1490.5,
      dueDate: dueIso,
      pixCopyPaste: '00020126580014BR.GOV.BCB.PIX0136marthi-hybrid-pix52040000530398654061490.505802BR5913Marthi Demo6009TRES RIOS62070503***6304EFGH',
      digitableLine: '23793.38128 60000.000003 00000.000400 1 96660000149050',
      barcode: '23791966600001490503381286000000000000000004',
      createdAt: today.toISOString(),
    },
  ];
}

function load(): Boleto[] {
  if (typeof window === 'undefined') return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = seed();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as Boleto[];
  } catch {
    return seed();
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
