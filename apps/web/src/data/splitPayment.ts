import { interestBase, type InterestLine } from './cardInterest';

/**
 * Venda com mais de um meio de pagamento (ex.: PIX + cartão 4x). Cada linha tem o valor combinado
 * (sem juros); a última fica com o que falta para fechar o total. Os juros do cartão entram em cada
 * pagamento parcelado, só sobre a fatia dos produtos que têm juros nesse parcelamento.
 */
export type PaymentRow = { method: string; installments: number; amount: number };
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
  const fixed = list.slice(0, -1).map((row) => round2(Math.max(0, Number(row.amount) || 0)));
  const remainder = round2(amountToPay - fixed.reduce((sum, value) => sum + value, 0));
  const quotes: PaymentQuote[] = list.map((row, index) => {
    const base = index < fixed.length ? fixed[index] : Math.max(0, remainder);
    const installments = row.method === CREDIT_METHOD ? Math.max(1, Number(row.installments) || 1) : 1;
    const rate = installments > 1 ? Math.max(0, Number(rateFor(installments)) || 0) : 0;
    // Fatia com juros: a mesma proporção da venda inteira (produto "sem juros até N" fica de fora).
    const share = amountToPay > 0 ? interestBase(lines, amountToPay, installments) / amountToPay : 0;
    const interest = rate > 0 ? round2((round2(base * share) * rate) / 100) : 0;
    const total = round2(base + interest);
    return { ...row, installments, base, rate, interest, total, perInstallment: round2(total / installments) };
  });
  const cardInterest = round2(quotes.reduce((sum, quote) => sum + quote.interest, 0));
  return {
    quotes,
    /** Negativo quando os valores informados passam do total a pagar. */
    remainder,
    cardInterest,
    totalCharged: round2(amountToPay + cardInterest),
  };
}

/** Texto curto da forma de pagamento (resumo e anotação de juros). */
export const paymentLabel = (quote: PaymentQuote, money: (value: number) => string) =>
  quote.installments > 1 ? `${quote.method} ${quote.installments}x de ${money(quote.perInstallment)}` : `${quote.method} ${money(quote.total)}`;
