import {
  addFinance,
  getAdminState,
  getStockItem,
  saveStock,
  type StockItem,
  type StockKind,
} from './adminStore';
import {
  getWorkOrder,
  newWorkOrderLineId,
  partsTotalFromLines,
  updateWorkOrder,
  workOrderTotal,
  type AssetDisposition,
  type WorkOrder,
  type WorkOrderLine,
} from './osStore';

export type LedgerResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

function moneyLabel(amount: number) {
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function syncParts(order: WorkOrder, lines: WorkOrderLine[]) {
  return updateWorkOrder(order.id, {
    lines,
    parts: partsTotalFromLines(lines),
  });
}

/** Baixa peça/insumo do estoque, lança custo no financeiro e adiciona linha na OS. */
export function consumeStockOnWorkOrder(
  osId: string,
  stockId: string,
  qty: number,
  sellPrice?: number,
): LedgerResult<WorkOrder> {
  const order = getWorkOrder(osId);
  if (!order) return { ok: false, error: 'OS não encontrada.' };
  if (order.status === 'cancelled' || order.status === 'delivered') {
    return { ok: false, error: 'OS encerrada — não dá para baixar peças.' };
  }
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Quantidade inválida.' };

  const stock = getStockItem(stockId);
  if (!stock) return { ok: false, error: 'Item de estoque não encontrado.' };
  if (stock.qty < qty) return { ok: false, error: `Estoque insuficiente (${stock.qty} disponível).` };

  const unitCost = stock.cost;
  const unitPrice = sellPrice ?? stock.price;
  const costTotal = unitCost * qty;

  const state = getAdminState();
  const nextStock = state.stock.map((item) =>
    item.id === stockId ? { ...item, qty: item.qty - qty } : item,
  );
  saveStock(nextStock);

  const finance = addFinance({
    type: 'out',
    label: `${osId} · peça ${stock.name}`,
    amount: costTotal,
    source: 'os_part',
    refId: osId,
  });
  const financeId = finance.finance[0]?.id;

  const line: WorkOrderLine = {
    id: newWorkOrderLineId(),
    stockId,
    name: stock.name,
    qty,
    unitCost,
    unitPrice,
    kind: 'part',
    financeId,
  };
  const updated = syncParts(order, [...order.lines, line]);
  if (!updated) return { ok: false, error: 'Falha ao atualizar a OS.' };
  return { ok: true, data: updated };
}

/** Remove linha da OS e estorna estoque + lançamento de custo. */
export function removeWorkOrderLine(osId: string, lineId: string): LedgerResult<WorkOrder> {
  const order = getWorkOrder(osId);
  if (!order) return { ok: false, error: 'OS não encontrada.' };
  if (order.status === 'delivered') {
    return { ok: false, error: 'OS já entregue — não dá para remover peça.' };
  }

  const line = order.lines.find((item) => item.id === lineId);
  if (!line) return { ok: false, error: 'Linha não encontrada.' };
  if (line.kind !== 'part' || !line.stockId) {
    return { ok: false, error: 'Só linhas de peça com estoque podem ser estornadas assim.' };
  }

  const state = getAdminState();
  const nextStock = state.stock.map((item) =>
    item.id === line.stockId ? { ...item, qty: item.qty + line.qty } : item,
  );
  saveStock(nextStock);

  const costTotal = line.unitCost * line.qty;
  addFinance({
    type: 'in',
    label: `${osId} · estorno peça ${line.name}`,
    amount: costTotal,
    source: 'os_reversal',
    refId: osId,
  });

  const updated = syncParts(
    order,
    order.lines.filter((item) => item.id !== lineId),
  );
  if (!updated) return { ok: false, error: 'Falha ao atualizar a OS.' };
  return { ok: true, data: updated };
}

export type PurchaseAssetInput = {
  cost: number;
  name?: string;
  sku?: string;
  imei?: string;
  kind?: StockKind;
  price?: number;
};

/** Compra o equipamento da OS para estoque recondicionado + débito financeiro. */
export function purchaseAssetFromWorkOrder(
  osId: string,
  input: PurchaseAssetInput,
): LedgerResult<{ order: WorkOrder; stock: StockItem }> {
  const order = getWorkOrder(osId);
  if (!order) return { ok: false, error: 'OS não encontrada.' };
  if (order.status === 'cancelled') return { ok: false, error: 'OS cancelada.' };
  if (order.assetDisposition === 'purchased' && order.purchaseStockId) {
    return { ok: false, error: 'Equipamento já comprado para estoque nesta OS.' };
  }
  if (!Number.isFinite(input.cost) || input.cost < 0) {
    return { ok: false, error: 'Custo de compra inválido.' };
  }

  const name = (input.name ?? order.itemName).trim() || 'Aparelho recondicionado';
  const sku =
    input.sku?.trim() ||
    `REC-${osId.replace(/^OS-/, '')}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
  const stockItem: StockItem = {
    id: `STK-${Date.now().toString(36).toUpperCase()}`,
    name,
    sku,
    barcode: '',
    imei: input.imei?.trim() || order.itemRef.replace(/[^\d]/g, '').slice(0, 15),
    color: '',
    capacity: '',
    attrs: {},
    qty: 1,
    minQty: 0,
    cost: input.cost,
    price: input.price ?? Math.round(input.cost * 1.35 * 100) / 100,
    kind: input.kind ?? 'device',
    condition: 'refurbished',
    sourceWorkOrderId: osId,
    showOnTotem: false,
    images: [],
  };

  const state = getAdminState();
  saveStock([stockItem, ...state.stock]);

  const finance = addFinance({
    type: 'out',
    label: `${osId} · compra recondicionado ${name}`,
    amount: input.cost,
    source: 'os_purchase',
    refId: osId,
  });

  const updated = updateWorkOrder(osId, {
    assetDisposition: 'purchased',
    purchaseCost: input.cost,
    purchaseAt: new Date().toISOString(),
    purchaseStockId: stockItem.id,
    purchaseFinanceId: finance.finance[0]?.id,
  });
  if (!updated) return { ok: false, error: 'Falha ao atualizar a OS.' };
  return { ok: true, data: { order: updated, stock: stockItem } };
}

export function setAssetDisposition(
  osId: string,
  disposition: AssetDisposition,
): LedgerResult<WorkOrder> {
  const order = getWorkOrder(osId);
  if (!order) return { ok: false, error: 'OS não encontrada.' };
  if (order.assetDisposition === 'purchased' && order.purchaseStockId) {
    return { ok: false, error: 'Já existe compra registrada — não dá para mudar o destino.' };
  }
  if (disposition === 'purchased') {
    return { ok: false, error: 'Use a compra com custo para marcar como comprado.' };
  }
  const updated = updateWorkOrder(osId, { assetDisposition: disposition });
  if (!updated) return { ok: false, error: 'Falha ao atualizar a OS.' };
  return { ok: true, data: updated };
}

/** Entrega a OS e lança crédito de receita (mão de obra + preço das peças ao cliente). */
export function deliverWorkOrder(osId: string): LedgerResult<WorkOrder> {
  const order = getWorkOrder(osId);
  if (!order) return { ok: false, error: 'OS não encontrada.' };
  if (order.status === 'cancelled') return { ok: false, error: 'OS cancelada.' };
  if (order.status === 'delivered') return { ok: false, error: 'OS já entregue.' };

  const revenue = workOrderTotal(order);
  let revenueFinanceId = order.revenueFinanceId;

  if (revenue > 0 && !revenueFinanceId) {
    const finance = addFinance({
      type: 'in',
      label: `${osId} · receita serviço (${moneyLabel(revenue)})`,
      amount: revenue,
      source: 'os_revenue',
      refId: osId,
    });
    revenueFinanceId = finance.finance[0]?.id;
  }

  const updated = updateWorkOrder(osId, {
    status: 'delivered',
    revenueFinanceId,
  });
  if (!updated) return { ok: false, error: 'Falha ao entregar a OS.' };
  return { ok: true, data: updated };
}

/** Cancela OS e estorna peças + compra de aparelho quando houver. */
export function cancelWorkOrderWithReversal(osId: string): LedgerResult<WorkOrder> {
  const order = getWorkOrder(osId);
  if (!order) return { ok: false, error: 'OS não encontrada.' };
  if (order.status === 'delivered') {
    return { ok: false, error: 'OS entregue — cancele via estorno manual se necessário.' };
  }
  if (order.status === 'cancelled') return { ok: true, data: order };

  let working = order;
  for (const line of [...working.lines]) {
    if (line.kind !== 'part') continue;
    const result = removeWorkOrderLine(working.id, line.id);
    if (!result.ok) return result;
    working = result.data;
  }

  if (working.purchaseStockId && working.purchaseCost != null) {
    const state = getAdminState();
    const stock = state.stock.find((item) => item.id === working.purchaseStockId);
    if (stock) {
      if (stock.qty < 1) {
        return {
          ok: false,
          error: 'Aparelho comprado já saiu do estoque — não dá para cancelar automaticamente.',
        };
      }
      saveStock(state.stock.filter((item) => item.id !== working.purchaseStockId));
      addFinance({
        type: 'in',
        label: `${osId} · estorno compra recondicionado ${stock.name}`,
        amount: working.purchaseCost,
        source: 'os_reversal',
        refId: osId,
      });
    }
  }

  if (working.revenueFinanceId) {
    return { ok: false, error: 'Há receita lançada — estorne manualmente antes de cancelar.' };
  }

  const updated = updateWorkOrder(osId, {
    status: 'cancelled',
    assetDisposition: working.purchaseStockId ? 'customer' : working.assetDisposition,
    purchaseStockId: undefined,
    purchaseFinanceId: undefined,
    purchaseCost: undefined,
    purchaseAt: undefined,
  });
  if (!updated) return { ok: false, error: 'Falha ao cancelar a OS.' };
  return { ok: true, data: updated };
}
