import { useMemo, useState } from 'react';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import {
  STATUS_LABEL,
  TECHNICIANS_LIST,
  workOrderTotal,
  type WorkOrder,
  type WorkOrderPriority,
  type WorkOrderStatus,
} from '../../data/osStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function priorityMeta(p: WorkOrderPriority) {
  switch (p) {
    case 'urgent':
      return { symbol: '⇈', label: 'Urgente', color: '#ef4444' };
    case 'high':
      return { symbol: '↑', label: 'Alta', color: '#f97316' };
    case 'normal':
      return { symbol: '=', label: 'Normal', color: '#eab308' };
    case 'low':
      return { symbol: '↓', label: 'Baixa', color: '#3b82f6' };
  }
}

type OsBacklogViewProps = {
  orders: WorkOrder[];
  onOpenOrder: (order: WorkOrder) => void;
  onMoveOrder: (id: string, nextStatus: WorkOrderStatus) => void;
  onUpdatePriority: (id: string, priority: WorkOrderPriority) => void;
  onNewOrder: () => void;
  onGoToBoard: () => void;
};

export function OsBacklogView({
  orders,
  onOpenOrder,
  onMoveOrder,
  onUpdatePriority,
  onNewOrder,
  onGoToBoard,
}: OsBacklogViewProps) {
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | WorkOrderPriority>('all');
  const [techFilter, setTechFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Apenas chamadas em backlog
  const backlogOrders = useMemo(
    () => orders.filter((o) => o.status === 'backlog'),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return backlogOrders.filter((order) => {
      if (priorityFilter !== 'all' && order.priority !== priorityFilter) return false;
      if (techFilter !== 'all') {
        if (techFilter === 'unassigned' && order.technician) return false;
        if (techFilter !== 'unassigned' && order.technician?.toLowerCase() !== techFilter.toLowerCase()) {
          return false;
        }
      }
      if (!q) return true;
      return `${order.id} ${order.customerName} ${order.itemName} ${order.defect || ''} ${order.technician || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [backlogOrders, search, priorityFilter, techFilter]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)));
    }
  }

  function handleStartBatch() {
    if (selectedIds.size === 0) return;
    selectedIds.forEach((id) => {
      onMoveOrder(id, 'open');
    });
    setSelectedIds(new Set());
  }

  return (
    <div className="os-backlog-page">
      {/* Top Banner Informativo Estilo Jira */}
      <div className="os-backlog-header-card">
        <div className="os-backlog-header-card__info">
          <div className="os-backlog-header-card__title-row">
            <span className="os-backlog-tag">Sprint da Oficina</span>
            <h2>Backlog & Triagem Operacional</h2>
          </div>
          <p>
            Chamados cadastrados aguardando entrada nas bancadas. Quando liberados para a operação,
            inicie a tarefa para que ela apareça no <strong>Quadro Kanban</strong> da oficina.
          </p>
        </div>

        <div className="os-backlog-header-card__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onGoToBoard}
            title="Ir para o Quadro Kanban com as OSs em execução"
          >
            <AdminIcon name="ops" />
            <span>Ver Quadro Ativo</span>
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onNewOrder}
            title="Criar novo chamado diretamente no backlog"
          >
            <AdminIcon name="plus" />
            <span>Nova OS no Backlog</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros e Busca no Backlog */}
      <div className="os-backlog-filter-bar">
        <div className="os-backlog-search">
          <AdminIcon name="search" />
          <input
            type="text"
            placeholder="Pesquisar no backlog (código, cliente, defeito)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search ? (
            <button
              type="button"
              className="os-backlog-search__clear"
              onClick={() => setSearch('')}
              title="Limpar busca"
            >
              ✕
            </button>
          ) : null}
        </div>

        {/* Combobox de Prioridade */}
        <div className="os-backlog-picker-wrap">
          <AdminPicker
            compact
            aria-label="Filtrar por prioridade no backlog"
            value={priorityFilter}
            options={[
              { value: 'all', label: `Todas prioridades (${backlogOrders.length})` },
              {
                value: 'urgent',
                label: `⇈ Urgente (${backlogOrders.filter((o) => o.priority === 'urgent').length})`,
              },
              {
                value: 'high',
                label: `↑ Alta (${backlogOrders.filter((o) => o.priority === 'high').length})`,
              },
              {
                value: 'normal',
                label: `= Normal (${backlogOrders.filter((o) => o.priority === 'normal').length})`,
              },
              {
                value: 'low',
                label: `↓ Baixa (${backlogOrders.filter((o) => o.priority === 'low').length})`,
              },
            ]}
            onChange={(val) => setPriorityFilter(val as typeof priorityFilter)}
          />
        </div>

        {/* Combobox de Técnico */}
        <div className="os-backlog-picker-wrap">
          <AdminPicker
            compact
            aria-label="Filtrar por técnico"
            value={techFilter}
            options={[
              { value: 'all', label: 'Todos os técnicos' },
              { value: 'unassigned', label: '👤 Não atribuído' },
              ...TECHNICIANS_LIST.map((t) => ({
                value: t.name,
                label: `${t.name} (${t.specialty})`,
              })),
            ]}
            onChange={(val) => setTechFilter(val)}
          />
        </div>

        {/* Ação em Massa */}
        {selectedIds.size > 0 ? (
          <button
            type="button"
            className="btn btn--primary os-backlog-batch-btn"
            onClick={handleStartBatch}
            title="Mover chamados selecionados para a operação ativa"
          >
            <span>🚀 Iniciar Selecionadas ({selectedIds.size})</span>
          </button>
        ) : null}
      </div>

      {/* Conteúdo Principal do Backlog: Estilo Jira Sprint (Imagem 1) */}
      <div className="os-backlog-container">
        <div className="os-backlog-sprint-header">
          <div className="os-backlog-sprint-header__left">
            <input
              type="checkbox"
              className="os-backlog-checkbox"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={toggleSelectAll}
              aria-label="Selecionar todas as OSs do backlog"
              title="Selecionar todas"
            />
            <strong className="os-backlog-sprint-title">Tarefas Não Inicializadas</strong>
            <span className="os-backlog-count-pill">
              {filtered.length} {filtered.length === 1 ? 'ticket visível' : 'tickets visíveis'} (total: {backlogOrders.length})
            </span>
          </div>

          <div className="os-backlog-sprint-header__right">
            <span className="os-backlog-status-badge">
              ⏳ {STATUS_LABEL.backlog}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="os-backlog-empty">
            <div className="os-backlog-empty__icon">⏳</div>
            <h3>Nenhum chamado no Backlog</h3>
            <p>
              {search || priorityFilter !== 'all' || techFilter !== 'all'
                ? 'Nenhum chamado corresponde aos filtros selecionados.'
                : 'Todas as ordens de serviço foram iniciadas e estão no fluxo de trabalho do Quadro!'}
            </p>
            <div className="os-backlog-empty__actions">
              <button type="button" className="btn btn--primary btn--sm" onClick={onNewOrder}>
                <AdminIcon name="plus" />
                <span>Criar OS no Backlog</span>
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={onGoToBoard}>
                <span>Ir para o Quadro Kanban</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="os-backlog-list">
            {filtered.map((order) => {
              const p = priorityMeta(order.priority);
              const tech = TECHNICIANS_LIST.find(
                (t) => t.name.toLowerCase() === order.technician?.toLowerCase(),
              );
              const isSelected = selectedIds.has(order.id);

              return (
                <div
                  key={order.id}
                  className={`os-backlog-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onOpenOrder(order)}
                >
                  {/* Faixa lateral de prioridade */}
                  <div
                    className="os-backlog-item__stripe"
                    style={{ backgroundColor: p.color }}
                  />

                  {/* Checkbox de seleção */}
                  <div
                    className="os-backlog-item__check-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className="os-backlog-checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(order.id)}
                      aria-label={`Selecionar ${order.id}`}
                    />
                  </div>

                  {/* Ícone de Tipo */}
                  <div className="os-backlog-item__icon" title="Equipamento">
                    📗
                  </div>

                  {/* Código e Título */}
                  <div className="os-backlog-item__main">
                    <div className="os-backlog-item__title-row">
                      <span className="os-backlog-item__code">{order.id}</span>
                      <strong
                        className="os-backlog-item__title"
                        title={`${order.itemName}${order.defect ? ` — ${order.defect}` : ''}`}
                      >
                        {order.itemName}
                        {order.defect ? ` — ${order.defect}` : ''}
                      </strong>
                    </div>

                    <div className="os-backlog-item__meta">
                      <span className="os-backlog-item__customer" title="Cliente">
                        👤 {order.customerName}
                      </span>
                      {order.customerPhone ? (
                        <span className="os-backlog-item__phone">
                          📞 {order.customerPhone}
                        </span>
                      ) : null}
                      {order.itemBrand || order.itemModel ? (
                        <span className="os-backlog-item__brand">
                          🏷️ {[order.itemBrand, order.itemModel].filter(Boolean).join(' ')}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Metadados e Ações à Direita */}
                  <div className="os-backlog-item__trailing">
                    {/* Valor Total */}
                    <div className="os-backlog-item__price" title="Orçamento / Valor Previsto">
                      <strong>{money(workOrderTotal(order))}</strong>
                    </div>

                    {/* Prioridade */}
                    <div
                      className="os-backlog-item__priority"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <AdminPicker
                        compact
                        aria-label={`Prioridade da OS ${order.id}`}
                        value={order.priority}
                        options={[
                          { value: 'urgent', label: '⇈ Urgente' },
                          { value: 'high', label: '↑ Alta' },
                          { value: 'normal', label: '= Normal' },
                          { value: 'low', label: '↓ Baixa' },
                        ]}
                        onChange={(val) => onUpdatePriority(order.id, val as WorkOrderPriority)}
                      />
                    </div>

                    {/* Técnico */}
                    <div
                      className="os-backlog-item__tech"
                      title={order.technician ? `Técnico: ${order.technician}` : 'Não atribuído'}
                    >
                      {tech ? (
                        <div className="os-backlog-tech-chip">
                          <img src={tech.avatarUrl} alt={tech.name} />
                          <span>{tech.name.split(' ')[0]}</span>
                        </div>
                      ) : (
                        <span className="os-backlog-unassigned">Não atribuído</span>
                      )}
                    </div>

                    {/* Botões de Ação */}
                    <div
                      className="os-backlog-item__actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="btn btn--primary btn--sm os-backlog-btn-start"
                        title="Mover para o Quadro da Oficina (status Aberta/Em serviço)"
                        onClick={() => onMoveOrder(order.id, 'open')}
                      >
                        <span>🚀 Iniciar OS</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        title="Abrir detalhes completos da OS"
                        onClick={() => onOpenOrder(order)}
                      >
                        <span>Detalhes</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
