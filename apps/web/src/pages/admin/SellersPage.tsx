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
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import {
  listSellers,
  removeSeller,
  upsertSeller,
  type Seller,
} from '../../data/erpRegistry';

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  document: '',
  commissionPercent: 0,
  active: true,
};

type Mode = 'new' | 'edit' | 'view';

export function SellersPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(() => listSellers());
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [form, setForm] = useState(EMPTY);
  const [mode, setMode] = useState<Mode>('new');
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active, status) &&
          matchesQuery(`${item.name} ${item.phone} ${item.email} ${item.document}`, query),
      ),
    [items, query, status],
  );

  const readOnly = mode === 'view';

  function resetForm() {
    setForm(EMPTY);
    setSelectedId(undefined);
    setMode('new');
  }

  function loadItem(item: Seller, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setForm({
      name: item.name,
      phone: item.phone,
      email: item.email,
      document: item.document,
      commissionPercent: item.commissionPercent,
      active: item.active,
    });
  }

  function submit() {
    if (readOnly || !form.name.trim()) return;
    const next = upsertSeller({ ...form, id: mode === 'edit' ? selectedId : undefined });
    setItems(next.sellers);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: mode === 'edit' ? 'vendedor.atualizar' : 'vendedor.criar',
      detail: form.name,
    });
    resetForm();
  }

  function remove(item: Seller) {
    if (!confirmDelete(`o vendedor ${item.name}`)) return;
    setItems(removeSeller(item.id).sellers);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'vendedor.excluir',
      detail: item.name,
    });
    if (selectedId === item.id) resetForm();
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{crudFormTitle(mode, 'vendedor')}</h2>
        <p>Usado na OS e no PDV para comissão e rastreio de venda.</p>
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
            E-mail
            <input
              value={form.email}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            CPF / documento
            <input
              value={form.document}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
            />
          </label>
          <label>
            Comissão (%)
            <input
              type="number"
              min={0}
              step={0.1}
              value={form.commissionPercent}
              disabled={readOnly}
              onChange={(e) =>
                setForm({ ...form, commissionPercent: Number(e.target.value) || 0 })
              }
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
          placeholder="Buscar vendedor…"
          status={status}
          onStatusChange={setStatus}
          onNew={resetForm}
          newLabel="Novo vendedor"
        />
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Telefone</th>
              <th>Comissão</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhum vendedor encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.phone || '—'}</td>
                  <td>{item.commissionPercent}%</td>
                  <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                  <td>
                    <CrudRowActions
                      onView={() => loadItem(item, 'view')}
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
