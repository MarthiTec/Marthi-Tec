import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { refreshWorkOrders } from '../../data/erpBootstrap';
import {
  REPAIR_STATUS,
  apiConvertRepairRequest,
  apiListRepairRequests,
  apiListRepairServices,
  apiUpdateRepairRequest,
  repairMoney,
  type RepairEvaluation,
  type RepairItem,
  type RepairRequest,
  type RepairService,
  type RepairStatus,
} from '../../services/repairsApi';
import { useOsBase } from './osPaths';
import './repairs.css';

export { REPAIRS_CHANGED as REPAIRS_CHANGED_EVENT } from './RepairRequestsBadge';
import { REPAIRS_CHANGED as REPAIRS_CHANGED_EVENT } from './RepairRequestsBadge';
const statusOf = (value: RepairStatus) => REPAIR_STATUS.find((status) => status.value === value) ?? REPAIR_STATUS[0];
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const itemLabel = (item: RepairItem) => `${item.name}${item.optionName ? ` — ${item.optionName}` : ''}`;
const whatsapp = (phone: string, text: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}?text=${encodeURIComponent(text)}` : '';
};
const OPEN_STATUSES = 'pending,awaiting_device,evaluating,awaiting_approval';

/**
 * Solicitações de orçamento (módulo de OS): o que os clientes pediram pelo catálogo digital. A equipe
 * analisa, recebe o aparelho, faz a avaliação presencial e, com a aprovação do cliente, abre a OS.
 */
export function RepairRequestsPage() {
  const navigate = useNavigate();
  const osBase = useOsBase();
  const [requests, setRequests] = useState<RepairRequest[]>([]);
  const [services, setServices] = useState<RepairService[]>([]);
  const [filter, setFilter] = useState<string>(OPEN_STATUSES);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([apiListRepairRequests({ q: query.trim() || undefined }), apiListRepairServices().catch(() => [] as RepairService[])])
      .then(([list, catalog]) => {
        setRequests(list);
        setServices(catalog);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar as solicitações.'))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const refresh = () => load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
    const poll = window.setInterval(() => !document.hidden && load(), 60_000);
    return () => {
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
      window.clearInterval(poll);
    };
  }, [load]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const request of requests) map[request.status] = (map[request.status] ?? 0) + 1;
    return map;
  }, [requests]);
  const visible = useMemo(() => {
    const wanted = new Set(filter.split(','));
    return requests.filter((request) => !filter || wanted.has(request.status));
  }, [requests, filter]);
  const current = requests.find((request) => request.id === openId) ?? null;

  const replace = (updated: RepairRequest) => {
    setRequests((list) => list.map((item) => (item.id === updated.id ? updated : item)));
    window.dispatchEvent(new Event(REPAIRS_CHANGED_EVENT));
  };

  const chips: Array<[string, string, number]> = [
    [OPEN_STATUSES, 'Em aberto', OPEN_STATUSES.split(',').reduce((sum, status) => sum + (counts[status] ?? 0), 0)],
    ...REPAIR_STATUS.map((status) => [status.value, status.label, counts[status.value] ?? 0] as [string, string, number]),
    ['', 'Todas', requests.length],
  ];

  return (
    <section className="admin-page repairs">
      <header className="repairs__head">
        <div>
          <p className="repairs__muted">Pedidos de manutenção feitos pelo catálogo digital. Nada vira OS sozinho: receba o aparelho, avalie, confirme valores e prazo com o cliente e abra a OS.</p>
        </div>
      </header>
      <div className="repairs__chips" role="group" aria-label="Filtrar por situação">
        {chips.map(([value, label, count]) => (
          <button key={label} type="button" className={filter === value ? 'is-on' : ''} onClick={() => setFilter(value)}>
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      <input type="search" className="admin-input repairs__search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar protocolo, cliente, WhatsApp ou aparelho…" aria-label="Buscar solicitação" />
      {error ? <p role="alert" className="repairs__error">{error}</p> : null}

      <div className={`repairs__queue${current ? ' has-detail' : ''}`}>
        <ul className="repairs__list">
          {loading && !requests.length ? <li className="repairs__muted">Carregando…</li> : null}
          {!loading && !visible.length ? <li className="repairs__empty">Nenhuma solicitação aqui.</li> : null}
          {visible.map((request) => {
            const status = statusOf(request.status);
            return (
              <li key={request.id}>
                <button type="button" className={`repairs__card${request.id === openId ? ' is-open' : ''}`} onClick={() => setOpenId(request.id)}>
                  <span className="repairs__card-top">
                    <strong>{request.protocol}</strong>
                    {request.status === 'pending' ? <em className="repairs__new">Nova</em> : null}
                    <span className="repairs__badge" style={{ ['--tone' as string]: status.tone }}>
                      {status.label}
                    </span>
                  </span>
                  <span className="repairs__card-main">
                    <b>{request.customerName}</b> · {request.brand} {request.model}
                  </span>
                  <small>
                    {request.items.length ? request.items.map(itemLabel).join(', ') : 'Sem serviço escolhido — ver relato'} · {request.estimatedTotal > 0 ? repairMoney(request.estimatedTotal) : 'Valor a avaliar'}
                    {request.hasEvaluation && request.estimatedTotal > 0 ? ' + avaliação' : ''} · {when(request.createdAt)}
                  </small>
                </button>
              </li>
            );
          })}
        </ul>
        {current ? (
          <RepairRequestDetail
            key={current.id}
            request={current}
            services={services.filter((service) => service.brand === current.brand && service.model === current.model && service.active)}
            onChange={replace}
            onClose={() => setOpenId(null)}
            onOpenOrder={(id) => void refreshWorkOrders().catch(() => undefined).then(() => navigate(`${osBase}/${id}`))}
          />
        ) : null}
      </div>
    </section>
  );
}

function RepairRequestDetail({
  request,
  services,
  onChange,
  onClose,
  onOpenOrder,
}: {
  request: RepairRequest;
  services: RepairService[];
  onChange: (request: RepairRequest) => void;
  onClose: () => void;
  onOpenOrder: (workOrderId: string) => void;
}) {
  const saved = request.evaluation ?? {};
  const [evaluation, setEvaluation] = useState<RepairEvaluation>(() => ({
    customer: { name: saved.customer?.name ?? request.customerName, phone: saved.customer?.phone ?? request.customerPhone, document: saved.customer?.document ?? '', address: saved.customer?.address ?? '' },
    device: { ...saved.device },
    diagnosis: { reported: saved.diagnosis?.reported ?? request.description, found: saved.diagnosis?.found ?? '', risks: saved.diagnosis?.risks ?? '' },
    items: saved.items ?? request.items.map((item) => ({ ...item })),
    finalTotal: saved.finalTotal ?? null,
    eta: saved.eta ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [approvalMethod, setApprovalMethod] = useState<'presencial' | 'whatsapp' | 'ligacao' | 'assinatura'>('presencial');
  const [approvalNote, setApprovalNote] = useState('');
  const [adding, setAdding] = useState('');
  const status = statusOf(request.status);
  const closed = request.status === 'converted' || request.status === 'cancelled';
  const evaluating = request.status === 'evaluating' || request.status === 'awaiting_approval';
  const items = evaluation.items ?? [];
  const itemsTotal = items.reduce((sum, item) => sum + (item.price ?? 0), 0);
  const total = evaluation.finalTotal ?? itemsTotal;
  /** Custo dos serviços (cadastro do Catálogo de manutenções) — só a loja vê. */
  const costTotal = items.reduce((sum, item) => sum + (item.cost ?? 0), 0);
  const hasCost = items.some((item) => item.cost !== null && item.cost !== undefined);

  const setPart = <K extends 'customer' | 'device' | 'diagnosis'>(key: K, patch: NonNullable<RepairEvaluation[K]>) =>
    setEvaluation((value) => ({ ...value, [key]: { ...(value[key] as object), ...patch } }));
  const setItem = (index: number, patch: Partial<RepairItem>) => setEvaluation((value) => ({ ...value, items: (value.items ?? []).map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  const addChoices = services.flatMap((service) => {
    const options = service.options.filter((option) => option.active !== false);
    return options.length
      ? options.map((option) => ({ value: `${service.id}|${option.id}`, label: `${service.name} — ${option.name}`, hint: option.price === null ? 'sob avaliação' : repairMoney(option.price) }))
      : [{ value: `${service.id}|`, label: service.name, hint: service.price === null ? 'sob avaliação' : repairMoney(service.price) }];
  });
  function addService(value: string) {
    if (!value) return;
    if (value === '__free') {
      setEvaluation((current) => ({ ...current, items: [...(current.items ?? []), { serviceId: null, name: 'Serviço', optionName: '', price: 0 }] }));
      setAdding('');
      return;
    }
    const [serviceId, optionId] = value.split('|');
    const service = services.find((entry) => entry.id === serviceId);
    if (!service) return;
    const option = service.options.find((entry) => entry.id === optionId);
    setEvaluation((current) => ({
      ...current,
      items: [...(current.items ?? []), { serviceId, name: service.name, optionId: option?.id ?? null, optionName: option?.name ?? '', stockItemId: option?.stockItemId ?? null, price: option ? option.price : service.price, cost: option ? option.cost ?? null : service.cost }],
    }));
    setAdding('');
  }

  async function update(body: { status?: RepairStatus; note?: string; evaluation?: RepairEvaluation }, message: string) {
    setBusy(true);
    setError('');
    try {
      const updated = await apiUpdateRepairRequest(request.id, body);
      onChange(updated);
      setNotice(message);
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
      return null;
    } finally {
      setBusy(false);
    }
  }
  const cleanEvaluation = (): RepairEvaluation => ({ ...evaluation, items: items.filter((item) => item.name.trim()) });

  async function convert() {
    if (!window.confirm(`Abrir a OS de ${request.brand} ${request.model} para ${evaluation.customer?.name || request.customerName} no valor de ${repairMoney(total)}?`)) return;
    const savedNow = await update({ evaluation: cleanEvaluation() }, 'Avaliação salva.');
    if (!savedNow) return;
    setBusy(true);
    try {
      const done = await apiConvertRepairRequest(request.id, { approvalMethod, approvalNote });
      onChange(done.request);
      // A OS nasceu no servidor: atualiza a lista da oficina antes de abrir a ficha dela.
      await refreshWorkOrders().catch(() => undefined);
      onOpenOrder(done.workOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a OS.');
    } finally {
      setBusy(false);
    }
  }

  const wa = whatsapp(request.customerPhone, `Olá, ${request.customerName.split(' ')[0]}! Recebemos sua solicitação de manutenção ${request.protocol} (${request.brand} ${request.model}).`);
  return (
    <aside className="repairs__detail" aria-label={`Solicitação ${request.protocol}`}>
      <header className="repairs__detail-head">
        <div>
          <small>{request.origin} · {when(request.createdAt)}</small>
          <h3>
            {request.protocol} <span className="repairs__badge" style={{ ['--tone' as string]: status.tone }}>{status.label}</span>
          </h3>
        </div>
        <button type="button" className="repairs__close" onClick={onClose} aria-label="Fechar solicitação">
          ×
        </button>
      </header>
      {error ? <p role="alert" className="repairs__error">{error}</p> : null}
      {notice ? <p role="status" className="repairs__notice">{notice}</p> : null}

      <section className="repairs__box">
        <h4>Solicitado pelo cliente</h4>
        <p>
          <b>{request.customerName}</b> · {request.customerPhone}
          {request.customerId ? <em className="repairs__tag">já é cliente</em> : null}
          {wa ? (
            <a className="repairs__wa" href={wa} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          ) : null}
        </p>
        <p>
          Aparelho: <b>{request.brand} {request.model}</b>
        </p>
        {request.items.length ? (
          <ul className="repairs__items">
            {request.items.map((item, index) => (
              <li key={index}>
                <span>{itemLabel(item)}</span>
                <b>{item.price === null ? 'Sob avaliação' : repairMoney(item.price)}</b>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="repairs__total">
          Estimativa: <b>{request.estimatedTotal > 0 ? repairMoney(request.estimatedTotal) : 'a avaliar'}</b>
          {request.hasEvaluation && request.estimatedTotal > 0 ? ' + itens sob avaliação' : ''}
        </p>
        {request.description ? <blockquote>{request.description}</blockquote> : null}
      </section>

      {request.status === 'converted' && request.workOrderId ? (
        <section className="repairs__box repairs__box--ok">
          <h4>Convertida em OS</h4>
          <p>
            OS <b>{request.workOrderId}</b>
            {request.convertedAt ? ` · ${when(request.convertedAt)}` : ''}
            {request.evaluation?.approval ? ` · aprovação: ${request.evaluation.approval.method}` : ''}
          </p>
          <button type="button" className="btn btn--primary" onClick={() => onOpenOrder(request.workOrderId!)}>
            Abrir a OS
          </button>
        </section>
      ) : null}

      {!closed ? (
        <div className="repairs__steps">
          {request.status === 'pending' ? (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void update({ status: 'awaiting_device' }, 'Aguardando o cliente trazer o aparelho.')}>
              Aguardar aparelho
            </button>
          ) : null}
          {!evaluating ? (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void update({ status: 'evaluating' }, 'Avaliação presencial iniciada.')}>
              Iniciar avaliação presencial
            </button>
          ) : null}
          {request.status === 'evaluating' ? (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void update({ status: 'awaiting_approval', evaluation: cleanEvaluation() }, 'Aguardando a aprovação do cliente.')}>
              Enviar para aprovação
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost repairs__danger"
            disabled={busy}
            onClick={() => {
              const reason = window.prompt('Motivo do cancelamento (opcional):') ?? null;
              if (reason !== null) void update({ status: 'cancelled', note: reason || 'Cancelada' }, 'Solicitação cancelada.');
            }}
          >
            Cancelar
          </button>
        </div>
      ) : request.status === 'cancelled' ? (
        <div className="repairs__steps">
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void update({ status: 'pending', note: 'Reaberta' }, 'Solicitação reaberta.')}>
            Reabrir solicitação
          </button>
        </div>
      ) : null}

      {evaluating ? (
        <>
          <section className="repairs__box">
            <h4>Cliente</h4>
            <div className="repairs__grid">
              <label>
                Nome
                <input value={evaluation.customer?.name ?? ''} onChange={(e) => setPart('customer', { name: e.target.value })} />
              </label>
              <label>
                WhatsApp
                <input value={evaluation.customer?.phone ?? ''} inputMode="tel" onChange={(e) => setPart('customer', { phone: e.target.value })} />
              </label>
              <label>
                CPF (se precisar)
                <input value={evaluation.customer?.document ?? ''} inputMode="numeric" onChange={(e) => setPart('customer', { document: e.target.value })} />
              </label>
              <label>
                Endereço (se precisar)
                <input value={evaluation.customer?.address ?? ''} onChange={(e) => setPart('customer', { address: e.target.value })} />
              </label>
            </div>
          </section>
          <section className="repairs__box">
            <h4>Aparelho</h4>
            <div className="repairs__grid">
              <label>
                Cor
                <input value={evaluation.device?.color ?? ''} onChange={(e) => setPart('device', { color: e.target.value })} />
              </label>
              <label>
                Armazenamento
                <input value={evaluation.device?.capacity ?? ''} placeholder="Ex.: 256GB" onChange={(e) => setPart('device', { capacity: e.target.value })} />
              </label>
              <label>
                IMEI / número de série
                <input value={evaluation.device?.imei ?? ''} onChange={(e) => setPart('device', { imei: e.target.value })} />
              </label>
              <label>
                Estado físico
                <input value={evaluation.device?.physicalState ?? ''} onChange={(e) => setPart('device', { physicalState: e.target.value })} />
              </label>
              <label>
                Tela
                <input value={evaluation.device?.screen ?? ''} placeholder="Ex.: trincada, manchas" onChange={(e) => setPart('device', { screen: e.target.value })} />
              </label>
              <label>
                Carcaça
                <input value={evaluation.device?.body ?? ''} onChange={(e) => setPart('device', { body: e.target.value })} />
              </label>
              <label className="repairs__wide">
                Acessórios entregues
                <input value={evaluation.device?.accessories ?? ''} placeholder="Ex.: capinha, chip" onChange={(e) => setPart('device', { accessories: e.target.value })} />
              </label>
              <label className="repairs__wide">
                Observações técnicas
                <textarea rows={2} value={evaluation.device?.techNotes ?? ''} onChange={(e) => setPart('device', { techNotes: e.target.value })} />
              </label>
            </div>
          </section>
          <section className="repairs__box">
            <h4>Diagnóstico</h4>
            <div className="repairs__grid">
              <label className="repairs__wide">
                Defeito relatado pelo cliente
                <textarea rows={2} value={evaluation.diagnosis?.reported ?? ''} onChange={(e) => setPart('diagnosis', { reported: e.target.value })} />
              </label>
              <label className="repairs__wide">
                Defeito identificado na avaliação
                <textarea rows={2} value={evaluation.diagnosis?.found ?? ''} onChange={(e) => setPart('diagnosis', { found: e.target.value })} />
              </label>
              <label className="repairs__wide">
                Riscos e condições do aparelho
                <textarea rows={2} value={evaluation.diagnosis?.risks ?? ''} onChange={(e) => setPart('diagnosis', { risks: e.target.value })} />
              </label>
            </div>
          </section>
          <section className="repairs__box">
            <h4>Serviços e peças que serão feitos</h4>
            <ul className="repairs__final">
              {items.map((item, index) => (
                <li key={index}>
                  <input value={item.name} aria-label={`Serviço ${index + 1}`} onChange={(e) => setItem(index, { name: e.target.value })} />
                  <input value={item.optionName ?? ''} placeholder="Peça / qualidade" aria-label={`Peça do serviço ${index + 1}`} onChange={(e) => setItem(index, { optionName: e.target.value })} />
                  {item.price === null ? (
                    <button type="button" className="repairs__eval" onClick={() => setItem(index, { price: 0 })}>
                      Definir valor
                    </button>
                  ) : (
                    <CurrencyInput value={item.price} ariaLabel={`Valor de ${item.name}`} onChange={(price) => setItem(index, { price })} />
                  )}
                  <button type="button" className="repairs__drop" aria-label={`Tirar ${item.name}`} onClick={() => setEvaluation((value) => ({ ...value, items: items.filter((_, i) => i !== index) }))}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <AdminPicker
              label="Adicionar serviço"
              value={adding}
              placeholder="＋ Adicionar serviço do catálogo"
              options={[{ value: '', label: '＋ Adicionar serviço do catálogo' }, ...addChoices, { value: '__free', label: 'Outro serviço (digitar)' }]}
              onChange={addService}
            />
            <div className="repairs__grid">
              <label>
                Valor final
                <CurrencyInput value={total} ariaLabel="Valor final" onChange={(value) => setEvaluation((current) => ({ ...current, finalTotal: value }))} />
                {evaluation.finalTotal !== null && evaluation.finalTotal !== undefined && evaluation.finalTotal !== itemsTotal ? (
                  <button type="button" className="repairs__link" onClick={() => setEvaluation((current) => ({ ...current, finalTotal: null }))}>
                    Usar a soma dos serviços ({repairMoney(itemsTotal)})
                  </button>
                ) : null}
              </label>
              <label>
                Previsão de conclusão
                <input type="datetime-local" value={evaluation.eta ?? ''} onChange={(e) => setEvaluation((current) => ({ ...current, eta: e.target.value }))} />
              </label>
            </div>
            {request.evaluation?.etaHistory?.length ? (
              <small className="repairs__muted">
                Previsões anteriores: {request.evaluation.etaHistory.map((entry) => `${entry.to ? new Date(entry.to).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} (${entry.by || 'equipe'})`).join(' → ')}
              </small>
            ) : null}
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void update({ evaluation: cleanEvaluation() }, 'Avaliação salva.')}>
              Salvar avaliação
            </button>
          </section>

          <section className="repairs__box repairs__box--approve">
            <h4>Confirmação da manutenção</h4>
            <ul className="repairs__summary">
              <li>
                <span>Cliente</span>
                <b>{evaluation.customer?.name || request.customerName}</b>
              </li>
              <li>
                <span>Aparelho</span>
                <b>
                  {request.brand} {request.model}
                  {evaluation.device?.capacity ? ` · ${evaluation.device.capacity}` : ''}
                  {evaluation.device?.color ? ` · ${evaluation.device.color}` : ''}
                </b>
              </li>
              <li>
                <span>Serviços</span>
                <b>{items.length ? items.map(itemLabel).join(', ') : '—'}</b>
              </li>
              <li>
                <span>Valor final</span>
                <b>{repairMoney(total)}</b>
              </li>
              {hasCost ? (
                <li>
                  <span>Custo · margem (interno)</span>
                  <b className={total - costTotal < 0 ? 'repairs__neg' : ''}>
                    {repairMoney(costTotal)} · {repairMoney(total - costTotal)}
                    {total ? ` (${Math.round(((total - costTotal) / total) * 100)}%)` : ''}
                  </b>
                </li>
              ) : null}
              <li>
                <span>Previsão</span>
                <b>{evaluation.eta ? new Date(evaluation.eta).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'a definir'}</b>
              </li>
            </ul>
            <div className="repairs__grid">
              <AdminPicker
                label="Como o cliente aprovou"
                value={approvalMethod}
                options={[
                  { value: 'presencial', label: 'Presencialmente na loja' },
                  { value: 'whatsapp', label: 'Pelo WhatsApp' },
                  { value: 'ligacao', label: 'Por ligação' },
                  { value: 'assinatura', label: 'Assinatura no termo' },
                ]}
                onChange={(value) => setApprovalMethod(value as typeof approvalMethod)}
              />
              <label>
                Observação da aprovação
                <input value={approvalNote} maxLength={400} placeholder="Ex.: confirmou às 14h" onChange={(e) => setApprovalNote(e.target.value)} />
              </label>
            </div>
            <p className="repairs__muted">O orçamento inicial não autoriza o reparo: só abra a OS depois de o cliente aprovar serviços, valor e prazo.</p>
            <button type="button" className="btn btn--primary repairs__convert" disabled={busy || (!items.length && !evaluation.diagnosis?.found)} onClick={() => void convert()}>
              {busy ? 'Abrindo…' : 'Aprovar e abrir Ordem de Serviço'}
            </button>
          </section>
        </>
      ) : null}

      <section className="repairs__box">
        <h4>Histórico</h4>
        <ol className="repairs__history">
          {[...request.history].reverse().map((entry, index) => (
            <li key={index}>
              <time>{when(entry.at)}</time>
              <span>
                {entry.note || (entry.to ? statusOf(entry.to as RepairStatus).label : entry.action)}
                {entry.by ? <small> · {entry.by}</small> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
