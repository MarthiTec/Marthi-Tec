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
import { HeadingCancelButton, HeadingEditButton, HeadingNewButton, HeadingSaveButton, PageHeadingActions } from '../../components/PageHeadingActions';
import { AddressFields, ContactListField, EMPTY_ADDRESS, PersonTypeField, type AddressValue, type DocumentType } from '../../components/PersonFields';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import { hydrateErpRegistryFromApi } from '../../data/erpRegistry';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { apiCreateSupplier, apiDeleteSupplier, apiListSuppliers, apiUpdateSupplier, type ApiSupplier } from '../../services/erpApi';
import { formatCpfCnpj } from '../../utils/documentUtils';
import { supplierSkuName } from '../../data/productSku';

type Mode = 'new' | 'edit' | 'view';
type Form = {
  name: string;
  tradeName: string;
  skuName: string;
  origin: 'company' | 'upgrade';
  documentType: DocumentType;
  document: string;
  phone: string;
  phones: string[];
  email: string;
  emails: string[];
  address: AddressValue;
  notes: string;
  active: boolean;
};

const EMPTY: Form = { name: '', tradeName: '', skuName: '', origin: 'company', documentType: 'cnpj', document: '', phone: '', phones: [], email: '', emails: [], address: EMPTY_ADDRESS, notes: '', active: true };

function formFrom(item: ApiSupplier): Form {
  return {
    name: item.name,
    tradeName: item.tradeName ?? '',
    skuName: item.skuName ?? '',
    origin: item.origin === 'upgrade' ? 'upgrade' : 'company',
    documentType: item.documentType === 'cpf' ? 'cpf' : 'cnpj',
    document: item.document ? formatCpfCnpj(item.document) : '',
    phone: item.phone ?? '',
    phones: item.phones ?? [],
    email: item.email ?? '',
    emails: item.emails ?? [],
    address: {
      zipCode: item.zipCode ?? '',
      street: item.street ?? '',
      number: item.number ?? '',
      complement: item.complement ?? '',
      district: item.district ?? '',
      city: item.city ?? '',
      state: item.state ?? '',
    },
    notes: item.notes ?? '',
    active: item.active !== false,
  };
}

/** Fornecedores da loja, lidos e gravados direto no banco. */
export function SuppliersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ApiSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [form, setForm] = useState<Form>(EMPTY);
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setItems(await apiListSuppliers());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os fornecedores.');
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
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, [reload]);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active !== false, status) &&
          matchesQuery(`${item.name} ${item.tradeName} ${item.origin === 'upgrade' ? 'upgrade' : 'empresa'} ${item.document} ${item.city} ${item.phone} ${(item.phones ?? []).join(' ')}`, query),
      ),
    [items, query, status],
  );

  const readOnly = mode === 'view';

  function closeForm() {
    setForm(EMPTY);
    setSelectedId(undefined);
    setMode('new');
    setError('');
    setFormVisible(false);
  }

  function startNew() {
    setForm(EMPTY);
    setSelectedId(undefined);
    setMode('new');
    setError('');
    setFormVisible(true);
  }

  function loadItem(item: ApiSupplier, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setError('');
    setForm(formFrom(item));
    setFormVisible(true);
  }

  async function submit() {
    if (readOnly || saving) return;
    if (!form.name.trim()) {
      setError(form.documentType === 'cnpj' ? 'Informe a razão social.' : 'Informe o nome do fornecedor.');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      name: form.name.trim(),
      tradeName: form.tradeName.trim(),
      skuName: form.skuName.trim(),
      origin: form.origin,
      documentType: form.documentType,
      document: form.document.trim(),
      phone: form.phone.trim(),
      phones: form.phones.map((item) => item.trim()).filter(Boolean),
      email: form.email.trim(),
      emails: form.emails.map((item) => item.trim()).filter(Boolean),
      ...form.address,
      notes: form.notes.trim(),
      active: form.active,
    };
    try {
      if (mode === 'edit' && selectedId) await apiUpdateSupplier(selectedId, body);
      else await apiCreateSupplier(body);
      logAction({ actorName: user?.name ?? 'Operador', actorEmail: user?.email ?? '', action: mode === 'edit' ? 'fornecedor.atualizar' : 'fornecedor.criar', detail: form.name });
      await reload();
      void hydrateErpRegistryFromApi().catch(() => undefined);
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar fornecedor.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: ApiSupplier) {
    if (!confirmDelete(`o fornecedor ${item.name}`)) return;
    try {
      await apiDeleteSupplier(item.id);
      logAction({ actorName: user?.name ?? 'Operador', actorEmail: user?.email ?? '', action: 'fornecedor.excluir', detail: item.name });
      if (selectedId === item.id) closeForm();
      await reload();
      void hydrateErpRegistryFromApi().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir fornecedor.');
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

  const isCompany = form.documentType === 'cnpj';

  return (
    <section className="admin-page">
      <PageHeadingActions>
        {!formVisible ? (
          <HeadingNewButton onClick={startNew} label="Novo fornecedor" />
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
      {error && !formVisible ? <p role="alert" className="qty-low">{error}</p> : null}

      {!formVisible ? (
        <article className="admin-card">
          <CrudListBar query={query} onQueryChange={setQuery} placeholder="Buscar fornecedor…" status={status} onStatusChange={setStatus} />
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Origem</th>
                  <th>Documento</th>
                  <th>Telefone</th>
                  <th>Cidade</th>
                  <th>Status</th>
                  <th className="admin-table__actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr><td colSpan={7} className="empty">Carregando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="empty">Nenhum fornecedor encontrado.</td></tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Nome">
                        <CrudNameButton onClick={() => loadItem(item, 'view')}>
                          {item.name}
                          {item.tradeName ? ` · ${item.tradeName}` : ''}
                        </CrudNameButton>
                      </td>
                      <td data-label="Origem">{item.origin === 'upgrade' ? 'Upgrade' : 'Empresa'}</td>
                      <td data-label="Documento">{item.document ? formatCpfCnpj(item.document) : '—'}</td>
                      <td data-label="Telefone">{item.phone || '—'}</td>
                      <td data-label="Cidade">{item.city ? `${item.city}${item.state ? `/${item.state}` : ''}` : '—'}</td>
                      <td data-label="Status">{item.active !== false ? 'Ativo' : 'Inativo'}</td>
                      <td className="admin-table__actions">
                        <CrudRowActions onView={() => loadItem(item, 'view')} onEdit={() => loadItem(item, 'edit')} onDelete={() => void remove(item)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      ) : (
        <article className="admin-card">
          <h2>{crudFormTitle(mode, 'fornecedor')}</h2>
          <p className="empty">Aparece no cadastro do produto e nas notas de entrada de mercadoria.</p>
          {error ? <p role="alert" className="qty-low">{error}</p> : null}
          <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
            <AdminPicker
              label="Origem"
              value={form.origin}
              disabled={readOnly}
              options={[
                { value: 'company', label: 'Empresa (fornecedor)' },
                { value: 'upgrade', label: 'Upgrade (aparelho recebido em troca)' },
              ]}
              onChange={(value) => setForm({ ...form, origin: value === 'upgrade' ? 'upgrade' : 'company' })}
            />
            <PersonTypeField type={form.documentType} document={form.document} disabled={readOnly} onChange={(documentType, document) => setForm({ ...form, documentType, document })} />
            <label>
              {isCompany ? 'Razão social' : 'Nome completo'}
              <input value={form.name} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Nome fantasia
              <input value={form.tradeName} disabled={readOnly} onChange={(e) => setForm({ ...form, tradeName: e.target.value })} />
            </label>
            <label>
              Nome no SKU
              <input
                value={form.skuName}
                maxLength={32}
                disabled={readOnly}
                placeholder={supplierSkuName({ tradeName: form.tradeName, name: form.name }) || 'Ex.: DISTRIB'}
                onChange={(e) => setForm({ ...form, skuName: e.target.value.toUpperCase() })}
              />
              <small className="empty">
                Entra no SKU dos produtos deste fornecedor. Em branco, usa o nome fantasia (ou só o primeiro nome).
              </small>
            </label>
            <ContactListField kind="phone" primary={form.phone} extras={form.phones} disabled={readOnly} onChange={(phone, phones) => setForm({ ...form, phone, phones })} />
            <ContactListField kind="email" primary={form.email} extras={form.emails} disabled={readOnly} onChange={(email, emails) => setForm({ ...form, email, emails })} />
            <AddressFields value={form.address} disabled={readOnly} onChange={(address) => setForm({ ...form, address })} />
            <AdminPicker
              label="Situação"
              value={form.active ? '1' : '0'}
              disabled={readOnly}
              options={[{ value: '1', label: 'Ativo' }, { value: '0', label: 'Inativo' }]}
              onChange={(value) => setForm({ ...form, active: value === '1' })}
            />
            <label className="span-2">
              Observações
              <textarea rows={3} value={form.notes} disabled={readOnly} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
        </article>
      )}
    </section>
  );
}
