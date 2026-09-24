import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import {
  confirmDelete,
  CrudListBar,
  CrudNameButton,
  CrudRowActions,
  crudFormTitle,
  matchesQuery,
  matchesStatus,
  type CrudStatusFilter,
} from '../../components/CrudKit';
import {
  HeadingCancelButton,
  HeadingEditButton,
  HeadingNewButton,
  HeadingSaveButton,
  PageHeadingActions,
} from '../../components/PageHeadingActions';
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

const REFRESH_EVENTS = [
  'marthi-admin-state',
  'marthi-os-state',
  'marthi-erp-bootstrap',
  'marthi-stock',
] as const;

export function CustomersPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [form, setForm] = useState(EMPTY);
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [customers, setCustomers] = useState(() => getAdminState().customers);
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      setCustomers(getAdminState().customers);
    }
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refresh);
    return () => {
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refresh);
    };
  }, []);

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
    setError('');
  }

  function closeForm() {
    resetForm();
    setFormVisible(false);
  }

  function startNew() {
    resetForm();
    setFormVisible(true);
  }

  function loadItem(customer: Customer, nextMode: Mode) {
    setSelectedId(customer.id);
    setMode(nextMode);
    setFormVisible(true);
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

  async function submit() {
    if (readOnly) return;
    if (!form.name.trim() || form.phone.replace(/\D/g, '').length < 8) return;
    setError('');
    try {
      const next = await upsertCustomer({ ...form, id: mode === 'edit' ? selectedId : undefined });
      setCustomers(next.customers);
      resetForm();
      setFormVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar cliente.');
    }
  }

  async function remove(customer: Customer) {
    if (!confirmDelete(`o cliente ${customer.name}`)) return;
    setError('');
    try {
      const next = await removeCustomer(customer.id);
      setCustomers(next.customers);
      if (selectedId === customer.id) closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover cliente.');
    }
  }

  useEffect(() => {
    if (!formVisible || readOnly) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formVisible, readOnly, mode, form, selectedId]);

  const headingActions = (
    <PageHeadingActions>
      {!formVisible ? (
        <HeadingNewButton onClick={startNew} label="Novo cliente" />
      ) : readOnly ? (
        <>
          <HeadingCancelButton onClick={closeForm} label="Fechar" />
          <HeadingEditButton onClick={() => setMode('edit')} />
        </>
      ) : (
        <>
          <HeadingCancelButton onClick={closeForm} />
          <HeadingSaveButton onClick={() => void submit()} />
        </>
      )}
    </PageHeadingActions>
  );

  return (
    <section className="admin-page">
      {headingActions}
      {!formVisible ? (
        <article className="admin-card">
          <CrudListBar
            query={query}
            onQueryChange={setQuery}
            placeholder="Buscar cliente, telefone, documento…"
            status={status}
            onStatusChange={setStatus}
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
                    <td>
                      <CrudNameButton onClick={() => loadItem(customer, 'view')}>
                        {customer.name}
                      </CrudNameButton>
                    </td>
                    <td>{customer.phone}</td>
                    <td>{customer.document || '—'}</td>
                    <td>{customer.active !== false ? 'Ativo' : 'Inativo'}</td>
                    <td className="admin-table__actions">
                      <CrudRowActions
                        onView={() => loadItem(customer, 'view')}
                        onEdit={() => loadItem(customer, 'edit')}
                        onDelete={() => void remove(customer)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </article>
      ) : null}

      {formVisible ? (
        <article className="admin-card">
          <h2>{crudFormTitle(mode, 'cliente')}</h2>
          {error ? <p className="qty-low">{error}</p> : null}
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
        </article>
      ) : null}
    </section>
  );
}
