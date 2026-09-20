import { useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import {
  confirmDelete,
  CrudListBar,
  CrudRowActions,
  crudFormTitle,
  matchesQuery,
  matchesStatus,
  type CrudStatusFilter,
} from '../../components/CrudKit';
import {
  getAdminState,
  removeCustomer,
  type Customer,
  upsertCustomer,
} from '../../data/adminStore';

const EMPTY = {
  name: '',
  phone: '',
  document: '',
  email: '',
  city: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  state: '',
  active: true,
};

type Mode = 'new' | 'edit' | 'view';

export function CustomersPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [form, setForm] = useState(EMPTY);
  const [mode, setMode] = useState<Mode>('new');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [customers, setCustomers] = useState(() => getAdminState().customers);

  const filtered = useMemo(
    () =>
      customers.filter(
        (item) =>
          matchesStatus(item.active !== false, status) &&
          matchesQuery(`${item.name} ${item.phone} ${item.document} ${item.email} ${item.city}`, query),
      ),
    [customers, query, status],
  );

  const readOnly = mode === 'view';

  function resetForm() {
    setForm(EMPTY);
    setSelectedId(undefined);
    setMode('new');
  }

  function loadItem(customer: Customer, nextMode: Mode) {
    setSelectedId(customer.id);
    setMode(nextMode);
    setForm({
      name: customer.name,
      phone: customer.phone,
      document: customer.document,
      email: customer.email,
      city: customer.city,
      zipCode: customer.zipCode || '',
      street: customer.street || '',
      number: customer.number || '',
      complement: customer.complement || '',
      neighborhood: customer.neighborhood || '',
      state: customer.state || '',
      active: customer.active !== false,
    });
  }

  function submit() {
    if (readOnly) return;
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 8) return;
    const next = upsertCustomer({ ...form, id: mode === 'edit' ? selectedId : undefined });
    setCustomers(next.customers);
    resetForm();
  }

  function remove(customer: Customer) {
    if (!confirmDelete(`o cliente ${customer.name}`)) return;
    setCustomers(removeCustomer(customer.id).customers);
    if (selectedId === customer.id) resetForm();
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{crudFormTitle(mode, 'cliente')}</h2>
        <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
          <label>
            Nome
            <input
              value={form.name}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Telefone
            <input
              value={form.phone}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label>
            CPF / CNPJ
            <input
              value={form.document}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
            />
          </label>
          <label>
            E-mail
            <input
              value={form.email}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Cidade
            <input
              value={form.city}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </label>
          <AdminPicker
            label="Situação"
            value={form.active ? '1' : '0'}
            disabled={readOnly}
            options={[
              { value: '1', label: 'Ativo' },
              { value: '0', label: 'Inativo' },
            ]}
            onChange={(value) => setForm({ ...form, active: value === '1' })}
          />
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          {readOnly ? (
            <>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setMode('edit')}
              >
                Editar
              </button>
              <button type="button" className="btn btn--ghost" onClick={resetForm}>
                Fechar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn--primary" onClick={submit}>
                {mode === 'edit' ? 'Salvar' : 'Cadastrar'}
              </button>
              {mode === 'edit' ? (
                <button type="button" className="btn btn--ghost" onClick={resetForm}>
                  Cancelar
                </button>
              ) : null}
            </>
          )}
        </div>
      </article>

      <article className="admin-card">
        <CrudListBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Buscar cliente, telefone, documento…"
          status={status}
          onStatusChange={setStatus}
          onNew={resetForm}
          newLabel="Novo cliente"
        />
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Documento</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.name}</td>
                  <td>{customer.phone}</td>
                  <td>{customer.document || '—'}</td>
                  <td>{customer.active !== false ? 'Ativo' : 'Inativo'}</td>
                  <td>
                    <CrudRowActions
                      onView={() => loadItem(customer, 'view')}
                      onEdit={() => loadItem(customer, 'edit')}
                      onDelete={() => remove(customer)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
