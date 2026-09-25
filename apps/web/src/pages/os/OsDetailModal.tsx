import { useState, useMemo, type ChangeEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { OsPrintModal } from './OsPrintModal';
import { OsSimplifiedCheckoutModal } from './OsSimplifiedCheckoutModal';
import { OsProductQuickModal } from './OsProductQuickModal';
import { useAuth } from '../../contexts/AuthContext';
import {
  addWorkOrderAttachment,
  addWorkOrderComment,
  addWorkOrderWorklog,
  findWorkOrdersByCustomer,
  findWorkOrdersByItemRef,
  getActiveOperation,
  removeWorkOrderAttachment,
  STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  TECHNICIANS_LIST,
  toggleWorkOrderTimer,
  updateWorkOrder,
  workOrderTotal,
  workOrderFinancialSummary,
  type WorkOrder,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../../data/osStore';
import { useStoreCustomization } from '../../data/storeSegment';
import {
  getWorkshopCheckoutMode,
  hasRetaguardaModule,
} from '../../data/storePlan';

const LIFECYCLE_STAGES: WorkOrderStatus[] = [
  'backlog',
  'open',
  'diagnosis',
  'waiting',
  'progress',
  'reproved',
  'ready',
  'delivered',
];

type Props = {
  order: WorkOrder | null;
  onClose: () => void;
  onOrderUpdated: (updated: WorkOrder) => void;
};

type ActivityTab = 'all' | 'comments' | 'history' | 'audit';

type JiraFeedItem =
  | {
      id: string;
      kind: 'comment';
      authorName: string;
      authorPhoto?: string;
      authorRole?: string;
      commentType: 'internal' | 'customer' | 'system';
      content: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: 'history';
      authorName: string;
      authorPhoto?: string;
      authorRole?: string;
      field: string;
      action: 'alterou' | 'adicionou' | 'atualizou' | 'removeu';
      fromValue?: string;
      toValue: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: 'worklog';
      authorName: string;
      authorPhoto?: string;
      authorRole?: string;
      timeSpentFormatted: string;
      minutesSpent: number;
      description: string;
      createdAt: string;
    };

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
function getAvatarColor(name: string): string {
  const colors = ['#ea580c', '#0284c7', '#16a34a', '#7c3aed', '#db2777', '#0891b2', '#ca8a04'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatTimeAgo(isoString?: string): string {
  if (!isoString) return '';
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMin < 1) return 'agora mesmo';
    if (diffMin < 60) return `há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
    if (diffHours < 24) return `há ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
    if (diffDays === 1) return 'ontem';
    if (diffDays < 7) return `há ${diffDays} dias`;

    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function OsDetailModal({ order, onClose, onOrderUpdated }: Props) {
  const customization = useStoreCustomization();
  const { user } = useAuth();
  const [fullscreen, setFullscreen] = useState(false);
  const [activityTab, setActivityTab] = useState<ActivityTab>('all');
  const [sortDesc, setSortDesc] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentKind, setCommentKind] = useState<'internal' | 'customer'>('internal');
  const [showWorklogForm, setShowWorklogForm] = useState(false);
  const [worklogMinutes, setWorklogMinutes] = useState('60');
  const [worklogDescription, setWorklogDescription] = useState('');
  const [worklogTech, setWorklogTech] = useState('');
  const [worklogDate, setWorklogDate] = useState(() => new Date().toISOString().slice(0, 10));
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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const navigate = useNavigate();
  const checkoutMode = getWorkshopCheckoutMode();
  const hasRetaguarda = hasRetaguardaModule();

  function handleFinalizeOrReceive() {
    if (!order) return;
    if (checkoutMode === 'os_standalone') {
      setCheckoutOpen(true);
    } else {
      const laborLines =
        order.labor > 0
          ? [
              {
                name: `OS #${order.id} - Mão de obra / Serviço (${order.itemName})`,
                qty: 1,
                price: order.labor,
              },
            ]
          : [];
      const partsLines =
        order.lines && order.lines.some((l) => l.kind === 'part')
          ? order.lines
              .filter((l) => l.kind === 'part')
              .map((l) => ({
                stockId: l.stockId,
                name: `OS #${order.id} - ${l.name}`,
                qty: l.qty,
                price: l.unitPrice,
              }))
          : order.parts > 0
          ? [{ name: `OS #${order.id} - Peças e Materiais`, qty: 1, price: order.parts }]
          : [];

      navigate('/caixa', {
        state: {
          osId: order.id,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerDocument: order.customerDocument,
          lines: [...laborLines, ...partsLines],
        },
      });
    }
  }

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
  const attachments = order.attachments ?? [];
  const pData = priorityMeta(order.priority);
  const total = workOrderTotal(order);
  const finSummary = workOrderFinancialSummary(order);

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

  const worklogs = order.worklogs ?? [];
  const totalWorklogMinutes = useMemo(() => {
    return worklogs.reduce((acc, w) => acc + (w.minutesSpent || 0), 0);
  }, [worklogs]);

  function formatTotalTime(mins: number) {
    if (mins <= 0) return '0m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  const feedItems = useMemo<JiraFeedItem[]>(() => {
    if (!order) return [];
    const items: JiraFeedItem[] = [];

    // Comments
    (order.comments ?? []).forEach((c) => {
      items.push({
        id: c.id,
        kind: 'comment',
        authorName: c.authorName,
        authorPhoto: c.authorPhoto,
        authorRole: c.authorRole,
        commentType: c.kind,
        content: c.content,
        createdAt: c.createdAt,
      });
    });

    // History
    (order.history ?? []).forEach((h) => {
      items.push({
        id: h.id,
        kind: 'history',
        authorName: h.authorName,
        authorPhoto: h.authorPhoto,
        authorRole: h.authorRole,
        field: h.field,
        action: h.action,
        fromValue: h.fromValue,
        toValue: h.toValue,
        createdAt: h.createdAt,
      });
    });

    // If order has no history entries yet, provide an initial opening event
    if ((order.history ?? []).length === 0) {
      items.push({
        id: `hist-open-${order.id}`,
        kind: 'history',
        authorName: 'Triagem / Recepção',
        authorRole: 'Atendimento',
        field: 'Status',
        action: 'adicionou',
        fromValue: 'Nenhum',
        toValue: STATUS_LABEL[order.status] || 'Aberta',
        createdAt: order.createdAt,
      });
    }

    // Worklogs
    (order.worklogs ?? []).forEach((w) => {
      items.push({
        id: w.id,
        kind: 'worklog',
        authorName: w.technicianName,
        authorPhoto: w.technicianPhoto,
        authorRole: w.technicianRole,
        timeSpentFormatted: w.timeSpentFormatted || `${w.minutesSpent}m`,
        minutesSpent: w.minutesSpent,
        description: w.description,
        createdAt: w.createdAt,
      });
    });

    // Sort by createdAt
    items.sort((a, b) => {
      const tA = new Date(a.createdAt).getTime();
      const tB = new Date(b.createdAt).getTime();
      return sortDesc ? tB - tA : tA - tB;
    });

    return items;
  }, [order?.id, order?.comments, order?.history, order?.worklogs, order?.status, order?.createdAt, sortDesc]);

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
        authorName: user?.name || 'Ramon de Freitas',
        authorRole: 'Analista de Suporte',
        authorPhoto: user?.picture || undefined,
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

  function handleInsertSuggestion(text: string) {
    setCommentText(text);
    const area = document.getElementById('jira-comment-input');
    if (area) area.focus();
  }

  async function handleAddWorklog() {
    if (!order) return;
    let mins = 0;
    const rawVal = worklogMinutes.trim().toLowerCase();
    if (rawVal.includes('h') || rawVal.includes('m')) {
      const hMatch = rawVal.match(/(\d+)\s*h/);
      const mMatch = rawVal.match(/(\d+)\s*m/);
      if (hMatch) mins += parseInt(hMatch[1], 10) * 60;
      if (mMatch) mins += parseInt(mMatch[1], 10);
    } else {
      mins = parseInt(rawVal, 10) || 0;
    }
    if (mins <= 0) mins = 30;

    if (!worklogDescription.trim()) {
      setToast('Por favor, informe a descrição do trabalho realizado.');
      setTimeout(() => setToast(''), 2500);
      return;
    }

    setBusy(true);
    try {
      const updated = await addWorkOrderWorklog(order.id, {
        technicianName: worklogTech || order.technician || user?.name || 'Carlos Lima',
        technicianRole: 'Bancada Técnica',
        minutesSpent: mins,
        description: worklogDescription.trim(),
        startedAt: worklogDate ? `${worklogDate}T10:00:00` : new Date().toISOString(),
      });
      if (updated) onOrderUpdated(updated);
      setShowWorklogForm(false);
      setWorklogDescription('');
      setWorklogMinutes('60');
      setToast('Horário de serviço registrado com sucesso!');
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
    if (s === 'delivered' && order.paymentStatus !== 'paid' && workOrderTotal(order) > 0) {
      handleFinalizeOrReceive();
      return;
    }
    const updated = await updateWorkOrder(order.id, { status: s });
    if (updated) onOrderUpdated(updated);
  }

  async function handleReproveOrder() {
    if (!order) return;
    const reason = window.prompt(
      'Informe o motivo da reprovação na entrega ao cliente (ex: Esqueceu de ajustar botões de volume):',
      'Botões de volume não ajustados conforme solicitado pelo cliente',
    );
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try {
      await addWorkOrderComment(order.id, {
        authorName: 'Controle de Entrega',
        authorRole: 'Triagem / Recepção',
        content: `⚠️ REPROVADA NA ENTREGA: ${reason.trim()}. Retornado ao técnico para continuidade e ajuste.`,
        kind: 'system',
      });
      const updated = await updateWorkOrder(order.id, {
        status: 'reproved',
        notes: order.notes
          ? `${order.notes} | [Reprovada]: ${reason.trim()}`
          : `[Reprovada]: ${reason.trim()}`,
      });
      if (updated) {
        onOrderUpdated(updated);
        setToast('OS reprovada e devolvida para a bancada técnica.');
        setTimeout(() => setToast(''), 3000);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeRework() {
    if (!order) return;
    setBusy(true);
    try {
      await addWorkOrderComment(order.id, {
        authorName: order.technician || 'Técnico Responsável',
        authorRole: 'Bancada Técnica',
        content: 'Retomando tarefa para continuidade e conclusão das pendências apontadas.',
        kind: 'internal',
      });
      const updated = await updateWorkOrder(order.id, { status: 'progress' });
      if (updated) {
        onOrderUpdated(updated);
        setToast('Tarefa retomada em serviço.');
        setTimeout(() => setToast(''), 3000);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleStartBacklog() {
    if (!order) return;
    setBusy(true);
    try {
      await addWorkOrderComment(order.id, {
        authorName: 'Operações Oficina',
        authorRole: 'Gestão de Tarefas',
        content: 'Tarefa retirada do backlog e iniciada nas operações ativas.',
        kind: 'system',
      });
      const updated = await updateWorkOrder(order.id, { status: 'open' });
      if (updated) {
        onOrderUpdated(updated);
        setToast('Tarefa iniciada nas operações ativas!');
        setTimeout(() => setToast(''), 3000);
      }
    } finally {
      setBusy(false);
    }
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

        {order.status === 'reproved' ? (
          <div className="os-jira-reproved-banner">
            <div className="os-jira-reproved-text">
              <strong>⚠️ TAREFA REPROVADA NA ENTREGA / RETRABALHO</strong>
              <p>O cliente ou o controle de entrega identificou pendências no serviço (ex: botões, acabamento). O técnico deve dar continuidade na bancada.</p>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleResumeRework}
              disabled={busy}
            >
              ▶ Retomar para Em serviço (Dar continuidade)
            </button>
          </div>
        ) : null}

        {order.status === 'backlog' ? (
          <div className="os-jira-backlog-banner">
            <div className="os-jira-backlog-text">
              <strong>⏳ TAREFA NÃO INICIALIZADA (BACKLOG)</strong>
              <p>Esta OS foi criada mas ainda não está dentro das operações ativas da oficina.</p>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              onClick={handleStartBacklog}
              disabled={busy}
            >
              🚀 Iniciar Operação (Mover para Aberta)
            </button>
          </div>
        ) : null}

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
                    {(finSummary.status !== 'pending' || finSummary.paid > 0) ? (
                      <tr>
                        <th>Recebimento</th>
                        <td>
                          <span
                            className={`os-status-pill ${
                              finSummary.status === 'paid'
                                ? 'os-status-pill--delivered'
                                : finSummary.status === 'partially_paid'
                                ? 'os-status-pill--waiting'
                                : 'os-status-pill--open'
                            }`}
                          >
                            {PAYMENT_STATUS_LABEL[finSummary.status]}
                          </span>
                          {finSummary.paid > 0 ? ` · Pago: ${money(finSummary.paid)}` : ''}
                          {finSummary.remaining > 0 ? ` · Restante: ${money(finSummary.remaining)}` : ''}
                        </td>
                      </tr>
                    ) : null}
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

            {/* Seção de Atividade & Comentários (Jira Style) */}
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

                <button
                  type="button"
                  className="os-jira-sort-btn"
                  title={sortDesc ? 'Ordem: Mais recente primeiro (clique para alternar)' : 'Ordem: Mais antigo primeiro (clique para alternar)'}
                  onClick={() => setSortDesc((v) => !v)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M3 12h12M3 18h6M19 12l3 3m0 0l-3 3m3-3h-7" />
                  </svg>
                </button>
              </div>

              {/* Caixa de Novo Comentário Jira com sugestões (Exibida em 'Tudo' e 'Comentários') */}
              {(activityTab === 'all' || activityTab === 'comments') && (
                <div className="os-jira-new-comment-wrap">
                  <div className="os-jira-comment-avatar-col">
                    {user?.picture ? (
                      <img
                        src={user.picture}
                        alt={user.name || 'Usuário'}
                        className="os-jira-user-avatar"
                      />
                    ) : (
                      <div
                        className="os-jira-feed-avatar-initials"
                        style={{
                          backgroundColor: getAvatarColor(user?.name || 'Ramon de Freitas'),
                          width: 32,
                          height: 32,
                          fontSize: '0.78rem',
                        }}
                      >
                        {getInitials(user?.name || 'Ramon de Freitas')}
                      </div>
                    )}
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

                      {/* Chips de sugestão rápida */}
                      <div className="os-jira-suggestion-chips">
                        <button
                          type="button"
                          onClick={() =>
                            handleInsertSuggestion(
                              'Aparelho em bancada para análise técnica. Aguardando validação de peças e autorização.',
                            )
                          }
                        >
                          Sugira uma resposta...
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleInsertSuggestion(
                              'Atualização de status: Serviço em andamento pelo técnico responsável.',
                            )
                          }
                        >
                          Atualização de status...
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleInsertSuggestion(
                              'Serviço concluído com sucesso. Equipamento disponível para retirada e testes de entrega.',
                            )
                          }
                        >
                          A gente agradece...
                        </button>
                      </div>

                      <div className="os-jira-comment-box__actions">
                        <div className="os-jira-comment-kind-toggle">
                          <label className="os-jira-radio-label">
                            <input
                              type="radio"
                              name="detailCommentKind"
                              checked={commentKind === 'internal'}
                              onChange={() => setCommentKind('internal')}
                            />
                            <span>Nota Interna</span>
                          </label>
                          <label className="os-jira-radio-label">
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
                          className="os-jira-btn-comment"
                          disabled={busy || !commentText.trim()}
                          onClick={() => handleAddComment()}
                        >
                          {busy ? 'Salvando…' : 'Salvar Comentário'}
                        </button>
                      </div>
                    </div>
                    <p className="os-jira-shortcut-hint">
                      Dica de ouro: aperte <kbd>M</kbd> para fazer comentários
                    </p>
                  </div>
                </div>
              )}

              {/* Feed conforme Tab Selecionada */}
              {activityTab === 'all' && (
                <div className="os-jira-feed">
                  {feedItems.length === 0 ? (
                    <p className="os-jira-empty-hint">Nenhuma atividade registrada ainda nesta Ordem de Serviço.</p>
                  ) : (
                    feedItems.map((item) => {
                      if (item.kind === 'comment') {
                        return (
                          <article key={item.id} className="os-jira-feed-item os-jira-feed-item--comment">
                            <div className="os-jira-feed-item__avatar">
                              {item.authorPhoto ? (
                                <img src={item.authorPhoto} alt={item.authorName} />
                              ) : (
                                <div
                                  className="os-jira-feed-avatar-initials"
                                  style={{ backgroundColor: getAvatarColor(item.authorName) }}
                                >
                                  {getInitials(item.authorName)}
                                </div>
                              )}
                            </div>
                            <div className="os-jira-feed-item__body">
                              <header className="os-jira-feed-item__head">
                                <div className="os-jira-feed-item__title-row">
                                  <strong className="os-jira-feed-author">{item.authorName}</strong>
                                  <span className="os-jira-feed-action">adicionou um Comentário</span>
                                  {item.authorRole && (
                                    <span className="os-jira-feed-item__role">({item.authorRole})</span>
                                  )}
                                  <span
                                    className={`os-jira-badge ${
                                      item.commentType === 'customer'
                                        ? 'os-jira-badge--pub'
                                        : 'os-jira-badge--int'
                                    }`}
                                  >
                                    {item.commentType === 'customer' ? 'Público' : 'Interno'}
                                  </span>
                                </div>
                                <time className="os-jira-feed-time">{formatTimeAgo(item.createdAt)}</time>
                                <span className="os-jira-feed-tag">Comentários</span>
                              </header>
                              <div className="os-jira-feed-item__content">
                                <p>{item.content}</p>
                              </div>
                            </div>
                          </article>
                        );
                      }

                      if (item.kind === 'history') {
                        return (
                          <article key={item.id} className="os-jira-feed-item os-jira-feed-item--history">
                            <div className="os-jira-feed-item__avatar">
                              {item.authorPhoto ? (
                                <img src={item.authorPhoto} alt={item.authorName} />
                              ) : (
                                <div
                                  className="os-jira-feed-avatar-initials"
                                  style={{ backgroundColor: getAvatarColor(item.authorName) }}
                                >
                                  {getInitials(item.authorName)}
                                </div>
                              )}
                            </div>
                            <div className="os-jira-feed-item__body">
                              <header className="os-jira-feed-item__head">
                                <div className="os-jira-feed-item__title-row">
                                  <strong className="os-jira-feed-author">{item.authorName}</strong>
                                  <span className="os-jira-feed-action">
                                    {item.action === 'alterou'
                                      ? 'alterou o'
                                      : item.action === 'adicionou'
                                      ? 'adicionou um'
                                      : item.action === 'atualizou'
                                      ? 'atualizou o'
                                      : 'removeu o'}{' '}
                                    <strong>{item.field}</strong>
                                  </span>
                                </div>
                                <time className="os-jira-feed-time">{formatTimeAgo(item.createdAt)}</time>
                                <span className="os-jira-feed-tag">Histórico</span>
                              </header>
                              <div className="os-jira-diff-row">
                                {item.fromValue && item.fromValue !== 'Nenhuma' && item.fromValue !== 'Nenhum' ? (
                                  <span
                                    className={`os-jira-diff-pill ${
                                      item.field.toLowerCase() === 'status' ? 'os-jira-diff-pill--status' : ''
                                    }`}
                                  >
                                    {item.fromValue}
                                  </span>
                                ) : (
                                  <span className="os-jira-diff-none">Nenhuma</span>
                                )}
                                <span className="os-jira-diff-arrow">→</span>
                                <span
                                  className={`os-jira-diff-pill ${
                                    item.field.toLowerCase() === 'status' ? 'os-jira-diff-pill--status' : ''
                                  }`}
                                >
                                  {item.toValue}
                                </span>
                              </div>
                            </div>
                          </article>
                        );
                      }

                      if (item.kind === 'worklog') {
                        return (
                          <article key={item.id} className="os-jira-feed-item os-jira-feed-item--worklog">
                            <div className="os-jira-feed-item__avatar">
                              {item.authorPhoto ? (
                                <img src={item.authorPhoto} alt={item.authorName} />
                              ) : (
                                <div
                                  className="os-jira-feed-avatar-initials"
                                  style={{ backgroundColor: getAvatarColor(item.authorName) }}
                                >
                                  {getInitials(item.authorName)}
                                </div>
                              )}
                            </div>
                            <div className="os-jira-feed-item__body">
                              <header className="os-jira-feed-item__head">
                                <div className="os-jira-feed-item__title-row">
                                  <strong className="os-jira-feed-author">{item.authorName}</strong>
                                  <span className="os-jira-feed-action">registrou horário de serviço</span>
                                  {item.authorRole && (
                                    <span className="os-jira-feed-item__role">({item.authorRole})</span>
                                  )}
                                </div>
                                <time className="os-jira-feed-time">{formatTimeAgo(item.createdAt)}</time>
                                <span className="os-jira-feed-tag">Registro de atividades</span>
                              </header>
                              <div className="os-jira-worklog-feed-detail">
                                <span className="os-jira-worklog-badge">⏱️ {item.timeSpentFormatted}</span>
                                <p className="os-jira-worklog-desc">{item.description}</p>
                              </div>
                            </div>
                          </article>
                        );
                      }

                      return null;
                    })
                  )}
                </div>
              )}

              {/* Aba Comentários (Apenas comentários) */}
              {activityTab === 'comments' && (
                <div className="os-jira-feed">
                  {feedItems.filter((i) => i.kind === 'comment').length === 0 ? (
                    <p className="os-jira-empty-hint">Nenhum comentário registrado ainda.</p>
                  ) : (
                    feedItems
                      .filter((i) => i.kind === 'comment')
                      .map((cmt) => (
                        <article key={cmt.id} className="os-jira-feed-item os-jira-feed-item--comment">
                          <div className="os-jira-feed-item__avatar">
                            {cmt.authorPhoto ? (
                              <img src={cmt.authorPhoto} alt={cmt.authorName} />
                            ) : (
                              <div
                                className="os-jira-feed-avatar-initials"
                                style={{ backgroundColor: getAvatarColor(cmt.authorName) }}
                              >
                                {getInitials(cmt.authorName)}
                              </div>
                            )}
                          </div>
                          <div className="os-jira-feed-item__body">
                            <header className="os-jira-feed-item__head">
                              <div className="os-jira-feed-item__title-row">
                                <strong className="os-jira-feed-author">{cmt.authorName}</strong>
                                {cmt.authorRole && (
                                  <span className="os-jira-feed-item__role">({cmt.authorRole})</span>
                                )}
                                <span
                                  className={`os-jira-badge ${
                                    cmt.commentType === 'customer'
                                      ? 'os-jira-badge--pub'
                                      : 'os-jira-badge--int'
                                  }`}
                                >
                                  {cmt.commentType === 'customer' ? 'Público' : 'Interno'}
                                </span>
                              </div>
                              <time className="os-jira-feed-time">{formatTimeAgo(cmt.createdAt)}</time>
                            </header>
                            <div className="os-jira-feed-item__content">
                              <p>{cmt.content}</p>
                            </div>
                          </div>
                        </article>
                      ))
                  )}
                </div>
              )}

              {/* Aba Histórico (Auditoria de mudanças + Recorrência) */}
              {activityTab === 'history' && (
                <div className="os-jira-feed">
                  {feedItems.filter((i) => i.kind === 'history').length === 0 ? (
                    <p className="os-jira-empty-hint">Nenhuma alteração registrada no histórico.</p>
                  ) : (
                    feedItems
                      .filter((i) => i.kind === 'history')
                      .map((hist) => (
                        <article key={hist.id} className="os-jira-feed-item os-jira-feed-item--history">
                          <div className="os-jira-feed-item__avatar">
                            {hist.authorPhoto ? (
                              <img src={hist.authorPhoto} alt={hist.authorName} />
                            ) : (
                              <div
                                className="os-jira-feed-avatar-initials"
                                style={{ backgroundColor: getAvatarColor(hist.authorName) }}
                              >
                                {getInitials(hist.authorName)}
                              </div>
                            )}
                          </div>
                          <div className="os-jira-feed-item__body">
                            <header className="os-jira-feed-item__head">
                              <div className="os-jira-feed-item__title-row">
                                <strong className="os-jira-feed-author">{hist.authorName}</strong>
                                <span className="os-jira-feed-action">
                                  {hist.action === 'alterou'
                                    ? 'alterou o'
                                    : hist.action === 'adicionou'
                                    ? 'adicionou um'
                                    : hist.action === 'atualizou'
                                    ? 'atualizou o'
                                    : 'removeu o'}{' '}
                                  <strong>{hist.field}</strong>
                                </span>
                              </div>
                              <time className="os-jira-feed-time">{formatTimeAgo(hist.createdAt)}</time>
                            </header>
                            <div className="os-jira-diff-row">
                              {hist.fromValue && hist.fromValue !== 'Nenhuma' && hist.fromValue !== 'Nenhum' ? (
                                <span
                                  className={`os-jira-diff-pill ${
                                    hist.field.toLowerCase() === 'status' ? 'os-jira-diff-pill--status' : ''
                                  }`}
                                >
                                  {hist.fromValue}
                                </span>
                              ) : (
                                <span className="os-jira-diff-none">Nenhuma</span>
                              )}
                              <span className="os-jira-diff-arrow">→</span>
                              <span
                                className={`os-jira-diff-pill ${
                                  hist.field.toLowerCase() === 'status' ? 'os-jira-diff-pill--status' : ''
                                }`}
                              >
                                {hist.toValue}
                              </span>
                            </div>
                          </div>
                        </article>
                      ))
                  )}

                  {/* Recorrência / OS Anteriores */}
                  <div className="os-jira-recurrence-wrap">
                    <strong className="os-jira-recurrence-title">
                      Atendimentos Anteriores (Recorrência)
                    </strong>
                    {relatedByImei.length === 0 && relatedByCustomer.length === 0 ? (
                      <p className="os-jira-empty-hint" style={{ marginTop: 4 }}>
                        Primeiro atendimento registrado deste cliente / equipamento na oficina.
                      </p>
                    ) : (
                      <div className="os-jira-recurrence-list">
                        {relatedByImei.map((prev) => (
                          <div key={prev.id} className="os-jira-recurrence-item">
                            <strong>{prev.id}</strong> (Mesmo equipamento) · {STATUS_LABEL[prev.status]} ·{' '}
                            {new Date(prev.createdAt).toLocaleDateString('pt-BR')}
                            {prev.defect ? (
                              <div className="os-jira-recurrence-sub">Defeito: {prev.defect}</div>
                            ) : null}
                          </div>
                        ))}
                        {relatedByCustomer.map((prev) => (
                          <div key={prev.id} className="os-jira-recurrence-item">
                            <strong>{prev.id}</strong> · {prev.itemName || 'Equipamento'} ·{' '}
                            {STATUS_LABEL[prev.status]} ·{' '}
                            {new Date(prev.createdAt).toLocaleDateString('pt-BR')}
                            {prev.defect ? (
                              <div className="os-jira-recurrence-sub">Defeito: {prev.defect}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Aba Registro de Atividades (Worklog / Time Tracking) */}
              {activityTab === 'audit' && (
                <div className="os-jira-worklog-wrap">
                  {/* Formulário inline para registrar horário */}
                  {showWorklogForm ? (
                    <div className="os-jira-worklog-form">
                      <h4 className="os-jira-worklog-form__title">Registrar horário de trabalho</h4>
                      <div className="os-jira-worklog-form__grid">
                        <div className="os-jira-worklog-form__field">
                          <label>Tempo gasto (ex: 1h 30m ou 45m)</label>
                          <input
                            type="text"
                            value={worklogMinutes}
                            onChange={(e) => setWorklogMinutes(e.target.value)}
                            placeholder="Ex: 1h 30m, 45m"
                          />
                        </div>
                        <div className="os-jira-worklog-form__field">
                          <label>Técnico Responsável</label>
                          <select
                            value={worklogTech || order.technician || ''}
                            onChange={(e) => setWorklogTech(e.target.value)}
                          >
                            <option value="">Selecione o técnico</option>
                            {TECHNICIANS_LIST.map((t) => (
                              <option key={t.id} value={t.name}>
                                {t.name} ({t.role})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="os-jira-worklog-form__field">
                          <label>Data da execução</label>
                          <input
                            type="date"
                            value={worklogDate}
                            onChange={(e) => setWorklogDate(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="os-jira-worklog-form__field" style={{ marginTop: 10 }}>
                        <label>Descrição do serviço realizado</label>
                        <textarea
                          rows={2}
                          value={worklogDescription}
                          onChange={(e) => setWorklogDescription(e.target.value)}
                          placeholder="Descreva o que foi feito na bancada (testes, troca de peças, reparo de placa...)"
                        />
                      </div>
                      <div className="os-jira-worklog-form__actions">
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={busy || !worklogDescription.trim()}
                          onClick={handleAddWorklog}
                        >
                          {busy ? 'Salvando…' : 'Salvar Registro'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setShowWorklogForm(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {/* Estado Vazio (Imagem 4 - Stopwatch) */}
                  {worklogs.length === 0 && !showWorklogForm ? (
                    <div className="os-jira-worklog-empty">
                      <div className="os-jira-stopwatch-illustration">
                        <svg
                          width="120"
                          height="120"
                          viewBox="0 0 120 120"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          {/* Alça superior */}
                          <path
                            d="M60 14 C54 14 50 18 50 24 C50 25 51 26 52 26 L68 26 C69 26 70 25 70 24 C70 18 66 14 60 14 Z"
                            stroke="#388bff"
                            strokeWidth="4"
                            fill="none"
                          />
                          {/* Botão central empurrador */}
                          <rect x="56" y="24" width="8" height="8" rx="2" fill="#388bff" />
                          {/* Botão lateral esquerdo laranja */}
                          <path
                            d="M32 30 L25 37"
                            stroke="#ff8b00"
                            strokeWidth="6"
                            strokeLinecap="round"
                          />
                          {/* Botão lateral direito azul claro */}
                          <path
                            d="M88 30 L95 37"
                            stroke="#96c0ff"
                            strokeWidth="6"
                            strokeLinecap="round"
                          />
                          {/* Aro externo / Bisel */}
                          <circle
                            cx="60"
                            cy="65"
                            r="44"
                            stroke="#388bff"
                            strokeWidth="7"
                            fill="#14181f"
                          />
                          {/* Marcações do cronômetro radiais (12 horas) */}
                          <line x1="60" y1="28" x2="60" y2="35" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="77" y1="33" x2="73.5" y2="39" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="91" y1="46" x2="85" y2="50" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="97" y1="65" x2="90" y2="65" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="91" y1="84" x2="85" y2="80" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="77" y1="97" x2="73.5" y2="91" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="60" y1="102" x2="60" y2="95" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="43" y1="97" x2="46.5" y2="91" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="29" y1="84" x2="35" y2="80" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="23" y1="65" x2="30" y2="65" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="29" y1="46" x2="35" y2="50" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          <line x1="43" y1="33" x2="46.5" y2="39" stroke="#f97066" strokeWidth="2.5" strokeLinecap="round" />
                          {/* Ponteiro e pivô central */}
                          <circle cx="60" cy="65" r="4.5" stroke="#388bff" strokeWidth="3" fill="#14181f" />
                          <line x1="60" y1="65" x2="68" y2="38" stroke="#388bff" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                      </div>
                      <p className="os-jira-worklog-empty-msg">
                        Ainda não foi registrado nenhum horário para esta Ordem de Serviço. O tempo de
                        registro permite acompanhar e relatar o tempo gasto no atendimento.
                      </p>
                      <button
                        type="button"
                        className="os-jira-worklog-link"
                        onClick={() => setShowWorklogForm(true)}
                      >
                        Registrar horário
                      </button>
                    </div>
                  ) : null}

                  {/* Lista de Registros de Horário (quando existem) */}
                  {worklogs.length > 0 ? (
                    <>
                      <div className="os-jira-worklog-header-bar">
                        <div className="os-jira-worklog-total">
                          <span>Tempo total registrado:</span>{' '}
                          <strong>{formatTotalTime(totalWorklogMinutes)}</strong>
                        </div>
                        {!showWorklogForm && (
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            onClick={() => setShowWorklogForm(true)}
                          >
                            + Registrar horário
                          </button>
                        )}
                      </div>

                      <div className="os-jira-worklog-list">
                        {worklogs.map((wlog) => (
                          <article key={wlog.id} className="os-jira-worklog-card">
                            <div className="os-jira-feed-item__avatar">
                              {wlog.technicianPhoto ? (
                                <img src={wlog.technicianPhoto} alt={wlog.technicianName} />
                              ) : (
                                <div
                                  className="os-jira-feed-avatar-initials"
                                  style={{
                                    backgroundColor: getAvatarColor(wlog.technicianName),
                                  }}
                                >
                                  {getInitials(wlog.technicianName)}
                                </div>
                              )}
                            </div>
                            <div className="os-jira-worklog-card__body">
                              <div className="os-jira-worklog-card__head">
                                <div>
                                  <strong className="os-jira-worklog-card__author">
                                    {wlog.technicianName}
                                  </strong>
                                  {wlog.technicianRole && (
                                    <span className="os-jira-worklog-card__role">
                                      {' '}
                                      · {wlog.technicianRole}
                                    </span>
                                  )}
                                </div>
                                <div className="os-jira-worklog-card__meta">
                                  <span className="os-jira-worklog-card__spent">
                                    ⏱️ {wlog.timeSpentFormatted || `${wlog.minutesSpent}m`}
                                  </span>
                                  <time className="os-jira-feed-time">
                                    {formatTimeAgo(wlog.createdAt)}
                                  </time>
                                </div>
                              </div>
                              <p className="os-jira-worklog-card__desc">{wlog.description}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  ) : null}
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
                    <div className="os-jira-tech-val" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-end' }}>
                      {tech ? (
                        <img src={tech.avatarUrl} alt={tech.name} className="os-jira-tiny-avatar" />
                      ) : (
                        <span className="os-jira-tiny-avatar os-jira-tiny-avatar--placeholder" title="Sem técnico">
                          👤
                        </span>
                      )}
                      <AdminPicker
                        compact
                        aria-label="Técnico responsável"
                        value={order.technician || ''}
                        options={[
                          { value: '', label: 'Não atribuído' },
                          ...TECHNICIANS_LIST.map((t) => ({
                            value: t.name,
                            label: `${t.name} (${t.specialty})`,
                          })),
                        ]}
                        onChange={(val) => void handleChangeTechnician(val)}
                        className="os-jira-tech-admin-picker"
                      />
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

                  {/* Links de Relatório, Impressão e Ações Operacionais */}
                  <div className="os-jira-action-links">
                    {/* Botão inteligente de recebimento */}
                    {order.status !== 'cancelled' && order.status !== 'delivered' && total > 0 ? (
                      <button
                        type="button"
                        className={`btn btn--sm os-jira-side-link ${
                          checkoutMode === 'os_standalone'
                            ? 'os-jira-side-link--success'
                            : 'os-jira-side-link--primary'
                        }`}
                        onClick={handleFinalizeOrReceive}
                        title={
                          checkoutMode === 'os_standalone'
                            ? 'Registrar pagamento desta OS'
                            : 'Enviar esta OS para o PDV/Caixa'
                        }
                      >
                        {checkoutMode === 'os_standalone' ? '💰 Receber Pagamento' : '🖥️ Enviar para o PDV'}
                      </button>
                    ) : null}

                    {/* Botão de cadastro rápido de produto (somente os_standalone) */}
                    {!hasRetaguarda ? (
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost os-jira-side-link"
                        onClick={() => setProductModalOpen(true)}
                        title="Cadastrar produto ou peça rapidamente"
                      >
                        📦 Cadastrar Produto / Peça
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className="btn btn--sm os-jira-side-link os-jira-side-link--print"
                      onClick={() => setPrintOpen(true)}
                      title="Pré-visualizar e Imprimir as 2 Vias (Bancada e Cliente)"
                    >
                      🖨️ Pré-visualizar Impressão (2 Vias)
                    </button>
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

                    {order.status !== 'reproved' && order.status !== 'delivered' && order.status !== 'cancelled' ? (
                      <button
                        type="button"
                        className="btn btn--sm os-jira-side-link os-jira-side-link--danger"
                        onClick={handleReproveOrder}
                        title="Reprovar serviço se na entrega o aparelho tiver pendências (ex: botões, teste)"
                      >
                        ⚠️ Reprovar Entrega (Retrabalho)
                      </button>
                    ) : null}

                    {order.status === 'reproved' ? (
                      <button
                        type="button"
                        className="btn btn--sm os-jira-side-link os-jira-side-link--success"
                        onClick={handleResumeRework}
                        title="Retornar OS para bancada técnica em serviço"
                      >
                        ▶ Retomar Tarefa (Em serviço)
                      </button>
                    ) : null}

                    {order.status === 'backlog' ? (
                      <button
                        type="button"
                        className="btn btn--sm os-jira-side-link os-jira-side-link--primary"
                        onClick={handleStartBacklog}
                        title="Iniciar tarefa nas operações da oficina"
                      >
                        🚀 Iniciar Tarefa na Operação
                      </button>
                    ) : null}
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

      <OsSimplifiedCheckoutModal
        open={checkoutOpen}
        order={order}
        onClose={() => setCheckoutOpen(false)}
        onPaymentRegistered={(updated) => {
          setCheckoutOpen(false);
          onOrderUpdated(updated);
        }}
      />

      <OsProductQuickModal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
      />
    </div>
  );
}
