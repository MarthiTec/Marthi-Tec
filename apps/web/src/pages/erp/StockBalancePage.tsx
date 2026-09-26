import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { matchesQuery } from '../../components/CrudKit';
import {
  applyPriceTable,
  getAdminState,
  STOCK_KIND_LABEL,
  type StockKind,
} from '../../data/adminStore';
import { listWarehouses } from '../../data/fiscalCatalog';
import { money } from '../../data/financeBook';
import { getOperatorProfile } from '../../data/operatorProfile';
import {
  createStockBalance,
  getActiveStockBalance,
  STOCK_INVENTORY_EVENT,
  type StockBalanceAudit,
} from '../../data/stockInventoryStore';
import {
  STOCK_BALANCE_LABEL,
  stockBalanceSnapshot,
  stockBalanceStatus,
  stockInventoryValue,
  stockMargin,
  stockMarkup,
  stockRetailValue,
  type StockBalanceStatus,
} from '../../data/stockLedger';
import './stockInventory.css';
import { StockInventoryActiveView } from './StockInventoryActiveView';
import { StockInventoryHistoryView } from './StockInventoryHistoryView';

type TopTab = 'audit' | 'report' | 'history';
type StatusFilter = 'all' | StockBalanceStatus;

function formatDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function StockBalancePage() {
  const [activeTab, setActiveTab] = useState<TopTab>('audit');
  const [activeBalance, setActiveBalance] = useState<StockBalanceAudit | null>(() => getActiveStockBalance());
  const [tick, setTick] = useState(0);

  // New balance creation form state
  const warehouses = useMemo(() => listWarehouses(true), []);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id || '');
  const [balanceTitle, setBalanceTitle] = useState('');
  const [duplicateRule, setDuplicateRule] = useState<'sum' | 'overwrite'>('sum');

  // Report tab filters
  const state = useMemo(() => getAdminState(), [tick]);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | StockKind>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const snapshot = useMemo(() => stockBalanceSnapshot(state.stock), [state.stock]);
  const tables = state.priceTables.filter((item) => item.active);

  // Listen to inventory balance updates
  useEffect(() => {
    function onBalanceChanged() {
      setActiveBalance(getActiveStockBalance());
    }
    window.addEventListener(STOCK_INVENTORY_EVENT, onBalanceChanged);
    window.addEventListener('storage', onBalanceChanged);
    return () => {
      window.removeEventListener(STOCK_INVENTORY_EVENT, onBalanceChanged);
      window.removeEventListener('storage', onBalanceChanged);
    };
  }, []);

  function handleStartNewBalance() {
    const operator = getOperatorProfile('Operador').displayName || 'Operador';
    const selectedWh = warehouses.find((w) => w.id === warehouseId);
    const whName = selectedWh?.name || 'Loja / Estoque Principal';

    const newBalance = createStockBalance({
      responsibleUser: operator,
      warehouseId,
      warehouseName: whName,
      title: balanceTitle.trim() || undefined,
      duplicateRule,
    });

    setActiveBalance(newBalance);
    setBalanceTitle('');
  }

  const rows = useMemo(() => {
    return state.stock
      .filter((item) => {
        if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
        const status = stockBalanceStatus(item);
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        return matchesQuery(`${item.name} ${item.sku} ${item.barcode}`, query);
      })
      .map((item) => {
        const status = stockBalanceStatus(item);
        const avg = item.avgCost || item.cost || 0;
        return {
          item,
          status,
          avg,
          markup: stockMarkup(item),
          margin: stockMargin(item),
          inventory: stockInventoryValue(item),
          retail: stockRetailValue(item),
        };
      });
  }, [state.stock, kindFilter, statusFilter, query]);

  return (
    <section className="admin-page stock-inv">
      {/* Abas Principais de Navegação */}
      <div className="stock-inv__tabs">
        <button
          type="button"
          className={`stock-inv__tab-btn ${activeTab === 'audit' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          📦 Contagem Física {activeBalance ? `(${activeBalance.code})` : ''}
        </button>
        <button
          type="button"
          className={`stock-inv__tab-btn ${activeTab === 'report' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('report')}
        >
          📊 Relatório de Saldo & Valorização
        </button>
        <button
          type="button"
          className={`stock-inv__tab-btn ${activeTab === 'history' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          📜 Histórico de Balanços
        </button>
      </div>

      {/* ABA 1: CONTAGEM FÍSICA (BALANÇO ATIVO OU CRIAR NOVO) */}
      {activeTab === 'audit' ? (
        activeBalance ? (
          <StockInventoryActiveView
            balance={activeBalance}
            onBalanceUpdated={() => {
              setActiveBalance(getActiveStockBalance());
              setTick((t) => t + 1);
            }}
            onBalanceFinalized={() => {
              setActiveBalance(null);
              setActiveTab('history');
            }}
          />
        ) : (
          /* Formulário de Abertura de Novo Balanço */
          <div className="stock-inv-card stock-inv-card--setup">
            <div className="stock-inv-setup__head">
              <span className="stock-inv-setup__icon">📦</span>
              <h2 className="stock-inv-setup__title">Novo Balanço de Estoque</h2>
              <p className="stock-inv-setup__desc">
                Inicie uma contagem física comparando o estoque do sistema com a quantidade real nas prateleiras.
              </p>
            </div>

            <div className="stock-inv-setup__body">
              <label className="admin-field stock-inv-field">
                <span className="stock-inv-field__label">Título / Identificação do Balanço (opcional)</span>
                <input
                  type="text"
                  value={balanceTitle}
                  onChange={(e) => setBalanceTitle(e.target.value)}
                  placeholder="Ex: Contagem Geral Loja, Inventário Semestral, Balanço de Acessórios..."
                />
              </label>

              <div className="stock-inv-setup__row">
                <div className="stock-inv-setup__col">
                  <AdminPicker
                    label="Local / Estoque a ser contado"
                    value={warehouseId}
                    options={[
                      { value: '', label: 'Loja / Estoque Principal' },
                      ...warehouses.map((w) => ({
                        value: w.id,
                        label: `${w.name}${w.code ? ` (${w.code})` : ''}`,
                      })),
                    ]}
                    onChange={(val) => setWarehouseId(val)}
                  />
                </div>

                <div className="stock-inv-setup__col">
                  <AdminPicker
                    label="Regra para produtos repetidos"
                    value={duplicateRule}
                    options={[
                      { value: 'sum', label: 'Somar quantidades (Ex: 5 + 3 = 8) [Padrão]' },
                      { value: 'overwrite', label: 'Sobrescrever com último valor' },
                    ]}
                    onChange={(val) => setDuplicateRule(val as 'sum' | 'overwrite')}
                  />
                </div>
              </div>

              <div className="stock-inv-security-notice">
                <div className="stock-inv-security-notice__title">
                  🛡️ <strong>Segurança e Persistência Garantida:</strong>
                </div>
                <ul>
                  <li>Você poderá fechar a tela, atualizar o navegador ou perder a conexão sem perder nenhum lançamento.</li>
                  <li>Lançamentos suportam leitura de código de barras USB/HID, pesquisa manual, importação TXT e Excel.</li>
                  <li>O ajuste final de estoque é opcional e nunca altera o saldo do sistema sem sua confirmação explícita.</li>
                </ul>
              </div>

              <div className="stock-inv-setup__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setActiveTab('history')}
                >
                  📜 Consultar Balanços Anteriores
                </button>

                <button
                  type="button"
                  className="btn btn--primary stock-inv-setup__btn-start"
                  onClick={handleStartNewBalance}
                >
                  🚀 Iniciar Novo Balanço de Estoque
                </button>
              </div>
            </div>
          </div>
        )
      ) : null}

      {/* ABA 2: RELATÓRIO DE SALDO & VALORIZAÇÃO (LAYOUT CORRIGIDO E ALINHADO) */}
      {activeTab === 'report' ? (
        <>
          <p className="empty" style={{ marginTop: 0 }}>
            Posição e valorização do estoque: saldo, mínimos/máximos, custo médio, markup, margem e última compra.
            Movimentações em <Link to="/erp/movimentos">Movimentos</Link> · cadastro em{' '}
            <Link to="/erp/produtos">Produtos</Link> · tipos de preço em{' '}
            <Link to="/erp/tabelas">Tabelas</Link>.
          </p>

          <div className="admin-grid">
            <article className="admin-card">
              <h2>SKUs / unidades</h2>
              <strong>
                {snapshot.skus} · {snapshot.units}
              </strong>
              <p>Cadastro e peças físicas.</p>
            </article>
            <article className="admin-card">
              <h2>Valor a custo</h2>
              <strong>{money(snapshot.inventory)}</strong>
              <p>Saldo × custo médio.</p>
            </article>
            <article className="admin-card">
              <h2>Valor de venda</h2>
              <strong>{money(snapshot.retail)}</strong>
              <p>Saldo × preço base.</p>
            </article>
            <article className="admin-card">
              <h2>Alertas</h2>
              <strong className={snapshot.low || snapshot.empty ? 'qty-low' : ''}>
                {snapshot.low} baixos · {snapshot.over} altos · {snapshot.empty} zerados
              </strong>
              <p>Margem potencial {money(snapshot.potentialMargin)}.</p>
            </article>
          </div>

          <article className="admin-card" style={{ marginTop: 12 }}>
            {/* Toolbar harmonioso e alinhado (sem blocos de 100% quebrando a tela) */}
            <div
              className="admin-toolbar"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                gap: '10px 14px',
              }}
            >
              <label style={{ flex: '1 1 200px', minWidth: '180px' }}>
                Buscar
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Produto, SKU ou barras…"
                />
              </label>

              <div style={{ flex: '0 1 150px', minWidth: '130px' }}>
                <AdminPicker
                  compact
                  label="Tipo"
                  value={kindFilter}
                  options={[
                    { value: 'all', label: 'Todos' },
                    { value: 'device', label: STOCK_KIND_LABEL.device },
                    { value: 'part', label: STOCK_KIND_LABEL.part },
                    { value: 'supply', label: STOCK_KIND_LABEL.supply },
                  ]}
                  onChange={(value) => setKindFilter(value as 'all' | StockKind)}
                />
              </div>

              <div style={{ flex: '0 1 170px', minWidth: '150px' }}>
                <AdminPicker
                  compact
                  label="Status"
                  value={statusFilter}
                  options={[
                    { value: 'all', label: 'Todos' },
                    { value: 'low', label: 'Abaixo do mínimo' },
                    { value: 'over', label: 'Acima do máximo' },
                    { value: 'empty', label: 'Zerados' },
                    { value: 'ok', label: 'OK' },
                  ]}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setTick((n) => n + 1)}
                >
                  Atualizar
                </button>
                <Link to="/erp/movimentos" className="btn btn--primary">
                  Novo movimento
                </Link>
              </div>
            </div>

            {tables.length ? (
              <p className="empty" style={{ marginTop: 8 }}>
                Tipos de preço ativos:{' '}
                {tables
                  .map((table) => `${table.name} (${table.percent > 0 ? '+' : ''}${table.percent}%)`)
                  .join(' · ')}
              </p>
            ) : null}

            {/* Container responsivo da tabela */}
            <div className="admin-table-container">
              <table className="admin-table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th className="col-product">Produto</th>
                    <th>Saldo</th>
                    <th>Mín / Máx</th>
                    <th>Custo méd.</th>
                    <th>Últ. compra</th>
                    <th>Preço base</th>
                    <th>Markup</th>
                    <th>Margem</th>
                    <th>Valor estoque</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="empty">
                        Nenhum item neste filtro.
                      </td>
                    </tr>
                  ) : (
                    rows.map(({ item, status, avg, markup, margin, inventory }) => (
                      <tr key={item.id}>
                        <td className="col-product">
                          <strong>{item.name}</strong>
                          <div className="empty">
                            {item.sku}
                            {tables.length
                              ? ` · ${tables
                                  .slice(0, 2)
                                  .map(
                                    (table) =>
                                      `${table.name} ${money(applyPriceTable(item.price, table))}`,
                                  )
                                  .join(' · ')}`
                              : ''}
                          </div>
                        </td>
                        <td className={status === 'low' || status === 'empty' ? 'qty-low' : ''}>
                          {item.qty}
                        </td>
                        <td>
                          {item.minQty} / {item.maxQty || '—'}
                        </td>
                        <td>{money(avg)}</td>
                        <td>
                          {item.lastPurchaseCost
                            ? money(item.lastPurchaseCost)
                            : money(item.cost)}
                          <div className="empty">{formatDate(item.lastPurchaseAt)}</div>
                        </td>
                        <td className="price-red">{money(item.price)}</td>
                        <td>{markup.toLocaleString('pt-BR')}%</td>
                        <td>{margin.toLocaleString('pt-BR')}%</td>
                        <td>{money(inventory)}</td>
                        <td className={status === 'low' || status === 'empty' ? 'qty-low' : ''}>
                          {STOCK_BALANCE_LABEL[status]}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      ) : null}

      {/* ABA 3: HISTÓRICO DE BALANÇOS */}
      {activeTab === 'history' ? (
        <StockInventoryHistoryView
          onReopenSuccess={(reopened) => {
            setActiveBalance(reopened);
            setActiveTab('audit');
          }}
        />
      ) : null}
    </section>
  );
}
