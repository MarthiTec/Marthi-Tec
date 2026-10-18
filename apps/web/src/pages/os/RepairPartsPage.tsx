import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CurrencyInput } from '../../components/CurrencyInput';
import { QuickModal } from '../../components/QuickModal';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { apiListRepairParts, apiSetRepairPartLinks, apiUpdateRepairPart, REPAIR_PART_STATUS, type RepairPart, type RepairPartStatus } from '../../services/repairPartsApi';
import { apiListRepairServices, repairMoney, type RepairService } from '../../services/repairsApi';
import { OsProductQuickModal } from './OsProductQuickModal';
import { osHref, useOsBase } from './osPaths';
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
  const [creating, setCreating] = useState(false);

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
            <p>Saldo, estoque mínimo, custo e preço de venda das peças usadas nos reparos. A quantidade muda pela entrada de estoque e pelas OS.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/erp/entrada-estoque" className="btn btn--ghost">
              Entrada de estoque
            </Link>
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              + Nova peça
            </button>
          </div>
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
                          <span className="repair-parts__name">
                            <strong>{part.name}</strong>
                            <small>{[part.sku, part.category, part.brand].filter(Boolean).join(' · ')}</small>
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
                        <td>
                          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setLinking(part)}>
                            Aparelhos
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
      <OsProductQuickModal open={creating} onClose={() => setCreating(false)} onCreated={() => load()} />
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
