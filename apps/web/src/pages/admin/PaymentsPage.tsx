import { useState } from 'react';
import {
  getAdminState,
  savePayments,
  type PaymentMethod,
} from '../../data/adminStore';

const EMPTY: Omit<PaymentMethod, 'id'> = {
  name: '',
  type: 'cash',
  priceTableId: '',
  maxInstallments: 1,
  active: true,
};

const TYPES: { id: PaymentMethod['type']; label: string }[] = [
  { id: 'cash', label: 'Dinheiro' },
  { id: 'pix', label: 'Pix' },
  { id: 'debit', label: 'Débito' },
  { id: 'credit', label: 'Crédito' },
  { id: 'other', label: 'Outro' },
];

export function PaymentsPage() {
  const state = getAdminState();
  const [tables] = useState(state.priceTables);
  const [items, setItems] = useState(state.payments);
  const [form, setForm] = useState({ ...EMPTY, priceTableId: state.priceTables[0]?.id ?? '' });
  const [editingId, setEditingId] = useState<string | null>(null);

  function persist(next: PaymentMethod[]) {
    setItems(next);
    savePayments(next);
  }

  function submit() {
    if (!form.name.trim() || !form.priceTableId) return;
    if (editingId) {
      persist(items.map((item) => (item.id === editingId ? { ...item, ...form } : item)));
    } else {
      persist([
        {
          ...form,
          id: `PAY-${Date.now().toString(36).toUpperCase()}`,
        },
        ...items,
      ]);
    }
    setForm({ ...EMPTY, priceTableId: tables[0]?.id ?? '' });
    setEditingId(null);
  }

  function edit(item: PaymentMethod) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      type: item.type,
      priceTableId: item.priceTableId,
      maxInstallments: item.maxInstallments,
      active: item.active,
    });
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{editingId ? 'Atualizar forma' : 'Forma de pagamento'}</h2>
        <p>
          Cada forma aparece no PDV e puxa a tabela de preço vinculada (vista, cartão, atacado).
        </p>
        <div className="admin-form">
          <label>
            Nome
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Tipo
            <select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as PaymentMethod['type'] })
              }
            >
              {TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tabela de preço
            <select
              value={form.priceTableId}
              onChange={(e) => setForm({ ...form, priceTableId: e.target.value })}
            >
              {tables.length === 0 ? (
                <option value="">Cadastre uma tabela primeiro</option>
              ) : (
                tables.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.percent > 0 ? '+' : ''}
                    {item.percent}%)
                  </option>
                ))
              )}
            </select>
          </label>
          <label>
            Máx. parcelas
            <input
              type="number"
              min={1}
              value={form.maxInstallments}
              onChange={(e) =>
                setForm({ ...form, maxInstallments: Math.max(1, Number(e.target.value) || 1) })
              }
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
            {editingId ? 'Salvar forma' : 'Cadastrar forma'}
          </button>
        </div>
      </article>

      <article className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Forma</th>
              <th>Tipo</th>
              <th>Tabela</th>
              <th>Parcelas</th>
              <th>PDV</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{TYPES.find((entry) => entry.id === item.type)?.label ?? item.type}</td>
                <td>{tables.find((table) => table.id === item.priceTableId)?.name ?? '—'}</td>
                <td>{item.maxInstallments}x</td>
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
