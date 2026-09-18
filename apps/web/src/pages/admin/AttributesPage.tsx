import { useState } from 'react';
import {
  getAttributes,
  MAX_ATTRIBUTES,
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

export function AttributesPage() {
  const [items, setItems] = useState(() => getAttributes());
  const [form, setForm] = useState(emptyForm);
  const [valueDraft, setValueDraft] = useState('');
  const [deltaDraft, setDeltaDraft] = useState('0');
  const [editingId, setEditingId] = useState<string | null>(null);

  const atLimit = !editingId && items.length >= MAX_ATTRIBUTES;

  function persist(next: ProductAttribute[]) {
    setItems(saveAttributes(next));
  }

  function addValue() {
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

  function submit() {
    if (atLimit || !form.name.trim() || form.values.length === 0) return;
    if (editingId) {
      persist(items.map((item) => (item.id === editingId ? { ...item, ...form } : item)));
    } else {
      persist([
        {
          ...form,
          id: `ATTR-${Date.now().toString(36).toUpperCase()}`,
          sort: items.length + 1,
        },
        ...items,
      ]);
    }
    setForm(emptyForm());
    setValueDraft('');
    setDeltaDraft('0');
    setEditingId(null);
  }

  function edit(item: ProductAttribute) {
    setEditingId(item.id);
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

  function remove(id: string) {
    persist(items.filter((item) => item.id !== id));
    if (editingId === id) {
      setForm(emptyForm());
      setEditingId(null);
    }
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>{editingId ? 'Atualizar atributo' : 'Atributo do produto'}</h2>
        <p>
          Até {MAX_ATTRIBUTES} atributos. Celular usa cor e capacidade; roupa, cor e tamanho; ótica,
          armação e lente. O estoque guarda o preço de cada combinação (128 GB ≠ 256 GB). Valores
          como retirada usam o ajuste abaixo, somado na hora no totem.
        </p>
        <div className="admin-form">
          <label>
            Atributo
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Cor, tamanho, armação…"
              disabled={atLimit}
            />
          </label>
          <label>
            Situação
            <select
              value={form.active ? '1' : '0'}
              onChange={(e) => setForm({ ...form, active: e.target.value === '1' })}
              disabled={atLimit}
            >
              <option value="1">Ativo</option>
              <option value="0">Inativo</option>
            </select>
          </label>
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
              disabled={atLimit}
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
                disabled={atLimit}
              />
              <button type="button" className="btn btn--ghost" onClick={addValue} disabled={atLimit}>
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
              disabled={atLimit}
              onChange={(e) => setForm({ ...form, useOnTotem: e.target.checked })}
            />
            Usar no totem
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.filterOnTotem}
              disabled={atLimit}
              onChange={(e) => setForm({ ...form, filterOnTotem: e.target.checked })}
            />
            Filtro no totem
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.useOnStock}
              disabled={atLimit}
              onChange={(e) => setForm({ ...form, useOnStock: e.target.checked })}
            />
            Usar no estoque
          </label>
        </div>

        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={atLimit}>
            {editingId ? 'Salvar atributo' : 'Cadastrar atributo'}
          </button>
          {editingId ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm());
                setValueDraft('');
                setDeltaDraft('0');
              }}
            >
              Cancelar
            </button>
          ) : null}
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
        <table className="admin-table">
          <thead>
            <tr>
              <th>Atributo</th>
              <th>Valores</th>
              <th>Uso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.name}
                  {item.active ? '' : ' (inativo)'}
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
                <td>
                  <button type="button" className="btn btn--ghost" onClick={() => edit(item)}>
                    Editar
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => remove(item.id)}>
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </section>
  );
}
