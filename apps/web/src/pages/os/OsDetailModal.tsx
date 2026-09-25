import { useState, useMemo, type ChangeEvent, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { OsPrintModal } from './OsPrintModal';
import {
  addWorkOrderAttachment,
  addWorkOrderComment,
  findWorkOrdersByCustomer,
  findWorkOrdersByItemRef,
  getActiveOperation,
  QUOTE_STATUS_LABEL,
  removeWorkOrderAttachment,
  STATUS_LABEL,
  TECHNICIANS_LIST,
  toggleWorkOrderTimer,
  updateWorkOrder,
  workOrderTotal,
  type WorkOrder,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../../data/osStore';
import { useStoreCustomization } from '../../data/storeSegment';

const LIFECYCLE_STAGES: WorkOrderStatus[] = [
  'open',
  'diagnosis',
  'waiting',
  'progress',
  'ready',
  'delivered',
];

type Props = {
  order: WorkOrder | null;
  onClose: () => void;
  onOrderUpdated: (updated: WorkOrder) => void;
};

type ActivityTab = 'all' | 'comments' | 'history' | 'audit';

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function priorityMeta(p: WorkOrderPriority) {
  switch (p) {
    case 'urgent':
      return { symbol: '⇈', label: 'Highest (Urgente)', color: '#ef4444' };
    case 'high':
      return { symbol: '↑', label: 'High (Alta)', color: '#f97316' };
    case 'normal':
      return { symbol: '=', label: 'Medium (Normal)', color: '#eab308' };
    case 'low':
      return { symbol: '↓', label: 'Low (Baixa)', color: '#3b82f6' };
  }
}

export function OsDetailModal({ order, onClose, onOrderUpdated }: Props) {
  const customization = useStoreCustomization();
  const [fullscreen, setFullscreen] = useState(false);
  const [activityTab, setActivityTab] = useState<ActivityTab>('comments');
  const [commentText, setCommentText] = useState('');
  const [commentKind, setCommentKind] = useState<'internal' | 'customer'>('internal');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  // Accordion toggle states (matching Jira images)
  const [openPinned, setOpenPinned] = useState(true);
  const [openInfo, setOpenInfo] = useState(true);
  const [openActions, setOpenActions] = useState(true);
  const [openAutomation, setOpenAutomation] = useState(false);

  // Priority dropdown state
  const [pMenuOpen, setPMenuOpen] = useState(false);
  // Status dropdown state
  const [sMenuOpen, setSMenuOpen] = useState(false);
  // Modal de impressão de 2 vias
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (pMenuOpen) setPMenuOpen(false);
        else if (sMenuOpen) setSMenuOpen(false);
        else onClose();
      }
      if (e.key === 'm' || e.key === 'M') {
        const target = e.target as HTMLElement;
        if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) {
          e.preventDefault();
          const area = document.getElementById('jira-comment-input');
          if (area) area.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pMenuOpen, sMenuOpen, onClose]);

  if (!order) return null;

  const tech = TECHNICIANS_LIST.find((t) => t.name.toLowerCase() === (order.technician || '').toLowerCase());
  const comments = order.comments ?? [];
  const attachments = order.attachments ?? [];
  const pData = priorityMeta(order.priority);
  const total = workOrderTotal(order);

  const relatedByImei = useMemo(
    () => (order ? findWorkOrdersByItemRef(order.itemRef, order.id) : []),
    [order?.id, order?.itemRef],
  );
  const relatedByCustomer = useMemo(
    () =>
      order
        ? findWorkOrdersByCustomer(
            { phone: order.customerPhone, document: order.customerDocument },
            order.id,
          ).filter((o) => !relatedByImei.some((same) => same.id === o.id))
        : [],
    [order?.id, order?.customerPhone, order?.customerDocument, relatedByImei],
  );

  async function handleChangeTechnician(newTech: string) {
    if (!order) return;
    try {
      const updated = await updateWorkOrder(order.id, { technician: newTech });
      if (updated) {
        onOrderUpdated(updated);
        setToast(`Técnico atribuído: ${newTech || 'Não atribuído'}`);
        setTimeout(() => setToast(''), 2500);
      }
    } catch {
      setToast('Falha ao atualizar técnico.');
    }
  }

  async function handleAddComment(textToAdd?: string) {
    const text = textToAdd || commentText;
    if (!order || !text.trim()) return;
    setBusy(true);
    try {
      const updated = await addWorkOrderComment(order.id, {
        authorName: 'Marthi Master',
        authorRole: 'Operador Master',
        authorPhoto: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        content: text.trim(),
        kind: commentKind,
      });
      if (updated) onOrderUpdated(updated);
      setCommentText('');
      setToast('Comentário adicionado com sucesso!');
      setTimeout(() => setToast(''), 2500);
    } finally {
      setBusy(false);
    }
  }

  async function handleFileUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
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
      setToast('Arquivo anexado com sucesso!');
      setTimeout(() => setToast(''), 2500);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleRemoveAttachment(attId: string) {
    if (!order) return;
    const updated = await removeWorkOrderAttachment(order.id, attId);
    if (updated) onOrderUpdated(updated);
  }

  async function handleChangePriority(p: WorkOrderPriority) {
    if (!order) return;
    setPMenuOpen(false);
    const updated = await updateWorkOrder(order.id, { priority: p });
    if (updated) onOrderUpdated(updated);
  }

  async function handleChangeStatus(s: WorkOrderStatus) {
    if (!order) return;
    setSMenuOpen(false);
    const updated = await updateWorkOrder(order.id, { status: s });
    if (updated) onOrderUpdated(updated);
  }

  async function handleToggleTimer() {
    if (!order) return;
    const updated = await toggleWorkOrderTimer(order.id);
    if (updated) onOrderUpdated(updated);
  }

  function getWhatsAppUrl(type: 'created' | 'quote' | 'ready') {
    if (!order) return '';
    const phone = order.customerPhone.replace(/\D/g, '');
    let text = '';
    if (type === 'created') {
      text = `Olá, ${order.customerName}! Sua Ordem de Serviço #${order.id} (${order.itemName}) foi recebida na Marthi Oficina.`;
    } else if (type === 'quote') {
      text = `Olá, ${order.customerName}! O orçamento da sua OS #${order.id} (${order.itemName}) está pronto: Total ${money(total)}.`;
    } else {
      text = `Olá, ${order.customerName}! Seu equipamento ${order.itemName} (OS #${order.id}) está pronto para retirada!`;
    }
    return `https://wa.me/55${phone}?text=${encodeURIComponent(text)}`;
  }

  return (
    <div className="os-modal-backdrop os-jira-modal-backdrop" onClick={onClose}>
      <div
        className={`os-jira-modal ${fullscreen ? 'is-fullscreen' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header estilo Jira */}
        <header className="os-jira-header">
          <div className="os-jira-header__breadcrumbs">
            <span className="os-jira-breadcrumb__parent">Oficina Marthi</span>
            <span className="os-jira-breadcrumb__slash">/</span>
            <span className="os-jira-type-icon">📗</span>
            <strong className="os-jira-code">{order.id}</strong>
          </div>

          <div className="os-jira-header__actions">
            <span className="os-jira-viewers" title="Visualizadores ativos">
              👁 <span>2</span>
            </span>
            <button
              type="button"
              className="os-jira-btn-icon"
              title="Compartilhar link da OS"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                setToast('Link copiado!');
                setTimeout(() => setToast(''), 2000);
              }}
            >
              <AdminIcon name="people" />
            </button>
            <button
              type="button"
              className="os-jira-btn-icon"
              title="Imprimir OS (2 Vias: Bancada e Cliente)"
              onClick={() => setPrintOpen(true)}
            >
              <AdminIcon name="print" />
            </button>
            <button
              type="button"
              className="os-jira-btn-icon"
              title={fullscreen ? 'Sair da tela cheia' : 'Maximizar / Otimizar espaço'}
              onClick={() => setFullscreen((v) => !v)}
            >
              <AdminIcon name={fullscreen ? 'collapse' : 'expand'} />
            </button>
            <button
              type="button"
              className="os-jira-btn-icon os-jira-btn-close"
              title="Fechar (Esc)"
              onClick={onClose}
            >
              ✕
            </button>
          </div>
        </header>

        {toast ? <div className="os-jira-toast">{toast}</div> : null}

        {/* Corpo em duas colunas estilo Jira (Issue Detail View) */}
        <div className="os-jira-body">
          {/* Coluna Esquerda: Conteúdo Principal */}
          <main className="os-jira-main">
            {/* Título & Ações Principais */}
            <div className="os-jira-title-block">
              <h1 className="os-jira-title">
                {order.itemName} — {order.defect}
              </h1>

              <div className="os-jira-stage-row" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                <nav className="os-pipeline" aria-label="Etapas da Ordem de Serviço" style={{ width: '100%', margin: '4px 0 8px' }}>
                  {LIFECYCLE_STAGES.map((status, index) => {
                    const currentIndex = LIFECYCLE_STAGES.indexOf(order.status);
                    const isCurrent = order.status === status;
                    const isDone = currentIndex !== -1 && index < currentIndex;
                    return (
                      <button
                        key={status}
                        type="button"
                        className={`os-pipeline__step ${isCurrent ? 'is-active' : ''} ${isDone ? 'is-done' : ''} ${status === 'delivered' && isCurrent ? 'is-delivered' : ''}`}
                        onClick={() => handleChangeStatus(status)}
                        title={`Mover para: ${STATUS_LABEL[status]}`}
                      >
                        <span>{STATUS_LABEL[status]}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>
            </div>

            {/* Descrição Detalhada em Tabela (Exatamente como a Imagem 3!) */}
            <section className="os-jira-section">
              <header className="os-jira-section__head">
                <span className="os-jira-section__toggle">⌄</span>
                <strong>Descrição da Ordem de Serviço</strong>
              </header>

              <div className="os-jira-desc-card">
                <table className="os-jira-desc-table">
                  <tbody>
                    <tr>
                      <th>Título do Chamado</th>
                      <td>
                        <strong>{order.itemName}</strong> · {order.defect}
                      </td>
                    </tr>
                    <tr>
                      <th>Cliente & Contato</th>
                      <td>
                        {order.customerName}
                        {order.customerPhone ? ` · ${order.customerPhone}` : ''}
                        {order.customerEmail ? ` (${order.customerEmail})` : ''}
                      </td>
                    </tr>
                    <tr>
                      <th>{customization.showImei ? 'Especificações do Aparelho' : 'Especificações do Item'}</th>
                      <td>
                        {[order.itemBrand, order.itemModel, order.itemColor].filter(Boolean).join(' · ') || 'Padrão'}
                        {customization.showImei && order.itemRef ? ` | IMEI/Série: ${order.itemRef}` : ''}
                        {customization.showDevicePassword && order.devicePassword ? ` | Senha: ${order.devicePassword}` : ''}
                      </td>
                    </tr>
                    <tr>
                      <th>Acessórios & Condições</th>
                      <td>
                        {order.accessories || 'Nenhum acessório deixado'}
                        {order.conditionOnEntry ? ` — Estado de entrada: ${order.conditionOnEntry}` : ''}
                      </td>
                    </tr>
                    <tr>
                      <th>Diagnóstico Técnico</th>
                      <td>
                        {order.diagnosis || 'Diagnóstico preliminar em andamento pela bancada.'}
                      </td>
                    </tr>
                    <tr>
                      <th>Valores & Orçamento</th>
                      <td>
                        Mão de obra: {money(order.labor)} | Peças: {money(order.parts)} |{' '}
                        <strong style={{ color: '#22c55e' }}>Total: {money(total)}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Seção de Anexos (Exatamente como a Imagem 5!) */}
            <section className="os-jira-section">
              <header className="os-jira-section__head">
                <span className="os-jira-section__toggle">⌄</span>
                <strong>Anexos</strong>
                <span className="os-jira-counter">{attachments.length}</span>

                <label className="os-jira-attach-btn" title="Anexar arquivos">
                  <span>+</span>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                    accept="image/*,video/*,application/pdf"
                  />
                </label>
              </header>

              <div className="os-jira-attachments-grid">
                {attachments.length === 0 ? (
                  <p className="os-jira-empty-hint">Nenhum anexo. Clique em + acima para incluir fotos ou arquivos.</p>
                ) : (
                  attachments.map((att) => (
                    <article key={att.id} className="os-jira-attachment-thumb">
                      <div className="os-jira-attachment-thumb__media">
                        {att.type.startsWith('image/') ? (
                          <img src={att.dataUrl} alt={att.name} />
                        ) : (
                          <div className="os-jira-attachment-thumb__file-icon">📄</div>
                        )}
                      </div>
                      <div className="os-jira-attachment-thumb__meta">
                        <strong title={att.name}>{att.name}</strong>
                        <small>
                          {new Date(att.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })},{' '}
                          {new Date(att.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </small>
                      </div>
                      <div className="os-jira-attachment-thumb__actions">
                        <a
                          href={att.dataUrl}
                          download={att.name}
                          title="Baixar anexo"
                          className="os-jira-attachment-btn os-jira-attachment-btn--download"
                        >
                          ⬇
                        </a>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          title="Remover anexo"
                          className="os-jira-attachment-btn os-jira-attachment-btn--delete"
                        >
                          ✕
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            {/* Seção de Atividade & Comentários (Exatamente como a Imagem 5!) */}
            <section className="os-jira-section">
              <header className="os-jira-section__head">
                <span className="os-jira-section__toggle">⌄</span>
                <strong>Atividade</strong>
              </header>

              <div className="os-jira-activity-header">
                <div className="os-jira-activity-tabs">
                  <button
                    type="button"
                    className={`os-jira-act-tab ${activityTab === 'all' ? 'is-active' : ''}`}
                    onClick={() => setActivityTab('all')}
                  >
                    Tudo
                  </button>
                  <button
                    type="button"
                    className={`os-jira-act-tab ${activityTab === 'comments' ? 'is-active' : ''}`}
                    onClick={() => setActivityTab('comments')}
                  >
                    Comentários
                  </button>
                  <button
                    type="button"
                    className={`os-jira-act-tab ${activityTab === 'history' ? 'is-active' : ''}`}
                    onClick={() => setActivityTab('history')}
                  >
                    Histórico
                  </button>
                  <button
                    type="button"
                    className={`os-jira-act-tab ${activityTab === 'audit' ? 'is-active' : ''}`}
                    onClick={() => setActivityTab('audit')}
                  >
                    Registro de atividades
                  </button>
                </div>
              </div>

              {/* Caixa de Novo Comentário Jira com sugestões */}
              <div className="os-jira-new-comment-wrap">
                <div className="os-jira-comment-avatar-col">
                  <img
                    src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80"
                    alt="Usuário Atual"
                    className="os-jira-user-avatar"
                  />
                </div>
                <div className="os-jira-comment-input-col">
                  <div className="os-jira-comment-box">
                    <textarea
                      id="jira-comment-input"
                      rows={2}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Adicionar comentário..."
                    />

                    {/* Chips de sugestão rápida (conforme Imagem 5) */}
                    <div className="os-jira-suggestion-chips">
                      <button
                        type="button"
                        onClick={() =>
                          handleAddComment(
                            'Aparelho testado na fonte de bancada. Sem curto na linha primária. Aguardando peça.',
                          )
                        }
                      >
                        Sugira uma resposta...
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddComment('Atualização de status: Serviço iniciado na bancada 1.')
                        }
                      >
                        Atualização de status...
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleAddComment(
                            'Serviço concluído com sucesso. Testes de estresse e carga aprovados.',
                          )
                        }
                      >
                        A gente agradece...
                      </button>
                    </div>

                    <div className="os-jira-comment-box__actions">
                      <div className="os-jira-comment-kind-toggle">
                        <label>
                          <input
                            type="radio"
                            name="detailCommentKind"
                            checked={commentKind === 'internal'}
                            onChange={() => setCommentKind('internal')}
                          />
                          <span>Nota Interna</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="detailCommentKind"
                            checked={commentKind === 'customer'}
                            onChange={() => setCommentKind('customer')}
                          />
                          <span>Público Cliente</span>
                        </label>
                      </div>

                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        disabled={busy || !commentText.trim()}
                        onClick={() => handleAddComment()}
                      >
                        {busy ? 'Salvando…' : 'Salvar Comentário'}
                      </button>
                    </div>
                  </div>
                  <p className="os-jira-shortcut-hint">
                    Dica de ouro: aperte <strong>M</strong> para fazer comentários
                  </p>
                </div>
              </div>

              {/* Feed conforme Tab Selecionada */}
              {activityTab === 'history' || activityTab === 'audit' ? (
                <div className="os-history__timeline" style={{ padding: '6px 0' }}>
                  <div className="os-history__entry">
                    <div className="os-history__entry-icon">📋</div>
                    <div className="os-history__entry-body">
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <span className="os-history__entry-title">Abertura da Ordem de Serviço</span>
                        <span className="os-history__entry-time">{new Date(order.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                      <p className="os-history__entry-detail">
                        Cliente: <strong>{order.customerName}</strong> {order.customerPhone ? `(${order.customerPhone})` : ''} · Equipamento: <strong>{order.itemName || '—'}</strong>
                      </p>
                      {order.defect ? (
                        <p className="os-history__entry-detail" style={{ color: '#b91c1c' }}>
                          <strong>Defeito relatado:</strong> {order.defect}
                        </p>
                      ) : null}
                      {order.conditionOnEntry ? (
                        <p className="os-history__entry-detail">
                          <strong>Estado de entrada:</strong> {order.conditionOnEntry}
                        </p>
                      ) : null}
                      {order.accessories ? (
                        <p className="os-history__entry-detail">
                          <strong>Acessórios deixados:</strong> {order.accessories}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {order.diagnosis ? (
                    <div className="os-history__entry">
                      <div className="os-history__entry-icon">🔍</div>
                      <div className="os-history__entry-body">
                        <span className="os-history__entry-title">Diagnóstico Técnico da Bancada</span>
                        <p className="os-history__entry-detail">{order.diagnosis}</p>
                      </div>
                    </div>
                  ) : null}

                  {order.technician ? (
                    <div className="os-history__entry">
                      <div className="os-history__entry-icon">👤</div>
                      <div className="os-history__entry-body">
                        <span className="os-history__entry-title">Técnico Responsável</span>
                        <p className="os-history__entry-detail">Atribuído a <strong>{order.technician}</strong></p>
                      </div>
                    </div>
                  ) : null}

                  {order.quoteStatus && order.quoteStatus !== 'none' ? (
                    <div className="os-history__entry">
                      <div className="os-history__entry-icon">💰</div>
                      <div className="os-history__entry-body">
                        <span className="os-history__entry-title">Orçamento: {QUOTE_STATUS_LABEL[order.quoteStatus]}</span>
                        <p className="os-history__entry-detail">
                          Mão de obra: {money(order.labor)} · Peças: {money(order.parts)} · Total: {money(total)}
                        </p>
                        {order.quoteSentAt ? (
                          <span className="os-history__entry-time">
                            Enviado ao cliente em {new Date(order.quoteSentAt).toLocaleString('pt-BR')}
                          </span>
                        ) : null}
                        {order.quoteDecidedAt ? (
                          <span className="os-history__entry-time">
                            · Decisão em {new Date(order.quoteDecidedAt).toLocaleString('pt-BR')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {order.lines && order.lines.filter((l) => l.kind === 'part').length > 0 ? (
                    <div className="os-history__entry">
                      <div className="os-history__entry-icon">⚙️</div>
                      <div className="os-history__entry-body">
                        <span className="os-history__entry-title">Peças Utilizadas ({order.lines.filter((l) => l.kind === 'part').length})</span>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.84rem' }}>
                          {order.lines.filter((l) => l.kind === 'part').map((l) => (
                            <li key={l.id}>
                              {l.qty}x {l.name} — {money(l.unitPrice * l.qty)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}

                  {order.customerSignature ? (
                    <div className="os-history__entry">
                      <div className="os-history__entry-icon">✍️</div>
                      <div className="os-history__entry-body">
                        <span className="os-history__entry-title">Assinatura do Cliente Registrada</span>
                        <p className="os-history__entry-detail">
                          Assinado por {order.customerSignedName || order.customerName}
                          {order.customerSignedAt ? ` em ${new Date(order.customerSignedAt).toLocaleString('pt-BR')}` : ''}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="os-history__entry">
                    <div className="os-history__entry-icon">⏱️</div>
                    <div className="os-history__entry-body">
                      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                        <span className="os-history__entry-title">Status Atual: {STATUS_LABEL[order.status]}</span>
                        <span className="os-history__entry-time">Última atualização: {new Date(order.updatedAt).toLocaleString('pt-BR')}</span>
                      </div>
                      {order.estimatedReadyAt ? (
                        <p className="os-history__entry-detail">
                          Previsão de conclusão: {new Date(order.estimatedReadyAt + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {/* Recorrência / OS Anteriores */}
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--ink)' }}>Atendimentos Anteriores (Recorrência)</strong>
                    {relatedByImei.length === 0 && relatedByCustomer.length === 0 ? (
                      <p className="empty" style={{ marginTop: 4 }}>Primeiro atendimento registrado deste cliente / equipamento na oficina.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                        {relatedByImei.map((prev) => (
                          <div key={prev.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--line)', fontSize: '0.84rem' }}>
                            <strong>{prev.id}</strong> (Mesmo equipamento) · {STATUS_LABEL[prev.status]} · {new Date(prev.createdAt).toLocaleDateString('pt-BR')}
                            {prev.defect ? <div style={{ color: '#475569', marginTop: 2 }}>Defeito: {prev.defect}</div> : null}
                          </div>
                        ))}
                        {relatedByCustomer.map((prev) => (
                          <div key={prev.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--line)', fontSize: '0.84rem' }}>
                            <strong>{prev.id}</strong> · {prev.itemName || 'Equipamento'} · {STATUS_LABEL[prev.status]} · {new Date(prev.createdAt).toLocaleDateString('pt-BR')}
                            {prev.defect ? <div style={{ color: '#475569', marginTop: 2 }}>Defeito: {prev.defect}</div> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Feed de Comentários */
                <div className="os-jira-feed">
                  {comments.length === 0 ? (
                    <p className="os-jira-empty-hint">Nenhum comentário registrado ainda.</p>
                  ) : (
                    comments
                      .slice()
                      .reverse()
                      .map((cmt) => (
                        <article key={cmt.id} className="os-jira-feed-item">
                          <div className="os-jira-feed-item__avatar">
                            {cmt.authorPhoto ? (
                              <img src={cmt.authorPhoto} alt={cmt.authorName} />
                            ) : (
                              cmt.authorName.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          <div className="os-jira-feed-item__body">
                            <header className="os-jira-feed-item__head">
                              <strong>{cmt.authorName}</strong>
                              <span className="os-jira-feed-item__role">{cmt.authorRole}</span>
                              <span
                                className={`os-jira-badge ${
                                  cmt.kind === 'customer' ? 'os-jira-badge--pub' : 'os-jira-badge--int'
                                }`}
                              >
                                {cmt.kind === 'customer' ? 'Público' : 'Interno'}
                              </span>
                              <time>
                                {new Date(cmt.createdAt).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </time>
                            </header>
                            <p>{cmt.content}</p>
                          </div>
                        </article>
                      ))
                  )}
                </div>
              )}
            </section>
          </main>

          {/* Coluna Direita: Accordions de Informações & Funções Rápidas (Imagens 3 & 4) */}
          <aside className="os-jira-sidebar">
            {/* Accordion 1: Meus campos fixados */}
            <div className="os-jira-accordion">
              <button
                type="button"
                className="os-jira-accordion__header"
                onClick={() => setOpenPinned((v) => !v)}
              >
                <span>{openPinned ? '⌄' : '›'}</span>
                <strong>Meus campos fixados</strong>
              </button>
              {openPinned ? (
                <div className="os-jira-accordion__content">
                  <div className="os-jira-field-row">
                    <span className="os-jira-field-name">Justificativa / Atenção</span>
                    <span className="os-jira-field-val">
                      {order.priority === 'urgent'
                        ? 'Prioridade máxima: cliente precisa com urgência.'
                        : 'Entrada padrão sem impedimentos.'}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Accordion 2: Informações da OS (Prioridade, Sprint, Técnico, Datas) */}
            <div className="os-jira-accordion">
              <button
                type="button"
                className="os-jira-accordion__header"
                onClick={() => setOpenInfo((v) => !v)}
              >
                <span>{openInfo ? '⌄' : '›'}</span>
                <strong>Informações</strong>
              </button>
              {openInfo ? (
                <div className="os-jira-accordion__content">
                  {/* Seletor de Prioridade Exatamente como a Imagem 1! */}
                  <div className="os-jira-field-row">
                    <span className="os-jira-field-name">Prioridade</span>
                    <div className="os-jira-priority-menu-wrap">
                      <button
                        type="button"
                        className="os-jira-p-select-btn"
                        style={{ color: pData.color }}
                        onClick={() => setPMenuOpen((v) => !v)}
                      >
                        <strong>{pData.symbol}</strong>
                        <span>{pData.label}</span>
                        <span className="os-jira-chevron">▾</span>
                      </button>

                      {pMenuOpen ? (
                        <div className="os-jira-dropdown os-jira-p-dropdown">
                          <button
                            type="button"
                            className="os-jira-p-item os-jira-p-item--highest"
                            onClick={() => handleChangePriority('urgent')}
                          >
                            <span className="os-jira-p-sym">⇈</span>
                            <span>Highest (Urgente)</span>
                          </button>
                          <button
                            type="button"
                            className="os-jira-p-item os-jira-p-item--high"
                            onClick={() => handleChangePriority('high')}
                          >
                            <span className="os-jira-p-sym">↑</span>
                            <span>High (Alta)</span>
                          </button>
                          <button
                            type="button"
                            className="os-jira-p-item os-jira-p-item--medium"
                            onClick={() => handleChangePriority('normal')}
                          >
                            <span className="os-jira-p-sym">=</span>
                            <span>Medium (Normal)</span>
                          </button>
                          <button
                            type="button"
                            className="os-jira-p-item os-jira-p-item--low"
                            onClick={() => handleChangePriority('low')}
                          >
                            <span className="os-jira-p-sym">↓</span>
                            <span>Low (Baixa)</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="os-jira-field-row">
                    <span className="os-jira-field-name">Técnico</span>
                    <div className="os-jira-tech-val" style={{ flex: 1 }}>
                      {tech ? (
                        <img src={tech.avatarUrl} alt={tech.name} className="os-jira-tiny-avatar" />
                      ) : (
                        <span className="os-jira-tiny-avatar os-jira-tiny-avatar--placeholder" title="Sem técnico">
                          👤
                        </span>
                      )}
                      <select
                        className="os-select os-jira-tech-select"
                        value={order.technician || ''}
                        onChange={(e) => void handleChangeTechnician(e.target.value)}
                        style={{ fontSize: '0.82rem', padding: '4px 8px', height: 32, flex: 1, minWidth: 0 }}
                      >
                        <option value="">Não atribuído</option>
                        {TECHNICIANS_LIST.map((t) => (
                          <option key={t.id} value={t.name}>
                            {t.name} ({t.specialty})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="os-jira-field-row">
                    <span className="os-jira-field-name">Ciclo de Tarefas</span>
                    <span className="os-jira-sprint-tag">
                      {getActiveOperation().title}
                    </span>
                  </div>

                  <div className="os-jira-field-row">
                    <span className="os-jira-field-name">Data de Entrada</span>
                    <span>
                      {new Date(order.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div className="os-jira-field-row">
                    <span className="os-jira-field-name">Data limite</span>
                    <span>{order.estimatedReadyAt || 'Não definida'}</span>
                  </div>

                  <div className="os-jira-field-row">
                    <span className="os-jira-field-name">Story Points / Horas</span>
                    <span className="os-jira-points-badge">{order.spentMinutes || 0}m</span>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Accordion 3: Ações Rápidas da Oficina */}
            <div className="os-jira-accordion">
              <button
                type="button"
                className="os-jira-accordion__header"
                onClick={() => setOpenActions((v) => !v)}
              >
                <span>{openActions ? '⌄' : '›'}</span>
                <strong>Funções Rápidas da OS</strong>
              </button>
              {openActions ? (
                <div className="os-jira-accordion__content os-jira-quick-actions-col">
                  {/* Cronômetro */}
                  <div className="os-jira-timer-box">
                    <div className="os-jira-timer-info">
                      <span>Tempo em bancada:</span>
                      <strong>{order.spentMinutes || 0} min</strong>
                    </div>
                    <button
                      type="button"
                      className={`btn btn--sm os-jira-timer-btn ${
                        order.isTimerRunning ? 'is-running' : ''
                      }`}
                      onClick={handleToggleTimer}
                      title={order.isTimerRunning ? 'Pausar cronômetro' : 'Iniciar cronômetro de bancada'}
                    >
                      {order.isTimerRunning ? '⏸ Pausar' : '▶ Iniciar'}
                    </button>
                  </div>

                  {/* WhatsApp */}
                  <div className="os-jira-wa-group">
                    <span className="os-jira-sub-label">Notificar Cliente (WhatsApp):</span>
                    <div className="os-jira-wa-buttons">
                      <a
                        href={getWhatsAppUrl('created')}
                        target="_blank"
                        rel="noreferrer"
                        className="os-jira-wa-btn"
                        title="Enviar mensagem de recebimento do aparelho"
                      >
                        💬 Entrada
                      </a>
                      <a
                        href={getWhatsAppUrl('quote')}
                        target="_blank"
                        rel="noreferrer"
                        className="os-jira-wa-btn"
                        title="Enviar mensagem com valor do orçamento"
                      >
                        💬 Orçamento
                      </a>
                      <a
                        href={getWhatsAppUrl('ready')}
                        target="_blank"
                        rel="noreferrer"
                        className="os-jira-wa-btn"
                        title="Enviar aviso de aparelho pronto para retirada"
                      >
                        💬 Pronta
                      </a>
                    </div>
                  </div>

                  {/* Links de Relatório e Acesso Direto */}
                  <div className="os-jira-action-links">
                    <Link
                      to={`/os/${order.id}/relatorio`}
                      className="btn btn--sm btn--ghost os-jira-side-link"
                    >
                      📄 Ver Relatório Detalhado
                    </Link>
                    <Link
                      to={`/os/${order.id}`}
                      className="btn btn--sm btn--ghost os-jira-side-link"
                    >
                      ↗ Abrir Página Completa
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Accordion 4: Automação ⚡ (Imagem 4) */}
            <div className="os-jira-accordion">
              <button
                type="button"
                className="os-jira-accordion__header"
                onClick={() => setOpenAutomation((v) => !v)}
              >
                <span>{openAutomation ? '⌄' : '›'}</span>
                <strong>Automação ⚡</strong>
                <small className="os-jira-accordion__sub">Execuções de regras</small>
              </button>
              {openAutomation ? (
                <div className="os-jira-accordion__content">
                  <p className="os-jira-empty-hint">
                    Regra ativa: Notificação automática ao mudar para &quot;Pronta&quot; e cálculo de custos.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="os-jira-footer-meta">
              <span>Criado: <strong>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</strong></span>
              <span>Atualizado: <strong>{new Date(order.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
            </div>
          </aside>
        </div>
      </div>

      <OsPrintModal
        order={order}
        open={printOpen}
        onClose={() => setPrintOpen(false)}
      />
    </div>
  );
}
