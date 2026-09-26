import { useState } from 'react';
import {
  finalizeStockBalance,
  formatDuration,
  type StockBalanceAudit,
} from '../../data/stockInventoryStore';

type Props = {
  balance: StockBalanceAudit;
  isOpen: boolean;
  onClose: () => void;
  onFinalized: (finalized: StockBalanceAudit) => void;
};

export function StockFinalizeModal({ balance, isOpen, onClose, onFinalized }: Props) {
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  function handleConfirm() {
    setIsSubmitting(true);
    const result = finalizeStockBalance(balance.id, notes.trim());
    if (result) {
      onFinalized(result);
      onClose();
    }
    setIsSubmitting(false);
  }

  const hasPending = balance.pendingItems > 0;
  const hasDivergences = balance.divergentItems > 0;

  return (
    <div className="stock-modal-backdrop" onClick={onClose}>
      <div className="stock-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="stock-modal__head">
          <h3 className="stock-modal__title">🏁 Finalizar Balanço de Estoque</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="stock-modal__body">
          <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{balance.title}</strong>
              <span className="stock-inv-badge-code">{balance.code}</span>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: 4 }}>
              Responsável: {balance.responsibleUser} · Início: {new Date(balance.startedAt).toLocaleString('pt-BR')} · Duração estimada: {formatDuration(balance.durationSeconds)}
            </div>
          </div>

          {/* Indicadores de conferência */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: '#166534', display: 'block' }}>Produtos Contados</span>
              <strong style={{ fontSize: '1.25rem', color: '#15803d' }}>
                {balance.countedItems} de {balance.totalItems}
              </strong>
            </div>

            <div style={{ padding: '10px 14px', background: hasPending ? '#fef2f2' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: '0.78rem', color: hasPending ? '#b91c1c' : '#64748b', display: 'block' }}>Produtos Pendentes</span>
              <strong style={{ fontSize: '1.25rem', color: hasPending ? '#dc2626' : '#64748b' }}>
                {balance.pendingItems}
              </strong>
            </div>
          </div>

          {hasPending ? (
            <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: '0.86rem' }}>
              ⚠️ <strong>Atenção:</strong> Existem <strong>{balance.pendingItems} produtos</strong> no catálogo que não receberam nenhuma contagem física. Eles permanecerão com o saldo do sistema inalterado.
            </div>
          ) : null}

          {hasDivergences ? (
            <div style={{ padding: '12px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: '0.86rem' }}>
              📊 <strong>Resumo das Divergências:</strong>
              <div style={{ marginTop: 4 }}>
                • <strong>{balance.divergentItems} produtos</strong> apresentaram divergência entre a contagem e o sistema.
              </div>
              <div>
                • Sobras detectadas: <strong>+{balance.divergentPositiveUnits} UN</strong>
              </div>
              <div>
                • Faltas detectadas: <strong>-{balance.divergentNegativeUnits} UN</strong>
              </div>
              <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#3b82f6' }}>
                * A finalização congela o resultado para auditoria. Você poderá gerar os ajustes de estoque posteriormente na consulta do balanço.
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: '0.86rem' }}>
              ✅ <strong>Estoque 100% conciliado!</strong> Nenhuma divergência detectada entre o sistema e a contagem física.
            </div>
          )}

          <label>
            <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Observações Finais do Balanço (opcional)
            </span>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Auditoria semestral completa, recontado setor A e vitrine..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.88rem' }}
            />
          </label>
        </div>

        <div className="stock-modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={isSubmitting}>
            Continuar Contando
          </button>
          <button type="button" className="btn btn--primary" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Finalizando...' : 'Confirmar e Finalizar Balanço'}
          </button>
        </div>
      </div>
    </div>
  );
}
