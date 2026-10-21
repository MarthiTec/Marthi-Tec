import { useEffect, useMemo, useState } from 'react';
import { AdminPicker, CrudRowActions, confirmDelete } from '../../design-system';
import { CurrencyInput } from '../../components/CurrencyInput';
import { QuickModal } from '../../components/QuickModal';
import { UppercaseToggle, useUppercase } from '../../components/UppercaseToggle';
import { findBrand, useBrands } from '../../data/brandStore';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { apiListStock } from '../../services/erpApi';
import {
  apiCreateRepairService,
  apiDeleteRepairService,
  apiListRepairServices,
  apiUpdateRepairService,
  repairDuration,
  repairMoney,
  type RepairOption,
  type RepairService,
  type RepairServiceInput,
} from '../../services/repairsApi';
import './repairs.css';

type StockRow = { id: string; name: string; brand?: string; kind?: string; qty?: number };
type Device = { key: string; productId: string | null; brand: string; model: string };
type Unit = 'min' | 'h' | 'd';
const UNIT_MINUTES: Record<Unit, number> = { min: 1, h: 60, d: 60 * 24 };

const blank = (device?: Device | null): RepairServiceInput => ({
  productId: device?.productId ?? null,
  brand: device?.brand ?? '',
  model: device?.model ?? '',
  category: '',
  name: '',
  description: '',
  price: null,
  cost: null,
  estimatedMinutes: null,
  active: true,
  internalNotes: '',
  options: [],
  sort: 0,
});
const deviceKey = (productId: string | null, brand: string, model: string) => (productId ? `p:${productId}` : `m:${brand}\u0000${model}`);
/** Venda e custo do serviço (ou da opção mais barata, quando tem peças/qualidades). */
function figures(service: RepairService) {
  const options = service.options.filter((option) => option.active !== false);
  if (!options.length) return { price: service.price, cost: service.cost, many: false };
  const priced = options.filter((option) => option.price !== null).sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  const first = priced[0];
  return { price: first?.price ?? null, cost: first?.cost ?? null, many: true };
}
const margin = (price: number | null | undefined, cost: number | null | undefined) =>
  price !== null && price !== undefined && cost !== null && cost !== undefined ? price - cost : null;
const minutesToInput = (minutes: number | null): { value: string; unit: Unit } => {
  if (!minutes) return { value: '', unit: 'h' };
  if (minutes % (60 * 24) === 0) return { value: String(minutes / (60 * 24)), unit: 'd' };
  if (minutes % 60 === 0) return { value: String(minutes / 60), unit: 'h' };
  return { value: String(minutes), unit: 'min' };
};
const inputToMinutes = (value: string, unit: Unit) => {
  const n = Number(value.replace(',', '.'));
  return n > 0 ? Math.round(n * UNIT_MINUTES[unit]) : null;
};

/**
 * Catálogo de manutenções (módulo de OS): escolha o aparelho (do cadastro de produtos ou digitando
 * marca e modelo) e cadastre as manutenções possíveis com valor de venda, custo, prazo e as
 * peças/qualidades. Tudo fica no banco; é o que o cliente vê em "Solicitar manutenção".
 */
export function RepairServicesPage() {
  const { brands } = useBrands();
  const [services, setServices] = useState<RepairService[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [device, setDevice] = useState<Device | null>(null);
  const [manual, setManual] = useState({ brand: '', model: '' });
  const [editing, setEditing] = useState<{ id: string | null; form: RepairServiceInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [quick, setQuick] = useState({ name: '', category: '', price: 0, cost: 0, time: '', unit: 'h' as Unit });
  const [quickBusy, setQuickBusy] = useState(false);
  const { uppercase, setUppercase, upper } = useUppercase();

  useEffect(() => {
    const load = () => {
      setLoading(true);
      Promise.all([apiListRepairServices(), apiListStock().catch(() => [])])
        .then(([list, items]) => {
          setServices(list);
          setStock((items as unknown as StockRow[]).map((row) => ({ id: row.id, name: row.name, brand: row.brand, kind: row.kind, qty: row.qty })));
          setError('');
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os serviços.'))
        .finally(() => setLoading(false));
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, []);

  const brandName = (value?: string) => findBrand(brands, value)?.name ?? (value ? value.charAt(0).toUpperCase() + value.slice(1) : '');
  const productDevice = (row: StockRow): Device => ({ key: deviceKey(row.id, brandName(row.brand), row.name), productId: row.id, brand: brandName(row.brand), model: row.name });
  /** Categorias já usadas pela loja (sugestões vindas do banco). */
  const categories = useMemo(() => [...new Set(services.map((service) => service.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [services]);

  /** Aparelhos que já têm manutenção, para abrir rápido. */
  const devices = useMemo(() => {
    const term = query.trim().toLowerCase();
    const map = new Map<string, Device & { count: number }>();
    for (const service of services) {
      const key = deviceKey(service.productId, service.brand, service.model);
      const current = map.get(key);
      map.set(key, current ? { ...current, count: current.count + 1 } : { key, productId: service.productId, brand: service.brand, model: service.model, count: 1 });
    }
    return [...map.values()]
      .filter((entry) => !term || `${entry.brand} ${entry.model}`.toLowerCase().includes(term))
      .sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
  }, [services, query]);

  const deviceServices = useMemo(
    () => (device ? services.filter((service) => deviceKey(service.productId, service.brand, service.model) === device.key).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)) : []),
    [services, device],
  );
  const productOptions = useMemo(
    () =>
      [...stock]
        .sort((a, b) => Number(b.kind === 'device') - Number(a.kind === 'device') || a.name.localeCompare(b.name))
        .map((row) => ({ value: row.id, label: row.name, hint: [brandName(row.brand), row.kind === 'device' ? 'aparelho' : ''].filter(Boolean).join(' · '), keywords: row.brand })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stock, brands],
  );
  const stockName = (id: string | null | undefined) => stock.find((row) => row.id === id)?.name ?? '';

  function pickProduct(productId: string) {
    const row = stock.find((entry) => entry.id === productId);
    if (row) setDevice(productDevice(row));
  }
  function pickManual() {
    const brand = manual.brand.trim();
    const model = manual.model.trim();
    if (!brand || !model) return;
    setDevice({ key: deviceKey(null, brand, model), productId: null, brand, model });
    setManual({ brand: '', model: '' });
  }

  const open = (service: RepairService | null, copy = false) => {
    setFormError('');
    if (!service) return setEditing({ id: null, form: blank(device) });
    const { id, updatedAt: _u, ...input } = service;
    setEditing({
      id: copy ? null : id,
      form: copy ? { ...input, productId: null, model: '', options: input.options.map((option) => ({ ...option, id: undefined })) } : input,
    });
  };
  const set = (patch: Partial<RepairServiceInput>) => setEditing((value) => (value ? { ...value, form: { ...value.form, ...patch } } : value));
  const setOption = (index: number, patch: Partial<RepairOption>) =>
    editing && set({ options: editing.form.options.map((option, i) => (i === index ? { ...option, ...patch } : option)) });

  async function save() {
    if (!editing) return;
    setBusy(true);
    setFormError('');
    try {
      const body = { ...editing.form, options: editing.form.options.filter((option) => option.name.trim()) };
      const saved = editing.id ? await apiUpdateRepairService(editing.id, body) : await apiCreateRepairService(body);
      setServices((list) => [...list.filter((item) => item.id !== saved.id), saved]);
      setDevice({ key: deviceKey(saved.productId, saved.brand, saved.model), productId: saved.productId, brand: saved.brand, model: saved.model });
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  /** Linha rápida: nome, categoria, venda, custo e prazo, direto na tabela do aparelho. */
  async function addQuick() {
    if (!device || !quick.name.trim()) return;
    setQuickBusy(true);
    setError('');
    try {
      const saved = await apiCreateRepairService({
        ...blank(device),
        name: quick.name.trim(),
        category: quick.category.trim(),
        price: quick.price,
        cost: quick.cost || null,
        estimatedMinutes: inputToMinutes(quick.time, quick.unit),
        sort: deviceServices.length,
      });
      setServices((list) => [...list, saved]);
      setQuick((value) => ({ ...value, name: '', category: '', price: 0, cost: 0, time: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível adicionar.');
    } finally {
      setQuickBusy(false);
    }
  }
  async function patchService(service: RepairService, patch: Partial<RepairServiceInput>) {
    try {
      const { id, updatedAt: _u, ...input } = service;
      const saved = await apiUpdateRepairService(id, { ...input, ...patch });
      setServices((list) => list.map((item) => (item.id === saved.id ? saved : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar.');
    }
  }
  async function remove(service: RepairService) {
    if (!confirmDelete(`${service.name} (${service.brand} ${service.model})`)) return;
    try {
      await apiDeleteRepairService(service.id);
      setServices((list) => list.filter((item) => item.id !== service.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir.');
    }
  }

  const form = editing?.form;
  const time = minutesToInput(form?.estimatedMinutes ?? null);
  return (
    <section className="admin-page repairs">
      <header className="repairs__head">
        <p className="repairs__muted">Escolha o aparelho e cadastre as manutenções possíveis, com valor de venda, custo e prazo. É o que o cliente vê em “Solicitar manutenção” no catálogo digital e o que a oficina usa no orçamento.</p>
      </header>

      <section className="repairs__picker">
        <AdminPicker label="Aparelho do cadastro de produtos" value={device?.productId ?? ''} placeholder="Escolha o produto (ex.: IPHONE 16 PRO MAX)" options={productOptions} searchable onChange={pickProduct} />
        <div className="repairs__manual">
          <label>
            ou digite a marca
            <input value={manual.brand} list="repair-brand-names" maxLength={60} placeholder="Ex.: Apple" onChange={(e) => setManual((value) => ({ ...value, brand: upper(e.target.value) }))} />
          </label>
          <label>
            e o modelo
            <input value={manual.model} maxLength={80} placeholder="Ex.: iPhone 11" onChange={(e) => setManual((value) => ({ ...value, model: upper(e.target.value) }))} onKeyDown={(e) => e.key === 'Enter' && pickManual()} />
          </label>
          <button type="button" className="btn btn--ghost" disabled={!manual.brand.trim() || !manual.model.trim()} onClick={pickManual}>
            Usar este aparelho
          </button>
          <datalist id="repair-brand-names">
            {brands.map((brand) => (
              <option key={brand.id} value={brand.name} />
            ))}
          </datalist>
        </div>
        <UppercaseToggle checked={uppercase} onChange={setUppercase} />
      </section>
      {error ? <p role="alert" className="repairs__error">{error}</p> : null}

      <div className={`repairs__workspace${device ? ' has-device' : ''}`}>
        <aside className="repairs__devices" aria-label="Aparelhos com manutenção">
          <input type="search" className="admin-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aparelho…" aria-label="Buscar aparelho com manutenção" />
          {loading ? <p className="repairs__muted">Carregando…</p> : null}
          {!loading && !devices.length ? <p className="repairs__muted">{services.length ? 'Nenhum aparelho com esse nome.' : 'Nenhuma manutenção cadastrada ainda. Escolha um aparelho acima para começar.'}</p> : null}
          <ul>
            {devices.map((entry) => (
              <li key={entry.key}>
                <button type="button" className={device?.key === entry.key ? 'is-on' : ''} onClick={() => setDevice(entry)}>
                  <span>
                    <small>{entry.brand}</small>
                    <strong>{entry.model}</strong>
                  </span>
                  <em>{entry.count}</em>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {device ? (
          <article className="repairs__device">
            <header>
              <div>
                <small>
                  {device.brand}
                  {device.productId ? ' · do cadastro de produtos' : ' · digitado'}
                </small>
                <h3>{device.model}</h3>
              </div>
              <button type="button" className="repairs__close" onClick={() => setDevice(null)} aria-label="Fechar aparelho">
                ×
              </button>
            </header>

            <div className="repairs__table" role="table" aria-label={`Manutenções do ${device.model}`}>
              <div className="repairs__row repairs__row--head" role="row">
                <span>Manutenção</span>
                <span>Venda</span>
                <span>Custo</span>
                <span>Margem</span>
                <span>Prazo</span>
                <span>Ativo</span>
                <span />
              </div>
              {deviceServices.map((service) => {
                const { price, cost, many } = figures(service);
                const gain = margin(price, cost);
                return (
                  <div key={service.id} className={`repairs__row${service.active ? '' : ' is-off'}`} role="row">
                    <button type="button" className="repairs__row-name" onClick={() => open(service)}>
                      <strong>{service.name}</strong>
                      <small>
                        {[service.category, many ? `${service.options.filter((option) => option.active !== false).length} opções de peça` : ''].filter(Boolean).join(' · ') || 'Editar detalhes'}
                      </small>
                    </button>
                    <span data-label="Venda">{price === null ? 'Sob avaliação' : `${many ? 'a partir de ' : ''}${repairMoney(price)}`}</span>
                    <span data-label="Custo">{cost === null ? '—' : repairMoney(cost)}</span>
                    <span data-label="Margem" className={gain !== null && gain < 0 ? 'is-neg' : ''}>
                      {gain === null ? '—' : `${repairMoney(gain)}${price ? ` (${Math.round((gain / price) * 100)}%)` : ''}`}
                    </span>
                    <span data-label="Prazo">{repairDuration(service.estimatedMinutes) || '—'}</span>
                    <span data-label="Ativo">
                      <input type="checkbox" checked={service.active} aria-label={`${service.name} ativo`} onChange={() => void patchService(service, { active: !service.active })} />
                    </span>
                    <span className="repairs__row-actions" onClick={(e) => e.stopPropagation()}>
                      <CrudRowActions
                        onView={() => open(service)}
                        onEdit={() => open(service)}
                        onDuplicate={() => open(service, true)}
                        onDelete={() => void remove(service)}
                      />
                    </span>
                  </div>
                );
              })}
              {!deviceServices.length ? <p className="repairs__muted repairs__row-empty">Nenhuma manutenção para este aparelho ainda. Adicione abaixo.</p> : null}

            </div>

            <div className="repairs__add" role="group" aria-label="Adicionar manutenção">
              <label className="repairs__add-wide">
                Nova manutenção
                <input value={quick.name} maxLength={80} placeholder="Ex.: TROCA DE BATERIA" onChange={(e) => setQuick((value) => ({ ...value, name: upper(e.target.value) }))} onKeyDown={(e) => e.key === 'Enter' && void addQuick()} />
              </label>
              <label>
                Categoria
                <input value={quick.category} list="repair-categories" maxLength={40} placeholder="Ex.: BATERIA" onChange={(e) => setQuick((value) => ({ ...value, category: upper(e.target.value) }))} />
              </label>
              <label>
                Venda
                <CurrencyInput value={quick.price} ariaLabel="Valor de venda" onChange={(price) => setQuick((value) => ({ ...value, price }))} />
              </label>
              <label>
                Custo
                <CurrencyInput value={quick.cost} ariaLabel="Custo" onChange={(cost) => setQuick((value) => ({ ...value, cost }))} />
              </label>
              <label>
                Prazo
                <span className="repairs__time">
                  <input value={quick.time} inputMode="decimal" placeholder="0" aria-label="Prazo" onChange={(e) => setQuick((value) => ({ ...value, time: e.target.value }))} />
                  <AdminPicker
                    compact
                    label="Unidade do prazo"
                    value={quick.unit}
                    searchable={false}
                    options={[
                      { value: 'min', label: 'min' },
                      { value: 'h', label: 'h' },
                      { value: 'd', label: 'dias' },
                    ]}
                    onChange={(unit) => setQuick((value) => ({ ...value, unit: unit as Unit }))}
                  />
                </span>
              </label>
              <div className="repairs__add-go">
                {quick.price ? <small>Margem {repairMoney(quick.price - quick.cost)}</small> : null}
                <button type="button" className="btn btn--primary" disabled={quickBusy || !quick.name.trim()} onClick={() => void addQuick()}>
                  {quickBusy ? 'Salvando…' : '＋ Adicionar'}
                </button>
              </div>
            </div>
            <datalist id="repair-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <p className="repairs__muted">Para peças e qualidades (ex.: Compatível, OLED, Original — cada uma com venda e custo), descrição para o cliente e observação interna, clique em Editar.</p>
            <button type="button" className="btn btn--ghost" onClick={() => open(null)}>
              ＋ Manutenção com peças / qualidades
            </button>
          </article>
        ) : (
          <div className="repairs__empty repairs__device-empty">
            <strong>Escolha um aparelho</strong>
            <span>Pelo cadastro de produtos, digitando marca e modelo ou na lista de aparelhos que já têm manutenção.</span>
          </div>
        )}
      </div>

      {editing && form ? (
        <QuickModal
          title={editing.id ? 'Editar manutenção' : 'Nova manutenção'}
          subtitle="Só o que estiver ativo aparece para o cliente. Sem valor = sob avaliação. O custo nunca aparece para o cliente."
          className="repairs-modal"
          busy={busy}
          error={formError}
          onClose={() => setEditing(null)}
          onSubmit={save}
          submitLabel="Salvar manutenção"
        >
          <UppercaseToggle checked={uppercase} onChange={setUppercase} />
          <AdminPicker
            label="Aparelho do cadastro de produtos"
            value={form.productId ?? ''}
            searchable
            placeholder="Opcional — ou digite marca e modelo abaixo"
            options={[{ value: '', label: 'Sem vínculo (marca e modelo digitados)' }, ...productOptions]}
            onChange={(productId) => {
              const row = stock.find((entry) => entry.id === productId);
              set(row ? { productId, brand: brandName(row.brand), model: row.name } : { productId: null });
            }}
          />
          <div className="quick-modal__row">
            <label>
              Marca *
              <input value={form.brand} list="repair-brand-names" maxLength={60} onChange={(e) => set({ brand: upper(e.target.value) })} />
            </label>
            <label>
              Modelo *
              <input value={form.model} maxLength={80} onChange={(e) => set({ model: upper(e.target.value) })} />
            </label>
          </div>
          <div className="quick-modal__row">
            <label>
              Manutenção *
              <input value={form.name} maxLength={80} placeholder="Ex.: TROCA DE TELA" onChange={(e) => set({ name: upper(e.target.value) })} />
            </label>
            <label>
              Categoria
              <input value={form.category} list="repair-categories" maxLength={40} onChange={(e) => set({ category: upper(e.target.value) })} />
            </label>
          </div>
          <label>
            Descrição para o cliente
            <input value={form.description} maxLength={400} placeholder="Ex.: Selecione a qualidade da peça" onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="quick-modal__row">
            <label>
              Prazo estimado
              <span className="repairs__time">
                <input value={time.value} inputMode="decimal" placeholder="0" onChange={(e) => set({ estimatedMinutes: inputToMinutes(e.target.value, time.unit) })} />
                <AdminPicker
                  compact
                  label="Unidade do prazo"
                  value={time.unit}
                  searchable={false}
                  options={[
                    { value: 'min', label: 'min' },
                    { value: 'h', label: 'horas' },
                    { value: 'd', label: 'dias' },
                  ]}
                  onChange={(unit) => set({ estimatedMinutes: inputToMinutes(time.value, unit as Unit) })}
                />
              </span>
            </label>
            <label className="quick-modal__check repairs__active">
              <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
              Ativo (aparece para o cliente)
            </label>
          </div>

          <fieldset className="repairs__options">
            <legend>Peças / qualidades</legend>
            <p className="repairs__muted">Cada opção com venda e custo. Sem opções, valem a venda e o custo do serviço.</p>
            {form.options.map((option, index) => {
              const gain = margin(option.price, option.cost);
              return (
                <div key={option.id ?? `new-${index}`} className={`repairs__option${option.active === false ? ' is-off' : ''}`}>
                  <input value={option.name} maxLength={80} placeholder="Ex.: TELA OLED" aria-label={`Opção ${index + 1}`} onChange={(e) => setOption(index, { name: upper(e.target.value) })} />
                  {option.price === null ? (
                    <button type="button" className="repairs__eval" onClick={() => setOption(index, { price: 0 })} title="Definir valor de venda">
                      Sob avaliação
                    </button>
                  ) : (
                    <CurrencyInput value={option.price} ariaLabel={`Venda de ${option.name || 'opção'}`} onChange={(price) => setOption(index, { price })} />
                  )}
                  <CurrencyInput value={option.cost ?? 0} ariaLabel={`Custo de ${option.name || 'opção'}`} onChange={(cost) => setOption(index, { cost: cost || null })} />
                  <span className={`repairs__margin${gain !== null && gain < 0 ? ' is-neg' : ''}`}>{gain === null ? 'margem —' : `margem ${repairMoney(gain)}`}</span>
                  <AdminPicker
                    label="Peça do estoque"
                    compact
                    searchable
                    value={option.stockItemId ?? ''}
                    placeholder="Peça do estoque (opcional)"
                    options={[{ value: '', label: 'Sem vínculo' }, ...stock.map((row) => ({ value: row.id, label: row.name, hint: row.qty !== undefined ? `${row.qty} em estoque` : undefined }))]}
                    onChange={(value) => setOption(index, { stockItemId: value || null })}
                  />
                  <label className="repairs__inline-check" title="Sem preço: o cliente vê “Valor sob avaliação”">
                    <input type="checkbox" checked={option.price === null} onChange={(e) => setOption(index, { price: e.target.checked ? null : 0 })} /> Avaliar
                  </label>
                  <label className="repairs__inline-check">
                    <input type="checkbox" checked={option.active !== false} onChange={(e) => setOption(index, { active: e.target.checked })} /> Ativa
                  </label>
                  <button type="button" className="repairs__drop" aria-label={`Remover ${option.name || 'opção'}`} onClick={() => set({ options: form.options.filter((_, i) => i !== index) })}>
                    ×
                  </button>
                </div>
              );
            })}
            <button type="button" className="quick-add-btn" onClick={() => set({ options: [...form.options, { name: '', price: 0, cost: null, stockItemId: null, active: true }] })}>
              ＋ Opção de peça / qualidade
            </button>
          </fieldset>

          {!form.options.length ? (
            <div className="quick-modal__row repairs__money">
              <label>
                Valor de venda
                {form.price === null ? (
                  <button type="button" className="repairs__eval" onClick={() => set({ price: 0 })}>
                    Sob avaliação — definir valor
                  </button>
                ) : (
                  <CurrencyInput value={form.price} ariaLabel="Valor de venda" onChange={(price) => set({ price })} />
                )}
              </label>
              <label>
                Custo
                <CurrencyInput value={form.cost ?? 0} ariaLabel="Custo" onChange={(cost) => set({ cost: cost || null })} />
              </label>
              <label className="quick-modal__check repairs__active">
                <input type="checkbox" checked={form.price === null} onChange={(e) => set({ price: e.target.checked ? null : 0 })} />
                Valor sob avaliação técnica
              </label>
            </div>
          ) : null}
          {!form.options.length && margin(form.price, form.cost) !== null ? (
            <p className="repairs__muted">
              Margem: <b>{repairMoney(margin(form.price, form.cost)!)}</b>
              {form.price ? ` (${Math.round((margin(form.price, form.cost)! / form.price) * 100)}%)` : ''}
            </p>
          ) : null}
          <label>
            Observações internas (o cliente não vê)
            <textarea rows={2} value={form.internalNotes} maxLength={600} onChange={(e) => set({ internalNotes: e.target.value })} />
          </label>
          {form.options.some((option) => option.stockItemId) ? (
            <small className="repairs__muted">
              Peças vinculadas: {form.options.filter((option) => option.stockItemId).map((option) => `${option.name || 'opção'} → ${stockName(option.stockItemId)}`).join(' · ')}. A solicitação não baixa o estoque; a baixa segue a OS.
            </small>
          ) : null}
        </QuickModal>
      ) : null}
    </section>
  );
}
