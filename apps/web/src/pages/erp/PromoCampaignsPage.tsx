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
import { getAdminState } from '../../data/adminStore';
import {
  listPromoCampaigns,
  PROMO_EVENT,
  PROMO_KIND_LABEL,
  removePromoCampaign,
  upsertPromoCampaign,
  type PromoCampaign,
  type PromoKind,
  type PromoTier,
} from '../../data/promoCampaignStore';

type Mode = 'new' | 'edit' | 'view';

type FormState = {
  name: string;
  active: boolean;
  kind: PromoKind;
  stockIds: string[];
  tiersText: string;
  giftStockId: string;
  giftMinQty: number;
  note: string;
};

function tiersToText(tiers: PromoTier[]) {
  return tiers.map((tier) => `${tier.qty}=${tier.totalPrice}`).join('\n');
}

function parseTiersText(raw: string): PromoTier[] {
  return raw
    .split(/\n|;|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = line.match(/^(\d+(?:[.,]\d+)?)\s*[=:]\s*(\d+(?:[.,]\d+)?)$/);
      if (!match) return [];
      return [
        {
          qty: Number(match[1].replace(',', '.')),
          totalPrice: Number(match[2].replace(',', '.')),
        },
      ];
    })
    .filter((tier) => tier.qty > 0);
}

function emptyForm(): FormState {
  return {
    name: '',
    active: true,
    kind: 'tier',
    stockIds: [],
    tiersText: '1=4\n3=10',
    giftStockId: '',
    giftMinQty: 10,
    note: '',
  };
}

export function PromoCampaignsPage() {
  const stock = useMemo(() => getAdminState().stock, []);
  const [items, setItems] = useState(() => listPromoCampaigns());
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState<Mode>('new');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [error, setError] = useState('');
  const [stockPick, setStockPick] = useState('');

  useEffect(() => {
    function refresh() {
      setItems(listPromoCampaigns());
    }
    window.addEventListener(PROMO_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PROMO_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active, status) &&
          matchesQuery(`${item.name} ${item.note} ${PROMO_KIND_LABEL[item.kind]}`, query),
      ),
    [items, query, status],
  );

  const readOnly = mode === 'view';

  function resetForm() {
    setForm(emptyForm());
    setSelectedId(null);
    setMode('new');
    setStockPick('');
    setError('');
  }

  function loadItem(item: PromoCampaign, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setForm({
      name: item.name,
      active: item.active,
      kind: item.kind,
      stockIds: [...item.stockIds],
      tiersText: tiersToText(item.tiers) || '1=4\n3=10',
      giftStockId: item.giftStockId,
      giftMinQty: item.giftMinQty,
      note: item.note,
    });
    setError('');
  }

  function save() {
    setError('');
    if (!form.name.trim()) {
      setError('Informe o nome da campanha.');
      return;
    }
    const tiers = form.kind === 'tier' ? parseTiersText(form.tiersText) : [];
    if (form.kind === 'tier' && tiers.length === 0) {
      setError('Informe ao menos uma faixa no formato 1=4 ou 3=10.');
      return;
    }
    if (form.kind === 'gift' && !form.giftStockId) {
      setError('Selecione o produto brinde.');
      return;
    }
    if (form.stockIds.length === 0) {
      setError('Vincule ao menos um produto à campanha.');
      return;
    }
    const saved = upsertPromoCampaign({
      id: mode === 'edit' && selectedId ? selectedId : undefined,
      name: form.name.trim(),
      active: form.active,
      kind: form.kind,
      stockIds: form.stockIds,
      tiers,
      giftStockId: form.giftStockId,
      giftMinQty: form.giftMinQty,
      note: form.note.trim(),
    });
    setItems(listPromoCampaigns());
    loadItem(saved, 'edit');
  }

  function remove(item: PromoCampaign) {
    if (!confirmDelete(`a campanha ${item.name}`)) return;
    removePromoCampaign(item.id);
    setItems(listPromoCampaigns());
    if (selectedId === item.id) resetForm();
  }

  function addStock() {
    if (!stockPick || form.stockIds.includes(stockPick)) return;
    setForm({ ...form, stockIds: [...form.stockIds, stockPick] });
    setStockPick('');
  }

  const stockLabel = (id: string) => stock.find((row) => row.id === id)?.name ?? id;

  return (
    <section className="admin-page">
      <article className={`admin-card ${readOnly ? 'is-readonly' : ''}`}>
        <h2>{crudFormTitle(mode, 'campanha')}</h2>
        {error ? <p className="qty-low">{error}</p> : null}
        <p className="empty">
          Cadastre faixas (1 é 4 · 3 é 10) ou brinde por volume. No PDV, ao lançar um produto
          vinculado, a regra aplica sozinha.
        </p>
        <div className="admin-form">
          <label className="span-2">
            Nome
            <input
              value={form.name}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Leve 3 pague 10"
            />
          </label>
          <AdminPicker
            label="Tipo"
            value={form.kind}
            disabled={readOnly}
            options={[
              { value: 'tier', label: PROMO_KIND_LABEL.tier },
              { value: 'gift', label: PROMO_KIND_LABEL.gift },
            ]}
            onChange={(value) => setForm({ ...form, kind: value as PromoKind })}
          />
          <label className="pdv__cpf-check">
            <input
              type="checkbox"
              checked={form.active}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span>Ativa no PDV</span>
          </label>

          {form.kind === 'tier' ? (
            <label className="span-2">
              Faixas (uma por linha: qty=preço total)
              <textarea
                rows={4}
                disabled={readOnly}
                value={form.tiersText}
                onChange={(e) => setForm({ ...form, tiersText: e.target.value })}
                placeholder={'1=4\n3=10'}
              />
            </label>
          ) : (
            <>
              <AdminPicker
                label="Produto brinde"
                value={form.giftStockId}
                disabled={readOnly}
                placeholder="Selecionar"
                options={stock.map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.sku || item.id})`,
                }))}
                onChange={(value) => setForm({ ...form, giftStockId: value })}
              />
              <label>
                Qtd mínima para brinde
                <input
                  type="number"
                  min={1}
                  disabled={readOnly}
                  value={form.giftMinQty}
                  onChange={(e) => setForm({ ...form, giftMinQty: Number(e.target.value) || 1 })}
                />
              </label>
            </>
          )}

          <label className="span-2">
            Observação
            <input
              value={form.note}
              disabled={readOnly}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>

          <div className="span-2" style={{ display: 'grid', gap: 8 }}>
            <strong>Produtos na campanha</strong>
            {!readOnly ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                <AdminPicker
                  label="Adicionar produto"
                  value={stockPick}
                  placeholder="Selecionar"
                  options={stock
                    .filter((item) => !form.stockIds.includes(item.id))
                    .map((item) => ({
                      value: item.id,
                      label: `${item.name} (${item.sku || item.id})`,
                    }))}
                  onChange={setStockPick}
                />
                <button type="button" className="btn btn--ghost" onClick={addStock} disabled={!stockPick}>
                  Incluir
                </button>
              </div>
            ) : null}
            {form.stockIds.length === 0 ? (
              <p className="empty">Nenhum produto vinculado.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {form.stockIds.map((id) => (
                  <li key={id}>
                    {stockLabel(id)}{' '}
                    {!readOnly ? (
                      <button
                        type="button"
                        className="btn btn--ghost btn--icon"
                        onClick={() =>
                          setForm({
                            ...form,
                            stockIds: form.stockIds.filter((row) => row !== id),
                          })
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!readOnly ? (
            <div className="span-2" style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn--primary" onClick={save}>
                Salvar
              </button>
              <button type="button" className="btn btn--ghost" onClick={resetForm}>
                Limpar
              </button>
            </div>
          ) : null}
        </div>
      </article>

      <article className="admin-card">
        <CrudListBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Buscar campanha…"
          status={status}
          onStatusChange={setStatus}
          onNew={resetForm}
          newLabel="Nova campanha"
        />
        <table className="admin-table">
          <thead>
            <tr>
              <th>Campanha</th>
              <th>Tipo</th>
              <th>Produtos</th>
              <th>Regra</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  Nenhuma campanha.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <CrudNameButton onClick={() => loadItem(item, 'view')}>{item.name}</CrudNameButton>
                  </td>
                  <td>{PROMO_KIND_LABEL[item.kind]}</td>
                  <td>{item.stockIds.length}</td>
                  <td>
                    {item.kind === 'tier'
                      ? item.tiers.map((tier) => `${tier.qty}=${tier.totalPrice}`).join(' · ') || '—'
                      : `≥${item.giftMinQty} → brinde`}
                  </td>
                  <td>{item.active ? 'Ativa' : 'Inativa'}</td>
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
