import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { QuickModal } from '../../components/QuickModal';
import { UppercaseToggle, useUppercase } from '../../components/UppercaseToggle';
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

const CATEGORIES = ['Tela', 'Bateria', 'Câmera', 'Áudio', 'Microfone', 'Conector de carga', 'Tampa traseira', 'Face ID', 'Placa', 'Software', 'Diagnóstico', 'Outros'];
const DURATIONS: Array<[number | null, string]> = [
  [null, 'Não informar'],
  [30, '30 min'],
  [60, '1 hora'],
  [120, '2 horas'],
  [180, '3 horas'],
  [240, '4 horas'],
  [60 * 24, '1 dia'],
  [60 * 24 * 2, '2 dias'],
  [60 * 24 * 3, '3 dias'],
  [60 * 24 * 7, '7 dias'],
];
const blank = (brand = '', model = ''): RepairServiceInput => ({
  brand,
  model,
  category: '',
  name: '',
  description: '',
  price: null,
  estimatedMinutes: null,
  active: true,
  internalNotes: '',
  options: [],
  sort: 0,
});
const priceLabel = (service: RepairService) => {
  const options = service.options.filter((option) => option.active !== false);
  if (options.length) {
    const prices = options.map((option) => option.price).filter((price): price is number => price !== null);
    if (!prices.length) return 'Sob avaliação';
    const min = Math.min(...prices);
    return `${options.length} ${options.length === 1 ? 'opção' : 'opções'} · a partir de ${repairMoney(min)}`;
  }
  return service.price === null ? 'Sob avaliação' : repairMoney(service.price);
};

type StockRow = { id: string; name: string; qty?: number };

/**
 * Catálogo de manutenções (módulo de OS): quais serviços a loja faz em cada marca/modelo, com as peças
 * e qualidades de cada um. É o que o cliente vê em "Solicitar manutenção" no catálogo digital.
 */
export function RepairServicesPage() {
  const [services, setServices] = useState<RepairService[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; form: RepairServiceInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const { uppercase, setUppercase, upper } = useUppercase();

  useEffect(() => {
    const load = () => {
      setLoading(true);
      Promise.all([apiListRepairServices(), apiListStock().catch(() => [])])
        .then(([list, items]) => {
          setServices(list);
          setStock((items as unknown as StockRow[]).map((row) => ({ id: row.id, name: row.name, qty: row.qty })));
          setError('');
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os serviços.'))
        .finally(() => setLoading(false));
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, []);

  const brands = useMemo(() => [...new Set(services.map((service) => service.brand))].sort((a, b) => a.localeCompare(b)), [services]);
  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const map = new Map<string, RepairService[]>();
    for (const service of services) {
      if (brand && service.brand !== brand) continue;
      if (term && !`${service.brand} ${service.model} ${service.name} ${service.category}`.toLowerCase().includes(term)) continue;
      const key = `${service.brand}\u0000${service.model}`;
      map.set(key, [...(map.get(key) ?? []), service]);
    }
    return [...map].map(([key, list]) => {
      const [b, m] = key.split('\u0000');
      return { brand: b, model: m, list };
    });
  }, [services, brand, query]);
  const modelsOf = (b: string) => [...new Set(services.filter((service) => !b || service.brand === b).map((service) => service.model))].sort();
  const stockName = (id: string | null | undefined) => stock.find((row) => row.id === id)?.name ?? '';

  const open = (service: RepairService | null, copy = false) => {
    setFormError('');
    if (!service) return setEditing({ id: null, form: blank(brand) });
    const { id, updatedAt: _u, ...input } = service;
    setEditing({
      id: copy ? null : id,
      form: copy ? { ...input, model: '', options: input.options.map((option) => ({ ...option, id: undefined })) } : input,
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
      setEditing(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  async function remove(service: RepairService) {
    if (!window.confirm(`Excluir "${service.name}" do ${service.brand} ${service.model}?`)) return;
    try {
      await apiDeleteRepairService(service.id);
      setServices((list) => list.filter((item) => item.id !== service.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir.');
    }
  }
  async function toggleActive(service: RepairService) {
    try {
      const { id, updatedAt: _u, ...input } = service;
      const saved = await apiUpdateRepairService(id, { ...input, active: !service.active });
      setServices((list) => list.map((item) => (item.id === saved.id ? saved : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar.');
    }
  }

  const form = editing?.form;
  return (
    <section className="admin-page repairs">
      <header className="repairs__head">
        <div>
          <p className="repairs__muted">Serviços que a loja faz em cada aparelho, com peças, qualidades, preço estimado e prazo. É o que o cliente vê em “Solicitar manutenção” no catálogo digital.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => open(null)}>
          ＋ Novo serviço
        </button>
      </header>

      <div className="repairs__filters">
        <input type="search" className="admin-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aparelho ou serviço…" aria-label="Buscar serviço" />
        <AdminPicker label="Marca" value={brand} options={[{ value: '', label: 'Todas as marcas' }, ...brands.map((b) => ({ value: b, label: b }))]} onChange={setBrand} />
      </div>
      {error ? <p role="alert" className="repairs__error">{error}</p> : null}
      {loading ? <p className="repairs__muted">Carregando…</p> : null}
      {!loading && !groups.length ? (
        <div className="repairs__empty">
          <strong>{services.length ? 'Nenhum serviço com esse filtro.' : 'Nenhum serviço cadastrado ainda.'}</strong>
          <span>Cadastre, por exemplo, “Troca de tela” do iPhone 16 Pro Max com as opções Compatível, OLED e Original.</span>
        </div>
      ) : null}

      <div className="repairs__groups">
        {groups.map((group) => (
          <article key={`${group.brand}-${group.model}`} className="repairs__group">
            <header>
              <div>
                <small>{group.brand}</small>
                <strong>{group.model}</strong>
              </div>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing({ id: null, form: blank(group.brand, group.model) })}>
                ＋ Serviço
              </button>
            </header>
            <ul>
              {group.list
                .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
                .map((service) => (
                  <li key={service.id} className={service.active ? '' : 'is-off'}>
                    <button type="button" className="repairs__service" onClick={() => open(service)}>
                      <span>
                        <strong>{service.name}</strong>
                        <small>
                          {[service.category, repairDuration(service.estimatedMinutes), service.active ? '' : 'inativo'].filter(Boolean).join(' · ')}
                        </small>
                      </span>
                      <em>{priceLabel(service)}</em>
                    </button>
                    <span className="repairs__actions">
                      <label className="repairs__switch" title={service.active ? 'Aparece para o cliente' : 'Escondido do cliente'}>
                        <input type="checkbox" checked={service.active} onChange={() => void toggleActive(service)} aria-label={`${service.name} ativo`} />
                      </label>
                      <button type="button" className="btn btn--ghost btn--sm" title="Copiar para outro modelo" onClick={() => open(service, true)}>
                        Copiar
                      </button>
                      <button type="button" className="btn btn--ghost btn--sm repairs__danger" onClick={() => void remove(service)} aria-label={`Excluir ${service.name}`}>
                        Excluir
                      </button>
                    </span>
                  </li>
                ))}
            </ul>
          </article>
        ))}
      </div>

      {editing && form ? (
        <QuickModal
          title={editing.id ? 'Editar serviço' : 'Novo serviço de manutenção'}
          subtitle="Só o que estiver ativo aparece para o cliente. Valor em branco = sob avaliação."
          className="repairs-modal"
          busy={busy}
          error={formError}
          onClose={() => setEditing(null)}
          onSubmit={save}
          submitLabel="Salvar serviço"
        >
          <UppercaseToggle checked={uppercase} onChange={setUppercase} />
          <div className="quick-modal__row">
            <label>
              Marca *
              <input value={form.brand} list="repair-brands" maxLength={60} placeholder="Ex.: Apple" onChange={(e) => set({ brand: upper(e.target.value) })} />
            </label>
            <label>
              Modelo *
              <input value={form.model} list="repair-models" maxLength={80} placeholder="Ex.: iPhone 16 Pro Max" onChange={(e) => set({ model: upper(e.target.value) })} />
            </label>
          </div>
          <datalist id="repair-brands">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <datalist id="repair-models">
            {modelsOf(form.brand).map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="quick-modal__row">
            <label>
              Serviço *
              <input value={form.name} maxLength={80} placeholder="Ex.: Troca de tela" onChange={(e) => set({ name: upper(e.target.value) })} />
            </label>
            <label>
              Categoria
              <input value={form.category} list="repair-categories" maxLength={40} placeholder="Ex.: Tela" onChange={(e) => set({ category: upper(e.target.value) })} />
            </label>
          </div>
          <datalist id="repair-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <label>
            Descrição para o cliente
            <input value={form.description} maxLength={400} placeholder="Ex.: Selecione a qualidade da peça" onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="quick-modal__row">
            <label>
              Tempo estimado
              <select value={form.estimatedMinutes ?? ''} onChange={(e) => set({ estimatedMinutes: e.target.value ? Number(e.target.value) : null })}>
                {DURATIONS.map(([value, label]) => (
                  <option key={label} value={value ?? ''}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="quick-modal__check repairs__active">
              <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
              Ativo (aparece para o cliente)
            </label>
          </div>

          <fieldset className="repairs__options">
            <legend>Peças / qualidades</legend>
            <p className="repairs__muted">Ex.: Compatível, OLED, Premium, Original — cada uma com o seu preço. Sem opções, vale o preço do serviço.</p>
            {form.options.map((option, index) => (
              <div key={option.id ?? `new-${index}`} className={`repairs__option${option.active === false ? ' is-off' : ''}`}>
                <input value={option.name} maxLength={80} placeholder="Ex.: Tela OLED" aria-label={`Opção ${index + 1}`} onChange={(e) => setOption(index, { name: upper(e.target.value) })} />
                {option.price === null ? (
                  <button type="button" className="repairs__eval" onClick={() => setOption(index, { price: 0 })} title="Definir preço">
                    Sob avaliação
                  </button>
                ) : (
                  <CurrencyInput value={option.price} ariaLabel={`Preço de ${option.name || 'opção'}`} onChange={(price) => setOption(index, { price })} />
                )}
                <label className="repairs__inline-check" title="Sem preço: o cliente vê “Valor sob avaliação”">
                  <input type="checkbox" checked={option.price === null} onChange={(e) => setOption(index, { price: e.target.checked ? null : 0 })} /> Avaliar
                </label>
                <AdminPicker
                  label="Peça do estoque"
                  compact
                  value={option.stockItemId ?? ''}
                  placeholder="Peça do estoque (opcional)"
                  options={[{ value: '', label: 'Sem vínculo' }, ...stock.map((row) => ({ value: row.id, label: row.name, hint: row.qty !== undefined ? `${row.qty} em estoque` : undefined }))]}
                  onChange={(value) => setOption(index, { stockItemId: value || null })}
                />
                <label className="repairs__inline-check">
                  <input type="checkbox" checked={option.active !== false} onChange={(e) => setOption(index, { active: e.target.checked })} /> Ativa
                </label>
                <button type="button" className="repairs__drop" aria-label={`Remover ${option.name || 'opção'}`} onClick={() => set({ options: form.options.filter((_, i) => i !== index) })}>
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="quick-add-btn" onClick={() => set({ options: [...form.options, { name: '', price: 0, stockItemId: null, active: true }] })}>
              ＋ Opção de peça / qualidade
            </button>
          </fieldset>

          {!form.options.length ? (
            <div className="quick-modal__row">
              <label>
                Preço estimado
                {form.price === null ? (
                  <button type="button" className="repairs__eval" onClick={() => set({ price: 0 })}>
                    Sob avaliação — definir preço
                  </button>
                ) : (
                  <CurrencyInput value={form.price} ariaLabel="Preço estimado" onChange={(price) => set({ price })} />
                )}
              </label>
              <label className="quick-modal__check repairs__active">
                <input type="checkbox" checked={form.price === null} onChange={(e) => set({ price: e.target.checked ? null : 0 })} />
                Valor sob avaliação técnica
              </label>
            </div>
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
