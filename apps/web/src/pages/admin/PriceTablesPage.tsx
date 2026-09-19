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
import { getAdminState, removePriceTable, savePriceTables, type PriceTable } from '../../data/adminStore';

const EMPTY: Omit<PriceTable, 'id'> = {
  name: '',
  percent: 0,
  active: true,
};

type Mode = 'new' | 'edit' | 'view';

export function PriceTablesPage() {
  const [items, setItems] = useState(() => getAdminState().priceTables);
  const [form, setForm] = useState(EMPTY);
  const [mode, setMode] = useState<Mode>('new');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active, status) && matchesQuery(`${item.name} ${item.percent}`, query),
      ),
    [items, query, status],
  );

  const readOnly = mode === 'view';

  function persist(next: PriceTable[]) {
    setItems(next);
    savePriceTables(next);
  }

  function resetForm() {
    setForm(EMPTY);
    setSelectedId(null);
    setMode('new');
  }

  function loadItem(item: PriceTable, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setForm({ name: item.name, percent: item.percent, active: item.active });
  }

  function submit() {
    if (readOnly || !form.name.trim()) return;
    if (mode === 'edit' && selectedId) {
      persist(items.map((item) => (item.id === selectedId ? { ...item, ...form } : item)));
    } else {
      persist([
        { ...form, id: `TAB-${Date.now().toString(36).toUpperCase()}` },
        ...items,
      ]);
    }
    resetForm();
  }

  function remove(item: PriceTable) {
    if (!confirmDelete(`a tabela ${item.name}`)) return;
    setItems(removePriceTable(item.id).priceTables);
    if (selectedId === item.id) resetForm();
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{crudFormTitle(mode, 'tabela de preço')}</h2>
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
                {mode === 'edit' ? 'Salvar tabela' : 'Cadastrar tabela'}
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
          placeholder="Buscar tabela…"
          status={status}
          onStatusChange={setStatus}
          onNew={resetForm}
          newLabel="Nova tabela"
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
                  <td>{item.name}</td>
                  <td>
                    {item.percent > 0 ? '+' : ''}
                    {item.percent}%
                  </td>
                  <td>{item.active ? 'Ativa' : 'Inativa'}</td>
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
