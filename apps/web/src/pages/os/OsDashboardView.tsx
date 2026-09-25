import { useMemo } from 'react';
import { AdminIcon } from '../../components/AdminIcons';
import {
  TECHNICIANS_LIST,
  workOrderTotal,
  type WorkOrder,
  type WorkOrderStatus,
} from '../../data/osStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type OsDashboardViewProps = {
  orders: WorkOrder[];
  onOpenOrder: (order: WorkOrder) => void;
  onGoToBoard: (statusFilter?: WorkOrderStatus) => void;
  onGoToBacklog: () => void;
  onNewOrder: () => void;
};

export function OsDashboardView({
  orders,
  onOpenOrder,
  onGoToBoard,
  onGoToBacklog,
  onNewOrder,
}: OsDashboardViewProps) {
  // 1. Cálculos de Status e KPIs Reais
  const readyCount = useMemo(() => orders.filter((o) => o.status === 'ready').length, [orders]);
  const deliveredCount = useMemo(() => orders.filter((o) => o.status === 'delivered').length, [orders]);
  const totalCompleted = readyCount + deliveredCount;

  const openCount = useMemo(() => orders.filter((o) => o.status === 'open').length, [orders]);
  const progressCount = useMemo(() => orders.filter((o) => o.status === 'progress').length, [orders]);
  const waitingPartsCount = useMemo(
    () => orders.filter((o) => o.status === 'waiting').length,
    [orders],
  );
  const reprovedCount = useMemo(() => orders.filter((o) => o.status === 'reproved').length, [orders]);
  const backlogCount = useMemo(() => orders.filter((o) => o.status === 'backlog').length, [orders]);
  const quoteSentCount = useMemo(() => orders.filter((o) => o.quoteStatus === 'sent').length, [orders]);

  // Faturamento total em serviço vs pronto
  const totalInService = useMemo(
    () =>
      orders
        .filter((o) => ['open', 'diagnosis', 'waiting', 'progress', 'reproved'].includes(o.status))
        .reduce((sum, o) => sum + workOrderTotal(o), 0),
    [orders],
  );

  const totalReadyValue = useMemo(
    () =>
      orders
        .filter((o) => o.status === 'ready')
        .reduce((sum, o) => sum + workOrderTotal(o), 0),
    [orders],
  );

  // 2. Gráfico Donut de Status (Visão Geral estilo Jira)
  const statusSlices = useMemo(() => {
    const total = orders.length || 1;
    const slices = [
      { key: 'open', label: 'Aberta (Oficina)', count: openCount, color: '#0284c7' },
      { key: 'progress', label: 'Em serviço', count: progressCount, color: '#f97316' },
      { key: 'waiting', label: 'Aguardando peça/aprovação', count: waitingPartsCount, color: '#eab308' },
      { key: 'reproved', label: 'Reprovada (Retrabalho)', count: reprovedCount, color: '#ef4444' },
      { key: 'ready', label: 'Pronta', count: readyCount, color: '#16a34a' },
      { key: 'backlog', label: 'Backlog (Triagem)', count: backlogCount, color: '#8b5cf6' },
      { key: 'delivered', label: 'Entregue', count: deliveredCount, color: '#64748b' },
    ].filter((s) => s.count > 0);

    let accumulatedAngle = 0;
    const radius = 70;
    const circumference = 2 * Math.PI * radius; // ~439.82

    return slices.map((slice) => {
      const percentage = (slice.count / total) * 100;
      const strokeDash = (slice.count / total) * circumference;
      const strokeOffset = circumference - accumulatedAngle;
      accumulatedAngle += strokeDash;
      return {
        ...slice,
        percentage: Math.round(percentage),
        strokeDash: `${strokeDash} ${circumference - strokeDash}`,
        strokeOffset: strokeOffset,
      };
    });
  }, [orders, openCount, progressCount, waitingPartsCount, reprovedCount, readyCount, backlogCount, deliveredCount]);

  // 3. Distribuição por Prioridade
  const priorityDistribution = useMemo(() => {
    const total = orders.length || 1;
    const urgent = orders.filter((o) => o.priority === 'urgent').length;
    const high = orders.filter((o) => o.priority === 'high').length;
    const normal = orders.filter((o) => o.priority === 'normal').length;
    const low = orders.filter((o) => o.priority === 'low').length;

    return [
      { key: 'urgent', symbol: '⇈', label: 'Urgente', count: urgent, color: '#ef4444', pct: Math.round((urgent / total) * 100) },
      { key: 'high', symbol: '↑', label: 'Alta', count: high, color: '#f97316', pct: Math.round((high / total) * 100) },
      { key: 'normal', symbol: '=', label: 'Normal', count: normal, color: '#eab308', pct: Math.round((normal / total) * 100) },
      { key: 'low', symbol: '↓', label: 'Baixa', count: low, color: '#3b82f6', pct: Math.round((low / total) * 100) },
    ];
  }, [orders]);

  // 4. Distribuição de Carga por Técnico
  const techWorkload = useMemo(() => {
    return TECHNICIANS_LIST.map((tech) => {
      const techOrders = orders.filter(
        (o) => o.technician?.toLowerCase() === tech.name.toLowerCase() && !['delivered', 'cancelled'].includes(o.status),
      );
      const inProgress = techOrders.filter((o) => o.status === 'progress').length;
      return {
        ...tech,
        totalActive: techOrders.length,
        inProgress,
        orders: techOrders,
      };
    }).sort((a, b) => b.totalActive - a.totalActive);
  }, [orders]);

  // 5. Atividades Recentes / Timeline de OSs
  const recentActivities = useMemo(() => {
    const activities: Array<{
      id: string;
      orderId: string;
      orderName: string;
      customer: string;
      timeAgo: string;
      type: 'reproved' | 'progress' | 'ready' | 'backlog' | 'open';
      title: string;
      detail?: string;
    }> = [];

    // Pegamos as mais relevantes (reprovadas, em andamento, criadas)
    orders.forEach((o) => {
      if (o.status === 'reproved') {
        activities.push({
          id: `act-rep-${o.id}`,
          orderId: o.id,
          orderName: o.itemName,
          customer: o.customerName,
          timeAgo: 'Hoje',
          type: 'reproved',
          title: `OS Reprovada no teste de entrega`,
          detail: o.notes || 'Necessita retrabalho do técnico responsável.',
        });
      }
      if (o.status === 'progress') {
        activities.push({
          id: `act-prog-${o.id}`,
          orderId: o.id,
          orderName: o.itemName,
          customer: o.customerName,
          timeAgo: 'Hoje',
          type: 'progress',
          title: `Em bancada com ${o.technician || 'técnico'}`,
          detail: o.defect ? `Defeito: ${o.defect}` : undefined,
        });
      }
      if (o.status === 'ready') {
        activities.push({
          id: `act-ready-${o.id}`,
          orderId: o.id,
          orderName: o.itemName,
          customer: o.customerName,
          timeAgo: 'Recente',
          type: 'ready',
          title: `OS Concluída e Pronta para retirada`,
          detail: `Valor: ${money(workOrderTotal(o))}`,
        });
      }
    });

    return activities.slice(0, 5);
  }, [orders]);

  return (
    <div className="os-dashboard-view">
      {/* Banner de Boas-Vindas Estilo Jira (Imagem 3) */}
      <div className="os-dash-welcome-card">
        <div className="os-dash-welcome-card__icon">📊</div>
        <div className="os-dash-welcome-card__text">
          <strong>Resumo Geral & Métricas da Operação</strong>
          <p>
            Visão consolidada em tempo real da produtividade da oficina, distribuição de bancadas e gargalos.
            Navegue pelos gráficos para filtrar diretamente no <strong>Quadro Kanban</strong> ou <strong>Backlog</strong>.
          </p>
        </div>
        <div className="os-dash-welcome-card__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={onNewOrder}>
            <AdminIcon name="plus" />
            <span>Nova OS</span>
          </button>
        </div>
      </div>

      {/* Grid de Cards KPIs (Imagem 3) */}
      <div className="os-dash-kpis-grid">
        <div
          className="os-dash-kpi-card os-dash-kpi-card--green"
          onClick={() => onGoToBoard('ready')}
          title="Clique para filtrar OSs Prontas no Quadro"
        >
          <div className="os-dash-kpi-card__top">
            <span className="os-dash-kpi-card__badge">🟢 Prontos</span>
            <span className="os-dash-kpi-card__time">Últimos dias</span>
          </div>
          <strong className="os-dash-kpi-card__number">{readyCount}</strong>
          <span className="os-dash-kpi-card__sub">
            {money(totalReadyValue)} prontos p/ entrega
          </span>
        </div>

        <div
          className="os-dash-kpi-card os-dash-kpi-card--blue"
          onClick={() => onGoToBoard('open')}
          title="Clique para filtrar OSs Em Oficina no Quadro"
        >
          <div className="os-dash-kpi-card__top">
            <span className="os-dash-kpi-card__badge">🔵 Em Oficina</span>
            <span className="os-dash-kpi-card__time">Abertas</span>
          </div>
          <strong className="os-dash-kpi-card__number">{openCount}</strong>
          <span className="os-dash-kpi-card__sub">Aguardando início em bancada</span>
        </div>

        <div
          className="os-dash-kpi-card os-dash-kpi-card--orange"
          onClick={() => onGoToBoard('progress')}
          title="Clique para filtrar OSs Em Serviço no Quadro"
        >
          <div className="os-dash-kpi-card__top">
            <span className="os-dash-kpi-card__badge">🟠 Em Serviço</span>
            <span className="os-dash-kpi-card__time">Em bancada</span>
          </div>
          <strong className="os-dash-kpi-card__number">{progressCount}</strong>
          <span className="os-dash-kpi-card__sub">
            {money(totalInService)} em execução
          </span>
        </div>

        <div
          className="os-dash-kpi-card os-dash-kpi-card--purple"
          onClick={onGoToBacklog}
          title="Clique para abrir a tela exclusiva do Backlog"
        >
          <div className="os-dash-kpi-card__top">
            <span className="os-dash-kpi-card__badge">⏳ No Backlog</span>
            <span className="os-dash-kpi-card__time">Triagem</span>
          </div>
          <strong className="os-dash-kpi-card__number">{backlogCount}</strong>
          <span className="os-dash-kpi-card__sub">Não inicializadas (ver tela →)</span>
        </div>

        <div
          className="os-dash-kpi-card os-dash-kpi-card--red"
          onClick={() => onGoToBoard('reproved')}
          title="Clique para filtrar OSs Reprovadas no Quadro"
        >
          <div className="os-dash-kpi-card__top">
            <span className="os-dash-kpi-card__badge">⚠️ Reprovadas</span>
            <span className="os-dash-kpi-card__time">Qualidade</span>
          </div>
          <strong className="os-dash-kpi-card__number">{reprovedCount}</strong>
          <span className="os-dash-kpi-card__sub">Pendências de entrega / retrabalho</span>
        </div>

        <div className="os-dash-kpi-card os-dash-kpi-card--yellow">
          <div className="os-dash-kpi-card__top">
            <span className="os-dash-kpi-card__badge">📄 Orçamentos</span>
            <span className="os-dash-kpi-card__time">Aguardando</span>
          </div>
          <strong className="os-dash-kpi-card__number">{quoteSentCount}</strong>
          <span className="os-dash-kpi-card__sub">Propostas enviadas ao cliente</span>
        </div>
      </div>

      {/* Seção Principal de Gráficos (Estilo Jira Imagem 3) */}
      <div className="os-dash-charts-grid">
        {/* Gráfico Donut de Status Geral */}
        <div className="os-dash-card os-dash-card--donut">
          <div className="os-dash-card__head">
            <div>
              <h3>Visão geral do status</h3>
              <p>Distribuição proporcional dos chamados em todo o ciclo.</p>
            </div>
            <button
              type="button"
              className="os-jira-link-btn"
              onClick={() => onGoToBoard()}
            >
              Visualizar Quadro →
            </button>
          </div>

          <div className="os-dash-donut-wrap">
            {/* SVG Donut Ring */}
            <div className="os-dash-donut-svg-box">
              <svg viewBox="0 0 200 200" className="os-dash-donut-svg">
                <circle
                  cx="100"
                  cy="100"
                  r="70"
                  fill="none"
                  stroke="rgba(0, 0, 0, 0.06)"
                  strokeWidth="24"
                />
                {statusSlices.map((slice) => (
                  <circle
                    key={slice.key}
                    cx="100"
                    cy="100"
                    r="70"
                    fill="none"
                    stroke={slice.color}
                    strokeWidth="24"
                    strokeDasharray={slice.strokeDash}
                    strokeDashoffset={slice.strokeOffset}
                    transform="rotate(-90 100 100)"
                    style={{ transition: 'stroke-dasharray 0.4s ease' }}
                  />
                ))}
              </svg>
              <div className="os-dash-donut-center">
                <strong>{orders.length}</strong>
                <span>Total de OSs</span>
              </div>
            </div>

            {/* Legenda Lateral Interativa */}
            <div className="os-dash-donut-legend">
              {statusSlices.map((slice) => (
                <div
                  key={slice.key}
                  className="os-dash-legend-item"
                  onClick={() => onGoToBoard(slice.key as WorkOrderStatus)}
                  title={`Filtrar ${slice.label} no Quadro`}
                >
                  <span
                    className="os-dash-legend-color"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="os-dash-legend-name">{slice.label}</span>
                  <strong className="os-dash-legend-val">{slice.count}</strong>
                  <span className="os-dash-legend-pct">{slice.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gráfico de Distribuição por Prioridade */}
        <div className="os-dash-card os-dash-card--priority">
          <div className="os-dash-card__head">
            <div>
              <h3>Distribuição por Prioridade</h3>
              <p>Níveis de severidade e urgência da oficina.</p>
            </div>
          </div>

          <div className="os-dash-priority-list">
            {priorityDistribution.map((p) => (
              <div key={p.key} className="os-dash-p-row">
                <div className="os-dash-p-info">
                  <span className="os-dash-p-symbol" style={{ color: p.color }}>
                    {p.symbol}
                  </span>
                  <span className="os-dash-p-label">{p.label}</span>
                  <span className="os-dash-p-count">
                    {p.count} ({p.pct}%)
                  </span>
                </div>
                <div className="os-dash-progress-track">
                  <div
                    className="os-dash-progress-fill"
                    style={{
                      width: `${p.pct}%`,
                      backgroundColor: p.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Destaque de Saúde da Operação */}
          <div className="os-dash-health-box">
            <div className="os-dash-health-item">
              <span>Taxa de Conclusão</span>
              <strong style={{ color: '#16a34a' }}>
                {orders.length > 0 ? Math.round((totalCompleted / orders.length) * 100) : 100}%
              </strong>
            </div>
            <div className="os-dash-health-item">
              <span>Taxa de Retrabalho</span>
              <strong style={{ color: reprovedCount > 0 ? '#ef4444' : '#16a34a' }}>
                {orders.length > 0 ? Math.round((reprovedCount / orders.length) * 100) : 0}%
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Linha Inferior: Carga de Trabalho dos Técnicos e Atividade Recente */}
      <div className="os-dash-bottom-grid">
        {/* Carga de Trabalho por Técnico */}
        <div className="os-dash-card">
          <div className="os-dash-card__head">
            <div>
              <h3>Carga de Trabalho por Técnico</h3>
              <p>Chamados ativos atribuídos a cada profissional de bancada.</p>
            </div>
          </div>

          <div className="os-dash-tech-workload-list">
            {techWorkload.map((tech) => {
              const maxLoad = Math.max(...techWorkload.map((t) => t.totalActive), 1);
              const barWidth = Math.round((tech.totalActive / maxLoad) * 100);

              return (
                <div key={tech.id} className="os-dash-tech-row">
                  <div className="os-dash-tech-profile">
                    <img src={tech.avatarUrl} alt={tech.name} className="os-dash-tech-avatar" />
                    <div className="os-dash-tech-names">
                      <strong>{tech.name}</strong>
                      <small>{tech.specialty}</small>
                    </div>
                  </div>

                  <div className="os-dash-tech-bar-wrap">
                    <div className="os-dash-tech-bar-track">
                      <div
                        className="os-dash-tech-bar-fill"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="os-dash-tech-badge">
                      {tech.totalActive} {tech.totalActive === 1 ? 'OS' : 'OSs'}
                      {tech.inProgress > 0 ? ` (${tech.inProgress} agora)` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Atividade Recente (Estilo Imagem 3) */}
        <div className="os-dash-card">
          <div className="os-dash-card__head">
            <div>
              <h3>Atividade Recente</h3>
              <p>Acontecimentos e movimentações das bancadas.</p>
            </div>
          </div>

          <div className="os-dash-activity-feed">
            {recentActivities.length === 0 ? (
              <p className="empty">Nenhuma atividade recente registrada.</p>
            ) : (
              recentActivities.map((act) => {
                const badgeColor =
                  act.type === 'reproved'
                    ? '#ef4444'
                    : act.type === 'progress'
                    ? '#f97316'
                    : '#16a34a';

                return (
                  <div
                    key={act.id}
                    className="os-dash-activity-item"
                    onClick={() => {
                      const found = orders.find((o) => o.id === act.orderId);
                      if (found) onOpenOrder(found);
                    }}
                  >
                    <span
                      className="os-dash-activity-dot"
                      style={{ backgroundColor: badgeColor }}
                    />
                    <div className="os-dash-activity-body">
                      <div className="os-dash-activity-line">
                        <strong className="os-dash-activity-code">{act.orderId}</strong>
                        <span>{act.orderName}</span>
                        <span className="os-dash-activity-time">{act.timeAgo}</span>
                      </div>
                      <p className="os-dash-activity-text">{act.title}</p>
                      {act.detail ? (
                        <small className="os-dash-activity-detail">{act.detail}</small>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
