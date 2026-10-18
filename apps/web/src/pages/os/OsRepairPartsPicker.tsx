import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import type { WorkOrderLine } from '../../data/osStore';
import { apiListRepairParts, REPAIR_PART_STATUS, type RepairPart, type StockPartChoice } from '../../services/repairPartsApi';
import { repairMoney } from '../../services/repairsApi';
import { osHref, useOsBase } from './osPaths';
import './repairParts.css';

type Picked = StockPartChoice & { auto: boolean; charge: boolean };

/**
 * Peças do estoque para a manutenção da OS: lista as peças ligadas ao aparelho escolhido (saldo,
 * mínimo, custo e venda), marca sozinha a peça da qualidade escolhida e permite usar uma peça de
 * outro aparelho (improviso). A baixa acontece junto com a abertura da OS.
 */
export function OsRepairPartsPicker({
  brand,
  model,
  serviceLines,
  resetSignal = 0,
  onChange,
}: {
  brand: string;
  model: string;
  /** Serviços escolhidos: a qualidade com peça vinculada já marca a peça. */
  serviceLines: WorkOrderLine[];
  resetSignal?: number;
  onChange: (parts: StockPartChoice[]) => void;
}) {
  const osBase = useOsBase();
  const [linked, setLinked] = useState<RepairPart[] | null>(null);
  const [all, setAll] = useState<RepairPart[] | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [other, setOther] = useState(false);
  const [error, setError] = useState('');
  const hasServices = serviceLines.length > 0;
  const emit = useRef(onChange);
  emit.current = onChange;

  useEffect(() => {
    setPicked([]);
    setOther(false);
  }, [resetSignal]);

  // Peças ligadas ao aparelho (recarrega ao trocar de aparelho ou de loja).
  useEffect(() => {
    if (!model.trim()) {
      setLinked(null);
      return;
    }
    let alive = true;
    const load = () =>
      apiListRepairParts({ brand, model })
        .then((list) => alive && (setLinked(list), setError('')))
        .catch((err) => alive && setError(err instanceof Error ? err.message : 'Não foi possível carregar as peças.'));
    const timer = window.setTimeout(load, 250);
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    };
  }, [brand, model]);

  // Todas as peças (para o improviso), só quando pedir.
  useEffect(() => {
    if (!other || all) return;
    apiListRepairParts()
      .then(setAll)
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar as peças.'));
  }, [other, all]);

  const known = useMemo(() => new Map([...(all ?? []), ...(linked ?? [])].map((part) => [part.id, part])), [all, linked]);

  // A qualidade escolhida com peça vinculada marca a peça (incluída no serviço); desmarcar o serviço tira.
  useEffect(() => {
    const wanted = new Set(serviceLines.map((line) => line.stockId).filter((id) => id && (known.get(id)?.qty ?? 0) > 0));
    setPicked((current) => {
      const kept = current.filter((entry) => !entry.auto || wanted.has(entry.stockId));
      const add = [...wanted].filter((id) => !kept.some((entry) => entry.stockId === id));
      if (!add.length && kept.length === current.length) return current;
      return [...kept, ...add.map((stockId) => ({ stockId, qty: 1, unitPrice: 0, improvised: false, note: '', auto: true, charge: false }))];
    });
  }, [serviceLines, known]);

  useEffect(() => {
    emit.current(picked.map(({ stockId, qty, unitPrice, improvised, note }) => ({ stockId, qty, unitPrice, improvised, note })));
  }, [picked]);

  const isPicked = (id: string) => picked.some((entry) => entry.stockId === id);
  const update = (id: string, patch: Partial<Picked>) => setPicked((list) => list.map((entry) => (entry.stockId === id ? { ...entry, ...patch, auto: false } : entry)));
  function toggle(part: RepairPart, improvised = false) {
    if (isPicked(part.id)) {
      setPicked((list) => list.filter((entry) => entry.stockId !== part.id));
      return;
    }
    // Sem serviço tabelado a peça é cobrada pelo preço de venda; com serviço, já está no valor dele.
    const charge = !hasServices;
    setPicked((list) => [...list, { stockId: part.id, qty: 1, unitPrice: charge ? part.price : 0, improvised, note: '', auto: false, charge }]);
  }

  const linkedIds = new Set((linked ?? []).map((part) => part.id));
  const improvisedParts = picked.filter((entry) => !linkedIds.has(entry.stockId));
  const otherOptions = (all ?? [])
    .filter((part) => !linkedIds.has(part.id) && !isPicked(part.id))
    .map((part) => ({
      value: part.id,
      label: `${part.name} · ${part.qty > 0 ? `${part.qty} em estoque` : 'sem estoque'}`,
      hint: part.links.length ? `Usada em ${[...new Set(part.links.map((link) => link.model))].slice(0, 4).join(', ')}` : part.category || 'Peça',
      keywords: `${part.sku} ${part.brand} ${part.links.map((link) => link.model).join(' ')}`,
      disabled: part.qty <= 0,
    }));
  const totals = picked.reduce(
    (sum, entry) => {
      const part = known.get(entry.stockId);
      return { cost: sum.cost + (part?.cost ?? 0) * entry.qty, charged: sum.charged + entry.unitPrice * entry.qty, count: sum.count + entry.qty };
    },
    { cost: 0, charged: 0, count: 0 },
  );

  if (!model.trim()) return null;

  const row = (part: RepairPart, improvised: boolean) => {
    const entry = picked.find((item) => item.stockId === part.id);
    const uses = part.links.filter((link) => link.model.toLowerCase() === model.trim().toLowerCase());
    const empty = part.qty <= 0;
    return (
      <li key={part.id} className={`os-parts__item${entry ? ' is-on' : ''}${empty ? ' is-empty' : ''}`}>
        <button type="button" className="os-parts__main" disabled={empty && !entry} aria-pressed={Boolean(entry)} onClick={() => toggle(part, improvised)}>
          <span className="os-parts__check" aria-hidden>
            {entry ? '✓' : ''}
          </span>
          <span className="os-parts__info">
            <strong>{part.name}</strong>
            <small>
              {improvised ? 'Peça de outro aparelho (improviso)' : uses.length ? `Para ${uses.map((link) => `${link.serviceName} · ${link.optionName}`).join(', ')}` : part.category || 'Peça'}
              {part.sku ? ` · ${part.sku}` : ''}
            </small>
          </span>
          <span className={`os-parts__stock os-parts__stock--${part.status}`}>
            <b>{part.qty}</b> em estoque
            <small>
              mín. {part.minQty} · {REPAIR_PART_STATUS[part.status]}
            </small>
          </span>
          <span className="os-parts__money">
            <small>custo {repairMoney(part.cost)}</small>
            <small>venda {repairMoney(part.price)}</small>
          </span>
        </button>
        {entry ? (
          <div className="os-parts__edit">
            <label>
              Qtd.
              <input type="number" min={1} max={Math.max(1, part.qty)} value={entry.qty} onChange={(e) => update(part.id, { qty: Math.min(Math.max(1, Number(e.target.value) || 1), Math.max(1, part.qty)) })} />
            </label>
            <label className="os-parts__charge">
              <input
                type="checkbox"
                checked={entry.charge}
                onChange={(e) => update(part.id, { charge: e.target.checked, unitPrice: e.target.checked ? part.price : 0 })}
              />
              Cobrar à parte
            </label>
            {entry.charge ? (
              <label>
                Preço ao cliente
                <CurrencyInput value={entry.unitPrice} ariaLabel={`Preço de ${part.name} ao cliente`} onChange={(value) => update(part.id, { unitPrice: value })} />
              </label>
            ) : (
              <span className="os-parts__included">Incluída no valor do serviço</span>
            )}
            {entry.improvised ? (
              <label className="os-parts__note">
                Observação
                <input value={entry.note} maxLength={200} placeholder="Ex.: tela do A02 adaptada no A01" onChange={(e) => update(part.id, { note: e.target.value })} />
              </label>
            ) : null}
          </div>
        ) : empty ? (
          <p className="os-parts__hint">
            Sem estoque — <Link to={osHref(osBase, '/pecas')}>dar entrada</Link> ou use uma peça de outro aparelho.
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <div className="os-parts">
      <div className="os-parts__head">
        <div>
          <strong>🔩 Peças do estoque para esta manutenção</strong>
          <small>Saem do estoque quando a OS é aberta. Custo e saldo ficam registrados.</small>
        </div>
        <Link to={osHref(osBase, '/pecas')} className="btn btn--ghost btn--sm">
          Peças de manutenção
        </Link>
      </div>
      {error ? <p className="os-parts__error">{error}</p> : null}
      {linked === null && !error ? <p className="os-parts__hint">Carregando peças…</p> : null}
      {linked && !linked.length ? (
        <p className="os-parts__hint">
          Nenhuma peça vinculada a {model}. Vincule as peças às qualidades em <Link to={osHref(osBase, '/pecas')}>Peças de manutenção</Link> ou use uma peça de outro aparelho.
        </p>
      ) : null}
      {linked?.length || improvisedParts.length ? (
        <ul className="os-parts__list">
          {(linked ?? []).map((part) => row(part, false))}
          {improvisedParts.map((entry) => {
            const part = known.get(entry.stockId);
            return part ? row(part, true) : null;
          })}
        </ul>
      ) : null}
      {other ? (
        <div className="os-parts__other">
          <AdminPicker
            compact
            searchable
            label="Peça de outro aparelho"
            value=""
            placeholder={all ? 'Buscar peça no estoque (nome, SKU ou aparelho)…' : 'Carregando peças…'}
            options={otherOptions}
            onChange={(id) => {
              const part = all?.find((item) => item.id === id);
              if (part && part.qty > 0) toggle(part, true);
            }}
          />
        </div>
      ) : (
        <button type="button" className="os-parts__more" onClick={() => setOther(true)}>
          + Usar peça de outro aparelho / fora da lista
        </button>
      )}
      {picked.length ? (
        <p className="os-parts__total">
          <span>
            {totals.count} {totals.count === 1 ? 'peça' : 'peças'} · custo {repairMoney(totals.cost)}
          </span>
          <strong>{totals.charged > 0 ? `+ ${repairMoney(totals.charged)} ao cliente` : 'incluídas no serviço'}</strong>
        </p>
      ) : null}
    </div>
  );
}
