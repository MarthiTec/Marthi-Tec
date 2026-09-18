import { useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  findStockMatches,
  STOCK_CONDITION_LABEL,
  STOCK_KIND_LABEL,
  type StockItem,
} from '../../data/adminStore';
import {
  BOARD_COLUMNS,
  DISPOSITION_LABEL,
  getWorkOrder,
  PRIORITY_LABEL,
  STATUS_LABEL,
  updateWorkOrder,
  workOrderTotal,
  type AssetDisposition,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../../data/osStore';
import {
  cancelWorkOrderWithReversal,
  consumeStockOnWorkOrder,
  deliverWorkOrder,
  purchaseAssetFromWorkOrder,
  removeWorkOrderLine,
  setAssetDisposition,
} from '../../data/workshopLedger';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const current = getWorkOrder(id);
  const [form, setForm] = useState(current);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [stockQuery, setStockQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);
  const [consumeQty, setConsumeQty] = useState(1);
  const [sellPrice, setSellPrice] = useState(0);
  const [purchaseCost, setPurchaseCost] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);

  const matches = useMemo(() => findStockMatches(stockQuery, 6), [stockQuery]);

  if (!current || !form) {
    return (
      <section className="admin-page">
        <article className="admin-card">
          <h2>OS não encontrada</h2>
          <p>Essa ordem não está no histórico local.</p>
          <Link to="/painel/os" className="btn btn--ghost">
            Voltar ao quadro
          </Link>
        </article>
      </section>
    );
  }

  const locked = form.status === 'delivered' || form.status === 'cancelled';
  const partsCharge = form.lines.some((line) => line.kind === 'part')
    ? form.lines
        .filter((line) => line.kind === 'part')
        .reduce((sum, line) => sum + line.unitPrice * line.qty, 0)
    : form.parts;

  function refresh(next = getWorkOrder(id)) {
    if (next) setForm(next);
  }

  function flash(ok: string) {
    setMessage(ok);
    setError('');
    setSaved(true);
  }

  function fail(err: string) {
    setError(err);
    setMessage('');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    updateWorkOrder(form.id, {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      itemName: form.itemName,
      itemRef: form.itemRef,
      defect: form.defect,
      notes: form.notes,
      technician: form.technician,
      priority: form.priority,
      labor: form.labor,
    });
    refresh();
    flash('OS atualizada.');
  }

  function setStatus(status: WorkOrderStatus) {
    if (!form) return;
    if (status === 'delivered') {
      const result = deliverWorkOrder(form.id);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setForm(result.data);
      flash('OS entregue · receita lançada no financeiro.');
      return;
    }
    if (status === 'cancelled') {
      const result = cancelWorkOrderWithReversal(form.id);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setForm(result.data);
      flash('OS cancelada · estoque e custos estornados.');
      return;
    }
    const next = updateWorkOrder(form.id, { status });
    if (next) setForm(next);
    flash('Status atualizado.');
  }

  function pickStock(item: StockItem) {
    setSelectedStock(item);
    setStockQuery(`${item.name} · ${item.sku}`);
    setSellPrice(item.price);
    setConsumeQty(1);
  }

  function consumePart() {
    if (!form || !selectedStock) {
      fail(selectedStock ? 'OS inválida.' : 'Selecione um item do estoque.');
      return;
    }
    const result = consumeStockOnWorkOrder(form.id, selectedStock.id, consumeQty, sellPrice);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setForm(result.data);
    setSelectedStock(null);
    setStockQuery('');
    flash(`Peça baixada · custo ${money(selectedStock.cost * consumeQty)} no financeiro.`);
  }

  function removeLine(lineId: string) {
    if (!form) return;
    const result = removeWorkOrderLine(form.id, lineId);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setForm(result.data);
    flash('Peça estornada do estoque e do financeiro.');
  }

  function changeDisposition(value: AssetDisposition) {
    if (!form) return;
    if (value === 'purchased') {
      setForm({ ...form, assetDisposition: 'purchased' });
      return;
    }
    const result = setAssetDisposition(form.id, value);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setForm(result.data);
    flash('Destino do equipamento atualizado.');
  }

  function buyAsset() {
    if (!form) return;
    const result = purchaseAssetFromWorkOrder(form.id, {
      cost: purchaseCost,
      name: form.itemName,
      imei: form.itemRef,
      price: purchasePrice || undefined,
    });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setForm(result.data.order);
    flash(
      `Recondicionado ${result.data.stock.sku} no estoque · débito ${money(purchaseCost)}.`,
    );
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <div className="os-detail__top">
          <div>
            <h2>{form.id}</h2>
            <p>
              {form.customerName} · {form.customerPhone || 'sem telefone'}
            </p>
          </div>
          <strong>{money(workOrderTotal(form))}</strong>
        </div>
        <div className="os-flow">
          {[...BOARD_COLUMNS, 'delivered' as const, 'cancelled' as const].map((status) => (
            <button
              key={status}
              type="button"
              className={`os-flow__step ${form.status === status ? 'is-current' : ''}`}
              onClick={() => setStatus(status)}
            >
              {STATUS_LABEL[status]}
            </button>
          ))}
        </div>
        {message ? <p className="empty">{message}</p> : null}
        {error ? <p className="qty-low">{error}</p> : null}
      </article>

      <article className="admin-card admin-card--form">
        <h2>Dados da OS</h2>
        <form className="admin-form" onSubmit={submit}>
          <label>
            Cliente
            <input
              value={form.customerName}
              onChange={(event) => {
                setForm({ ...form, customerName: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Telefone
            <input
              value={form.customerPhone}
              onChange={(event) => {
                setForm({ ...form, customerPhone: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Item / equipamento
            <input
              value={form.itemName}
              onChange={(event) => {
                setForm({ ...form, itemName: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Referência
            <input
              value={form.itemRef}
              onChange={(event) => {
                setForm({ ...form, itemRef: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label className="span-2">
            Defeito relatado
            <textarea
              value={form.defect}
              onChange={(event) => {
                setForm({ ...form, defect: event.target.value });
                setSaved(false);
              }}
              required
            />
          </label>
          <label>
            Técnico
            <input
              value={form.technician}
              onChange={(event) => {
                setForm({ ...form, technician: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Prioridade
            <select
              value={form.priority}
              onChange={(event) => {
                setForm({ ...form, priority: event.target.value as WorkOrderPriority });
                setSaved(false);
              }}
            >
              <option value="low">{PRIORITY_LABEL.low}</option>
              <option value="normal">{PRIORITY_LABEL.normal}</option>
              <option value="high">{PRIORITY_LABEL.high}</option>
            </select>
          </label>
          <label>
            Mão de obra (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.labor}
              disabled={locked}
              onChange={(event) => {
                setForm({ ...form, labor: Number(event.target.value) || 0 });
                setSaved(false);
              }}
            />
          </label>
          <label>
            Peças ao cliente (R$)
            <input type="number" value={partsCharge} readOnly />
          </label>
          <label className="span-2">
            Observações internas
            <textarea
              value={form.notes}
              onChange={(event) => {
                setForm({ ...form, notes: event.target.value });
                setSaved(false);
              }}
            />
          </label>
          <div className="span-2 admin-toolbar">
            <button type="submit" className="btn btn--primary" disabled={locked}>
              Salvar OS
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={locked}
              onClick={() => setStatus('delivered')}
            >
              Entregar · lançar receita
            </button>
            <Link to="/painel/os" className="btn btn--ghost">
              Voltar ao quadro
            </Link>
            {saved && !message ? <span className="empty">OS atualizada.</span> : null}
          </div>
        </form>
      </article>

      <article className="admin-card">
        <h2>Peças / materiais</h2>
        <p>Baixa do estoque lança o custo no financeiro na hora. O preço ao cliente entra na receita na entrega.</p>
        {!locked ? (
          <div className="admin-form">
            <label className="span-2">
              Buscar estoque
              <input
                value={stockQuery}
                onChange={(event) => {
                  setStockQuery(event.target.value);
                  setSelectedStock(null);
                }}
                placeholder="Nome, SKU, barras ou IMEI"
              />
            </label>
            {matches.length && !selectedStock ? (
              <div className="span-2 os-stock-matches">
                {matches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => pickStock(item)}
                  >
                    {item.name} · {item.sku} · qtd {item.qty} · custo {money(item.cost)}
                  </button>
                ))}
              </div>
            ) : null}
            <label>
              Quantidade
              <input
                type="number"
                min="1"
                value={consumeQty}
                onChange={(event) => setConsumeQty(Number(event.target.value) || 1)}
              />
            </label>
            <label>
              Preço ao cliente (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={sellPrice}
                onChange={(event) => setSellPrice(Number(event.target.value) || 0)}
              />
            </label>
            <div className="span-2 admin-toolbar">
              <button type="button" className="btn btn--primary" onClick={consumePart}>
                Baixar do estoque
              </button>
            </div>
          </div>
        ) : null}

        <table className="admin-table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qtd</th>
              <th>Custo</th>
              <th>Cliente</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {form.lines.filter((line) => line.kind === 'part').length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhuma peça baixada ainda.
                  {form.parts > 0 ? ` Valor legado de peças: ${money(form.parts)}.` : ''}
                </td>
              </tr>
            ) : (
              form.lines
                .filter((line) => line.kind === 'part')
                .map((line) => (
                  <tr key={line.id}>
                    <td>{line.name}</td>
                    <td>{line.qty}</td>
                    <td>{money(line.unitCost * line.qty)}</td>
                    <td className="price-red">{money(line.unitPrice * line.qty)}</td>
                    <td>
                      {!locked ? (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => removeLine(line.id)}
                        >
                          Estornar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
        <p className="empty" style={{ marginTop: 8 }}>
          Total peças ao cliente {money(partsCharge)} · mão de obra {money(form.labor)} · cobrança{' '}
          {money(workOrderTotal(form))}
        </p>
      </article>

      <article className="admin-card">
        <h2>Equipamento na oficina</h2>
        <p>Destino do aparelho/item da OS — compra gera recondicionado no estoque e débito no caixa.</p>
        <div className="admin-form">
          <label>
            Destino
            <select
              value={form.assetDisposition}
              disabled={locked || Boolean(form.purchaseStockId)}
              onChange={(event) => changeDisposition(event.target.value as AssetDisposition)}
            >
              <option value="customer">{DISPOSITION_LABEL.customer}</option>
              <option value="purchased">{DISPOSITION_LABEL.purchased}</option>
              <option value="scrapped">{DISPOSITION_LABEL.scrapped}</option>
            </select>
          </label>
          {form.purchaseStockId ? (
            <label className="span-2">
              Estoque gerado
              <input
                readOnly
                value={`${form.purchaseStockId} · custo ${money(form.purchaseCost ?? 0)}`}
              />
            </label>
          ) : null}
        </div>

        {form.assetDisposition === 'purchased' && !form.purchaseStockId && !locked ? (
          <div className="admin-form" style={{ marginTop: 12 }}>
            <label>
              Custo pago (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={purchaseCost}
                onChange={(event) => {
                  const cost = Number(event.target.value) || 0;
                  setPurchaseCost(cost);
                  if (!purchasePrice) setPurchasePrice(Math.round(cost * 1.35 * 100) / 100);
                }}
              />
            </label>
            <label>
              Preço de venda sugerido (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(event) => setPurchasePrice(Number(event.target.value) || 0)}
              />
            </label>
            <label className="span-2">
              Preview SKU
              <input
                readOnly
                value={`REC · ${form.itemName} · ${STOCK_KIND_LABEL.device} · ${STOCK_CONDITION_LABEL.refurbished}`}
              />
            </label>
            <div className="span-2 admin-toolbar">
              <button type="button" className="btn btn--primary" onClick={buyAsset}>
                Comprar para estoque
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
