import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminState,
  saveStock,
  STOCK_CONDITION_LABEL,
  STOCK_KIND_LABEL,
  type StockCondition,
  type StockItem,
  type StockKind,
} from '../../data/adminStore';
import { ATTRIBUTES_EVENT, stockAttributes } from '../../data/attributeStore';

export function StockPage() {
  const [attrDefs, setAttrDefs] = useState(() => stockAttributes());
  const [items, setItems] = useState(() => getAdminState().stock);
  const [form, setForm] = useState(() => emptyForm(attrDefs.map((item) => item.id)));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | StockKind>('all');
  const [conditionFilter, setConditionFilter] = useState<'all' | StockCondition>('all');

  useEffect(() => {
    function refresh() {
      setAttrDefs(stockAttributes());
    }
    window.addEventListener(ATTRIBUTES_EVENT, refresh);
    return () => window.removeEventListener(ATTRIBUTES_EVENT, refresh);
  }, []);

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (conditionFilter !== 'all' && item.condition !== conditionFilter) return false;
      return true;
    });
  }, [items, kindFilter, conditionFilter]);

  function persist(next: StockItem[]) {
    setItems(next);
    saveStock(next);
  }

  function submit() {
    if (!form.name.trim()) return;
    const payload = {
      ...form,
      color: form.attrs[attrDefs.find((item) => item.name.toLowerCase().includes('cor'))?.id ?? ''] ?? form.color,
      capacity:
        form.attrs[attrDefs.find((item) => item.name.toLowerCase().includes('capac'))?.id ?? ''] ??
        form.capacity,
    };
    if (editingId) {
      persist(items.map((item) => (item.id === editingId ? { ...item, ...payload } : item)));
    } else {
      persist([
        {
          ...payload,
          id: `STK-${Date.now().toString(36).toUpperCase()}`,
        },
        ...items,
      ]);
    }
    setForm(emptyForm(attrDefs.map((item) => item.id)));
    setEditingId(null);
  }

  function edit(item: StockItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      imei: item.imei,
      color: item.color,
      capacity: item.capacity,
      attrs: { ...item.attrs },
      qty: item.qty,
      minQty: item.minQty,
      cost: item.cost,
      price: item.price,
      kind: item.kind,
      condition: item.condition,
      sourceWorkOrderId: item.sourceWorkOrderId,
    });
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{editingId ? 'Atualizar item' : 'Cadastro de estoque'}</h2>
        <p>
          SKU, código de barras e IMEI alimentam o PDV. Peças, aparelhos e insumos compartilham o
          mesmo cadastro — recondicionados vindos de OS aparecem com origem.
        </p>
        <div className="admin-form">
          <label>
            Produto
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            SKU
            <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </label>
          <label>
            Tipo
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as StockKind })}
            >
              <option value="device">{STOCK_KIND_LABEL.device}</option>
              <option value="part">{STOCK_KIND_LABEL.part}</option>
              <option value="supply">{STOCK_KIND_LABEL.supply}</option>
            </select>
          </label>
          <label>
            Condição
            <select
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value as StockCondition })}
            >
              <option value="new">{STOCK_CONDITION_LABEL.new}</option>
              <option value="used">{STOCK_CONDITION_LABEL.used}</option>
              <option value="refurbished">{STOCK_CONDITION_LABEL.refurbished}</option>
            </select>
          </label>
          <label>
            Código de barras
            <input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
          </label>
          <label>
            IMEI
            <input
              value={form.imei}
              onChange={(e) => setForm({ ...form, imei: e.target.value })}
              placeholder="Opcional"
            />
          </label>
          {attrDefs.map((attr) => (
            <label key={attr.id}>
              {attr.name}
              <select
                value={form.attrs[attr.id] ?? ''}
                onChange={(e) =>
                  setForm({ ...form, attrs: { ...form.attrs, [attr.id]: e.target.value } })
                }
              >
                <option value="">Selecionar</option>
                {attr.values.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label>
            Quantidade
            <input
              type="number"
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
            />
          </label>
          <label>
            Mínimo
            <input
              type="number"
              value={form.minQty}
              onChange={(e) => setForm({ ...form, minQty: Number(e.target.value) })}
            />
          </label>
          <label>
            Custo
            <input
              type="number"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })}
            />
          </label>
          <label>
            Preço
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            {editingId ? 'Salvar item' : 'Incluir no estoque'}
          </button>
        </div>
      </article>

      <article className="admin-card">
        <div className="admin-toolbar" style={{ marginBottom: 12 }}>
          <label>
            Tipo{' '}
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as 'all' | StockKind)}
            >
              <option value="all">Todos</option>
              <option value="device">{STOCK_KIND_LABEL.device}</option>
              <option value="part">{STOCK_KIND_LABEL.part}</option>
              <option value="supply">{STOCK_KIND_LABEL.supply}</option>
            </select>
          </label>
          <label>
            Condição{' '}
            <select
              value={conditionFilter}
              onChange={(e) => setConditionFilter(e.target.value as 'all' | StockCondition)}
            >
              <option value="all">Todas</option>
              <option value="new">{STOCK_CONDITION_LABEL.new}</option>
              <option value="used">{STOCK_CONDITION_LABEL.used}</option>
              <option value="refurbished">{STOCK_CONDITION_LABEL.refurbished}</option>
            </select>
          </label>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU / barras / IMEI</th>
              <th>Tipo</th>
              <th>Variação</th>
              <th>Qtd</th>
              <th>Preço</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.name}
                  {item.condition === 'refurbished' ? (
                    <div className="empty">
                      Recondicionado
                      {item.sourceWorkOrderId ? (
                        <>
                          {' · '}
                          <Link to={`/painel/os/${item.sourceWorkOrderId}`}>
                            {item.sourceWorkOrderId}
                          </Link>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td>
                  {item.sku}
                  {item.barcode ? ` · ${item.barcode}` : ''}
                  {item.imei ? ` · IMEI ${item.imei}` : ''}
                </td>
                <td>
                  {STOCK_KIND_LABEL[item.kind]} · {STOCK_CONDITION_LABEL[item.condition]}
                </td>
                <td>
                  {attrDefs
                    .map((attr) => item.attrs?.[attr.id])
                    .filter(Boolean)
                    .join(' · ') ||
                    [item.color, item.capacity].filter(Boolean).join(' · ') ||
                    '—'}
                </td>
                <td className={item.qty <= item.minQty ? 'qty-low' : ''}>{item.qty}</td>
                <td className="price-red">
                  {item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td>
                  <button type="button" className="btn btn--ghost" onClick={() => edit(item)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}

function emptyForm(attrIds: string[]): Omit<StockItem, 'id'> {
  return {
    name: '',
    sku: '',
    barcode: '',
    imei: '',
    color: '',
    capacity: '',
    attrs: Object.fromEntries(attrIds.map((id) => [id, ''])),
    qty: 0,
    minQty: 1,
    cost: 0,
    price: 0,
    kind: 'device',
    condition: 'new',
  };
}
