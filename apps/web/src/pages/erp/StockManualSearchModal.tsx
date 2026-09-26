import { useState, useMemo, type FormEvent } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { recordCount, type StockBalanceAudit, type StockBalanceItem } from '../../data/stockInventoryStore';

type Props = {
  balance: StockBalanceAudit;
  isOpen: boolean;
  onClose: () => void;
  onCountSaved: () => void;
};

export function StockManualSearchModal({ balance, isOpen, onClose, onCountSaved }: Props) {
  const [query, setQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<StockBalanceItem | null>(null);
  const [countedQty, setCountedQty] = useState<string>('1');
  const [mode, setMode] = useState<'add' | 'set'>('add');
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const itemsList = useMemo(() => Object.values(balance.items), [balance.items]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return itemsList.slice(0, 50);
    return itemsList
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(q) ||
          item.sku.toLowerCase().includes(q) ||
          item.barcode.toLowerCase().includes(q) ||
          item.imei.toLowerCase().includes(q) ||
          item.stockId.toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [itemsList, query]);

  if (!isOpen) return null;

  function handleSelectItem(item: StockBalanceItem) {
    setSelectedItem(item);
    setFeedback(null);
    setCountedQty('1');
    setMode('add');
  }

  function handleSave(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!selectedItem) return;

    const qty = parseFloat(countedQty.replace(',', '.'));
    if (!Number.isFinite(qty) || qty < 0) {
      setFeedback({ type: 'err', msg: 'Informe uma quantidade válida.' });
      return;
    }

    const res = recordCount(balance.id, {
      codeOrId: selectedItem.stockId,
      qty,
      source: 'manual',
      mode,
      note: note.trim() || 'Lançamento manual',
    });

    if (res.ok) {
      setFeedback({
        type: 'ok',
        msg: `✅ ${selectedItem.name} atualizado! Novo saldo contado: ${res.item?.countedQty} ${selectedItem.unit}.`,
      });
      onCountSaved();
      setSelectedItem(null);
      setNote('');
      setQuery('');
    } else {
      setFeedback({ type: 'err', msg: res.error || 'Erro ao registrar contagem.' });
    }
  }

  return (
    <div className="stock-modal-backdrop" onClick={onClose}>
      <div
        className="stock-modal stock-modal--large"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="stock-modal__head">
          <h3 className="stock-modal__title">🔍 Pesquisa Manual de Produtos</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="stock-modal__body">
          {feedback ? (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: '0.88rem',
                fontWeight: 600,
                background: feedback.type === 'ok' ? '#dcfce7' : '#fee2e2',
                color: feedback.type === 'ok' ? '#166534' : '#991b1b',
              }}
            >
              {feedback.msg}
            </div>
          ) : null}

          {!selectedItem ? (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                  Digite o Nome, SKU, Código de Barras, IMEI ou Código Interno:
                </span>
                <input
                  type="text"
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ex: iPhone 13, tela, 7890000000000..."
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    fontSize: '1rem',
                  }}
                />
              </label>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: '340px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '8px 12px' }}>Produto</th>
                      <th style={{ padding: '8px 12px' }}>Códigos</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Sistema</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Contado</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                          Nenhum produto encontrado para "{query}".
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => (
                        <tr key={item.stockId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px' }}>
                            <strong>{item.name}</strong>
                            {(item.color || item.capacity) && (
                              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                {[item.color, item.capacity].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#475569' }}>
                            {item.sku}
                            {item.barcode ? ` · Barras: ${item.barcode}` : ''}
                            {item.imei ? ` · IMEI: ${item.imei}` : ''}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>
                            {item.systemQty} {item.unit}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>
                            {item.countedQty === null ? (
                              <span style={{ color: '#94a3b8' }}>Pendente</span>
                            ) : (
                              `${item.countedQty} ${item.unit}`
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <button
                              type="button"
                              className="btn btn--primary"
                              style={{ padding: '4px 10px', fontSize: '0.82rem' }}
                              onClick={() => handleSelectItem(item)}
                            >
                              Contar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <strong style={{ fontSize: '1.05rem', color: '#0f172a', display: 'block' }}>
                  {selectedItem.name}
                </strong>
                <div style={{ fontSize: '0.84rem', color: '#64748b', marginTop: 4 }}>
                  SKU: {selectedItem.sku || '—'} · Barras: {selectedItem.barcode || '—'} · Sistema: {selectedItem.systemQty} {selectedItem.unit}
                  {selectedItem.countedQty !== null ? ` · Já contado: ${selectedItem.countedQty} ${selectedItem.unit}` : ' · Ainda não contado'}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
                  <AdminPicker
                    label="Modo de Lançamento"
                    value={mode}
                    options={[
                      { value: 'add', label: 'Somar à contagem atual ( + )' },
                      { value: 'set', label: 'Definir quantidade exata total ( = )' },
                    ]}
                    onChange={(val) => setMode(val as 'add' | 'set')}
                  />
                </div>

                <label style={{ flex: '1 1 160px' }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                    Quantidade ({selectedItem.unit})
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '0 10px', fontSize: '1.1rem' }}
                      onClick={() => setCountedQty(String(Math.max(1, (parseFloat(countedQty) || 1) - 1)))}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      autoFocus
                      step="any"
                      min="0"
                      value={countedQty}
                      onChange={(e) => setCountedQty(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        textAlign: 'center',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '0 10px', fontSize: '1.1rem' }}
                      onClick={() => setCountedQty(String((parseFloat(countedQty) || 0) + 1))}
                    >
                      +
                    </button>
                  </div>
                </label>
              </div>

              <label>
                <span style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  Observação do Lançamento (opcional)
                </span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex: Contagem no mezanino, conferência de gaveta..."
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8 }}
                />
              </label>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn btn--ghost" onClick={() => setSelectedItem(null)}>
                  Voltar à lista
                </button>
                <button type="submit" className="btn btn--primary">
                  Salvar Lançamento
                </button>
              </div>
            </form>
          )}
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
