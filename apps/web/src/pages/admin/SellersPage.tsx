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
import { CurrencyInput } from '../../components/CurrencyInput';
import { HeadingCancelButton, HeadingEditButton, HeadingNewButton, HeadingSaveButton, PageHeadingActions } from '../../components/PageHeadingActions';
import { AddressFields, ContactListField, EMPTY_ADDRESS, PersonTypeField, type AddressValue, type DocumentType } from '../../components/PersonFields';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import { hydrateErpRegistryFromApi } from '../../data/erpRegistry';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { apiCreateSeller, apiDeleteSeller, apiListSellers, apiUpdateSeller, type ApiSeller } from '../../services/erpApi';
import { formatCpfCnpj } from '../../utils/documentUtils';

type Mode = 'new' | 'edit' | 'view';
type Form = {
  name: string;
  documentType: DocumentType;
  document: string;
  phone: string;
  phones: string[];
  email: string;
  emails: string[];
  address: AddressValue;
  commissionPercent: number;
  active: boolean;
};

const EMPTY: Form = { name: '', documentType: 'cpf', document: '', phone: '', phones: [], email: '', emails: [], address: EMPTY_ADDRESS, commissionPercent: 0, active: true };

function formFrom(item: ApiSeller): Form {
  return {
    name: item.name,
    documentType: item.documentType === 'cnpj' ? 'cnpj' : 'cpf',
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
    commissionPercent: Number(item.commissionPercent) || 0,
    active: item.active !== false,
  };
}

/** Vendedores da loja (comissão, contatos e endereço), lidos e gravados direto no banco. */
export function SellersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ApiSeller[]>([]);
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
      setItems(await apiListSellers());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os vendedores.');
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
        (item) => matchesStatus(item.active !== false, status) && matchesQuery(`${item.name} ${item.phone} ${item.email} ${item.document} ${item.city ?? ''}`, query),
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

  function loadItem(item: ApiSeller, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setError('');
    setForm(formFrom(item));
    setFormVisible(true);
  }

  async function submit() {
    if (readOnly || saving) return;
    if (!form.name.trim()) {
      setError('Informe o nome do vendedor.');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      name: form.name.trim(),
      documentType: form.documentType,
      document: form.document.trim(),
      phone: form.phone.trim(),
      phones: form.phones.map((item) => item.trim()).filter(Boolean),
      email: form.email.trim(),
      emails: form.emails.map((item) => item.trim()).filter(Boolean),
      ...form.address,
      commissionPercent: form.commissionPercent,
      active: form.active,
    };
    try {
      if (mode === 'edit' && selectedId) await apiUpdateSeller(selectedId, body);
      else await apiCreateSeller(body);
      logAction({ actorName: user?.name ?? 'Operador', actorEmail: user?.email ?? '', action: mode === 'edit' ? 'vendedor.atualizar' : 'vendedor.criar', detail: form.name });
      await reload();
      void hydrateErpRegistryFromApi().catch(() => undefined);
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar vendedor.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: ApiSeller) {
    if (!confirmDelete(`o vendedor ${item.name}`)) return;
    try {
      await apiDeleteSeller(item.id);
      logAction({ actorName: user?.name ?? 'Operador', actorEmail: user?.email ?? '', action: 'vendedor.excluir', detail: item.name });
      if (selectedId === item.id) closeForm();
      await reload();
      void hydrateErpRegistryFromApi().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir vendedor.');
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

  return (
    <section className="admin-page">
      <PageHeadingActions>
        {!formVisible ? (
          <HeadingNewButton onClick={startNew} label="Novo vendedor" />
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
          <CrudListBar query={query} onQueryChange={setQuery} placeholder="Buscar vendedor…" status={status} onStatusChange={setStatus} />
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Telefone</th>
                  <th>Comissão</th>
                  <th>Cidade</th>
                  <th>Status</th>
                  <th className="admin-table__actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && items.length === 0 ? (
                  <tr><td colSpan={6} className="empty">Carregando…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="empty">Nenhum vendedor encontrado.</td></tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Nome">
                        <CrudNameButton onClick={() => loadItem(item, 'view')}>{item.name}</CrudNameButton>
                      </td>
                      <td data-label="Telefone">{item.phone || '—'}</td>
                      <td data-label="Comissão">{Number(item.commissionPercent || 0).toLocaleString('pt-BR')}%</td>
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
          <h2>{crudFormTitle(mode, 'vendedor')}</h2>
          <p className="empty">Usado no PDV, na venda externa e na OS para comissão; pode ficar vinculado aos clientes.</p>
          {error ? <p role="alert" className="qty-low">{error}</p> : null}
          <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
            <PersonTypeField type={form.documentType} document={form.document} disabled={readOnly} onChange={(documentType, document) => setForm({ ...form, documentType, document })} />
            <label>
              {form.documentType === 'cnpj' ? 'Razão social' : 'Nome completo'}
              <input value={form.name} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Comissão (%)
              <CurrencyInput value={form.commissionPercent} decimals={2} disabled={readOnly} ariaLabel="Comissão em porcentagem" onChange={(commissionPercent) => setForm({ ...form, commissionPercent })} />
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
          </div>
        </article>
      )}
    </section>
  );
}
