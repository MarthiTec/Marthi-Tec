/** Entrada de fornecedor no que importa para o custo: unidades, saídas e custo unitário. */
type CostEntry = { qty: number; soldQty?: number; unitCost: number };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/**
 * Custo do que ainda está em estoque: cada entrada vale pelas unidades que não saíram, ao custo
 * daquela compra; só o que não tem entrada vai pelo custo médio. (O custo médio sozinho mistura o
 * custo dos aparelhos já vendidos.)
 */
export function inStockCost(qty: number, averageCost: number, entries: CostEntry[] | undefined) {
  const onHand = Math.max(0, Number(qty) || 0);
  let units = 0;
  let cost = 0;
  for (const entry of entries ?? []) {
    const left = Math.max(0, (Number(entry.qty) || 0) - (entry.soldQty ?? 0));
    units += left;
    cost += left * (Number(entry.unitCost) || 0);
  }
  // Mais unidades nas entradas do que no saldo (ajuste manual): vale o saldo, ao custo das entradas.
  if (units > onHand) return roundMoney(units ? (cost * onHand) / units : 0);
  return roundMoney(cost + (onHand - units) * (Number(averageCost) || 0));
}
