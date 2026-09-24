import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  CRM_EVENT,
  crmInboxUnansweredCount,
  getCrmLead,
  listCrmInboxThreads,
  listLeadMessages,
  listSellerMessages,
  refreshCrmLeadThreadFromApi,
  refreshCrmSellerMessagesFromApi,
  sendLeadMessage,
  sendSellerMessage,
  type CrmInboxThread,
} from '../../data/crmStore';
import { listSellers as listErpSellers } from '../../data/erpRegistry';

type SellerCtx = { sellerId: string; sellerName: string };

function formatWhen(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function initials(name: string) {
  const parts = name
    .replace(/[|·•]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CrmInboxPage() {
  const me = useOutletContext<SellerCtx>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tick, setTick] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const leadId = searchParams.get('lead');
    return leadId ? `lead:${leadId}` : null;
  });
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'mine' | 'internal'>('all');
  const [query, setQuery] = useState('');
  const [text, setText] = useState('');
  const [peerId, setPeerId] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener(CRM_EVENT, refresh);
    return () => window.removeEventListener(CRM_EVENT, refresh);
  }, []);

  useEffect(() => {
    const leadId = searchParams.get('lead');
    if (leadId) setActiveId(`lead:${leadId}`);
  }, [searchParams]);

  const threads = useMemo(() => listCrmInboxThreads(me.sellerId), [me.sellerId, tick]);
  const unanswered = useMemo(() => crmInboxUnansweredCount(me.sellerId), [me.sellerId, tick]);
  const sellers = useMemo(
    () => listErpSellers(true).filter((item) => item.id !== me.sellerId),
    [me.sellerId, tick],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((item) => {
      if (filter === 'unanswered' && !item.unanswered) return false;
      if (filter === 'internal' && item.kind !== 'sellers') return false;
      if (filter === 'mine' && item.kind !== 'lead') return false;
      if (!q) return true;
      return `${item.title} ${item.subtitle} ${item.preview} ${item.channel}`
        .toLowerCase()
        .includes(q);
    });
  }, [threads, filter, query]);

  const active = visible.find((item) => item.id === activeId) ?? visible[0] ?? null;

  useEffect(() => {
    if (active && activeId !== active.id) setActiveId(active.id);
  }, [active, activeId]);

  const lead = active?.leadId ? getCrmLead(active.leadId) : null;
  const leadMessages = useMemo(
    () => (active?.kind === 'lead' && active.leadId ? listLeadMessages(active.leadId) : []),
    [active, tick],
  );
  const sellerMessages = useMemo(() => {
    if (active?.kind !== 'sellers' || !active.peerSellerId) return [];
    return listSellerMessages(me.sellerId, active.peerSellerId);
  }, [active, me.sellerId, tick]);

  const messages = active?.kind === 'lead' ? leadMessages : sellerMessages;
  const locked =
    Boolean(lead?.ownerSellerId) && lead?.ownerSellerId !== me.sellerId && active?.kind === 'lead';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, active?.id]);

  function openThread(thread: CrmInboxThread) {
    setActiveId(thread.id);
    setText('');
    setError('');
    if (thread.kind === 'lead' && thread.leadId) {
      void refreshCrmLeadThreadFromApi(thread.leadId).then(() => setTick((value) => value + 1));
    } else if (thread.peerSellerId) {
      void refreshCrmSellerMessagesFromApi(me.sellerId, thread.peerSellerId).then(() =>
        setTick((value) => value + 1),
      );
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || locked) return;
    if (active.kind === 'lead' && active.leadId) {
      const result = await sendLeadMessage({
        leadId: active.leadId,
        sellerId: me.sellerId,
        sellerName: me.sellerName,
        text,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText('');
      setTick((value) => value + 1);
      return;
    }
    if (active.peerSellerId) {
      const result = await sendSellerMessage({
        fromSellerId: me.sellerId,
        fromName: me.sellerName,
        toSellerId: active.peerSellerId,
        text,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setText('');
      setTick((value) => value + 1);
    }
  }

  function startInternalChat() {
    const peer = sellers.find((item) => item.id === peerId);
    if (!peer) {
      setError('Selecione um colega.');
      return;
    }
    setActiveId(`sellers:${[me.sellerId, peer.id].sort().join('::')}`);
    setFilter('all');
    setError('');
  }

  return (
    <section className="crm-inbox-page">
      <div className="crm-inbox-top">
        <div>
          <p className="crm-inbox-top__eyebrow">Sala de conversas</p>
          <h1>Fale com quem fecha negócio</h1>
        </div>
        <div className="crm-inbox-top__pills">
          <span className={unanswered ? 'is-alert' : undefined}>
            {unanswered} aguardando você
          </span>
          <span>{threads.length} conversas</span>
          <Link to="/crm">Ver funil</Link>
        </div>
      </div>

      <div className="crm-inbox">
        <aside className="crm-inbox__list">
          <div className="crm-inbox__list-head">
            <label className="crm-inbox__search">
              <span aria-hidden>⌕</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pessoa, cidade, interesse…"
              />
            </label>
            <div className="crm-inbox__filters" role="tablist">
              {(
                [
                  ['all', 'Tudo'],
                  ['unanswered', 'Pendentes'],
                  ['mine', 'Clientes'],
                  ['internal', 'Equipe'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={filter === value}
                  className={filter === value ? 'is-active' : undefined}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="crm-inbox__start">
            <AdminPicker
              compact
              label="Novo chat com colega"
              value={peerId}
              options={[
                { value: '', label: 'Escolher colega…' },
                ...sellers.map((item) => ({ value: item.id, label: item.name })),
              ]}
              onChange={setPeerId}
            />
            <button type="button" className="crm-inbox__start-btn" onClick={startInternalChat}>
              Iniciar
            </button>
          </div>

          <div className="crm-inbox__threads">
            {visible.length === 0 ? (
              <div className="crm-inbox__list-empty">
                <strong>Nada por aqui</strong>
                <p>Quando o cliente falar na homepage ou você puxar um lead, a conversa aparece.</p>
              </div>
            ) : (
              visible.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  className={`crm-inbox__thread ${active?.id === thread.id ? 'is-active' : ''} ${
                    thread.unanswered ? 'is-unanswered' : ''
                  }`}
                  onClick={() => openThread(thread)}
                >
                  <span className="crm-inbox__avatar" aria-hidden>
                    {initials(thread.title)}
                    {thread.unanswered ? <i className="crm-inbox__dot" /> : null}
                  </span>
                  <span className="crm-inbox__thread-body">
                    <span className="crm-inbox__thread-top">
                      <strong>{thread.title}</strong>
                      <em>{formatWhen(thread.updatedAt)}</em>
                    </span>
                    <span className="crm-inbox__thread-meta">
                      {thread.channel}
                      {thread.kind === 'sellers' ? ' · interno' : ''}
                      {thread.unanswered ? ' · precisa de resposta' : ''}
                    </span>
                    <span className="crm-inbox__thread-preview">{thread.preview}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="crm-inbox__chat">
          {!active ? (
            <div className="crm-inbox__empty">
              <div className="crm-inbox__empty-art" aria-hidden />
              <h2>Sua sala está pronta</h2>
              <p>
                Escolha uma conversa à esquerda. Clientes chegam pelo site; colegas pelo chat
                interno. Aqui você troca ideia até fechar.
              </p>
            </div>
          ) : (
            <>
              <header className="crm-inbox__chat-head">
                <span className="crm-inbox__avatar crm-inbox__avatar--lg" aria-hidden>
                  {initials(active.title)}
                </span>
                <div className="crm-inbox__chat-id">
                  <strong>{active.title}</strong>
                  <span>
                    {active.subtitle}
                    {active.value ? ` · ${money(active.value)}` : ''}
                  </span>
                  {lead ? (
                    <span className="crm-inbox__presence">
                      {lead.ownerName
                        ? lead.ownerSellerId === me.sellerId
                          ? 'Seu atendimento'
                          : `Com ${lead.ownerName}`
                        : 'Pool aberto — responda para assumir'}
                    </span>
                  ) : (
                    <span className="crm-inbox__presence">Chat interno da equipe</span>
                  )}
                </div>
                {active.leadId ? (
                  <button
                    type="button"
                    className="crm-inbox__deal-btn"
                    onClick={() => navigate(`/crm/negocio/${active.leadId}`)}
                  >
                    Negócio
                  </button>
                ) : null}
              </header>

              {lead ? (
                <div className="crm-inbox__context">
                  {lead.whatsapp ? <span>WhatsApp {lead.whatsapp}</span> : null}
                  {lead.email ? <span>{lead.email}</span> : null}
                  {lead.polo ? <span>{lead.polo}</span> : null}
                </div>
              ) : null}

              <div className="crm-inbox__messages">
                {messages.length === 0 ? (
                  <div className="crm-inbox__day-gap">
                    <p>Comece a conversa — uma mensagem curta e humana costuma destravar a venda.</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const mine =
                      !msg.fromLead &&
                      (!msg.fromSellerId || msg.fromSellerId === me.sellerId);
                    return (
                      <div
                        key={msg.id}
                        className={`crm-inbox__row ${mine ? 'is-me' : 'is-them'}`}
                      >
                        {!mine ? (
                          <span className="crm-inbox__avatar crm-inbox__avatar--sm" aria-hidden>
                            {initials(msg.fromName)}
                          </span>
                        ) : null}
                        <div className={`crm-inbox__bubble ${mine ? 'is-me' : 'is-them'}`}>
                          {!mine ? <strong>{msg.fromName}</strong> : null}
                          <p>{msg.text}</p>
                          <em>{formatWhen(msg.createdAt)}</em>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {locked ? (
                <div className="crm-inbox__lock" role="status">
                  Este lead está com <strong>{lead?.ownerName}</strong>. Só ele responde por aqui —
                  você pode acompanhar o histórico.
                </div>
              ) : null}
              {error ? (
                <p className="crm-inbox__error" role="alert">
                  {error}
                </p>
              ) : null}

              <form className="crm-inbox__composer" onSubmit={send}>
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={locked}
                  placeholder={
                    locked
                      ? 'Somente leitura neste atendimento…'
                      : active.kind === 'lead'
                        ? 'Escreva como falaria pessoalmente…'
                        : 'Mensagem para o colega…'
                  }
                />
                <button type="submit" className="crm-inbox__send" disabled={locked || !text.trim()}>
                  Enviar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
