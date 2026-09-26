import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CrudNameButton, CrudRowActions } from '../../components/CrudKit';
import {
  cancelStockBalance,
  formatDuration,
  playInventoryBeep,
  recordCount,
  setDirectCount,
  type StockBalanceAudit,
  type StockBalanceItem,
} from '../../data/stockInventoryStore';
import { StockExcelImportModal } from './StockExcelImportModal';
import { StockFinalizeModal } from './StockFinalizeModal';
import { StockItemHistoryModal } from './StockItemHistoryModal';
import { StockManualSearchModal } from './StockManualSearchModal';
import { StockTxtImportModal } from './StockTxtImportModal';

type FilterTab = 'all' | 'counted' | 'pending' | 'divergent' | 'ok';

type Props = {
  balance: StockBalanceAudit;
  onBalanceUpdated: () => void;
  onBalanceFinalized: (finalized: StockBalanceAudit) => void;
};

export function StockInventoryActiveView({ balance, onBalanceUpdated, onBalanceFinalized }: Props) {
  const [scanCode, setScanCode] = useState('');
  const [stepQty, setStepQty] = useState<number>(1);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [tableQuery, setTableQuery] = useState('');
  const [flashMsg, setFlashMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(balance.durationSeconds);

  // Modals state
  const [txtModalOpen, setTxtModalOpen] = useState(false);
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<StockBalanceItem | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Live timer tick
  useEffect(() => {
    const startMs = new Date(balance.startedAt).getTime();
    const interval = setInterval(() => {
      const now = Date.now();
      if (!Number.isNaN(startMs) && now > startMs) {
        setElapsedSeconds(Math.floor((now - startMs) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [balance.startedAt]);

  // Keep focus on barcode scanner input for HID collector/gun
  useEffect(() => {
    if (!txtModalOpen && !excelModalOpen && !manualSearchOpen && !finalizeOpen && !historyItem) {
      scanInputRef.current?.focus();
    }
  }, [txtModalOpen, excelModalOpen, manualSearchOpen, finalizeOpen, historyItem]);

  function handleScanSubmit(e: FormEvent) {
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;

    const res = recordCount(balance.id, {
      codeOrId: code,
      qty: stepQty,
      source: 'barcode',
      mode: 'add',
      note: 'Leitor / Coletor',
    });

    if (res.ok && res.item) {
      if (soundEnabled) playInventoryBeep('ok');
      setFlashMsg({
        type: 'ok',
        text: `✅ Bipado: ${res.item.name} (+${stepQty} ${res.item.unit}) · Total contado: ${res.item.countedQty} ${res.item.unit}`,
      });
      setScanCode('');
      onBalanceUpdated();
    } else {
      if (soundEnabled) playInventoryBeep('error');
      setFlashMsg({
        type: 'err',
        text: `❌ ${res.error || `Código "${code}" não encontrado no catálogo.`}`,
      });
    }

    // Auto-clear flash after 4 seconds
    setTimeout(() => {
      setFlashMsg((curr) => (curr?.text.includes(code) ? null : curr));
    }, 4000);

    scanInputRef.current?.focus();
  }

  function handleQuickIncrement(item: StockBalanceItem, delta: number) {
    const current = item.countedQty === null ? 0 : item.countedQty;
    const next = Math.max(0, current + delta);
    setDirectCount(balance.id, item.stockId, next, `Ajuste rápido (+${delta})`);
    if (soundEnabled) playInventoryBeep('ok');
    onBalanceUpdated();
  }

  function handleEditItemCount(item: StockBalanceItem) {
    const current = item.countedQty === null ? '' : String(item.countedQty);
    const next = window.prompt(
      `Editar contagem de "${item.name}":\n\nEstoque do sistema: ${item.systemQty} ${item.unit}\nInforme a quantidade física exata contada:`,
      current,
    );
    if (next !== null && next.trim() !== '') {
      const val = parseFloat(next.replace(',', '.'));
      if (!Number.isFinite(val) || val < 0) {
        alert('Informe uma quantidade válida.');
        return;
      }
      setDirectCount(balance.id, item.stockId, val, 'Ajuste manual pela tabela');
      if (soundEnabled) playInventoryBeep('ok');
      onBalanceUpdated();
    }
  }

  function handleResetItemCount(item: StockBalanceItem) {
    if (item.countedQty === null) return;
    if (!window.confirm(`Deseja zerar a contagem de "${item.name}" e marcar como pendente?`)) return;
    setDirectCount(balance.id, item.stockId, null, 'Contagem reiniciada');
    if (soundEnabled) playInventoryBeep('warning');
    onBalanceUpdated();
  }

  function handleCancelBalance() {
    const reason = window.prompt(
      'Tem certeza de que deseja cancelar este balanço em andamento?\nDigite o motivo do cancelamento:',
    );
    if (reason === null) return;
    cancelStockBalance(balance.id, reason);
    onBalanceUpdated();
  }

  const itemsList = useMemo(() => Object.values(balance.items), [balance.items]);

  const filteredItems = useMemo(() => {
    const q = tableQuery.trim().toLowerCase();
    return itemsList.filter((item) => {
      // Tab filter
      if (filterTab === 'counted' && item.countedQty === null) return false;
      if (filterTab === 'pending' && item.countedQty !== null) return false;
      if (filterTab === 'divergent' && (item.countedQty === null || item.difference === 0)) return false;
      if (filterTab === 'ok' && (item.countedQty === null || item.difference !== 0)) return false;

      // Text query
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q) ||
        item.imei.toLowerCase().includes(q) ||
        item.stockId.toLowerCase().includes(q)
      );
    });
  }, [itemsList, filterTab, tableQuery]);

  const progressPct =
    balance.totalItems > 0 ? Math.round((balance.countedItems / balance.totalItems) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Header do Balanço Ativo */}
      <div className="stock-inv-card">
        <div className="stock-inv-head">
          <div className="stock-inv-head__left">
            <span className="stock-inv-badge-code">{balance.code}</span>
            <h3 className="stock-inv-title" style={{ margin: 0, fontSize: '1.25rem', color: 'var(--ink)' }}>{balance.title}</h3>
            <span className="stock-inv-status stock-inv-status--progress">Em andamento</span>
            <span className={`stock-inv-sync stock-inv-sync--${balance.syncState}`}>
              {balance.syncState === 'synced' ? '🟢 Sincronizado' : '🟡 Salvo localmente (Offline)'}
            </span>
          </div>

          <div className="stock-inv-head__meta">
            <div>
              Responsável: <strong>{balance.responsibleUser}</strong>
            </div>
            <div>
              Estoque: <strong>{balance.warehouseName}</strong>
            </div>
            <div>
              Início: <strong>{new Date(balance.startedAt).toLocaleTimeString('pt-BR')}</strong>
            </div>
            <div>
              Tempo decorrido:{' '}
              <strong style={{ color: '#0f766e', fontSize: '1rem' }}>
                {formatDuration(elapsedSeconds)}
              </strong>
            </div>
          </div>
        </div>

        {/* 2. Grid de Métricas / Indicadores de Conferência */}
        <div className="stock-inv-metrics">
          <div className="stock-inv-metric-card">
            <span className="stock-inv-metric-card__title">Total de Produtos (SKUs)</span>
            <strong className="stock-inv-metric-card__val">{balance.totalItems}</strong>
            <span className="stock-inv-metric-card__hint">Cadastrados no catálogo</span>
          </div>

          <div className="stock-inv-metric-card">
            <span className="stock-inv-metric-card__title">Progresso da Contagem</span>
            <strong className="stock-inv-metric-card__val">
              {balance.countedItems} / {balance.totalItems} ({progressPct}%)
            </strong>
            <div className="stock-inv-progress">
              <div className="stock-inv-progress__bar" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="stock-inv-metric-card__hint">
              {balance.pendingItems} produtos ainda pendentes
            </span>
          </div>

          <div className="stock-inv-metric-card">
            <span className="stock-inv-metric-card__title">Peças Físicas Contadas</span>
            <strong className="stock-inv-metric-card__val">{balance.countedTotalUnits} UN</strong>
            <span className="stock-inv-metric-card__hint">
              Esperado no sistema: {balance.systemTotalUnits} UN
            </span>
          </div>

          <div className="stock-inv-metric-card">
            <span className="stock-inv-metric-card__title">Divergências Detectadas</span>
            <strong
              className="stock-inv-metric-card__val"
              style={{ color: balance.divergentItems > 0 ? '#dc2626' : '#166534' }}
            >
              {balance.divergentItems}
            </strong>
            <span className="stock-inv-metric-card__hint">
              +{balance.divergentPositiveUnits} sobras · -{balance.divergentNegativeUnits} faltas
            </span>
          </div>
        </div>

        {/* 3. Barra do Coletor / Scanner Rápido */}
        <div style={{ marginTop: 14 }}>
          <form onSubmit={handleScanSubmit} className="stock-inv-scanner">
            <div className="stock-inv-scanner__input-wrap">
              <span style={{ fontSize: '1.2rem' }}>📷</span>
              <input
                ref={scanInputRef}
                type="text"
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                placeholder="Bipe o código de barras, SKU ou código interno (Pressione Enter)..."
                autoComplete="off"
              />
              {scanCode && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: '0 6px', fontSize: '0.9rem' }}
                  onClick={() => setScanCode('')}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="stock-inv-scanner__stepper">
              <span className="stock-inv-scanner__stepper-label">Multiplicador:</span>
              {[1, 5, 10, 20].map((step) => (
                <button
                  key={step}
                  type="button"
                  className={`stock-inv-scanner__step-btn ${stepQty === step ? 'is-active' : ''}`}
                  onClick={() => setStepQty(step)}
                >
                  +{step}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="btn btn--ghost"
              style={{ fontSize: '0.84rem' }}
              onClick={() => setSoundEnabled((v) => !v)}
              title={soundEnabled ? 'Som ativado' : 'Som desativado'}
            >
              {soundEnabled ? '🔊 Som Ativado' : '🔇 Mudo'}
            </button>

            <button type="submit" className="btn btn--primary">
              Contar (+{stepQty})
            </button>
          </form>

          {/* Flash Feedback */}
          {flashMsg ? (
            <div
              className={`stock-inv-flash ${
                flashMsg.type === 'ok' ? 'stock-inv-flash--ok' : 'stock-inv-flash--err'
              }`}
              style={{ marginTop: 8 }}
            >
              <span>{flashMsg.text}</span>
              <button
                type="button"
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit' }}
                onClick={() => setFlashMsg(null)}
              >
                ✕
              </button>
            </div>
          ) : null}
        </div>

        {/* 4. Barra de Ações Operacionais */}
        <div className="stock-inv-actions">
          <div className="stock-inv-actions__left">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setManualSearchOpen(true)}
            >
              🔍 Buscar Produto
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setTxtModalOpen(true)}
            >
              📄 Importar TXT
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setExcelModalOpen(true)}
            >
              📊 Importar Excel
            </button>
          </div>

          <div className="stock-inv-actions__right">
            <button
              type="button"
              className="btn btn--ghost"
              style={{ color: '#dc2626' }}
              onClick={handleCancelBalance}
            >
              ✕ Cancelar Balanço
            </button>
            <button
              type="button"
              className="btn btn--primary"
              style={{ background: '#0f766e' }}
              onClick={() => setFinalizeOpen(true)}
            >
              🏁 Finalizar Balanço ({balance.countedItems}/{balance.totalItems})
            </button>
          </div>
        </div>
      </div>

      {/* 5. Tabela de Conferência dos Itens */}
      <div className="stock-inv-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          {/* Abas / Filtros */}
          <div className="stock-inv-filters" style={{ margin: 0 }}>
            <button
              type="button"
              className={`stock-inv-filter-btn ${filterTab === 'all' ? 'is-active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              Todos ({balance.totalItems})
            </button>
            <button
              type="button"
              className={`stock-inv-filter-btn ${filterTab === 'counted' ? 'is-active' : ''}`}
              onClick={() => setFilterTab('counted')}
            >
              Contados ({balance.countedItems})
            </button>
            <button
              type="button"
              className={`stock-inv-filter-btn ${filterTab === 'pending' ? 'is-active' : ''}`}
              onClick={() => setFilterTab('pending')}
            >
              Pendentes ({balance.pendingItems})
            </button>
            <button
              type="button"
              className={`stock-inv-filter-btn ${filterTab === 'divergent' ? 'is-active' : ''}`}
              onClick={() => setFilterTab('divergent')}
            >
              Com Divergência ({balance.divergentItems})
            </button>
            <button
              type="button"
              className={`stock-inv-filter-btn ${filterTab === 'ok' ? 'is-active' : ''}`}
              onClick={() => setFilterTab('ok')}
            >
              Sem Divergência ({balance.okItems})
            </button>
          </div>

          <input
            type="text"
            value={tableQuery}
            onChange={(e) => setTableQuery(e.target.value)}
            placeholder="Filtrar produtos desta lista..."
            style={{ width: '240px', padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem' }}
          />
        </div>

        {/* Tabela com container responsivo */}
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="col-product">Produto</th>
                <th className="col-sku">SKU / Barras / IMEI</th>
                <th style={{ textAlign: 'center', width: '90px' }}>Sistema</th>
                <th style={{ textAlign: 'center', width: '160px' }}>Contado Físico</th>
                <th style={{ textAlign: 'center', width: '100px' }}>Diferença</th>
                <th style={{ width: '110px' }}>Status</th>
                <th style={{ width: '140px' }}>Último Lançamento</th>
                <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                    Nenhum produto encontrado neste filtro.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.stockId}>
                    <td className="col-product">
                      <CrudNameButton onClick={() => setHistoryItem(item)}>
                        <strong>{item.name}</strong>
                      </CrudNameButton>
                      {(item.color || item.capacity) && (
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {[item.color, item.capacity].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="col-sku">
                      <div>{item.sku || '—'}</div>
                      {item.barcode ? (
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>Barras: {item.barcode}</div>
                      ) : null}
                      {item.imei ? (
                        <div style={{ fontSize: '0.76rem', color: '#64748b' }}>IMEI: {item.imei}</div>
                      ) : null}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {item.systemQty} {item.unit}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          style={{ padding: '0 6px', height: '28px', minWidth: '28px', minHeight: '28px' }}
                          onClick={() => handleQuickIncrement(item, -1)}
                          title="Diminuir 1"
                        >
                          -
                        </button>
                        <span
                          style={{
                            minWidth: '50px',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: item.countedQty === null ? 'var(--mute)' : 'var(--ink)',
                          }}
                        >
                          {item.countedQty === null ? '—' : `${item.countedQty} ${item.unit}`}
                        </span>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          style={{ padding: '0 6px', height: '28px', minWidth: '28px', minHeight: '28px' }}
                          onClick={() => handleQuickIncrement(item, 1)}
                          title="Aumentar 1"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {item.countedQty === null ? (
                        <span className="stock-badge-diff stock-badge-diff--pending">—</span>
                      ) : item.difference === 0 ? (
                        <span className="stock-badge-diff stock-badge-diff--ok">0</span>
                      ) : item.difference > 0 ? (
                        <span className="stock-badge-diff stock-badge-diff--over">+{item.difference}</span>
                      ) : (
                        <span className="stock-badge-diff stock-badge-diff--loss">{item.difference}</span>
                      )}
                    </td>
                    <td>
                      {item.countedQty === null ? (
                        <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>Pendente</span>
                      ) : item.difference === 0 ? (
                        <span style={{ color: '#166534', fontWeight: 600, fontSize: '0.82rem' }}>OK</span>
                      ) : (
                        <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.82rem' }}>
                          Divergência
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {item.lastCountedAt ? (
                        <>
                          <div>{new Date(item.lastCountedAt).toLocaleTimeString('pt-BR')}</div>
                          <div style={{ fontSize: '0.74rem' }}>{item.entries.length} bip(s)</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                      <CrudRowActions
                        onView={() => setHistoryItem(item)}
                        onEdit={() => handleEditItemCount(item)}
                        onDuplicate={() => handleQuickIncrement(item, 1)}
                        onDelete={() => handleResetItemCount(item)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modais Operacionais */}
      <StockTxtImportModal
        balance={balance}
        isOpen={txtModalOpen}
        onClose={() => setTxtModalOpen(false)}
        onImportComplete={onBalanceUpdated}
      />

      <StockExcelImportModal
        balance={balance}
        isOpen={excelModalOpen}
        onClose={() => setExcelModalOpen(false)}
        onImportComplete={onBalanceUpdated}
      />

      <StockManualSearchModal
        balance={balance}
        isOpen={manualSearchOpen}
        onClose={() => setManualSearchOpen(false)}
        onCountSaved={onBalanceUpdated}
      />

      <StockFinalizeModal
        balance={balance}
        isOpen={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        onFinalized={onBalanceFinalized}
      />

      {historyItem ? (
        <StockItemHistoryModal
          balance={balance}
          item={historyItem}
          isOpen={Boolean(historyItem)}
          onClose={() => setHistoryItem(null)}
          onUpdated={onBalanceUpdated}
        />
      ) : null}
    </div>
  );
}
