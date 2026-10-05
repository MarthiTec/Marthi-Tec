import '../pages/admin/externalSale.css';
import { useEffect, useState } from 'react';
import { apiGetDailyPendingTasks } from '../services/erpApi';
import { Link } from 'react-router-dom';

type Props = {
  onClose: () => void;
  onOpenPickupModal: () => void;
};

export function DailyPendingModal({ onClose, onOpenPickupModal }: Props) {
  const [tasks, setTasks] = useState<{
    pendingCashSalesCount: number;
    pendingCashTotal: number;
    pendingTradeInsCount: number;
    pendingTradeInsTotal: number;
    payablesDueCount: number;
    payablesDueAmount: number;
    receivablesDueCount: number;
    receivablesDueAmount: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGetDailyPendingTasks()
      .then((res) => setTasks(res))
      .catch(() => setError('Não foi possível consultar as pendências no banco.'))
      .finally(() => setLoading(false));
  }, []);

  if (error) return <div className="admin-modal-backdrop external-sale-backdrop"><div role="dialog" aria-modal="true" aria-label="Pendências do dia" className="admin-modal external-sale-modal"><p role="alert">{error}</p><button onClick={onClose}>Fechar</button></div></div>;
  return (
    <div className="admin-modal-backdrop external-sale-backdrop" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Pendências do dia" className="admin-modal external-sale-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '580px', width: '95vw' }}
      >
        <div className="admin-modal__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.3rem' }}>📋</span>
            <h3 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 700 }}>
              Pendências do Dia
            </h3>
          </div>
          <button className="admin-btn admin-btn--icon" onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>

        <div className="admin-modal__body" style={{ padding: '16px', maxHeight: '75vh', overflowY: 'auto' }}>
          <p style={{ margin: '0 0 16px 0', fontSize: '0.86rem', color: 'var(--mute)' }}>
            Organização diária das operações físicas e financeiras da loja para não sobrecarregar sua rotina.
          </p>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--mute)' }}>
              Carregando pendências do dia...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* 1. Dinheiro de Vendas sem Caixa na Loja */}
              <div
                style={{
                  background: 'var(--card-2, #1c2430)',
                  border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.1rem' }}>💵</span>
                    <strong style={{ fontSize: '0.94rem' }}>Dinheiro em Espécie na Loja</strong>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--mute)', marginTop: '2px' }}>
                    {tasks?.pendingCashSalesCount || 0} venda(s) externa(s) aguardando recolhimento
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--external-warning)' , marginTop: '4px' }}>
                    R$ {(tasks?.pendingCashTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn--secondary"
                  style={{ fontSize: '0.82rem' }}
                  onClick={() => {
                    onClose();
                    onOpenPickupModal();
                  }}
                >
                  Registrar Recolhimento
                </button>
              </div>

              {/* 2. Aparelhos de Upgrade / Trade-in Recebidos */}
              <div
                style={{
                  background: 'var(--card-2, #1c2430)',
                  border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.1rem' }}>📱</span>
                    <strong style={{ fontSize: '0.94rem' }}>Aparelhos de Upgrade (Trade-in)</strong>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--mute)', marginTop: '2px' }}>
                    {tasks?.pendingTradeInsCount || 0} aparelho(s) usado(s) recebidos aguardando conferência física
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--accent, #2dd4bf)', marginTop: '4px' }}>
                    Crédito total: R$ {(tasks?.pendingTradeInsTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <Link
                  to="/painel/produtos"
                  className="admin-btn admin-btn--secondary"
                  style={{ fontSize: '0.82rem' }}
                  onClick={onClose}
                >
                  Ver no Estoque
                </Link>
              </div>

              {/* 3. Contas a Pagar Vencendo Hoje */}
              <div
                style={{
                  background: 'var(--card-2, #1c2430)',
                  border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.1rem' }}>📤</span>
                    <strong style={{ fontSize: '0.94rem' }}>Contas a Pagar Vencendo</strong>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--mute)', marginTop: '2px' }}>
                    {tasks?.payablesDueCount || 0} lançamento(s) para conferência/pagamento hoje
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--external-danger)' , marginTop: '4px' }}>
                    R$ {(tasks?.payablesDueAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <Link
                  to="/painel/financeiro?tab=pagar"
                  className="admin-btn admin-btn--secondary"
                  style={{ fontSize: '0.82rem' }}
                  onClick={onClose}
                >
                  Ir para Contas
                </Link>
              </div>

              {/* 4. Contas a Receber Vencendo Hoje */}
              <div
                style={{
                  background: 'var(--card-2, #1c2430)',
                  border: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.1rem' }}>📥</span>
                    <strong style={{ fontSize: '0.94rem' }}>Contas a Receber Hoje</strong>
                  </div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--mute)', marginTop: '2px' }}>
                    {tasks?.receivablesDueCount || 0} título(s) com previsão de entrada
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--external-success)' , marginTop: '4px' }}>
                    R$ {(tasks?.receivablesDueAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <Link
                  to="/painel/financeiro?tab=receber"
                  className="admin-btn admin-btn--secondary"
                  style={{ fontSize: '0.82rem' }}
                  onClick={onClose}
                >
                  Conferir Recebíveis
                </Link>
              </div>
            </div>
          )}
        </div>

        <div
          className="admin-modal__foot"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px 16px',
            borderTop: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
          }}
        >
          <button type="button" className="admin-btn admin-btn--primary" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
