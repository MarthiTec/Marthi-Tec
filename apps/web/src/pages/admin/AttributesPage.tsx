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
  ATTRIBUTES_EVENT,
  createAttribute,
  getAttributes,
  hydrateAttributesFromApi,
  MAX_ATTRIBUTES,
  removeAttribute,
  SIZE_VALUE_PRESETS,
  updateAttribute,
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    function refresh() {
      setItems(getAttributes());
    }
    void hydrateAttributesFromApi()
      .then((res) => {
        if (active && Array.isArray(res) && res.length > 0) {
          setItems(res);
        }
      })
      .catch(() => {});

    for (const event of REFRESH_EVENTS) window.addEventListener(event, refresh);
    window.addEventListener(ATTRIBUTES_EVENT, refresh);
    return () => {
      active = false;
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refresh);
      window.removeEventListener(ATTRIBUTES_EVENT, refresh);
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
    if (!next) return;
    if (form.values.some((item) => item.toLowerCase() === next.toLowerCase())) {
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
    setError('');
  }

  async function submit() {
    if (readOnly || saving) return;
    setError('');

    const attrName = form.name.trim();
    if (!attrName) {
      setError('Informe o nome do atributo (ex.: Cor, Tamanho, Armação).');
      return;
    }

    let nextValues = [...form.values];
    let nextDeltas = { ...form.priceDeltas };
    const draftVal = valueDraft.trim();
    if (draftVal && !nextValues.some((v) => v.toLowerCase() === draftVal.toLowerCase())) {
      const delta = Number(deltaDraft.replace(',', '.')) || 0;
      nextValues.push(draftVal);
      nextDeltas[draftVal] = delta;
      setValueDraft('');
      setDeltaDraft('0');
    }

    if (nextValues.length === 0) {
      setError('Adicione pelo menos um valor para o atributo (ex.: Preto, Branco ou escolha um preset de tamanhos).');
      return;
    }

    if (mode === 'new' && items.length >= MAX_ATTRIBUTES) {
      setError(`Limite de ${MAX_ATTRIBUTES} atributos por loja atingido. Edite ou exclua um existente.`);
      return;
    }

    const payload = {
      name: attrName,
      values: nextValues,
      priceDeltas: nextDeltas,
      useOnTotem: totemSurface ? true : form.useOnTotem,
      filterOnTotem: totemSurface ? form.filterOnTotem || form.useOnTotem : form.filterOnTotem,
      useOnStock: form.useOnStock,
      sort: form.sort,
      active: form.active,
    };

    setSaving(true);
    try {
      if (mode === 'edit' && selectedId) {
        const updated = await updateAttribute(selectedId, payload);
        setItems(updated);
      } else {
        const created = await createAttribute(payload);
        setItems(created);
      }
      resetForm();
      setFormVisible(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar atributo.');
    } finally {
      setSaving(false);
    }
  }

  function loadItem(item: ProductAttribute, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);
    setError('');
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

  function handleDuplicate(item: ProductAttribute) {
    if (items.length >= MAX_ATTRIBUTES) {
      setError(`Limite de ${MAX_ATTRIBUTES} atributos por loja atingido. Edite ou exclua um existente.`);
      return;
    }
    setSelectedId(null);
    setMode('new');
    setFormVisible(true);
    setError('');
    setForm({
      name: `${item.name} (cópia)`,
      values: [...item.values],
      priceDeltas: { ...(item.priceDeltas ?? {}) },
      useOnTotem: item.useOnTotem,
      filterOnTotem: item.filterOnTotem,
      useOnStock: item.useOnStock,
      sort: items.length + 1,
      active: item.active,
    });
    setValueDraft('');
    setDeltaDraft('0');
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
  }, [formVisible, readOnly, mode, form, selectedId, atLimit, saving, valueDraft, deltaDraft]);

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
          <HeadingCancelButton onClick={closeForm} disabled={saving} />
          <HeadingSaveButton
            onClick={() => void submit()}
            disabled={saving || (mode === 'new' && items.length >= MAX_ATTRIBUTES)}
            label={saving ? 'Salvando…' : 'Salvar'}
          />
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
          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Atributo</th>
                  <th>Valores</th>
                  <th>Uso</th>
                  <th>Status</th>
                  <th className="admin-table__actions" style={{ textAlign: 'center', width: '140px' }}>
                    Ações
                  </th>
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
                          onDuplicate={() => handleDuplicate(item)}
                          onDelete={() => void remove(item)}
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
        <article className="admin-card">
          <h2>{crudFormTitle(mode, 'atributo')}</h2>
          {error ? (
            <div
              role="alert"
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#ef4444',
                fontSize: '0.92rem',
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          ) : null}
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
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  if (error) setError('');
                }}
                placeholder="Cor, tamanho, armação…"
                disabled={atLimit || readOnly || saving}
              />
            </label>
            <AdminPicker
              label="Situação"
              value={form.active ? '1' : '0'}
              disabled={atLimit || readOnly || saving}
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
                onChange={(e) => {
                  setValueDraft(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addValue();
                  }
                }}
                placeholder="Preto, branco, P, M…"
                disabled={atLimit || readOnly || saving}
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
                  disabled={atLimit || readOnly || saving}
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={addValue}
                  disabled={atLimit || readOnly || saving}
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
                    setError('');
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}
          {form.values.length > 0 ? (
            <div className="admin-table-container">
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
                          disabled={readOnly || saving}
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
                          disabled={readOnly || saving}
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
            </div>
          ) : (
            <p className="empty admin-note">Inclua ao menos um valor, por exemplo Preto e Branco.</p>
          )}

          <div className="attr-flags">
            <label>
              <input
                type="checkbox"
                checked={form.useOnTotem}
                disabled={atLimit || readOnly || saving}
                onChange={(e) => setForm({ ...form, useOnTotem: e.target.checked })}
              />
              Usar no totem
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.filterOnTotem}
                disabled={atLimit || readOnly || saving}
                onChange={(e) => setForm({ ...form, filterOnTotem: e.target.checked })}
              />
              Filtro no totem
            </label>
            {!totemSurface || catalogFull ? (
              <label>
                <input
                  type="checkbox"
                  checked={form.useOnStock}
                  disabled={atLimit || readOnly || saving}
                  onChange={(e) => setForm({ ...form, useOnStock: e.target.checked })}
                />
                Usar no estoque
              </label>
            ) : null}
          </div>

          {!readOnly ? (
            <div className="admin-form-actions" style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void submit()}
                disabled={saving || (mode === 'new' && items.length >= MAX_ATTRIBUTES)}
              >
                {saving ? 'Salvando…' : mode === 'edit' ? 'Salvar alterações' : 'Cadastrar atributo'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={closeForm}
                disabled={saving}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="admin-form-actions" style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setMode('edit')}
              >
                Editar
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={closeForm}
              >
                Fechar
              </button>
            </div>
          )}

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
