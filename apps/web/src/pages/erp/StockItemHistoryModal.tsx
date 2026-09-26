import { useState } from 'react';
import {
  setDirectCount,
  type StockBalanceAudit,
  type StockBalanceItem,
} from '../../data/stockInventoryStore';

type Props = {
  balance: StockBalanceAudit;
  item: StockBalanceItem;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

export function StockItemHistoryModal({ balance, item, isOpen, onClose, onUpdated }: Props) {
  const [editingDirect, setEditingDirect] = useState(false);
  const [newCountVal, setNewCountVal] = useState(String(item.countedQty ?? '0'));

  if (!isOpen) return null;

  function handleResetCount() {
    if (!window.confirm(`Deseja realmente zerar a contagem de "${item.name}" e marcar como pendente?`)) {
      return;
    }
    setDirectCount(balance.id, item.stockId, null, 'Contagem reiniciada');
    onUpdated();
    onClose();
  }

  function handleSaveDirect() {
    const val = parseFloat(newCountVal.replace(',', '.'));
    if (!Number.isFinite(val) || val < 0) {
      alert('Informe uma quantidade válida.');
      return;
    }
    setDirectCount(balance.id, item.stockId, val, 'Ajuste direto no histórico');
    onUpdated();
    setEditingDirect(false);
  }

  const SOURCE_LABELS: Record<string, string> = {
    barcode: '📷 Leitor / Coletor (Bip)',
    collector: '📟 Coletor de Dados',
    manual: '✍️ Lançamento Manual',
    txt: '📄 Importação TXT',
    excel: '📊 Importação Excel',
  };

  return (
    <div className="stock-modal-backdrop" onClick={onClose}>
      <div className="stock-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="stock-modal__head">
          <h3 className="stock-modal__title">📋 Histórico de Lançamentos do Item</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="stock-modal__body">
          <div className="stock-inv-security-notice">
            <strong style={{ fontSize: '1.05rem' }}>{item.name}</strong>
            <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
              SKU: {item.sku || '—'} · Barras: {item.barcode || '—'} · Sistema: {item.systemQty} {item.unit}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, alignItems: 'center' }}>
              <div>
                Total Contado:{' '}
                <strong style={{ fontSize: '1.1rem', color: '#0f766e' }}>
                  {item.countedQty === null ? 'Pendente' : `${item.countedQty} ${item.unit}`}
                </strong>
              </div>
              <div>
                Diferença:{' '}
                <strong
                  style={{
                    fontSize: '1.1rem',
                    color: item.difference === 0 ? '#166534' : item.difference > 0 ? '#0369a1' : '#b91c1c',
                  }}
                >
                  {item.difference > 0 ? `+${item.difference}` : item.difference} {item.unit}
                </strong>
              </div>
            </div>
          </div>

          {balance.status === 'in_progress' ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {!editingDirect ? (
                <>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: '0.84rem' }}
                    onClick={() => setEditingDirect(true)}
                  >
                    ✏️ Corrigir Quantidade Total
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ fontSize: '0.84rem', color: '#dc2626' }}
                    onClick={handleResetCount}
                  >
                    🗑️ Zerar Contagem (Marcar Pendente)
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
                  <input
                    type="number"
                    step="any"
                    value={newCountVal}
                    onChange={(e) => setNewCountVal(e.target.value)}
                    style={{ width: '110px', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6 }}
                  />
                  <button type="button" className="btn btn--primary" onClick={handleSaveDirect}>
                    Salvar
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setEditingDirect(false)}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <h4 style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#475569' }}>
            Registros de Bipagem / Lançamentos ({item.entries.length}):
          </h4>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: '240px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px' }}>Data / Hora</th>
                  <th style={{ padding: '6px 10px' }}>Canal</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>Qtd Lançada</th>
                  <th style={{ padding: '6px 10px' }}>Usuário / Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {item.entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: '#64748b' }}>
                      Nenhum lançamento registrado para este item.
                    </td>
                  </tr>
                ) : (
                  item.entries.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(entry.timestamp).toLocaleTimeString('pt-BR')} ({new Date(entry.timestamp).toLocaleDateString('pt-BR')})
                      </td>
                      <td style={{ padding: '6px 10px', fontWeight: 600 }}>
                        {SOURCE_LABELS[entry.source] || entry.source}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                        +{entry.qty} {item.unit}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#475569' }}>
                        {entry.user}
                        {entry.note ? ` · ${entry.note}` : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stock-modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
