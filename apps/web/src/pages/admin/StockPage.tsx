import { useState } from 'react';
import { getAdminState, saveStock, type StockItem } from '../../data/adminStore';

const EMPTY: Omit<StockItem, 'id'> = {
  name: '',
  sku: '',
  color: '',
  capacity: '',
  qty: 0,
  minQty: 1,
  cost: 0,
  price: 0,
};

export function StockPage() {
  const [items, setItems] = useState(() => getAdminState().stock);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  function persist(next: StockItem[]) {
    setItems(next);
    saveStock(next);
  }

  function submit() {
    if (!form.name.trim()) return;
    if (editingId) {
      persist(items.map((item) => (item.id === editingId ? { ...item, ...form } : item)));
    } else {
      persist([
        {
          ...form,
          id: `STK-${Date.now().toString(36).toUpperCase()}`,
        },
        ...items,
      ]);
    }
    setForm(EMPTY);
    setEditingId(null);
  }

  function edit(item: StockItem) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      sku: item.sku,
      color: item.color,
      capacity: item.capacity,
      qty: item.qty,
      minQty: item.minQty,
      cost: item.cost,
      price: item.price,
    });
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{editingId ? 'Atualizar item' : 'Cadastro de estoque'}</h2>
        <p>Módulo mais completo da operação: SKU, variação, mínimo, custo e preço de venda.</p>
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
            Cor
            <input
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </label>
          <label>
            Capacidade
            <input
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
            />
          </label>
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
        <table className="admin-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>SKU</th>
              <th>Variação</th>
              <th>Qtd</th>
              <th>Preço</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.sku}</td>
                <td>
                  {item.color} · {item.capacity}
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
