import { useState } from 'react';
import { getAdminState, type Customer, upsertCustomer } from '../../data/adminStore';

const EMPTY = {
  name: '',
  phone: '',
  document: '',
  email: '',
  city: '',
};

export function CustomersPage() {
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [customers, setCustomers] = useState(() => getAdminState().customers);

  const filtered = customers.filter((item) =>
    `${item.name} ${item.phone} ${item.document}`.toLowerCase().includes(query.toLowerCase()),
  );

  function submit() {
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 8) return;
    const next = upsertCustomer({ ...form, id: editingId });
    setCustomers(next.customers);
    setForm(EMPTY);
    setEditingId(undefined);
  }

  function edit(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      phone: customer.phone,
      document: customer.document,
      email: customer.email,
      city: customer.city,
    });
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{editingId ? 'Editar cliente' : 'Novo cliente'}</h2>
        <div className="admin-form">
          <label>
            Nome
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            Telefone
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            CPF / CNPJ
            <input
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
            />
          </label>
          <label>
            E-mail
            <input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="span-2">
            Cidade
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            {editingId ? 'Salvar' : 'Cadastrar'}
          </button>
        </div>
      </article>

      <article className="admin-card">
        <div className="admin-toolbar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente…"
          />
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Documento</th>
              <th>Cidade</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.phone}</td>
                <td>{customer.document || '—'}</td>
                <td>{customer.city || '—'}</td>
                <td>
                  <button type="button" className="btn btn--ghost" onClick={() => edit(customer)}>
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
