import { interestBase, type InterestLine } from './cardInterest';

/**
 * Venda com mais de um meio de pagamento (ex.: PIX + cartão 4x), no padrão do PDV: cada forma tem o
 * valor combinado (sem juros). A última fica com o que falta para fechar o total enquanto ninguém
 * digitou nela (touched); digitado, vale o valor digitado e a tela mostra o que falta ou excede.
 * Os juros do cartão entram em cada pagamento parcelado, só sobre a fatia dos produtos que têm juros.
 */
export type PaymentRow = { method: string; installments: number; amount: number; touched?: boolean };
export type PaymentQuote = PaymentRow & {
  /** Valor combinado desta forma (sem juros). */
  base: number;
  rate: number;
  interest: number;
  /** O que o cliente paga nesta forma (com juros). */
  total: number;
  perInstallment: number;
};

export const CREDIT_METHOD = 'Cartão de Crédito';
const round2 = (value: number) => Math.round(value * 100) / 100;

export function quotePayments(rows: PaymentRow[], amountToPay: number, lines: InterestLine[], rateFor: (installments: number) => number) {
  const list = rows.length ? rows : [{ method: CREDIT_METHOD, installments: 1, amount: 0 }];
  const last = list.length - 1;
  const autoLast = !list[last].touched;
  const typed = (row: PaymentRow) => round2(Math.max(0, Number(row.amount) || 0));
  const others = round2(list.reduce((sum, row, index) => (index === last && autoLast ? sum : sum + typed(row)), 0));
  const quotes: PaymentQuote[] = list.map((row, index) => {
    const base = index === last && autoLast ? Math.max(0, round2(amountToPay - others)) : typed(row);
    const installments = row.method === CREDIT_METHOD ? Math.max(1, Number(row.installments) || 1) : 1;
    const rate = installments > 1 ? Math.max(0, Number(rateFor(installments)) || 0) : 0;
    // Fatia com juros: a mesma proporção da venda inteira (produto "sem juros até N" fica de fora).
    const share = amountToPay > 0 ? interestBase(lines, amountToPay, installments) / amountToPay : 0;
    const interest = rate > 0 ? round2((round2(base * share) * rate) / 100) : 0;
    const total = round2(base + interest);
    return { ...row, installments, base, rate, interest, total, perInstallment: round2(total / installments) };
  });
  const allocated = round2(quotes.reduce((sum, quote) => sum + quote.base, 0));
  const cardInterest = round2(quotes.reduce((sum, quote) => sum + quote.interest, 0));
  return {
    quotes,
    /** Lançado nas formas (sem juros). */
    allocated,
    /** Positivo: falta lançar; negativo: os valores passam do total a pagar. */
    remainder: round2(amountToPay - allocated),
    cardInterest,
    totalCharged: round2(amountToPay + cardInterest),
  };
}

/** Desconto/acréscimo em R$ ou % (como no PDV): o valor em reais sobre a base. */
export type MoneyMode = 'money' | 'percent';
export const moneyAdjust = (base: number, value: number, mode: MoneyMode) =>
  !value ? 0 : mode === 'percent' ? round2((Math.max(0, base) * value) / 100) : round2(value);

/** Texto curto da forma de pagamento (resumo e anotação de juros). */
export const paymentLabel = (quote: PaymentQuote, money: (value: number) => string) =>
  quote.installments > 1 ? `${quote.method} ${quote.installments}x de ${money(quote.perInstallment)}` : `${quote.method} ${money(quote.total)}`;
