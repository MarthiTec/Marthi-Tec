import { useState } from 'react';
import {
  finishActiveOperation,
  type WorkOrder,
  type WorkOrderOperation,
} from '../../data/osStore';

type Props = {
  open: boolean;
  operation: WorkOrderOperation;
  orders: WorkOrder[];
  isMaster: boolean;
  onClose: () => void;
  onCompleted: (newOp: WorkOrderOperation) => void;
};

export function OsSprintModal({
  open,
  operation,
  orders,
  isMaster,
  onClose,
  onCompleted,
}: Props) {
  const [nextTitle, setNextTitle] = useState(() => {
    const nextDate = new Date();
    nextDate.setMonth(nextDate.getMonth() + 1);
    const monthName = nextDate.toLocaleDateString('pt-BR', { month: 'long' });
    const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    return `Operação ${capitalized} ${nextDate.getFullYear()}`;
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const currentOpOrders = orders.filter((o) => o.operationId === operation.id);
  const delivered = currentOpOrders.filter((o) => o.status === 'delivered');
  const pending = currentOpOrders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
  const completionPercent = currentOpOrders.length > 0
    ? Math.round((delivered.length / currentOpOrders.length) * 100)
    : 100;

  async function handleFinish() {
    if (!isMaster) {
      setError('Apenas o Operador Master possui permissão para encerrar uma Operação.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { newOp } = finishActiveOperation(
        operation.id,
        nextTitle.trim(),
        'Operador Master',
      );
      onCompleted(newOp);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao encerrar operação.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="os-modal-backdrop" role="dialog" aria-modal="true">
      <div className="os-modal os-modal--sprint">
        <header className="os-modal__head">
          <div className="os-modal__title-group">
            <span className="os-modal__kicker">Ciclo Mensal · Gestão de Tarefas da Oficina</span>
            <h2>Concluir Tarefas: {operation.title}</h2>
          </div>
          <button type="button" className="os-modal__close-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>

        {error ? <div className="os-modal__error">{error}</div> : null}

        <div className="os-sprint-body">
          {!isMaster ? (
            <div className="os-sprint-alert os-sprint-alert--warn">
              <strong>Permissão de Operador Master Necessária</strong>
              <p>
                Apenas o operador com perfil Master tem autorização para concluir o ciclo de tarefas e iniciar o próximo período.
              </p>
            </div>
          ) : (
            <div className="os-sprint-alert os-sprint-alert--info">
              <strong>Fechamento do Ciclo de Tarefas</strong>
              <p>
                Ao concluir, as tarefas finalizadas serão arquivadas no histórico deste período e as tarefas em andamento serão transferidas automaticamente para o próximo ciclo.
              </p>
            </div>
          )}

          <div className="os-sprint-stats">
            <div className="os-sprint-stat-item">
              <span className="os-sprint-stat-item__label">Total de Tarefas</span>
              <strong className="os-sprint-stat-item__val">{currentOpOrders.length}</strong>
            </div>
            <div className="os-sprint-stat-item is-success">
              <span className="os-sprint-stat-item__label">Tarefas Concluídas</span>
              <strong className="os-sprint-stat-item__val">{delivered.length}</strong>
            </div>
            <div className="os-sprint-stat-item is-warn">
              <span className="os-sprint-stat-item__label">A Transferir</span>
              <strong className="os-sprint-stat-item__val">{pending.length}</strong>
            </div>
            <div className="os-sprint-stat-item">
              <span className="os-sprint-stat-item__label">Taxa de Conclusão</span>
              <strong className="os-sprint-stat-item__val">{completionPercent}%</strong>
            </div>
          </div>

          <div className="os-sprint-progress">
            <div className="os-sprint-progress__track">
              <div
                className="os-sprint-progress__fill"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
          </div>

          {isMaster ? (
            <div className="os-sprint-next-form">
              <label>
                <span>Nome do Próximo Ciclo de Tarefas:</span>
                <input
                  value={nextTitle}
                  onChange={(e) => setNextTitle(e.target.value)}
                  placeholder="Ex.: Operação Outubro 2026"
                  required
                />
              </label>
              <small>
                {pending.length} tarefas em aberto serão automaticamente transferidas para este novo ciclo.
              </small>
            </div>
          ) : null}
        </div>

        <footer className="os-modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary os-btn-sprint-finish"
            disabled={busy || !isMaster}
            onClick={handleFinish}
          >
            {busy ? 'Concluindo Ciclo…' : 'Concluir Tarefas & Iniciar Próximo Ciclo'}
          </button>
        </footer>
      </div>
    </div>
  );
}
