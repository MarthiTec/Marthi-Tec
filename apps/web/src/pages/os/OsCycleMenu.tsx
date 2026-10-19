import { useEffect, useRef, useState } from 'react';
import { listWorkOrders, OS_STATE_EVENT, type WorkOrderOperation } from '../../data/osStore';
import './osBoard.css';

/**
 * Ciclo da oficina no topo (no lugar do banner "Tarefas Ativas"): mostra a operação e o progresso
 * numa barrinha; ao abrir, traz o resumo, "Concluir ciclo" e se o quadro mostra o ciclo ou o histórico.
 */
export function OsCycleMenu({
  operation,
  showingAll,
  onShowAll,
  onFinish,
  light = false,
}: {
  /** Versão clara (dentro do painel, fora da barra escura da oficina). */
  light?: boolean;
  operation: WorkOrderOperation;
  /** true = quadro com todas as OS (histórico), não só o ciclo. */
  showingAll: boolean;
  onShowAll: (all: boolean) => void;
  onFinish: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({ total: 0, done: 0 });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const count = () => {
      const orders = listWorkOrders().filter((order) => (!order.operationId || order.operationId === operation.id) && order.status !== 'cancelled');
      setStats({ total: orders.length, done: orders.filter((order) => order.status === 'delivered').length });
    };
    count();
    window.addEventListener(OS_STATE_EVENT, count);
    return () => window.removeEventListener(OS_STATE_EVENT, count);
  }, [operation.id]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  const active = operation.status === 'active';

  return (
    <div className={`os-cycle${light ? ' os-cycle--light' : ''}`} ref={box}>
      <button type="button" className={`os-cycle__btn${open ? ' is-open' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="os-cycle__icon" aria-hidden>
          📅
        </span>
        <span className="os-cycle__text">
          <strong>{showingAll ? 'Todas as OS' : operation.title}</strong>
          <span className="os-cycle__bar" aria-hidden>
            <span style={{ width: `${percent}%` }} />
          </span>
        </span>
        <span className="os-cycle__count">
          {stats.done}/{stats.total}
        </span>
        <svg className="os-cycle__chev" viewBox="0 0 10 6" aria-hidden>
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      {open ? (
        <div className="os-cycle__panel" role="dialog" aria-label="Ciclo da oficina">
          <div className="os-cycle__head">
            <span className={`os-cycle__tag${active ? '' : ' is-done'}`}>{active ? 'Ciclo atual' : 'Ciclo arquivado'}</span>
            <strong>{operation.title}</strong>
          </div>
          <div className="os-cycle__progress">
            <span className="os-cycle__bar os-cycle__bar--big" aria-hidden>
              <span style={{ width: `${percent}%` }} />
            </span>
            <small>
              {stats.done} de {stats.total} {stats.total === 1 ? 'OS entregue' : 'OS entregues'} ({percent}%)
            </small>
          </div>
          <div className="os-cycle__view" role="radiogroup" aria-label="O que o quadro mostra">
            <button type="button" role="radio" aria-checked={!showingAll} className={!showingAll ? 'is-on' : ''} onClick={() => (onShowAll(false), setOpen(false))}>
              Só este ciclo
            </button>
            <button type="button" role="radio" aria-checked={showingAll} className={showingAll ? 'is-on' : ''} onClick={() => (onShowAll(true), setOpen(false))}>
              Todas as OS
            </button>
          </div>
          {active ? (
            <button
              type="button"
              className="btn btn--primary os-cycle__finish"
              title="Encerra o ciclo do mês e leva as OS pendentes para a próxima operação"
              onClick={() => {
                setOpen(false);
                onFinish();
              }}
            >
              Concluir ciclo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
