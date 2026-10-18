import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { QuickModal } from '../../components/QuickModal';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { fileToProductImage } from '../../data/operatorProfile';
import { apiListSuppliers, type ApiSupplier } from '../../services/erpApi';
import {
  apiCreateRepairPart,
  apiListRepairParts,
  apiRepairPartEntry,
  apiSetRepairPartLinks,
  apiUpdateRepairPart,
  REPAIR_PART_STATUS,
  type RepairPart,
  type RepairPartEntry,
  type RepairPartStatus,
} from '../../services/repairPartsApi';
import { apiListRepairServices, repairMoney, type RepairService } from '../../services/repairsApi';
import { osHref, useOsBase } from './osPaths';
import './repairs.css';
import './repairParts.css';

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const devicesOf = (part: RepairPart) => [...new Set(part.links.map((link) => link.model))];

/** Valor editável na tabela: salva só ao sair do campo (não a cada tecla). */
function MoneyCell({ value, label, onSave }: { value: number; label: string; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(value);
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
    setDraft(value);
  }, [value]);
  return (
    <span onBlur={() => latest.current !== value && onSave(latest.current)}>
      <CurrencyInput
        value={draft}
        ariaLabel={label}
        className="repair-parts__money"
        onChange={(next) => {
          latest.current = next;
          setDraft(next);
        }}
      />
    </span>
  );
}

/**
 * Peças de manutenção: o estoque que a oficina usa nos reparos — saldo, estoque mínimo, custo, venda e
 * em quais aparelhos (qualidades do catálogo de manutenções) cada peça é usada.
 */
export function RepairPartsPage() {
  const osBase = useOsBase();
  const [parts, setParts] = useState<RepairPart[] | null>(null);
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<RepairPartStatus | 'all'>('all');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [linking, setLinking] = useState<RepairPart | null>(null);
  const [entering, setEntering] = useState<RepairPart | null>(null);
  /** null = fechado; 'new' = nova peça; peça = editar nome e foto. */
  const [editing, setEditing] = useState<RepairPart | 'new' | null>(null);
  const replace = (updated: RepairPart) => setParts((list) => (list ?? []).map((item) => (item.id === updated.id ? updated : item)));
  const notify = (text: string) => {
    setFlash(text);
    window.setTimeout(() => setFlash(''), 3000);
  };

  function load() {
    apiListRepairParts()
      .then((list) => (setParts(list), setError('')))
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar as peças.'));
  }
  useEffect(() => {
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, []);

  const stats = useMemo(() => {
    const list = parts ?? [];
    return {
      all: list.length,
      low: list.filter((part) => part.status === 'low').length,
      out: list.filter((part) => part.status === 'out').length,
      value: list.reduce((sum, part) => sum + Math.max(0, part.qty) * part.cost, 0),
    };
  }, [parts]);

  const shown = useMemo(() => {
    const words = plain(term).split(/\s+/).filter(Boolean);
    return (parts ?? []).filter((part) => {
      if (status === 'low' && part.status === 'ok') return false;
      if (status === 'out' && part.status !== 'out') return false;
      if (!words.length) return true;
      const text = plain(`${part.name} ${part.sku} ${part.brand} ${part.category} ${devicesOf(part).join(' ')}`);
      return words.every((word) => text.includes(word));
    });
  }, [parts, term, status]);

  async function save(part: RepairPart, patch: { minQty?: number; cost?: number; price?: number }) {
    const changed = Object.entries(patch).some(([key, value]) => part[key as keyof RepairPart] !== value);
    if (!changed) return;
    try {
      const updated = await apiUpdateRepairPart(part.id, patch);
      setParts((list) => (list ?? []).map((item) => (item.id === updated.id ? updated : item)));
      setFlash(`${updated.name} salva.`);
      window.setTimeout(() => setFlash(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <div className="admin-card__head" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h2>Peças de manutenção</h2>
            <p>Estoque próprio da oficina: as peças usadas nos reparos, separadas do estoque da loja. A quantidade muda pela entrada de peças (aqui) e pelas OS.</p>
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            + Nova peça
          </button>
        </div>

        <div className="repair-parts__stats">
          <button type="button" className={`repair-parts__stat${status === 'all' ? ' is-on' : ''}`} onClick={() => setStatus('all')}>
            <span>Peças</span>
            <strong>{stats.all}</strong>
          </button>
          <button type="button" className={`repair-parts__stat repair-parts__stat--low${status === 'low' ? ' is-on' : ''}`} onClick={() => setStatus('low')}>
            <span>No mínimo ou abaixo</span>
            <strong>{stats.low + stats.out}</strong>
          </button>
          <button type="button" className={`repair-parts__stat repair-parts__stat--out${status === 'out' ? ' is-on' : ''}`} onClick={() => setStatus('out')}>
            <span>Sem estoque</span>
            <strong>{stats.out}</strong>
          </button>
          <div className="repair-parts__stat" style={{ cursor: 'default' }}>
            <span>Valor em estoque (custo)</span>
            <strong>{repairMoney(stats.value)}</strong>
          </div>
        </div>

        <div className="repair-parts__tools">
          <input type="search" value={term} placeholder="Buscar peça, SKU ou aparelho (ex.: A12, iPhone 13, tela)…" aria-label="Buscar peça" onChange={(e) => setTerm(e.target.value)} />
          {flash ? <span className="repairs__muted" role="status">{flash}</span> : null}
        </div>
        {error ? <p className="qty-low">{error}</p> : null}
        {parts === null && !error ? <p className="repairs__muted">Carregando peças…</p> : null}

        {parts ? (
          <div className="admin-table-container">
            <table className="admin-table repair-parts__table">
              <thead>
                <tr>
                  <th>Peça</th>
                  <th>Aparelhos</th>
                  <th>Estoque</th>
                  <th>Mínimo</th>
                  <th>Custo</th>
                  <th>Venda</th>
                  <th>Margem</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {!shown.length ? (
                  <tr>
                    <td colSpan={8} className="empty">
                      {parts.length ? 'Nenhuma peça com esse filtro.' : 'Nenhuma peça cadastrada ainda. Cadastre as peças e vincule aos aparelhos para usá-las na OS.'}
                    </td>
                  </tr>
                ) : (
                  shown.map((part) => {
                    const devices = devicesOf(part);
                    const margin = part.price - part.cost;
                    return (
                      <tr key={part.id}>
                        <td data-label="Peça">
                          <span className="repair-parts__cell-name">
                            {part.images[0] ? <img src={part.images[0]} alt="" className="repair-parts__thumb" /> : <span className="repair-parts__thumb repair-parts__thumb--empty" aria-hidden>🔩</span>}
                            <span className="repair-parts__name">
                              <strong>{part.name}</strong>
                              <small>{[part.sku, part.category, part.brand].filter(Boolean).join(' · ')}</small>
                            </span>
                          </span>
                        </td>
                        <td data-label="Aparelhos" className="repair-parts__devices">
                          {devices.length ? devices.slice(0, 6).join(', ') + (devices.length > 6 ? ` +${devices.length - 6}` : '') : <em>Nenhum vinculado</em>}
                        </td>
                        <td data-label="Estoque">
                          <strong>{part.qty}</strong> <span className={`repair-parts__badge repair-parts__badge--${part.status}`}>{REPAIR_PART_STATUS[part.status]}</span>
                        </td>
                        <td data-label="Mínimo">
                          <input type="number" min={0} defaultValue={part.minQty} aria-label={`Estoque mínimo de ${part.name}`} onBlur={(e) => void save(part, { minQty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                        </td>
                        <td data-label="Custo">
                          <MoneyCell value={part.cost} label={`Custo de ${part.name}`} onSave={(cost) => void save(part, { cost })} />
                        </td>
                        <td data-label="Venda">
                          <MoneyCell value={part.price} label={`Preço de venda de ${part.name}`} onSave={(price) => void save(part, { price })} />
                        </td>
                        <td data-label="Margem" className={margin < 0 ? 'qty-low' : ''}>
                          {repairMoney(margin)}
                          {part.price > 0 ? ` (${Math.round((margin / part.price) * 100)}%)` : ''}
                        </td>
                        <td className="repair-parts__actions">
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEntering(part)}>
                            + Entrada
                          </button>
                          <button type="button" className="repairs__icon" title="Aparelhos que usam a peça" aria-label={`Aparelhos de ${part.name}`} onClick={() => setLinking(part)}>
                            <svg className="admin-ico" viewBox="0 0 24 24" aria-hidden="true">
                              <rect x="7" y="3" width="10" height="18" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
                              <path d="M11 18h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                          </button>
                          <button type="button" className="repairs__icon" title="Editar nome e foto" aria-label={`Editar ${part.name}`} onClick={() => setEditing(part)}>
                            <AdminIcon name="edit" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="repairs__muted" style={{ marginTop: 10 }}>
          A peça vinculada a uma qualidade (ex.: Troca de tela · Incell do A12) aparece sozinha na OS desse aparelho. Os serviços e qualidades ficam no{' '}
          <Link to={osHref(osBase, '/manutencoes')}>Catálogo de manutenções</Link>.
        </p>
      </article>

      {linking ? (
        <PartLinksModal
          part={linking}
          onClose={() => setLinking(null)}
          onSaved={(updated) => {
            setParts((list) => (list ?? []).map((item) => (item.id === updated.id ? updated : item)));
            setLinking(null);
          }}
        />
      ) : null}
      {entering ? (
        <PartEntryModal
          part={entering}
          onClose={() => setEntering(null)}
          onSaved={(updated, qty) => {
            replace(updated);
            setEntering(null);
            notify(`Entrada de ${qty} un. de ${updated.name} — saldo ${updated.qty}.`);
          }}
        />
      ) : null}
      {editing ? (
        <PartFormModal
          part={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            if (isNew) setParts((list) => [saved, ...(list ?? [])]);
            else replace(saved);
            setEditing(null);
            notify(isNew ? `${saved.name} cadastrada. Dê entrada e vincule aos aparelhos.` : `${saved.name} salva.`);
          }}
        />
      ) : null}
    </section>
  );
}

/** Em quais aparelhos/qualidades a peça é usada (vínculo gravado no catálogo de manutenções). */
function PartLinksModal({ part, onClose, onSaved }: { part: RepairPart; onClose: () => void; onSaved: (part: RepairPart) => void }) {
  const [services, setServices] = useState<RepairService[] | null>(null);
  const [chosen, setChosen] = useState(() => new Set(part.links.map((link) => `${link.serviceId}|${link.optionId}`)));
  const [term, setTerm] = useState(() => devicesOf(part)[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiListRepairServices()
      .then((list) => setServices(list.filter((service) => service.options.length)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar os serviços.'));
  }, []);

  const shown = useMemo(() => {
    const words = plain(term).split(/\s+/).filter(Boolean);
    return (services ?? [])
      .filter((service) => {
        const isChosen = service.options.some((option) => chosen.has(`${service.id}|${option.id}`));
        if (isChosen) return true;
        if (!words.length) return false;
        const text = plain(`${service.brand} ${service.model} ${service.name} ${service.category} ${service.options.map((option) => option.name).join(' ')}`);
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => collator.compare(`${a.brand} ${a.model} ${a.name}`, `${b.brand} ${b.model} ${b.name}`))
      .slice(0, 60);
  }, [services, term, chosen]);

  const flip = (key: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function save() {
    setBusy(true);
    setError('');
    try {
      const links = [...chosen].map((key) => {
        const [serviceId, optionId] = key.split('|');
        return { serviceId, optionId };
      });
      onSaved(await apiSetRepairPartLinks(part.id, links));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal
      title="Aparelhos que usam a peça"
      subtitle={part.name}
      submitLabel={`Salvar (${chosen.size} ${chosen.size === 1 ? 'qualidade' : 'qualidades'})`}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={save}
    >
      <p className="repairs__muted">Marque as qualidades que usam esta peça. Na OS desses aparelhos ela aparece com o saldo e sai do estoque ao abrir a OS.</p>
      <div className="repair-parts__tools" style={{ margin: '8px 0 0' }}>
        <input
          type="search"
          value={term}
          placeholder="Buscar aparelho ou serviço (ex.: A12, iPhone 13)…"
          aria-label="Buscar aparelho"
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
        />
      </div>
      {services === null && !error ? <p className="repairs__muted">Carregando serviços…</p> : null}
      {services && !shown.length ? <p className="repairs__muted">{term.trim() ? 'Nenhum serviço com qualidade para essa busca.' : 'Busque o aparelho para vincular.'}</p> : null}
      <ul className="repair-parts__links">
        {shown.map((service) => (
          <li key={service.id}>
            <strong>
              {service.brand} {service.model} · {service.name}
              {service.active === false ? <small> (serviço inativo no catálogo)</small> : null}
            </strong>
            {service.options.map((option) => {
              const key = `${service.id}|${option.id}`;
              const elsewhere = option.stockItemId && option.stockItemId !== part.id;
              return (
                <label key={key} className={`repair-parts__option${chosen.has(key) ? ' is-on' : ''}`}>
                  <input type="checkbox" checked={chosen.has(key)} onChange={() => flip(key)} />
                  <span className="repair-parts__option-name">
                    {option.name}
                    {elsewhere && !chosen.has(key) ? <small>já tem outra peça vinculada</small> : null}
                  </span>
                  <b>{option.price === null ? 'sob avaliação' : repairMoney(option.price)}</b>
                </label>
              );
            })}
          </li>
        ))}
      </ul>
    </QuickModal>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

/** Entrada de peças pela oficina: quantidade, custo, fornecedor e como a compra entra no financeiro. */
function PartEntryModal({ part, onClose, onSaved }: { part: RepairPart; onClose: () => void; onSaved: (part: RepairPart, qty: number) => void }) {
  const [form, setForm] = useState<RepairPartEntry>({ qty: 1, unitCost: part.cost, supplierId: null, entryDate: today(), notes: '', payment: 'paid', dueDate: '' });
  const [suppliers, setSuppliers] = useState<ApiSupplier[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    apiListSuppliers(true).then(setSuppliers).catch(() => setSuppliers([]));
  }, []);
  const set = (patch: Partial<RepairPartEntry>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    if (!(form.qty >= 1)) {
      setError('Informe a quantidade.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onSaved(await apiRepairPartEntry(part.id, { ...form, dueDate: form.payment === 'pending' ? form.dueDate || form.entryDate : '' }), form.qty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível dar entrada.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal title="Entrada de peças" subtitle={`${part.name} · saldo atual ${part.qty}`} submitLabel={`Dar entrada (${form.qty || 0} un.)`} busy={busy} error={error} onClose={onClose} onSubmit={save}>
      <div className="quick-modal__row">
        <label>
          Quantidade
          <input type="number" min={1} value={form.qty || ''} onChange={(e) => set({ qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </label>
        <label>
          Custo unitário
          <CurrencyInput value={form.unitCost} ariaLabel="Custo unitário" onChange={(unitCost) => set({ unitCost })} />
        </label>
      </div>
      <AdminPicker
        label="Fornecedor (opcional)"
        value={form.supplierId ?? ''}
        searchable
        options={[{ value: '', label: 'Sem fornecedor' }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.tradeName || supplier.name }))]}
        onChange={(value) => set({ supplierId: value || null })}
      />
      <div className="quick-modal__row">
        <label>
          Data da entrada
          <input type="date" value={form.entryDate} onChange={(e) => set({ entryDate: e.target.value })} />
        </label>
        <AdminPicker
          label="Financeiro"
          value={form.payment}
          options={[
            { value: 'paid', label: 'Compra paga' },
            { value: 'pending', label: 'A pagar (contas a pagar)' },
            { value: 'none', label: 'Sem lançamento (já estava na bancada)' },
          ]}
          onChange={(value) => set({ payment: value as RepairPartEntry['payment'] })}
        />
      </div>
      {form.payment === 'pending' ? (
        <label>
          Vencimento
          <input type="date" value={form.dueDate || form.entryDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </label>
      ) : null}
      <label>
        Observação
        <input value={form.notes} maxLength={300} placeholder="Ex.: nota 1234, lote da distribuidora" onChange={(e) => set({ notes: e.target.value })} />
      </label>
      <p className="repairs__muted">
        Total {repairMoney((form.qty || 0) * form.unitCost)} · o custo médio da peça é recalculado com esta entrada.
      </p>
    </QuickModal>
  );
}

/** Nova peça da oficina (ou editar nome e foto de uma existente). */
function PartFormModal({ part, onClose, onSaved }: { part: RepairPart | null; onClose: () => void; onSaved: (part: RepairPart, isNew: boolean) => void }) {
  const [name, setName] = useState(part?.name ?? '');
  const [category, setCategory] = useState(part?.category ?? '');
  const [brand, setBrand] = useState(part?.brand ?? '');
  const [sku, setSku] = useState(part?.sku ?? '');
  const [cost, setCost] = useState(part?.cost ?? 0);
  const [price, setPrice] = useState(part?.price ?? 0);
  const [minQty, setMinQty] = useState(part?.minQty ?? 1);
  const [images, setImages] = useState<string[]>(part?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upper = (value: string) => value.toUpperCase();

  async function addPhoto(files: FileList | null) {
    if (!files?.length) return;
    try {
      const added = await Promise.all([...files].slice(0, 6 - images.length).map((file) => fileToProductImage(file)));
      setImages((current) => [...current, ...added].slice(0, 6));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível usar essa foto.');
    }
  }

  async function save() {
    if (name.trim().length < 2) {
      setError('Informe o nome da peça.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (part) onSaved(await apiUpdateRepairPart(part.id, { name: name.trim(), images, minQty, cost, price }), false);
      else onSaved(await apiCreateRepairPart({ name: name.trim(), sku: sku.trim(), category: category.trim(), brand: brand.trim(), cost, price, minQty, images }), true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuickModal title={part ? 'Editar peça' : 'Nova peça da oficina'} subtitle={part ? part.sku : 'Fica no estoque da OS, separado do estoque da loja.'} submitLabel={part ? 'Salvar' : 'Cadastrar peça'} busy={busy} error={error} onClose={onClose} onSubmit={save}>
      <label>
        Nome da peça
        <input value={name} maxLength={160} placeholder="Ex.: CONECTOR DE CARGA TIPO C" onChange={(e) => setName(upper(e.target.value))} />
      </label>
      {!part ? (
        <div className="quick-modal__row">
          <label>
            Categoria
            <input value={category} maxLength={60} placeholder="Ex.: TELA, BATERIA, CONECTOR" onChange={(e) => setCategory(upper(e.target.value))} />
          </label>
          <label>
            Marca / fabricante
            <input value={brand} maxLength={60} placeholder="Ex.: SAMSUNG" onChange={(e) => setBrand(upper(e.target.value))} />
          </label>
        </div>
      ) : null}
      <div className="quick-modal__row">
        <label>
          Custo
          <CurrencyInput value={cost} ariaLabel="Custo" onChange={setCost} />
        </label>
        <label>
          Venda
          <CurrencyInput value={price} ariaLabel="Venda" onChange={setPrice} />
        </label>
      </div>
      <div className="quick-modal__row">
        <label>
          Estoque mínimo
          <input type="number" min={0} value={minQty} onChange={(e) => setMinQty(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
        </label>
        {!part ? (
          <label>
            Código (opcional)
            <input value={sku} maxLength={60} placeholder="Gerado se vazio" onChange={(e) => setSku(upper(e.target.value))} />
          </label>
        ) : null}
      </div>
      <div className="repair-parts__photos">
        <span>Fotos ({images.length}/6)</span>
        <div>
          {images.map((src, index) => (
            <span key={index} className="repair-parts__photo">
              <img src={src} alt="" />
              <button type="button" aria-label="Remover foto" onClick={() => setImages((current) => current.filter((_, i) => i !== index))}>
                ×
              </button>
            </span>
          ))}
          {images.length < 6 ? (
            <label className="repair-parts__photo repair-parts__photo--add">
              <input type="file" accept="image/*" multiple onChange={(e) => void addPhoto(e.target.files)} />
              + Foto
            </label>
          ) : null}
        </div>
      </div>
      {!part ? <p className="repairs__muted">A quantidade entra depois, em “+ Entrada”. Vincule aos aparelhos em “Aparelhos”.</p> : null}
    </QuickModal>
  );
}
