import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import {
  BOARD_COLUMNS,
  getActiveOperation,
  listOperations,
  listWorkOrders,
  STATUS_LABEL,
  TECHNICIANS_LIST,
  updateWorkOrder,
  workOrderTotal,
  type QuoteStatus,
  type WorkOrder,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../../data/osStore';
import { osHref, useOsBase } from '../os/osPaths';
import { OsDetailModal } from '../os/OsDetailModal';
import { OsNewModal } from '../os/OsNewModal';
import { OsPrintModal } from '../os/OsPrintModal';
import { OsSprintModal } from '../os/OsSprintModal';
import { OsTechnicianRoadmap } from '../os/OsTechnicianRoadmap';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const DROP_STATUSES: WorkOrderStatus[] = [...BOARD_COLUMNS, 'delivered'];

const REFRESH_EVENTS = [
  'marthi-admin-state',
  'marthi-os-state',
  'marthi-erp-bootstrap',
  'marthi-stock',
] as const;

type ViewMode = 'board' | 'roadmap' | 'list';

function priorityMeta(p: WorkOrderPriority) {
  switch (p) {
    case 'urgent':
      return { symbol: '⇈', label: 'Highest', color: '#ef4444' };
    case 'high':
      return { symbol: '↑', label: 'High', color: '#f97316' };
    case 'normal':
      return { symbol: '=', label: 'Medium', color: '#eab308' };
    case 'low':
      return { symbol: '↓', label: 'Low', color: '#3b82f6' };
  }
}

export function WorkOrdersPage() {
  const osBase = useOsBase();
  const [params, setParams] = useSearchParams();

  const statusFilter = params.get('status') as WorkOrderStatus | null;
  const quoteFilter = params.get('quote') as QuoteStatus | null;
  const opFilter = params.get('op');
  const roleParam = params.get('role');
  const isMaster = roleParam !== 'tech';

  const [orders, setOrders] = useState(() => listWorkOrders());
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedTech, setSelectedTech] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<WorkOrderPriority | 'all'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('board');
  const [compactMode, setCompactMode] = useState(false);
  const [optimizeSpace, setOptimizeSpace] = useState(false);

  // Modais e Drawers
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const [selectedDetailOrder, setSelectedDetailOrder] = useState<WorkOrder | null>(null);
  const [printOrder, setPrintOrder] = useState<WorkOrder | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  // Drag & drop
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<WorkOrderStatus | null>(null);
  const [error, setError] = useState('');

  const activeOp = getActiveOperation();
  const currentOp = opFilter && opFilter !== 'all'
    ? listOperations().find((o) => o.id === opFilter) || activeOp
    : activeOp;

  // Fechar dropdown de busca ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Atalhos de teclado para focar na busca (F7, F8, /)
  useEffect(() => {
    function handleFocusSearch() {
      searchInputRef.current?.focus();
      setSearchFocused(true);
    }
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (e.key === 'F7' || (!isInput && e.key === '/')) {
        e.preventDefault();
        handleFocusSearch();
      }
      if (e.key === 'F8') {
        e.preventDefault();
        handleFocusSearch();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('os:focus-search', handleFocusSearch);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('os:focus-search', handleFocusSearch);
    };
  }, []);

  // Resultados da busca instantânea do Jira Omnibox
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders.slice(0, 8);
    return orders.filter((o) => {
      const fullHaystack = [
        o.id,
        o.customerName,
        o.customerPhone,
        o.customerDocument,
        o.customerEmail,
        o.itemName,
        o.itemBrand,
        o.itemModel,
        o.itemColor,
        o.itemRef,
        o.defect,
        o.diagnosis,
        o.technician,
        STATUS_LABEL[o.status],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return fullHaystack.includes(q);
    });
  }, [orders, query]);

  useEffect(() => {
    function refresh() {
      setOrders(listWorkOrders());
    }
    for (const event of REFRESH_EVENTS) window.addEventListener(event, refresh);
    return () => {
      for (const event of REFRESH_EVENTS) window.removeEventListener(event, refresh);
    };
  }, []);

  // Atalho F2 e evento para nova OS
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault();
        setNewModalOpen(true);
      }
    }
    function handleOpenNewModal() {
      setNewModalOpen(true);
    }
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('os:open-new-modal', handleOpenNewModal);
    if (params.get('new') === '1') {
      setNewModalOpen(true);
      const next = new URLSearchParams(params);
      next.delete('new');
      setParams(next, { replace: true });
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('os:open-new-modal', handleOpenNewModal);
    };
  }, [params, setParams]);

  function handleBoardWheel(e: React.WheelEvent<HTMLDivElement>) {
    // Permite rolagem horizontal segurando Shift, sem bloquear o scroll vertical natural da página
    if (e.shiftKey && e.deltaY !== 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  }

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (query.trim()) count++;
    if (selectedTech) count++;
    if (selectedPriority !== 'all') count++;
    if (statusFilter) count++;
    if (quoteFilter) count++;
    return count;
  }, [query, selectedTech, selectedPriority, statusFilter, quoteFilter]);

  // Lista filtrada
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((item) => {
      // Filtro de Operação/Sprint (se não for "all")
      if (opFilter && opFilter !== 'all') {
        if (item.operationId && item.operationId !== opFilter) return false;
      }
      if (statusFilter && item.status !== statusFilter) return false;
      if (quoteFilter && item.quoteStatus !== quoteFilter) return false;
      if (!statusFilter && !quoteFilter && item.status === 'cancelled') return false;

      // Filtro por técnico
      if (selectedTech && item.technician?.toLowerCase() !== selectedTech.toLowerCase()) {
        return false;
      }

      // Filtro por prioridade
      if (selectedPriority !== 'all' && item.priority !== selectedPriority) {
        return false;
      }

      if (!needle) return true;
      return `${item.id} ${item.customerName} ${item.itemName} ${item.technician}`
        .toLowerCase()
        .includes(needle);
    });
  }, [orders, query, statusFilter, quoteFilter, opFilter, selectedTech, selectedPriority]);

  // Métricas
  const openCount = orders.filter((item) => !['delivered', 'cancelled'].includes(item.status)).length;
  const progressCount = orders.filter((item) => item.status === 'progress').length;
  const readyCount = orders.filter((item) => item.status === 'ready').length;
  const quoteWaiting = orders.filter((item) => item.quoteStatus === 'sent').length;

  const currentOpOrders = orders.filter((o) => !o.operationId || o.operationId === currentOp.id);
  const currentOpDelivered = currentOpOrders.filter((o) => o.status === 'delivered').length;
  const sprintProgress = currentOpOrders.length > 0
    ? Math.round((currentOpDelivered / currentOpOrders.length) * 100)
    : 100;

  const columns = statusFilter && BOARD_COLUMNS.includes(statusFilter) ? [statusFilter] : BOARD_COLUMNS;

  async function move(id: string, status: WorkOrderStatus) {
    const current = orders.find((item) => item.id === id);
    if (!current || current.status === status) return;
    setError('');
    try {
      await updateWorkOrder(id, { status });
      setOrders(listWorkOrders());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao atualizar status.');
    }
  }

  async function updatePriority(id: string, priority: WorkOrderPriority) {
    setError('');
    try {
      await updateWorkOrder(id, { priority });
      setOrders(listWorkOrders());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao mudar prioridade.');
    }
  }

  function clearAllFilters() {
    setQuery('');
    setSelectedTech(null);
    setSelectedPriority('all');
    const next = new URLSearchParams(params);
    next.delete('status');
    next.delete('quote');
    setParams(next);
  }

  function onDragStart(orderId: string) {
    setDraggingId(orderId);
  }

  function onDragEnd() {
    setDraggingId(null);
    setOverStatus(null);
  }

  function onDrop(status: WorkOrderStatus) {
    if (draggingId) void move(draggingId, status);
    onDragEnd();
  }

  return (
    <section className={`admin-page os-page-root ${compactMode ? 'is-compact-view' : ''}`}>
      {/* Banner do Ciclo de Tarefas / Operação do Mês */}
      {!optimizeSpace ? (
        <div className="os-sprint-banner">
          <div className="os-sprint-banner__info">
            <div className="os-sprint-banner__title-row">
              <span className="os-sprint-badge">
                {currentOp.status === 'active' ? '⚡ Tarefas Ativas' : '✓ Concluído'}
              </span>
              <strong>{currentOp.title}</strong>
              <small>
                {currentOpDelivered} de {currentOpOrders.length} tarefas concluídas ({sprintProgress}%)
              </small>
            </div>

            <div className="os-sprint-banner__progress-bar">
              <div
                className="os-sprint-banner__progress-fill"
                style={{ width: `${sprintProgress}%` }}
              />
            </div>
          </div>

          <div className="os-sprint-banner__actions">
            {currentOp.status === 'active' ? (
              <button
                type="button"
                className={`btn btn--sm ${isMaster ? 'btn--primary' : 'btn--ghost is-locked'}`}
                title={
                  isMaster
                    ? 'Concluir ciclo de tarefas mensal e transferir pendências para a próxima operação'
                    : 'Apenas Operador Master pode concluir as tarefas deste ciclo'
                }
                onClick={() => setSprintModalOpen(true)}
              >
                {isMaster ? 'Concluir Tarefas' : '🔒 Concluir (Master)'}
              </button>
            ) : (
              <span className="os-sprint-finished-tag">Ciclo Arquivado</span>
            )}
          </div>
        </div>
      ) : null}

      {/* Barra de Filtros & Técnicos estilo Jira (Imagem 2) */}
      <div className="os-jira-bar">
        {/* Campo de Busca & Filtro de OPs estilo Jira Omnibox com Reimpressão */}
        <div className="os-jira-search-filter" ref={searchContainerRef}>
          <div className={`os-jira-bar__search ${searchFocused ? 'is-focused' : ''}`}>
            <span className="os-jira-bar__search-icon">🔍</span>
            <input
              ref={searchInputRef}
              value={query}
              onFocus={() => setSearchFocused(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchFocused(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchFocused(false);
                  searchInputRef.current?.blur();
                }
              }}
              placeholder="Buscar OP (número, cliente, IMEI, técnico...)"
            />
            {query ? (
              <button
                type="button"
                className="os-jira-search-clear"
                onClick={() => {
                  setQuery('');
                  searchInputRef.current?.focus();
                }}
                title="Limpar busca"
              >
                ✕
              </button>
            ) : (
              <kbd className="os-jira-search-kbd">/</kbd>
            )}
          </div>

          {/* Dropdown com informações completas estilo Jira */}
          {searchFocused ? (
            <div className="os-jira-search-popover">
              <header className="os-jira-search-popover__head">
                <strong>
                  {query.trim()
                    ? `Resultados encontrados (${searchHits.length})`
                    : `Ordens de Serviço Recentes (${searchHits.length})`}
                </strong>
                <span className="os-jira-search-popover__hint">
                  Clique para abrir a OS e ver detalhes completos
                </span>
              </header>

              <div className="os-jira-search-popover__body">
                {searchHits.length === 0 ? (
                  <div className="os-jira-search-empty">
                    <span>🔍</span>
                    <p>
                      Nenhuma OS encontrada para <strong>&quot;{query}&quot;</strong>.
                    </p>
                    <small>
                      Busque por número da OS (#OS-...), cliente, telefone, aparelho, IMEI ou técnico.
                    </small>
                  </div>
                ) : (
                  searchHits.map((item) => {
                    const pMeta = priorityMeta(item.priority);
                    return (
                      <div
                        key={item.id}
                        className="os-jira-search-item"
                        onClick={() => {
                          setSearchFocused(false);
                          setSelectedDetailOrder(item);
                        }}
                      >
                        <div className="os-jira-search-item__main">
                          <div className="os-jira-search-item__title-row">
                            <strong className="os-jira-search-item__code">#{item.id}</strong>
                            <span className="os-status-chip">{STATUS_LABEL[item.status]}</span>
                            <span
                              className={`os-priority-badge os-priority-badge--${item.priority}`}
                              style={{ color: pMeta.color }}
                            >
                              {pMeta.symbol} {pMeta.label}
                            </span>
                            <span className="os-jira-search-item__time">
                              {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </div>

                          <div className="os-jira-search-item__desc">
                            <span className="os-jira-search-item__device">
                              💻 <strong>{item.itemName}</strong>
                              {[item.itemBrand, item.itemModel].filter(Boolean).length > 0
                                ? ` (${[item.itemBrand, item.itemModel].filter(Boolean).join(' ')})`
                                : ''}
                            </span>
                            {item.itemRef ? (
                              <span className="os-jira-search-item__imei"> · IMEI: {item.itemRef}</span>
                            ) : null}
                            {item.defect ? (
                              <span className="os-jira-search-item__defect"> · Defeito: {item.defect}</span>
                            ) : null}
                          </div>

                          <div className="os-jira-search-item__meta">
                            <span>
                              👤 <strong>{item.customerName}</strong>
                              {item.customerPhone ? ` (${item.customerPhone})` : ''}
                            </span>
                            <span>🛠️ {item.technician || 'Bancada técnica'}</span>
                            <strong className="os-jira-search-item__total">
                              {money(workOrderTotal(item))}
                            </strong>
                          </div>
                        </div>

                        <div
                          className="os-jira-search-item__actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            title="Abrir detalhes e processo da OS"
                            onClick={() => {
                              setSearchFocused(false);
                              setSelectedDetailOrder(item);
                            }}
                          >
                            Abrir OS
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <footer className="os-jira-search-popover__foot">
                <span>Pressione <strong>ESC</strong> para fechar</span>
                <span>Clique em qualquer OS para abrir</span>
              </footer>
            </div>
          ) : null}
        </div>

        {/* Fila de Avatares / Fotos dos Técnicos (Imagem 2) */}
        <div className="os-jira-avatars-row">
          <button
            type="button"
            className={`os-jira-avatar-btn ${selectedTech === null ? 'is-active' : ''}`}
            onClick={() => setSelectedTech(null)}
            title="Todos os técnicos"
          >
            <span className="os-jira-avatar-all">
              <AdminIcon name="people" />
            </span>
          </button>

          {TECHNICIANS_LIST.map((tech) => {
            const count = orders.filter(
              (o) => o.technician?.toLowerCase() === tech.name.toLowerCase() && !['delivered', 'cancelled'].includes(o.status),
            ).length;
            const isSelected = selectedTech?.toLowerCase() === tech.name.toLowerCase();
            return (
              <button
                key={tech.id}
                type="button"
                className={`os-jira-avatar-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => setSelectedTech(isSelected ? null : tech.name)}
                title={`${tech.name} (${tech.role}) — ${count} chamados`}
              >
                <img src={tech.avatarUrl} alt={tech.name} />
                {count > 0 ? <span className="os-jira-avatar-count">{count}</span> : null}
              </button>
            );
          })}
        </div>

        {/* Botão Filtrar [ N ] */}
        <button
          type="button"
          className={`os-jira-pill-btn ${activeFiltersCount > 0 ? 'is-active' : ''}`}
          onClick={() => setFilterDrawerOpen((v) => !v)}
          title="Abrir painel de filtros dentro da operação"
        >
          <AdminIcon name="filter" />
          <span>Filtrar</span>
          {activeFiltersCount > 0 ? (
            <span className="os-jira-badge-count">{activeFiltersCount}</span>
          ) : null}
        </button>

        {/* Botão Limpar Filtros */}
        {activeFiltersCount > 0 ? (
          <button
            type="button"
            className="os-jira-link-btn"
            onClick={clearAllFilters}
          >
            Remover filtros
          </button>
        ) : null}

        {/* Alternador de Visão: Quadro / Roadmap / Lista */}
        <div className="os-view-switch">
          <button
            type="button"
            className={`os-view-btn ${viewMode === 'board' ? 'is-active' : ''}`}
            onClick={() => setViewMode('board')}
            title="Quadro Kanban"
          >
            📋 Quadro
          </button>
          <button
            type="button"
            className={`os-view-btn ${viewMode === 'roadmap' ? 'is-active' : ''}`}
            onClick={() => setViewMode('roadmap')}
            title="Roadmap do Técnico"
          >
            📊 Roadmap do Técnico
          </button>
          <button
            type="button"
            className={`os-view-btn ${viewMode === 'list' ? 'is-active' : ''}`}
            onClick={() => setViewMode('list')}
            title="Lista geral"
          >
            📑 Lista
          </button>
        </div>

        {/* Botão Otimizar Espaço / Modo Foco */}
        <button
          type="button"
          className={`os-jira-pill-btn ${optimizeSpace ? 'is-active' : ''}`}
          onClick={() => setOptimizeSpace((v) => !v)}
          title="Inibir cabeçalho e estatísticas para otimizar espaço de tela"
        >
          <AdminIcon name={optimizeSpace ? 'expand' : 'collapse'} />
          <span>{optimizeSpace ? 'Exibir tudo' : 'Inibir topo'}</span>
        </button>

        {/* Botão Modo Compacto */}
        <button
          type="button"
          className={`os-jira-pill-btn ${compactMode ? 'is-active' : ''}`}
          onClick={() => setCompactMode((v) => !v)}
          title="Alternar entre cards compactos e detalhados"
        >
          <span>{compactMode ? 'Cards expandidos' : 'Cards compactos'}</span>
        </button>

        {/* Botão Nova OS */}
        <button
          type="button"
          className="btn btn--primary os-btn-new-os"
          onClick={() => setNewModalOpen(true)}
        >
          <AdminIcon name="plus" />
          <span>Nova OS</span>
          <kbd>F2</kbd>
        </button>
      </div>

      {/* Botões de Prioridade Rápida */}
      <div className="os-priority-filter-bar">
        <span className="os-priority-filter-bar__title">Prioridade:</span>
        <button
          type="button"
          className={`os-p-filter-pill ${selectedPriority === 'all' ? 'is-active' : ''}`}
          onClick={() => setSelectedPriority('all')}
        >
          Todas ({orders.length})
        </button>
        <button
          type="button"
          className={`os-p-filter-pill os-p-filter-pill--urgent ${
            selectedPriority === 'urgent' ? 'is-active' : ''
          }`}
          onClick={() => setSelectedPriority(selectedPriority === 'urgent' ? 'all' : 'urgent')}
        >
          <span className="os-p-filter-sym">⇈</span>
          Urgente ({orders.filter((o) => o.priority === 'urgent').length})
        </button>
        <button
          type="button"
          className={`os-p-filter-pill os-p-filter-pill--high ${
            selectedPriority === 'high' ? 'is-active' : ''
          }`}
          onClick={() => setSelectedPriority(selectedPriority === 'high' ? 'all' : 'high')}
        >
          <span className="os-p-filter-sym">↑</span>
          Alta ({orders.filter((o) => o.priority === 'high').length})
        </button>
        <button
          type="button"
          className={`os-p-filter-pill os-p-filter-pill--normal ${
            selectedPriority === 'normal' ? 'is-active' : ''
          }`}
          onClick={() => setSelectedPriority(selectedPriority === 'normal' ? 'all' : 'normal')}
        >
          <span className="os-p-filter-sym">=</span>
          Normal ({orders.filter((o) => o.priority === 'normal').length})
        </button>
        <button
          type="button"
          className={`os-p-filter-pill os-p-filter-pill--low ${
            selectedPriority === 'low' ? 'is-active' : ''
          }`}
          onClick={() => setSelectedPriority(selectedPriority === 'low' ? 'all' : 'low')}
        >
          <span className="os-p-filter-sym">↓</span>
          Baixa ({orders.filter((o) => o.priority === 'low').length})
        </button>
      </div>

      {/* Painel Retrátil de Filtro da Operação */}
      {filterDrawerOpen ? (
        <aside className="os-filter-drawer">
          <div className="os-filter-drawer__head">
            <strong>Filtros da Operação Atual</strong>
            <button
              type="button"
              className="os-filter-drawer__close"
              onClick={() => setFilterDrawerOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="os-filter-drawer__body">
            <label>
              <span>Buscar texto (cliente / modelo / defeito):</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex.: iPhone, Carlos, Placa..."
              />
            </label>

            <label>
              <span>Técnico Responsável:</span>
              <select
                className="os-select"
                value={selectedTech ?? ''}
                onChange={(e) => setSelectedTech(e.target.value ? e.target.value : null)}
              >
                <option value="">Todos os técnicos</option>
                {TECHNICIANS_LIST.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name} ({t.specialty})
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Nível de Prioridade:</span>
              <select
                className="os-select"
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value as any)}
              >
                <option value="all">Todas as prioridades</option>
                <option value="urgent">⇈ Urgente</option>
                <option value="high">↑ Alta</option>
                <option value="normal">= Normal</option>
                <option value="low">↓ Baixa</option>
              </select>
            </label>

            <div className="os-filter-drawer__actions">
              <button type="button" className="btn btn--ghost" onClick={clearAllFilters}>
                Limpar Todos
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => setFilterDrawerOpen(false)}
              >
                Aplicar ({filtered.length} encontrados)
              </button>
            </div>
          </div>
        </aside>
      ) : null}

      {error ? <p className="qty-low">{error}</p> : null}

      {/* Cards de Métricas (inibe se optimizeSpace estiver ativo) */}
      {!optimizeSpace ? (
        <div className="admin-grid os-metrics-grid">
          <article className="admin-card">
            <h2>Em oficina</h2>
            <strong>{openCount}</strong>
            <p>Ordens ainda não entregues.</p>
          </article>
          <article className="admin-card">
            <h2>Em serviço</h2>
            <strong>{progressCount}</strong>
            <p>Técnico trabalhando agora.</p>
          </article>
          <article className="admin-card">
            <h2>Prontas</h2>
            <strong>{readyCount}</strong>
            <p>Aguardando o cliente retirar.</p>
          </article>
          <article className="admin-card">
            <h2>Orçamentos</h2>
            <strong>{quoteWaiting}</strong>
            <p>
              Aguardando aprovação.{' '}
              <Link to={osHref(osBase, '?quote=sent')}>Ver lista</Link>
            </p>
          </article>
        </div>
      ) : null}

      {/* Conteúdo Principal conforme ViewMode */}
      {viewMode === 'roadmap' ? (
        <OsTechnicianRoadmap
          orders={filtered}
          onOpenOrder={(order) => setSelectedDetailOrder(order)}
        />
      ) : viewMode === 'list' ? (
        <article className="admin-card os-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Equipamento</th>
                <th>Defeito</th>
                <th>Prioridade</th>
                <th>Status</th>
                <th>Técnico</th>
                <th>Prazo</th>
                <th>Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const p = priorityMeta(item.priority);
                const techObj = TECHNICIANS_LIST.find(
                  (t) => t.name.toLowerCase() === item.technician?.toLowerCase(),
                );
                return (
                  <tr key={item.id}>
                    <td>
                      <button
                        type="button"
                        className="os-ticket__code"
                        onClick={() => setSelectedDetailOrder(item)}
                      >
                        {item.id}
                      </button>
                    </td>
                    <td>
                      <strong>{item.customerName}</strong>
                      <br />
                      <small>{item.customerPhone}</small>
                    </td>
                    <td>{item.itemName}</td>
                    <td>{item.defect}</td>
                    <td>
                      <span className={`os-priority-badge os-priority-badge--${item.priority}`}>
                        {p.symbol} {p.label}
                      </span>
                    </td>
                    <td>
                      <span className="os-status-chip">{STATUS_LABEL[item.status]}</span>
                    </td>
                    <td>
                      <div className="os-table-tech">
                        {techObj ? (
                          <img src={techObj.avatarUrl} alt={techObj.name} />
                        ) : null}
                        <span>{item.technician || '—'}</span>
                      </div>
                    </td>
                    <td>{item.estimatedReadyAt || '—'}</td>
                    <td>{money(workOrderTotal(item))}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => setSelectedDetailOrder(item)}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      ) : quoteFilter === 'sent' ? (
        <article className="admin-card">
          <h2>Aguardando aprovação do cliente</h2>
          <p>Orçamentos enviados — registre a resposta do cliente no detalhe da OS.</p>
          {filtered.length === 0 ? <p className="empty">Nenhum orçamento pendente.</p> : null}
          <div className="os-board" style={{ gridTemplateColumns: '1fr' }}>
            {filtered.map((order) => (
              <JiraWorkOrderCard
                key={order.id}
                order={order}
                compact={compactMode}
                onOpen={() => setSelectedDetailOrder(order)}
                onMove={move}
                onUpdatePriority={updatePriority}
                dragging={draggingId === order.id}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
        </article>
      ) : (
        <div className="os-board" onWheel={handleBoardWheel}>
          {columns.map((status) => {
            const column = filtered.filter((item) => item.status === status);
            return (
              <JiraBoardColumn
                key={status}
                status={status}
                orders={column}
                compact={compactMode}
                isOver={overStatus === status}
                draggingId={draggingId}
                onOpenOrder={(order) => setSelectedDetailOrder(order)}
                onDragOver={() => setOverStatus(status)}
                onDragLeave={() => setOverStatus((cur) => (cur === status ? null : cur))}
                onDrop={() => onDrop(status)}
                onMove={move}
                onUpdatePriority={updatePriority}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            );
          })}
        </div>
      )}

      {/* Modal Jira de Detalhes da OS (Imagens 3, 4, 5) */}
      {selectedDetailOrder ? (
        <OsDetailModal
          order={selectedDetailOrder}
          onClose={() => setSelectedDetailOrder(null)}
          onOrderUpdated={(updated) => {
            setSelectedDetailOrder(updated);
            setOrders(listWorkOrders());
          }}
        />
      ) : null}

      {/* Modal de Nova OS */}
      <OsNewModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={(created) => {
          setOrders(listWorkOrders());
          setSelectedDetailOrder(created);
          if (window.confirm('Ordem de serviço criada com sucesso! Deseja imprimir a OS agora?')) {
            setPrintOrder(created);
          }
        }}
      />

      {/* Modal de Impressão */}
      <OsPrintModal
        order={printOrder}
        open={Boolean(printOrder)}
        onClose={() => setPrintOrder(null)}
      />

      {/* Modal de Finalizar Sprint / Operação */}
      <OsSprintModal
        open={sprintModalOpen}
        operation={currentOp}
        orders={orders}
        isMaster={isMaster}
        onClose={() => setSprintModalOpen(false)}
        onCompleted={() => {
          setOrders(listWorkOrders());
        }}
      />
    </section>
  );
}

function JiraBoardColumn({
  status,
  orders,
  compact,
  isOver,
  draggingId,
  onOpenOrder,
  onDragOver,
  onDragLeave,
  onDrop,
  onMove,
  onUpdatePriority,
  onDragStart,
  onDragEnd,
}: {
  status: WorkOrderStatus;
  orders: WorkOrder[];
  compact: boolean;
  isOver: boolean;
  draggingId: string | null;
  onOpenOrder: (order: WorkOrder) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onMove: (id: string, status: WorkOrderStatus) => void;
  onUpdatePriority: (id: string, priority: WorkOrderPriority) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  function handleDragOver(event: DragEvent) {
    if (!DROP_STATUSES.includes(status)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    onDragOver();
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    onDrop();
  }

  return (
    <section
      className={`os-col ${isOver ? 'is-drop-target' : ''} ${draggingId ? 'is-dragging-board' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={onDragLeave}
      onDrop={handleDrop}
    >
      <header className="os-col__head">
        <h2>{STATUS_LABEL[status]}</h2>
        <span>{orders.length}</span>
      </header>
      {orders.length === 0 ? <p className="empty">Solte aqui</p> : null}
      {orders.map((order) => (
        <JiraWorkOrderCard
          key={order.id}
          order={order}
          compact={compact}
          onOpen={() => onOpenOrder(order)}
          onMove={onMove}
          onUpdatePriority={onUpdatePriority}
          dragging={draggingId === order.id}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </section>
  );
}

/** Card de OS estilizado exatamente como o Jira da Imagem 1 */
function JiraWorkOrderCard({
  order,
  compact,
  onOpen,
  onMove: _onMove,
  onUpdatePriority,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  order: WorkOrder;
  compact: boolean;
  onOpen: () => void;
  onMove?: (id: string, status: WorkOrderStatus) => void;
  onUpdatePriority: (id: string, priority: WorkOrderPriority) => void;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const draggedRef = useRef(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const pMeta = priorityMeta(order.priority);
  const techObj = TECHNICIANS_LIST.find(
    (t) => t.name.toLowerCase() === (order.technician || '').toLowerCase(),
  );

  function handleDragStart(event: DragEvent) {
    draggedRef.current = true;
    event.dataTransfer.setData('text/os-id', order.id);
    event.dataTransfer.setData('text/plain', order.id);
    event.dataTransfer.effectAllowed = 'move';
    onDragStart(order.id);
  }

  function handleDragEnd() {
    onDragEnd();
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  }

  return (
    <article
      className={`os-ticket os-jira-card ${dragging ? 'is-dragging' : ''} ${
        compact ? 'is-compact' : ''
      }`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={() => {
        if (!draggedRef.current) onOpen();
      }}
    >
      {/* Faixa vertical colorida de prioridade no lado esquerdo (Imagem 1) */}
      <div
        className="os-jira-card__stripe"
        style={{ backgroundColor: pMeta.color }}
      />

      <div className="os-jira-card__inner">
        {/* Topo do Card */}
        <div className="os-jira-card__top">
          <strong className="os-jira-card__title">
            {order.itemName}
            {order.defect ? ` — ${order.defect}` : ''}
          </strong>
          <span className="os-jira-card__edit-icon" title="Editar OS">✎</span>
        </div>

        {/* Badges de Status e Cliente (Imagem 1) */}
        {!compact ? (
          <div className="os-jira-card__tags">
            <span className="os-jira-card__status-pill">
              {STATUS_LABEL[order.status]}
            </span>
            <span className="os-jira-card__client-pill" title="Cliente solicitante">
              {order.customerName}
            </span>
            {order.itemRef ? (
              <span className="os-jira-card__ref-pill">{order.itemRef}</span>
            ) : null}
          </div>
        ) : null}

        {/* Rodapé do Card (Imagem 1: Código, Prioridade Dropdown, Foto do Técnico) */}
        <div className="os-jira-card__foot" onClick={(e) => e.stopPropagation()}>
          <div className="os-jira-card__foot-left">
            <span className="os-jira-card__type-mark">📗</span>
            <span className="os-jira-card__code">{order.id}</span>
          </div>

          <div className="os-jira-card__foot-right">
            {/* Botão de Prioridade com Dropdown direto no card (Imagem 1) */}
            <div className="os-jira-card__p-wrap">
              <button
                type="button"
                className="os-jira-card__p-btn"
                style={{ color: pMeta.color, borderColor: `${pMeta.color}55` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setPriorityMenuOpen((v) => !v);
                }}
                title={`Prioridade ${pMeta.label} - Clique para alterar`}
              >
                <span>{pMeta.symbol}</span>
              </button>

              {priorityMenuOpen ? (
                <div className="os-jira-dropdown os-jira-dropdown--card" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="os-jira-p-item os-jira-p-item--highest"
                    onClick={() => {
                      setPriorityMenuOpen(false);
                      onUpdatePriority(order.id, 'urgent');
                    }}
                  >
                    <span>⇈</span> Highest
                  </button>
                  <button
                    type="button"
                    className="os-jira-p-item os-jira-p-item--high"
                    onClick={() => {
                      setPriorityMenuOpen(false);
                      onUpdatePriority(order.id, 'high');
                    }}
                  >
                    <span>↑</span> High
                  </button>
                  <button
                    type="button"
                    className="os-jira-p-item os-jira-p-item--medium"
                    onClick={() => {
                      setPriorityMenuOpen(false);
                      onUpdatePriority(order.id, 'normal');
                    }}
                  >
                    <span>=</span> Medium
                  </button>
                  <button
                    type="button"
                    className="os-jira-p-item os-jira-p-item--low"
                    onClick={() => {
                      setPriorityMenuOpen(false);
                      onUpdatePriority(order.id, 'low');
                    }}
                  >
                    <span>↓</span> Low
                  </button>
                </div>
              ) : null}
            </div>

            {/* Foto do Técnico no Card (Imagem 1) */}
            {techObj ? (
              <img
                src={techObj.avatarUrl}
                alt={techObj.name}
                className="os-jira-card__tech-avatar"
                title={`Atribuído a: ${techObj.name}`}
              />
            ) : (
              <span
                className="os-jira-card__tech-avatar os-jira-card__tech-avatar--empty"
                title="Sem técnico"
              >
                ?
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
