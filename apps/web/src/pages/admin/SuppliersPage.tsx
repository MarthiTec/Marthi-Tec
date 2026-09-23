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
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import {
  listSuppliers,
  removeSupplier,
  upsertSupplier,
  type Supplier,
} from '../../data/erpRegistry';

const EMPTY = {
  name: '',
  tradeName: '',
  document: '',
  phone: '',
  email: '',
  city: '',
  notes: '',
  active: true,
};

type Mode = 'new' | 'edit' | 'view';

export function SuppliersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(() => listSuppliers());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [form, setForm] = useState(EMPTY);
  const [mode, setMode] = useState<Mode>('new');
  const [selectedId, setSelectedId] = useState<string | undefined>();

  useEffect(() => {
    function refresh() {
      setItems(listSuppliers());
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    window.addEventListener('marthi-erp-registry-updated', refresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
      window.removeEventListener('marthi-erp-registry-updated', refresh);
    };
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active, status) &&
          matchesQuery(
            `${item.name} ${item.tradeName} ${item.document} ${item.city} ${item.phone}`,
            query,
          ),
      ),
    [items, query, status],
  );

  const readOnly = mode === 'view';

  function resetForm() {
    setForm(EMPTY);
    setSelectedId(undefined);
    setMode('new');
  }

  function loadItem(item: Supplier, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setForm({
      name: item.name,
      tradeName: item.tradeName,
      document: item.document,
      phone: item.phone,
      email: item.email,
      city: item.city,
      notes: item.notes,
      active: item.active,
    });
  }

  async function submit() {
    if (readOnly || !form.name.trim()) return;
    const next = await upsertSupplier({ ...form, id: mode === 'edit' ? selectedId : undefined });
    setItems(next.suppliers);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: mode === 'edit' ? 'fornecedor.atualizar' : 'fornecedor.criar',
      detail: form.name,
    });
    resetForm();
  }

  async function remove(item: Supplier) {
    if (!confirmDelete(`o fornecedor ${item.name}`)) return;
    const next = await removeSupplier(item.id);
    setItems(next.suppliers);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'fornecedor.excluir',
      detail: item.name,
    });
    if (selectedId === item.id) resetForm();
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{crudFormTitle(mode, 'fornecedor')}</h2>
        <p>Vinculado às notas de entrada de mercadoria.</p>
        <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
          <label>
            Razão social
            <input
              value={form.name}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Nome fantasia
            <input
              value={form.tradeName}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
            />
          </label>
          <label>
            CNPJ / CPF
            <input
              value={form.document}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
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
          <label className="span-2">
            Observações
            <textarea
              value={form.notes}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          {readOnly ? (
            <>
              <button type="button" className="btn btn--primary" onClick={() => setMode('edit')}>
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
          placeholder="Buscar fornecedor…"
          status={status}
          onStatusChange={setStatus}
          onNew={resetForm}
          newLabel="Novo fornecedor"
        />
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Cidade</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhum fornecedor encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <CrudNameButton onClick={() => loadItem(item, 'view')}>
                      {item.name}
                      {item.tradeName ? ` · ${item.tradeName}` : ''}
                    </CrudNameButton>
                  </td>
                  <td>{item.document || '—'}</td>
                  <td>{item.city || '—'}</td>
                  <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="admin-table__actions">
                    <CrudRowActions
                      onEdit={() => loadItem(item, 'edit')}
                      onDelete={() => remove(item)}
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
