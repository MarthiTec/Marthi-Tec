import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { userIsStoreAdmin } from '../../data/erpRegistry';
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
  onCompleted: (newOp: WorkOrderOperation, concludedCount?: number) => void;
};

export function OsSprintModal({
  open,
  operation,
  orders,
  isMaster,
  onClose,
  onCompleted,
}: Props) {
  const { user } = useAuth();
  const canFinish = isMaster || user?.role === 'admin' || userIsStoreAdmin(user?.email);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const currentOpOrders = orders.filter(
    (o) => (!o.operationId || o.operationId === operation.id) && o.status !== 'cancelled',
  );
  const delivered = currentOpOrders.filter((o) => o.status === 'delivered');
  const ready = currentOpOrders.filter((o) => o.status === 'ready');
  const inProgress = currentOpOrders.filter(
    (o) => !['delivered', 'ready', 'cancelled'].includes(o.status),
  );
  const totalFinishedAfter = delivered.length + ready.length;
  const completionPercent =
    currentOpOrders.length > 0
      ? Math.round((totalFinishedAfter / currentOpOrders.length) * 100)
      : 100;

  async function handleFinish() {
    if (!canFinish) {
      setError('Apenas o Operador Master ou Administrador possui permissão para concluir as tarefas.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { newOp, concludedCount } = await finishActiveOperation(
        operation.id,
        operation.title,
        user?.name || 'Operador Master',
      );
      onCompleted(newOp, concludedCount);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao concluir tarefas.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="os-modal-backdrop" role="dialog" aria-modal="true">
      <div className="os-modal os-modal--sprint">
        <header className="os-modal__head">
          <div className="os-modal__title-group">
            <span className="os-modal__kicker">Gestão de Tarefas da Oficina</span>
            <h2>Concluir Tarefas: {operation.title}</h2>
          </div>
          <button type="button" className="os-modal__close-btn" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </header>

        {error ? <div className="os-modal__error">{error}</div> : null}

        <div className="os-sprint-body">
          {!canFinish ? (
            <div className="os-sprint-alert os-sprint-alert--warn">
              <strong>Permissão de Operador Master Necessária</strong>
              <p>
                Apenas o operador com perfil Master ou Administrador tem autorização para dar baixa em lote nas tarefas prontas deste período.
              </p>
            </div>
          ) : (
            <div className="os-sprint-alert os-sprint-alert--info">
              <strong>Baixa de Tarefas Prontas no Período Atual</strong>
              <p>
                Ao confirmar, as OSs com status <strong>Pronta ({ready.length})</strong> serão marcadas como <strong>Entregues/Concluídas</strong> dentro de <strong>{operation.title}</strong>, mantendo as OSs em andamento no quadro sem gerar ciclos duplicados.
              </p>
            </div>
          )}

          <div className="os-sprint-stats">
            <div className="os-sprint-stat-item">
              <span className="os-sprint-stat-item__label">Total no Período</span>
              <strong className="os-sprint-stat-item__val">{currentOpOrders.length}</strong>
            </div>
            <div className="os-sprint-stat-item is-success">
              <span className="os-sprint-stat-item__label">Prontas p/ Concluir</span>
              <strong className="os-sprint-stat-item__val">{ready.length}</strong>
            </div>
            <div className="os-sprint-stat-item">
              <span className="os-sprint-stat-item__label">Já Entregues</span>
              <strong className="os-sprint-stat-item__val">{delivered.length}</strong>
            </div>
            <div className="os-sprint-stat-item is-warn">
              <span className="os-sprint-stat-item__label">Em Bancada</span>
              <strong className="os-sprint-stat-item__val">{inProgress.length}</strong>
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
        </div>

        <footer className="os-modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--primary os-btn-sprint-finish"
            disabled={busy || !canFinish}
            onClick={handleFinish}
          >
            {busy
              ? 'Concluindo Tarefas…'
              : ready.length > 0
              ? `Concluir ${ready.length} ${ready.length === 1 ? 'Tarefa Pronta' : 'Tarefas Prontas'}`
              : 'Atualizar Ciclo Atual'}
          </button>
        </footer>
      </div>
    </div>
  );
}

