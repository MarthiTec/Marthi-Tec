import { useState } from 'react';
import { getAdminState, savePriceTables, type PriceTable } from '../../data/adminStore';

const EMPTY: Omit<PriceTable, 'id'> = {
  name: '',
  percent: 0,
  active: true,
};

export function PriceTablesPage() {
  const [items, setItems] = useState(() => getAdminState().priceTables);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);

  function persist(next: PriceTable[]) {
    setItems(next);
    savePriceTables(next);
  }

  function submit() {
    if (!form.name.trim()) return;
    if (editingId) {
      persist(items.map((item) => (item.id === editingId ? { ...item, ...form } : item)));
    } else {
      persist([
        {
          ...form,
          id: `TAB-${Date.now().toString(36).toUpperCase()}`,
        },
        ...items,
      ]);
    }
    setForm(EMPTY);
    setEditingId(null);
  }

  function edit(item: PriceTable) {
    setEditingId(item.id);
    setForm({ name: item.name, percent: item.percent, active: item.active });
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{editingId ? 'Atualizar tabela' : 'Tabela de preço'}</h2>
        <p>
          Percentual sobre o preço de estoque. Formas de pagamento do ERP vinculam uma tabela ao
          PDV.
        </p>
        <div className="admin-form">
          <label>
            Nome
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Ajuste (%)
            <input
              type="number"
              value={form.percent}
              onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
            />
          </label>
          <label>
            Situação
            <select
              value={form.active ? '1' : '0'}
              onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}
            >
              <option value="1">Ativa no PDV</option>
              <option value="0">Inativa</option>
            </select>
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            {editingId ? 'Salvar tabela' : 'Cadastrar tabela'}
          </button>
        </div>
      </article>

      <article className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Tabela</th>
              <th>Ajuste</th>
              <th>PDV</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  {item.percent > 0 ? '+' : ''}
                  {item.percent}%
                </td>
                <td>{item.active ? 'Ativa' : 'Inativa'}</td>
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
