import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getDefaultCompanyData, type CompanyPrintData } from '../data/osPrintSettings';
import {
  isQuoteExpired,
  registerQuotePrint,
  QUOTE_STATUS_LABEL,
  type PosQuote,
} from '../data/posQuotesStore';
import './quoteCommercialPrint.css';

type Props = {
  quote: PosQuote | null;
  open: boolean;
  onClose: () => void;
  operatorName?: string;
  onConvertToSale?: (quote: PosQuote) => void;
  autoPrint?: boolean;
};

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

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function QuoteCommercialPrintModal({
  quote,
  open,
  onClose,
  operatorName = 'Operador',
  onConvertToSale,
  autoPrint = false,
}: Props) {
  useEffect(() => {
    if (open && quote) {
      registerQuotePrint(quote.id, operatorName);
      document.body.classList.add('is-printing-quote');
    }
    return () => {
      document.body.classList.remove('is-printing-quote');
    };
  }, [open, quote, operatorName]);

  useEffect(() => {
    if (open && quote && autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [open, quote, autoPrint]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        window.print();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !quote || typeof document === 'undefined') return null;

  const company: CompanyPrintData = getDefaultCompanyData();
  const expired = isQuoteExpired(quote);
  const companyTitle = company.tradeName || company.name || 'MARTHI COMÉRCIO E TECNOLOGIA';
  const companySub = company.name || company.tradeName || '';

  const handlePrint = () => {
    window.print();
  };

  const generateWhatsAppMessage = () => {
    const linesText = quote.lines
      .map(
        (l, idx) =>
          `${idx + 1}. *${l.name}*\n   Qtd: ${l.qty} ${l.unit} | Unit: ${money(l.unitPrice)} | Total: ${money(l.total)}${l.promoLabel ? ` _(${l.promoLabel})_` : ''}`,
      )
      .join('\n\n');

    const msg = [
      `*PROPOSTA COMERCIAL - ${companyTitle.toUpperCase()}*`,
      `📄 *Orçamento nº ${quote.quoteNumber}*`,
      `📅 Emissão: ${formatDate(quote.createdAt)}`,
      `⏳ *Válido até: ${formatDate(quote.expiresAt)}*`,
      quote.sellerName ? `👤 Vendedor: ${quote.sellerName}` : '',
      `--------------------------------`,
      `*CLIENTE:* ${quote.customerName}`,
      quote.customerDocument ? `Doc: ${quote.customerDocument}` : '',
      quote.customerAddress ? `Endereço: ${quote.customerAddress}` : '',
      `--------------------------------`,
      `*ITENS DO ORÇAMENTO:*`,
      linesText,
      `--------------------------------`,
      `*Subtotal:* ${money(quote.subtotal)}`,
      quote.discount > 0 ? `*Desconto:* -${money(quote.discount)}` : '',
      quote.surcharge > 0 ? `*Acréscimo/Frete:* +${money(quote.surcharge)}` : '',
      `💰 *VALOR TOTAL: ${money(quote.total)}*`,
      `--------------------------------`,
      quote.paymentConditions ? `💳 *Condições de Pagamento:* ${quote.paymentConditions}` : '',
      quote.deliveryTerm ? `🚚 *Prazo de Entrega:* ${quote.deliveryTerm}` : '',
      quote.notes ? `📝 *Observações:* ${quote.notes}` : '',
      `\nFicamos à disposição para fechamento do pedido!`,
    ]
      .filter(Boolean)
      .join('\n');

    return msg;
  };

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(generateWhatsAppMessage());
    const cleanPhone = (quote.customerPhone || '').replace(/\D/g, '');
    let url = `https://api.whatsapp.com/send?text=${text}`;
    if (cleanPhone.length >= 10) {
      const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${text}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(generateWhatsAppMessage());
      alert('Texto do orçamento copiado para a área de transferência!');
    } catch {
      alert('Não foi possível copiar automaticamente.');
    }
  };

  return createPortal(
    <div className="quote-modal-backdrop" onClick={onClose}>
      <div
        className="quote-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* BARRA SUPERIOR DE AÇÕES (NÃO APARECE NA IMPRESSÃO) */}
        <header className="quote-print-bar no-print">
          <div className="quote-print-bar__left">
            <span className="quote-print-bar__badge">📄 Orçamento nº {quote.quoteNumber}</span>
            <span className={`quote-status-pill quote-status-pill--${quote.status}`}>
              {QUOTE_STATUS_LABEL[quote.status]}
            </span>
            {expired && quote.status !== 'converted' && (
              <span className="quote-expired-warning">⚠️ Proposta Expirada</span>
            )}
          </div>
          <div className="quote-print-bar__right">
            {onConvertToSale && quote.status !== 'converted' && (
              <button
                type="button"
                className="quote-bar-btn quote-bar-btn--convert"
                onClick={() => {
                  onClose();
                  onConvertToSale(quote);
                }}
              >
                🛒 Converter em Venda
              </button>
            )}
            <button
              type="button"
              className="quote-bar-btn quote-bar-btn--whatsapp"
              onClick={handleSendWhatsApp}
              title="Enviar Proposta pelo WhatsApp"
            >
              💬 WhatsApp
            </button>
            <button
              type="button"
              className="quote-bar-btn quote-bar-btn--copy"
              onClick={handleCopyText}
              title="Copiar texto da proposta"
            >
              📋 Copiar
            </button>
            <button
              type="button"
              className="quote-bar-btn quote-bar-btn--print"
              onClick={handlePrint}
              title="Imprimir ou Salvar PDF (Ctrl+P)"
            >
              🖨️ Imprimir / PDF
            </button>
            <button
              type="button"
              className="quote-bar-btn quote-bar-btn--close"
              onClick={onClose}
              title="Fechar (Esc)"
              aria-label="Fechar modal"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ÁREA TIMBRADA OFICIAL DA PROPOSTA (LAYOUT A4) */}
        <main className="quote-document-sheet">
          {/* CABEÇALHO DA EMPRESA */}
          <div className="quote-doc-header">
            <div className="quote-doc-header__logo-info">
              {company.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={companyTitle}
                  className="quote-doc-header__logo-img"
                />
              ) : (
                <div className="quote-doc-header__logo-placeholder">
                  <span>🏢</span>
                </div>
              )}
              <div className="quote-doc-header__company-text">
                <h1 className="quote-company-name">{companyTitle}</h1>
                {companySub && companySub !== companyTitle && (
                  <p className="quote-company-sub">{companySub}</p>
                )}
                <p className="quote-company-meta">
                  {company.document && <span><strong>CNPJ:</strong> {company.document}</span>}
                  {company.ie && <span> · <strong>IE:</strong> {company.ie}</span>}
                </p>
                <p className="quote-company-meta">
                  {company.address && <span>{company.address}</span>}
                  {company.neighborhood && <span>, {company.neighborhood}</span>}
                  {company.city && <span> - {company.city}/{company.state || 'RJ'}</span>}
                  {company.zip && <span> · CEP {company.zip}</span>}
                </p>
                <p className="quote-company-meta">
                  {company.phone && <span><strong>Tel/WhatsApp:</strong> {company.phone}</span>}
                  {company.email && <span> · <strong>E-mail:</strong> {company.email}</span>}
                </p>
              </div>
            </div>

            {/* QUADRO DO ORÇAMENTO */}
            <div className="quote-doc-header__quote-box">
              <div className="quote-box__title">ORÇAMENTO COMERCIAL</div>
              <div className="quote-box__number">Nº {quote.quoteNumber}</div>
              <div className="quote-box__line">
                <span>Data de Emissão:</span>
                <strong>{formatDateTime(quote.createdAt)}</strong>
              </div>
              <div className="quote-box__line quote-box__line--validity">
                <span>Válido até:</span>
                <strong>{formatDate(quote.expiresAt)}</strong>
              </div>
              <div className="quote-box__line">
                <span>Vendedor:</span>
                <strong>{quote.sellerName || 'Atendimento Loja'}</strong>
              </div>
              {quote.priceTableName && (
                <div className="quote-box__line">
                  <span>Tabela:</span>
                  <span>{quote.priceTableName}</span>
                </div>
              )}
            </div>
          </div>

          {/* DADOS DO CLIENTE */}
          <div className="quote-doc-section quote-doc-client-card">
            <div className="quote-doc-section__title">DADOS DO CLIENTE / DESTINATÁRIO</div>
            <div className="quote-doc-client-grid">
              <div>
                <span className="quote-field-label">Cliente / Razão Social:</span>
                <span className="quote-field-value quote-field-value--highlight">
                  {quote.customerName || 'Consumidor Final'}
                </span>
              </div>
              <div>
                <span className="quote-field-label">CPF / CNPJ:</span>
                <span className="quote-field-value">{quote.customerDocument || 'Não informado'}</span>
              </div>
              <div>
                <span className="quote-field-label">Telefone / WhatsApp:</span>
                <span className="quote-field-value">{quote.customerPhone || 'Não informado'}</span>
              </div>
              <div>
                <span className="quote-field-label">E-mail:</span>
                <span className="quote-field-value">{quote.customerEmail || 'Não informado'}</span>
              </div>
              {quote.customerAddress && (
                <div className="quote-doc-client-grid__full">
                  <span className="quote-field-label">Endereço / Local de Entrega:</span>
                  <span className="quote-field-value">{quote.customerAddress}</span>
                </div>
              )}
            </div>
          </div>

          {/* TABELA DE PRODUTOS / ITENS */}
          <div className="quote-doc-section">
            <div className="quote-doc-section__title">ITENS DA PROPOSTA</div>
            <div className="quote-doc-table-wrap">
              <table className="quote-doc-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }} className="text-center">#</th>
                    <th style={{ width: '100px' }}>Código</th>
                    <th>Descrição do Produto / Material</th>
                    <th style={{ width: '50px' }} className="text-center">Un.</th>
                    <th style={{ width: '70px' }} className="text-right">Qtd.</th>
                    <th style={{ width: '100px' }} className="text-right">Preço Unit.</th>
                    <th style={{ width: '90px' }} className="text-right">Desc.</th>
                    <th style={{ width: '110px' }} className="text-right">Total Item</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lines.map((line, idx) => (
                    <tr key={line.id || idx}>
                      <td className="text-center text-muted">{idx + 1}</td>
                      <td className="quote-item-code">{line.sku || line.stockId?.slice(0, 8) || '—'}</td>
                      <td>
                        <div className="quote-item-name">{line.name}</div>
                        {line.promoLabel && (
                          <div className="quote-item-promo">✨ {line.promoLabel}</div>
                        )}
                      </td>
                      <td className="text-center">{line.unit || 'UN'}</td>
                      <td className="text-right font-medium">
                        {line.qty.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                      </td>
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
          </div>

          {/* QUADRO DE TOTAIS E CONDIÇÕES */}
          <div className="quote-doc-bottom-grid">
            {/* CONDIÇÕES COMERCIAIS */}
            <div className="quote-doc-conditions">
              <div className="quote-doc-section__title">CONDIÇÕES COMERCIAIS</div>
              <div className="quote-condition-item">
                <span className="quote-condition-label">Forma de Pagamento:</span>
                <span className="quote-condition-val">
                  {quote.paymentConditions || 'Conforme acordado no fechamento'}
                </span>
              </div>
              <div className="quote-condition-item">
                <span className="quote-condition-label">Prazo de Entrega:</span>
                <span className="quote-condition-val">
                  {quote.deliveryTerm || 'Disponibilidade imediata / Sob consulta'}
                </span>
              </div>
              <div className="quote-condition-item">
                <span className="quote-condition-label">Validade da Proposta:</span>
                <span className="quote-condition-val">
                  <strong>{quote.validityDays} dias</strong> (até {formatDate(quote.expiresAt)})
                </span>
              </div>
              {quote.notes && (
                <div className="quote-condition-notes">
                  <span className="quote-condition-label">Observações:</span>
                  <p>{quote.notes}</p>
                </div>
              )}
            </div>

            {/* RESUMO DOS VALORES */}
            <div className="quote-doc-totals">
              <div className="quote-totals-row">
                <span>Subtotal dos Itens:</span>
                <span>{money(quote.subtotal)}</span>
              </div>
              {quote.discount > 0 && (
                <div className="quote-totals-row quote-totals-row--discount">
                  <span>
                    Desconto Comercial
                    {quote.discountMode === 'percent' ? ` (${quote.discount}%)` : ''}:
                  </span>
                  <span>
                    -
                    {money(
                      quote.discountMode === 'percent'
                        ? (quote.subtotal * quote.discount) / 100
                        : quote.discount,
                    )}
                  </span>
                </div>
              )}
              {quote.surcharge > 0 && (
                <div className="quote-totals-row quote-totals-row--surcharge">
                  <span>
                    Acréscimo / Frete
                    {quote.surchargeMode === 'percent' ? ` (${quote.surcharge}%)` : ''}:
                  </span>
                  <span>
                    +
                    {money(
                      quote.surchargeMode === 'percent'
                        ? (quote.subtotal * quote.surcharge) / 100
                        : quote.surcharge,
                    )}
                  </span>
                </div>
              )}
              <div className="quote-totals-row quote-totals-row--grand-total">
                <span>TOTAL DA PROPOSTA:</span>
                <span>{money(quote.total)}</span>
              </div>
            </div>
          </div>

          {/* TERMOS E CAMPO DE ACEITE / ASSINATURA */}
          <div className="quote-doc-footer">
            <p className="quote-doc-disclaimer">
              * Os preços e condições ofertados nesta proposta comercial estão garantidos até a data de
              validade indicada ({formatDate(quote.expiresAt)}). A confirmação do pedido está sujeita à
              disponibilidade de estoque no ato do faturamento.
            </p>

            <div className="quote-doc-signature-block">
              <div className="quote-doc-signature-box">
                <div className="quote-signature-line" />
                <span className="quote-signature-title">{companyTitle}</span>
                <span className="quote-signature-sub">Emissor / Vendedor: {quote.sellerName}</span>
              </div>
              <div className="quote-doc-signature-box">
                <div className="quote-signature-line" />
                <span className="quote-signature-title">
                  {quote.customerName || 'Cliente / Responsável'}
                </span>
                <span className="quote-signature-sub">De acordo / Assinatura do Cliente</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>,
    document.body,
  );
}
