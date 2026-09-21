import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  addCrmActivity,
  claimCrmLead,
  confirmCrmLeadPaidAsCustomer,
  CRM_ACTIVITY_LABEL,
  CRM_EVENT,
  CRM_PIPELINE_STAGES,
  CRM_SOURCE_LABEL,
  CRM_STAGE_LABEL,
  ensureCrmSellerProfile,
  getCrmLead,
  listCrmActivities,
  listLeadMessages,
  moveCrmLead,
  sendLeadMessage,
  updateCrmLeadDetails,
  whatsappHref,
  type CrmActivityKind,
  type CrmStage,
} from '../../data/crmStore';

type SellerCtx = { sellerId: string; sellerName: string };

type DealTab = 'geral' | 'whatsapp' | 'produtos' | 'automacao' | 'deps' | 'historico' | 'market';

type ComposerKind = Exclude<CrmActivityKind, 'system'>;

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(date, today)) return 'Hoje';
  if (same(date, yesterday)) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }
  if (digits.length >= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  return raw || '—';
}

export function CrmDealPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const me = useOutletContext<SellerCtx>();
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<DealTab>('geral');
  const [composerKind, setComposerKind] = useState<ComposerKind>('activity');
  const [composerText, setComposerText] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [chatText, setChatText] = useState('');
  const [waOrigin, setWaOrigin] = useState('');
  const [waDest, setWaDest] = useState('');
  const [waFileName, setWaFileName] = useState('');
  const [waTipOpen, setWaTipOpen] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editingValue, setEditingValue] = useState(false);
  const [valueDraft, setValueDraft] = useState('0');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    window.addEventListener(CRM_EVENT, refresh);
    return () => window.removeEventListener(CRM_EVENT, refresh);
  }, []);

  const lead = useMemo(() => getCrmLead(id), [id, tick]);
  const activities = useMemo(() => (lead ? listCrmActivities(lead.id) : []), [lead, tick]);
  const leadMessages = useMemo(() => (lead ? listLeadMessages(lead.id) : []), [lead, tick]);
  const profile = useMemo(
    () => ensureCrmSellerProfile(me.sellerId, me.sellerName),
    [me.sellerId, me.sellerName, tick],
  );

  const mine = Boolean(lead && lead.ownerSellerId === me.sellerId);
  const locked = Boolean(lead?.ownerSellerId && !mine);
  const stageIndex = lead ? CRM_PIPELINE_STAGES.indexOf(lead.stage === 'lost' ? 'leads' : lead.stage) : 0;

  const originOptions = useMemo(() => {
    const items: { value: string; label: string }[] = [];
    if (profile.whatsapp) {
      items.push({
        value: profile.whatsapp,
        label: `Meu número · ${formatPhone(profile.whatsapp)}`,
      });
    }
    items.push(
      { value: '24999001111', label: 'Loja Marthi · (24) 99900-1111' },
      { value: '1140028922', label: 'Comercial Marthi · (11) 4002-8922' },
    );
    return items;
  }, [profile.whatsapp]);

  const destOptions = useMemo(() => {
    if (!lead?.whatsapp) return [] as { value: string; label: string }[];
    return [
      {
        value: lead.whatsapp,
        label: `${lead.name} · ${formatPhone(lead.whatsapp)}`,
      },
    ];
  }, [lead?.whatsapp, lead?.name]);

  useEffect(() => {
    if (lead) setValueDraft(String(lead.value || 0));
  }, [lead?.id, lead?.value]);

  useEffect(() => {
    if (!waOrigin && originOptions[0]) setWaOrigin(originOptions[0].value);
  }, [waOrigin, originOptions]);

  useEffect(() => {
    if (lead?.whatsapp) setWaDest(lead.whatsapp);
  }, [lead?.id, lead?.whatsapp]);

  function flashOk(text: string) {
    setMessage(text);
    setError('');
  }

  function flashErr(text: string) {
    setError(text);
    setMessage('');
  }

  function claim() {
    if (!lead) return;
    const result = claimCrmLead(lead.id, me.sellerId, me.sellerName);
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    flashOk(`Você puxou ${result.lead.name}.`);
    setTick((value) => value + 1);
  }

  function setStage(stage: CrmStage) {
    if (!lead) return;
    if (!mine) {
      flashErr(locked ? `Só ${lead.ownerName} pode mover.` : 'Puxe o lead antes de mover.');
      return;
    }
    const result = moveCrmLead(lead.id, stage, me.sellerId);
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    if (stage === 'won') {
      flashOk('Negócio fechado. Confirme o pagamento para virar cliente Marthi.');
    } else if (stage === 'payment') {
      flashOk('Aguardando pagamento. Depois confirme para criar o cliente.');
    }
    setTick((value) => value + 1);
  }

  async function confirmPaid() {
    if (!lead) return;
    const result = await confirmCrmLeadPaidAsCustomer(lead.id, me.sellerId);
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    flashOk(`Pagamento ok · cliente Marthi ${result.customerId} criado no painel.`);
    setTick((value) => value + 1);
  }

  function saveValue() {
    if (!lead || !mine) return;
    const result = updateCrmLeadDetails(lead.id, me.sellerId, {
      value: Number(valueDraft) || 0,
    });
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    setEditingValue(false);
    setTick((value) => value + 1);
  }

  function patchField(
    field: 'graduation' | 'polo' | 'sourceInfo' | 'interest',
    current: string,
  ) {
    if (!lead || !mine) return;
    const next = window.prompt('Alterar valor', current);
    if (next === null) return;
    const result = updateCrmLeadDetails(lead.id, me.sellerId, { [field]: next });
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    setTick((value) => value + 1);
  }

  function submitActivity(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    const result = addCrmActivity({
      leadId: lead.id,
      kind: composerKind,
      body: composerText,
      sellerId: me.sellerId,
      sellerName: me.sellerName,
      dueAt: composerKind === 'schedule' || composerKind === 'task' ? dueAt || undefined : undefined,
    });
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    setComposerText('');
    setDueAt('');
    flashOk('Atividade registrada.');
    setTick((value) => value + 1);
  }

  function sendChat(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    if (!waOrigin) {
      flashErr('Selecione o número de origem.');
      return;
    }
    if (!waDest) {
      flashErr('Selecione o número de destino.');
      return;
    }
    const attachment = waFileName ? `\n[Anexo: ${waFileName}]` : '';
    const text = `${chatText.trim()}${attachment}`.trim();
    if (!text) {
      flashErr('Digite sua mensagem ou anexe um arquivo.');
      return;
    }
    const result = sendLeadMessage({
      leadId: lead.id,
      sellerId: me.sellerId,
      sellerName: me.sellerName,
      text,
    });
    if (!result.ok) {
      flashErr(result.error);
      return;
    }
    setChatText('');
    setWaFileName('');
    flashOk('Mensagem registrada no CRM. Abra no WhatsApp para enviar de fato.');
    setTick((value) => value + 1);
  }

  const timelineGroups = useMemo(() => {
    const groups: { label: string; items: typeof activities }[] = [];
    for (const item of activities) {
      const label = formatDayLabel(item.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [activities]);

  if (!lead) {
    return (
      <section className="admin-page">
        <p className="qty-low">Negócio não encontrado.</p>
        <Link className="btn btn--ghost" to="/crm">
          Voltar ao board
        </Link>
      </section>
    );
  }

  const contactLabel = lead.hideContact
    ? 'Contato oculto'
    : lead.email || lead.whatsapp || 'Sem contato';

  return (
    <section className="crm-deal">
      <div className="crm-deal__top">
        <div className="crm-deal__title-row">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/crm')}>
            ← Board
          </button>
          <h2>{lead.name}</h2>
          <span className="crm-deal__pipeline-tag">Vendas</span>
          <div className="crm-deal__top-actions">
            {lead.whatsapp && mine ? (
              <a
                className="btn btn--ghost"
                href={whatsappHref(lead.whatsapp, `Olá ${lead.name}, sou ${me.sellerName} da Marthi.`)}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            ) : null}
            {lead.email ? (
              <a className="btn btn--ghost" href={`mailto:${lead.email}`}>
                E-mail
              </a>
            ) : null}
            {!lead.ownerSellerId ? (
              <button type="button" className="btn btn--primary" onClick={claim}>
                Puxar lead
              </button>
            ) : null}
            {mine && lead.stage !== 'won' ? (
              <button type="button" className="btn btn--primary" onClick={() => setStage('won')}>
                Fechar negócio
              </button>
            ) : null}
            {mine && (lead.stage === 'won' || lead.stage === 'payment') && !lead.customerId ? (
              <button type="button" className="btn btn--primary" onClick={() => void confirmPaid()}>
                Confirmar pagamento → cliente
              </button>
            ) : null}
          </div>
        </div>

        <nav className="crm-pipeline" aria-label="Funil de vendas">
          {CRM_PIPELINE_STAGES.map((stage, index) => {
            const active = lead.stage === stage || (lead.stage === 'lost' && stage === 'leads');
            const done = index < stageIndex || lead.stage === 'won';
            return (
              <button
                key={stage}
                type="button"
                className={`crm-pipeline__step ${active ? 'is-active' : ''} ${done && !active ? 'is-done' : ''} ${
                  stage === 'won' ? 'is-won' : ''
                }`}
                disabled={!mine && Boolean(lead.ownerSellerId)}
                onClick={() => setStage(stage)}
              >
                <span className="crm-pipeline__label">{CRM_STAGE_LABEL[stage]}</span>
              </button>
            );
          })}
        </nav>

        <div className="crm-deal__tabs" role="tablist">
          {(
            [
              ['geral', 'Geral'],
              ['whatsapp', 'WhatsApp'],
              ['produtos', 'Produtos'],
              ['automacao', 'Automação'],
              ['deps', 'Dependências'],
              ['historico', 'Histórico'],
              ['market', 'Market'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? 'is-active' : undefined}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}
      {locked ? (
        <p className="empty">Este negócio está com {lead.ownerName}. Você pode visualizar, mas não editar.</p>
      ) : null}

      {tab === 'geral' ? (
        <div className="crm-deal__grid">
          <aside className="crm-deal__about">
            <h3>Sobre o negócio</h3>

            <div className="crm-deal__field">
              <span>Valor e moeda</span>
              {editingValue && mine ? (
                <div className="crm-deal__value-edit">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={valueDraft}
                    onChange={(e) => setValueDraft(e.target.value)}
                    autoFocus
                  />
                  <button type="button" className="btn btn--primary" onClick={saveValue}>
                    Ok
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setEditingValue(false)}>
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="crm-deal__field-value"
                  disabled={!mine}
                  onClick={() => setEditingValue(true)}
                >
                  {money(lead.value)}
                </button>
              )}
            </div>

            <div className="crm-deal__field">
              <span>Lead / contato</span>
              <div className="crm-deal__client">
                <strong>{contactLabel}</strong>
                <div className="crm-deal__client-actions">
                  {lead.whatsapp && !lead.hideContact ? (
                    <a
                      href={whatsappHref(lead.whatsapp)}
                      target="_blank"
                      rel="noreferrer"
                      title="WhatsApp"
                    >
                      ☎
                    </a>
                  ) : null}
                  {lead.email && !lead.hideContact ? (
                    <a href={`mailto:${lead.email}`} title="E-mail">
                      ✉
                    </a>
                  ) : null}
                  {mine ? (
                    <button
                      type="button"
                      title={lead.hideContact ? 'Mostrar contato' : 'Ocultar contato'}
                      onClick={() => {
                        updateCrmLeadDetails(lead.id, me.sellerId, {
                          hideContact: !lead.hideContact,
                        });
                        setTick((v) => v + 1);
                      }}
                    >
                      {lead.hideContact ? '👁' : '🔒'}
                    </button>
                  ) : null}
                </div>
              </div>
              {!lead.hideContact && (lead.email || lead.whatsapp) ? (
                <em className="crm-deal__hint">
                  {[lead.whatsapp, lead.email].filter(Boolean).join(' · ')}
                </em>
              ) : null}
            </div>

            <div className="crm-deal__field">
              <span>Graduação / interesse</span>
              <button
                type="button"
                className="crm-deal__field-value"
                disabled={!mine}
                onClick={() =>
                  patchField('graduation', lead.graduation || lead.interest || '')
                }
              >
                {lead.graduation || lead.interest || '—'}
              </button>
            </div>

            <div className="crm-deal__field">
              <span>Polo</span>
              <button
                type="button"
                className="crm-deal__field-value"
                disabled={!mine}
                onClick={() => patchField('polo', lead.polo || '')}
              >
                {lead.polo || '—'}
              </button>
            </div>

            <div className="crm-deal__field">
              <span>Responsável</span>
              {lead.ownerName ? (
                <div className="crm-deal__owner">
                  <span className="crm-deal__avatar">{initials(lead.ownerName)}</span>
                  <strong>{lead.ownerName}</strong>
                </div>
              ) : (
                <em className="crm-deal__hint">Pool — sem responsável</em>
              )}
            </div>

            <div className="crm-deal__field">
              <span>Fonte</span>
              <strong className="crm-deal__field-value static">
                {CRM_SOURCE_LABEL[lead.source]}
              </strong>
            </div>

            <div className="crm-deal__field">
              <span>Informações da fonte</span>
              <button
                type="button"
                className="crm-deal__field-value"
                disabled={!mine}
                onClick={() => patchField('sourceInfo', lead.sourceInfo || '')}
              >
                {lead.sourceInfo || '—'}
              </button>
            </div>

            {lead.customerId ? (
              <div className="crm-deal__field">
                <span>Cliente Marthi</span>
                <strong className="crm-deal__field-value static">{lead.customerId}</strong>
                <em className="crm-deal__hint">Criado após pagamento confirmado</em>
              </div>
            ) : lead.stage === 'won' || lead.stage === 'payment' ? (
              <div className="crm-deal__field">
                <span>Status</span>
                <em className="crm-deal__hint">
                  Ainda é lead. Confirme o pagamento para virar cliente Marthi.
                </em>
              </div>
            ) : null}
          </aside>

          <div className="crm-deal__feed">
            <div className="crm-composer">
              <div className="crm-composer__tabs">
                {(
                  [
                    ['activity', 'Atividade'],
                    ['comment', 'Comentário'],
                    ['message', 'Mensagem'],
                    ['schedule', 'Agendamento'],
                    ['task', 'Tarefa'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={composerKind === key ? 'is-active' : undefined}
                    onClick={() => setComposerKind(key)}
                    disabled={!mine}
                  >
                    {label}
                    {key === 'schedule' ? <em>NOVO</em> : null}
                  </button>
                ))}
              </div>

              <form onSubmit={submitActivity}>
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  placeholder={
                    composerKind === 'task'
                      ? 'Coisas a fazer…'
                      : composerKind === 'comment'
                        ? 'Escreva um comentário…'
                        : 'Adicionar uma nova atividade…'
                  }
                  disabled={!mine}
                />
                {composerKind === 'schedule' || composerKind === 'task' ? (
                  <label className="crm-composer__due">
                    Quando
                    <input
                      type="datetime-local"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                      disabled={!mine}
                    />
                  </label>
                ) : null}
                {!mine ? (
                  <p className="crm-composer__hint">
                    Puxe o lead para registrar atividades e não esquecer o cliente.
                  </p>
                ) : !composerText.trim() ? (
                  <p className="crm-composer__hint is-warn">
                    Adicionar uma nova atividade — planeje o próximo passo com o cliente.
                  </p>
                ) : null}
                <div className="crm-composer__actions">
                  <button type="submit" className="btn btn--primary" disabled={!mine}>
                    Salvar {CRM_ACTIVITY_LABEL[composerKind].toLowerCase()}
                  </button>
                </div>
              </form>
            </div>

            <div className="crm-timeline">
              {timelineGroups.length === 0 ? (
                <p className="empty">Sem histórico ainda.</p>
              ) : (
                timelineGroups.map((group) => (
                  <div key={group.label} className="crm-timeline__day">
                    <div className="crm-timeline__day-label">{group.label}</div>
                    {group.items.map((item) => (
                      <article key={item.id} className="crm-timeline__item">
                        <span className="crm-deal__avatar" title={item.fromName}>
                          {initials(item.fromName || 'S')}
                        </span>
                        <div>
                          <header>
                            <strong>{item.title}</strong>
                            <time>{formatTime(item.createdAt)}</time>
                          </header>
                          <p>{item.body}</p>
                          {item.dueAt ? (
                            <em>
                              Agendado:{' '}
                              {new Date(item.dueAt).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </em>
                          ) : null}
                          <span className="crm-timeline__meta">
                            {item.fromName} · {CRM_ACTIVITY_LABEL[item.kind]}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'whatsapp' ? (
        <div className="crm-wa">
          {waTipOpen ? (
            <div className="crm-wa__tip">
              <span>
                Aprenda boas práticas de uso do WhatsApp comercial para evitar bloqueio/banimento do
                seu número.{' '}
                <a
                  href="https://faq.whatsapp.com/1322760794930567"
                  target="_blank"
                  rel="noreferrer"
                >
                  Clique aqui.
                </a>
              </span>
              <button type="button" aria-label="Fechar aviso" onClick={() => setWaTipOpen(false)}>
                ×
              </button>
            </div>
          ) : null}

          {!mine ? (
            <p className="empty" style={{ padding: 16 }}>
              Só o responsável conversa com o lead nesta aba.
            </p>
          ) : (
            <form className="crm-wa__form" onSubmit={sendChat}>
              <div className="crm-wa__numbers">
                <label>
                  <AdminPicker
                    label="Número de origem"
                    compact
                    value={waOrigin}
                    placeholder="Selecione o número de origem"
                    options={[
                      { value: '', label: 'Selecione o número de origem' },
                      ...originOptions,
                    ]}
                    onChange={setWaOrigin}
                  />
                </label>
                <label>
                  <AdminPicker
                    label="Número de destino"
                    compact
                    value={waDest}
                    placeholder={
                      destOptions.length === 0
                        ? 'Lead sem WhatsApp cadastrado'
                        : 'Selecione o número de destino'
                    }
                    options={
                      destOptions.length === 0
                        ? [{ value: '', label: 'Lead sem WhatsApp cadastrado' }]
                        : [
                            { value: '', label: 'Selecione o número de destino' },
                            ...destOptions,
                          ]
                    }
                    onChange={setWaDest}
                    disabled={destOptions.length === 0}
                  />
                </label>
              </div>

              <div className="crm-wa__compose">
                <textarea
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Digite sua mensagem"
                  rows={5}
                />
                <div className="crm-wa__media">
                  <button
                    type="button"
                    className="crm-wa__icon-btn"
                    title="Áudio (MVP: anexa marcador)"
                    onClick={() => {
                      setWaFileName((current) => current || 'audio-nota.ogg');
                      flashOk('Marcador de áudio anexado. Envie para registrar no histórico.');
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="crm-wa__icon-btn"
                    title="Mensagem rápida"
                    onClick={() => {
                      setChatText(
                        (current) =>
                          current ||
                          `Olá ${lead.name.split(' ')[0]}, sou ${me.sellerName} da Marthi. Como posso ajudar?`,
                      );
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M3 11v2h9.6l-2.3 2.3 1.4 1.4L16.4 12l-4.7-4.7-1.4 1.4 2.3 2.3H3Zm11 7v2h7v-2h-7Z"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div
                className={`crm-wa__drop ${waFileName ? 'has-file' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) setWaFileName(file.name);
                }}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setWaFileName(file.name);
                    e.target.value = '';
                  }}
                />
                <span className="crm-wa__drop-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" width="36" height="36">
                    <path
                      fill="currentColor"
                      d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Zm2 5v4.17l1.59-1.58L15 13l-3 3-3-3 1.41-1.41L12 13.17V9h0Z"
                    />
                  </svg>
                </span>
                {waFileName ? (
                  <p>
                    <strong>{waFileName}</strong>
                    <button
                      type="button"
                      className="crm-wa__clear-file"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWaFileName('');
                      }}
                    >
                      Remover
                    </button>
                  </p>
                ) : (
                  <p>
                    Clique ou arraste o arquivo para esta área para fazer o upload.
                    <br />
                    <span>Suporte para um upload único.</span>
                  </p>
                )}
              </div>

              <div className="crm-wa__foot">
                {waDest ? (
                  <a
                    className="btn btn--ghost"
                    href={whatsappHref(waDest, chatText || undefined)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir no WhatsApp
                  </a>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  className="crm-wa__send"
                  disabled={!chatText.trim() && !waFileName}
                >
                  Enviar
                </button>
              </div>
            </form>
          )}

          {leadMessages.length > 0 ? (
            <div className="crm-wa__history">
              <h4>Histórico neste negócio</h4>
              <div className="crm-deal__chat">
                {leadMessages.map((item) => (
                  <div
                    key={item.id}
                    className={`crm-bubble ${item.fromLead ? 'is-them' : 'is-me'}`}
                  >
                    <em>
                      {item.fromName} · {formatTime(item.createdAt)}
                    </em>
                    {item.text}
                  </div>
                ))}
              </div>
              {mine ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    const result = sendLeadMessage({
                      leadId: lead.id,
                      sellerId: me.sellerId,
                      sellerName: me.sellerName,
                      text: 'Olá! Recebi sua mensagem.',
                      asLead: true,
                    });
                    if (!result.ok) flashErr(result.error);
                    else setTick((v) => v + 1);
                  }}
                >
                  Simular resposta do lead
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'produtos' ? (
        <div className="crm-deal__panel">
          <h3>Produtos / interesse</h3>
          <p>
            <strong>{lead.interest || 'Sem produto vinculado'}</strong>
          </p>
          <p className="empty">
            No MVP o interesse vem do formulário. Integração com catálogo Marthi em breve.
          </p>
          {mine ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => patchField('interest', lead.interest)}
            >
              Editar interesse
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === 'automacao' ? (
        <div className="crm-deal__panel">
          <h3>Automação</h3>
          <ul className="crm-deal__list">
            <li>Lead no pool → qualquer vendedor pode puxar (exclusivo).</li>
            <li>Dados do negócio ficam no CRM como lead (não abre cadastro de cliente).</li>
            <li>Fechar + confirmar pagamento → aí sim cria cliente Marthi no painel.</li>
          </ul>
        </div>
      ) : null}

      {tab === 'deps' ? (
        <div className="crm-deal__panel">
          <h3>Dependências</h3>
          <p className="empty">
            Sem dependências vinculadas. Use para OS, proposta ou pagamento quando integrar.
          </p>
          {lead.customerId ? (
            <p>
              Cliente Marthi gerado após pagamento: <strong>{lead.customerId}</strong>
            </p>
          ) : (
            <p className="empty">
              Sem cliente ainda — o cadastro no CRM é lead até fechar e pagar.
            </p>
          )}
        </div>
      ) : null}

      {tab === 'historico' ? (
        <div className="crm-deal__panel">
          <h3>Histórico completo</h3>
          <div className="crm-timeline">
            {activities.map((item) => (
              <article key={item.id} className="crm-timeline__item">
                <span className="crm-deal__avatar">{initials(item.fromName || 'S')}</span>
                <div>
                  <header>
                    <strong>{item.title}</strong>
                    <time>
                      {new Date(item.createdAt).toLocaleString('pt-BR')}
                    </time>
                  </header>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'market' ? (
        <div className="crm-deal__panel">
          <h3>Market</h3>
          <p className="empty">
            Canal de origem e anúncios. Fonte: {CRM_SOURCE_LABEL[lead.source]}
            {lead.sourceInfo ? ` · ${lead.sourceInfo}` : ''}.
          </p>
          <Link className="btn btn--ghost" to="/ecommerce">
            Abrir Ecommerce
          </Link>
        </div>
      ) : null}
    </section>
  );
}
