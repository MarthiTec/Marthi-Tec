import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { AddressFields, ContactListField, EMPTY_ADDRESS, PersonTypeField, type AddressValue, type DocumentType } from '../../components/PersonFields';
import { CustomerSummaryPanel } from '../../components/CustomerSummaryPanel';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { listQuotesForCustomer, POS_QUOTES_EVENT, QUOTE_STATUS_COLOR, QUOTE_STATUS_LABEL, type PosQuote } from '../../data/posQuotesStore';
import { QuoteCommercialPrintModal } from '../../components/QuoteCommercialPrintModal';
import {
  apiDeleteCustomer,
  apiListCustomerRecords,
  apiListSellers,
  apiSaveCustomerRecord,
  type ApiCustomerRecord,
} from '../../services/erpApi';
import { formatCpfCnpj } from '../../utils/documentUtils';

type Mode = 'new' | 'edit' | 'view';

type Form = {
  name: string;
  tradeName: string;
  documentType: DocumentType;
  document: string;
  phone: string;
  phones: string[];
  email: string;
  emails: string[];
  address: AddressValue;
  sellerId: string;
  notes: string;
  active: boolean;
};

const EMPTY: Form = {
  name: '',
  tradeName: '',
  documentType: 'cpf',
  document: '',
  phone: '',
  phones: [],
  email: '',
  emails: [],
  address: EMPTY_ADDRESS,
  sellerId: '',
  notes: '',
  active: true,
};

function formFrom(customer: ApiCustomerRecord): Form {
  return {
    name: customer.name,
    tradeName: customer.tradeName ?? '',
    documentType: customer.documentType === 'cnpj' ? 'cnpj' : 'cpf',
    document: customer.document ? formatCpfCnpj(customer.document) : '',
    phone: customer.phone ?? '',
    phones: customer.phones ?? [],
    email: customer.email ?? '',
    emails: customer.emails ?? [],
    address: {
      zipCode: customer.zipCode ?? '',
      street: customer.street ?? '',
      number: customer.number ?? '',
      complement: customer.complement ?? '',
      district: customer.district ?? '',
      city: customer.city ?? '',
      state: customer.state ?? '',
    },
    sellerId: customer.sellerId ?? '',
    notes: customer.notes ?? '',
    active: customer.active !== false,
  };
}

/** Clientes da loja: tudo lido e gravado direto no banco. */
export function CustomersPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [form, setForm] = useState<Form>(EMPTY);
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [customers, setCustomers] = useState<ApiCustomerRecord[]>([]);
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [printQuoteModal, setPrintQuoteModal] = useState<PosQuote | null>(null);
  const [quotesTick, setQuotesTick] = useState(0);

  const reload = useCallback(async () => {
    try {
      const [rows, sellerRows] = await Promise.all([apiListCustomerRecords(), apiListSellers()]);
      setCustomers(rows);
      setSellers(sellerRows.filter((seller) => seller.active !== false).map((seller) => ({ id: seller.id, name: seller.name })));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os clientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = () => {
      setLoading(true);
      setFormVisible(false);
      void reload();
    };
    load();
    const quotes = () => setQuotesTick((n) => n + 1);
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    window.addEventListener(POS_QUOTES_EVENT, quotes);
    return () => {
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
      window.removeEventListener(POS_QUOTES_EVENT, quotes);
    };
  }, [reload]);

  const sellerName = useMemo(() => new Map(sellers.map((seller) => [seller.id, seller.name])), [sellers]);

  const filtered = useMemo(
    () =>
      customers.filter(
        (item) =>
          matchesStatus(item.active !== false, status) &&
          matchesQuery(
            `${item.name} ${item.tradeName} ${item.phone} ${(item.phones ?? []).join(' ')} ${item.document} ${item.email} ${item.city} ${sellerName.get(item.sellerId) ?? ''}`,
            query,
          ),
      ),
    [customers, query, status, sellerName],
  );

  const readOnly = mode === 'view';

  const customerQuotes = useMemo(() => {
    if (!selectedId) return [];
    return listQuotesForCustomer(selectedId, form.document, form.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, form.document, form.phone, formVisible, quotesTick]);

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

  function loadItem(customer: ApiCustomerRecord, nextMode: Mode) {
    setSelectedId(customer.id);
    setMode(nextMode);
    setFormVisible(true);
    setError('');
    setForm(formFrom(customer));
  }

  function duplicateCustomer(customer: ApiCustomerRecord) {
    loadItem(customer, 'new');
    setSelectedId(undefined);
    setForm((prev) => ({ ...prev, name: `${customer.name} (cópia)`, phone: '', document: '' }));
  }

  async function submit() {
    if (readOnly || saving) return;
    if (!form.name.trim()) {
      setError(form.documentType === 'cnpj' ? 'Informe a razão social.' : 'Informe o nome do cliente.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiSaveCustomerRecord(mode === 'edit' ? selectedId : undefined, {
        name: form.name.trim(),
        tradeName: form.documentType === 'cnpj' ? form.tradeName.trim() : '',
        documentType: form.documentType,
        document: form.document.trim(),
        phone: form.phone.trim(),
        phones: form.phones.map((item) => item.trim()).filter(Boolean),
        email: form.email.trim(),
        emails: form.emails.map((item) => item.trim()).filter(Boolean),
        ...form.address,
        sellerId: form.sellerId || null,
        notes: form.notes.trim(),
        active: form.active,
      });
      await reload();
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(customer: ApiCustomerRecord) {
    if (!confirmDelete(`o cliente ${customer.name}`)) return;
    setError('');
    try {
      await apiDeleteCustomer(customer.id);
      if (selectedId === customer.id) closeForm();
      await reload();
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
  });

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

  const isCompany = form.documentType === 'cnpj';

  return (
    <section className="admin-page">
      {headingActions}
      {error && !formVisible ? <p role="alert" className="qty-low">{error}</p> : null}
      {!formVisible ? (
        <article className="admin-card">
          <CrudListBar query={query} onQueryChange={setQuery} placeholder="Buscar nome, telefone, documento, vendedor…" status={status} onStatusChange={setStatus} />
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Documento</th>
                  <th>Cidade</th>
                  <th>Vendedor</th>
                  <th>Status</th>
                  <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">Carregando…</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">Nenhum cliente encontrado.</td>
                  </tr>
                ) : (
                  filtered.map((customer) => (
                    <tr key={customer.id}>
                      <td data-label="Nome">
                        <CrudNameButton onClick={() => loadItem(customer, 'view')}>
                          <strong>{customer.name}</strong>
                        </CrudNameButton>
                        {customer.documentType === 'cnpj' ? <small className="customer-kind">PJ</small> : null}
                      </td>
                      <td data-label="Telefone">{customer.phone || '—'}</td>
                      <td data-label="Documento">{customer.document ? formatCpfCnpj(customer.document) : '—'}</td>
                      <td data-label="Cidade">{customer.city ? `${customer.city}${customer.state ? `/${customer.state}` : ''}` : '—'}</td>
                      <td data-label="Vendedor">{sellerName.get(customer.sellerId) ?? '—'}</td>
                      <td data-label="Status">
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
        <>
          <article className="admin-card">
            <h2>{crudFormTitle(mode, 'cliente')}</h2>
            {error ? <p role="alert" className="qty-low">{error}</p> : null}
            <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
              <PersonTypeField
                type={form.documentType}
                document={form.document}
                disabled={readOnly}
                onChange={(documentType, document) => setForm({ ...form, documentType, document })}
              />
              <label>
                {isCompany ? 'Razão social' : 'Nome completo'}
                <input
                  value={form.name}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={isCompany ? 'Razão social da empresa' : 'Nome do cliente'}
                />
              </label>
              {isCompany ? (
                <label>
                  Nome fantasia
                  <input value={form.tradeName} disabled={readOnly} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />
                </label>
              ) : null}
              <AdminPicker
                label="Vendedor responsável"
                value={form.sellerId}
                disabled={readOnly}
                options={[{ value: '', label: 'Nenhum' }, ...sellers.map((seller) => ({ value: seller.id, label: seller.name }))]}
                onChange={(sellerId) => setForm({ ...form, sellerId })}
              />
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
              <ContactListField kind="phone" primary={form.phone} extras={form.phones} disabled={readOnly} onChange={(phone, phones) => setForm({ ...form, phone, phones })} />
              <ContactListField kind="email" primary={form.email} extras={form.emails} disabled={readOnly} onChange={(email, emails) => setForm({ ...form, email, emails })} />
              <AddressFields value={form.address} disabled={readOnly} onChange={(address) => setForm({ ...form, address })} />
              <label className="span-2">
                Observações
                <textarea rows={3} value={form.notes} disabled={readOnly} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>
            </div>
          </article>

          {selectedId ? <CustomerSummaryPanel customerId={selectedId} /> : null}

          {selectedId ? (
            <article className="admin-card">
              <h3 className="customer-section-title">
                Orçamentos comerciais <span className="badge badge--subtle">{customerQuotes.length}</span>
              </h3>
              {customerQuotes.length === 0 ? (
                <p className="empty">Nenhum orçamento emitido para este cliente.</p>
              ) : (
                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Nº</th>
                        <th>Emissão</th>
                        <th>Validade</th>
                        <th>Vendedor</th>
                        <th>Itens</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'center', width: '130px' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerQuotes.map((q) => {
                        const color = QUOTE_STATUS_COLOR[q.status] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
                        return (
                          <tr key={q.id}>
                            <td data-label="Nº"><strong>#{q.quoteNumber}</strong></td>
                            <td data-label="Emissão">{new Date(q.createdAt).toLocaleDateString('pt-BR')}</td>
                            <td data-label="Validade">{new Date(q.expiresAt).toLocaleDateString('pt-BR')}</td>
                            <td data-label="Vendedor">{q.sellerName || '—'}</td>
                            <td data-label="Itens">{q.lines.length} un.</td>
                            <td data-label="Total"><strong>{q.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
                            <td data-label="Status">
                              <span className="quote-status" style={{ background: color.bg, color: color.text, borderColor: color.border }}>
                                {QUOTE_STATUS_LABEL[q.status]}
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPrintQuoteModal(q)}>
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
            </article>
          ) : null}
        </>
      ) : null}

      {printQuoteModal ? (
        <QuoteCommercialPrintModal quote={printQuoteModal} open={Boolean(printQuoteModal)} onClose={() => setPrintQuoteModal(null)} />
      ) : null}
    </section>
  );
}
