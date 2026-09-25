import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import {
  addWorkOrderAttachment,
  addWorkOrderComment,
  BOARD_COLUMNS,
  PRIORITY_LABEL,
  removeWorkOrderAttachment,
  STATUS_LABEL,
  TECHNICIANS_LIST,
  toggleWorkOrderTimer,
  updateWorkOrder,
  workOrderTotal,
  type WorkOrder,
  type WorkOrderStatus,
} from '../../data/osStore';

type Props = {
  order: WorkOrder | null;
  onClose: () => void;
  onOrderUpdated: (updated: WorkOrder) => void;
};

type ActiveTab = 'overview' | 'comments' | 'attachments' | 'quick-actions';

function money(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function OsQuickDrawer({ order, onClose, onOrderUpdated }: Props) {
  const [tab, setTab] = useState<ActiveTab>('overview');
  const [commentText, setCommentText] = useState('');
  const [commentKind, setCommentKind] = useState<'internal' | 'customer'>('internal');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!order) return null;

  const techInfo = TECHNICIANS_LIST.find((t) => t.name.toLowerCase() === (order.technician || '').toLowerCase());
  const comments = order.comments ?? [];
  const attachments = order.attachments ?? [];

  async function handleAddComment(event: FormEvent) {
    event.preventDefault();
    if (!order || !commentText.trim()) return;
    setBusy(true);
    try {
      const updated = await addWorkOrderComment(order.id, {
        authorName: 'Marthi Master',
        authorRole: 'Operador Master',
        authorPhoto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        content: commentText.trim(),
        kind: commentKind,
      });
      if (updated) onOrderUpdated(updated);
      setCommentText('');
      setMsg('Comentário registrado!');
      setTimeout(() => setMsg(''), 2500);
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !order) return;
    setBusy(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const updated = await addWorkOrderAttachment(order.id, {
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl,
        uploaderName: 'Marthi Master',
      });
      if (updated) onOrderUpdated(updated);
      setBusy(false);
      setMsg('Arquivo anexado com sucesso!');
      setTimeout(() => setMsg(''), 2500);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  async function handleRemoveAttachment(id: string) {
    if (!order) return;
    const updated = await removeWorkOrderAttachment(order.id, id);
    if (updated) onOrderUpdated(updated);
  }

  async function handleToggleTimer() {
    if (!order) return;
    const updated = await toggleWorkOrderTimer(order.id);
    if (updated) onOrderUpdated(updated);
  }

  async function handleAdvanceStatus(status: WorkOrderStatus) {
    if (!order) return;
    const updated = await updateWorkOrder(order.id, { status });
    if (updated) onOrderUpdated(updated);
  }

  async function handleReassignTech(techName: string) {
    if (!order) return;
    const updated = await updateWorkOrder(order.id, { technician: techName });
    if (updated) onOrderUpdated(updated);
  }

  function getWhatsAppUrl(type: 'created' | 'quote' | 'ready') {
    if (!order) return '';
    const phone = order.customerPhone.replace(/\D/g, '');
    let text = '';
    if (type === 'created') {
      text = `Olá, ${order.customerName}! Sua Ordem de Serviço #${order.id} referente ao aparelho ${order.itemName} foi aberta na Marthi Oficina. Estamos trabalhando no diagnóstico.`;
    } else if (type === 'quote') {
      text = `Olá, ${order.customerName}! O orçamento da sua OS #${order.id} (${order.itemName}) está pronto: Total ${money(
        workOrderTotal(order),
      )}. Podemos iniciar o serviço?`;
    } else {
      text = `Olá, ${order.customerName}! Seu aparelho ${order.itemName} (OS #${order.id}) está pronto para retirada na nossa oficina!`;
    }
    return `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div className="os-quick-drawer-backdrop" onClick={onClose}>
      <aside
        className="os-quick-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Detalhes da OS ${order.id}`}
      >
        {/* Header do Drawer */}
        <header className="os-quick-drawer__head">
          <div className="os-quick-drawer__head-info">
            <span className="os-quick-drawer__code">{order.id}</span>
            <span className={`os-priority-badge os-priority-badge--${order.priority}`}>
              {PRIORITY_LABEL[order.priority]}
            </span>
            <span className="os-status-chip">{STATUS_LABEL[order.status]}</span>
          </div>

          <button
            type="button"
            className="os-quick-drawer__close"
            onClick={onClose}
            aria-label="Fechar painel"
          >
            ✕
          </button>
        </header>

        {msg ? <div className="os-quick-drawer__toast">{msg}</div> : null}

        {/* Abas */}
        <nav className="os-quick-drawer__tabs">
          <button
            type="button"
            className={`os-quick-drawer__tab ${tab === 'overview' ? 'is-active' : ''}`}
            onClick={() => setTab('overview')}
          >
            Descrição & Info
          </button>
          <button
            type="button"
            className={`os-quick-drawer__tab ${tab === 'comments' ? 'is-active' : ''}`}
            onClick={() => setTab('comments')}
          >
            Jira Comentários ({comments.length})
          </button>
          <button
            type="button"
            className={`os-quick-drawer__tab ${tab === 'attachments' ? 'is-active' : ''}`}
            onClick={() => setTab('attachments')}
          >
            Anexos ({attachments.length})
          </button>
          <button
            type="button"
            className={`os-quick-drawer__tab ${tab === 'quick-actions' ? 'is-active' : ''}`}
            onClick={() => setTab('quick-actions')}
          >
            Ações Rápidas
          </button>
        </nav>

        {/* Conteúdo da Aba 1: Descrição e Informações */}
        {tab === 'overview' ? (
          <div className="os-quick-drawer__body">
            <section className="os-drawer-card">
              <h3 className="os-drawer-card__title">Equipamento & Cliente</h3>
              <div className="os-drawer-info-grid">
                <div>
                  <span className="os-drawer-label">Cliente</span>
                  <strong>{order.customerName}</strong>
                  {order.customerPhone ? <small>{order.customerPhone}</small> : null}
                </div>
                <div>
                  <span className="os-drawer-label">Aparelho</span>
                  <strong>{order.itemName}</strong>
                  <small>
                    {[order.itemBrand, order.itemModel, order.itemColor].filter(Boolean).join(' · ') || 'Padrão'}
                  </small>
                </div>
                <div>
                  <span className="os-drawer-label">IMEI / Série</span>
                  <code>{order.itemRef || 'Não informado'}</code>
                </div>
                <div>
                  <span className="os-drawer-label">Senha / PIN</span>
                  <code className="os-drawer-pwd">{order.devicePassword || 'Sem senha'}</code>
                </div>
              </div>
            </section>

            <section className="os-drawer-card">
              <h3 className="os-drawer-card__title">Descrição da OS & Defeito</h3>
              <div className="os-drawer-desc-block">
                <span className="os-drawer-label">Defeito Reclamado</span>
                <p className="os-drawer-desc-text">{order.defect || 'Nenhum defeito especificado'}</p>
              </div>

              {order.diagnosis ? (
                <div className="os-drawer-desc-block" style={{ marginTop: 12 }}>
                  <span className="os-drawer-label">Diagnóstico Técnico</span>
                  <p className="os-drawer-desc-text os-drawer-desc-text--diagnosis">
                    {order.diagnosis}
                  </p>
                </div>
              ) : null}

              {order.conditionOnEntry ? (
                <div className="os-drawer-desc-block" style={{ marginTop: 12 }}>
                  <span className="os-drawer-label">Estado de Entrada</span>
                  <p className="os-drawer-desc-sub">{order.conditionOnEntry}</p>
                </div>
              ) : null}

              {order.accessories ? (
                <div className="os-drawer-desc-block" style={{ marginTop: 8 }}>
                  <span className="os-drawer-label">Acessórios Inclusos</span>
                  <p className="os-drawer-desc-sub">{order.accessories}</p>
                </div>
              ) : null}
            </section>

            <section className="os-drawer-card">
              <h3 className="os-drawer-card__title">Técnico & Cronômetro</h3>
              <div className="os-drawer-tech-row">
                {techInfo ? (
                  <img
                    src={techInfo.avatarUrl}
                    alt={techInfo.name}
                    className="os-drawer-tech-avatar"
                  />
                ) : (
                  <div className="os-drawer-tech-avatar os-drawer-tech-avatar--empty">?</div>
                )}
                <div className="os-drawer-tech-meta">
                  <strong>{order.technician || 'Sem técnico atribuído'}</strong>
                  <small>{techInfo?.role || 'Oficina Técnica'}</small>
                </div>
              </div>

              <div className="os-timer-box">
                <div className="os-timer-box__time">
                  <span className="os-timer-box__label">Tempo em Bancada:</span>
                  <strong>{order.spentMinutes || 0} min</strong>
                </div>
                <button
                  type="button"
                  className={`btn os-timer-box__btn ${
                    order.isTimerRunning ? 'btn--primary is-running' : 'btn--ghost'
                  }`}
                  onClick={handleToggleTimer}
                >
                  {order.isTimerRunning ? '⏸ Pausar Cronômetro' : '▶ Iniciar Bancada'}
                </button>
              </div>
            </section>

            <div className="os-drawer-footer-actions">
              <Link to={`/os/${order.id}`} className="btn btn--primary" style={{ flex: 1, textAlign: 'center' }}>
                Abrir Tela Completa da OS
              </Link>
            </div>
          </div>
        ) : null}

        {/* Conteúdo da Aba 2: Comentários estilo Jira */}
        {tab === 'comments' ? (
          <div className="os-quick-drawer__body">
            <form className="os-jira-comment-box" onSubmit={handleAddComment}>
              <div className="os-jira-comment-box__head">
                <strong>Novo comentário (estilo Jira)</strong>
                <div className="os-jira-comment-box__type">
                  <label>
                    <input
                      type="radio"
                      name="commentKind"
                      checked={commentKind === 'internal'}
                      onChange={() => setCommentKind('internal')}
                    />
                    <span>Nota Interna</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="commentKind"
                      checked={commentKind === 'customer'}
                      onChange={() => setCommentKind('customer')}
                    />
                    <span>Visível Cliente</span>
                  </label>
                </div>
              </div>

              <textarea
                rows={3}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Adicione observações da bancada, peças testadas, alinhamentos..."
                required
              />

              <div className="os-jira-comment-box__foot">
                <small>Pressione Salvar para registrar no histórico.</small>
                <button
                  type="submit"
                  className="btn btn--primary btn--sm"
                  disabled={busy || !commentText.trim()}
                >
                  Salvar Comentário
                </button>
              </div>
            </form>

            <div className="os-jira-activity-stream">
              {comments.length === 0 ? (
                <div className="os-jira-empty">
                  <span>Nenhum comentário registrado ainda.</span>
                  <small>Use a caixa acima para registrar anotações técnicas.</small>
                </div>
              ) : (
                comments
                  .slice()
                  .reverse()
                  .map((c) => (
                    <article key={c.id} className="os-jira-comment">
                      <div className="os-jira-comment__avatar">
                        {c.authorPhoto ? (
                          <img src={c.authorPhoto} alt={c.authorName} />
                        ) : (
                          c.authorName.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="os-jira-comment__content">
                        <header className="os-jira-comment__header">
                          <strong>{c.authorName}</strong>
                          <span className="os-jira-comment__role">{c.authorRole}</span>
                          <span
                            className={`os-jira-comment__tag ${
                              c.kind === 'customer'
                                ? 'os-jira-comment__tag--customer'
                                : 'os-jira-comment__tag--internal'
                            }`}
                          >
                            {c.kind === 'customer' ? 'Público' : 'Interno'}
                          </span>
                          <time>{new Date(c.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
                        </header>
                        <p>{c.content}</p>
                      </div>
                    </article>
                  ))
              )}
            </div>
          </div>
        ) : null}

        {/* Conteúdo da Aba 3: Anexos & Arquivos */}
        {tab === 'attachments' ? (
          <div className="os-quick-drawer__body">
            <div className="os-attachments-upload">
              <label className="os-attachments-dropzone">
                <AdminIcon name="plus" />
                <span>Clique para anexar fotos, PDFs ou laudos</span>
                <input
                  type="file"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  accept="image/*,application/pdf"
                />
              </label>
            </div>

            <div className="os-attachments-list">
              {attachments.length === 0 ? (
                <p className="empty">Nenhum arquivo anexado a este chamado.</p>
              ) : (
                attachments.map((att) => (
                  <article key={att.id} className="os-attachment-card">
                    <div className="os-attachment-card__icon">
                      {att.type.startsWith('image/') ? '🖼️' : '📄'}
                    </div>
                    <div className="os-attachment-card__info">
                      <strong>{att.name}</strong>
                      <small>
                        {Math.round(att.size / 1024)} KB · Por {att.uploaderName}
                      </small>
                    </div>
                    <div className="os-attachment-card__actions">
                      <a
                        href={att.dataUrl}
                        download={att.name}
                        className="btn btn--ghost btn--sm"
                        title="Baixar arquivo"
                      >
                        Baixar
                      </a>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm btn--danger"
                        onClick={() => handleRemoveAttachment(att.id)}
                        title="Excluir anexo"
                      >
                        ✕
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        ) : null}

        {/* Conteúdo da Aba 4: Ações Rápidas da OS */}
        {tab === 'quick-actions' ? (
          <div className="os-quick-drawer__body">
            <div className="os-quick-actions-grid">
              {/* WhatsApp */}
              <div className="os-action-block">
                <strong>WhatsApp com Cliente</strong>
                <p>Notifique o cliente diretamente pelo WhatsApp cadastrado</p>
                <div className="os-action-buttons-group">
                  <a
                    href={getWhatsAppUrl('created')}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--ghost btn--whatsapp"
                  >
                    💬 Notificar Entrada
                  </a>
                  <a
                    href={getWhatsAppUrl('quote')}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--ghost btn--whatsapp"
                  >
                    💬 Enviar Orçamento
                  </a>
                  <a
                    href={getWhatsAppUrl('ready')}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn--ghost btn--whatsapp"
                  >
                    💬 Avisar OS Pronta
                  </a>
                </div>
              </div>

              {/* Impressão */}
              <div className="os-action-block">
                <strong>Impressão & Documentos</strong>
                <p>Gere fichas de bancada ou comprovantes de entrega</p>
                <Link
                  to={`/os/${order.id}/relatorio`}
                  className="btn btn--ghost"
                  style={{ display: 'inline-block', textAlign: 'center' }}
                >
                  🖨️ Imprimir Ficha da OS
                </Link>
              </div>

              {/* Avançar Etapa */}
              <div className="os-action-block">
                <strong>Avançar Etapa Rápida</strong>
                <p>Mude o status do card no kanban com 1 clique</p>
                <div className="os-stage-buttons">
                  {BOARD_COLUMNS.map((colStatus) => (
                    <button
                      key={colStatus}
                      type="button"
                      className={`btn btn--sm ${
                        order.status === colStatus ? 'btn--primary' : 'btn--ghost'
                      }`}
                      onClick={() => handleAdvanceStatus(colStatus)}
                    >
                      {STATUS_LABEL[colStatus]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`btn btn--sm ${
                      order.status === 'delivered' ? 'btn--primary' : 'btn--ghost'
                    }`}
                    onClick={() => handleAdvanceStatus('delivered')}
                  >
                    {STATUS_LABEL.delivered}
                  </button>
                </div>
              </div>

              {/* Reatribuir Técnico */}
              <div className="os-action-block">
                <strong>Reatribuir Técnico</strong>
                <div className="os-tech-selector-grid">
                  {TECHNICIANS_LIST.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`os-tech-select-btn ${
                        order.technician === t.name ? 'is-selected' : ''
                      }`}
                      onClick={() => handleReassignTech(t.name)}
                    >
                      <img src={t.avatarUrl} alt={t.name} />
                      <div>
                        <strong>{t.name}</strong>
                        <small>{t.specialty}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
