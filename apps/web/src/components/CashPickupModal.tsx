import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { apiCreatePickup, apiListPickups } from '../services/erpApi';

type Props = {
  onClose: () => void;
  onSuccess: () => void;
};

export function CashPickupModal({ onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const [responsibleName, setResponsibleName] = useState(user?.name || '');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pendingBalance, setPendingBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiListPickups()
      .then((res) => {
        setPendingBalance(res.pendingCashBalance || 0);
        if (res.pendingCashBalance > 0) {
          setAmount(String(res.pendingCashBalance));
        }
      })
      .catch(() => setError('Não foi possível consultar o saldo pendente no banco.'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = Number(amount.replace(',', '.'));
    if (!val || val <= 0) {
      setError('Informe um valor válido maior que zero.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      await apiCreatePickup({
        responsibleName: responsibleName.trim(),
        amount: val,
        pickupDate,
        notes: notes.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao registrar recolhimento.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px', width: '95vw' }}
      >
        <div className="admin-modal__head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
            💰 Recolhimento de Valores em Espécie
          </h3>
          <button className="admin-btn admin-btn--icon" onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="admin-modal__body" style={{ padding: '16px' }}>
            {/* Saldo Físico Pendente na Loja */}
            <div
              style={{
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontSize: '0.78rem', color: '#eab308', textTransform: 'uppercase', fontWeight: 700 }}>
                  Dinheiro Físico Pendente na Loja
                </span>
                <div style={{ fontSize: '0.84rem', color: 'var(--mute)' }}>
                  Acumulado de vendas sem caixa em espécie
                </div>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#eab308' }}>
                R$ {pendingBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid #ef4444',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '0.84rem',
                  marginBottom: '12px',
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label className="admin-label">Data do Recolhimento</label>
                <input
                  type="date"
                  className="admin-input"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="admin-label">Responsável pela Retirada</label>
                <input
                  type="text"
                  className="admin-input"
                  value={responsibleName}
                  onChange={(e) => setResponsibleName(e.target.value)}
                  placeholder="Responsável pelo recolhimento"
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className="admin-label">Valor Recolhido (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="admin-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                required
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className="admin-label">Origem / Forma de Pagamento</label>
              <input
                type="text"
                className="admin-input"
                value="Vendas Externas / Dinheiro em Espécie"
                disabled
                style={{ opacity: 0.7 }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label className="admin-label">Observações</label>
              <textarea
                className="admin-input"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Retirada semanal do dinheiro de vendas sem caixa da loja."
              />
            </div>
          </div>

          <div
            className="admin-modal__foot"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '14px 16px',
              borderTop: '1px solid var(--line, rgba(148, 163, 184, 0.22))',
            }}
          >
            <button type="button" className="admin-btn admin-btn--secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="admin-btn admin-btn--primary" disabled={loading}>
              {loading ? 'Registrando...' : 'Confirmar Recolhimento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
