import { useEffect, useId, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudIconButton } from '../../components/CrudKit';
import { CurrencyInput } from '../../components/CurrencyInput';
import { QuickCreateSupplier } from '../../components/QuickCreate';
import { QuickAddButton, QuickModal } from '../../components/QuickModal';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { getAdminState } from '../../data/adminStore';
import { ATTR_CAP, ATTR_COR, getAttributes } from '../../data/attributeStore';
import { getErpRegistry } from '../../data/erpRegistry';
import { buildQuickQuote, type MarginMode } from '../../data/quickQuote';
import {
  conditionLabel,
  matchingOffers,
  matchingStock,
  purchaseAdvice,
  rankOffers,
  type OfferCondition,
  type OfferFilter,
  type StockUnit,
  type SupplierOffer,
} from '../../data/supplierOfferCompare';
import { apiDeleteSupplierOffer, apiListSupplierOffers, apiSaveSupplierOffer, type ApiSupplierOfferInput } from '../../services/erpApi';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const splitList = (text: string) => [...new Set(text.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean))];
const ORIGINS = ['Nacional (Anatel)', 'Importado', 'Vitrine', 'Recondicionado (CPO)'];
const CONDITIONS: { value: OfferCondition; label: string }[] = [
  { value: 'new', label: 'Novo (lacrado)' },
  { value: 'used', label: 'Usado' },
  { value: 'refurbished', label: 'Recondicionado' },
];

/** Id do atributo da loja pelo nome ("Capacidade", "Cor"); lojas antigas usam os ids fixos. */
const attributeId = (pattern: RegExp, fallback: string) => getAttributes().find((attr) => pattern.test(attr.name))?.id ?? fallback;

/** O que a loja tem em estoque, uma linha por variação (cor, capacidade, condição). */
function stockUnits(): StockUnit[] {
  const capId = attributeId(/^capacidade|armazenamento/i, ATTR_CAP);
  const colorId = attributeId(/^cor(es)?$/i, ATTR_COR);
  return getAdminState().stock.flatMap((item) =>
    item.kind === 'supply'
      ? []
      : item.variations?.length
        ? item.variations.map((variation) => ({
            name: item.name,
            capacity: variation.attrs?.[capId] ?? variation.attrs?.[ATTR_CAP] ?? '',
            color: variation.attrs?.[colorId] ?? variation.attrs?.[ATTR_COR] ?? '',
            condition: (variation.condition ?? 'new') as OfferCondition,
            batteryLevel: variation.batteryLevel ?? null,
            qty: Number(variation.qty) || 0,
            price: Number(variation.price) || 0,
          }))
        : [{ name: item.name, capacity: '', color: '', condition: (item.condition ?? 'new') as OfferCondition, batteryLevel: null, qty: Number(item.qty) || 0, price: Number(item.price) || 0 }],
  );
}

type Draft = ApiSupplierOfferInput & { id?: string; capacitiesText: string; colorsText: string };

const emptyDraft = (filter: OfferFilter): Draft => ({
  supplierId: '',
  supplierName: '',
  model: filter.model,
  condition: filter.condition && filter.condition !== 'any' ? filter.condition : 'new',
  batteryLevel: null,
  capacities: [],
  colors: [],
  capacitiesText: filter.capacity ?? '',
  colorsText: filter.color ?? '',
  price: 0,
  deliveryDays: 0,
  maxInstallments: 1,
  installmentFeePercent: 0,
  origin: 'Nacional (Anatel)',
  warranty: '',
  notes: '',
});

/**
 * Cotação avançada por fornecedor: as ofertas do dia para o mesmo aparelho, comparadas por preço, prazo,
 * parcelamento, procedência e estado, com a checagem do estoque da loja e a sugestão de qual comprar.
 */
export function SupplierQuotePanel({
  marginMode,
  margin,
  onMarginModeChange,
  onMarginChange,
  onUse,
}: {
  marginMode: MarginMode;
  margin: number;
  onMarginModeChange: (mode: MarginMode) => void;
  onMarginChange: (value: number) => void;
  onUse: (device: string, cost: number) => void;
}) {
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<OfferFilter>({ model: '', capacity: '', color: '', condition: 'any' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [quickSupplier, setQuickSupplier] = useState(false);
  const [suppliers, setSuppliers] = useState(() => getErpRegistry().suppliers.filter((item) => item.active !== false));
  const { confirm, dialog } = useConfirmDialog();
  const listId = useId();
  const today = todayIso();

  async function reload() {
    setLoading(true);
    try {
      setOffers(await apiListSupplierOffers(days));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as ofertas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const units = useMemo(stockUnits, []);
  const models = useMemo(
    () => [...new Set([...offers.map((offer) => offer.model), ...units.map((unit) => unit.name)].map((name) => name.trim()).filter(Boolean))].sort(),
    [offers, units],
  );
  const capacities = useMemo(() => [...new Set([...offers.flatMap((o) => o.capacities), ...units.map((u) => u.capacity)].filter(Boolean))].sort(), [offers, units]);
  const colors = useMemo(() => [...new Set([...offers.flatMap((o) => o.colors), ...units.map((u) => u.color)].filter(Boolean))].sort(), [offers, units]);

  const active = filter.model.trim() ? filter : null;
  const inStock = active ? matchingStock(units, active) : [];
  const ranked = active ? rankOffers(matchingOffers(offers, active), active, today) : [];
  const others = active ? offers.filter((offer) => !ranked.some((item) => item.offer.id === offer.id) && offer.model.trim().toLowerCase() === active.model.trim().toLowerCase()) : [];

  function edit(offer: SupplierOffer, duplicate = false) {
    setFormError('');
    setDraft({ ...offer, id: duplicate ? undefined : offer.id, quotedAt: duplicate ? undefined : offer.quotedAt, capacitiesText: offer.capacities.join(', '), colorsText: offer.colors.join(', ') });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setFormError('');
    try {
      const { id, capacitiesText, colorsText, ...rest } = draft;
      await apiSaveSupplierOffer(id, {
        ...rest,
        supplierId: rest.supplierId || null,
        batteryLevel: rest.condition === 'new' ? null : rest.batteryLevel || null,
        capacities: splitList(capacitiesText),
        colors: splitList(colorsText),
        // Duplicar ou editar uma oferta antiga = preço confirmado hoje.
        quotedAt: today,
      } as ApiSupplierOfferInput);
      setDraft(null);
      if (!filter.model.trim()) setFilter((current) => ({ ...current, model: rest.model }));
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar a oferta.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(offer: SupplierOffer) {
    if (!(await confirm({ title: 'Excluir oferta', message: `${offer.supplierName} · ${offer.model} · ${money(offer.price)}`, confirmLabel: 'Excluir', danger: true }))) return;
    try {
      await apiDeleteSupplierOffer(offer.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir a oferta.');
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));
  const deviceName = (offer: SupplierOffer) =>
    [offer.model, active?.capacity || (offer.capacities.length === 1 ? offer.capacities[0] : ''), active?.color || (offer.colors.length === 1 ? offer.colors[0] : ''), offer.condition === 'new' ? '' : `${conditionLabel(offer.condition)}${offer.batteryLevel ? ` ${offer.batteryLevel}%` : ''}`]
      .filter(Boolean)
      .join(' ');

  return (
    <div className="supplier-quote">
      {dialog}
      <section className="admin-card supplier-quote__search" aria-label="O que o cliente procura">
        <label className="admin-field supplier-quote__model">
          Aparelho
          <input className="admin-input" list={`${listId}-models`} value={filter.model} placeholder="Ex.: IPHONE 17 PRO MAX" onChange={(e) => setFilter({ ...filter, model: e.target.value })} />
        </label>
        <label className="admin-field">
          Capacidade
          <input className="admin-input" list={`${listId}-caps`} value={filter.capacity} placeholder="Qualquer" onChange={(e) => setFilter({ ...filter, capacity: e.target.value })} />
        </label>
        <label className="admin-field">
          Cor
          <input className="admin-input" list={`${listId}-colors`} value={filter.color} placeholder="Qualquer" onChange={(e) => setFilter({ ...filter, color: e.target.value })} />
        </label>
        <AdminPicker
          label="Novo ou usado"
          value={filter.condition ?? 'any'}
          options={[{ value: 'any', label: 'Tanto faz' }, ...CONDITIONS]}
          onChange={(value) => setFilter({ ...filter, condition: value as OfferFilter['condition'] })}
        />
        <AdminPicker
          label="Cotações de"
          value={String(days)}
          options={[
            { value: '0', label: 'Hoje' },
            { value: '3', label: 'Últimos 3 dias' },
            { value: '7', label: 'Últimos 7 dias' },
          ]}
          onChange={(value) => setDays(Number(value))}
        />
        <div className="admin-field">
          <span>Sua margem</span>
          <div className="quick-quote__margin">
            <div className="quick-quote__switch" role="radiogroup" aria-label="Tipo de margem">
              {(['percent', 'money'] as const).map((mode) => (
                <button key={mode} type="button" role="radio" aria-checked={marginMode === mode} className={marginMode === mode ? 'is-active' : ''} onClick={() => onMarginModeChange(mode)}>
                  {mode === 'percent' ? '%' : 'R$'}
                </button>
              ))}
            </div>
            <CurrencyInput value={margin} onChange={onMarginChange} ariaLabel="Margem da loja" />
          </div>
        </div>
        <datalist id={`${listId}-models`}>{models.map((name) => <option key={name} value={name} />)}</datalist>
        <datalist id={`${listId}-caps`}>{capacities.map((name) => <option key={name} value={name} />)}</datalist>
        <datalist id={`${listId}-colors`}>{colors.map((name) => <option key={name} value={name} />)}</datalist>
      </section>

      {error ? <p className="installment-calc__alert" role="alert">{error}</p> : null}

      {active ? (
        <>
          <section className={`supplier-quote__advice${inStock.length ? ' is-stock' : ''}`} role="status">
            <strong>{inStock.length ? 'Você já tem em estoque' : 'Sugestão'}</strong>
            <p>{purchaseAdvice(ranked, inStock)}</p>
            {inStock.length ? (
              <ul>
                {inStock.map((unit, index) => (
                  <li key={index}>
                    {unit.qty}× {[unit.name, unit.capacity, unit.color, conditionLabel(unit.condition), unit.condition === 'new' ? '' : unit.batteryLevel ? `bateria ${unit.batteryLevel}%` : ''].filter(Boolean).join(' · ')} — vende por {money(unit.price)}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="supplier-quote__head">
            <h2>
              {ranked.length} {ranked.length === 1 ? 'oferta' : 'ofertas'} para {active.model}
            </h2>
            <button type="button" className="btn btn--primary" onClick={() => setDraft(emptyDraft(active))}>
              + Nova oferta de fornecedor
            </button>
          </div>

          <div className="supplier-quote__list">
            {ranked.map((item, index) => {
              const { offer } = item;
              const sale = buildQuickQuote({ cost: offer.price, marginMode, margin, tradeIn: 0 }, []);
              return (
                <article key={offer.id} className={`supplier-quote__card${item.best && !inStock.length ? ' is-best' : ''}`}>
                  <header>
                    <span className="supplier-quote__rank">{index + 1}º</span>
                    <div>
                      <h3>{offer.supplierName}</h3>
                      <small>
                        Cotado {item.ageDays === 0 ? 'hoje' : `há ${item.ageDays} ${item.ageDays === 1 ? 'dia' : 'dias'}`}
                        {item.best && !inStock.length ? ` · melhor compra (${conditionLabel(offer.condition).toLowerCase()})` : ''}
                      </small>
                    </div>
                    <strong className="supplier-quote__price">{money(offer.price)}</strong>
                  </header>
                  <dl className="supplier-quote__facts">
                    <div><dt>Prazo</dt><dd>{offer.deliveryDays === 0 ? 'Pronta entrega' : `${offer.deliveryDays} ${offer.deliveryDays === 1 ? 'dia' : 'dias'}`}</dd></div>
                    <div><dt>Pagamento</dt><dd>{offer.maxInstallments > 1 ? `Até ${offer.maxInstallments}x${offer.installmentFeePercent ? ` (${offer.installmentFeePercent}%)` : ''}` : 'À vista'}</dd></div>
                    <div><dt>Estado</dt><dd>{conditionLabel(offer.condition)}{offer.condition !== 'new' && offer.batteryLevel ? ` · ${offer.batteryLevel}%` : ''}</dd></div>
                    <div><dt>Procedência</dt><dd>{offer.origin || '—'}</dd></div>
                    <div><dt>Capacidades</dt><dd>{offer.capacities.join(', ') || '—'}</dd></div>
                    <div><dt>Cores</dt><dd>{offer.colors.join(', ') || '—'}</dd></div>
                    <div><dt>Você vende por</dt><dd>{money(sale.cashPrice)}</dd></div>
                    <div><dt>Você ganha</dt><dd>{money(sale.profit)}</dd></div>
                  </dl>
                  <div className="supplier-quote__procon">
                    <ul className="is-pro">{item.pros.map((text) => <li key={text}>{text}</li>)}</ul>
                    <ul className="is-con">{item.cons.map((text) => <li key={text}>{text}</li>)}</ul>
                  </div>
                  {offer.notes ? <p className="supplier-quote__notes">{offer.notes}</p> : null}
                  <footer>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => onUse(deviceName(offer), offer.price)}>
                      Usar na cotação do cliente
                    </button>
                    <div className="crud-actions">
                      <CrudIconButton action="edit" onClick={() => edit(offer)} />
                      <CrudIconButton action="duplicate" title="Duplicar (outra cor/capacidade ou preço de hoje)" onClick={() => edit(offer, true)} />
                      <CrudIconButton action="delete" onClick={() => void remove(offer)} />
                    </div>
                  </footer>
                </article>
              );
            })}
            {!ranked.length && !loading ? <p className="supplier-quote__empty">Nenhuma oferta com esse filtro. Cadastre o que os fornecedores passaram hoje.</p> : null}
          </div>
          {others.length ? (
            <p className="installment-calc__note">
              {others.length} {others.length === 1 ? 'oferta' : 'ofertas'} deste aparelho fora do filtro (outra cor, capacidade ou estado).
            </p>
          ) : null}
        </>
      ) : (
        <div className="supplier-quote__head">
          <p className="installment-calc__note">Escolha o aparelho que o cliente quer para ver o estoque, as ofertas dos fornecedores e a sugestão de compra.</p>
          <button type="button" className="btn btn--primary" onClick={() => setDraft(emptyDraft(filter))}>
            + Nova oferta de fornecedor
          </button>
        </div>
      )}

      {draft ? (
        <QuickModal
          title={draft.id ? 'Editar oferta' : 'Nova oferta de fornecedor'}
          subtitle="O que o fornecedor passou agora. Fica guardado com a data de hoje."
          className="customer-quick-modal"
          busy={saving}
          error={formError}
          onClose={() => setDraft(null)}
          onSubmit={save}
          submitLabel="Salvar oferta"
        >
          <div className="supplier-quote__form">
            <div className="quick-field supplier-quote__wide">
              <AdminPicker
                label="Fornecedor"
                value={draft.supplierId ?? ''}
                options={[{ value: '', label: 'Digitar o nome' }, ...suppliers.map((item) => ({ value: item.id, label: item.tradeName || item.name }))]}
                onChange={(value) => {
                  const found = suppliers.find((item) => item.id === value);
                  set({ supplierId: value, supplierName: found ? found.tradeName || found.name : draft.supplierName });
                }}
              />
              <div className="quick-field__actions">
                <QuickAddButton label="Novo fornecedor" onClick={() => setQuickSupplier(true)} />
              </div>
            </div>
            {!draft.supplierId ? (
              <label className="supplier-quote__wide">
                Nome do fornecedor *
                <input value={draft.supplierName} maxLength={160} onChange={(e) => set({ supplierName: e.target.value })} />
              </label>
            ) : null}
            <label className="supplier-quote__wide">
              Aparelho *
              <input list={`${listId}-models`} value={draft.model} maxLength={160} onChange={(e) => set({ model: e.target.value })} />
            </label>
            <AdminPicker label="Estado" value={draft.condition} options={CONDITIONS} onChange={(value) => set({ condition: value as OfferCondition })} />
            {draft.condition !== 'new' ? (
              <label>
                Bateria (%)
                <input inputMode="numeric" value={draft.batteryLevel ?? ''} onChange={(e) => set({ batteryLevel: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || null })} />
              </label>
            ) : null}
            <label>
              Preço do fornecedor *
              <CurrencyInput value={draft.price} onChange={(price) => set({ price })} ariaLabel="Preço do fornecedor" />
            </label>
            <label>
              Prazo de entrega (dias)
              <input inputMode="numeric" value={draft.deliveryDays} onChange={(e) => set({ deliveryDays: Number(e.target.value.replace(/\D/g, '').slice(0, 3)) || 0 })} />
              <small>0 = pronta entrega</small>
            </label>
            <label>
              Fornecedor parcela em até
              <input inputMode="numeric" value={draft.maxInstallments} onChange={(e) => set({ maxInstallments: Math.min(24, Number(e.target.value.replace(/\D/g, '').slice(0, 2)) || 1) })} />
            </label>
            <label>
              Juros do parcelamento (%)
              <CurrencyInput value={draft.installmentFeePercent} onChange={(installmentFeePercent) => set({ installmentFeePercent })} ariaLabel="Juros do parcelamento" />
            </label>
            <label className="supplier-quote__wide">
              Capacidades disponíveis
              <input list={`${listId}-caps`} value={draft.capacitiesText} placeholder="Ex.: 256GB, 512GB" onChange={(e) => set({ capacitiesText: e.target.value })} />
            </label>
            <label className="supplier-quote__wide">
              Cores disponíveis
              <input value={draft.colorsText} placeholder="Ex.: Prateado, Azul, Laranja" onChange={(e) => set({ colorsText: e.target.value })} />
            </label>
            <label>
              Procedência
              <input list={`${listId}-origins`} value={draft.origin} maxLength={80} onChange={(e) => set({ origin: e.target.value })} />
              <datalist id={`${listId}-origins`}>{ORIGINS.map((name) => <option key={name} value={name} />)}</datalist>
            </label>
            <label>
              Garantia
              <input value={draft.warranty} maxLength={120} placeholder="Ex.: 1 ano Apple" onChange={(e) => set({ warranty: e.target.value })} />
            </label>
            <label className="supplier-quote__wide">
              Observações
              <textarea rows={2} value={draft.notes} maxLength={500} onChange={(e) => set({ notes: e.target.value })} />
            </label>
          </div>
        </QuickModal>
      ) : null}
      {quickSupplier ? (
        <QuickCreateSupplier
          onClose={() => setQuickSupplier(false)}
          onCreated={(id) => {
            const list = getErpRegistry().suppliers.filter((item) => item.active !== false);
            setSuppliers(list);
            const created = list.find((item) => item.id === id);
            if (created) set({ supplierId: id, supplierName: created.tradeName || created.name });
          }}
        />
      ) : null}
    </div>
  );
}
