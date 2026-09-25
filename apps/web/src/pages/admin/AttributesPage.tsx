import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  getAttributes,
  MAX_ATTRIBUTES,
  removeAttribute,
  saveAttributes,
  SIZE_VALUE_PRESETS,
  type ProductAttribute,
} from '../../data/attributeStore';
import { hasCapability, isTotemCatalogPath } from '../../data/moduleCapabilities';

function emptyForm(preferTotem = false): Omit<ProductAttribute, 'id'> {
  return {
    name: '',
    values: [],
    priceDeltas: {},
    useOnTotem: true,
    filterOnTotem: true,
    useOnStock: !preferTotem,
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
  const location = useLocation();
  const totemSurface = isTotemCatalogPath(location.pathname);
  const catalogFull = hasCapability('catalog.full');

  const [items, setItems] = useState(() => getAttributes());
  const [form, setForm] = useState(() => emptyForm(totemSurface));
  const [valueDraft, setValueDraft] = useState('');
  const [deltaDraft, setDeltaDraft] = useState('0');
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
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
          matchesQuery(`${item.name} ${item.values.join(' ')}`, query) &&
          (!totemSurface || item.useOnTotem || item.filterOnTotem),
      ),
    [items, query, status, totemSurface],
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
    setForm(emptyForm(totemSurface));
    setValueDraft('');
    setDeltaDraft('0');
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
    const payload = {
      ...form,
      useOnTotem: totemSurface ? true : form.useOnTotem,
      filterOnTotem: totemSurface ? form.filterOnTotem || form.useOnTotem : form.filterOnTotem,
    };
    try {
      if (mode === 'edit' && selectedId) {
        await persist(items.map((item) => (item.id === selectedId ? { ...item, ...payload } : item)));
      } else {
        await persist([
          {
            ...payload,
            id: `ATTR-${Date.now().toString(36).toUpperCase()}`,
            sort: items.length + 1,
          },
          ...items,
        ]);
      }
      resetForm();
      setFormVisible(false);
    } catch {
      /* error already shown */
    }
  }

  function loadItem(item: ProductAttribute, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);
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
      if (selectedId === item.id) closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover atributo.');
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
  }, [formVisible, readOnly, mode, form, selectedId, atLimit]);

  const headingActions = (
    <PageHeadingActions>
      {!formVisible ? (
        <HeadingNewButton onClick={startNew} label="Novo atributo" />
      ) : readOnly ? (
        <>
          <HeadingCancelButton onClick={closeForm} label="Fechar" />
          <HeadingEditButton onClick={() => setMode('edit')} />
        </>
      ) : (
        <>
          <HeadingCancelButton onClick={closeForm} />
          <HeadingSaveButton onClick={() => void submit()} disabled={atLimit} />
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
            placeholder="Buscar atributo ou valor…"
            status={status}
            onStatusChange={setStatus}
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
                    <td>
                      <CrudNameButton onClick={() => loadItem(item, 'view')}>{item.name}</CrudNameButton>
                    </td>
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
          <h2>{crudFormTitle(mode, 'atributo')}</h2>
          {error ? <p className="qty-low">{error}</p> : null}
          <p>
            {totemSurface
              ? `Até ${MAX_ATTRIBUTES} atributos para filtros e opções do totem (cor, capacidade, etc.). O ajuste de preço entra na combinação na vitrine.`
              : `Até ${MAX_ATTRIBUTES} atributos. Celular usa cor e capacidade; roupa/calçado, cor e tamanho (use os presets abaixo). Ótica: armação e lente. O estoque guarda o preço de cada combinação.`}
          </p>
          {totemSurface && catalogFull ? (
            <p className="empty">
              Mesmo cadastro da Retaguarda ·{' '}
              <Link to="/erp/atributos">Abrir atributos na Retaguarda</Link>
            </p>
          ) : null}
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
          {!readOnly && !atLimit ? (
            <div className="admin-toolbar" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <span className="empty" style={{ marginRight: 4 }}>
                Presets de tamanho:
              </span>
              {SIZE_VALUE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="btn btn--ghost"
                  title={`Incluir ${preset.values.join(', ')}`}
                  onClick={() => {
                    const merged = [...form.values];
                    const priceDeltas = { ...form.priceDeltas };
                    for (const value of preset.values) {
                      if (!merged.includes(value)) {
                        merged.push(value);
                        priceDeltas[value] = priceDeltas[value] ?? 0;
                      }
                    }
                    setForm({
                      ...form,
                      name: form.name.trim() || 'Tamanho',
                      values: merged,
                      priceDeltas,
                      useOnStock: true,
                      filterOnTotem: true,
                    });
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
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
                        disabled={readOnly}
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
                        disabled={readOnly}
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
            {!totemSurface || catalogFull ? (
              <label>
                <input
                  type="checkbox"
                  checked={form.useOnStock}
                  disabled={atLimit || readOnly}
                  onChange={(e) => setForm({ ...form, useOnStock: e.target.checked })}
                />
                Usar no estoque
              </label>
            ) : null}
          </div>

          {atLimit ? (
            <p className="empty" style={{ marginTop: 12 }}>
              Limite de {MAX_ATTRIBUTES} atributos. Edite ou exclua um existente para cadastrar outro.
            </p>
          ) : (
            <p className="empty" style={{ marginTop: 12 }}>
              {items.length} de {MAX_ATTRIBUTES} atributos
            </p>
          )}
        </article>
      ) : null}
    </section>
  );
}
