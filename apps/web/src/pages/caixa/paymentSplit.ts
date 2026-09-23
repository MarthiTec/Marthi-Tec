import type { PaymentMethod } from '../../data/adminStore';

/** Uma das formas de pagamento lançadas na venda em andamento. */
export type SplitPayment = {
  key: string;
  methodId: string;
  amount: number;
  installments: number;
  /** Dinheiro: valor entregue pelo cliente. 0 = valor exato, sem troco. */
  tendered: number;
};

export type SplitSummary = {
  /** Soma das formas lançadas. */
  allocated: number;
  /** Total − lançado. Positivo falta receber, negativo passou do total. */
  remaining: number;
  /** Parte da venda lançada em dinheiro. */
  cashDue: number;
  /** Quanto o cliente entregou em dinheiro. */
  cashTendered: number;
  /** Troco a devolver. */
  change: number;
  /** Dinheiro entregue a menos do que foi lançado. */
  missingTender: number;
  settled: boolean;
};

/** Diferenças abaixo de meio centavo são ruído de arredondamento. */
const TOLERANCE = 0.005;

export function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function moneyBRL(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function paymentShortLabel(method: PaymentMethod) {
  switch (method.type) {
    case 'cash':
      return 'Dinheiro';
    case 'pix':
      return 'Pix';
    case 'debit':
      return 'Débito';
    case 'credit':
      return 'Crédito';
    default:
      return method.name;
  }
}

export function isVoucherPayment(method: PaymentMethod | undefined) {
  if (!method) return false;
  if (method.id === 'PAY-VC') return true;
  return /vale\s*cr[eé]dito/i.test(method.name);
}

export function isCashPayment(method: PaymentMethod | undefined) {
  return method?.type === 'cash';
}

export function paymentMaxInstallments(method: PaymentMethod | undefined) {
  if (!method) return 1;
  if (isVoucherPayment(method)) return 1;
  const parsed = Number(method.maxInstallments);
  if (Number.isFinite(parsed) && parsed > 1) return Math.floor(parsed);
  if (method.type === 'credit') return 12;
  return 1;
}

let splitSeq = 0;

export function createSplit(methodId: string, amount = 0): SplitPayment {
  splitSeq += 1;
  return {
    key: `pay-${splitSeq}-${Math.random().toString(36).slice(2, 7)}`,
    methodId,
    amount: roundMoney(Math.max(0, amount)),
    installments: 1,
    tendered: 0,
  };
}

/**
 * Enquanto o operador não rateia a venda, a única forma lançada acompanha o
 * total — assim o caixa comum (uma forma só) não exige digitar valor nenhum.
 */
export function syncSingleSplit(
  rows: SplitPayment[],
  total: number,
  touched: boolean,
): SplitPayment[] {
  if (touched || rows.length !== 1) return rows;
  const target = roundMoney(Math.max(0, total));
  const only = rows[0];
  if (Math.abs(only.amount - target) < TOLERANCE) return rows;
  return [{ ...only, amount: target }];
}

export function summarizeSplit(
  rows: readonly SplitPayment[],
  payments: readonly PaymentMethod[],
  total: number,
): SplitSummary {
  let allocated = 0;
  let cashDue = 0;
  let cashTendered = 0;
  let missingTender = 0;

  for (const row of rows) {
    const amount = roundMoney(Math.max(0, row.amount));
    allocated += amount;
    if (!isCashPayment(payments.find((item) => item.id === row.methodId))) continue;
    const tendered = roundMoney(Math.max(0, row.tendered));
    const received = tendered > 0 ? tendered : amount;
    cashDue += amount;
    cashTendered += received;
    if (received + TOLERANCE < amount) missingTender += amount - received;
  }

  allocated = roundMoney(allocated);
  cashDue = roundMoney(cashDue);
  cashTendered = roundMoney(cashTendered);
  missingTender = roundMoney(missingTender);
  const remaining = roundMoney(roundMoney(Math.max(0, total)) - allocated);

  return {
    allocated,
    remaining,
    cashDue,
    cashTendered,
    change: roundMoney(Math.max(0, cashTendered - cashDue)),
    missingTender,
    settled: Math.abs(remaining) < TOLERANCE && missingTender < TOLERANCE,
  };
}

/** Texto gravado no pedido: "Dinheiro R$ 50,00 + Crédito 3x R$ 70,00". */
export function describeSplit(
  rows: readonly SplitPayment[],
  payments: readonly PaymentMethod[],
) {
  const active = rows.filter((row) => row.amount > 0);
  const list = active.length ? active : rows.slice(0, 1);
  return list
    .map((row) => {
      const method = payments.find((item) => item.id === row.methodId);
      const label = method ? paymentShortLabel(method) : 'Pagamento';
      const installments = row.installments > 1 ? ` ${row.installments}x` : '';
      if (list.length === 1) return `${label}${installments}`;
      return `${label}${installments} ${moneyBRL(row.amount)}`;
    })
    .join(' + ');
}

/** Cédulas sugeridas para agilizar a digitação do valor recebido. */
export function suggestTenders(due: number): number[] {
  const target = roundMoney(due);
  if (target <= 0) return [];
  const values = new Set<number>([target]);
  for (const note of [5, 10, 20, 50, 100, 200]) {
    const rounded = Math.ceil(target / note) * note;
    if (rounded > target) values.add(roundMoney(rounded));
  }
  return [...values].sort((a, b) => a - b).slice(0, 4);
}
