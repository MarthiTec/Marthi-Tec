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
import {
  listQuotesForCustomer,
  POS_QUOTES_EVENT,
  QUOTE_STATUS_COLOR,
  QUOTE_STATUS_LABEL,
  type PosQuote,
} from '../../data/posQuotesStore';
import { QuoteCommercialPrintModal } from '../../components/QuoteCommercialPrintModal';
import { formatCpfCnpj } from '../../utils/documentUtils';

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
  POS_QUOTES_EVENT,
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
  const [printQuoteModal, setPrintQuoteModal] = useState<PosQuote | null>(null);

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

  // Orçamentos vinculados ao cliente selecionado
  const customerQuotes = useMemo(() => {
    if (!selectedId) return [];
    return listQuotesForCustomer(selectedId, form.document, form.phone);
  }, [selectedId, form.document, form.phone, formVisible]);

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

  function duplicateCustomer(customer: Customer) {
    loadItem(customer, 'new');
    setSelectedId(undefined);
    setForm((prev) => ({
      ...prev,
      name: `${customer.name} (Cópia)`,
    }));
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
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Documento</th>
                  <th>Cidade</th>
                  <th>Status</th>
                  <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <CrudNameButton onClick={() => loadItem(customer, 'view')}>
                          <strong>{customer.name}</strong>
                        </CrudNameButton>
                      </td>
                      <td>{customer.phone}</td>
                      <td>{customer.document ? formatCpfCnpj(customer.document) : '—'}</td>
                      <td>{customer.city || '—'}</td>
                      <td>
                        <span className={`status-pill ${customer.active !== false ? 'status-pill--active' : 'status-pill--inactive'}`}>
                          {customer.active !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                        <CrudRowActions
                          onView={() => loadItem(customer, 'view')}
                          onEdit={() => loadItem(customer, 'edit')}
                          onDuplicate={() => duplicateCustomer(customer)}
                          onDelete={() => void remove(customer)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {formVisible ? (
        <article className="admin-card">
          <h2>{crudFormTitle(mode, 'cliente')}</h2>
          {error ? <p className="qty-low" style={{ color: '#ef4444' }}>{error}</p> : null}
          <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
            <label>
              Nome / Razão Social
              <input
                value={form.name}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nome completo ou Razão Social"
              />
            </label>
            <label>
              Telefone / WhatsApp
              <input
                value={form.phone}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </label>
            <label>
              CPF / CNPJ
              <input
                value={form.document}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, document: e.target.value.toUpperCase() })}
                placeholder="CPF ou CNPJ (inclusive alfanumérico)"
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                value={form.email}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="cliente@email.com"
              />
            </label>
            <label>
              Cidade
              <input
                value={form.city}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Cidade"
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

          {/* HISTÓRICO DE ORÇAMENTOS COMERCIAIS DO CLIENTE */}
          {selectedId ? (
            <div style={{ marginTop: 28, borderTop: '1px solid var(--line, #e2e8f0)', paddingTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  📑 Histórico de Orçamentos Comerciais
                  <span className="badge badge--subtle" style={{ fontSize: '0.8rem' }}>
                    {customerQuotes.length}
                  </span>
                </h3>
              </div>

              {customerQuotes.length === 0 ? (
                <p className="empty" style={{ margin: '8px 0 0' }}>
                  Nenhum orçamento comercial emitido para este cliente até o momento.
                </p>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Nº Proposta</th>
                        <th>Emissão</th>
                        <th>Validade</th>
                        <th>Vendedor</th>
                        <th>Itens</th>
                        <th>Valor Total</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'center', width: '130px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerQuotes.map((q) => {
                        const color = QUOTE_STATUS_COLOR[q.status] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
                        return (
                          <tr key={q.id}>
                            <td>
                              <strong>#{q.quoteNumber}</strong>
                            </td>
                            <td>{new Date(q.createdAt).toLocaleDateString('pt-BR')}</td>
                            <td>{new Date(q.expiresAt).toLocaleDateString('pt-BR')}</td>
                            <td>{q.sellerName || '—'}</td>
                            <td>{q.lines.length} un.</td>
                            <td>
                              <strong style={{ color: 'var(--accent, #10b981)' }}>
                                R$ {q.total.toFixed(2)}
                              </strong>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: color.bg,
                                  color: color.text,
                                  border: `1px solid ${color.border}`,
                                }}
                              >
                                {QUOTE_STATUS_LABEL[q.status]}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={() => setPrintQuoteModal(q)}
                                title="Visualizar e Imprimir proposta timbrada"
                              >
                                📄 Proposta
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </article>
      ) : null}

      {/* MODAL DE IMPRESSÃO / VISUALIZAÇÃO COMERCIAL */}
      {printQuoteModal ? (
        <QuoteCommercialPrintModal
          quote={printQuoteModal}
          open={Boolean(printQuoteModal)}
          onClose={() => setPrintQuoteModal(null)}
        />
      ) : null}
    </section>
  );
}