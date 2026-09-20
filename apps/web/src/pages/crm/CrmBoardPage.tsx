import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  addCrmLeadNote,
  canSellerAccessLeadChat,
  claimCrmLead,
  createCrmLead,
  CRM_BOARD_STAGES,
  CRM_EVENT,
  CRM_INTEREST_OPTIONS,
  CRM_SEGMENT_OPTIONS,
  CRM_SOURCE_LABEL,
  CRM_STAGE_LABEL,
  crmStageTotals,
  listCrmLeads,
  listLeadMessages,
  listSellerMessages,
  moveCrmLead,
  resetCrmMockLeads,
  sendLeadMessage,
  sendSellerMessage,
  updateCrmLeadValue,
  whatsappHref,
  type CrmLead,
  type CrmLeadSource,
  type CrmStage,
} from '../../data/crmStore';
import { listSellers } from '../../data/erpRegistry';

type SellerCtx = { sellerId: string; sellerName: string };

type Dock =
  | { type: 'lead'; leadId: string }
  | { type: 'sellers'; peerId: string; peerName: string }
  | null;

type CreateDraft = {
  name: string;
  whatsapp: string;
  email: string;
  interest: string;
  value: string;
  source: CrmLeadSource;
  sourceInfo: string;
  graduation: string;
  polo: string;
  notes: string;
  stage: CrmStage;
  hideContact: boolean;
  claimToMe: boolean;
  openAfter: boolean;
};

const EMPTY_CREATE: CreateDraft = {
  name: '',
  whatsapp: '',
  email: '',
  interest: CRM_INTEREST_OPTIONS[0],
  value: '0',
  source: 'manual',
  sourceInfo: '',
  graduation: CRM_SEGMENT_OPTIONS[0],
  polo: '',
  notes: '',
  stage: 'leads',
  hideContact: false,
  claimToMe: false,
  openAfter: true,
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) {
    return `hoje, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length >= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  return raw || '';
}

export function CrmBoardPage() {
  const navigate = useNavigate();
  const me = useOutletContext<SellerCtx>();
  const [tick, setTick] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<CrmStage | null>(null);
  const [dock, setDock] = useState<Dock>(null);
  const [chatText, setChatText] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [peerId, setPeerId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_CREATE);
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyPool, setOnlyPool] = useState(false);

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener(CRM_EVENT, refresh);
    return () => window.removeEventListener(CRM_EVENT, refresh);
  }, []);

  const leads = useMemo(() => listCrmLeads(), [tick]);
  const sellers = useMemo(() => listSellers(true).filter((item) => item.id !== me.sellerId), [tick, me.sellerId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (onlyMine && lead.ownerSellerId !== me.sellerId) return false;
      if (onlyPool && lead.ownerSellerId) return false;
      if (!q) return true;
      const hay = [
        lead.name,
        lead.email,
        lead.whatsapp,
        lead.interest,
        lead.polo,
        lead.graduation,
        lead.sourceInfo,
        lead.ownerName,
        CRM_SOURCE_LABEL[lead.source],
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leads, query, onlyMine, onlyPool, me.sellerId]);

  const leadDock = dock?.type === 'lead' ? leads.find((item) => item.id === dock.leadId) ?? null : null;
  const leadMessages = useMemo(
    () => (dock?.type === 'lead' ? listLeadMessages(dock.leadId) : []),
    [dock, tick],
  );
  const sellerMessages = useMemo(() => {
    if (dock?.type !== 'sellers') return [];
    return listSellerMessages(me.sellerId, dock.peerId);
  }, [dock, me.sellerId, tick]);

  function flashOk(text: string) {
    setMessage(text);
    setError('');
  }

  function flashErr(text: string) {
    setError(text);
    setMessage('');
  }

  function patchDraft<K extends keyof CreateDraft>(key: K, value: CreateDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function claim(lead: CrmLead) {
    const result = claimCrmLead(lead.id, me.sellerId, me.sellerName);
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    flashOk(`Você puxou ${result.lead.name}. Agora é sua responsabilidade.`);
    setTick((value) => value + 1);
  }

  function openLeadChat(lead: CrmLead) {
    if (!lead.ownerSellerId) {
      flashErr('Puxe o lead antes de conversar.');
      return;
    }
    if (!canSellerAccessLeadChat(lead, me.sellerId)) {
      flashErr(`Lead de ${lead.ownerName}. Só ele pode conversar.`);
      return;
    }
    setDock({ type: 'lead', leadId: lead.id });
    setChatText('');
  }

  function onDrop(stage: CrmStage) {
    if (!draggingId) return;
    const result = moveCrmLead(draggingId, stage, me.sellerId);
    setDraggingId(null);
    setOverStage(null);
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    if (stage === 'won') {
      flashOk('Negócio fechado. Continua como lead até confirmar o pagamento.');
    } else if (stage === 'payment') {
      flashOk('Etapa de pagamento. Confirme o pagamento no detalhe para virar cliente.');
    }
    setTick((value) => value + 1);
  }

  function sendChat(event: FormEvent) {
    event.preventDefault();
    if (!dock) return;
    if (dock.type === 'lead') {
      const result = sendLeadMessage({
        leadId: dock.leadId,
        sellerId: me.sellerId,
        sellerName: me.sellerName,
        text: chatText,
      });
      if (!result.ok) {
        flashErr(result.error);
        return;
      }
      setChatText('');
      setTick((value) => value + 1);
      return;
    }
    const result = sendSellerMessage({
      fromSellerId: me.sellerId,
      fromName: me.sellerName,
      toSellerId: dock.peerId,
      text: chatText,
    });
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    setChatText('');
    setTick((value) => value + 1);
  }

  function simulateLeadReply() {
    if (dock?.type !== 'lead') return;
    const result = sendLeadMessage({
      leadId: dock.leadId,
      sellerId: me.sellerId,
      sellerName: me.sellerName,
      text: chatText || 'Olá! Recebi sua mensagem.',
      asLead: true,
    });
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    setChatText('');
    setTick((value) => value + 1);
  }

  function createLead(event: FormEvent) {
    event.preventDefault();
    const result = createCrmLead({
      name: draft.name,
      email: draft.email,
      whatsapp: draft.whatsapp,
      source: draft.source,
      interest: draft.interest,
      value: Number(draft.value) || 0,
      notes: draft.notes,
      stage: draft.claimToMe ? (draft.stage === 'leads' ? 'attending' : draft.stage) : draft.stage,
      graduation: draft.graduation,
      polo: draft.polo,
      sourceInfo: draft.sourceInfo || CRM_SOURCE_LABEL[draft.source],
      hideContact: draft.hideContact,
      ownerSellerId: draft.claimToMe ? me.sellerId : null,
      ownerName: draft.claimToMe ? me.sellerName : '',
    });
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    setCreateOpen(false);
    setDraft(EMPTY_CREATE);
    flashOk(
      draft.claimToMe
        ? `Negócio de ${result.lead.name} criado e atribuído a você.`
        : `Lead ${result.lead.name} entrou no pool para qualquer vendedor puxar.`,
    );
    setTick((value) => value + 1);
    if (draft.openAfter) {
      navigate(`/crm/negocio/${result.lead.id}`);
    }
  }

  function openSellerChat() {
    const peer = sellers.find((item) => item.id === peerId);
    if (!peer) {
      flashErr('Selecione um vendedor.');
      return;
    }
    setDock({ type: 'sellers', peerId: peer.id, peerName: peer.name });
    setChatText('');
  }

  function reloadMocks() {
    const result = resetCrmMockLeads();
    flashOk(
      result.added > 0
        ? `${result.added} leads de demonstração adicionados ao funil.`
        : 'Leads de demonstração já estavam no board.',
    );
    setTick((value) => value + 1);
  }

  return (
    <section className="admin-page crm-board-page">
      <div className="crm-board-bar">
        <div className="crm-board-bar__left">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setDraft(EMPTY_CREATE);
              setCreateOpen(true);
            }}
          >
            + Criar lead
          </button>
          <div className="crm-board-bar__filters">
            <label className="crm-board-search">
              <span className="visually-hidden">Pesquisar</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar nome, interesse, cidade…"
              />
            </label>
            <label className="crm-chip-toggle">
              <input
                type="checkbox"
                checked={onlyPool}
                onChange={(e) => {
                  setOnlyPool(e.target.checked);
                  if (e.target.checked) setOnlyMine(false);
                }}
              />
              Só pool
            </label>
            <label className="crm-chip-toggle">
              <input
                type="checkbox"
                checked={onlyMine}
                onChange={(e) => {
                  setOnlyMine(e.target.checked);
                  if (e.target.checked) setOnlyPool(false);
                }}
              />
              Meus negócios
            </label>
          </div>
        </div>
        <div className="crm-board-bar__right">
          <span className="crm-board-bar__hint">
            {filtered.length} negócios · pool aberto · cliente só após fechar + pagar
          </span>
          <button type="button" className="btn btn--ghost" onClick={reloadMocks}>
            Popular demos
          </button>
        </div>
      </div>

      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      <article className="admin-card crm-sellers-card">
        <h2>Conversar com vendedores</h2>
        <div className="admin-toolbar">
          <AdminPicker
            compact
            label="Colega"
            value={peerId}
            options={[
              { value: '', label: 'Selecione…' },
              ...sellers.map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={setPeerId}
          />
          <button type="button" className="btn btn--ghost" onClick={openSellerChat}>
            Abrir chat interno
          </button>
        </div>
      </article>

      <div className="crm-board">
        {CRM_BOARD_STAGES.map((stage) => {
          const columnLeads = filtered.filter((item) => item.stage === stage);
          const totals = crmStageTotals(stage);
          return (
            <div
              key={stage}
              className={`crm-col ${overStage === stage ? 'is-drop-target' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                onDrop(stage);
              }}
            >
              <div className="crm-col__head">
                <h2>{CRM_STAGE_LABEL[stage]}</h2>
                <span className="crm-col__meta">
                  {columnLeads.length}
                  {query || onlyMine || onlyPool ? `/${totals.count}` : ''} · {money(totals.value)}
                </span>
              </div>
              {columnLeads.length === 0 ? <p className="empty">Arraste um card aqui</p> : null}
              {columnLeads.map((lead) => {
                const mine = lead.ownerSellerId === me.sellerId;
                const locked = Boolean(lead.ownerSellerId && !mine);
                return (
                  <div
                    key={lead.id}
                    className={`crm-card ${mine ? 'is-mine' : ''} ${locked ? 'is-locked' : ''} ${
                      draggingId === lead.id ? 'is-dragging' : ''
                    }`}
                    draggable={mine}
                    onDragStart={() => {
                      if (!mine) return;
                      setDraggingId(lead.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverStage(null);
                    }}
                  >
                    <button
                      type="button"
                      className="crm-card__name"
                      onClick={() => navigate(`/crm/negocio/${lead.id}`)}
                    >
                      {lead.name}
                    </button>
                    <div className="crm-card__row">
                      <span className="crm-card__value">{money(lead.value)}</span>
                      <span>{formatWhen(lead.updatedAt)}</span>
                    </div>
                    {(lead.interest || lead.graduation) && (
                      <div className="crm-card__tags">
                        {lead.interest ? <span className="crm-tag">{lead.interest}</span> : null}
                        {lead.graduation ? <span className="crm-tag is-mute">{lead.graduation}</span> : null}
                      </div>
                    )}
                    <div className="crm-card__row">
                      <span>{CRM_SOURCE_LABEL[lead.source]}</span>
                      <span className="crm-card__contact-icons">
                        {lead.whatsapp && !lead.hideContact ? (
                          <a
                            href={whatsappHref(lead.whatsapp, `Olá ${lead.name}, sou ${me.sellerName} da Marthi.`)}
                            target="_blank"
                            rel="noreferrer"
                            title={formatPhone(lead.whatsapp)}
                            onClick={(e) => e.stopPropagation()}
                          >
                            WA
                          </a>
                        ) : null}
                        {lead.email && !lead.hideContact ? (
                          <a href={`mailto:${lead.email}`} title={lead.email} onClick={(e) => e.stopPropagation()}>
                            @
                          </a>
                        ) : null}
                        {lead.hideContact ? <span title="Contato oculto">•••</span> : null}
                      </span>
                    </div>
                    {lead.sourceInfo ? <div className="crm-card__source">{lead.sourceInfo}</div> : null}
                    {lead.polo ? <div className="crm-card__polo">{lead.polo}</div> : null}
                    {lead.ownerName ? (
                      <div className="crm-card__owner">
                        <span className="crm-card__avatar">
                          {lead.ownerName.slice(0, 1).toUpperCase()}
                        </span>
                        {locked ? `Com ${lead.ownerName}` : 'Seu atendimento'}
                      </div>
                    ) : (
                      <div className="crm-card__owner">Pool — disponível</div>
                    )}
                    <div className="crm-card__actions">
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ fontSize: '0.78rem', minHeight: 28, padding: '0 8px' }}
                        onClick={() => navigate(`/crm/negocio/${lead.id}`)}
                      >
                        Abrir
                      </button>
                      {!lead.ownerSellerId ? (
                        <button
                          type="button"
                          className="btn btn--primary"
                          style={{ fontSize: '0.78rem', minHeight: 28, padding: '0 10px' }}
                          onClick={() => claim(lead)}
                        >
                          Puxar lead
                        </button>
                      ) : null}
                      {mine ? (
                        <>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            style={{ fontSize: '0.78rem', minHeight: 28, padding: '0 8px' }}
                            onClick={() => openLeadChat(lead)}
                          >
                            Chat
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            style={{ fontSize: '0.78rem', minHeight: 28, padding: '0 8px' }}
                            onClick={() => {
                              const note = window.prompt('Nova atividade / observação');
                              if (!note) return;
                              const result = addCrmLeadNote(lead.id, note, me.sellerId);
                              if (!result.ok) flashErr(result.error);
                              else {
                                flashOk('Atividade registrada.');
                                setTick((value) => value + 1);
                              }
                            }}
                          >
                            + Atividade
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {dock && leadDock && dock.type === 'lead' ? (
        <div className="crm-dock" role="dialog" aria-label="Chat com lead">
          <div className="crm-dock__head">
            <div>
              <strong>{leadDock.name}</strong>
              <div className="empty" style={{ margin: 0 }}>
                Chat exclusivo · {leadDock.email || leadDock.whatsapp || 'sem contato'}
              </div>
            </div>
            <button type="button" className="btn btn--ghost" onClick={() => setDock(null)}>
              Fechar
            </button>
          </div>
          <div className="crm-dock__body">
            {leadMessages.length === 0 ? (
              <p className="empty">Nenhuma mensagem ainda.</p>
            ) : (
              leadMessages.map((item) => (
                <div
                  key={item.id}
                  className={`crm-bubble ${item.fromLead ? 'is-them' : 'is-me'}`}
                >
                  <em>
                    {item.fromName} · {formatWhen(item.createdAt)}
                  </em>
                  {item.text}
                </div>
              ))
            )}
          </div>
          <form className="crm-dock__foot" onSubmit={sendChat}>
            <div className="admin-toolbar">
              <label style={{ flex: 1 }}>
                Valor do negócio
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={leadDock.value}
                  onBlur={(e) => {
                    updateCrmLeadValue(leadDock.id, Number(e.target.value) || 0, me.sellerId);
                    setTick((value) => value + 1);
                  }}
                />
              </label>
            </div>
            <textarea
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder="Mensagem para o lead…"
            />
            <div className="crm-dock__actions">
              <button type="submit" className="btn btn--primary">
                Enviar
              </button>
              <button type="button" className="btn btn--ghost" onClick={simulateLeadReply}>
                Simular resposta do lead
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {dock?.type === 'sellers' ? (
        <div className="crm-dock" role="dialog" aria-label="Chat entre vendedores">
          <div className="crm-dock__head">
            <div>
              <strong>Chat · {dock.peerName}</strong>
              <div className="empty" style={{ margin: 0 }}>
                Interno entre vendedores
              </div>
            </div>
            <button type="button" className="btn btn--ghost" onClick={() => setDock(null)}>
              Fechar
            </button>
          </div>
          <div className="crm-dock__body">
            {sellerMessages.length === 0 ? (
              <p className="empty">Nenhuma mensagem ainda.</p>
            ) : (
              sellerMessages.map((item) => (
                <div
                  key={item.id}
                  className={`crm-bubble ${
                    item.fromSellerId === me.sellerId ? 'is-me' : 'is-them'
                  }`}
                >
                  <em>
                    {item.fromName} · {formatWhen(item.createdAt)}
                  </em>
                  {item.text}
                </div>
              ))
            )}
          </div>
          <form className="crm-dock__foot" onSubmit={sendChat}>
            <textarea
              value={chatText}
              onChange={(e) => setChatText(e.target.value)}
              placeholder={`Mensagem para ${dock.peerName}…`}
            />
            <div className="crm-dock__actions">
              <button type="submit" className="btn btn--primary">
                Enviar
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {createOpen ? (
        <div className="crm-lock" role="dialog" aria-modal="true" aria-label="Novo lead">
          <form className="crm-create" onSubmit={createLead}>
            <header className="crm-create__head">
              <div>
                <p className="crm-create__eyebrow">Marthi CRM · Vendas</p>
                <h2>Novo negócio / lead</h2>
                <p>
                  Preencha o contato e a oportunidade. Sem responsável, o lead fica no pool para
                  qualquer vendedor puxar.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setCreateOpen(false);
                  setDraft(EMPTY_CREATE);
                }}
              >
                Fechar
              </button>
            </header>

            <div className="crm-create__grid">
              <section className="crm-create__panel">
                <h3>Contato</h3>
                <label>
                  Nome completo ou empresa *
                  <input
                    value={draft.name}
                    onChange={(e) => patchDraft('name', e.target.value)}
                    placeholder="Ex.: Renata Oliveira | CellMix"
                    required
                    autoFocus
                  />
                </label>
                <div className="crm-create__row">
                  <label>
                    WhatsApp
                    <input
                      value={draft.whatsapp}
                      onChange={(e) => patchDraft('whatsapp', e.target.value)}
                      placeholder="(24) 99999-0000"
                      inputMode="tel"
                    />
                  </label>
                  <label>
                    E-mail
                    <input
                      type="email"
                      value={draft.email}
                      onChange={(e) => patchDraft('email', e.target.value)}
                      placeholder="contato@loja.com"
                    />
                  </label>
                </div>
                <div className="crm-create__row">
                  <label>
                    Cidade / polo
                    <input
                      value={draft.polo}
                      onChange={(e) => patchDraft('polo', e.target.value)}
                      placeholder="Três Rios — RJ"
                    />
                  </label>
                  <label>
                    Segmento
                    <select
                      value={draft.graduation}
                      onChange={(e) => patchDraft('graduation', e.target.value)}
                    >
                      {CRM_SEGMENT_OPTIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="crm-create__check">
                  <input
                    type="checkbox"
                    checked={draft.hideContact}
                    onChange={(e) => patchDraft('hideContact', e.target.checked)}
                  />
                  Ocultar contato no board (só o responsável vê)
                </label>
              </section>

              <section className="crm-create__panel">
                <h3>Oportunidade</h3>
                <label>
                  Interesse / produto *
                  <select
                    value={draft.interest}
                    onChange={(e) => patchDraft('interest', e.target.value)}
                  >
                    {CRM_INTEREST_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                    <option value="Outro">Outro</option>
                  </select>
                </label>
                <div className="crm-create__row">
                  <label>
                    Valor estimado (R$)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draft.value}
                      onChange={(e) => patchDraft('value', e.target.value)}
                    />
                  </label>
                  <label>
                    Etapa inicial
                    <select
                      value={draft.stage}
                      onChange={(e) => patchDraft('stage', e.target.value as CrmStage)}
                    >
                      {CRM_BOARD_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {CRM_STAGE_LABEL[stage]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="crm-create__row">
                  <label>
                    Fonte
                    <select
                      value={draft.source}
                      onChange={(e) => patchDraft('source', e.target.value as CrmLeadSource)}
                    >
                      {(Object.keys(CRM_SOURCE_LABEL) as CrmLeadSource[]).map((key) => (
                        <option key={key} value={key}>
                          {CRM_SOURCE_LABEL[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Detalhe da fonte
                    <input
                      value={draft.sourceInfo}
                      onChange={(e) => patchDraft('sourceInfo', e.target.value)}
                      placeholder="Ex.: Meta Lead Ads · WhatsApp SP"
                    />
                  </label>
                </div>
                <label>
                  Observações internas
                  <textarea
                    value={draft.notes}
                    onChange={(e) => patchDraft('notes', e.target.value)}
                    placeholder="Contexto da conversa, urgência, concorrente…"
                    rows={4}
                  />
                </label>
                <label className="crm-create__check">
                  <input
                    type="checkbox"
                    checked={draft.claimToMe}
                    onChange={(e) => patchDraft('claimToMe', e.target.checked)}
                  />
                  Já atribuir a mim (sai do pool)
                </label>
                <label className="crm-create__check">
                  <input
                    type="checkbox"
                    checked={draft.openAfter}
                    onChange={(e) => patchDraft('openAfter', e.target.checked)}
                  />
                  Abrir o negócio depois de criar
                </label>
              </section>
            </div>

            <footer className="crm-create__foot">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setCreateOpen(false);
                  setDraft(EMPTY_CREATE);
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary">
                {draft.claimToMe ? 'Criar e assumir' : 'Criar no pool'}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </section>
  );
}
