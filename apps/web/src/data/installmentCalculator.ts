/** Parcelamento no cartão, como a calculadora da loja: total e parcela arredondados para cima. */

export const MAX_CALCULATOR_INSTALLMENTS = 18;

const round2 = (value: number) => Math.round(value * 100) / 100;
/** Arredonda para cima no centavo (ARREDONDAR.PARA.CIMA(x; 2)), sem erro de ponto flutuante. */
export const roundUpCents = (value: number) => Math.ceil(Number((value * 100).toFixed(6))) / 100;

export type InstallmentSimulation = { parcels: number; ratePercent: number; total: number; installment: number; interest: number };

/** Valor à vista + taxa das parcelas → total com juros, valor de cada parcela e juros. */
export function simulateInstallments(price: number, parcels: number, ratePercent: number): InstallmentSimulation {
  const count = Math.min(MAX_CALCULATOR_INSTALLMENTS, Math.max(1, Math.round(parcels) || 1));
  const base = Math.max(0, Number(price) || 0);
  const rate = Math.max(0, Number(ratePercent) || 0);
  const total = roundUpCents(base * (1 + rate / 100));
  return { parcels: count, ratePercent: rate, total, installment: roundUpCents(total / count), interest: round2(total - base) };
}
