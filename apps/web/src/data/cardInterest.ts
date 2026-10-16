/**
 * Juros do cartão por produto. Por padrão (0) o produto tem juros: a taxa da maquininha vai para o
 * cliente. Com "sem juros até N vezes", o produto não paga juros quando o parcelamento é de até N.
 */
export type InterestLine = { lineTotal: number; interestFreeInstallments?: number };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** O produto paga juros neste parcelamento? */
export const lineHasInterest = (line: InterestLine, installments: number) => !(Number(line.interestFreeInstallments) > 0 && installments <= Number(line.interestFreeInstallments));

/**
 * Parte do valor a pagar (já com desconto e troca) sobre a qual entram os juros: a fatia dos produtos
 * que têm juros nesse parcelamento, proporcional ao valor de cada um.
 */
export function interestBase(lines: InterestLine[], amountToPay: number, installments: number) {
  const total = lines.reduce((sum, line) => sum + Math.max(0, Number(line.lineTotal) || 0), 0);
  if (total <= 0 || amountToPay <= 0) return 0;
  const charged = lines.filter((line) => lineHasInterest(line, installments)).reduce((sum, line) => sum + Math.max(0, Number(line.lineTotal) || 0), 0);
  return round2((amountToPay * charged) / total);
}

/** Rótulo do parcelamento sem juros no totem/vitrine (ex.: "10x sem juros de R$ 465,00"). */
export function interestFreeLabel(price: number, interestFreeInstallments?: number) {
  const count = Number(interestFreeInstallments) || 0;
  if (count < 2 || price <= 0) return '';
  const each = round2(price / count);
  return `${count}x sem juros de ${each.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
}
