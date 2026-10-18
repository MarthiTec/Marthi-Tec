import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import {
  cancelAdminSubscription,
  createAdminInvoice,
  fetchAdminSubscriptionDetail,
  fetchAdminSubscriptions,
  formatBillingDate,
  formatBillingMoney,
  openAdminStripePortal,
  patchAdminSubscription,
  type BillingInvoice,
  type BillingPaymentEvent,
  type BillingProviderStatus,
  type ClientSubscription,
} from '../../data/billingSubscriptionsApi';
import { NestApiError } from '../../services/nestClient';

type TabId = 'assinatura' | 'addons' | 'pagamentos' | 'faturas';

const TABS: { id: TabId; label: string; icon: 'plan' | 'layers' | 'payments' | 'receipt' }[] = [
  { id: 'assinatura', label: 'Assinatura', icon: 'plan' },
  { id: 'addons', label: 'Add-ons', icon: 'layers' },
  { id: 'pagamentos', label: 'Pagamentos', icon: 'payments' },
  { id: 'faturas', label: 'Faturas', icon: 'receipt' },
];

const STATUS_LABEL: Record<string, string> = {
  trialing: 'Em trial',
  active: 'Ativa',
  past_due: 'Em atraso',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  unpaid: 'Não paga',
};

export function MarthiAssinaturasPage() {
  const [tab, setTab] = useState<TabId>('assinatura');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [provider, setProvider] = useState<BillingProviderStatus | null>(null);
  const [subscriptions, setSubscriptions] = useState<ClientSubscription[]>([]);
  const [clientId, setClientId] = useState('');
  const [detail, setDetail] = useState<ClientSubscription | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [events, setEvents] = useState<BillingPaymentEvent[]>([]);
  const [stripeCustomerId, setStripeCustomerId] = useState('');
  const [invoiceAmount, setInvoiceAmount] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [busy, setBusy] = useState(false);

  const clientOptions = useMemo(
    () =>
      subscriptions.map((item) => ({
        value: item.clientAccountId,
        label: `${item.tradeName} · ${item.planId} · ${formatBillingMoney(item.amount)}`,
      })),
    [subscriptions],
  );

  const loadList = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await fetchAdminSubscriptions();
      setProvider(data.provider);
      setSubscriptions(data.subscriptions);
      setClientId((current) => {
        if (current && data.subscriptions.some((item) => item.clientAccountId === current)) return current;
        return data.subscriptions[0]?.clientAccountId || '';
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao carregar assinaturas do MarthiDB.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) {
      setDetail(null);
      setInvoices([]);
      setEvents([]);
      return;
    }
    try {
      const data = await fetchAdminSubscriptionDetail(id);
      setProvider(data.provider);
      setDetail(data.subscription);
      setInvoices(data.invoices);
      setEvents(data.paymentEvents);
      setStripeCustomerId(data.subscription.providerCustomerId || '');
      setInvoiceAmount(data.subscription.amount ? String(data.subscription.amount) : '');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao carregar detalhe da assinatura.');
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void loadDetail(clientId);
  }, [clientId, loadDetail]);

  async function handlePortal() {
    if (!clientId) return;
    setBusy(true);
    setFeedback(null);
    try {
      const data = await openAdminStripePortal(clientId);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setFeedback(error instanceof NestApiError ? error.message : 'Não foi possível abrir o portal Stripe.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(immediate: boolean) {
    if (!clientId || !detail) return;
    const ok = window.confirm(
      immediate
        ? `Cancelar imediatamente a assinatura de “${detail.tradeName}”?`
        : `Agendar cancelamento de “${detail.tradeName}” para o fim do período?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await cancelAdminSubscription(clientId, immediate);
      setFeedback(immediate ? 'Assinatura cancelada no MarthiDB.' : 'Cancelamento agendado no MarthiDB.');
      await loadList();
      await loadDetail(clientId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao cancelar.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveStripeCustomer() {
    if (!clientId) return;
    setBusy(true);
    try {
      await patchAdminSubscription(clientId, {
        provider: stripeCustomerId.trim() ? 'stripe' : 'manual',
        providerCustomerId: stripeCustomerId.trim() || null,
      });
      setFeedback('Vínculo Stripe salvo no MarthiDB.');
      await loadDetail(clientId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar vínculo Stripe.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePaidInvoice() {
    if (!clientId || !detail) return;
    const amount = Number(invoiceAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setFeedback('Informe um valor válido para a fatura.');
      return;
    }
    setBusy(true);
    try {
      await createAdminInvoice({
        clientAccountId: clientId,
        amount,
        status: 'paid',
        paymentMethod: detail.paymentMethodPreference === 'card' ? 'card' : 'pix',
        transactionRef: invoiceRef.trim() || undefined,
        description: `Mensalidade ${detail.planId} — ${detail.tradeName}`,
        paidAt: new Date().toISOString(),
      });
      setFeedback('Fatura registrada no MarthiDB.');
      setInvoiceRef('');
      await loadDetail(clientId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao registrar fatura.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-page marthi-billing">
      <div className="marthi-billing__intro">
        <div>
          <h2>Assinaturas (backoffice Marthi)</h2>
          <p>
            Operação interna no MarthiDB: sync de licenças, Customer Stripe e faturas manuais. O cliente paga em{' '}
            <strong>/painel/lojas</strong> (Licenciamento) — esta tela não substitui o painel do lojista.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => void loadList()} disabled={loading || busy}>
          <AdminIcon name="sync" /> Atualizar
        </button>
      </div>

      {provider ? (
        <div className="marthi-billing__gates" role="status">
          <strong>Provedor ativo: {provider.activeProvider}</strong>
          <ul>
            {provider.gates.map((gate) => (
              <li key={gate}>{gate}</li>
            ))}
          </ul>
          <p className="marthi-billing__gates-meta">
            Stripe secret: {provider.stripe.hasSecretKey ? 'configurado' : 'ausente'} · webhook:{' '}
            {provider.stripe.hasWebhookSecret ? 'configurado' : 'ausente'} · Asaas:{' '}
            {provider.asaas.configured ? 'configurado' : 'ausente'}
          </p>
        </div>
      ) : null}

      {feedback ? <p className="marthi-billing__flash">{feedback}</p> : null}

      <div className="marthi-toolbar">
        <label className="marthi-toolbar__field marthi-toolbar__field--grow">
          Cliente (MarthiDB)
          <AdminPicker
            compact
            label="Cliente"
            value={clientId}
            options={[{ value: '', label: loading ? 'Carregando…' : 'Selecione um cliente' }, ...clientOptions]}
            onChange={setClientId}
          />
        </label>
        <Link to="/admin/clientes" className="btn btn--ghost">
          Abrir clientes
        </Link>
        <Link to="/admin/recebimentos" className="btn btn--ghost">
          Pix de recebimento
        </Link>
      </div>

      <nav className="marthi-billing__tabs" aria-label="Seções de faturamento">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`marthi-billing__tab ${tab === item.id ? 'is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <AdminIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {loading ? <p className="empty">Carregando assinaturas do MarthiDB…</p> : null}

      {!loading && !detail ? (
        <article className="admin-card marthi-billing__empty">
          <AdminIcon name="plan" />
          <h3>Nenhuma assinatura no MarthiDB</h3>
          <p>
            Cadastre o cliente e a licença em <Link to="/admin/clientes">Clientes ativos</Link>. A sincronização cria a
            assinatura a partir de <code>store_licenses</code>.
          </p>
        </article>
      ) : null}

      {!loading && detail && tab === 'assinatura' ? (
        <article className="admin-card marthi-billing__plan">
          <header className="marthi-billing__plan-head">
            <h3>Plano principal</h3>
            <Link to="/admin/planos" className="btn btn--primary">
              Alterar plano
            </Link>
          </header>
          <div className="marthi-billing__plan-body">
            <div className="marthi-billing__plan-title">
              <span className={`marthi-billing__gem marthi-billing__gem--${detail.planId}`} aria-hidden />
              <div>
                <strong>{detail.planId}</strong>
                <p>
                  {detail.cancelAtPeriodEnd
                    ? `Cancelamento agendado · período até ${formatBillingDate(detail.currentPeriodEnd)}`
                    : `Próxima cobrança em ${formatBillingDate(detail.nextChargeAt)}`}
                </p>
                <p className="marthi-billing__meta">
                  {STATUS_LABEL[detail.status] || detail.status} · {formatBillingMoney(detail.amount, detail.currency)} /{' '}
                  {detail.billingCycle === 'yearly' ? 'ano' : 'mês'} · preferência {detail.paymentMethodPreference}
                </p>
              </div>
            </div>
            <div className="marthi-billing__resources">
              {(detail.modules.length ? detail.modules : ['—']).map((moduleId) => (
                <div key={moduleId} className="marthi-billing__resource">
                  <AdminIcon name="layers" />
                  <span>Módulo</span>
                  <strong>{moduleId}</strong>
                </div>
              ))}
            </div>
          </div>
          <footer className="marthi-billing__plan-foot">
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void handlePortal()}>
              Gerenciar no Stripe
            </button>
            <button
              type="button"
              className="btn btn--link marthi-billing__cancel"
              disabled={busy || detail.status === 'canceled'}
              onClick={() => void handleCancel(false)}
            >
              Cancelar assinatura
            </button>
          </footer>
        </article>
      ) : null}

      {!loading && detail && tab === 'addons' ? (
        <article className="admin-card marthi-billing__empty">
          <AdminIcon name="box" />
          <h3>Nenhum add-on ativo</h3>
          <p>
            Add-ons (módulos extras além do plano) ainda não têm catálogo separado no MarthiDB. Use os módulos da
            licença em Clientes / Planos até haver tabela de add-ons.
          </p>
        </article>
      ) : null}

      {!loading && detail && tab === 'pagamentos' ? (
        <div className="marthi-billing__stack">
          <article className="admin-card">
            <h3>Método e provedor</h3>
            <p>
              PIX automático e cartão no Brasil exigem gateway (Stripe BR, Asaas ou Mercado Pago) nas variáveis do Site.
              Enquanto isso, o recebimento Pix manual continua em Recebimentos e a liberação em Clientes.
            </p>
            <div className="marthi-toolbar">
              <label className="marthi-toolbar__field marthi-toolbar__field--grow">
                Stripe Customer ID
                <input
                  className="admin-input"
                  value={stripeCustomerId}
                  onChange={(e) => setStripeCustomerId(e.target.value)}
                  placeholder="cus_…"
                  autoComplete="off"
                />
              </label>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void handleSaveStripeCustomer()}>
                Salvar vínculo
              </button>
            </div>
          </article>
          <article className="admin-card">
            <h3>Eventos recentes</h3>
            {events.length === 0 ? (
              <p className="empty">Nenhum evento de pagamento registrado.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Tipo</th>
                      <th>Provedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>{formatBillingDate(event.createdAt)}</td>
                        <td>{event.eventType}</td>
                        <td>{event.provider}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      ) : null}

      {!loading && detail && tab === 'faturas' ? (
        <div className="marthi-billing__stack">
          <article className="admin-card">
            <h3>Registrar cobrança paga</h3>
            <p>Para mensalidades confirmadas fora do gateway (Pix manual, transferência).</p>
            <div className="marthi-toolbar">
              <label className="marthi-toolbar__field">
                Valor (R$)
                <input
                  className="admin-input"
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  inputMode="decimal"
                />
              </label>
              <label className="marthi-toolbar__field marthi-toolbar__field--grow">
                Referência / comprovante
                <input
                  className="admin-input"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="ID Pix, NSU, etc."
                />
              </label>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void handleCreatePaidInvoice()}>
                Registrar fatura paga
              </button>
            </div>
          </article>
          <article className="admin-card">
            <h3>Faturas</h3>
            {invoices.length === 0 ? (
              <p className="empty">Nenhuma fatura neste cliente.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Pago em</th>
                      <th>Método</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.description || invoice.id}</td>
                        <td>{formatBillingMoney(invoice.amount, invoice.currency)}</td>
                        <td>{invoice.status}</td>
                        <td>{formatBillingDate(invoice.paidAt)}</td>
                        <td>{invoice.paymentMethod || invoice.provider}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      ) : null}
    </section>
  );
}
