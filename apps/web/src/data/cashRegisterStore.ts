/** Sessão de caixa do PDV (localStorage) + vales e trocas. */

const STORAGE_KEY = 'marthi.cash.register.v2';
const LEGACY_KEY = 'marthi.cash.register.v1';

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export type CashMovementKind =
  | 'open'
  | 'aporte'
  | 'sangria'
  | 'sale'
  | 'exchange'
  | 'vale'
  | 'close'
  | 'drawer';

export type CashBeneficiaryType = 'store' | 'employee';

export type CashMovement = {
  id: string;
  kind: CashMovementKind;
  amount: number;
  /** Venda: parte do `amount` recebida em dinheiro (o que entra na gaveta). */
  cashAmount?: number;
  note: string;
  /** Motivo fixo (papelaria, lanche…). */
  reason?: string;
  beneficiaryType?: CashBeneficiaryType;
  beneficiaryId?: string;
  beneficiaryName?: string;
  orderId?: string;
  createdAt: string;
  operatorName: string;
};

export const SANGRIA_REASONS = [
  'Papelaria',
  'Lanche / refeição',
  'Transporte / Uber',
  'Correios / motoboy',
  'Limpeza / higiene',
  'Troco / fundo',
  'Pagamento fornecedor',
  'Outros',
] as const;

export const APORTE_REASONS = [
  'Fundo de troco',
  'Reforço de caixa',
  'Depósito / entrada',
  'Troco de sangria',
  'Aporte da loja',
  'Outros',
] as const;

export function cashBeneficiaryLabel(movement: Pick<CashMovement, 'beneficiaryType' | 'beneficiaryName'>) {
  if (movement.beneficiaryType === 'employee') {
    return movement.beneficiaryName?.trim() || 'Funcionário';
  }
  return movement.beneficiaryName?.trim() || 'Loja';
}

export type CashCloseBreakdown = {
  countedCash: number;
  countedPix: number;
  countedDebit: number;
  countedCredit: number;
  countedCheck: number;
  countedDeposit: number;
  countedOther: number;
  confirmedSangria: boolean;
  confirmedAporte: boolean;
  confirmedExchange: boolean;
  confirmedVale: boolean;
  receiptsChecked: boolean;
};

export type CashSession = {
  id: string;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  expectedCash: number;
  countedCash?: number;
  difference?: number;
  closeBreakdown?: CashCloseBreakdown;
  operatorName: string;
  movements: CashMovement[];
  status: 'open' | 'closed';
  reopenCount: number;
};

export type StoreCredit = {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  amount: number;
  remaining: number;
  note: string;
  createdAt: string;
  operatorName: string;
  status: 'open' | 'used' | 'cancelled';
  orderId?: string;
};

export type ExchangeLine = {
  stockId: string;
  name: string;
  sku: string;
  qty: number;
  unitPrice: number;
};

export type ExchangeRecord = {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string;
  returnLines: ExchangeLine[];
  outLines: ExchangeLine[];
  returnTotal: number;
  outTotal: number;
  cashDelta: number;
  creditId?: string;
  note: string;
  createdAt: string;
  operatorName: string;
};

type State = {
  sessions: CashSession[];
  credits: StoreCredit[];
  exchanges: ExchangeRecord[];
};

export const CASH_KIND_LABEL: Record<CashMovementKind, string> = {
  open: 'Abertura',
  aporte: 'Aporte / suprimento',
  sangria: 'Sangria',
  sale: 'Venda',
  exchange: 'Troca',
  vale: 'Vale-compra',
  close: 'Fechamento',
  drawer: 'Abertura de gaveta',
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function nowIso(override?: string) {
  if (override?.trim()) {
    const date = new Date(override);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return { sessions: [], credits: [], exchanges: [] };
    const parsed = JSON.parse(raw) as Partial<State> & { sessions?: CashSession[] };
    return {
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.map((session) => ({
            ...session,
            reopenCount: session.reopenCount ?? 0,
            movements: Array.isArray(session.movements) ? session.movements : [],
          }))
        : [],
      credits: Array.isArray(parsed.credits) ? parsed.credits : [],
      exchanges: Array.isArray(parsed.exchanges) ? parsed.exchanges : [],
    };
  } catch {
    return { sessions: [], credits: [], exchanges: [] };
  }
}

function save(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-cash-updated'));
}

export function getOpenCashSession() {
  return load().sessions.find((item) => item.status === 'open') ?? null;
}

export function listCashSessions() {
  return load().sessions;
}

export function getCashSession(id: string) {
  return load().sessions.find((item) => item.id === id) ?? null;
}

export function listStoreCredits() {
  return load().credits;
}

export function listExchanges() {
  return load().exchanges;
}

export function openCashDrawer(operatorName: string, note?: string) {
  const state = load();
  const session = state.sessions.find((item) => item.status === 'open');
  const stamp = new Date().toISOString();
  const movement: CashMovement = {
    id: uid('MOV'),
    kind: 'drawer',
    amount: 0,
    note: note?.trim() || 'Abertura de gaveta para contagem',
    createdAt: stamp,
    operatorName: operatorName || 'Operador',
  };
  if (session) {
    session.movements.push(movement);
    save(state);
  }
  window.dispatchEvent(new CustomEvent('marthi-cash-drawer', { detail: { at: stamp } }));
  return { ok: true as const, movement };
}

export function openCashSession(input: {
  openingFloat: number;
  operatorName: string;
  note?: string;
  openedAt?: string;
}): { ok: true; session: CashSession } | { ok: false; error: string } {
  if (getOpenCashSession()) {
    return { ok: false, error: 'Já existe um caixa aberto. Feche ou consulte os caixas.' };
  }
  const amount = Math.max(0, Number(input.openingFloat) || 0);
  const openedAt = nowIso(input.openedAt);
  const session: CashSession = {
    id: uid('CX'),
    openedAt,
    openingFloat: amount,
    expectedCash: amount,
    operatorName: input.operatorName.trim() || 'Operador',
    status: 'open',
    reopenCount: 0,
    movements: [
      {
        id: uid('MOV'),
        kind: 'open',
        amount,
        note: input.note?.trim() || 'Abertura de caixa',
        createdAt: openedAt,
        operatorName: input.operatorName.trim() || 'Operador',
      },
    ],
  };
  const state = load();
  state.sessions.unshift(session);
  save(state);
  openCashDrawer(session.operatorName, 'Gaveta na abertura');
  return { ok: true, session };
}

function mutateOpen(
  fn: (session: CashSession, state: State) => { ok: true } | { ok: false; error: string },
): { ok: true; session: CashSession } | { ok: false; error: string } {
  const state = load();
  const session = state.sessions.find((item) => item.status === 'open');
  if (!session) return { ok: false, error: 'Abra o caixa antes de continuar.' };
  const result = fn(session, state);
  if (!result.ok) return result;
  save(state);
  return { ok: true, session };
}

export function addCashAporte(input: {
  amount: number;
  note?: string;
  reason?: string;
  beneficiaryType?: CashBeneficiaryType;
  beneficiaryId?: string;
  beneficiaryName?: string;
  operatorName: string;
  at?: string;
}) {
  const amount = Math.abs(Number(input.amount) || 0);
  if (amount <= 0) return { ok: false as const, error: 'Informe o valor do aporte.' };
  const reason = input.reason?.trim() || 'Aporte da loja';
  const beneficiaryType = input.beneficiaryType === 'employee' ? 'employee' : 'store';
  const beneficiaryName =
    beneficiaryType === 'employee'
      ? input.beneficiaryName?.trim() || 'Funcionário'
      : input.beneficiaryName?.trim() || 'Loja';
  return mutateOpen((session) => {
    const at = nowIso(input.at);
    session.expectedCash += amount;
    session.movements.push({
      id: uid('MOV'),
      kind: 'aporte',
      amount,
      reason,
      note: input.note?.trim() || reason,
      beneficiaryType,
      beneficiaryId: beneficiaryType === 'employee' ? input.beneficiaryId : undefined,
      beneficiaryName,
      createdAt: at,
      operatorName: input.operatorName || session.operatorName,
    });
    return { ok: true };
  });
}

export function addCashSangria(input: {
  amount: number;
  note?: string;
  reason?: string;
  beneficiaryType?: CashBeneficiaryType;
  beneficiaryId?: string;
  beneficiaryName?: string;
  operatorName: string;
  at?: string;
}) {
  const amount = Math.abs(Number(input.amount) || 0);
  if (amount <= 0) return { ok: false as const, error: 'Informe o valor da sangria.' };
  const reason = input.reason?.trim() || 'Outros';
  const beneficiaryType = input.beneficiaryType === 'employee' ? 'employee' : 'store';
  const beneficiaryName =
    beneficiaryType === 'employee'
      ? input.beneficiaryName?.trim() || 'Funcionário'
      : input.beneficiaryName?.trim() || 'Loja';
  return mutateOpen((session) => {
    if (amount > session.expectedCash) {
      return { ok: false, error: 'Sangria maior que o saldo esperado do caixa.' };
    }
    const at = nowIso(input.at);
    session.expectedCash -= amount;
    session.movements.push({
      id: uid('MOV'),
      kind: 'sangria',
      amount,
      reason,
      note: input.note?.trim() || reason,
      beneficiaryType,
      beneficiaryId: beneficiaryType === 'employee' ? input.beneficiaryId : undefined,
      beneficiaryName,
      createdAt: at,
      operatorName: input.operatorName || session.operatorName,
    });
    return { ok: true };
  });
}

export function deleteCashMovement(movementId: string) {
  return mutateOpen((session) => {
    const index = session.movements.findIndex((item) => item.id === movementId);
    if (index < 0) return { ok: false, error: 'Movimento não encontrado.' };
    const movement = session.movements[index];
    if (movement.kind !== 'aporte' && movement.kind !== 'sangria') {
      return { ok: false, error: 'Só é possível excluir sangrias e aportes.' };
    }
    if (movement.kind === 'aporte') session.expectedCash -= movement.amount;
    if (movement.kind === 'sangria') session.expectedCash += movement.amount;
    session.movements.splice(index, 1);
    return { ok: true };
  });
}

export function updateCashMovement(input: {
  movementId: string;
  amount: number;
  note?: string;
  reason?: string;
  beneficiaryType?: CashBeneficiaryType;
  beneficiaryId?: string;
  beneficiaryName?: string;
  at?: string;
}) {
  const amount = Math.abs(Number(input.amount) || 0);
  if (amount <= 0) return { ok: false as const, error: 'Informe um valor válido.' };
  return mutateOpen((session) => {
    const movement = session.movements.find((item) => item.id === input.movementId);
    if (!movement) return { ok: false, error: 'Movimento não encontrado.' };
    if (movement.kind !== 'aporte' && movement.kind !== 'sangria') {
      return { ok: false, error: 'Só é possível editar sangrias e aportes.' };
    }

    // Desfaz o efeito antigo no saldo
    if (movement.kind === 'aporte') session.expectedCash -= movement.amount;
    else session.expectedCash += movement.amount;

    if (movement.kind === 'sangria' && amount > session.expectedCash) {
      // Restaura o movimento antigo
      session.expectedCash -= movement.amount;
      return { ok: false, error: 'Sangria maior que o saldo esperado do caixa.' };
    }

    if (movement.kind === 'aporte') session.expectedCash += amount;
    else session.expectedCash -= amount;

    movement.amount = amount;
    if (input.reason !== undefined) {
      movement.reason = input.reason.trim() || movement.reason;
      if (!input.note) movement.note = movement.reason || movement.note;
    }
    if (input.note !== undefined) movement.note = input.note.trim() || movement.note;
    if (input.beneficiaryType !== undefined) {
      movement.beneficiaryType = input.beneficiaryType === 'employee' ? 'employee' : 'store';
      if (movement.beneficiaryType === 'store') {
        movement.beneficiaryId = undefined;
        movement.beneficiaryName = input.beneficiaryName?.trim() || 'Loja';
      } else {
        movement.beneficiaryId = input.beneficiaryId;
        movement.beneficiaryName = input.beneficiaryName?.trim() || 'Funcionário';
      }
    }
    if (input.at?.trim()) {
      const date = new Date(input.at);
      if (!Number.isNaN(date.getTime())) movement.createdAt = date.toISOString();
    }
    return { ok: true };
  });
}

export function listCashMovements(kinds?: CashMovementKind[]) {
  const session = getOpenCashSession();
  if (!session) return [];
  if (!kinds?.length) return session.movements;
  return session.movements.filter((item) => kinds.includes(item.kind));
}

export function registerCashSale(
  amount: number,
  operatorName: string,
  note?: string,
  orderId?: string,
  options?: { cashAmount?: number },
) {
  const value = roundMoney(Math.max(0, Number(amount) || 0));
  if (value <= 0) return { ok: false as const, error: 'Valor inválido.' };
  // Só o que foi pago em dinheiro entra na gaveta; cartão e Pix são conferidos
  // por canal no fechamento.
  const cashValue =
    options?.cashAmount === undefined
      ? value
      : Math.min(value, roundMoney(Math.max(0, options.cashAmount)));
  return mutateOpen((session) => {
    session.expectedCash = roundMoney(session.expectedCash + cashValue);
    session.movements.push({
      id: uid('MOV'),
      kind: 'sale',
      amount: value,
      cashAmount: cashValue,
      note: note?.trim() || 'Venda PDV',
      orderId: orderId?.trim() || undefined,
      createdAt: new Date().toISOString(),
      operatorName: operatorName || session.operatorName,
    });
    return { ok: true };
  });
}

export function findCashSessionForOrder(orderId: string): CashSession | null {
  const needle = orderId.trim();
  if (!needle) return null;
  for (const session of listCashSessions()) {
    const hit = session.movements.some(
      (item) =>
        item.kind === 'sale' &&
        (item.orderId === needle || item.note.includes(needle)),
    );
    if (hit) return session;
  }
  return null;
}

export function issueStoreCredit(input: {
  customerName: string;
  customerPhone?: string;
  amount: number;
  note?: string;
  operatorName: string;
  orderId?: string;
  affectCash?: boolean;
}): { ok: true; credit: StoreCredit } | { ok: false; error: string } {
  const amount = Math.abs(Number(input.amount) || 0);
  if (amount <= 0) return { ok: false, error: 'Informe o valor do vale.' };
  const credit: StoreCredit = {
    id: uid('VALE'),
    code: `VC-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    customerName: input.customerName.trim() || 'Cliente',
    customerPhone: input.customerPhone?.trim() || '',
    amount,
    remaining: amount,
    note: input.note?.trim() || 'Vale-compra',
    createdAt: new Date().toISOString(),
    operatorName: input.operatorName || 'Operador',
    status: 'open',
    orderId: input.orderId,
  };

  const state = load();
  state.credits.unshift(credit);

  if (input.affectCash !== false) {
    const session = state.sessions.find((item) => item.status === 'open');
    if (!session) {
      return { ok: false, error: 'Abra o caixa para emitir vale vinculado ao caixa.' };
    }
    session.expectedCash -= amount;
    session.movements.push({
      id: uid('MOV'),
      kind: 'vale',
      amount,
      note: `Vale ${credit.code} · ${credit.customerName}`,
      createdAt: credit.createdAt,
      operatorName: credit.operatorName,
    });
  }

  save(state);
  return { ok: true, credit };
}

export function redeemStoreCredit(input: {
  code: string;
  amount: number;
  operatorName: string;
}): { ok: true; credit: StoreCredit } | { ok: false; error: string } {
  const code = input.code.trim().toUpperCase();
  const amount = Math.abs(Number(input.amount) || 0);
  const state = load();
  const credit = state.credits.find((item) => item.code === code || item.id === code);
  if (!credit || credit.status !== 'open') return { ok: false, error: 'Vale não encontrado ou já usado.' };
  if (amount <= 0 || amount > credit.remaining) {
    return { ok: false, error: `Saldo do vale: ${credit.remaining.toFixed(2)}.` };
  }
  credit.remaining = Math.round((credit.remaining - amount) * 100) / 100;
  if (credit.remaining <= 0) {
    credit.remaining = 0;
    credit.status = 'used';
  }
  const session = state.sessions.find((item) => item.status === 'open');
  if (session) {
    session.expectedCash += amount;
    session.movements.push({
      id: uid('MOV'),
      kind: 'vale',
      amount,
      note: `Resgate vale ${credit.code}`,
      createdAt: new Date().toISOString(),
      operatorName: input.operatorName || session.operatorName,
    });
  }
  save(state);
  return { ok: true, credit };
}

export function cancelStoreCredit(id: string) {
  const state = load();
  const credit = state.credits.find((item) => item.id === id);
  if (!credit) return { ok: false as const, error: 'Vale não encontrado.' };
  if (credit.status !== 'open') return { ok: false as const, error: 'Vale já encerrado.' };
  credit.status = 'cancelled';
  save(state);
  return { ok: true as const, credit };
}

export function registerExchange(input: {
  orderId: string;
  customerName: string;
  customerPhone?: string;
  returnLines: ExchangeLine[];
  outLines: ExchangeLine[];
  note?: string;
  operatorName: string;
  settleAs: 'cash' | 'credit';
}):
  | { ok: true; exchange: ExchangeRecord; credit?: StoreCredit }
  | { ok: false; error: string } {
  if (!input.returnLines.length && !input.outLines.length) {
    return { ok: false, error: 'Informe produtos de devolução e/ou saída.' };
  }
  const returnTotal = roundMoney(
    input.returnLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0),
  );
  const outTotal = roundMoney(
    input.outLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0),
  );
  const cashDelta = roundMoney(outTotal - returnTotal);
  const createdAt = new Date().toISOString();

  let credit: StoreCredit | undefined;
  const useCredit = input.settleAs === 'credit' && cashDelta < 0;

  if (useCredit) {
    const issued = issueStoreCredit({
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      amount: Math.abs(cashDelta),
      note: `Troca pedido ${input.orderId || '—'}`,
      operatorName: input.operatorName,
      orderId: input.orderId || undefined,
      affectCash: true,
    });
    if (!issued.ok) return issued;
    credit = issued.credit;
  } else {
    const cashResult = mutateOpen((session) => {
      session.expectedCash += cashDelta;
      session.movements.push({
        id: uid('MOV'),
        kind: 'exchange',
        amount: cashDelta,
        note:
          input.note?.trim() ||
          `Troca ${input.orderId || ''} · devolve ${returnTotal.toFixed(2)} · sai ${outTotal.toFixed(2)}`,
        createdAt,
        operatorName: input.operatorName || session.operatorName,
      });
      return { ok: true };
    });
    if (!cashResult.ok) return cashResult;
  }

  const exchange: ExchangeRecord = {
    id: uid('TRC'),
    orderId: input.orderId.trim(),
    customerName: input.customerName.trim() || 'Cliente',
    customerPhone: input.customerPhone?.trim() || '',
    returnLines: input.returnLines,
    outLines: input.outLines,
    returnTotal,
    outTotal,
    cashDelta: useCredit ? 0 : cashDelta,
    creditId: credit?.id,
    note: input.note?.trim() || '',
    createdAt,
    operatorName: input.operatorName,
  };

  const state = load();
  state.exchanges.unshift(exchange);
  save(state);
  return { ok: true, exchange, credit };
}

export type CashSessionSummary = {
  openingFloat: number;
  salesTotal: number;
  saleCount: number;
  aportes: number;
  aporteCount: number;
  sangrias: number;
  sangriaCount: number;
  exchanges: number;
  exchangeCount: number;
  vales: number;
  valeCount: number;
  expectedCash: number;
  expectedFinal: number;
};

export function summarizeCashSession(session: CashSession): CashSessionSummary {
  let salesTotal = 0;
  let saleCount = 0;
  let aportes = 0;
  let aporteCount = 0;
  let sangrias = 0;
  let sangriaCount = 0;
  let exchanges = 0;
  let exchangeCount = 0;
  let vales = 0;
  let valeCount = 0;

  for (const row of session.movements) {
    if (row.kind === 'sale') {
      salesTotal += row.amount;
      saleCount += 1;
    } else if (row.kind === 'aporte') {
      aportes += row.amount;
      aporteCount += 1;
    } else if (row.kind === 'sangria') {
      sangrias += row.amount;
      sangriaCount += 1;
    } else if (row.kind === 'exchange') {
      exchanges += row.amount;
      exchangeCount += 1;
    } else if (row.kind === 'vale') {
      vales += row.amount;
      valeCount += 1;
    }
  }

  return {
    openingFloat: session.openingFloat,
    salesTotal: roundMoney(salesTotal),
    saleCount,
    aportes: roundMoney(aportes),
    aporteCount,
    sangrias: roundMoney(sangrias),
    sangriaCount,
    exchanges: roundMoney(exchanges),
    exchangeCount,
    vales: roundMoney(vales),
    valeCount,
    expectedCash: roundMoney(session.expectedCash),
    expectedFinal: roundMoney(session.expectedCash),
  };
}

export function closeCashSession(input: {
  countedCash: number;
  operatorName: string;
  note?: string;
  closedAt?: string;
  breakdown?: CashCloseBreakdown;
}) {
  const counted = Math.max(0, Number(input.countedCash) || 0);
  return mutateOpen((session) => {
    const closedAt = nowIso(input.closedAt);
    session.countedCash = counted;
    session.difference = roundMoney(counted - session.expectedCash);
    session.closedAt = closedAt;
    session.status = 'closed';
    if (input.breakdown) {
      session.closeBreakdown = { ...input.breakdown, countedCash: counted };
    }
    const parts = [
      `Fechamento · esperado ${session.expectedCash.toFixed(2)}`,
      `contado ${counted.toFixed(2)}`,
      `dif ${session.difference.toFixed(2)}`,
    ];
    if (input.breakdown) {
      parts.push(
        `pix ${input.breakdown.countedPix.toFixed(2)}`,
        `déb ${input.breakdown.countedDebit.toFixed(2)}`,
        `créd ${input.breakdown.countedCredit.toFixed(2)}`,
        `chq ${input.breakdown.countedCheck.toFixed(2)}`,
        `dep ${input.breakdown.countedDeposit.toFixed(2)}`,
      );
    }
    session.movements.push({
      id: uid('MOV'),
      kind: 'close',
      amount: counted,
      note: input.note?.trim() || parts.join(' · '),
      createdAt: closedAt,
      operatorName: input.operatorName || session.operatorName,
    });
    return { ok: true };
  });
}

export function reopenCashSession(input: {
  sessionId: string;
  operatorName: string;
  note?: string;
}): { ok: true; session: CashSession } | { ok: false; error: string } {
  if (getOpenCashSession()) {
    return { ok: false, error: 'Feche o caixa atual antes de reabrir outro.' };
  }
  const state = load();
  const session = state.sessions.find((item) => item.id === input.sessionId);
  if (!session) return { ok: false, error: 'Caixa não encontrado.' };
  if (session.status !== 'closed') return { ok: false, error: 'Este caixa já está aberto.' };
  session.status = 'open';
  session.closedAt = undefined;
  session.countedCash = undefined;
  session.difference = undefined;
  session.closeBreakdown = undefined;
  session.reopenCount += 1;
  session.operatorName = input.operatorName.trim() || session.operatorName;
  session.movements.push({
    id: uid('MOV'),
    kind: 'open',
    amount: session.expectedCash,
    note: input.note?.trim() || `Reabertura #${session.reopenCount}`,
    createdAt: new Date().toISOString(),
    operatorName: session.operatorName,
  });
  save(state);
  return { ok: true, session };
}
