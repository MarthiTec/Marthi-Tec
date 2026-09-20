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
  CRM_SOURCE_LABEL,
  CRM_STAGE_LABEL,
  crmStageTotals,
  listCrmLeads,
  listLeadMessages,
  listSellerMessages,
  moveCrmLead,
  sendLeadMessage,
  sendSellerMessage,
  updateCrmLeadValue,
  whatsappHref,
  type CrmLead,
  type CrmStage,
} from '../../data/crmStore';
import { listSellers } from '../../data/erpRegistry';

type SellerCtx = { sellerId: string; sellerName: string };

type Dock =
  | { type: 'lead'; leadId: string }
  | { type: 'sellers'; peerId: string; peerName: string }
  | null;

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
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener(CRM_EVENT, refresh);
    return () => window.removeEventListener(CRM_EVENT, refresh);
  }, []);

  const leads = useMemo(() => listCrmLeads(), [tick]);
  const sellers = useMemo(() => listSellers(true).filter((item) => item.id !== me.sellerId), [tick, me.sellerId]);

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
      name: newName,
      email: newEmail,
      whatsapp: newPhone,
      source: 'manual',
      interest: 'Cadastro manual CRM',
    });
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    setCreateOpen(false);
    setNewName('');
    setNewPhone('');
    setNewEmail('');
    flashOk('Lead criado no pool (visível para todos).');
    setTick((value) => value + 1);
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

  return (
    <section className="admin-page">
      <div className="admin-toolbar">
        <button type="button" className="btn btn--primary" onClick={() => setCreateOpen(true)}>
          + Criar lead
        </button>
        <span className="empty" style={{ margin: 0 }}>
          Pool aberto · puxar = exclusivo · cliente Marthi só após fechar + pagar
        </span>
      </div>

      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      <article className="admin-card" style={{ marginBottom: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Conversar com vendedores</h2>
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
          const columnLeads = leads.filter((item) => item.stage === stage);
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
                  {totals.count} · {money(totals.value)}
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
                    <div className="crm-card__row">
                      <span>{CRM_SOURCE_LABEL[lead.source]}</span>
                      <span>{lead.interest || '—'}</span>
                    </div>
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
                          {lead.whatsapp ? (
                            <a
                              className="btn btn--ghost"
                              style={{ fontSize: '0.78rem', minHeight: 28, padding: '0 8px' }}
                              href={whatsappHref(
                                lead.whatsapp,
                                `Olá ${lead.name}, sou ${me.sellerName} da Marthi.`,
                              )}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WA
                            </a>
                          ) : null}
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
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  const note = window.prompt('Observação interna');
                  if (!note) return;
                  const result = addCrmLeadNote(leadDock.id, note, me.sellerId);
                  if (!result.ok) flashErr(result.error);
                  else setTick((value) => value + 1);
                }}
              >
                + Atividade
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
        <div className="crm-lock" role="dialog" aria-modal="true">
          <form className="crm-lock__card" onSubmit={createLead}>
            <h2 style={{ margin: 0 }}>Novo lead</h2>
            <p className="empty" style={{ margin: 0 }}>
              Entra no pool para qualquer vendedor puxar.
            </p>
            <label>
              Nome
              <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </label>
            <label>
              WhatsApp
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </label>
            <label>
              E-mail
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </label>
            <div className="admin-toolbar">
              <button type="button" className="btn btn--ghost" onClick={() => setCreateOpen(false)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary">
                Criar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
