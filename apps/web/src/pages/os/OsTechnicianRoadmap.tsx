import { useMemo } from 'react';
import {
  STATUS_LABEL,
  TECHNICIANS_LIST,
  workOrderTotal,
  type WorkOrder,
  type WorkOrderPriority,
} from '../../data/osStore';

type Props = {
  orders: WorkOrder[];
  onOpenOrder: (order: WorkOrder) => void;
};

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function priorityIcon(p: WorkOrderPriority) {
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

export function OsTechnicianRoadmap({ orders, onOpenOrder }: Props) {
  const techData = useMemo(() => {
    return TECHNICIANS_LIST.map((tech) => {
      const assigned = orders.filter(
        (o) => o.technician?.toLowerCase() === tech.name.toLowerCase(),
      );
      const open = assigned.filter((o) => !['delivered', 'cancelled'].includes(o.status));
      const inProgress = assigned.filter((o) => o.status === 'progress');
      const ready = assigned.filter((o) => o.status === 'ready');
      const urgent = assigned.filter((o) => o.priority === 'urgent' && o.status !== 'delivered');
      const totalLabor = assigned.reduce((sum, o) => sum + (o.labor || 0), 0);
      const totalParts = assigned.reduce((sum, o) => sum + (o.parts || 0), 0);

      // Progresso percentual da capacidade estimada (ex.: 8 OSs = 100%)
      const capacityPercent = Math.min(100, Math.round((open.length / 8) * 100));

      return {
        tech,
        assigned,
        open,
        inProgress,
        ready,
        urgent,
        totalLabor,
        totalParts,
        capacityPercent,
      };
    });
  }, [orders]);

  const unassigned = useMemo(
    () => orders.filter((o) => !o.technician || !TECHNICIANS_LIST.some((t) => t.name.toLowerCase() === o.technician.toLowerCase())),
    [orders],
  );

  return (
    <div className="os-roadmap">
      <header className="os-roadmap__head">
        <div>
          <h2>Roadmap & Carga de Trabalho dos Técnicos</h2>
          <p>
            Acompanhe a distribuição de ordens de serviço por bancada, prazos e capacidade de atendimento.
          </p>
        </div>
        <div className="os-roadmap__meta-summary">
          <span>
            <strong>{orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length}</strong> OSs ativas
          </span>
          <span>
            <strong>{orders.filter((o) => o.status === 'progress').length}</strong> em bancada agora
          </span>
          <span>
            <strong>{orders.filter((o) => o.priority === 'urgent').length}</strong> urgências
          </span>
        </div>
      </header>

      <div className="os-roadmap__grid">
        {techData.map(({ tech, open, urgent, capacityPercent }) => {
          const isOverloaded = capacityPercent >= 85;
          return (
            <article key={tech.id} className="os-roadmap-card">
              <header className="os-roadmap-card__head">
                <div className="os-roadmap-card__user">
                  <div className="os-roadmap-card__avatar-wrap">
                    <img src={tech.avatarUrl} alt={tech.name} className="os-roadmap-card__avatar" />
                    <span className="os-roadmap-card__online-dot" title="Online na bancada" />
                  </div>
                  <div>
                    <strong>{tech.name}</strong>
                    <p>{tech.role}</p>
                    <span className="os-roadmap-card__spec">{tech.specialty}</span>
                  </div>
                </div>

                <div className="os-roadmap-card__stats-pills">
                  <span className="os-roadmap-card__pill" title="OSs abertas">
                    {open.length} ativas
                  </span>
                  {urgent.length > 0 ? (
                    <span className="os-roadmap-card__pill os-roadmap-card__pill--urgent" title="Urgências">
                      {urgent.length} urgentes
                    </span>
                  ) : null}
                </div>
              </header>

              {/* Barra de Carga de Trabalho */}
              <div className="os-workload-bar">
                <div className="os-workload-bar__label">
                  <span>Carga de Bancada</span>
                  <strong className={isOverloaded ? 'is-danger' : ''}>
                    {open.length} / 8 OSs ({capacityPercent}%)
                  </strong>
                </div>
                <div className="os-workload-bar__track">
                  <div
                    className={`os-workload-bar__fill ${
                      isOverloaded ? 'is-danger' : capacityPercent > 60 ? 'is-warn' : 'is-good'
                    }`}
                    style={{ width: `${capacityPercent}%` }}
                  />
                </div>
              </div>

              {/* Lista de OSs em andamento deste técnico */}
              <div className="os-roadmap-card__list">
                <div className="os-roadmap-card__section-title">
                  <span>Chamados em Atendimento</span>
                  <small>Clique para abrir o painel</small>
                </div>

                {open.length === 0 ? (
                  <div className="os-roadmap-card__empty">Bancada livre · sem chamados pendentes</div>
                ) : (
                  open.map((order) => {
                    const pMeta = priorityIcon(order.priority);
                    return (
                      <button
                        key={order.id}
                        type="button"
                        className="os-roadmap-item"
                        onClick={() => onOpenOrder(order)}
                      >
                        <div
                          className="os-roadmap-item__p-stripe"
                          style={{ backgroundColor: pMeta.color }}
                        />
                        <div className="os-roadmap-item__content">
                          <div className="os-roadmap-item__top">
                            <span className="os-roadmap-item__code">{order.id}</span>
                            <span
                              className="os-roadmap-item__priority"
                              style={{ color: pMeta.color }}
                              title={`Prioridade ${pMeta.label}`}
                            >
                              <strong>{pMeta.symbol}</strong> {pMeta.label}
                            </span>
                            <span className="os-status-chip os-status-chip--sm">
                              {STATUS_LABEL[order.status]}
                            </span>
                          </div>
                          <strong className="os-roadmap-item__title">{order.itemName}</strong>
                          <p className="os-roadmap-item__cust">{order.customerName}</p>
                          <div className="os-roadmap-item__foot">
                            <span>Prazo: {order.estimatedReadyAt || 'Sem prazo'}</span>
                            <strong>{money(workOrderTotal(order))}</strong>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </article>
          );
        })}

        {/* Bloco de Não Atribuídos (se houver) */}
        {unassigned.length > 0 ? (
          <article className="os-roadmap-card os-roadmap-card--unassigned">
            <header className="os-roadmap-card__head">
              <div>
                <strong>Aguardando Atribuição de Técnico</strong>
                <p>Chamados abertos sem responsável definido</p>
              </div>
              <span className="os-roadmap-card__pill os-roadmap-card__pill--warn">
                {unassigned.length} pendentes
              </span>
            </header>
            <div className="os-roadmap-card__list">
              {unassigned.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="os-roadmap-item"
                  onClick={() => onOpenOrder(order)}
                >
                  <div className="os-roadmap-item__content">
                    <div className="os-roadmap-item__top">
                      <span className="os-roadmap-item__code">{order.id}</span>
                      <span className="os-status-chip os-status-chip--sm">
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    <strong className="os-roadmap-item__title">{order.itemName}</strong>
                    <p className="os-roadmap-item__cust">{order.customerName}</p>
                  </div>
                </button>
              ))}
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}
