import { useEffect, useMemo, useState } from 'react';
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
import {
  getAttributes,
  MAX_ATTRIBUTES,
  removeAttribute,
  saveAttributes,
  type ProductAttribute,
} from '../../data/attributeStore';

function emptyForm(): Omit<ProductAttribute, 'id'> {
  return {
    name: '',
    values: [],
    priceDeltas: {},
    useOnTotem: true,
    filterOnTotem: true,
    useOnStock: true,
    sort: 10,
    active: true,
  };
}

function moneyDelta(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type Mode = 'new' | 'edit' | 'view';

const REFRESH_EVENTS = [
  'marthi-admin-state',
  'marthi-os-state',
  'marthi-erp-bootstrap',
  'marthi-stock',
] as const;

export function AttributesPage() {
  const [items, setItems] = useState(() => getAttributes());
  const [form, setForm] = useState(emptyForm);
  const [valueDraft, setValueDraft] = useState('');
  const [deltaDraft, setDeltaDraft] = useState('0');
  const [mode, setMode] = useState<Mode>('new');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [error, setError] = useState('');

  useEffect(() => {
    function refresh() {
      setItems(getAttributes());
    }
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refresh);
    return () => {
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refresh);
    };
  }, []);

  const readOnly = mode === 'view';
  const atLimit = mode === 'new' && items.length >= MAX_ATTRIBUTES;

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active, status) &&
          matchesQuery(`${item.name} ${item.values.join(' ')}`, query),
      ),
    [items, query, status],
  );

  async function persist(next: ProductAttribute[]) {
    setError('');
    try {
      const saved = await saveAttributes(next);
      setItems(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar atributos.');
      throw err;
    }
  }

  function resetForm() {
    setForm(emptyForm());
    setValueDraft('');
    setDeltaDraft('0');
    setSelectedId(null);
    setMode('new');
  }

  function addValue() {
    if (readOnly) return;
    const next = valueDraft.trim();
    if (!next || form.values.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setValueDraft('');
      return;
    }
    const delta = Number(deltaDraft.replace(',', '.')) || 0;
    setForm({
      ...form,
      values: [...form.values, next],
      priceDeltas: { ...form.priceDeltas, [next]: delta },
    });
    setValueDraft('');
    setDeltaDraft('0');
  }

  async function submit() {
    if (readOnly || atLimit || !form.name.trim() || form.values.length === 0) return;
    try {
      if (mode === 'edit' && selectedId) {
        await persist(items.map((item) => (item.id === selectedId ? { ...item, ...form } : item)));
      } else {
        await persist([
          {
            ...form,
            id: `ATTR-${Date.now().toString(36).toUpperCase()}`,
            sort: items.length + 1,
          },
          ...items,
        ]);
      }
      resetForm();
    } catch {
      /* error already shown */
    }
  }

  function loadItem(item: ProductAttribute, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setForm({
      name: item.name,
      values: item.values,
      priceDeltas: { ...(item.priceDeltas ?? {}) },
      useOnTotem: item.useOnTotem,
      filterOnTotem: item.filterOnTotem,
      useOnStock: item.useOnStock,
      sort: item.sort,
      active: item.active,
    });
  }

  async function remove(item: ProductAttribute) {
    if (!confirmDelete(`o atributo ${item.name}`)) return;
    setError('');
    try {
      setItems(await removeAttribute(item.id));
      if (selectedId === item.id) resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover atributo.');
    }
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{crudFormTitle(mode, 'atributo')}</h2>
        {error ? <p className="qty-low">{error}</p> : null}
        <p>
          Até {MAX_ATTRIBUTES} atributos. Celular usa cor e capacidade; roupa, cor e tamanho; ótica,
          armação e lente. O estoque guarda o preço de cada combinação (128 GB ≠ 256 GB). Valores
          como retirada usam o ajuste abaixo, somado na hora no totem.
        </p>
        <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
          <label>
            Atributo
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Cor, tamanho, armação…"
              disabled={atLimit || readOnly}
            />
          </label>
          <AdminPicker
            label="Situação"
            value={form.active ? '1' : '0'}
            disabled={atLimit || readOnly}
            options={[
              { value: '1', label: 'Ativo' },
              { value: '0', label: 'Inativo' },
            ]}
            onChange={(value) => setForm({ ...form, active: value === '1' })}
          />
          <label>
            Valor
            <input
              value={valueDraft}
              onChange={(e) => setValueDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addValue();
                }
              }}
              placeholder="Preto, branco, P, M…"
              disabled={atLimit || readOnly}
            />
          </label>
          <label>
            Ajuste de preço
            <span className="attr-value-row">
              <input
                type="number"
                step="0.01"
                value={deltaDraft}
                onChange={(e) => setDeltaDraft(e.target.value)}
                placeholder="0"
                disabled={atLimit || readOnly}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={addValue}
                disabled={atLimit || readOnly}
              >
                Incluir valor
              </button>
            </span>
          </label>
        </div>
        {form.values.length > 0 ? (
          <table className="admin-table attr-values" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Ajuste</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {form.values.map((value) => (
                <tr key={value}>
                  <td>{value}</td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={form.priceDeltas[value] ?? 0}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          priceDeltas: {
                            ...form.priceDeltas,
                            [value]: Number(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        const nextDeltas = { ...form.priceDeltas };
                        delete nextDeltas[value];
                        setForm({
                          ...form,
                          values: form.values.filter((item) => item !== value),
                          priceDeltas: nextDeltas,
                        });
                      }}
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty admin-note">Inclua ao menos um valor, por exemplo Preto e Branco.</p>
        )}

        <div className="attr-flags">
          <label>
            <input
              type="checkbox"
              checked={form.useOnTotem}
              disabled={atLimit || readOnly}
              onChange={(e) => setForm({ ...form, useOnTotem: e.target.checked })}
            />
            Usar no totem
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.filterOnTotem}
              disabled={atLimit || readOnly}
              onChange={(e) => setForm({ ...form, filterOnTotem: e.target.checked })}
            />
            Filtro no totem
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.useOnStock}
              disabled={atLimit || readOnly}
              onChange={(e) => setForm({ ...form, useOnStock: e.target.checked })}
            />
            Usar no estoque
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
              <button type="button" className="btn btn--primary" onClick={() => void submit()} disabled={atLimit}>
                {mode === 'edit' ? 'Salvar atributo' : 'Cadastrar atributo'}
              </button>
              {mode === 'edit' ? (
                <button type="button" className="btn btn--ghost" onClick={resetForm}>
                  Cancelar
                </button>
              ) : null}
            </>
          )}
          {atLimit ? (
            <span className="empty">
              Limite de {MAX_ATTRIBUTES} atributos. Edite ou exclua um existente para cadastrar outro.
            </span>
          ) : (
            <span className="empty">
              {items.length} de {MAX_ATTRIBUTES} atributos
            </span>
          )}
        </div>
      </article>

      <article className="admin-card">
        <CrudListBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Buscar atributo ou valor…"
          status={status}
          onStatusChange={setStatus}
          onNew={resetForm}
          newLabel="Novo atributo"
        />
        <table className="admin-table">
          <thead>
            <tr>
              <th>Atributo</th>
              <th>Valores</th>
              <th>Uso</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty">
                  Nenhum atributo encontrado.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>
                    {item.values
                      .map((value) => {
                        const delta = item.priceDeltas?.[value] ?? 0;
                        return delta ? `${value} (${moneyDelta(delta)})` : value;
                      })
                      .join(', ')}
                  </td>
                  <td>
                    {[
                      item.useOnTotem ? 'Totem' : null,
                      item.filterOnTotem ? 'Filtro' : null,
                      item.useOnStock ? 'Estoque' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </td>
                  <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                  <td>
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
    </section>
  );
}
