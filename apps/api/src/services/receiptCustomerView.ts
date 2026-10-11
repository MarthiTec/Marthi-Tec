/**
 * Visão do cliente no comprovante/garantia: os juros do cartão são da loja (taxa da maquininha repassada),
 * não um "acréscimo" para o cliente. No documento do cliente o valor combinado aparece embutido nos itens
 * (ex.: R$ 4.400,00 em 18x de R$ 246,67), sem linha de juros e sem a anotação interna de juros.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Anotação que a venda externa grava nas observações: "Juros do cartão 18x (20%): R$ 740,00". */
const CARD_INTEREST_NOTE = /Juros do cartão \d+x \([^)]*\):\s*R\$\s*([\d.]+,\d{2})/i;

const parseBrl = (text: string) => Number(text.replace(/\./g, '').replace(',', '.'));

/** Juros do cartão da venda: o campo próprio ou, em vendas antigas, o valor anotado nas observações. */
export function saleCardInterest(stored: unknown, notes: unknown) {
  const value = Number(stored || 0);
  if (value > 0) return round2(value);
  const match = String(notes ?? '').match(CARD_INTEREST_NOTE);
  return match ? round2(parseBrl(match[1])) : 0;
}

/** Observações sem a anotação interna de juros (fica só para a loja). */
export function stripCardInterestNote(notes: unknown) {
  return String(notes ?? '')
    .split('·')
    .map((part) => part.trim())
    .filter((part) => part && !CARD_INTEREST_NOTE.test(part))
    .join(' · ');
}

/** Distribui os juros nos itens, proporcional ao valor de cada um; a soma bate exatamente com o total cobrado. */
export function spreadOverLines<T extends { qty: number; unitPrice: number; totalPrice: number }>(lines: T[], extra: number): T[] {
  const base = lines.reduce((sum, line) => sum + line.totalPrice, 0);
  if (!(extra > 0) || !(base > 0)) return lines;
  let given = 0;
  return lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    const share = isLast ? round2(extra - given) : round2((extra * line.totalPrice) / base);
    given = round2(given + share);
    const totalPrice = round2(line.totalPrice + share);
    return { ...line, totalPrice, unitPrice: line.qty > 0 ? round2(totalPrice / line.qty) : line.unitPrice };
  });
}
