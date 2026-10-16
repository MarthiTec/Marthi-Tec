import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { QuickCreateCustomer } from '../../components/QuickCreate';
import { QuickAddButton } from '../../components/QuickModal';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminState, type Customer, type StockItem } from '../../data/adminStore';
import { hydrateCardMachinesFromApi } from '../../data/cardRatesStore';
import { MAX_CALCULATOR_INSTALLMENTS } from '../../data/installmentCalculator';
import { getActiveStoreId, STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { createPosQuote } from '../../data/posQuotesStore';
import { buildQuickQuote, quickQuoteMessage, type MarginMode } from '../../data/quickQuote';
import { hydrateTotemSettingsFromApi } from '../../data/totemSettings';
import { totemCardFee } from '../../data/variantQuote';
import './installmentCalculator.css';
import './quickQuote.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const percent = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
const PARCELS = Array.from({ length: MAX_CALCULATOR_INSTALLMENTS }, (_, index) => index + 1);

/** Último custo de entrada do produto (o mais recente entre o produto e suas variações). */
function lastEntryCost(item: StockItem) {
  const entries = [...(item.supplierEntries ?? []), ...(item.variations ?? []).flatMap((variation) => variation.supplierEntries ?? [])]
    .filter((entry) => Number(entry.unitCost) > 0)
    .sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)));
  return Number(entries[0]?.unitCost) || Number(item.cost) || 0;
}

const todayBr = () => new Date().toLocaleDateString('pt-BR');
const endOfToday = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
};

/**
 * Cotação rápida (PDV): o preço do fornecedor muda várias vezes no dia e o cliente está na frente.
 * Custo de agora + margem (% ou R$) → preço à vista; menos o aparelho na troca → quanto o cliente paga;
 * no cartão, a taxa da maquininha da loja vai para o cliente. Formalizada, vira um orçamento válido hoje.
 */
export function QuickQuotePage() {
  const { user } = useAuth();
  const [storeId, setStoreId] = useState(getActiveStoreId);
  const [ratesReady, setRatesReady] = useState(false);
  const [stockId, setStockId] = useState('');
  const [device, setDevice] = useState('');
  const [cost, setCost] = useState(0);
  const [marginMode, setMarginMode] = useState<MarginMode>('percent');
  const [margin, setMargin] = useState(0);
  const [withTradeIn, setWithTradeIn] = useState(false);
  const [tradeInDevice, setTradeInDevice] = useState('');
  const [tradeIn, setTradeIn] = useState(0);
  const [parcels, setParcels] = useState(10);
  const [copied, setCopied] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>(() => getAdminState().customers.filter((item) => item.active));
  const [customerId, setCustomerId] = useState('');
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');

  useEffect(() => {
    const changed = () => setStoreId(getActiveStoreId());
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
  }, []);

  useEffect(() => {
    let alive = true;
    setRatesReady(false);
    void Promise.allSettled([hydrateCardMachinesFromApi(), hydrateTotemSettingsFromApi()]).then(() => alive && setRatesReady(true));
    return () => {
      alive = false;
    };
  }, [storeId]);

  const products = useMemo(() => getAdminState().stock.filter((item) => item.kind !== 'supply'), [storeId]);
  const rates = useMemo(() => (ratesReady ? PARCELS.map((count) => Math.max(0, Number(totemCardFee(count)) || 0)) : []), [ratesReady, storeId]);
  const quote = useMemo(
    () => buildQuickQuote({ cost, marginMode, margin, tradeIn: withTradeIn ? tradeIn : 0 }, rates),
    [cost, marginMode, margin, withTradeIn, tradeIn, rates],
  );
  const card = quote.installments[parcels - 1];
  const hasRates = rates.some((rate) => rate > 0);
  const ready = cost > 0 && device.trim().length > 0;

  function pickProduct(id: string) {
    setStockId(id);
    const item = products.find((product) => product.id === id);
    if (!item) return;
    setDevice(item.name);
    setCost(lastEntryCost(item));
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(quickQuoteMessage({ device, quote, parcels, tradeInDevice: withTradeIn ? tradeInDevice : '', validUntil: todayBr() }));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function formalize() {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return setError('Escolha o cliente ou cadastre um novo.');
    setSaving(true);
    setError('');
    try {
      const plan = [
        `À vista (Pix/dinheiro): ${money(quote.cashPrice)}`,
        ...(quote.tradeIn > 0 ? [`Aparelho na troca: - ${money(quote.tradeIn)} · Cliente paga ${money(quote.toPay)}`] : []),
        ...(quote.toPay > 0 ? [`Cartão: ${card.parcels}x de ${money(card.installment)} (total ${money(card.total)})`] : []),
      ].join(' · ');
      const address = [customer.street, customer.number, customer.neighborhood, customer.city && `${customer.city}/${customer.state}`, customer.zipCode].filter(Boolean).join(', ');
      const saved = await createPosQuote({
        customerId: customer.id,
        customerName: customer.name,
        customerDocument: customer.document,
        customerPhone: customer.phone,
        customerEmail: customer.email,
        customerAddress: address,
        sellerName: user?.name,
        validityDays: 1,
        expiresAt: endOfToday(),
        paymentConditions: plan,
        notes: [
          withTradeIn && quote.tradeIn > 0 ? `Aparelho do cliente na troca${tradeInDevice.trim() ? `: ${tradeInDevice.trim()}` : ''}, avaliado em ${money(quote.tradeIn)}.` : '',
          `Preço válido somente hoje (${todayBr()}): o valor do fornecedor muda ao longo do dia.`,
        ].filter(Boolean).join(' '),
        discount: quote.tradeIn,
        discountMode: 'money',
        lines: [
          {
            stockId,
            sku: '',
            name: device.trim(),
            unit: 'UN',
            qty: 1,
            basePrice: quote.cashPrice,
            unitPrice: quote.cashPrice,
            lineDiscount: 0,
            lineDiscountMode: 'money',
            lineSurcharge: 0,
            lineSurchargeMode: 'money',
            total: quote.cashPrice,
            isAdHoc: !stockId,
            itemType: stockId ? 'product' : 'ad_hoc',
          },
        ],
        actorName: user?.name || 'Operador',
      });
      setCreated(`Orçamento nº ${saved.quoteNumber} gerado para ${customer.name}, válido até hoje.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gerar o orçamento.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page installment-calc quick-quote">
      <header className="installment-calc__head">
        <h1>Cotação rápida</h1>
        <p>Preço do fornecedor de agora + sua margem. Com aparelho na troca, o desconto sai na hora; no cartão, a taxa da maquininha vai para o cliente.</p>
      </header>

      {ratesReady && !hasRates ? (
        <p className="installment-calc__alert" role="status">
          Nenhuma taxa de cartão cadastrada: o parcelamento sai sem juros. Cadastre em <Link to="/painel/taxas-cartao">Taxas & Maquininhas</Link>.
        </p>
      ) : null}

      <div className="installment-calc__layout">
        <section className="admin-card installment-calc__card" aria-label="Dados da cotação">
          <AdminPicker
            label="Produto do estoque (opcional)"
            value={stockId}
            placeholder="Escolher para puxar nome e último custo…"
            options={[{ value: '', label: 'Digitar o aparelho' }, ...products.map((item) => ({ value: item.id, label: item.name }))]}
            onChange={pickProduct}
          />
          <label className="admin-field">
            Aparelho
            <input className="admin-input" value={device} maxLength={160} placeholder="Ex.: iPhone 16 Pro 256GB Preto" onChange={(event) => setDevice(event.target.value)} />
          </label>
          <div className="installment-calc__inputs">
            <label className="admin-field">
              Preço do fornecedor (agora)
              <CurrencyInput value={cost} onChange={setCost} ariaLabel="Preço do fornecedor" />
            </label>
            <div className="admin-field">
              <span>Margem</span>
              <div className="quick-quote__margin">
                <div className="quick-quote__switch" role="radiogroup" aria-label="Tipo de margem">
                  {(['percent', 'money'] as const).map((mode) => (
                    <button key={mode} type="button" role="radio" aria-checked={marginMode === mode} className={marginMode === mode ? 'is-active' : ''} onClick={() => setMarginMode(mode)}>
                      {mode === 'percent' ? '%' : 'R$'}
                    </button>
                  ))}
                </div>
                <CurrencyInput value={margin} onChange={setMargin} ariaLabel={marginMode === 'percent' ? 'Margem em percentual' : 'Margem em reais'} />
              </div>
            </div>
          </div>

          <label className="quick-quote__check">
            <input type="checkbox" checked={withTradeIn} onChange={(event) => setWithTradeIn(event.target.checked)} />
            Cliente vai dar um aparelho na troca (upgrade)
          </label>
          {withTradeIn ? (
            <div className="installment-calc__inputs">
              <label className="admin-field">
                Aparelho do cliente
                <input className="admin-input" value={tradeInDevice} maxLength={160} placeholder="Ex.: iPhone 13 128GB" onChange={(event) => setTradeInDevice(event.target.value)} />
              </label>
              <label className="admin-field">
                Valor avaliado
                <CurrencyInput value={tradeIn} onChange={setTradeIn} ariaLabel="Valor do aparelho na troca" />
              </label>
            </div>
          ) : null}

          <dl className="installment-calc__result">
            <div className="installment-calc__highlight">
              <dt>À vista (Pix/dinheiro)</dt>
              <dd>{money(quote.cashPrice)}</dd>
            </div>
            <div>
              <dt>{quote.tradeIn > 0 ? 'Cliente paga (com a troca)' : 'Cliente paga'}</dt>
              <dd>{money(quote.toPay)}</dd>
            </div>
            <div>
              <dt>No cartão</dt>
              <dd>{quote.toPay > 0 ? `${card.parcels}x de ${money(card.installment)}` : '—'}</dd>
            </div>
            <div className="quick-quote__profit">
              <dt>Você ganha</dt>
              <dd>
                {money(quote.profit)} <small>{percent(quote.markupPercent)} sobre o custo · {percent(quote.marginOnPricePercent)} da venda</small>
              </dd>
            </div>
          </dl>

          <button type="button" className="btn btn--ghost" disabled={!ready} onClick={() => void copyMessage()}>
            {copied ? 'Copiado ✓' : 'Copiar para o WhatsApp do cliente'}
          </button>

          <section className="quick-quote__formalize" aria-label="Formalizar">
            <h2>Formalizar para o cliente</h2>
            <div className="quick-field">
              <AdminPicker
                label="Cliente"
                value={customerId}
                placeholder="Escolher cliente…"
                options={customers.map((item) => ({ value: item.id, label: item.phone ? `${item.name} · ${item.phone}` : item.name }))}
                onChange={setCustomerId}
              />
              <div className="quick-field__actions">
                <QuickAddButton label="Novo cliente" onClick={() => setQuickCustomerOpen(true)} />
              </div>
            </div>
            {quickCustomerOpen ? (
              <QuickCreateCustomer
                onClose={() => setQuickCustomerOpen(false)}
                onCreated={(customer) => {
                  setCustomers((current) => [customer, ...current.filter((item) => item.id !== customer.id)]);
                  setCustomerId(customer.id);
                }}
              />
            ) : null}
            {error ? <p className="qty-low" role="alert">{error}</p> : null}
            {created ? (
              <p className="quick-quote__done" role="status">
                {created} <Link to="/painel/orcamentos">Ver orçamentos</Link>
              </p>
            ) : null}
            <button type="button" className="btn btn--primary" disabled={!ready || saving} onClick={() => void formalize()}>
              {saving ? 'Gerando…' : 'Gerar orçamento (válido hoje)'}
            </button>
          </section>
        </section>

        <section className="admin-card installment-calc__card" aria-label="Parcelas no cartão">
          <h2>Cartão sobre {money(quote.toPay)}</h2>
          <div className="installment-calc__table" role="table">
            <div className="installment-calc__row installment-calc__row--head" role="row">
              <span role="columnheader">Parcelas</span>
              <span role="columnheader">Taxa</span>
              <span role="columnheader">Parcela</span>
              <span role="columnheader">Total</span>
            </div>
            {quote.installments.map((row) => (
              <button key={row.parcels} type="button" role="row" className={`installment-calc__row${row.parcels === parcels ? ' is-selected' : ''}`} onClick={() => setParcels(row.parcels)}>
                <span role="cell">{row.parcels}x</span>
                <span role="cell">{percent(row.ratePercent)}</span>
                <span role="cell">{money(row.installment)}</span>
                <span role="cell">{money(row.total)}</span>
              </button>
            ))}
          </div>
          <p className="installment-calc__note">
            Taxas da maquininha em <Link to="/painel/taxas-cartao">Taxas & Maquininhas</Link>. Toque numa linha para usar no texto e no orçamento.
          </p>
        </section>
      </div>
    </div>
  );
}
