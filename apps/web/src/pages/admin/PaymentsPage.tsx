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
  removePayment,
  savePayments,
  type PaymentMethod,
} from '../../data/adminStore';

const EMPTY: Omit<PaymentMethod, 'id'> = {
  name: '',
  type: 'cash',
  priceTableId: '',
  maxInstallments: 1,
  active: true,
};

const TYPES: { id: PaymentMethod['type']; label: string }[] = [
  { id: 'cash', label: 'Dinheiro' },
  { id: 'pix', label: 'Pix' },
  { id: 'debit', label: 'Débito' },
  { id: 'credit', label: 'Crédito' },
  { id: 'other', label: 'Outro' },
];

type Mode = 'new' | 'edit' | 'view';

const REFRESH_EVENTS = [
  'marthi-admin-state',
  'marthi-os-state',
  'marthi-erp-bootstrap',
  'marthi-stock',
] as const;

export function PaymentsPage() {
  const initial = getAdminState();
  const [tables, setTables] = useState(initial.priceTables);
  const [items, setItems] = useState(initial.payments);
  const [form, setForm] = useState({ ...EMPTY, priceTableId: initial.priceTables[0]?.id ?? '' });
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      const state = getAdminState();
      setTables(state.priceTables);
      setItems(state.payments);
    }
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refresh);
    return () => {
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refresh);
    };
  }, []);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const tableName = tables.find((table) => table.id === item.priceTableId)?.name ?? '';
        const typeLabel = TYPES.find((entry) => entry.id === item.type)?.label ?? item.type;
        return (
          matchesStatus(item.active, status) &&
          matchesQuery(`${item.name} ${typeLabel} ${tableName}`, query)
        );
      }),
    [items, query, status, tables],
  );

  const readOnly = mode === 'view';

  async function persist(next: PaymentMethod[]) {
    setError('');
    try {
      const state = await savePayments(next);
      setItems(state.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar formas de pagamento.');
      throw err;
    }
  }

  function resetForm() {
    setForm({ ...EMPTY, priceTableId: tables[0]?.id ?? '' });
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

  function loadItem(item: PaymentMethod, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);
    setForm({
      name: item.name,
      type: item.type,
      priceTableId: item.priceTableId,
      maxInstallments: item.maxInstallments,
      active: item.active,
    });
  }

  async function submit() {
    if (readOnly || !form.name.trim() || !form.priceTableId) return;
    try {
      if (mode === 'edit' && selectedId) {
        await persist(items.map((item) => (item.id === selectedId ? { ...item, ...form } : item)));
      } else {
        await persist([
          { ...form, id: `PAY-${Date.now().toString(36).toUpperCase()}` },
          ...items,
        ]);
      }
      resetForm();
      setFormVisible(false);
    } catch {
      /* error already shown */
    }
  }

  async function remove(item: PaymentMethod) {
    if (!confirmDelete(`a forma ${item.name}`)) return;
    setError('');
    try {
      const state = await removePayment(item.id);
      setItems(state.payments);
      if (selectedId === item.id) closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover forma de pagamento.');
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
        <HeadingNewButton onClick={startNew} label="Nova forma" />
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
            placeholder="Buscar forma de pagamento…"
            status={status}
            onStatusChange={setStatus}
          />
          <table className="admin-table">
            <thead>
              <tr>
                <th>Forma</th>
                <th>Tipo</th>
                <th>Tabela</th>
                <th>Parcelas</th>
                <th>PDV</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Nenhuma forma encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <CrudNameButton onClick={() => loadItem(item, 'view')}>{item.name}</CrudNameButton>
                    </td>
                    <td>{TYPES.find((entry) => entry.id === item.type)?.label ?? item.type}</td>
                    <td>{tables.find((table) => table.id === item.priceTableId)?.name ?? '—'}</td>
                    <td>{item.maxInstallments}x</td>
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
          <h2>{crudFormTitle(mode, 'forma de pagamento')}</h2>
          {error ? <p className="qty-low">{error}</p> : null}
          <p>
            Cada forma aparece no PDV e puxa a tabela de preço vinculada (vista, cartão, atacado).
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
            <AdminPicker
              label="Tipo"
              value={form.type}
              disabled={readOnly}
              options={TYPES.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(value) => setForm({ ...form, type: value as PaymentMethod['type'] })}
            />
            <AdminPicker
              label="Tabela de preço"
              value={form.priceTableId}
              disabled={readOnly}
              placeholder="Cadastre uma tabela primeiro"
              options={tables.map((item) => ({
                value: item.id,
                label: `${item.name} (${item.percent > 0 ? '+' : ''}${item.percent}%)`,
              }))}
              onChange={(value) => setForm({ ...form, priceTableId: value })}
            />
            <label>
              Máx. parcelas
              <input
                type="number"
                min={1}
                value={form.maxInstallments}
                disabled={readOnly}
                onChange={(e) =>
                  setForm({ ...form, maxInstallments: Math.max(1, Number(e.target.value) || 1) })
                }
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
