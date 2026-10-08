import { useCallback, useEffect, useState } from 'react';
import { QuickModal } from '../../components/QuickModal';
import { nestRequest } from '../../services/nestClient';
import type { PickupMethod } from '../../data/pickup';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import './pickupMethodsPage.css';

type Kind = PickupMethod['kind'];
type Form = { id?: string; name: string; kind: Kind; active: boolean; leadDays: Record<string, number> };
type PickupRequest = {
  id: string;
  customer_name: string;
  product_name: string;
  tracking_token: string;
  method_name: string;
  kind: Kind;
  status: string;
  estimated_date?: string | null;
  address?: { street: string; number: string; city: string; state: string } | null;
};

const KINDS: Array<{ value: Kind; icon: string; label: string; help: string }> = [
  { value: 'immediate', icon: '🛍️', label: 'Comprar e levar', help: 'O cliente sai com o produto na hora (ex.: em mãos, pronta entrega).' },
  { value: 'order', icon: '⏳', label: 'Encomenda', help: 'O produto chega depois, com prazo por dia da semana. Pode ter preço menor.' },
  { value: 'delivery', icon: '🚚', label: 'Entrega no endereço', help: 'A loja leva até o cliente; o endereço é pedido na venda.' },
];
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const STATUS: Record<string, string> = {
  waiting: 'Aguardando',
  ready: 'Disponível para retirada',
  dispatched: 'Saiu para entrega',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};
const defaultLeadDays = () => Object.fromEntries(WEEK.map((_, index) => [String(index), 1])) as Record<string, number>;
const emptyForm = (kind: Kind = 'immediate'): Form => ({ name: '', kind, active: true, leadDays: defaultLeadDays() });
const kindInfo = (kind: Kind) => KINDS.find((item) => item.value === kind) ?? KINDS[0];

function leadSummary(days?: Record<string, number>) {
  if (!days) return '';
  const values = WEEK.map((_, index) => Number(days[String(index)] ?? 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const plural = (n: number) => `${n} dia${n === 1 ? '' : 's'}`;
  return min === max ? `Prazo: ${plural(min)}` : `Prazo: ${plural(min)} a ${plural(max)}`;
}

/** Tipos de retirada da loja (em mãos, encomenda, entrega) e o acompanhamento das retiradas. */
export function PickupMethodsPage() {
  const [methods, setMethods] = useState<PickupMethod[]>([]);
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const reload = useCallback(async () => {
    try {
      const [methodRows, requestRows] = await Promise.all([
        nestRequest<PickupMethod[]>('/pickup-methods'),
        nestRequest<PickupRequest[]>('/pickup-requests'),
      ]);
      setMethods(methodRows);
      setRequests(requestRows);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os tipos de retirada.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const load = () => {
      setLoading(true);
      setForm(null);
      void reload();
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, [reload]);

  function edit(method: PickupMethod) {
    setFormError('');
    setForm({ id: method.id, name: method.name, kind: method.kind, active: method.active, leadDays: method.lead_days ?? defaultLeadDays() });
  }

  function create(kind?: Kind) {
    setFormError('');
    setForm(emptyForm(kind));
  }

  async function persist(next: Form) {
    const body = { name: next.name.trim(), kind: next.kind, active: next.active, ...(next.kind === 'order' ? { leadDays: next.leadDays } : {}) };
    await nestRequest(`/pickup-methods${next.id ? `/${next.id}` : ''}`, { method: next.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
  }

  async function save() {
    if (!form) return;
    if (!form.name.trim()) {
      setFormError('Dê um nome para o tipo de retirada (ex.: Em mãos, Sob encomenda).');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await persist(form);
      setForm(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(method: PickupMethod) {
    try {
      await persist({ id: method.id, name: method.name, kind: method.kind, active: !method.active, leadDays: method.lead_days ?? defaultLeadDays() });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível alterar.');
    }
  }

  async function advance(request: PickupRequest) {
    const status = request.status === 'waiting' ? 'ready' : request.status === 'ready' && request.kind === 'delivery' ? 'dispatched' : 'completed';
    try {
      await nestRequest(`/pickup-requests/${request.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar.');
    }
  }

  const open = requests.filter((request) => !['completed', 'cancelled'].includes(request.status));

  return (
    <section className="admin-page pickup-page">
      <div className="pickup-page__bar">
        <p>
          Cada produto (ou cor/capacidade) escolhe em quais destes tipos é vendido e o preço de cada um. Na venda, o
          vendedor escolhe o tipo de retirada.
        </p>
        <button type="button" className="btn btn--primary" onClick={() => create()}>
          + Novo tipo de retirada
        </button>
      </div>
      {error ? <p role="alert" className="pickup-page__error">{error}</p> : null}

      {loading && methods.length === 0 ? <p className="empty">Carregando…</p> : null}
      {!loading && methods.length === 0 ? (
        <div className="pickup-page__empty">
          <strong>Nenhum tipo de retirada cadastrado.</strong>
          <span>Comece escolhendo como a loja entrega os produtos:</span>
          <div className="pickup-page__kinds">
            {KINDS.map((kind) => (
              <button key={kind.value} type="button" className="pickup-kind" onClick={() => create(kind.value)}>
                <span className="pickup-kind__icon" aria-hidden>{kind.icon}</span>
                <strong>{kind.label}</strong>
                <small>{kind.help}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pickup-cards">
        {methods.map((method) => {
          const info = kindInfo(method.kind);
          return (
            <article key={method.id} className={`pickup-card${method.active ? '' : ' is-off'}`}>
              <span className="pickup-card__icon" aria-hidden>{info.icon}</span>
              <div className="pickup-card__body">
                <strong>{method.name}</strong>
                <span>{info.label}{method.kind === 'order' ? ` · ${leadSummary(method.lead_days)}` : ''}</span>
              </div>
              <span className={`pickup-card__status${method.active ? ' is-on' : ''}`}>{method.active ? 'Ativo' : 'Inativo'}</span>
              <div className="pickup-card__actions">
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => edit(method)}>Editar</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void toggle(method)}>
                  {method.active ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <h3 className="pickup-page__section">Acompanhamento de retiradas e entregas {open.length ? <span>({open.length} em aberto)</span> : null}</h3>
      {requests.length === 0 ? (
        <p className="empty">Nenhuma retirada ou entrega em acompanhamento.</p>
      ) : (
        <div className="pickup-requests">
          {requests.map((request) => {
            const done = ['completed', 'cancelled'].includes(request.status);
            const nextLabel = request.status === 'waiting' ? 'Marcar disponível' : request.status === 'ready' && request.kind === 'delivery' ? 'Saiu para entrega' : 'Concluir';
            return (
              <article key={request.id} className={`pickup-request${done ? ' is-done' : ''}`}>
                <div className="pickup-request__main">
                  <strong>{request.customer_name}</strong>
                  <span>{request.product_name}</span>
                  <a href={`/acompanhar-retirada/${request.tracking_token}`} target="_blank" rel="noreferrer">Link para o cliente</a>
                </div>
                <div className="pickup-request__meta">
                  <span>{request.method_name}</span>
                  <span>
                    {request.address
                      ? `${request.address.street}, ${request.address.number} · ${request.address.city}/${request.address.state}`
                      : 'Retirada na loja'}
                  </span>
                  {request.estimated_date ? (
                    <span>Previsão: {new Date(`${String(request.estimated_date).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR')}</span>
                  ) : null}
                </div>
                <span className={`pickup-request__status is-${request.status}`}>{STATUS[request.status] ?? request.status}</span>
                {!done ? (
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => void advance(request)}>{nextLabel}</button>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {form ? (
        <QuickModal
          title={form.id ? 'Editar tipo de retirada' : 'Novo tipo de retirada'}
          subtitle="O nome aparece para o vendedor e no totem."
          busy={saving}
          error={formError}
          onClose={() => setForm(null)}
          onSubmit={save}
        >
          <label>
            <span>Nome</span>
            <input value={form.name} maxLength={80} placeholder="Ex.: Em mãos, Sob encomenda, Entrega" onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <div className="pickup-kinds-pick" role="radiogroup" aria-label="Como funciona">
            {KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                role="radio"
                aria-checked={form.kind === kind.value}
                className={`pickup-kind${form.kind === kind.value ? ' is-selected' : ''}`}
                onClick={() => setForm({ ...form, kind: kind.value })}
              >
                <span className="pickup-kind__icon" aria-hidden>{kind.icon}</span>
                <strong>{kind.label}</strong>
                <small>{kind.help}</small>
              </button>
            ))}
          </div>
          {form.kind === 'order' ? (
            <fieldset className="pickup-lead">
              <legend>Prazo de chegada (dias), conforme o dia da venda</legend>
              <div className="pickup-lead__grid">
                {WEEK.map((day, index) => (
                  <label key={day}>
                    <span>{day}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={90}
                      value={form.leadDays[String(index)] ?? 0}
                      onChange={(event) => setForm({ ...form, leadDays: { ...form.leadDays, [String(index)]: Math.max(0, Math.min(90, Number(event.target.value) || 0)) } })}
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setForm({ ...form, leadDays: Object.fromEntries(WEEK.map((_, index) => [String(index), form.leadDays['1'] ?? 1])) })}
              >
                Usar o prazo de segunda para todos os dias
              </button>
            </fieldset>
          ) : null}
          <label className="quick-modal__check">
            <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
            Ativo (aparece na venda e no cadastro de produtos)
          </label>
        </QuickModal>
      ) : null}
    </section>
  );
}
