import { useCallback, useEffect, useState } from 'react';
import { QuickModal } from './QuickModal';
import { CurrencyInput } from './CurrencyInput';
import { apiEvaluateTrade, apiListTradeEvaluations, type TradeEvaluation } from '../services/tradeEvaluationApi';
import './tradeEvaluation.css';

const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const REFRESH_MS = 60_000;

/**
 * Esteira da OS: "Avaliação de produto pendente · cliente X · IMEI Y" pedidas pelo vendedor. A oficina abre,
 * registra bateria, se já foi aberto, se está quebrado/trincado, observação e preço sugerido. Sem custo para o
 * cliente (não vira OS). Some daqui quando o vendedor aprova ou recusa.
 */
export function TradeEvaluationStrip() {
  const [items, setItems] = useState<TradeEvaluation[]>([]);
  const [open, setOpen] = useState<TradeEvaluation | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await apiListTradeEvaluations('open'));
    } catch {
      // Sem conexão: a faixa só não aparece; a próxima atualização tenta de novo.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!items.length) return null;
  const pending = items.filter((item) => item.status === 'pending').length;

  return (
    <section className="trade-eval-strip" aria-label="Avaliações de produto">
      <p className="trade-eval-strip__title">
        🔎 {pending ? `${pending} ${pending === 1 ? 'avaliação de produto pendente' : 'avaliações de produto pendentes'}` : 'Avaliações aguardando o vendedor'}
        <small>· sem custo para o cliente</small>
      </p>
      <div className="trade-eval-strip__list">
        {items.map((item) => (
          <button key={item.id} type="button" className={`trade-eval-strip__item is-${item.status}`} onClick={() => setOpen(item)}>
            <strong>{item.status === 'pending' ? 'Avaliação de produto pendente' : `Avaliado · ${formatMoney(item.suggestedPrice ?? 0)}`}</strong>
            <span>
              Cliente {item.customerName || '—'} · IMEI {item.imei}
            </span>
            <span>
              {item.deviceName}
              {item.requestedBy ? ` · pedido por ${item.requestedBy}` : ''}
            </span>
          </button>
        ))}
      </div>
      {open ? (
        <TradeEvaluationModal
          evaluation={open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function TradeEvaluationModal({ evaluation, onClose, onSaved }: { evaluation: TradeEvaluation; onClose: () => void; onSaved: () => void }) {
  const [battery, setBattery] = useState(evaluation.batteryLevel === null ? '' : String(evaluation.batteryLevel));
  const [opened, setOpened] = useState<boolean | null>(evaluation.opened);
  const [cracked, setCracked] = useState<boolean | null>(evaluation.cracked);
  const [notes, setNotes] = useState(evaluation.evaluationNotes);
  const [price, setPrice] = useState(evaluation.suggestedPrice ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (opened === null || cracked === null) return setError('Marque se o aparelho já foi aberto e se está quebrado/trincado.');
    if (!(price > 0)) return setError('Informe o preço sugerido.');
    setBusy(true);
    setError('');
    try {
      await apiEvaluateTrade(evaluation.id, {
        batteryLevel: battery === '' ? null : Math.max(0, Math.min(100, Math.round(Number(battery)))),
        opened,
        cracked,
        notes: notes.trim(),
        suggestedPrice: price,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a avaliação.');
    } finally {
      setBusy(false);
    }
  };

  const yesNo = (name: string, value: boolean | null, set: (value: boolean) => void, legend: string) => (
    <fieldset>
      <legend>{legend}</legend>
      <label className="trade-eval__choice">
        <input type="radio" name={name} checked={value === true} onChange={() => set(true)} /> Sim
      </label>
      <label className="trade-eval__choice">
        <input type="radio" name={name} checked={value === false} onChange={() => set(false)} /> Não
      </label>
    </fieldset>
  );

  return (
    <QuickModal
      title="Avaliação de produto"
      subtitle={`${evaluation.deviceName} · cliente ${evaluation.customerName || '—'} · IMEI ${evaluation.imei}`}
      submitLabel={evaluation.status === 'evaluated' ? 'Corrigir avaliação' : 'Concluir avaliação'}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="trade-eval-form">
        {evaluation.requestNotes ? (
          <p className="is-wide">
            <small>Vendedor: {evaluation.requestNotes}</small>
          </p>
        ) : null}
        <label>
          <span className="admin-label">Bateria (%)</span>
          <input className="admin-input" type="number" min={0} max={100} inputMode="numeric" placeholder="Ex.: 87" value={battery} onChange={(e) => setBattery(e.target.value)} autoFocus />
        </label>
        {yesNo('opened', opened, setOpened, 'Já foi aberto?')}
        {yesNo('cracked', cracked, setCracked, 'Quebrado / trincado?')}
        <label className="is-wide">
          <span className="admin-label">Observação</span>
          <textarea className="admin-input" rows={2} maxLength={1000} placeholder="Ex.: tela paralela, Face ID ok, riscos na lateral" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="is-wide">
          <span className="admin-label">Preço sugerido (R$)</span>
          <CurrencyInput className="admin-input" value={price} placeholder="Ex.: 1.500,00" onChange={setPrice} ariaLabel="Preço sugerido" />
        </label>
      </div>
    </QuickModal>
  );
}
