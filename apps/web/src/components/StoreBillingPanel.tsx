import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchStoreBillingSubscription,
  formatBillingDate,
  formatBillingMoney,
  openStoreBillingPortal,
  type BillingInvoice,
  type ClientSubscription,
} from '../data/billingSubscriptionsApi';
import { NestApiError, isNestAuthed } from '../services/nestClient';
import { buildPixBrCode, fetchPublicPixInfo, type PublicPixInfo } from '../utils/pixBrCode';
import './storeBillingPanel.css';

const STATUS_LABEL: Record<string, string> = {
  trialing: 'Em trial',
  active: 'Ativa',
  past_due: 'Em atraso',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  unpaid: 'Não paga',
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  open: 'Em aberto',
  paid: 'Paga',
  void: 'Anulada',
  uncollectible: 'Não cobrável',
};

type StoreBillingPanelProps = {
  /** Compact block under licensed total on /painel/lojas */
  variant?: 'embedded' | 'page';
  /** Optional link to full plan page when embedded */
  showPlanLink?: boolean;
};

export function StoreBillingPanel({ variant = 'embedded', showPlanLink = true }: StoreBillingPanelProps) {
  const [subscription, setSubscription] = useState<ClientSubscription | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [activeProvider, setActiveProvider] = useState('manual');
  const [portalAvailable, setPortalAvailable] = useState(false);
  const [gates, setGates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [portalBusy, setPortalBusy] = useState(false);
  const [showPix, setShowPix] = useState(false);
  const [pixInfo, setPixInfo] = useState<PublicPixInfo | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  useEffect(() => {
    if (!isNestAuthed()) {
      setLoading(false);
      setNote('Faça login para ver o faturamento da assinatura.');
      return;
    }
    let cancelled = false;
    void fetchStoreBillingSubscription()
      .then((data) => {
        if (cancelled) return;
        setSubscription(data.subscription);
        setInvoices(data.invoices);
        setActiveProvider(data.provider.activeProvider);
        setPortalAvailable(data.provider.portalAvailable);
        setGates(data.provider.gates || []);
        if (!data.subscription) {
          setNote('Nenhuma assinatura registrada ainda no MarthiDB.');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setNote(err instanceof Error ? err.message : 'Assinatura indisponível no MarthiDB.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openInvoice = useMemo(
    () => invoices.find((item) => item.status === 'open') || null,
    [invoices],
  );

  const amountDue = openInvoice?.amount ?? subscription?.amount ?? 0;

  const pixBrCode = useMemo(() => {
    if (!pixInfo || !subscription) return '';
    return buildPixBrCode({
      keyType: pixInfo.keyType,
      keyValue: pixInfo.keyValue,
      receiverName: pixInfo.receiverName,
      amount: amountDue > 0 ? amountDue : undefined,
      txid: `MARTHI${subscription.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 18).toUpperCase() || 'SUB'}`,
      description: `Assinatura Marthi ${subscription.planId}`,
    });
  }, [pixInfo, subscription, amountDue]);

  async function handleOpenPortal() {
    setPortalBusy(true);
    setNote('');
    try {
      const data = await openStoreBillingPortal();
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setNote(err instanceof NestApiError ? err.message : 'Portal de pagamento indisponível.');
    } finally {
      setPortalBusy(false);
    }
  }

  async function handleShowPix() {
    setShowPix(true);
    setNote('');
    if (pixInfo) return;
    try {
      const info = await fetchPublicPixInfo();
      setPixInfo(info);
    } catch (err) {
      setNote(err instanceof Error ? err.message : 'Não foi possível carregar a chave Pix da Marthi.');
    }
  }

  async function handleCopyPix() {
    if (!pixBrCode) return;
    try {
      await navigator.clipboard.writeText(pixBrCode);
      setPixCopied(true);
      window.setTimeout(() => setPixCopied(false), 2500);
    } catch {
      setNote('Não foi possível copiar o Pix. Selecione o código manualmente.');
    }
  }

  const isManual = activeProvider === 'manual' || !portalAvailable;
  const statusLabel = subscription
    ? STATUS_LABEL[subscription.status] || subscription.status
    : '—';

  return (
    <article
      className={`store-billing-panel store-billing-panel--${variant}`}
      id="plano-faturamento"
      aria-labelledby="store-billing-title"
    >
      <header className="store-billing-panel__head">
        <div>
          <p className="store-billing-panel__kicker">Assinatura Marthi</p>
          <h3 id="store-billing-title">Plano &amp; Faturamento</h3>
          <p className="store-billing-panel__lead">
            Valor devido, próxima cobrança e pagamento da conta comercial — dados do MarthiDB.
          </p>
        </div>
        {showPlanLink && variant === 'embedded' ? (
          <Link to="/painel/plano" className="btn btn--ghost store-billing-panel__plan-link">
            Abrir /painel/plano
          </Link>
        ) : null}
      </header>

      {loading ? (
        <p className="store-billing-panel__muted">Carregando assinatura…</p>
      ) : !subscription ? (
        <p className="store-billing-panel__muted">{note || 'Nenhuma assinatura encontrada.'}</p>
      ) : (
        <>
          <div className="store-billing-panel__metrics">
            <div className="store-billing-panel__metric">
              <span className="store-billing-panel__metric-label">Plano atual</span>
              <strong className="store-billing-panel__metric-value" style={{ textTransform: 'capitalize' }}>
                {subscription.planId}
              </strong>
              <span className="store-billing-panel__metric-sub">{statusLabel}</span>
            </div>
            <div className="store-billing-panel__metric store-billing-panel__metric--accent">
              <span className="store-billing-panel__metric-label">
                {openInvoice ? 'Valor em aberto' : 'Valor da assinatura'}
              </span>
              <strong className="store-billing-panel__metric-value store-billing-panel__metric-value--money">
                {formatBillingMoney(amountDue, subscription.currency)}
              </strong>
              <span className="store-billing-panel__metric-sub">
                / {subscription.billingCycle === 'yearly' ? 'ano' : 'mês'}
              </span>
            </div>
            <div className="store-billing-panel__metric">
              <span className="store-billing-panel__metric-label">Próxima cobrança</span>
              <strong className="store-billing-panel__metric-value store-billing-panel__metric-value--date">
                {formatBillingDate(subscription.nextChargeAt)}
              </strong>
              <span className="store-billing-panel__metric-sub">
                Preferência: {subscription.paymentMethodPreference || 'pix'}
              </span>
            </div>
          </div>

          <div className="store-billing-panel__actions">
            {isManual ? (
              <button type="button" className="btn btn--primary" onClick={() => void handleShowPix()}>
                Pagar via Pix
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                disabled={portalBusy}
                onClick={() => void handleOpenPortal()}
              >
                {portalBusy ? 'Abrindo…' : 'Pagar / Gerenciar pagamento'}
              </button>
            )}
            {portalAvailable ? (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={portalBusy}
                onClick={() => void handleOpenPortal()}
              >
                Gerenciar no Stripe
              </button>
            ) : null}
            {activeProvider === 'manual' && !showPix ? (
              <button type="button" className="btn btn--ghost" onClick={() => void handleShowPix()}>
                Ver instruções Pix
              </button>
            ) : null}
          </div>

          {showPix && isManual ? (
            <div className="store-billing-panel__pix" role="region" aria-label="Pagamento Pix manual">
              <h4>Pagamento Pix (manual)</h4>
              <p>
                Enquanto o gateway automático não estiver ativo (<code>BILLING_PROVIDER=manual</code>), pague com a
                chave Pix da Marthi. Após o pagamento, a liberação é confirmada pela equipe Marthi.
              </p>
              {pixInfo ? (
                <dl className="store-billing-panel__pix-grid">
                  <div>
                    <dt>Beneficiário</dt>
                    <dd>{pixInfo.receiverName}</dd>
                  </div>
                  <div>
                    <dt>Tipo de chave</dt>
                    <dd>{pixInfo.keyType}</dd>
                  </div>
                  <div>
                    <dt>Chave Pix</dt>
                    <dd>
                      <code>{pixInfo.keyValue}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Valor</dt>
                    <dd>{formatBillingMoney(amountDue, subscription.currency)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="store-billing-panel__muted">Carregando chave Pix…</p>
              )}
              {pixBrCode ? (
                <div className="store-billing-panel__pix-copy">
                  <label htmlFor="store-billing-pix-code">Pix Copia e Cola</label>
                  <textarea id="store-billing-pix-code" readOnly rows={3} value={pixBrCode} />
                  <button type="button" className="btn btn--ghost" onClick={() => void handleCopyPix()}>
                    {pixCopied ? 'Copiado!' : 'Copiar código Pix'}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {gates.length > 0 && activeProvider === 'manual' ? (
            <p className="store-billing-panel__hint">{gates[0]}</p>
          ) : null}

          <div className="store-billing-panel__invoices">
            <div className="store-billing-panel__invoices-head">
              <h4>Faturas</h4>
              <span className="store-billing-panel__muted">
                {invoices.length ? `${invoices.length} registro(s)` : 'Nenhuma fatura ainda'}
              </span>
            </div>
            {invoices.length ? (
              <div className="admin-table-container">
                <table className="store-billing-panel__table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Método</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.slice(0, variant === 'embedded' ? 8 : 20).map((invoice) => (
                      <tr key={invoice.id}>
                        <td data-label="Descrição">
                          <strong>{invoice.description || 'Mensalidade Marthi'}</strong>
                        </td>
                        <td data-label="Vencimento">{formatBillingDate(invoice.dueAt || invoice.createdAt)}</td>
                        <td data-label="Valor">{formatBillingMoney(invoice.amount, invoice.currency)}</td>
                        <td data-label="Status">
                          <span
                            className={`store-billing-panel__pill store-billing-panel__pill--${invoice.status}`}
                          >
                            {INVOICE_STATUS_LABEL[invoice.status] || invoice.status}
                          </span>
                        </td>
                        <td data-label="Método">{invoice.paymentMethod || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="store-billing-panel__muted">
                Quando a Marthi registrar mensalidades, elas aparecem aqui automaticamente.
              </p>
            )}
          </div>
        </>
      )}

      {note && subscription ? <p className="store-billing-panel__flash" role="status">{note}</p> : null}
    </article>
  );
}
