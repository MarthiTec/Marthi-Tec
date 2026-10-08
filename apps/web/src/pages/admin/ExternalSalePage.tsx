import {PickupFields} from '../../components/PickupFields';
import {TotemExternalQueue} from '../../components/TotemExternalQueue';
import { SaleAttributeFields } from '../../components/SaleAttributeFields';
import { getAttributes, hydrateAttributesFromApi, type ProductAttribute } from '../../data/attributeStore';
import './externalSale.css';
import { getActiveStore, getActiveStoreId, STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useBrands, findBrand, normalizeBrand } from '../../data/brandStore';
import { useDeviceReference } from '../../data/deviceCatalog';
import { AdminPicker } from '../../components/AdminPicker';
import { CurrencyInput } from '../../components/CurrencyInput';
import { AdminIcon } from '../../components/AdminIcons';
import {
  apiCreateExternalSale,
  apiGetSaleReceipt,
  apiListCustomers,
  apiListStock,
  type ExternalSaleLine,
  type TradeInPayload,
} from '../../services/erpApi';
import { WarrantyReceiptModal } from '../../components/WarrantyReceiptModal';
import { CashPickupModal } from '../../components/CashPickupModal';
import { DailyPendingModal } from '../../components/DailyPendingModal';

type StockOption = {
  pickupPrices?:Record<string,number|null>;
  /** Grade de variações (preço e retirada por cor/capacidade). */
  variations?: StockVariationRow[];
  attrs?: Record<string,unknown>; color?: string; capacity?: string;
  brand: string;
  id: string;
  name: string;
  price: number;
  cost: number;
  qty: number;
  imei: string;
  category: string;
};

import { QuickAddButton } from '../../components/QuickModal';
import { QuickCreateCustomer } from '../../components/QuickCreate';
import { ExternalSalesHistory } from '../../components/ExternalSalesHistory';

import { selectProductVariation } from '../../data/productPickup';
import type { StockItem, StockVariationRow } from '../../data/adminStore';

/** Cartão de crédito: até 18 parcelas, como no totem. */
const MAX_CARD_INSTALLMENTS = 18;
const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ExternalSalePage() {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'superadmin';

  const [storeId, setStoreId] = useState(getActiveStoreId);
  const storeRef = useRef(storeId);
  storeRef.current = storeId;
  const activeStore = getActiveStore();
  useEffect(() => {
    const changed = () => { setStoreId(getActiveStoreId()); setCreatedReceipt(null); setShowPickupModal(false); setShowPendingModal(false); setSavedSaleId(null); requestId.current = crypto.randomUUID(); };
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
  }, []);

  // Estados Base
  const [customers, setCustomers] = useState<any[]>([]);
  const [stockItems, setStockItems] = useState<StockOption[]>([]);
  const [attributeDefs,setAttributeDefs]=useState<ProductAttribute[]>([]);
  useEffect(()=>{let disposed=false;setAttributeDefs([]);void hydrateAttributesFromApi().then(()=>{if(!disposed)setAttributeDefs(getAttributes().filter(a=>a.active&&a.useOnStock));});return()=>{disposed=true;};},[storeId]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Vendedor
  const sellerName = user?.name || '';

  // Cliente
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customerName, setCustomerName] = useState('Consumidor Final');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');

  // Itens da Venda
  const [lines, setLines] = useState<ExternalSaleLine[]>([
    {
      stockId: '',
      name: '',
      qty: 1,
      unitPrice: 0,
      unitCost: 0,
      discount: 0,
      surcharge: 0,
      imei: '',
    },
  ]);

  const { brands, error: brandsError } = useBrands();
  const [brandFilter, setBrandFilter] = useState('all');

  // Desconto / Acréscimo Geral
  const [generalDiscount, setGeneralDiscount] = useState(0);
  const [generalSurcharge, setGeneralSurcharge] = useState(0);

  // Upgrade / Trade-in
  const [hasTradeIn, setHasTradeIn] = useState(false);
  const [tradeIn, setTradeIn] = useState<TradeInPayload>({
    deviceName: '',
    imei: '',
    capacity: '',
    color: '',
    conditionState: 'used',
    notes: '',
    tradeValue: 0,
  });

  const { device: tradeDevice, loading: tradeLoading, error: tradeError } = useDeviceReference(hasTradeIn ? tradeIn.deviceName : '');
  useEffect(() => {
    if (!tradeDevice) return;
    const brand = findBrand(brands.filter(b => b.active), tradeDevice.brand);
    if (brand) setTradeIn(current => current.brand ? current : { ...current, brand: brand.slug });
  }, [tradeDevice, brands]);

  // Forma de Pagamento e Parcelas
  const [paymentMethod, setPaymentMethod] = useState('Cartão de Crédito');
  const [installments, setInstallments] = useState(1);
  const [warrantyMonths, setWarrantyMonths] = useState(3);
  const [warrantyTerms, setWarrantyTerms] = useState(
    'Garantia legal de 90 dias balcão para defeitos de fabricação. Não cobre choques físicos, quedas ou umidade.',
  );
  const [saleNotes, setSaleNotes] = useState('');

  // Modais de Sucesso, Recolhimento e Pendências
  const requestId = useRef(crypto.randomUUID());
  const [savedSaleId, setSavedSaleId] = useState<string | null>(null);
  const [createdReceipt, setCreatedReceipt] = useState<any>(null);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError('');
      setCustomers([]);
      setStockItems([]);
      setSelectedCustomerId('');
      setCustomerName('Consumidor Final');
      setCustomerPhone('');
      setCustomerDocument('');
      setLines([{ name: '', qty: 1, unitPrice: 0, stockId: '' }]);
      try {
        const [custRes, stkRes] = await Promise.all([
          apiListCustomers(),
          apiListStock(),
        ]);

        if (storeRef.current !== storeId) return;
        setCustomers(Array.isArray(custRes) ? custRes : []);

        const mappedStock: StockOption[] = (Array.isArray(stkRes) ? stkRes : []).map((it: any) => ({
          id: it.id,
          name: it.name,
          price: Number(it.price) || 0,
          cost: Number(it.cost) || 0,
          qty: Number(it.qty) || 0,
          imei: it.imei || '',
          category: it.category || 'Geral',
          brand: it.brand || '',
          pickupPrices: it.pickupPrices,
          attrs: it.attrs, color: it.color, capacity: it.capacity,
          variations: Array.isArray(it.variations) ? it.variations : [],
        }));

        setStockItems(mappedStock);

        // Se houver produtos no estoque, pré-seleciona o primeiro
        if (mappedStock.length > 0) {
          const first = mappedStock[0];
          setLines([
            {
              stockId: first.id,
              name: first.name,
              qty: 1,
              unitPrice: first.price,
              unitCost: first.cost,
              discount: 0,
              surcharge: 0,
              imei: first.imei,
            },
          ]);
        }
      } catch (err) {
        if (storeRef.current === storeId) setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados da loja.');
      } finally {
        if (storeRef.current === storeId) setLoading(false);
      }
    }
    void loadData();
  }, [storeId, user?.id]);

  /**
   * Retirada da linha: com variações, vale o preço da variação escolhida (cor, capacidade…),
   * senão só a "pronta entrega" do produto aparecia, mesmo com preço de encomenda cadastrado.
   */
  function pickupProductFor(line: { stockId?: string | null; attributes?: { id: string; value: string }[] }) {
    const stock = stockItems.find((item) => item.id === line.stockId);
    if (!stock?.variations?.length) return stock;
    const variation = selectProductVariation(stock as unknown as StockItem, Object.fromEntries((line.attributes ?? []).map((attr) => [attr.id, attr.value])));
    if (!variation) return stock;
    const pickupPrices = variation.pickupMethodId ? { [variation.pickupMethodId]: variation.price } : variation.pickupPrices ?? {};
    return { ...stock, price: variation.price, pickupPrices };
  }

  function handleSelectCustomer(val: string) {
    setSelectedCustomerId(val);
    if (!val) {
      setCustomerName('Consumidor Final');
      setCustomerPhone('');
      setCustomerDocument('');
      return;
    }
    const found = customers.find((c) => c.id === val);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone || '');
      setCustomerDocument(found.document || '');
    }
  }

  function handleAddLine() {
    setLines((prev) => [
      ...prev,
      {
        stockId: '',
        name: '',
        qty: 1,
        unitPrice: 0,
        unitCost: 0,
        discount: 0,
        surcharge: 0,
        imei: '',
      },
    ]);
  }

  function handleRemoveLine(index: number) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleLineProductChange(index: number, stockId: string) {
    const prod = stockItems.find((p) => p.id === stockId);
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== index) return l;
        if (!prod) return { ...l, attributes: [],pickupMethodId:undefined,deliveryAddress:undefined, stockId: '', name: '', unitPrice: 0, unitCost: 0, imei: '' };
        return {
          ...l,
          stockId: prod.id,
          attributes: [],pickupMethodId:undefined,deliveryAddress:undefined,
          name: prod.name,
          unitPrice: prod.price,
          unitCost: prod.cost,
          imei: prod.imei || '',
        };
      }),
    );
  }

  function handleLineFieldChange(index: number, field: keyof ExternalSaleLine, val: any) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== index) return l;
        return { ...l, [field]: val };
      }),
    );
  }

  // Cálculos Financeiros
  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.qty) || 1) * (Number(l.unitPrice) || 0), 0);
  }, [lines]);

  const totalCost = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.qty) || 1) * (Number(l.unitCost) || 0), 0);
  }, [lines]);

  const grossTotal = Math.max(0, subtotal - Number(generalDiscount || 0) + Number(generalSurcharge || 0));
  const tradeInCredit = hasTradeIn ? Number(tradeIn.tradeValue || 0) : 0;
  const netAmountToPay = Math.max(0, Math.round((grossTotal - tradeInCredit) * 100) / 100);

  const grossProfit = Math.round((grossTotal - totalCost) * 100) / 100;
  const marginPercent = grossTotal > 0 ? Math.round((grossProfit / grossTotal) * 10000) / 100 : 0;
  const installmentValue = installments > 0 ? Math.round((netAmountToPay / installments) * 100) / 100 : netAmountToPay;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || loading || storeRef.current !== getActiveStoreId()) { setError('Aguarde o carregamento da loja ativa.'); return; }
    if (lines.length === 0 || lines.some(line => !line.stockId || !line.name || Number(line.qty) <= 0)) {
      setError('Adicione ao menos um produto válido na venda.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        customerId: selectedCustomerId || null,
        customerName: customerName.trim() || 'Consumidor Final',
        customerPhone: customerPhone.trim(),
        customerDocument: customerDocument.trim(),
        sellerId: null,
        sellerName: sellerName.trim(),
        paymentMethod,
        installments: Number(installments) || 1,
        discount: Number(generalDiscount) || 0,
        surcharge: Number(generalSurcharge) || 0,
        notes: saleNotes.trim(),
        warrantyMonths: Number(warrantyMonths),
        warrantyTerms: warrantyTerms.trim(),
        lines: lines.map((l) => ({
          stockId: l.stockId || null,
          pickupMethodId:l.pickupMethodId,deliveryAddress:l.deliveryAddress,
          sourceTicketId:l.sourceTicketId,
          attributes: l.attributes ?? [],
          name: l.name.trim(),
          qty: Number(l.qty) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          unitCost: Number(l.unitCost) || 0,
          imei: l.imei || '',
        })),
        tradeIn: hasTradeIn && tradeIn.tradeValue > 0 ? tradeIn : null,
      };

      const result = await apiCreateExternalSale({...payload, requestId: requestId.current}, storeId);
      if (!result?.id) throw new Error('A API não confirmou a gravação da venda.');
      if (storeRef.current === storeId) setSavedSaleId(result.id);
      // Never reconstruct the receipt from browser caches or fixed company data.
      try {
        const receipt = await apiGetSaleReceipt(result.id, storeId);
        if (storeRef.current === storeId) setCreatedReceipt(receipt);
      } catch {
        if (storeRef.current === storeId) setError('Venda ' + result.id + ' salva. O comprovante não carregou; consulte a venda antes de tentar novamente.');
      }
      const refreshed = await apiListStock().catch(() => null);
      if (refreshed && storeRef.current === storeId) setStockItems(refreshed.map((it: any) => ({ ...it, qty: Number(it.qty), price: Number(it.price), cost: Number(it.cost) })));
    } catch (err: any) {
      setError(err.message || 'Falha ao processar venda externa.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleResetForm() {
    requestId.current = crypto.randomUUID();
    setSavedSaleId(null);
    setLines([
      {
        stockId: stockItems[0]?.id || '',
        name: stockItems[0]?.name || '',
        qty: 1,
        unitPrice: stockItems[0]?.price || 0,
        unitCost: stockItems[0]?.cost || 0,
        discount: 0,
        surcharge: 0,
        imei: stockItems[0]?.imei || '',
      },
    ]);
    setSelectedCustomerId('');
    setCustomerName('Consumidor Final');
    setCustomerPhone('');
    setCustomerDocument('');
    setGeneralDiscount(0);
    setGeneralSurcharge(0);
    setHasTradeIn(false);
    setTradeIn({
      deviceName: '',
      imei: '',
      capacity: '',
      color: '',
      conditionState: 'used',
      notes: '',
      tradeValue: 0,
    });
    setPaymentMethod('Cartão de Crédito');
    setInstallments(1);
    setCreatedReceipt(null);
  }

  return (
    <div className="admin-page external-sale-page xsale">
      <header className="xsale-head">
        <div className="xsale-head__info">
          <h1>
            <span className="xsale-head__icon" aria-hidden>
              <AdminIcon name="cart" />
            </span>
            Venda externa
            <span className="xsale-chip">{activeStore?.tradeName || 'Loja ativa'}</span>
          </h1>
          <p>Venda sem abrir o caixa, com baixa no estoque, financeiro e metas na hora.</p>
        </div>
        <div className="xsale-head__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setHistoryOpen(true)}>
            <AdminIcon name="receipt" /> Vendas realizadas
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setShowPendingModal(true)}>
            <AdminIcon name="ops" /> Pendências do dia
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setShowPickupModal(true)}>
            <AdminIcon name="dollar" /> Recolhimento
          </button>
        </div>
      </header>

      {error ? <div className="xsale-alert" role="alert">{error}</div> : null}
      {loading ? <p className="xsale-loading">Carregando catálogo e clientes…</p> : null}

      <TotemExternalQueue storeId={storeId} onSelect={ticket=>{const stock=stockItems.find(item=>item.id===ticket.stockId);setSelectedCustomerId('');setCustomerName(ticket.customerName);setCustomerPhone(ticket.customerPhone);setLines([{stockId:ticket.stockId||'',name:ticket.productName,qty:1,unitPrice:ticket.cashPrice??0,unitCost:stock?.cost??0,discount:0,surcharge:0,imei:stock?.imei||'',attributes:ticket.attributes,pickupMethodId:ticket.pickupMethodId,deliveryAddress:ticket.deliveryAddress,sourceTicketId:ticket.id}]);setSaleNotes(`Atendimento do Totem ${ticket.id}`);setPaymentMethod(ticket.payment==='Parcelado'?'Cartão de Crédito':'PIX');setInstallments(ticket.installment?Number(ticket.installment.replace(/\D/g,''))||1:1);requestId.current=crypto.randomUUID();}}/>
      <form onSubmit={handleSubmit} className="xsale-layout">
        <div className="xsale-main">
          {/* 1. Cliente */}
          <section className="xsale-card">
            <h2 className="xsale-card__title"><span className="xsale-step">1</span> Cliente e vendedor</h2>
            <div className="xsale-grid">
              <div className="xsale-field">
                <label className="admin-label">Vendedor responsável</label>
                <input type="text" className="admin-input" value={sellerName} readOnly placeholder="Nome do responsável pela venda" required />
              </div>
              <div className="xsale-field">
                <AdminPicker
                  label="Cliente cadastrado"
                  value={selectedCustomerId}
                  options={[
                    { value: '', label: 'Consumidor final (sem cadastro)' },
                    ...customers.map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` })),
                  ]}
                  onChange={handleSelectCustomer}
                />
                <div className="quick-field__actions">
                  <QuickAddButton label="Novo cliente" onClick={() => setQuickCustomerOpen(true)} />
                </div>
                {quickCustomerOpen ? (
                  <QuickCreateCustomer
                    onClose={() => setQuickCustomerOpen(false)}
                    onCreated={(customer) => {
                      setCustomers((current) => [customer, ...current.filter((item) => item.id !== customer.id)]);
                      setSelectedCustomerId(customer.id);
                      setCustomerName(customer.name);
                      setCustomerPhone(customer.phone || '');
                      setCustomerDocument(customer.document || '');
                    }}
                  />
                ) : null}
              </div>
              <div className="xsale-field">
                <label className="admin-label">Nome do cliente</label>
                <input type="text" className="admin-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome do cliente" required />
              </div>
              <div className="xsale-field">
                <label className="admin-label">WhatsApp / telefone</label>
                <input type="text" className="admin-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="DDD e número" />
              </div>
              <div className="xsale-field">
                <label className="admin-label">CPF (opcional, para o recibo)</label>
                <input type="text" className="admin-input" value={customerDocument} onChange={(e) => setCustomerDocument(e.target.value)} placeholder="000.000.000-00" />
              </div>
            </div>
          </section>

          {/* 2. Produtos */}
          <section className="xsale-card">
            <div className="xsale-card__head">
              <h2 className="xsale-card__title"><span className="xsale-step">2</span> Produtos</h2>
              <div className="xsale-card__tools">
                <AdminPicker label="Filtrar por marca" value={brandFilter} options={[{ value: 'all', label: 'Todas as marcas' }, ...brands.map((b) => ({ value: b.slug, label: b.name }))]} onChange={setBrandFilter} />
                <Link className="xsale-link" to="/painel/especificacoes?aba=marcas">Gerenciar marcas</Link>
              </div>
            </div>
            {brandsError ? <p role="alert" className="xsale-alert">{brandsError}</p> : null}
            <div className="xsale-lines">
              {lines.map((line, idx) => (
                <div key={idx} className="xsale-line external-sale-line">
                  <div className="xsale-line__head">
                    <span className="xsale-line__index">Item {idx + 1}</span>
                    {lines.length > 1 || line.stockId ? (
                      <button type="button" className="xsale-line__remove" onClick={() => handleRemoveLine(idx)} title="Remover item" aria-label={`Remover item ${idx + 1}`}>
                        <AdminIcon name="trash" />
                      </button>
                    ) : null}
                  </div>
                  <div className="external-sale-wide-field">
                    <AdminPicker
                      label="Produto"
                      value={line.stockId || ''}
                      options={[
                        { value: '', label: 'Selecione um produto do estoque…' },
                        ...stockItems.filter((p) => brandFilter === 'all' || normalizeBrand(p.brand) === normalizeBrand(brandFilter) || p.id === line.stockId).map((p) => ({
                          value: p.id,
                          label: [p.name, ...Object.values(p.attrs ?? {}).filter((value) => typeof value === 'string' && value), `${formatMoney(p.price)} (disp.: ${p.qty})`].join(' · '),
                        })),
                      ]}
                      onChange={(val) => handleLineProductChange(idx, val)}
                    />
                  </div>
                  <PickupFields product={pickupProductFor(line)} methodId={line.pickupMethodId} address={line.deliveryAddress} onChange={(pickupMethodId, deliveryAddress, price) => setLines((current) => current.map((entry, i) => (i === idx ? { ...entry, pickupMethodId, deliveryAddress, unitPrice: price ?? entry.unitPrice } : entry)))} />
                  <SaleAttributeFields surface="external" product={stockItems.find((p) => p.id === line.stockId)} picked={line.attributes} onChange={(attributes) => setLines((current) => current.map((entry, i) => (i === idx ? { ...entry, attributes } : entry)))} />
                  <div>
                    <label className="admin-label">Quantidade</label>
                    <input type="number" min="1" className="admin-input" value={line.qty} onChange={(e) => handleLineFieldChange(idx, 'qty', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="admin-label">Preço de venda (R$)</label>
                    <CurrencyInput className="admin-input" value={line.unitPrice} onChange={(value) => handleLineFieldChange(idx, 'unitPrice', value)} ariaLabel="Preço de venda" />
                  </div>
                  <div>
                    <label className="admin-label">IMEI (se houver)</label>
                    <input type="text" className="admin-input" placeholder="3542…" value={line.imei || ''} onChange={(e) => handleLineFieldChange(idx, 'imei', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn--ghost xsale-add" onClick={handleAddLine}>
              <AdminIcon name="plus" /> Adicionar outro produto
            </button>
          </section>

          {/* 3. Troca */}
          <section className={`xsale-card${hasTradeIn ? ' is-highlight' : ''}`}>
            <div className="xsale-card__head">
              <div>
                <h2 className="xsale-card__title"><span className="xsale-step">3</span> Troca de aparelho usado <small>(opcional)</small></h2>
                <p className="xsale-muted">
                  Use na entrega imediata: ao concluir, o usado entra no estoque. Se o cliente fica com o usado enquanto
                  aguarda uma encomenda, não registre a troca aqui.
                </p>
              </div>
              <button type="button" className={hasTradeIn ? 'btn btn--primary' : 'btn btn--ghost'} onClick={() => setHasTradeIn(!hasTradeIn)}>
                {hasTradeIn ? '✓ Troca incluída' : '+ Incluir aparelho usado'}
              </button>
            </div>

            {hasTradeIn ? (
              <>
                <div className="external-sale-trade-fields">
                  <div className="external-sale-wide-field">
                    <label className="admin-label">Aparelho entregue pelo cliente</label>
                    <input type="text" className="admin-input" placeholder="Ex.: iPhone 15 Pro Max usado" value={tradeIn.deviceName} onChange={(e) => setTradeIn({ ...tradeIn, deviceName: e.target.value })} required={hasTradeIn} />
                  </div>
                  <div className="external-sale-wide-field">
                    <AdminPicker label="Marca do aparelho recebido" value={tradeIn.brand || ''} options={[{ value: '', label: 'Selecionar marca' }, ...brands.filter((b) => b.active).map((b) => ({ value: b.slug, label: b.name }))]} onChange={(brand) => setTradeIn({ ...tradeIn, brand })} />
                    {tradeLoading ? <p role="status" className="xsale-muted">Consultando modelo…</p> : null}
                    {tradeError ? <p role="status" className="xsale-muted">{tradeError}</p> : null}
                    {tradeDevice ? (
                      <p className="xsale-muted">
                        Modelo identificado: <strong>{tradeDevice.model}</strong> ·{' '}
                        <a href={tradeDevice.sourceUrl} target="_blank" rel="noreferrer">Especificações do fabricante</a>
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="admin-label">IMEI do aparelho entregue</label>
                    <input type="text" className="admin-input" placeholder="3589…" value={tradeIn.imei} onChange={(e) => setTradeIn({ ...tradeIn, imei: e.target.value })} />
                  </div>
                  <div>
                    <AdminPicker
                      label="Capacidade"
                      value={tradeIn.capacity || ''}
                      options={tradeDevice ? tradeDevice.capacities : (attributeDefs.find((a) => /capac|armazen/i.test(a.name))?.values ?? []).map((value) => ({ value, label: value }))}
                      onChange={(val) => setTradeIn({ ...tradeIn, capacity: val })}
                    />
                  </div>
                  <div>
                    {tradeDevice ? (
                      <AdminPicker label="Cor" value={tradeIn.color || ''} options={tradeDevice.colors} onChange={(color) => setTradeIn({ ...tradeIn, color })} />
                    ) : (
                      <>
                        <label className="admin-label" htmlFor="trade-in-color">Cor</label>
                        <input id="trade-in-color" className="admin-input" placeholder="Cor do aparelho recebido" value={tradeIn.color || ''} onChange={(e) => setTradeIn({ ...tradeIn, color: e.target.value })} />
                      </>
                    )}
                  </div>
                  <div>
                    <AdminPicker
                      label="Estado de conservação"
                      value={tradeIn.conditionState || 'used'}
                      options={[
                        { value: 'used', label: 'Usado - excelente estado' },
                        { value: 'refurbished', label: 'Recondicionado / marcas de uso' },
                        { value: 'damaged', label: 'Avariado / peças' },
                      ]}
                      onChange={(val: any) => setTradeIn({ ...tradeIn, conditionState: val })}
                    />
                  </div>
                  <div className="external-sale-wide-field">
                    <label className="admin-label xsale-accent">Valor combinado pelo usado / crédito (R$)</label>
                    <CurrencyInput className="admin-input xsale-input-accent" value={tradeIn.tradeValue || 0} placeholder="Ex.: 4.000,00" onChange={(value) => setTradeIn({ ...tradeIn, tradeValue: value })} ariaLabel="Valor combinado pelo usado" />
                    <p className="xsale-muted">
                      Informe o valor depois da avaliação. O preço de um aparelho igual no mercado é só referência.
                    </p>
                  </div>
                </div>
                <div className="xsale-trade-sum">
                  <div><small>Produto novo</small><strong>{formatMoney(grossTotal)}</strong></div>
                  <div><small>Crédito do usado</small><strong className="xsale-accent">- {formatMoney(tradeInCredit)}</strong></div>
                  <div><small>Saldo a pagar</small><strong className="xsale-accent xsale-big">{formatMoney(netAmountToPay)}</strong></div>
                </div>
              </>
            ) : null}
          </section>
        </div>

        {/* 4. Pagamento e resumo (fica fixo ao lado no computador) */}
        <aside className="xsale-side">
          <section className="xsale-card">
            <h2 className="xsale-card__title"><span className="xsale-step">4</span> Pagamento</h2>
            <div className="xsale-stack">
              <AdminPicker
                label="Meio de pagamento"
                value={paymentMethod}
                options={[
                  { value: 'Cartão de Crédito', label: 'Cartão de crédito' },
                  { value: 'Cartão de Débito', label: 'Cartão de débito' },
                  { value: 'PIX', label: 'PIX (chave da loja)' },
                  { value: 'Dinheiro', label: 'Dinheiro (sem caixa)' },
                  { value: 'Transferência Bancária', label: 'Transferência / TED' },
                ]}
                onChange={(val) => setPaymentMethod(val)}
              />
              {paymentMethod === 'Cartão de Crédito' ? (
                <AdminPicker
                  label="Parcelamento"
                  value={String(installments)}
                  options={Array.from({ length: MAX_CARD_INSTALLMENTS }, (_, index) => {
                    const count = index + 1;
                    return { value: String(count), label: count === 1 ? `1x à vista (${formatMoney(netAmountToPay)})` : `${count}x de ${formatMoney(netAmountToPay / count)}` };
                  })}
                  onChange={(val) => setInstallments(Number(val))}
                />
              ) : null}
              {paymentMethod === 'Dinheiro' ? (
                <p className="xsale-warn">
                  <strong>Recebimento sem caixa:</strong> a venda fica registrada e o dinheiro fica na loja até o recolhimento.
                </p>
              ) : null}
              <div className="xsale-grid xsale-grid--2">
                <div>
                  <label className="admin-label">Desconto (R$)</label>
                  <CurrencyInput className="admin-input" value={generalDiscount} onChange={setGeneralDiscount} ariaLabel="Desconto" />
                </div>
                <div>
                  <label className="admin-label">Acréscimo (R$)</label>
                  <CurrencyInput className="admin-input" value={generalSurcharge} onChange={setGeneralSurcharge} ariaLabel="Acréscimo" />
                </div>
              </div>
              <div className="xsale-grid xsale-grid--2">
                <div>
                  <label className="admin-label">Garantia (meses)</label>
                  <input type="number" min="0" max="24" className="admin-input" value={warrantyMonths} onChange={(e) => setWarrantyMonths(Number(e.target.value))} />
                </div>
                <div>
                  <label className="admin-label">Termos da garantia</label>
                  <input type="text" className="admin-input" value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="admin-label">Observações</label>
                <input type="text" className="admin-input" placeholder="Ex.: entregue com película 3D aplicada" value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="xsale-card xsale-total">
            <small>Total da venda</small>
            <strong className="xsale-total__value">{formatMoney(netAmountToPay)}</strong>
            <span className="xsale-muted">
              {paymentMethod} {installments > 1 ? `· ${installments}x de ${formatMoney(installmentValue)}` : '· à vista'}
            </span>
            {isPrivileged ? (
              <div className="xsale-profit" title="Visível só para gerente e dono">
                <span>🔒 Resultado</span>
                <span>Custo <strong>{formatMoney(totalCost)}</strong></span>
                <span>Lucro <strong className="xsale-good">{formatMoney(grossProfit)}</strong></span>
                <span>Margem <strong className="xsale-good">{marginPercent}%</strong></span>
              </div>
            ) : null}
            <button type="submit" className="btn btn--primary xsale-submit" disabled={submitting || loading || !storeId || Boolean(savedSaleId)}>
              {submitting ? 'Gravando venda…' : '✓ Concluir venda'}
            </button>
          </section>
        </aside>
      </form>

      {savedSaleId && !createdReceipt ? (
        <div className="xsale-card xsale-done">
          <p>Venda {savedSaleId} já gravada.</p>
          <button type="button" className="btn btn--primary" onClick={handleResetForm}>Iniciar nova venda</button>
        </div>
      ) : null}
      {historyOpen ? <ExternalSalesHistory onClose={() => setHistoryOpen(false)} /> : null}
      {createdReceipt ? <WarrantyReceiptModal receipt={createdReceipt} onClose={() => setCreatedReceipt(null)} onNewSale={handleResetForm} /> : null}
      {showPickupModal ? (
        <CashPickupModal onClose={() => setShowPickupModal(false)} onSuccess={() => alert('Recolhimento registrado com sucesso no financeiro!')} />
      ) : null}
      {showPendingModal ? (
        <DailyPendingModal onClose={() => setShowPendingModal(false)} onOpenPickupModal={() => setShowPickupModal(true)} />
      ) : null}
    </div>
  );
}
