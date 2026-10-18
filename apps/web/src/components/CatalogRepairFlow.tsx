import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  apiPublicRepairServices,
  apiPublicSendRepair,
  apiPublicTrackRepair,
  repairDuration,
  repairMoney,
  type PublicRepairService,
  type RepairTracking,
} from '../services/repairsApi';
import { whatsappLink, type CatalogStore } from './CatalogDocument';
import './catalogRepair.css';

const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};
const newKey = () => `rep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const servicePrice = (service: PublicRepairService) => {
  if (service.options.length) {
    const prices = service.options.map((option) => option.price).filter((price): price is number => price !== null);
    return prices.length ? `a partir de ${repairMoney(Math.min(...prices))}` : 'Valor sob avaliação';
  }
  return service.price === null ? 'Valor sob avaliação' : repairMoney(service.price);
};

type Choice = { serviceId: string; optionId: string | null };

/**
 * "Solicitar manutenção" no catálogo digital: o cliente escolhe o aparelho e os serviços cadastrados
 * pela loja, conta o problema e envia. Gera um protocolo; a loja recebe na fila da OS (não vira venda).
 */
export function CatalogRepairFlow({
  token,
  brands,
  store,
  accent,
  initialView = 'form',
}: {
  initialView?: 'form' | 'track';
  token: string;
  brands: Array<{ brand: string; models: string[] }>;
  store: CatalogStore;
  accent: string;
}) {
  const [view, setView] = useState<'form' | 'track'>(initialView);
  const [brand, setBrand] = useState(brands.length === 1 ? brands[0].brand : '');
  const [model, setModel] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const [services, setServices] = useState<PublicRepairService[] | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ protocol: string; estimatedTotal: number; hasEvaluation: boolean } | null>(null);
  const requestKey = useRef(newKey());
  const servicesRef = useRef<HTMLElement>(null);
  const style = { '--cat-accent': accent || '#e4572e' } as CSSProperties;

  const models = useMemo(() => {
    const list = brands.find((entry) => entry.brand === brand)?.models ?? [];
    const term = modelQuery.trim().toLowerCase();
    return term ? list.filter((entry) => entry.toLowerCase().includes(term)) : list;
  }, [brands, brand, modelQuery]);

  useEffect(() => {
    if (!brand || !model) {
      setServices(null);
      return;
    }
    let alive = true;
    setServices(null);
    setChoices([]);
    apiPublicRepairServices(token, brand, model)
      .then((list) => {
        if (!alive) return;
        setServices(list);
        window.setTimeout(() => servicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : 'Não foi possível carregar os serviços.'));
    return () => {
      alive = false;
    };
  }, [token, brand, model]);

  const chosen = choices.map((choice) => {
    const service = services?.find((entry) => entry.id === choice.serviceId);
    const option = service?.options.find((entry) => entry.id === choice.optionId) ?? null;
    return { choice, service, option, price: service ? (service.options.length ? (option ? option.price : undefined) : service.price) : undefined };
  });
  const missingOption = chosen.some((entry) => entry.service && entry.service.options.length && !entry.option);
  const total = chosen.reduce((sum, entry) => sum + (typeof entry.price === 'number' ? entry.price : 0), 0);
  const anyEvaluation = chosen.some((entry) => entry.price === null);
  const longest = Math.max(0, ...chosen.map((entry) => entry.service?.estimatedMinutes ?? 0));
  const phoneOk = phone.replace(/\D/g, '').length >= 10;
  const canSend = Boolean(model) && (choices.length > 0 || description.trim().length >= 10) && !missingOption && name.trim().length >= 3 && phoneOk;

  function toggle(service: PublicRepairService) {
    setChoices((list) =>
      list.some((entry) => entry.serviceId === service.id)
        ? list.filter((entry) => entry.serviceId !== service.id)
        : [...list, { serviceId: service.id, optionId: service.options.length === 1 ? service.options[0].id : null }],
    );
  }
  const pickOption = (serviceId: string, optionId: string) => setChoices((list) => list.map((entry) => (entry.serviceId === serviceId ? { ...entry, optionId } : entry)));

  async function send() {
    if (!canSend || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await apiPublicSendRepair(token, {
        requestKey: requestKey.current,
        brand,
        model,
        items: choices.map((choice) => ({ serviceId: choice.serviceId, optionId: choice.optionId })),
        description: description.trim(),
        customer: { name: name.trim(), phone },
        website,
      });
      setDone(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar agora. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    requestKey.current = newKey();
    setDone(null);
    setChoices([]);
    setDescription('');
    setModel('');
    setError('');
  }

  if (view === 'track') return <RepairTrack token={token} style={style} onBack={() => setView('form')} />;

  if (done) {
    const wa = whatsappLink(store.phone, `Olá! Enviei a solicitação de manutenção ${done.protocol} (${brand} ${model}) pelo catálogo da ${store.name || 'loja'}.`);
    return (
      <section className="repairflow repairflow--done" style={style}>
        <span className="repairflow__ok" aria-hidden>
          ✓
        </span>
        <h2>Orçamento enviado!</h2>
        <p className="repairflow__protocol">
          Protocolo <strong>{done.protocol}</strong>
        </p>
        <p>
          {brand} {model} · {done.estimatedTotal > 0 ? `estimativa ${repairMoney(done.estimatedTotal)}` : 'valor a confirmar'}
          {done.hasEvaluation && done.estimatedTotal > 0 ? ' + itens sob avaliação' : ''}
        </p>
        <p className="repairflow__notice">Os valores apresentados são estimativas e estão sujeitos à avaliação técnica presencial. Nossa equipe irá confirmar os serviços e os prazos antes de iniciar qualquer manutenção.</p>
        {wa ? (
          <a className="repairflow__wa" href={wa} target="_blank" rel="noreferrer">
            Falar com a loja no WhatsApp
          </a>
        ) : null}
        <button type="button" className="repairflow__ghost" onClick={() => setView('track')}>
          Acompanhar pelo protocolo
        </button>
        <button type="button" className="repairflow__ghost" onClick={restart}>
          Nova solicitação
        </button>
      </section>
    );
  }

  return (
    <section className="repairflow" style={style} aria-label="Solicitar orçamento de manutenção">
      <header className="repairflow__head">
        <div>
          <h2>Orçamento de manutenção</h2>
          <p>Escolha o aparelho e o que precisa — a loja confirma tudo na avaliação presencial.</p>
        </div>
        <button type="button" className="repairflow__link" onClick={() => setView('track')}>
          Já enviei: acompanhar
        </button>
      </header>

      <section className="repairflow__card">
        <h3>
          <span>1</span> Selecione seu aparelho
        </h3>
        {brands.length > 1 ? (
          <div className="repairflow__chips" role="radiogroup" aria-label="Marca">
            {brands.map((entry) => (
              <button
                key={entry.brand}
                type="button"
                role="radio"
                aria-checked={brand === entry.brand}
                className={brand === entry.brand ? 'is-on' : ''}
                onClick={() => {
                  setBrand(entry.brand);
                  setModel('');
                  setModelQuery('');
                }}
              >
                {entry.brand}
              </button>
            ))}
          </div>
        ) : null}
        {brand ? (
          <>
            {(brands.find((entry) => entry.brand === brand)?.models.length ?? 0) > 6 ? (
              <input className="repairflow__input" type="search" value={modelQuery} onChange={(e) => setModelQuery(e.target.value)} placeholder="Buscar modelo…" aria-label="Buscar modelo" />
            ) : null}
            <div className="repairflow__models" role="radiogroup" aria-label="Modelo">
              {models.map((entry) => (
                <button key={entry} type="button" role="radio" aria-checked={model === entry} className={model === entry ? 'is-on' : ''} onClick={() => setModel(entry)}>
                  {entry}
                </button>
              ))}
              {!models.length ? <p className="repairflow__muted">Nenhum modelo com esse nome. Conte o problema abaixo que a loja avalia.</p> : null}
            </div>
          </>
        ) : (
          <p className="repairflow__muted">Escolha a marca.</p>
        )}
      </section>

      {model ? (
        <section className="repairflow__card" ref={servicesRef}>
          <h3>
            <span>2</span> Qual manutenção você precisa?
          </h3>
          {services === null ? <p className="repairflow__muted">Carregando serviços…</p> : null}
          {services && !services.length ? <p className="repairflow__muted">A loja ainda não cadastrou serviços para este modelo. Conte o problema abaixo que avaliamos para você.</p> : null}
          <ul className="repairflow__services">
            {services?.map((service) => {
              const choice = choices.find((entry) => entry.serviceId === service.id);
              return (
                <li key={service.id} className={choice ? 'is-on' : ''}>
                  <button type="button" className="repairflow__service" aria-pressed={Boolean(choice)} onClick={() => toggle(service)}>
                    <span className="repairflow__check" aria-hidden>
                      {choice ? '✓' : ''}
                    </span>
                    <span className="repairflow__service-text">
                      <strong>{service.name}</strong>
                      {service.description ? <small>{service.description}</small> : null}
                    </span>
                    <span className="repairflow__service-price">
                      <b>{servicePrice(service)}</b>
                      {service.estimatedMinutes ? <small>⏱ {repairDuration(service.estimatedMinutes)}</small> : null}
                    </span>
                  </button>
                  {choice && service.options.length ? (
                    <div className="repairflow__options" role="radiogroup" aria-label={`Opções de ${service.name}`}>
                      {service.options.map((option) => (
                        <button key={option.id} type="button" role="radio" aria-checked={choice.optionId === option.id} className={choice.optionId === option.id ? 'is-on' : ''} onClick={() => pickOption(service.id, option.id)}>
                          <span>{option.name}</span>
                          <b>{option.price === null ? 'sob avaliação' : repairMoney(option.price)}</b>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {model ? (
        <>
          <section className="repairflow__card">
            <h3>
              <span>3</span> Conte o que está acontecendo
            </h3>
            <textarea className="repairflow__input" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Meu celular caiu, a tela ficou verde e o touch parou de funcionar." />
          </section>
          <section className="repairflow__card">
            <h3>
              <span>4</span> Seus dados
            </h3>
            <label className="repairflow__field">
              Nome completo
              <input className="repairflow__input" value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="repairflow__field">
              WhatsApp com DDD
              <input className="repairflow__input" value={phone} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000" onChange={(e) => setPhone(formatPhone(e.target.value))} />
            </label>
            <input className="repairflow__hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />
            <p className="repairflow__muted">Não pedimos IMEI, senha nem documento agora — isso fica para o atendimento na loja.</p>
          </section>
          <section className="repairflow__card repairflow__summary">
            <h3>Resumo da solicitação</h3>
            <p>
              <b>
                {brand} {model}
              </b>
            </p>
            {chosen.length ? (
              <ul>
                {chosen.map((entry) => (
                  <li key={entry.choice.serviceId}>
                    <span>
                      {entry.service?.name}
                      {entry.option ? ` — ${entry.option.name}` : entry.service?.options.length ? ' — escolha a opção' : ''}
                    </span>
                    <b>{entry.price === undefined ? '—' : entry.price === null ? 'sob avaliação' : repairMoney(entry.price)}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="repairflow__muted">Nenhum serviço escolhido — a loja avalia pelo seu relato.</p>
            )}
            <p className="repairflow__total">
              <span>
                {chosen.length} {chosen.length === 1 ? 'serviço' : 'serviços'}
                {longest ? ` · prazo estimado ${repairDuration(longest)}` : ''}
              </span>
              <strong>{total > 0 ? repairMoney(total) : 'Valor a consultar'}</strong>
            </p>
            {anyEvaluation ? <p className="repairflow__muted">Itens “sob avaliação” têm o valor confirmado pela loja depois do diagnóstico.</p> : null}
            {error ? <p className="repairflow__error" role="alert">{error}</p> : null}
            <button type="button" className="repairflow__send" disabled={!canSend || busy} onClick={() => void send()}>
              {busy ? 'Enviando…' : 'Enviar solicitação de orçamento →'}
            </button>
            {!canSend ? (
              <p className="repairflow__muted">
                {missingOption ? 'Escolha a peça/qualidade dos serviços marcados.' : !choices.length && description.trim().length < 10 ? 'Escolha um serviço ou conte o problema.' : name.trim().length < 3 ? 'Informe seu nome.' : !phoneOk ? 'Informe o WhatsApp com DDD.' : ''}
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </section>
  );
}

/** Acompanhamento pelo protocolo + WhatsApp. */
function RepairTrack({ token, style, onBack }: { token: string; style: CSSProperties; onBack: () => void }) {
  const [protocol, setProtocol] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RepairTracking | null>(null);
  async function look() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await apiPublicTrackRepair(token, protocol.trim(), phone));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não encontramos essa solicitação.');
    } finally {
      setBusy(false);
    }
  }
  const steps = ['Recebida', 'Na loja', 'Em manutenção', 'Pronto para retirada'];
  const step = !result
    ? 0
    : result.workOrder
      ? result.workOrder.status === 'ready' || result.workOrder.status === 'delivered'
        ? 3
        : result.workOrder.status === 'progress' || result.workOrder.status === 'waiting'
          ? 2
          : 1
      : result.status === 'pending' || result.status === 'awaiting_device'
        ? 0
        : 1;
  return (
    <section className="repairflow" style={style} aria-label="Acompanhar manutenção">
      <header className="repairflow__head">
        <div>
          <h2>Acompanhar manutenção</h2>
          <p>Use o protocolo recebido e o WhatsApp informado na solicitação.</p>
        </div>
        <button type="button" className="repairflow__link" onClick={onBack}>
          ← Nova solicitação
        </button>
      </header>
      <section className="repairflow__card">
        <label className="repairflow__field">
          Protocolo
          <input className="repairflow__input" value={protocol} placeholder="MNT-00001" onChange={(e) => setProtocol(e.target.value.toUpperCase())} />
        </label>
        <label className="repairflow__field">
          WhatsApp com DDD
          <input className="repairflow__input" value={phone} inputMode="tel" placeholder="(00) 00000-0000" onChange={(e) => setPhone(formatPhone(e.target.value))} />
        </label>
        {error ? <p className="repairflow__error" role="alert">{error}</p> : null}
        <button type="button" className="repairflow__send" disabled={busy || protocol.trim().length < 5 || phone.replace(/\D/g, '').length < 10} onClick={() => void look()}>
          {busy ? 'Consultando…' : 'Consultar'}
        </button>
      </section>
      {result ? (
        <section className="repairflow__card">
          <h3>
            {result.protocol} · {result.device}
          </h3>
          <p className="repairflow__status">{result.workOrder ? result.workOrder.statusLabel : result.statusLabel}</p>
          {result.status !== 'cancelled' ? (
            <ol className="repairflow__timeline">
              {steps.map((label, index) => (
                <li key={label} className={index <= step ? 'is-done' : ''}>
                  {label}
                </li>
              ))}
            </ol>
          ) : null}
          {result.workOrder?.estimatedReadyAt ? <p className="repairflow__muted">Previsão: {new Date(result.workOrder.estimatedReadyAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p> : null}
          {result.items.length ? <p className="repairflow__muted">Serviços: {result.items.join(', ')}</p> : null}
        </section>
      ) : null}
    </section>
  );
}
