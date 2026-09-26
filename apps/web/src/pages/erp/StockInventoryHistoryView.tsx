import { useState } from 'react';
import { CrudNameButton, CrudRowActions, confirmDelete } from '../../components/CrudKit';
import {
  applyStockAdjustment,
  deleteStockBalance,
  duplicateStockBalance,
  formatDuration,
  listStockBalances,
  reopenStockBalance,
  updateStockBalanceMetadata,
  type StockBalanceAudit,
  type StockBalanceItem,
} from '../../data/stockInventoryStore';

type Props = {
  onReopenSuccess: (balance: StockBalanceAudit) => void;
};

export function StockInventoryHistoryView({ onReopenSuccess }: Props) {
  const [historyList, setHistoryList] = useState<StockBalanceAudit[]>(() => listStockBalances());
  const [selectedAudit, setSelectedAudit] = useState<StockBalanceAudit | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function refresh() {
    setHistoryList(listStockBalances());
    if (selectedAudit) {
      const updated = listStockBalances().find((b) => b.id === selectedAudit.id) || null;
      setSelectedAudit(updated);
    }
  }

  function handleReopen(id: string) {
    if (!window.confirm('Deseja reabrir este balanço para continuar a contagem?')) return;
    const res = reopenStockBalance(id);
    if (res) {
      onReopenSuccess(res);
    } else {
      alert('Não é possível reabrir este balanço no momento (verifique se já existe outro balanço em andamento).');
    }
  }

  function handleEdit(b: StockBalanceAudit) {
    if (b.status === 'in_progress') {
      onReopenSuccess(b);
      return;
    }
    const choice = window.prompt(
      `Editar Balanço ${b.code}:\n\nDigite o novo título ou deixe em branco para manter "${b.title}":`,
      b.title,
    );
    if (choice !== null && choice.trim() && choice.trim() !== b.title) {
      updateStockBalanceMetadata(b.id, { title: choice.trim() });
      refresh();
      setMsg({ type: 'ok', text: `Título do balanço ${b.code} atualizado!` });
    }
  }

  function handleDuplicate(b: StockBalanceAudit) {
    if (
      !window.confirm(
        `Deseja duplicar o balanço "${b.title}" (${b.code}) para iniciar uma nova contagem física com as mesmas configurações de estoque?`,
      )
    ) {
      return;
    }
    const newAudit = duplicateStockBalance(b.id);
    if (newAudit) {
      onReopenSuccess(newAudit);
    } else {
      setMsg({ type: 'err', text: 'Não foi possível duplicar o balanço.' });
    }
  }

  function handleDelete(b: StockBalanceAudit) {
    if (!confirmDelete(`o balanço ${b.code} ("${b.title}")`)) return;
    deleteStockBalance(b.id);
    refresh();
    if (selectedAudit?.id === b.id) setSelectedAudit(null);
    setMsg({ type: 'ok', text: `Balanço ${b.code} excluído com sucesso.` });
  }

  function handleApplyAdjustment(balance: StockBalanceAudit) {
    if (
      !window.confirm(
        `Deseja aplicar as divergências do balanço ${balance.code} diretamente no estoque do sistema?\n\nIsso atualizará os saldos dos produtos e gerará os movimentos de auditoria.`,
      )
    ) {
      return;
    }

    const res = applyStockAdjustment(balance.id);
    if (res.ok) {
      setMsg({
        type: 'ok',
        text: `✅ Ajuste aplicado com sucesso! ${res.adjustedItemsCount} produtos ajustados (Deltas totalizando ${res.totalUnitsDelta > 0 ? '+' : ''}${res.totalUnitsDelta} unidades).`,
      });
      refresh();
    } else {
      setMsg({ type: 'err', text: res.error || 'Erro ao aplicar ajustes.' });
    }
  }

  function handleExportCsv(balance: StockBalanceAudit) {
    const items = Object.values(balance.items);
    const headers = ['Código', 'SKU', 'Barras', 'Produto', 'Sistema', 'Contado', 'Diferença', 'Status', 'Preço'];
    const rows = items.map((i) => [
      `"${i.stockId}"`,
      `"${i.sku}"`,
      `"${i.barcode}"`,
      `"${i.name.replace(/"/g, '""')}"`,
      i.systemQty,
      i.countedQty === null ? 'Pendente' : i.countedQty,
      i.difference,
      `"${i.status}"`,
      i.price.toFixed(2),
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balanco_${balance.code.replace('#', '')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filteredHistory = historyList.filter(
    (b) =>
      b.code.toLowerCase().includes(filterQuery.toLowerCase()) ||
      b.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
      b.responsibleUser.toLowerCase().includes(filterQuery.toLowerCase()),
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {msg ? (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            fontSize: '0.9rem',
            fontWeight: 600,
            background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2',
            color: msg.type === 'ok' ? '#166534' : '#991b1b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{msg.text}</span>
          <button type="button" className="btn btn--ghost" onClick={() => setMsg(null)}>
            ✕
          </button>
        </div>
      ) : null}

      {!selectedAudit ? (
        <div className="stock-inv-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>📜 Histórico de Balanços Realizados</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                {historyList.length} balanço(s) arquivado(s). Clique em um registro para visualizar a auditoria completa.
              </p>
            </div>

            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Filtrar por código, título ou operador..."
              style={{ width: '280px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.88rem' }}
            />
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Título / Estoque</th>
                  <th>Responsável</th>
                  <th>Início / Término</th>
                  <th>Duração</th>
                  <th>Status</th>
                  <th>Contados / Total</th>
                  <th>Divergências</th>
                  <th>Ajuste Aplicado</th>
                  <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>
                      Nenhum balanço arquivado no histórico.
                    </td>
                  </tr>
                ) : (
                  filteredHistory.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <CrudNameButton onClick={() => setSelectedAudit(b)}>
                          <strong className="stock-inv-badge-code">{b.code}</strong>
                        </CrudNameButton>
                      </td>
                      <td>
                        <CrudNameButton onClick={() => setSelectedAudit(b)}>
                          <strong>{b.title}</strong>
                        </CrudNameButton>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{b.warehouseName}</div>
                      </td>
                      <td>{b.responsibleUser}</td>
                      <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                        {new Date(b.startedAt).toLocaleDateString('pt-BR')} {new Date(b.startedAt).toLocaleTimeString('pt-BR')}
                        {b.completedAt && (
                          <div style={{ color: '#64748b' }}>
                            Até {new Date(b.completedAt).toLocaleTimeString('pt-BR')}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatDuration(b.durationSeconds)}</td>
                      <td>
                        <span className={`stock-inv-status stock-inv-status--${b.status}`}>
                          {b.status === 'completed' ? 'Finalizado' : b.status === 'cancelled' ? 'Cancelado' : 'Em andamento'}
                        </span>
                      </td>
                      <td>
                        <strong>{b.countedItems}</strong> / {b.totalItems} SKUs
                      </td>
                      <td>
                        {b.divergentItems > 0 ? (
                          <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                            {b.divergentItems} itens ({b.divergentPositiveUnits > 0 ? `+${b.divergentPositiveUnits}` : ''}{' '}
                            {b.divergentNegativeUnits > 0 ? `-${b.divergentNegativeUnits}` : ''})
                          </span>
                        ) : (
                          <span style={{ color: '#166534', fontWeight: 600 }}>OK (0)</span>
                        )}
                      </td>
                      <td>
                        {b.adjustmentAppliedAt ? (
                          <span style={{ color: '#166534', fontSize: '0.82rem', fontWeight: 600 }}>
                            ✅ Aplicado em {new Date(b.adjustmentAppliedAt).toLocaleDateString('pt-BR')}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.82rem' }}>Não aplicado</span>
                        )}
                      </td>
                      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                        <CrudRowActions
                          onView={() => setSelectedAudit(b)}
                          onEdit={() => handleEdit(b)}
                          onDuplicate={() => handleDuplicate(b)}
                          onDelete={() => handleDelete(b)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Visualização Detalhada do Balanço Selecionado */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="stock-inv-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" className="btn btn--ghost" onClick={() => setSelectedAudit(null)}>
                  ← Voltar ao Histórico
                </button>
                <span className="stock-inv-badge-code">{selectedAudit.code}</span>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>{selectedAudit.title}</h3>
                <span className={`stock-inv-status stock-inv-status--${selectedAudit.status}`}>
                  {selectedAudit.status === 'completed' ? 'Finalizado' : 'Cancelado'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => handleExportCsv(selectedAudit)}
                >
                  📥 Exportar CSV
                </button>

                {selectedAudit.status === 'completed' && !selectedAudit.adjustmentAppliedAt && selectedAudit.divergentItems > 0 ? (
                  <button
                    type="button"
                    className="btn btn--primary"
                    style={{ background: '#0e7490' }}
                    onClick={() => handleApplyAdjustment(selectedAudit)}
                  >
                    ⚖️ Aplicar Ajuste no Estoque
                  </button>
                ) : null}

                {selectedAudit.status === 'completed' ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => handleReopen(selectedAudit.id)}
                  >
                    🔄 Reabrir Balanço
                  </button>
                ) : null}

                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => handleDuplicate(selectedAudit)}
                  title="Duplicar balanço para nova contagem"
                >
                  📄 Duplicar
                </button>

                <button
                  type="button"
                  className="btn btn--ghost crud-actions__danger"
                  onClick={() => handleDelete(selectedAudit)}
                  title="Excluir este balanço do histórico"
                >
                  🗑️ Excluir
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20, marginTop: 14, fontSize: '0.86rem', color: '#475569', flexWrap: 'wrap' }}>
              <div>
                Responsável: <strong>{selectedAudit.responsibleUser}</strong>
              </div>
              <div>
                Estoque: <strong>{selectedAudit.warehouseName}</strong>
              </div>
              <div>
                Início: <strong>{new Date(selectedAudit.startedAt).toLocaleString('pt-BR')}</strong>
              </div>
              {selectedAudit.completedAt && (
                <div>
                  Conclusão: <strong>{new Date(selectedAudit.completedAt).toLocaleString('pt-BR')}</strong>
                </div>
              )}
              <div>
                Duração total: <strong>{formatDuration(selectedAudit.durationSeconds)}</strong>
              </div>
            </div>

            {selectedAudit.notes ? (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: '0.84rem', color: '#334155' }}>
                📝 <strong>Observações:</strong> {selectedAudit.notes}
              </div>
            ) : null}

            {/* KPIs do Balanço */}
            <div className="stock-inv-metrics" style={{ marginTop: 14 }}>
              <div className="stock-inv-metric-card">
                <span className="stock-inv-metric-card__title">SKUs Contados</span>
                <strong className="stock-inv-metric-card__val">
                  {selectedAudit.countedItems} / {selectedAudit.totalItems}
                </strong>
                <span className="stock-inv-metric-card__hint">
                  {selectedAudit.pendingItems > 0 ? `${selectedAudit.pendingItems} não contados` : '100% contados'}
                </span>
              </div>

              <div className="stock-inv-metric-card">
                <span className="stock-inv-metric-card__title">Total Físico Contado</span>
                <strong className="stock-inv-metric-card__val">
                  {selectedAudit.countedTotalUnits} UN
                </strong>
                <span className="stock-inv-metric-card__hint">
                  Sistema: {selectedAudit.systemTotalUnits} UN
                </span>
              </div>

              <div className="stock-inv-metric-card">
                <span className="stock-inv-metric-card__title">Itens Divergentes</span>
                <strong
                  className="stock-inv-metric-card__val"
                  style={{ color: selectedAudit.divergentItems > 0 ? '#dc2626' : '#166534' }}
                >
                  {selectedAudit.divergentItems}
                </strong>
                <span className="stock-inv-metric-card__hint">
                  +{selectedAudit.divergentPositiveUnits} sobras · -{selectedAudit.divergentNegativeUnits} faltas
                </span>
              </div>
            </div>
          </div>

          {/* Tabela de Itens Auditados */}
          <div className="stock-inv-card">
            <h4 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#0f172a' }}>
              Produtos Auditados nesta Contagem:
            </h4>

            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>SKU / Barras</th>
                    <th style={{ textAlign: 'center' }}>Sistema</th>
                    <th style={{ textAlign: 'center' }}>Físico Contado</th>
                    <th style={{ textAlign: 'center' }}>Diferença</th>
                    <th>Status</th>
                    <th>Lançamentos</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(selectedAudit.items).map((item: StockBalanceItem) => (
                    <tr key={item.stockId}>
                      <td>
                        <strong>{item.name}</strong>
                        {(item.color || item.capacity) && (
                          <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                            {[item.color, item.capacity].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#475569' }}>
                        {item.sku}
                        {item.barcode ? ` · ${item.barcode}` : ''}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>
                        {item.systemQty} {item.unit}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        {item.countedQty === null ? (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        ) : (
                          `${item.countedQty} ${item.unit}`
                        )}
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
                          <span style={{ color: '#64748b', fontSize: '0.82rem' }}>Pendente</span>
                        ) : item.difference === 0 ? (
                          <span style={{ color: '#166534', fontWeight: 600, fontSize: '0.82rem' }}>OK</span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.82rem' }}>
                            Divergência ({item.difference > 0 ? `+${item.difference}` : item.difference})
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {item.entries.length} registro(s)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
