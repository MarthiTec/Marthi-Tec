import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudRowActions } from '../../components/CrudKit';
import {
  changeQuoteStatus,
  deletePosQuote,
  duplicatePosQuote,
  getQuotesDashboardKpis,
  getQuoteSettings,
  isQuoteExpired,
  listPosQuotes,
  POS_QUOTES_EVENT,
  QUOTE_STATUS_COLOR,
  QUOTE_STATUS_LABEL,
  saveQuoteSettings,
  type PosQuote,
  type PosQuoteSettings,
  type PosQuoteStatus,
} from '../../data/posQuotesStore';
import { listSellers } from '../../data/erpRegistry';
import { QuoteCommercialPrintModal } from '../../components/QuoteCommercialPrintModal';
import { useAuth } from '../../contexts/AuthContext';
import './quotesManagement.css';

function money(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

type StatusTab = 'all' | 'open' | 'pending_approval' | 'approved' | 'expired' | 'converted' | 'cancelled';

export function QuotesManagementPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const operatorName = user?.name || 'Operador';

  const [quotes, setQuotes] = useState<PosQuote[]>(() => listPosQuotes());
  const [kpis, setKpis] = useState(() => getQuotesDashboardKpis());
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [sellerFilter, setSellerFilter] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'expiry' | 'amount_desc' | 'amount_asc'>('recent');

  const [activePrintQuote, setActivePrintQuote] = useState<PosQuote | null>(null);
  const [activeDetailQuote, setActiveDetailQuote] = useState<PosQuote | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<PosQuoteSettings>(() => getQuoteSettings());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const sellers = useMemo(() => listSellers(true), []);

  useEffect(() => {
    function refresh() {
      setQuotes(listPosQuotes());
      setKpis(getQuotesDashboardKpis());
    }
    window.addEventListener(POS_QUOTES_EVENT, refresh);
    return () => window.removeEventListener(POS_QUOTES_EVENT, refresh);
  }, []);

  const filteredQuotes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const now = Date.now();

    return quotes
      .filter((q) => {
        // Filtro por tab de status
        if (statusTab === 'open' && q.status !== 'open' && q.status !== 'sent') return false;
        if (statusTab === 'pending_approval' && q.status !== 'pending_approval') return false;
        if (statusTab === 'approved' && q.status !== 'approved') return false;
        if (statusTab === 'expired' && q.status !== 'expired' && !isQuoteExpired(q, now)) return false;
        if (statusTab === 'converted' && q.status !== 'converted') return false;
        if (statusTab === 'cancelled' && q.status !== 'cancelled' && q.status !== 'rejected') return false;

        // Filtro por vendedor
        if (sellerFilter && q.sellerId !== sellerFilter) return false;

        // Busca textual
        if (!needle) return true;
        const haystack = `${q.quoteNumber} ${q.customerName} ${q.customerDocument} ${q.customerPhone} ${q.sellerName} ${q.notes} ${q.lines.map((l) => l.name).join(' ')}`.toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => {
        if (sortBy === 'expiry') return a.expiresAt.localeCompare(b.expiresAt);
        if (sortBy === 'amount_desc') return b.total - a.total;
        if (sortBy === 'amount_asc') return a.total - b.total;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [quotes, query, statusTab, sellerFilter, sortBy]);

  function handleConvertToSale(quote: PosQuote, updatePrices = false) {
    navigate('/caixa', {
      state: {
        quote,
        updatePrices,
      },
    });
  }

  function handleDuplicate(quote: PosQuote) {
    const res = duplicatePosQuote(quote.id, operatorName);
    if (res.ok) {
      setQuotes(listPosQuotes());
      setMessage(`Orçamento duplicado com sucesso! Nova proposta nº ${res.quote.quoteNumber}`);
      setError('');
    } else {
      setError(res.error);
      setMessage('');
    }
  }

  function handleStatusChange(quote: PosQuote, newStatus: PosQuoteStatus) {
    const res = changeQuoteStatus(quote.id, newStatus, operatorName);
    if (res.ok) {
      setQuotes(listPosQuotes());
      setMessage(`Status do orçamento nº ${quote.quoteNumber} alterado para "${QUOTE_STATUS_LABEL[newStatus]}".`);
      setError('');
    } else {
      setError(res.error);
      setMessage('');
    }
  }

  function handleDelete(quote: PosQuote) {
    if (!window.confirm(`Tem certeza que deseja excluir o orçamento nº ${quote.quoteNumber}?`)) return;
    const res = deletePosQuote(quote.id);
    if (res.ok) {
      setQuotes(listPosQuotes());
      setMessage(`Orçamento nº ${quote.quoteNumber} excluído com sucesso.`);
      setError('');
    } else {
      setError(res.error);
      setMessage('');
    }
  }

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    saveQuoteSettings(settingsForm);
    setSettingsOpen(false);
    setMessage('Configurações padrão de orçamentos salvas com sucesso.');
  }

  return (
    <div className="quotes-page admin-page">
      {/* CABEÇALHO */}
      <header className="page-heading">
        <div>
          <p className="admin__kicker">Vendas & Comercial</p>
          <h1 className="admin__title">Orçamentos & Propostas</h1>
          <p className="admin__lead">
            Controle de propostas comerciais com validade, preços congelados, campanhas e conversão direta no PDV.
          </p>
        </div>
        <div className="quotes-header-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setSettingsForm(getQuoteSettings());
              setSettingsOpen(true);
            }}
          >
            ⚙️ Configurações de Validade
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => navigate('/caixa')}
          >
            🛒 Abrir PDV / Novo Orçamento
          </button>
        </div>
      </header>

      {/* FEEDBACK MENSAGENS */}
      {message ? <p className="pdv__ok" style={{ marginBottom: '1rem' }}>{message}</p> : null}
      {error ? <p className="pdv__alert" style={{ marginBottom: '1rem' }}>{error}</p> : null}

      {/* KPIS DASHBOARD */}
      <section className="quotes-kpis-grid" aria-label="Indicadores Comerciais">
        <div className="quotes-kpi-card quotes-kpi-card--primary">
          <div className="quotes-kpi-card__label">Em Negociação</div>
          <div className="quotes-kpi-card__value">{money(kpis.totalInNegotiation)}</div>
          <div className="quotes-kpi-card__sub">{kpis.openCount} propostas ativas</div>
        </div>

        <div className="quotes-kpi-card quotes-kpi-card--success">
          <div className="quotes-kpi-card__label">Convertidos em Venda</div>
          <div className="quotes-kpi-card__value">{money(kpis.totalConverted)}</div>
          <div className="quotes-kpi-card__sub">{kpis.convertedCount} vendas concretizadas</div>
        </div>

        <div className="quotes-kpi-card quotes-kpi-card--approved">
          <div className="quotes-kpi-card__label">Aprovados pelo Cliente</div>
          <div className="quotes-kpi-card__value">{kpis.approvedCount}</div>
          <div className="quotes-kpi-card__sub">Aguardando faturamento no PDV</div>
        </div>

        <div className={`quotes-kpi-card ${kpis.expiringSoonCount > 0 ? 'quotes-kpi-card--warning' : ''}`}>
          <div className="quotes-kpi-card__label">Expirando em 48h</div>
          <div className="quotes-kpi-card__value">{kpis.expiringSoonCount}</div>
          <div className="quotes-kpi-card__sub">Atenção comercial para fechamento</div>
        </div>

        <div className="quotes-kpi-card quotes-kpi-card--muted">
          <div className="quotes-kpi-card__label">Expirados / Vencidos</div>
          <div className="quotes-kpi-card__value">{kpis.expiredCount}</div>
          <div className="quotes-kpi-card__sub">Total histórico: {kpis.totalQuotes} propostas</div>
        </div>
      </section>

      {/* TABS DE STATUS */}
      <div className="quotes-status-tabs" role="tablist">
        {(
          [
            ['all', 'Todos os Orçamentos', kpis.totalQuotes],
            ['open', 'Abertos / Enviados', kpis.openCount],
            ['approved', 'Aprovados', kpis.approvedCount],
            ['expired', 'Expirados', kpis.expiredCount],
            ['converted', 'Convertidos em Venda', kpis.convertedCount],
            ['cancelled', 'Cancelados / Recusados', null],
          ] as const
        ).map(([tabKey, tabLabel, count]) => (
          <button
            key={tabKey}
            type="button"
            className={`quotes-status-tab ${statusTab === tabKey ? 'is-active' : ''}`}
            onClick={() => setStatusTab(tabKey)}
            role="tab"
            aria-selected={statusTab === tabKey}
          >
            {tabLabel}
            {count != null ? <span className="quotes-tab-count">{count}</span> : null}
          </button>
        ))}
      </div>

      {/* BARRA DE FILTROS */}
      <div className="quotes-filter-bar">
        <label className="quotes-search-input-wrap">
          <span className="sr-only">Pesquisar</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número, cliente, CPF/CNPJ, vendedor ou produto..."
            className="quotes-search-input"
          />
        </label>

        <div className="quotes-filter-selects">
          <AdminPicker
            label="Vendedor"
            value={sellerFilter}
            onChange={(val) => setSellerFilter(val)}
            options={[
              { value: '', label: 'Todos os Vendedores' },
              ...sellers.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />

          <AdminPicker
            label="Ordenar por"
            value={sortBy}
            onChange={(val) => setSortBy(val as any)}
            options={[
              { value: 'recent', label: 'Mais recentes primeiro' },
              { value: 'expiry', label: 'Validade mais próxima' },
              { value: 'amount_desc', label: 'Maior valor (R$)' },
              { value: 'amount_asc', label: 'Menor valor (R$)' },
            ]}
          />
        </div>
      </div>

      {/* TABELA DE ORÇAMENTOS */}
      <div className="admin-table-container quotes-table-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '95px' }}>Nº Orçamento</th>
              <th style={{ width: '135px' }}>Emissão / Validade</th>
              <th>Cliente</th>
              <th style={{ width: '140px' }}>Vendedor</th>
              <th style={{ width: '120px' }}>Itens</th>
              <th style={{ width: '120px' }} className="text-right">Valor Total</th>
              <th style={{ width: '145px' }}>Status</th>
              <th style={{ width: '140px' }} className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredQuotes.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                  Nenhum orçamento encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredQuotes.map((quote) => {
                const expired = isQuoteExpired(quote);
                return (
                  <tr key={quote.id}>
                    <td>
                      <button
                        type="button"
                        className="quotes-number-link"
                        onClick={() => setActiveDetailQuote(quote)}
                        title="Ver detalhes da proposta"
                      >
                        #{quote.quoteNumber}
                      </button>
                    </td>
                    <td>
                      <div className="quotes-date-main">{formatDate(quote.createdAt)}</div>
                      <div
                        className={`quotes-date-validity ${expired ? 'is-expired' : ''}`}
                        title={`Válido por ${quote.validityDays} dias`}
                      >
                        {expired ? '⚠️ Expirou em ' : 'Até '}
                        {formatDate(quote.expiresAt)}
                      </div>
                    </td>
                    <td>
                      <div className="quotes-customer-name">
                        {quote.customerName || 'Consumidor Final'}
                      </div>
                      <div className="quotes-customer-meta">
                        {quote.customerDocument && <span>{quote.customerDocument}</span>}
                        {quote.customerPhone && <span> · {quote.customerPhone}</span>}
                      </div>
                    </td>
                    <td>
                      <span className="quotes-seller-name">{quote.sellerName || '—'}</span>
                    </td>
                    <td>
                      <span
                        className="quotes-items-pill"
                        title={quote.lines.map((l) => `${l.qty}x ${l.name}`).join('\n')}
                      >
                        📦 {quote.lines.length} {quote.lines.length === 1 ? 'item' : 'itens'}
                      </span>
                    </td>
                    <td className="text-right">
                      <strong className="quotes-amount-val">{money(quote.total)}</strong>
                      {quote.discount > 0 && (
                        <div className="quotes-discount-sub">
                          Desc. -{money(quote.discountMode === 'percent' ? (quote.subtotal * quote.discount) / 100 : quote.discount)}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className="quotes-status-tag"
                        data-status={quote.status}
                        style={{
                          background: QUOTE_STATUS_COLOR[quote.status]?.bg || '#f1f5f9',
                          color: QUOTE_STATUS_COLOR[quote.status]?.text || '#334155',
                          borderColor: QUOTE_STATUS_COLOR[quote.status]?.border || '#cbd5e1',
                        }}
                      >
                        {QUOTE_STATUS_LABEL[quote.status]}
                      </span>
                      {quote.convertedOrderId && (
                        <div className="quotes-converted-order">
                          Venda: <strong>#{quote.convertedOrderId}</strong>
                        </div>
                      )}
                    </td>
                    <td className="text-right">
                      <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        {quote.status !== 'converted' ? (
                          <button
                            type="button"
                            className="btn btn--primary quotes-action-btn"
                            onClick={() => handleConvertToSale(quote, false)}
                            title="Converter proposta diretamente em venda no PDV"
                          >
                            🛒 Vender
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn--ghost quotes-action-btn"
                          onClick={() => setActivePrintQuote(quote)}
                          title="Imprimir / Enviar Proposta via WhatsApp"
                        >
                          🖨️
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost quotes-action-btn"
                          onClick={() => handleDuplicate(quote)}
                          title="Duplicar proposta comercial"
                        >
                          📋
                        </button>
                        <CrudRowActions
                          onView={() => setActiveDetailQuote(quote)}
                          onEdit={() => setActiveDetailQuote(quote)}
                          onDuplicate={() => handleDuplicate(quote)}
                          onDelete={() => handleDelete(quote)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL DE DETALHES DO ORÇAMENTO E AUDITORIA */}
      {activeDetailQuote ? (
        <div className="quote-admin-modal" role="dialog" aria-modal="true">
          <div
            className="quote-admin-modal-backdrop"
            aria-label="Fechar"
            onClick={() => setActiveDetailQuote(null)}
          />
          <div className="quote-admin-modal-card quote-admin-modal-card--wide">
            <header className="quote-admin-modal-head">
              <div>
                <span className="quote-detail-head-badge">Proposta Comercial</span>
                <h2 className="quote-detail-head-title">Orçamento nº {activeDetailQuote.quoteNumber}</h2>
              </div>
              <button
                type="button"
                className="quote-admin-modal-close"
                onClick={() => setActiveDetailQuote(null)}
                title="Fechar (Esc)"
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            {/* BARRA DE STATUS E AÇÕES RÁPIDAS */}
            <div className="quotes-detail-topbar">
              <div className="quotes-detail-status-wrap">
                <span className="quotes-detail-status-lbl">Status Atual:</span>
                <span
                  className="quotes-status-tag"
                  data-status={activeDetailQuote.status}
                >
                  {QUOTE_STATUS_LABEL[activeDetailQuote.status]}
                </span>
              </div>
              <div className="quotes-detail-actions-wrap">
                {activeDetailQuote.status !== 'converted' ? (
                  <button
                    type="button"
                    className="btn-quote-action btn-quote-action--convert"
                    onClick={() => {
                      const q = activeDetailQuote;
                      setActiveDetailQuote(null);
                      handleConvertToSale(q, false);
                    }}
                  >
                    🛒 Converter no PDV
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn-quote-action btn-quote-action--print"
                  onClick={() => {
                    const q = activeDetailQuote;
                    setActiveDetailQuote(null);
                    setActivePrintQuote(q);
                  }}
                >
                  🖨️ Imprimir / WhatsApp
                </button>
                {activeDetailQuote.status === 'open' || activeDetailQuote.status === 'sent' ? (
                  <>
                    <button
                      type="button"
                      className="btn-quote-action btn-quote-action--approve"
                      onClick={() => {
                        handleStatusChange(activeDetailQuote, 'approved');
                        setActiveDetailQuote(null);
                      }}
                    >
                      ✓ Aprovar Proposta
                    </button>
                    <button
                      type="button"
                      className="btn-quote-action btn-quote-action--reject"
                      onClick={() => {
                        handleStatusChange(activeDetailQuote, 'rejected');
                        setActiveDetailQuote(null);
                      }}
                    >
                      ✕ Recusar
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {/* DADOS DO CLIENTE E CONDIÇÕES */}
            <div className="quotes-detail-grid">
              <div className="quotes-detail-box">
                <h4>Destinatário / Cliente</h4>
                <p><strong>Nome:</strong> {activeDetailQuote.customerName}</p>
                {activeDetailQuote.customerDocument && <p><strong>CPF/CNPJ:</strong> {activeDetailQuote.customerDocument}</p>}
                {activeDetailQuote.customerPhone && <p><strong>Telefone:</strong> {activeDetailQuote.customerPhone}</p>}
                {activeDetailQuote.customerEmail && <p><strong>E-mail:</strong> {activeDetailQuote.customerEmail}</p>}
                {activeDetailQuote.customerAddress && <p><strong>Endereço:</strong> {activeDetailQuote.customerAddress}</p>}
              </div>

              <div className="quotes-detail-box">
                <h4>Condições Comerciais</h4>
                <p><strong>Vendedor:</strong> {activeDetailQuote.sellerName}</p>
                <p><strong>Validade:</strong> {formatDate(activeDetailQuote.expiresAt)} ({activeDetailQuote.validityDays} dias)</p>
                <p><strong>Pagamento:</strong> {activeDetailQuote.paymentConditions || 'Conforme acordado'}</p>
                <p><strong>Prazo de Entrega:</strong> {activeDetailQuote.deliveryTerm || 'Imediato'}</p>
                {activeDetailQuote.notes && <p><strong>Observações:</strong> {activeDetailQuote.notes}</p>}
              </div>
            </div>

            {/* TABELA DE PRODUTOS */}
            <div className="admin-table-container" style={{ marginTop: '1.25rem' }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Produto / Material</th>
                    <th className="text-center">Un.</th>
                    <th className="text-right">Qtd</th>
                    <th className="text-right">Preço Unit. (Congelado)</th>
                    <th className="text-right">Desconto</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDetailQuote.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="quote-sku-mono">{line.sku || '—'}</td>
                      <td>
                        <strong>{line.name}</strong>
                        {line.promoLabel && (
                          <span className="quote-promo-label">
                            ✨ {line.promoLabel}
                          </span>
                        )}
                      </td>
                      <td className="text-center">{line.unit || 'UN'}</td>
                      <td className="text-right font-medium">{line.qty}</td>
                      <td className="text-right">{money(line.unitPrice)}</td>
                      <td className="text-right text-muted">
                        {line.lineDiscount > 0
                          ? line.lineDiscountMode === 'percent'
                            ? `${line.lineDiscount}%`
                            : money(line.lineDiscount)
                          : '—'}
                      </td>
                      <td className="text-right font-bold">{money(line.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* TOTAIS */}
            <div className="quotes-detail-totals">
              <div>Subtotal: <strong>{money(activeDetailQuote.subtotal)}</strong></div>
              {activeDetailQuote.discount > 0 && (
                <div className="quote-discount-text">
                  Desconto: -{money(activeDetailQuote.discountMode === 'percent' ? (activeDetailQuote.subtotal * activeDetailQuote.discount) / 100 : activeDetailQuote.discount)}
                </div>
              )}
              {activeDetailQuote.surcharge > 0 && (
                <div className="quote-surcharge-text">
                  Acréscimo: +{money(activeDetailQuote.surchargeMode === 'percent' ? (activeDetailQuote.subtotal * activeDetailQuote.surcharge) / 100 : activeDetailQuote.surcharge)}
                </div>
              )}
              <div className="quotes-detail-grand-total">
                Total Geral: {money(activeDetailQuote.total)}
              </div>
            </div>

            {/* HISTÓRICO DE AUDITORIA */}
            <div className="quotes-audit-section">
              <h4>Histórico & Auditoria da Proposta</h4>
              <div className="quotes-audit-list">
                {activeDetailQuote.history.map((h, idx) => (
                  <div key={h.id || idx} className="quotes-audit-entry">
                    <span className="quotes-audit-dot" />
                    <div className="quotes-audit-content">
                      <div className="quotes-audit-meta">
                        <strong>{h.actorName}</strong> {h.action} ·{' '}
                        <span>{new Date(h.createdAt).toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="quotes-audit-details">{h.details}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL DE CONFIGURAÇÃO DE VALIDADE E PADRÕES */}
      {settingsOpen ? (
        <div className="quote-admin-modal" role="dialog" aria-modal="true">
          <div
            className="quote-admin-modal-backdrop"
            aria-label="Fechar"
            onClick={() => setSettingsOpen(false)}
          />
          <div className="quote-admin-modal-card" style={{ maxWidth: '540px' }}>
            <form onSubmit={handleSaveSettings}>
              <header className="quote-admin-modal-head">
                <h2 className="quote-detail-head-title">Configurações de Orçamentos</h2>
                <button
                  type="button"
                  className="quote-admin-modal-close"
                  onClick={() => setSettingsOpen(false)}
                  title="Fechar (Esc)"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </header>

              <div className="quote-settings-form-grid">
                <label>
                  <span>Validade Padrão das Propostas (Dias)</span>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={settingsForm.defaultValidityDays}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        defaultValidityDays: Number(e.target.value) || 1,
                      }))
                    }
                  />
                  <small className="quote-settings-hint">Prazo padrão aplicado a novos orçamentos.</small>
                </label>
                <label>
                  <span>Prazo de Entrega Padrão</span>
                  <input
                    value={settingsForm.defaultDeliveryTerm}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        defaultDeliveryTerm: e.target.value,
                      }))
                    }
                    placeholder="Ex: Imediato / 3 dias úteis"
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Condições de Pagamento Padrão</span>
                  <input
                    value={settingsForm.defaultPaymentConditions}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        defaultPaymentConditions: e.target.value,
                      }))
                    }
                    placeholder="Ex: À vista Pix com 5% de desconto ou até 12x no cartão"
                  />
                </label>
                <label style={{ gridColumn: '1 / -1' }}>
                  <span>Observações Comerciais e Garantia Padrão</span>
                  <textarea
                    rows={3}
                    value={settingsForm.defaultNotes}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        defaultNotes: e.target.value,
                      }))
                    }
                    placeholder="Texto exibido no rodapé do documento de proposta comercial..."
                  />
                </label>
              </div>

              <div className="quote-admin-modal-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setSettingsOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary">
                  Salvar Configurações
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* MODAL DE IMPRESSÃO COMERCIAL */}
      <QuoteCommercialPrintModal
        quote={activePrintQuote}
        open={Boolean(activePrintQuote)}
        onClose={() => setActivePrintQuote(null)}
        operatorName={operatorName}
        onConvertToSale={(q) => handleConvertToSale(q, false)}
      />
    </div>
  );
}
