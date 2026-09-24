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
import { getAdminState, removePriceTable, savePriceTables, type PriceTable } from '../../data/adminStore';

const EMPTY: Omit<PriceTable, 'id'> = {
  name: '',
  percent: 0,
  active: true,
};

type Mode = 'new' | 'edit' | 'view';

const REFRESH_EVENTS = [
  'marthi-admin-state',
  'marthi-os-state',
  'marthi-erp-bootstrap',
  'marthi-stock',
] as const;

export function PriceTablesPage() {
  const [items, setItems] = useState(() => getAdminState().priceTables);
  const [form, setForm] = useState(EMPTY);
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      setItems(getAdminState().priceTables);
    }
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refresh);
    return () => {
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refresh);
    };
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active, status) && matchesQuery(`${item.name} ${item.percent}`, query),
      ),
    [items, query, status],
  );

  const readOnly = mode === 'view';

  async function persist(next: PriceTable[]) {
    setError('');
    try {
      const state = await savePriceTables(next);
      setItems(state.priceTables);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar tabelas.');
      throw err;
    }
  }

  function resetForm() {
    setForm(EMPTY);
    setSelectedId(null);
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

  function loadItem(item: PriceTable, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);
    setForm({ name: item.name, percent: item.percent, active: item.active });
  }

  async function submit() {
    if (readOnly || !form.name.trim()) return;
    try {
      if (mode === 'edit' && selectedId) {
        await persist(items.map((item) => (item.id === selectedId ? { ...item, ...form } : item)));
      } else {
        await persist([
          { ...form, id: `TAB-${Date.now().toString(36).toUpperCase()}` },
          ...items,
        ]);
      }
      resetForm();
      setFormVisible(false);
    } catch {
      /* error already shown */
    }
  }

  async function remove(item: PriceTable) {
    if (!confirmDelete(`a tabela ${item.name}`)) return;
    setError('');
    try {
      const state = await removePriceTable(item.id);
      setItems(state.priceTables);
      if (selectedId === item.id) closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover tabela.');
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
        <HeadingNewButton onClick={startNew} label="Nova tabela" />
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
            placeholder="Buscar tabela…"
            status={status}
            onStatusChange={setStatus}
          />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Tabela</th>
                <th>Ajuste</th>
                <th>PDV</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    Nenhuma tabela encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <CrudNameButton onClick={() => loadItem(item, 'view')}>{item.name}</CrudNameButton>
                    </td>
                    <td>
                      {item.percent > 0 ? '+' : ''}
                      {item.percent}%
                    </td>
                    <td>{item.active ? 'Ativa' : 'Inativa'}</td>
                    <td className="admin-table__actions">
                      <CrudRowActions
                        onView={() => loadItem(item, 'view')}
                        onEdit={() => loadItem(item, 'edit')}
                        onDelete={() => void remove(item)}
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
          <h2>{crudFormTitle(mode, 'tabela de preço')}</h2>
          {error ? <p className="qty-low">{error}</p> : null}
          <p>
            Percentual sobre o preço de estoque. Formas de pagamento do ERP vinculam uma tabela ao
            PDV.
          </p>
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
              Ajuste (%)
              <input
                type="number"
                value={form.percent}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
              />
            </label>
            <AdminPicker
              label="Situação"
              value={form.active ? '1' : '0'}
              disabled={readOnly}
              options={[
                { value: '1', label: 'Ativa no PDV' },
                { value: '0', label: 'Inativa' },
              ]}
              onChange={(value) => setForm({ ...form, active: value === '1' })}
            />
          </div>
        </article>
      ) : null}
    </section>
  );
}
