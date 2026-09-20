import { getAdminState, type FinanceEntry } from './adminStore';
import { getSupplier } from './erpRegistry';

const STORAGE_KEY = 'marthi.finance.book.v1';

export type BankAccountType = 'checking' | 'savings' | 'cash' | 'digital';

export type BankAccount = {
  id: string;
  name: string;
  bank: string;
  agency: string;
  number: string;
  type: BankAccountType;
  initialBalance: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BillStatus = 'open' | 'partial' | 'paid' | 'cancelled';

export type Payable = {
  id: string;
  description: string;
  supplierId: string;
  supplierName: string;
  category: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: BillStatus;
  accountId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
};

export type Receivable = {
  id: string;
  description: string;
  customerName: string;
  category: string;
  amount: number;
  receivedAmount: number;
  dueDate: string;
  status: BillStatus;
  accountId: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  receivedAt?: string;
};

export type TreasuryKind = 'transfer' | 'deposit' | 'withdraw' | 'adjustment';

export type TreasuryMove = {
  id: string;
  kind: TreasuryKind;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
  at: string;
};

export type AdvanceKind = 'customer' | 'supplier';
export type AdvanceStatus = 'open' | 'applied' | 'refunded';

export type AdvancePayment = {
  id: string;
  kind: AdvanceKind;
  partyName: string;
  amount: number;
  usedAmount: number;
  accountId: string;
  notes: string;
  status: AdvanceStatus;
  createdAt: string;
  updatedAt: string;
};

type BookState = {
  accounts: BankAccount[];
  payables: Payable[];
  receivables: Receivable[];
  treasury: TreasuryMove[];
  advances: AdvancePayment[];
};

export const BANK_TYPE_LABEL: Record<BankAccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Caixa físico',
  digital: 'Carteira digital',
};

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  open: 'Em aberto',
  partial: 'Parcial',
  paid: 'Pago',
  cancelled: 'Cancelado',
};

export const TREASURY_KIND_LABEL: Record<TreasuryKind, string> = {
  transfer: 'Transferência',
  deposit: 'Depósito',
  withdraw: 'Saque',
  adjustment: 'Ajuste',
};

export const ADVANCE_KIND_LABEL: Record<AdvanceKind, string> = {
  customer: 'Cliente (recebido antecipado)',
  supplier: 'Fornecedor (pago antecipado)',
};

export const EXPENSE_CATEGORIES = [
  'Fornecedores',
  'Aluguel',
  'Folha',
  'Impostos',
  'Marketing',
  'Utilidades',
  'Manutenção',
  'Outras despesas',
] as const;

export const REVENUE_CATEGORIES = [
  'Vendas PDV',
  'Serviços OS',
  'Recebimentos',
  'Outras receitas',
] as const;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

function today() {
  return now().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function seed(): BookState {
  const stamp = now();
  const cashId = uid('ACC');
  const bankId = uid('ACC');
  const dueSoon = addDays(today(), 5);
  const dueLater = addDays(today(), 18);
  return {
    accounts: [
      {
        id: cashId,
        name: 'Caixa loja',
        bank: 'Espécie',
        agency: '—',
        number: 'CAIXA-01',
        type: 'cash',
        initialBalance: 800,
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: bankId,
        name: 'Conta operacional',
        bank: 'Banco Exemplo',
        agency: '0001',
        number: '12345-6',
        type: 'checking',
        initialBalance: 12500,
        active: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    payables: [
      {
        id: uid('AP'),
        description: 'Compra de peças — CelSul',
        supplierId: '',
        supplierName: 'Distribuidora Celular Sul',
        category: 'Fornecedores',
        amount: 1850,
        paidAmount: 0,
        dueDate: dueSoon,
        status: 'open',
        accountId: bankId,
        notes: '',
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: uid('AP'),
        description: 'Aluguel da loja',
        supplierId: '',
        supplierName: 'Imobiliária Centro',
        category: 'Aluguel',
        amount: 3200,
        paidAmount: 0,
        dueDate: dueLater,
        status: 'open',
        accountId: bankId,
        notes: '',
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    receivables: [
      {
        id: uid('AR'),
        description: 'OS aprovada — restante a receber',
        customerName: 'Cliente balcão',
        category: 'Serviços OS',
        amount: 450,
        receivedAmount: 0,
        dueDate: dueSoon,
        status: 'open',
        accountId: cashId,
        notes: '',
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    treasury: [],
    advances: [
      {
        id: uid('ADV'),
        kind: 'customer',
        partyName: 'Cliente antecipado',
        amount: 200,
        usedAmount: 0,
        accountId: cashId,
        notes: 'Sinal de serviço',
        status: 'open',
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
  };
}

function load(): BookState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seed();
      save(seeded);
      return seeded;
    }
    const parsed = JSON.parse(raw) as Partial<BookState>;
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      payables: Array.isArray(parsed.payables) ? parsed.payables : [],
      receivables: Array.isArray(parsed.receivables) ? parsed.receivables : [],
      treasury: Array.isArray(parsed.treasury) ? parsed.treasury : [],
      advances: Array.isArray(parsed.advances) ? parsed.advances : [],
    };
  } catch {
    const seeded = seed();
    save(seeded);
    return seeded;
  }
}

function save(state: BookState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-finance-book-updated'));
}

export function getFinanceBook() {
  return load();
}

export function listBankAccounts(activeOnly = false) {
  const items = load().accounts.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function listPayables() {
  return load().payables.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function listReceivables() {
  return load().receivables.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function listTreasury() {
  return load().treasury.sort((a, b) => b.at.localeCompare(a.at));
}

export function listAdvances() {
  return load().advances.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function accountBalance(accountId: string, state = load()) {
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return 0;
  let balance = account.initialBalance;
  for (const move of state.treasury) {
    if (move.toAccountId === accountId) balance += move.amount;
    if (move.fromAccountId === accountId) balance -= move.amount;
  }
  for (const bill of state.payables) {
    if (bill.accountId === accountId) balance -= bill.paidAmount;
  }
  for (const bill of state.receivables) {
    if (bill.accountId === accountId) balance += bill.receivedAmount;
  }
  return balance;
}

export function totalTreasury() {
  return listBankAccounts(true).reduce((sum, account) => sum + accountBalance(account.id), 0);
}

function openRemainderPayable(item: Payable) {
  return Math.max(0, item.amount - item.paidAmount);
}

function openRemainderReceivable(item: Receivable) {
  return Math.max(0, item.amount - item.receivedAmount);
}

export function payablesOpenTotal() {
  return listPayables()
    .filter((item) => item.status === 'open' || item.status === 'partial')
    .reduce((sum, item) => sum + openRemainderPayable(item), 0);
}

export function receivablesOpenTotal() {
  return listReceivables()
    .filter((item) => item.status === 'open' || item.status === 'partial')
    .reduce((sum, item) => sum + openRemainderReceivable(item), 0);
}

export function advancesOpenTotal() {
  return listAdvances()
    .filter((item) => item.status === 'open')
    .reduce((sum, item) => sum + (item.amount - item.usedAmount), 0);
}

export type BookResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export function upsertBankAccount(input: {
  id?: string;
  name: string;
  bank: string;
  agency: string;
  number: string;
  type: BankAccountType;
  initialBalance: number;
  active: boolean;
}): BookResult<BankAccount> {
  if (!input.name.trim()) return { ok: false, error: 'Informe o nome da conta.' };
  const state = load();
  const stamp = now();
  if (input.id) {
    const current = state.accounts.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'Conta não encontrada.' };
    const next: BankAccount = {
      ...current,
      name: input.name.trim(),
      bank: input.bank.trim(),
      agency: input.agency.trim(),
      number: input.number.trim(),
      type: input.type,
      initialBalance: Math.max(0, input.initialBalance),
      active: input.active,
      updatedAt: stamp,
    };
    state.accounts = state.accounts.map((item) => (item.id === input.id ? next : item));
    save(state);
    return { ok: true, data: next };
  }
  const created: BankAccount = {
    id: uid('ACC'),
    name: input.name.trim(),
    bank: input.bank.trim(),
    agency: input.agency.trim(),
    number: input.number.trim(),
    type: input.type,
    initialBalance: Math.max(0, input.initialBalance),
    active: input.active,
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.accounts = [created, ...state.accounts];
  save(state);
  return { ok: true, data: created };
}

export function upsertPayable(input: {
  id?: string;
  description: string;
  supplierId?: string;
  supplierName: string;
  category: string;
  amount: number;
  dueDate: string;
  accountId: string;
  notes?: string;
}): BookResult<Payable> {
  if (!input.description.trim()) return { ok: false, error: 'Informe a descrição.' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Valor inválido.' };
  }
  const supplier = input.supplierId ? getSupplier(input.supplierId) : null;
  const state = load();
  const stamp = now();
  if (input.id) {
    const current = state.payables.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'Conta a pagar não encontrada.' };
    if (current.status === 'paid' || current.status === 'cancelled') {
      return { ok: false, error: 'Conta já encerrada.' };
    }
    const next: Payable = {
      ...current,
      description: input.description.trim(),
      supplierId: input.supplierId ?? '',
      supplierName: supplier?.name ?? input.supplierName.trim(),
      category: input.category.trim() || 'Outras despesas',
      amount: input.amount,
      dueDate: input.dueDate || today(),
      accountId: input.accountId,
      notes: (input.notes ?? '').trim(),
      updatedAt: stamp,
    };
    state.payables = state.payables.map((item) => (item.id === input.id ? next : item));
    save(state);
    return { ok: true, data: next };
  }
  const created: Payable = {
    id: uid('AP'),
    description: input.description.trim(),
    supplierId: input.supplierId ?? '',
    supplierName: supplier?.name ?? input.supplierName.trim(),
    category: input.category.trim() || 'Outras despesas',
    amount: input.amount,
    paidAmount: 0,
    dueDate: input.dueDate || today(),
    status: 'open',
    accountId: input.accountId,
    notes: (input.notes ?? '').trim(),
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.payables = [created, ...state.payables];
  save(state);
  return { ok: true, data: created };
}

export function upsertReceivable(input: {
  id?: string;
  description: string;
  customerName: string;
  category: string;
  amount: number;
  dueDate: string;
  accountId: string;
  notes?: string;
}): BookResult<Receivable> {
  if (!input.description.trim()) return { ok: false, error: 'Informe a descrição.' };
  if (!input.customerName.trim()) return { ok: false, error: 'Informe o cliente.' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Valor inválido.' };
  }
  const state = load();
  const stamp = now();
  if (input.id) {
    const current = state.receivables.find((item) => item.id === input.id);
    if (!current) return { ok: false, error: 'Conta a receber não encontrada.' };
    if (current.status === 'paid' || current.status === 'cancelled') {
      return { ok: false, error: 'Conta já encerrada.' };
    }
    const next: Receivable = {
      ...current,
      description: input.description.trim(),
      customerName: input.customerName.trim(),
      category: input.category.trim() || 'Recebimentos',
      amount: input.amount,
      dueDate: input.dueDate || today(),
      accountId: input.accountId,
      notes: (input.notes ?? '').trim(),
      updatedAt: stamp,
    };
    state.receivables = state.receivables.map((item) => (item.id === input.id ? next : item));
    save(state);
    return { ok: true, data: next };
  }
  const created: Receivable = {
    id: uid('AR'),
    description: input.description.trim(),
    customerName: input.customerName.trim(),
    category: input.category.trim() || 'Recebimentos',
    amount: input.amount,
    receivedAmount: 0,
    dueDate: input.dueDate || today(),
    status: 'open',
    accountId: input.accountId,
    notes: (input.notes ?? '').trim(),
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.receivables = [created, ...state.receivables];
  save(state);
  return { ok: true, data: created };
}

export function settlePayable(id: string, amount: number): BookResult<Payable> {
  const state = load();
  const current = state.payables.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'Conta não encontrada.' };
  if (current.status === 'cancelled' || current.status === 'paid') {
    return { ok: false, error: 'Conta não pode ser paga.' };
  }
  const pay = Math.min(openRemainderPayable(current), Math.max(0, amount));
  if (pay <= 0) return { ok: false, error: 'Informe um valor válido.' };
  const paidAmount = current.paidAmount + pay;
  const stamp = now();
  const next: Payable = {
    ...current,
    paidAmount,
    status: paidAmount >= current.amount - 0.001 ? 'paid' : 'partial',
    paidAt: paidAmount >= current.amount - 0.001 ? stamp : current.paidAt,
    updatedAt: stamp,
  };
  state.payables = state.payables.map((item) => (item.id === id ? next : item));
  save(state);
  return { ok: true, data: next };
}

export function settleReceivable(id: string, amount: number): BookResult<Receivable> {
  const state = load();
  const current = state.receivables.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'Conta não encontrada.' };
  if (current.status === 'cancelled' || current.status === 'paid') {
    return { ok: false, error: 'Conta não pode ser recebida.' };
  }
  const receive = Math.min(openRemainderReceivable(current), Math.max(0, amount));
  if (receive <= 0) return { ok: false, error: 'Informe um valor válido.' };
  const receivedAmount = current.receivedAmount + receive;
  const stamp = now();
  const next: Receivable = {
    ...current,
    receivedAmount,
    status: receivedAmount >= current.amount - 0.001 ? 'paid' : 'partial',
    receivedAt: receivedAmount >= current.amount - 0.001 ? stamp : current.receivedAt,
    updatedAt: stamp,
  };
  state.receivables = state.receivables.map((item) => (item.id === id ? next : item));
  save(state);
  return { ok: true, data: next };
}

export function cancelBill(kind: 'payable' | 'receivable', id: string): BookResult {
  const state = load();
  if (kind === 'payable') {
    const current = state.payables.find((item) => item.id === id);
    if (!current) return { ok: false, error: 'Conta não encontrada.' };
    if (current.paidAmount > 0) return { ok: false, error: 'Já há pagamento parcial.' };
    state.payables = state.payables.map((item) =>
      item.id === id ? { ...item, status: 'cancelled', updatedAt: now() } : item,
    );
  } else {
    const current = state.receivables.find((item) => item.id === id);
    if (!current) return { ok: false, error: 'Conta não encontrada.' };
    if (current.receivedAmount > 0) return { ok: false, error: 'Já há recebimento parcial.' };
    state.receivables = state.receivables.map((item) =>
      item.id === id ? { ...item, status: 'cancelled', updatedAt: now() } : item,
    );
  }
  save(state);
  return { ok: true, data: undefined };
}

export function createTreasuryMove(input: {
  kind: TreasuryKind;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description: string;
  at?: string;
}): BookResult<TreasuryMove> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Valor inválido.' };
  }
  const state = load();
  const from = state.accounts.find((item) => item.id === input.fromAccountId);
  const to = state.accounts.find((item) => item.id === input.toAccountId);
  if (input.kind === 'transfer') {
    if (!from || !to) return { ok: false, error: 'Contas inválidas.' };
    if (from.id === to.id) return { ok: false, error: 'Escolha contas diferentes.' };
  } else if (input.kind === 'deposit') {
    if (!to) return { ok: false, error: 'Conta destino inválida.' };
  } else if (input.kind === 'withdraw') {
    if (!from) return { ok: false, error: 'Conta origem inválida.' };
  } else if (!from && !to) {
    return { ok: false, error: 'Informe ao menos uma conta.' };
  }
  const move: TreasuryMove = {
    id: uid('TR'),
    kind: input.kind,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    amount: input.amount,
    description: input.description.trim() || TREASURY_KIND_LABEL[input.kind],
    at: input.at || now(),
  };
  state.treasury = [move, ...state.treasury];
  save(state);
  return { ok: true, data: move };
}

export function createAdvance(input: {
  kind: AdvanceKind;
  partyName: string;
  amount: number;
  accountId: string;
  notes?: string;
}): BookResult<AdvancePayment> {
  if (!input.partyName.trim()) return { ok: false, error: 'Informe o cliente/fornecedor.' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'Valor inválido.' };
  }
  const state = load();
  if (!state.accounts.some((item) => item.id === input.accountId)) {
    return { ok: false, error: 'Conta bancária inválida.' };
  }
  const stamp = now();
  const created: AdvancePayment = {
    id: uid('ADV'),
    kind: input.kind,
    partyName: input.partyName.trim(),
    amount: input.amount,
    usedAmount: 0,
    accountId: input.accountId,
    notes: (input.notes ?? '').trim(),
    status: 'open',
    createdAt: stamp,
    updatedAt: stamp,
  };
  state.advances = [created, ...state.advances];
  save(state);
  return { ok: true, data: created };
}

export function applyAdvance(id: string, amount: number): BookResult<AdvancePayment> {
  const state = load();
  const current = state.advances.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'Antecipação não encontrada.' };
  if (current.status !== 'open') return { ok: false, error: 'Antecipação já encerrada.' };
  const use = Math.min(current.amount - current.usedAmount, Math.max(0, amount));
  if (use <= 0) return { ok: false, error: 'Valor inválido.' };
  const usedAmount = current.usedAmount + use;
  const next: AdvancePayment = {
    ...current,
    usedAmount,
    status: usedAmount >= current.amount - 0.001 ? 'applied' : 'open',
    updatedAt: now(),
  };
  state.advances = state.advances.map((item) => (item.id === id ? next : item));
  save(state);
  return { ok: true, data: next };
}

export function refundAdvance(id: string): BookResult<AdvancePayment> {
  const state = load();
  const current = state.advances.find((item) => item.id === id);
  if (!current) return { ok: false, error: 'Antecipação não encontrada.' };
  if (current.status === 'refunded') return { ok: false, error: 'Já estornada.' };
  if (current.usedAmount > 0) return { ok: false, error: 'Já houve aplicação parcial.' };
  const next: AdvancePayment = { ...current, status: 'refunded', updatedAt: now() };
  state.advances = state.advances.map((item) => (item.id === id ? next : item));
  save(state);
  return { ok: true, data: next };
}

export type DreLine = { label: string; amount: number; kind: 'revenue' | 'expense' | 'total' };

export type DreReport = {
  month: string;
  lines: DreLine[];
  revenue: number;
  expenses: number;
  result: number;
};

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function sumFinance(entries: FinanceEntry[], type: 'in' | 'out', month: string) {
  return entries
    .filter((item) => item.type === type && monthKey(item.createdAt) === month)
    .reduce((sum, item) => sum + item.amount, 0);
}

export function buildDre(month = today().slice(0, 7)): DreReport {
  const admin = getAdminState();
  const book = load();
  const cashIn = sumFinance(admin.finance, 'in', month);
  const cashOut = sumFinance(admin.finance, 'out', month);
  const received = book.receivables
    .filter((item) => item.receivedAt && monthKey(item.receivedAt) === month)
    .reduce((sum, item) => sum + item.receivedAmount, 0);
  const paid = book.payables
    .filter((item) => item.paidAt && monthKey(item.paidAt) === month)
    .reduce((sum, item) => sum + item.paidAmount, 0);

  const byExpenseCategory = new Map<string, number>();
  for (const bill of book.payables) {
    if (!bill.paidAt || monthKey(bill.paidAt) !== month || bill.paidAmount <= 0) continue;
    byExpenseCategory.set(
      bill.category,
      (byExpenseCategory.get(bill.category) ?? 0) + bill.paidAmount,
    );
  }

  const revenue = cashIn + received;
  const expenses = cashOut + paid;
  const lines: DreLine[] = [
    { label: 'Receitas do caixa (PDV/OS/manual)', amount: cashIn, kind: 'revenue' },
    { label: 'Contas a receber baixadas', amount: received, kind: 'revenue' },
    { label: 'Receita bruta', amount: revenue, kind: 'total' },
    { label: 'Saídas do caixa', amount: cashOut, kind: 'expense' },
    ...[...byExpenseCategory.entries()].map(([label, amount]) => ({
      label: `Despesa · ${label}`,
      amount,
      kind: 'expense' as const,
    })),
    { label: 'Despesas totais', amount: expenses, kind: 'total' },
    { label: 'Resultado do período', amount: revenue - expenses, kind: 'total' },
  ];

  return { month, lines, revenue, expenses, result: revenue - expenses };
}

export function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function isOverdue(dueDate: string, status: BillStatus) {
  if (status === 'paid' || status === 'cancelled') return false;
  return dueDate < today();
}
