import {PickupFields} from '../../components/PickupFields';
import {TotemExternalQueue} from '../../components/TotemExternalQueue';
import { SaleAttributeFields } from '../../components/SaleAttributeFields';
import { getAttributes, hydrateAttributesFromApi, type ProductAttribute } from '../../data/attributeStore';
import './externalSale.css';
import { getActiveStore, getActiveStoreId, STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';
import {
  HeadingCancelButton,
  HeadingSaveButton,
  PageHeadingActions,
} from '../../components/PageHeadingActions';
import { useBrands, findBrand, normalizeBrand } from '../../data/brandStore';
import { useDeviceReference } from '../../data/deviceCatalog';
import { AdminPicker } from '../../components/AdminPicker';
import { CREDIT_METHOD, moneyAdjust, quotePayments, type MoneyMode, type PaymentRow } from '../../data/splitPayment';
import '../caixa/caixaPayments.css';
import { CurrencyInput } from '../../components/CurrencyInput';
import { AdminIcon } from '../../components/AdminIcons';
import {
  apiCreateExternalSale,
  apiGetSaleForEdit,
  apiUpdateExternalSale,
  apiGetSaleReceipt,
  apiListCustomers,
  apiListSellers,
  apiListStock,
  type ExternalSaleLine,
  type TradeInPayload,
} from '../../services/erpApi';
import { WarrantyReceiptModal } from '../../components/WarrantyReceiptModal';
import { CashPickupModal } from '../../components/CashPickupModal';
import { DailyPendingModal } from '../../components/DailyPendingModal';

type WarrantyType = 'store' | 'manufacturer' | 'none';
/** Texto padrão de cada tipo de garantia (o vendedor pode editar na venda). */
/** Garantia da loja: o texto acompanha o prazo em meses (6 meses = 180 dias). */
const storeWarrantyTerms = (months: number) =>
  `Garantia legal de ${Math.max(1, Math.round(months || 0)) * 30} dias balcão para defeitos de fabricação. Não cobre choques físicos, quedas ou umidade.`;
const WARRANTY_TERMS: Record<WarrantyType, string> = {
  store: storeWarrantyTerms(3),
  manufacturer: 'Garantia somente do fabricante, conforme o manual e a assistência técnica autorizada da marca. A loja não oferece garantia adicional.',
  none: 'Produto vendido sem garantia.',
};

type StockOption = {
  pickupPrices?:Record<string,number|null>;
  /** Para a busca do produto: SKU, códigos, tipo/modelo do catálogo e entradas (IMEIs, fornecedor). */
  sku?: string; barcode?: string; catalogTypeName?: string; catalogModelName?: string; supplierEntries?: SupplierEntry[];
  /** Grade de variações (preço e retirada por cor/capacidade). */
  variations?: StockVariationRow[];
  attrs?: Record<string,unknown>; color?: string; capacity?: string;
  /** Juros no cartão: 0 = com juros; N = sem juros até N parcelas. */
  interestFreeInstallments?: number;
  brand: string;
  id: string;
  name: string;
  price: number;
  cost: number;
  qty: number;
  imei: string;
  category: string;
  supplierId?: string;
  groupId?: string;
  subgroupId?: string;
};

import { QuickAddButton } from '../../components/QuickModal';
import { QuickCreateCustomer, QuickCreateSeller } from '../../components/QuickCreate';
import { ExternalSalesHistory } from '../../components/ExternalSalesHistory';
import { TradeEvaluationPanel, tradeEvaluationSummary } from '../../components/TradeEvaluationPanel';
import { CatalogOrdersQueue, catalogTradeSummary } from '../../components/CatalogOrdersQueue';
import type { CatalogOrder } from '../../services/salesCatalogApi';

import { saleLinePickupProduct, saleLineUnitPrice } from '../../data/productPickup';
import { totemCardFee } from '../../data/variantQuote';
import { hydrateCardMachinesFromApi } from '../../data/cardRatesStore';
import { hydrateTotemSettingsFromApi } from '../../data/totemSettings';
import { evaluateCampaignForLine, hydratePromoCampaigns, PROMO_EVENT, type EvaluatedLinePromo } from '../../data/promoCampaignStore';
import type { StockVariationRow, SupplierEntry } from '../../data/adminStore';
import { StockSearchPicker, type StockPick } from '../../components/StockSearchPicker';
import { QuickStockRegisterModal, type QuickStockResult } from '../../components/QuickStockRegisterModal';
import { CONDITION_ATTR_ID, CONDITION_LABEL, conditionCode } from '../../data/productCondition';
import { availableImeis, lineUnitCost, lineVariation, restoreSaleUnits } from '../../data/saleVariation';

/** Cartão de crédito: até 18 parcelas, como no totem. */
const MAX_CARD_INSTALLMENTS = 18;
const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ExternalSalePage() {
  const { user } = useAuth();
  const isPrivileged = user?.role === 'admin' || user?.role === 'superadmin';
  const canCorrectSales = isPrivileged || user?.role === 'manager';
  const [searchParams, setSearchParams] = useSearchParams();
  const editSaleId = searchParams.get('edit')?.trim() || '';

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
  // Vendedores cadastrados (Pessoas › Vendedores). Vazio = quem está logado.
  const [sellers, setSellers] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedSellerId, setSelectedSellerId] = useState('');
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
  const [quickSellerOpen, setQuickSellerOpen] = useState(false);
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
  // Desconto e acréscimo em R$ ou % (como no PDV).
  const [discountMode, setDiscountMode] = useState<MoneyMode>('money');
  const [surchargeMode, setSurchargeMode] = useState<MoneyMode>('money');

  // Upgrade / Trade-in
  const [hasTradeIn, setHasTradeIn] = useState(false);
  // Nome do aparelho do upgrade em caixa alta, igual ao cadastro de produtos.
  const [tradeUppercase, setTradeUppercase] = useState(true);
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

  // Formas de pagamento: uma ou mais (ex.: PIX + cartão 4x); a última fica com o que falta.
  const [payments, setPayments] = useState<PaymentRow[]>([{ method: CREDIT_METHOD, installments: 1, amount: 0 }]);
  const setPaymentRow = (index: number, patch: Partial<PaymentRow>) => setPayments((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const [warrantyType, setWarrantyType] = useState<WarrantyType>('store');
  const [warrantyMonths, setWarrantyMonths] = useState(3);
  const [warrantyTerms, setWarrantyTerms] = useState(WARRANTY_TERMS.store);
  const [saleNotes, setSaleNotes] = useState('');
  /** Pedido do catálogo que esta venda finaliza (sai da fila ao concluir). */
  const [catalogOrder, setCatalogOrder] = useState<{ id: string; code: string } | null>(null);

  // Correção de venda concluída: número, data, motivo e as correções anteriores.
  const [editing, setEditing] = useState<{ id: string; saleDate: string; reason: string; revisions: Array<{ id: string; reason: string; operator: string; at: string }> } | null>(null);
  /** Evita reabrir a mesma venda do ?edit= a cada refresh de catálogo. */
  const openedEditRef = useRef('');

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
        void apiListSellers(true)
          .then((rows) => storeRef.current === storeId && setSellers(rows.map((row) => ({ id: row.id, name: row.name }))))
          .catch(() => undefined);

        // Só produtos ativos: o excluído (inativado) não aparece na venda.
        const mappedStock: StockOption[] = (Array.isArray(stkRes) ? stkRes : []).filter((it: any) => it.active !== false).map(toStockOption);

        setStockItems(mappedStock);

        // A venda começa sem produto escolhido: ao escolher, a linha puxa preço, cor, capacidade e IMEI do estoque.
        setLines([{ name: '', qty: 1, unitPrice: 0, stockId: '' }]);
      } catch (err) {
        if (storeRef.current === storeId) setError(err instanceof Error ? err.message : 'Não foi possível carregar os dados da loja.');
      } finally {
        if (storeRef.current === storeId) setLoading(false);
      }
    }
    void loadData();
  }, [storeId, user?.id]);

  /** Produto da API no formato da venda externa. */
  function toStockOption(it: any): StockOption {
    return {
      id: it.id,
      name: it.name,
      price: Number(it.price) || 0,
      cost: Number(it.cost) || 0,
      qty: Number(it.qty) || 0,
      imei: it.imei || '',
      category: it.category || 'Geral',
      brand: it.brand || '',
      supplierId: it.supplierId || undefined,
      groupId: it.groupId || undefined,
      subgroupId: it.subgroupId || undefined,
      pickupPrices: it.pickupPrices,
      attrs: it.attrs, color: it.color, capacity: it.capacity,
      variations: Array.isArray(it.variations) ? it.variations : [],
      sku: it.sku || '',
      barcode: it.barcode || '',
      catalogTypeName: it.catalogTypeName || '',
      catalogModelName: it.catalogModelName || '',
      supplierEntries: Array.isArray(it.supplierEntries) ? it.supplierEntries : [],
      interestFreeInstallments: Number(it.interestFreeInstallments) || 0,
    };
  }

  /**
   * Retirada da linha: com variações, vale o preço da variação escolhida (cor, capacidade…),
   * senão só a "pronta entrega" do produto aparecia, mesmo com preço de encomenda cadastrado.
   */
  function pickupProductFor(line: { stockId?: string | null; attributes?: { id: string; value: string }[] }) {
    return saleLinePickupProduct(stockItems.find((item) => item.id === line.stockId), line.attributes ?? []);
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
      // Cliente com vendedor vinculado: a venda já vem com ele (pode trocar).
      if (found.sellerId && sellers.some((seller) => seller.id === found.sellerId)) setSelectedSellerId(found.sellerId);
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

  /**
   * Dados do produto do estoque já na linha: cor/capacidade quando só há uma opção (ou só uma
   * variação com estoque), com o preço dessa variação.
   */
  function autoFillFromProduct(prod: StockOption, forced?: StockVariationRow) {
    const variations = prod.variations ?? [];
    const inStock = variations.filter((v) => Number(v.qty) > 0);
    const chosen = forced ?? (inStock.length === 1 ? inStock[0] : variations.length === 1 ? variations[0] : undefined);
    const attributes: Array<{ id: string; name: string; value: string }> = [];
    for (const attr of attributeDefs.filter((item) => item.active && item.useOnExternalSale !== false)) {
      let values: string[] = [];
      if (chosen) {
        const value = chosen.attrs?.[attr.id];
        if (value) values = [String(value)];
      } else if (variations.length) {
        values = variations.map((v) => v.attrs?.[attr.id]).filter((v): v is string => Boolean(v));
      } else {
        const configured = prod.attrs?.[attr.id];
        const legacy = /^cor$/i.test(attr.name) ? prod.color : /^capacidade$/i.test(attr.name) ? prod.capacity : '';
        values = Array.isArray(configured) ? configured.map(String) : typeof configured === 'string' && configured ? [configured] : legacy ? [legacy] : [];
      }
      const unique = [...new Set(values.filter(Boolean))];
      if (unique.length === 1) attributes.push({ id: attr.id, name: attr.name, value: unique[0] });
    }
    // Com a variação definida (ex.: achada pelo IMEI), a condição dela também vai para a venda.
    const code = chosen ? conditionCode(chosen.condition) : '';
    if (forced && code) attributes.push({ id: CONDITION_ATTR_ID, name: 'Condição', value: CONDITION_LABEL[code] });
    return { attributes, price: chosen && Number(chosen.price) > 0 ? Number(chosen.price) : undefined };
  }

  /** IMEI da linha: o atual se ainda está em estoque nessa variação; se só há um, ele; senão, vazio. */
  function imeiFor(prod: StockOption | undefined, attributes: Array<{ id: string; value: string }>, current?: string) {
    if (!prod) return '';
    const variation = lineVariation(prod, attributes);
    if (prod.variations?.length && !variation) return '';
    const imeis = availableImeis(prod, variation);
    // Sem IMEI no cadastro, o IMEI é digitado na tela: mantém o que já foi digitado.
    if (!imeis.length) return current ?? '';
    if (current && imeis.includes(current)) return current;
    return imeis.length === 1 ? imeis[0] : '';
  }

  /** Produto escolhido na busca: pelo IMEI já vem a variação e o IMEI do aparelho. */
  function handleLinePick(index: number, pick: StockPick<StockOption>, items: StockOption[] = stockItems) {
    const prod = items.find((p) => p.id === pick.product.id) ?? pick.product;
    const auto = autoFillFromProduct(prod, pick.variation);
    setLines((prev) =>
      prev.map((l, idx) =>
        idx !== index
          ? l
          : {
              ...l,
              stockId: prod.id,
              attributes: auto.attributes,
              pickupMethodId: undefined,
              deliveryAddress: undefined,
              name: prod.name,
              unitPrice: auto.price ?? prod.price,
              unitCost: prod.cost,
              imei: pick.imei || imeiFor(prod, auto.attributes, ''),
            },
      ),
    );
  }

  // Produto não encontrado: cadastro na hora (com entrada no estoque) para não travar a venda.
  const [quickRegister, setQuickRegister] = useState<{ index: number; text: string } | null>(null);
  function handleQuickRegistered(result: QuickStockResult) {
    if (!quickRegister) return;
    const option = toStockOption(result.product);
    const items = [...stockItems.filter((item) => item.id !== option.id), option];
    setStockItems(items);
    const variation = result.variationId ? option.variations?.find((v) => v.id === result.variationId) : undefined;
    handleLinePick(quickRegister.index, { product: option, variation, imei: result.imei }, items);
    setQuickRegister(null);
  }

  /** Linha de detalhe na busca: variações, preço e estoque. */
  const describeOption = (p: StockOption) =>
    [
      ...Object.values(p.attrs ?? {}).filter((value) => typeof value === 'string' && value),
      p.variations?.length ? `${p.variations.length} variaç${p.variations.length === 1 ? 'ão' : 'ões'}` : '',
      `${formatMoney(p.price)} · disp.: ${p.qty}`,
    ]
      .filter(Boolean)
      .join(' · ');

  function handleLineProductChange(index: number, stockId: string) {
    const prod = stockItems.find((p) => p.id === stockId);
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== index) return l;
        if (!prod) return { ...l, attributes: [],pickupMethodId:undefined,deliveryAddress:undefined, stockId: '', name: '', unitPrice: 0, unitCost: 0, imei: '' };
        const auto = autoFillFromProduct(prod);
        return {
          ...l,
          stockId: prod.id,
          attributes: auto.attributes,pickupMethodId:undefined,deliveryAddress:undefined,
          name: prod.name,
          unitPrice: auto.price ?? prod.price,
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

  // Campanhas da loja (do banco), aplicadas automaticamente nos produtos que se encaixam.
  const [promoVersion, setPromoVersion] = useState(0);
  useEffect(() => {
    const changed = () => setPromoVersion((v) => v + 1);
    void hydratePromoCampaigns().catch(() => undefined);
    window.addEventListener(PROMO_EVENT, changed);
    return () => window.removeEventListener(PROMO_EVENT, changed);
  }, [storeId]);

  /** Campanha que vale para a linha na venda externa (ou null). */
  const linePromos = useMemo<Array<EvaluatedLinePromo | null>>(
    () =>
      lines.map((line) => {
        const prod = stockItems.find((p) => p.id === line.stockId);
        const qty = Number(line.qty) || 0;
        const price = Number(line.unitPrice) || 0;
        if (!prod || line.campaignOff || qty <= 0 || price <= 0) return null;
        const result = evaluateCampaignForLine(
          {
            id: prod.id,
            name: prod.name,
            supplierId: prod.supplierId,
            groupId: prod.groupId,
            subgroupId: prod.subgroupId,
            category: prod.category,
            brand: prod.brand,
            attrs: (prod.attrs ?? {}) as Record<string, string>,
          },
          qty,
          price,
          undefined,
          'external',
        );
        return result.appliedCampaign && result.discountAmount > 0 ? result : null;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, stockItems, promoVersion],
  );
  const campaignDiscount = linePromos.reduce((sum, promo) => sum + (promo?.discountAmount ?? 0), 0);
  // Campanha que existe para o produto mas o vendedor tirou da linha (para poder voltar).
  const campaignAvailable = (idx: number) => {
    const line = lines[idx];
    if (!line?.campaignOff) return false;
    const prod = stockItems.find((p) => p.id === line.stockId);
    if (!prod) return false;
    const result = evaluateCampaignForLine(
      { id: prod.id, name: prod.name, supplierId: prod.supplierId, groupId: prod.groupId, subgroupId: prod.subgroupId, category: prod.category, brand: prod.brand, attrs: (prod.attrs ?? {}) as Record<string, string> },
      Number(line.qty) || 0,
      Number(line.unitPrice) || 0,
      undefined,
      'external',
    );
    return Boolean(result.appliedCampaign && result.discountAmount > 0);
  };

  // Cálculos Financeiros
  const subtotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.qty) || 1) * (Number(l.unitPrice) || 0), 0) - campaignDiscount;
  }, [lines, campaignDiscount]);

  const totalCost = useMemo(() => {
    // Custo do aparelho/variação de cada linha (o do produto é o da primeira variação).
    return lines.reduce((sum, l) => {
      const prod = stockItems.find((item) => item.id === l.stockId);
      const unit = prod ? lineUnitCost(prod, l.attributes ?? [], String(l.imei ?? '')) : Number(l.unitCost) || 0;
      return sum + (Number(l.qty) || 1) * unit;
    }, 0);
  }, [lines, stockItems]);

  const discountValue = moneyAdjust(subtotal, Number(generalDiscount) || 0, discountMode);
  const surchargeValue = moneyAdjust(subtotal, Number(generalSurcharge) || 0, surchargeMode);
  /** Troca R$ ↔ % mantendo o mesmo valor em reais. */
  function toggleAdjMode(kind: 'discount' | 'surcharge') {
    const mode = kind === 'discount' ? discountMode : surchargeMode;
    const value = kind === 'discount' ? discountValue : surchargeValue;
    const next: MoneyMode = mode === 'money' ? 'percent' : 'money';
    const converted = next === 'percent' ? (subtotal > 0 ? Math.round((value / subtotal) * 10000) / 100 : 0) : value;
    if (kind === 'discount') {
      setDiscountMode(next);
      setGeneralDiscount(converted);
    } else {
      setSurchargeMode(next);
      setGeneralSurcharge(converted);
    }
  }
  const grossTotal = Math.max(0, subtotal - discountValue + surchargeValue);
  const tradeInCredit = hasTradeIn ? Number(tradeIn.tradeValue || 0) : 0;
  const netAmountToPay = Math.max(0, Math.round((grossTotal - tradeInCredit) * 100) / 100);

  const grossProfit = Math.round((grossTotal - totalCost) * 100) / 100;
  const marginPercent = grossTotal > 0 ? Math.round((grossProfit / grossTotal) * 10000) / 100 : 0;
  // Juros do cartão: a taxa da maquininha por número de parcelas (a mesma do totem), repassada ao cliente.
  const [, setRatesVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.allSettled([hydrateCardMachinesFromApi(), hydrateTotemSettingsFromApi()]).then(() => alive && setRatesVersion((v) => v + 1));
    return () => {
      alive = false;
    };
  }, [storeId]);
  const round2 = (value: number) => Math.round(value * 100) / 100;
  const cardRateFor = (count: number) => (count <= 1 ? 0 : Math.max(0, Number(totemCardFee(count)) || 0));
  // Só os produtos com juros neste parcelamento entram na base (produto "sem juros até N" fica de fora).
  const interestLines = lines.map((line) => ({ lineTotal: (Number(line.qty) || 1) * (Number(line.unitPrice) || 0), interestFreeInstallments: stockItems.find((item) => item.id === line.stockId)?.interestFreeInstallments }));
  const { quotes: paymentQuotes, allocated: paymentAllocated, remainder: paymentRemainder, cardInterest, totalCharged } = quotePayments(payments, netAmountToPay, interestLines, cardRateFor);
  const hasCashPayment = payments.some((row) => row.method === 'Dinheiro');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || loading || storeRef.current !== getActiveStoreId()) { setError('Aguarde o carregamento da loja ativa.'); return; }
    if (editing && editing.reason.trim().length < 3) {
      setError('Informe o motivo da correção da venda.');
      return;
    }
    if (!selectedSellerId) {
      setError(sellers.length ? 'Escolha o vendedor responsável pela venda.' : 'Cadastre o vendedor responsável em "Novo vendedor" antes de concluir a venda.');
      return;
    }
    if (lines.length === 0 || lines.some(line => !line.stockId || !line.name || Number(line.qty) <= 0)) {
      setError('Adicione ao menos um produto válido na venda.');
      return;
    }
    // Aparelho com IMEI em estoque: a linha precisa do IMEI (um por linha) para a baixa ficar vinculada.
    for (const [index, line] of lines.entries()) {
      const prod = stockItems.find((p) => p.id === line.stockId);
      if (!prod) continue;
      const variation = lineVariation(prod, line.attributes ?? []);
      if (prod.variations?.length && !variation) {
        setError(`Item ${index + 1}: escolha a cor, a capacidade e a condição disponíveis.`);
        return;
      }
      const imeis = availableImeis(prod, variation);
      if (imeis.length && !imeis.includes(String(line.imei ?? '').trim())) {
        setError(`Item ${index + 1}: escolha o IMEI do aparelho vendido.`);
        return;
      }
      if (imeis.length && Number(line.qty) !== 1) {
        setError(`Item ${index + 1}: aparelhos com IMEI são vendidos um por linha. Use "Adicionar outro produto" para o próximo.`);
        return;
      }
    }

    if (Math.abs(paymentRemainder) > 0.009) {
      return setError(paymentRemainder > 0 ? `Falta lançar ${formatMoney(paymentRemainder)} nas formas de pagamento.` : `As formas de pagamento passam do total em ${formatMoney(-paymentRemainder)}.`);
    }
    if (paymentQuotes.length > 1 && paymentQuotes.some((quote) => quote.base <= 0)) return setError('Informe o valor de cada forma de pagamento (ou remova a que sobrou).');

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        customerId: selectedCustomerId || null,
        customerName: customerName.trim() || 'Consumidor Final',
        customerPhone: customerPhone.trim(),
        customerDocument: customerDocument.trim(),
        sellerId: selectedSellerId || null,
        sellerName: (sellers.find((seller) => seller.id === selectedSellerId)?.name ?? sellerName).trim(),
        paymentMethod: paymentQuotes[0].method,
        installments: paymentQuotes[0].installments,
        payments: paymentQuotes.map((quote) => ({ method: quote.method, amount: quote.total, installments: quote.installments, cardInterest: quote.interest })),
        discount: discountValue,
        // Juros do cartão entram como acréscimo: o total da venda é o que o cliente paga.
        surcharge: round2(surchargeValue + cardInterest),
        // Separado para o comprovante do cliente mostrar só o valor combinado (os juros ficam para a loja).
        cardInterest,
        notes: [saleNotes.trim(), ...paymentQuotes.filter((quote) => quote.interest > 0).map((quote) => `Juros do cartão ${quote.installments}x (${quote.rate.toLocaleString('pt-BR')}%): ${formatMoney(quote.interest)}`)].filter(Boolean).join(' · '),
        warrantyType,
        warrantyMonths: warrantyType === 'store' ? Number(warrantyMonths) : 0,
        warrantyTerms: warrantyTerms.trim(),
        lines: lines.map((l, idx) => ({
          stockId: l.stockId || null,
          discount: linePromos[idx]?.discountAmount ?? 0,
          campaignId: linePromos[idx]?.appliedCampaign?.id,
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
        catalogOrderId: catalogOrder?.id ?? null,
      };

      const result = editing
        ? await apiUpdateExternalSale(editing.id, { ...payload, saleDate: editing.saleDate, reason: editing.reason.trim() }, storeId)
        : await apiCreateExternalSale({...payload, requestId: requestId.current}, storeId);
      setEditing(null);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('edit');
        return next;
      }, { replace: true });
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
      if (refreshed && storeRef.current === storeId) setStockItems(refreshed.filter((it: any) => it.active !== false).map(toStockOption));
    } catch (err: any) {
      setError(err.message || 'Falha ao processar venda externa.');
    } finally {
      setSubmitting(false);
    }
  }

  /** Abre a venda concluída no formulário: os aparelhos dela voltam ao estoque da tela até salvar. */
  const startEdit = useCallback(async (saleId: string) => {
    setHistoryOpen(false);
    setError('');
    try {
      const sale = await apiGetSaleForEdit(saleId, storeId);
      handleResetForm();
      // Restaura as unidades da venda no estoque da tela e usa essa lista (não o state antigo) nos custos.
      let restored: StockOption[] = [];
      setStockItems((current) => {
        restored = restoreSaleUnits(current, sale.id, sale.lines);
        return restored;
      });
      setSelectedCustomerId(sale.customerId ?? '');
      setCustomerName(sale.customerName || 'Consumidor Final');
      setCustomerPhone(sale.customerPhone);
      setCustomerDocument(sale.customerDocument);
      setSelectedSellerId(sale.sellerId ?? '');
      setLines(sale.lines.map((line) => ({
        ...line,
        unitCost: restored.find((item) => item.id === line.stockId)?.cost ?? 0,
        discount: 0,
        surcharge: 0,
      })));
      setDiscountMode('money');
      setSurchargeMode('money');
      setGeneralDiscount(sale.discount);
      setGeneralSurcharge(sale.surcharge);
      setHasTradeIn(Boolean(sale.tradeIn));
      if (sale.tradeIn) setTradeIn(sale.tradeIn);
      setPayments(sale.payments?.length ? sale.payments : [{ method: sale.paymentMethod, installments: sale.installments, amount: 0 }]);
      setWarrantyType(sale.warrantyType);
      setWarrantyMonths(sale.warrantyMonths);
      setWarrantyTerms(sale.warrantyTerms);
      setSaleNotes(sale.notes);
      setEditing({ id: sale.id, saleDate: sale.saleDate, reason: '', revisions: sale.revisions });
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('edit', sale.id);
        return next;
      }, { replace: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      openedEditRef.current = '';
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a venda para correção.');
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('edit');
        return next;
      }, { replace: true });
    }
  }, [storeId, setSearchParams]);

  /** Sai da correção sem gravar: o estoque da tela volta a ser o do banco. */
  async function cancelEdit() {
    openedEditRef.current = '';
    setEditing(null);
    handleResetForm();
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('edit');
      return next;
    }, { replace: true });
    const refreshed = await apiListStock().catch(() => null);
    if (refreshed && storeRef.current === storeId) setStockItems(refreshed.filter((it: any) => it.active !== false).map(toStockOption));
  }

  /** Cancelar do topo: sai da correção ou limpa a venda em andamento. */
  function handleCancel() {
    if (editing) {
      void cancelEdit();
      return;
    }
    handleResetForm();
  }

  // PDV / Consultar vendas: /painel/venda-externa?edit=<id> abre a venda certa (não um formulário em branco).
  useEffect(() => {
    if (!editSaleId) {
      openedEditRef.current = '';
      return;
    }
    if (loading) return;
    if (!canCorrectSales) {
      setError('Seu usuário não tem permissão para corrigir vendas externas.');
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('edit');
        return next;
      }, { replace: true });
      return;
    }
    if (editing?.id === editSaleId || openedEditRef.current === editSaleId) return;
    openedEditRef.current = editSaleId;
    void startEdit(editSaleId);
  }, [editSaleId, loading, canCorrectSales, editing?.id, startEdit, setSearchParams]);

  /** Pedido do catálogo: cliente aprovado, produtos, troca, pagamento e vendedor já na venda. */
  function attendCatalogOrder(order: CatalogOrder, customer: { id: string; name: string; phone: string; document: string; email: string }) {
    handleResetForm();
    setCatalogOrder({ id: order.id, code: order.code });
    setCustomers((list) => (list.some((c: any) => c.id === customer.id) ? list : [...list, customer]));
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    setCustomerDocument(customer.document);
    if (order.sellerId) setSelectedSellerId(order.sellerId);
    if (order.items.length) {
      setLines(
        order.items.map((line) => {
          const stock = stockItems.find((item) => item.id === line.productId);
          return {
            stockId: line.productId,
            name: line.name,
            qty: line.qty,
            unitPrice: line.price,
            unitCost: stock?.cost ?? 0,
            discount: 0,
            surcharge: 0,
            imei: '',
            attributes: line.attributes,
            pickupMethodId: line.pickupMethodId ?? undefined,
          };
        }),
      );
    }
    if (order.tradeIn) {
      const trade = order.tradeIn;
      setHasTradeIn(true);
      setTradeIn({
        deviceName: trade.device.toUpperCase(),
        imei: trade.imei,
        capacity: trade.capacity,
        color: trade.color,
        conditionState: trade.condition === 'damaged' ? 'damaged' : trade.condition === 'marks' ? 'refurbished' : 'used',
        batteryLevel: trade.battery,
        notes: `Informado pelo cliente: ${catalogTradeSummary(trade)}`.slice(0, 500),
        tradeValue: 0,
      });
    }
    if (order.payment) setPayments([{ method: order.payment, installments: order.installments || 1, amount: 0 }]);
    setSaleNotes([`Pedido do catálogo ${order.code}`, order.fulfillment === 'delivery' ? 'entrega no endereço do cliente' : '', order.notes].filter(Boolean).join(' · '));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleResetForm() {
    requestId.current = crypto.randomUUID();
    setSavedSaleId(null);
    setCatalogOrder(null);
    setLines([{ name: '', qty: 1, unitPrice: 0, stockId: '' }]);
    setSelectedCustomerId('');
    setSelectedSellerId('');
    setCustomerName('Consumidor Final');
    setCustomerPhone('');
    setCustomerDocument('');
    setGeneralDiscount(0);
    setGeneralSurcharge(0);
    setDiscountMode('money');
    setSurchargeMode('money');
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
    setPayments([{ method: CREDIT_METHOD, installments: 1, amount: 0 }]);
    setCreatedReceipt(null);
  }

  return (
    <div className="admin-page external-sale-page xsale">
      <PageHeadingActions>
        <HeadingCancelButton
          onClick={handleCancel}
          disabled={submitting || Boolean(savedSaleId)}
          label={editing ? 'Cancelar correção' : 'Cancelar'}
        />
        <HeadingSaveButton
          onClick={() => {
            const form = document.getElementById('xsale-form') as HTMLFormElement | null;
            form?.requestSubmit();
          }}
          disabled={submitting || loading || !storeId || Boolean(savedSaleId)}
          label={submitting ? 'Salvando…' : editing ? 'Salvar correção' : 'Salvar'}
        />
      </PageHeadingActions>
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
      {editing ? (
        <section className="xsale-card xsale-edit" aria-label="Correção de venda">
          <h2 className="xsale-card__title">Corrigindo a venda {editing.id}</h2>
          <p className="xsale-edit__hint">
            Altere o que estiver errado (cliente, vendedor, aparelho, IMEI, preço, troca, pagamento, data ou garantia) e salve. Estoque, financeiro e metas são refeitos com os dados corrigidos; o histórico guarda como a venda estava.
          </p>
          <div className="xsale-grid">
            <div className="xsale-field">
              <label className="admin-label" htmlFor="xsale-edit-date">Data da venda</label>
              <input id="xsale-edit-date" type="date" className="admin-input" value={editing.saleDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setEditing({ ...editing, saleDate: e.target.value })} />
            </div>
            <div className="xsale-field xsale-edit__reason">
              <label className="admin-label" htmlFor="xsale-edit-reason">Motivo da correção</label>
              <input id="xsale-edit-reason" className="admin-input" maxLength={500} placeholder="Ex.: IMEI lançado errado na planilha" value={editing.reason} onChange={(e) => setEditing({ ...editing, reason: e.target.value })} />
            </div>
          </div>
          {editing.revisions.length ? (
            <ul className="xsale-edit__history">
              {editing.revisions.map((rev) => (
                <li key={rev.id}>
                  {new Date(rev.at).toLocaleString('pt-BR')} · {rev.operator}: {rev.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {loading ? <p className="xsale-loading">Carregando catálogo e clientes…</p> : null}

      {quickRegister ? <QuickStockRegisterModal initialText={quickRegister.text} products={stockItems} onClose={() => setQuickRegister(null)} onDone={handleQuickRegistered} /> : null}
      <CatalogOrdersQueue storeId={storeId} onAttend={attendCatalogOrder} />
      {catalogOrder ? <p role="status" className="xsale-promo"><span className="xsale-promo__tag">Catálogo</span><span className="xsale-promo__text">Finalizando o pedido <strong>{catalogOrder.code}</strong> do catálogo: ao concluir, ele sai da fila.</span></p> : null}
      <TotemExternalQueue storeId={storeId} onSelect={ticket=>{const stock=stockItems.find(item=>item.id===ticket.stockId);setSelectedCustomerId('');setCustomerName(ticket.customerName);setCustomerPhone(ticket.customerPhone);setLines([{stockId:ticket.stockId||'',name:ticket.productName,qty:1,unitPrice:ticket.cashPrice??0,unitCost:stock?.cost??0,discount:0,surcharge:0,imei:stock?.imei||'',attributes:ticket.attributes,pickupMethodId:ticket.pickupMethodId,deliveryAddress:ticket.deliveryAddress,sourceTicketId:ticket.id}]);setSaleNotes(`Atendimento do Totem ${ticket.id}`);setPayments([{method:ticket.payment==='Parcelado'?CREDIT_METHOD:'PIX',installments:ticket.installment?Number(ticket.installment.replace(/\D/g,''))||1:1,amount:0}]);requestId.current=crypto.randomUUID();}}/>
      <form id="xsale-form" onSubmit={handleSubmit} className="xsale-layout">
        <div className="xsale-main">
          {/* 1. Cliente */}
          <section className="xsale-card">
            <h2 className="xsale-card__title"><span className="xsale-step">1</span> Cliente e vendedor</h2>
            <div className="xsale-grid">
              <div className="xsale-field">
                {/* Vendedor da venda (metas e comissões): só vendedores cadastrados, nunca o usuário logado por padrão. */}
                <AdminPicker
                  label="Vendedor responsável *"
                  value={selectedSellerId}
                  placeholder={sellers.length ? 'Escolha o vendedor' : 'Nenhum vendedor cadastrado'}
                  searchable={sellers.length > 6}
                  options={sellers.map((seller) => ({ value: seller.id, label: seller.name }))}
                  onChange={setSelectedSellerId}
                />
                <div className="quick-field__actions">
                  <QuickAddButton label="Novo vendedor" onClick={() => setQuickSellerOpen(true)} />
                </div>
                {quickSellerOpen ? (
                  <QuickCreateSeller
                    onClose={() => setQuickSellerOpen(false)}
                    onCreated={(seller) => {
                      setSellers((current) => [...current.filter((item) => item.id !== seller.id), { id: seller.id, name: seller.name }].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
                      setSelectedSellerId(seller.id);
                    }}
                  />
                ) : null}
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
                    initial={selectedCustomerId ? undefined : { name: customerName, phone: customerPhone, document: customerDocument }}
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
                    <StockSearchPicker
                      label="Produto"
                      items={stockItems.filter((p) => brandFilter === 'all' || normalizeBrand(p.brand) === normalizeBrand(brandFilter) || p.id === line.stockId)}
                      selected={stockItems.find((p) => p.id === line.stockId) ?? null}
                      describe={describeOption}
                      onSelect={(pick) => handleLinePick(idx, pick)}
                      onClear={() => handleLineProductChange(idx, '')}
                      onNotFound={(text) => setQuickRegister({ index: idx, text })}
                    />
                  </div>
                  <PickupFields product={pickupProductFor(line)} methodId={line.pickupMethodId} address={line.deliveryAddress} onChange={(pickupMethodId, deliveryAddress, price) => setLines((current) => current.map((entry, i) => (i === idx ? { ...entry, pickupMethodId, deliveryAddress, unitPrice: saleLineUnitPrice(stockItems.find((p) => p.id === entry.stockId), entry.attributes ?? [], pickupMethodId) ?? price ?? entry.unitPrice } : entry)))} />
                  <SaleAttributeFields surface="external" onlyInStock product={stockItems.find((p) => p.id === line.stockId)} picked={line.attributes} onChange={(attributes) => setLines((current) => current.map((entry, i) => (i === idx ? { ...entry, attributes, imei: imeiFor(stockItems.find((p) => p.id === entry.stockId), attributes, entry.imei), unitPrice: saleLineUnitPrice(stockItems.find((p) => p.id === entry.stockId), attributes, entry.pickupMethodId) ?? entry.unitPrice } : entry)))} />
                  <div>
                    <label className="admin-label">Quantidade</label>
                    <input type="number" min="1" className="admin-input" value={line.qty} onChange={(e) => handleLineFieldChange(idx, 'qty', Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="admin-label">Preço de venda (R$)</label>
                    <CurrencyInput className="admin-input" value={line.unitPrice} onChange={(value) => handleLineFieldChange(idx, 'unitPrice', value)} ariaLabel="Preço de venda" />
                  </div>
                  {(() => {
                    // IMEI do aparelho vendido: escolhido entre os que estão em estoque nesta variação (vínculo da baixa).
                    const prod = stockItems.find((p) => p.id === line.stockId);
                    const variation = lineVariation(prod, line.attributes ?? []);
                    const imeis = prod && (variation || !prod.variations?.length) ? availableImeis(prod, variation) : [];
                    if (!imeis.length) {
                      // Sem IMEI no cadastro: o vendedor digita o do aparelho (fica gravado na baixa da venda).
                      const waitingVariation = Boolean(prod?.variations?.length && !variation);
                      return (
                        <div className="external-sale-wide-field">
                          <label className="admin-label">IMEI do aparelho{waitingVariation ? '' : ' · sem IMEI no cadastro'}</label>
                          <input
                            type="text"
                            className="admin-input"
                            inputMode="numeric"
                            maxLength={20}
                            disabled={waitingVariation}
                            placeholder={waitingVariation ? 'Escolha cor e capacidade' : 'Digite o IMEI (opcional)'}
                            value={waitingVariation ? '' : line.imei || ''}
                            onChange={(e) => handleLineFieldChange(idx, 'imei', e.target.value.replace(/[^0-9A-Za-z]/g, ''))}
                          />
                        </div>
                      );
                    }
                    return (
                      <div className="external-sale-wide-field">
                        <AdminPicker
                          label={`IMEI do aparelho · ${imeis.length} em estoque`}
                          value={line.imei || ''}
                          searchable
                          placeholder="Escolha o IMEI"
                          options={imeis.map((imei) => ({ value: imei, label: imei }))}
                          onChange={(imei) => handleLineFieldChange(idx, 'imei', imei)}
                        />
                      </div>
                    );
                  })()}
                  {linePromos[idx] ? (
                    <div className="external-sale-wide-field xsale-promo" role="status">
                      <span className="xsale-promo__tag">Campanha</span>
                      <span className="xsale-promo__text">
                        <strong>{linePromos[idx]!.explanation || linePromos[idx]!.promoLabel}</strong>
                        {' '}— de {formatMoney((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))} por <strong>{formatMoney(linePromos[idx]!.lineBaseTotal)}</strong>
                      </span>
                      <button type="button" className="xsale-promo__remove" onClick={() => handleLineFieldChange(idx, 'campaignOff', true)}>
                        Não aplicar
                      </button>
                    </div>
                  ) : campaignAvailable(idx) ? (
                    <div className="external-sale-wide-field xsale-promo is-off">
                      <span className="xsale-promo__text">Campanha disponível para este produto, mas fora desta venda.</span>
                      <button type="button" className="xsale-promo__remove" onClick={() => handleLineFieldChange(idx, 'campaignOff', false)}>
                        Aplicar campanha
                      </button>
                    </div>
                  ) : null}
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
                    <input type="text" className="admin-input" placeholder="Ex.: IPHONE 15 PRO MAX USADO" value={tradeIn.deviceName} onChange={(e) => setTradeIn({ ...tradeIn, deviceName: tradeUppercase ? e.target.value.toUpperCase() : e.target.value })} required={hasTradeIn} />
                    <label className="xsale-check">
                      <input type="checkbox" checked={tradeUppercase} onChange={(e) => { setTradeUppercase(e.target.checked); if (e.target.checked) setTradeIn({ ...tradeIn, deviceName: tradeIn.deviceName.toUpperCase() }); }} />
                      Sempre em MAIÚSCULAS
                    </label>
                    {(() => {
                      // Mesma regra do servidor: produto com o mesmo nome recebe o aparelho no estoque dele.
                      const key = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(\s*trade-?in\s*\)/gi, '').toLowerCase().replace(/\s+/g, ' ').trim();
                      const typed = key(tradeIn.deviceName);
                      const existing = typed ? stockItems.find((item) => key(item.name) === typed) : undefined;
                      return existing ? (
                        <p role="status" className="xsale-promo">
                          <span className="xsale-promo__tag">Já cadastrado</span>
                          <span className="xsale-promo__text">
                            O aparelho entra no estoque de <strong>{existing.name}</strong> (sem criar outro cadastro)
                            {existing.variations?.length ? ', na variação de mesma cor e capacidade.' : '.'}
                          </span>
                        </p>
                      ) : null;
                    })()}
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
                  <div className="external-sale-wide-field">
                    <TradeEvaluationPanel
                      imei={tradeIn.imei || ''}
                      deviceName={tradeIn.deviceName}
                      customerId={selectedCustomerId || null}
                      customerName={customerName}
                      capacity={tradeIn.capacity}
                      color={tradeIn.color}
                      notes={tradeIn.notes}
                      onApproved={(evaluation) =>
                        // Preço aprovado vira o crédito; bateria e o que a oficina viu vão para o usado.
                        setTradeIn((current) => ({
                          ...current,
                          tradeValue: evaluation.approvedPrice ?? evaluation.suggestedPrice ?? current.tradeValue,
                          batteryLevel: evaluation.batteryLevel ?? current.batteryLevel,
                          conditionState: evaluation.cracked ? 'damaged' : current.conditionState,
                          notes: current.notes?.includes('Avaliação da oficina:') ? current.notes : [current.notes, `Avaliação da oficina: ${tradeEvaluationSummary(evaluation)}`].filter(Boolean).join(' · ').slice(0, 500),
                        }))
                      }
                    />
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
                  <div>
                    <label className="admin-label">Bateria (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      className="admin-input"
                      placeholder="Ex.: 87"
                      value={tradeIn.batteryLevel ?? ''}
                      onChange={(e) => setTradeIn({ ...tradeIn, batteryLevel: e.target.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(e.target.value)))) })}
                    />
                  </div>
                  <div className="external-sale-wide-field">
                    <label className="admin-label">Observação do aparelho</label>
                    <textarea
                      className="admin-input"
                      rows={2}
                      maxLength={500}
                      placeholder="Ex.: troca de tela, risco na lateral… (vai para a observação do estoque)"
                      value={tradeIn.notes || ''}
                      onChange={(e) => setTradeIn({ ...tradeIn, notes: e.target.value })}
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
                  {campaignDiscount > 0 ? <div><small>Desconto de campanha</small><strong>- {formatMoney(campaignDiscount)}</strong></div> : null}
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
              {/* Formas de pagamento no padrão do PDV (o parcelamento continua o da venda externa, com o valor das parcelas). */}
              <section className="pdv-split xsale-split" aria-label="Formas de pagamento">
                <div className="pdv-split__head">
                  <h3>Formas de pagamento</h3>
                  <button
                    type="button"
                    className="pdv-split__add"
                    disabled={payments.length >= 6}
                    title="Dividir o pagamento em outra forma (ex.: PIX + cartão)"
                    onClick={() =>
                      // A forma que estava ficando com o restante passa a ter esse valor fixo; a nova fica com o que faltar.
                      setPayments((rows) => [
                        ...rows.map((row, i) => (i === rows.length - 1 ? { ...row, amount: paymentQuotes[i]?.base ?? 0, touched: true } : row)),
                        { method: 'PIX', installments: 1, amount: 0 },
                      ])
                    }
                  >
                    + Forma
                  </button>
                </div>
                <ul className="pdv-split__rows">
                  {paymentQuotes.map((quote, index) => {
                    const multiple = paymentQuotes.length > 1;
                    const missing = paymentRemainder > 0.005 ? paymentRemainder : 0;
                    return (
                      <li key={index} className={`pdv-split__row${quote.method === 'Dinheiro' ? ' is-cash' : ''}`}>
                        <div className={`pdv-split__main${multiple ? ' is-multi' : ''}`}>
                          <AdminPicker
                            label={index === 0 ? 'Pagamento' : `Forma ${index + 1}`}
                            value={quote.method}
                            options={[
                              { value: 'Cartão de Crédito', label: 'Crédito' },
                              { value: 'Cartão de Débito', label: 'Débito' },
                              { value: 'PIX', label: 'PIX' },
                              { value: 'Dinheiro', label: 'Dinheiro (sem caixa)' },
                              { value: 'Transferência Bancária', label: 'Transferência / TED' },
                            ]}
                            onChange={(val) => setPaymentRow(index, { method: val, installments: val === CREDIT_METHOD ? payments[index].installments : 1 })}
                          />
                          <label className="pdv-split__amount">
                            Valor
                            <CurrencyInput
                              className="admin-input"
                              value={quote.base}
                              placeholder="0,00"
                              ariaLabel={`Valor em ${quote.method}`}
                              onChange={(value) => setPaymentRow(index, { amount: value, touched: true })}
                            />
                          </label>
                          {multiple ? (
                            <button
                              type="button"
                              className="pdv-split__drop xsale-split__drop"
                              aria-label={`Remover ${quote.method}`}
                              title="Remover forma"
                              onClick={() => setPayments((rows) => rows.filter((_, i) => i !== index))}
                            >
                              ×
                            </button>
                          ) : null}
                        </div>
                        {missing > 0 ? (
                          <button type="button" className="pdv-split__rest" onClick={() => setPaymentRow(index, { amount: round2(quote.base + missing), touched: true })}>
                            Jogar o restante aqui ({formatMoney(missing)})
                          </button>
                        ) : null}
                        {quote.method === CREDIT_METHOD ? (
                          <AdminPicker
                            label="Parcelamento"
                            value={String(quote.installments)}
                            options={Array.from({ length: MAX_CARD_INSTALLMENTS }, (_, i) => {
                              const count = i + 1;
                              const option = quotePayments([{ method: CREDIT_METHOD, installments: count, amount: 0 }], quote.base, interestLines, cardRateFor).quotes[0];
                              return {
                                value: String(count),
                                label:
                                  count === 1
                                    ? `1x à vista (${formatMoney(quote.base)})`
                                    : `${count}x de ${formatMoney(option.perInstallment)} · total ${formatMoney(option.total)}${option.rate > 0 ? ` (${option.rate.toLocaleString('pt-BR')}%)` : ' sem juros'}`,
                              };
                            })}
                            onChange={(val) => setPaymentRow(index, { installments: Number(val) })}
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                <div className="pdv-split__status">
                  <span>
                    Lançado <strong>{formatMoney(paymentAllocated)}</strong>
                  </span>
                  {paymentRemainder > 0.005 ? (
                    <span className="is-warn">
                      Falta <strong>{formatMoney(paymentRemainder)}</strong>
                    </span>
                  ) : paymentRemainder < -0.005 ? (
                    <span className="is-warn">
                      Excede <strong>{formatMoney(-paymentRemainder)}</strong>
                    </span>
                  ) : (
                    <span className="is-ok">Pagamento fechado</span>
                  )}
                </div>
              </section>
              {hasCashPayment ? (
                <p className="xsale-warn">
                  <strong>Recebimento sem caixa:</strong> a parte em dinheiro fica registrada e fica na loja até o recolhimento.
                </p>
              ) : null}
              {/* Desconto e acréscimo em R$ ou %, como no PDV (o % é sobre o valor dos produtos). */}
              <div className="xsale-grid xsale-grid--2">
                <label className="xsale-adj">
                  <span className="admin-label">Desc.</span>
                  <span className="xsale-adj__input">
                    {discountMode === 'percent' ? (
                      <input className="admin-input" type="number" min={0} max={100} step="0.01" inputMode="decimal" value={generalDiscount || ''} placeholder="0" aria-label="Desconto em %" onChange={(e) => setGeneralDiscount(Math.max(0, Number(e.target.value) || 0))} />
                    ) : (
                      <CurrencyInput className="admin-input" value={generalDiscount} onChange={setGeneralDiscount} ariaLabel="Desconto em R$" />
                    )}
                    <button type="button" className="xsale-adj__toggle" title="Alternar R$ / %" onClick={() => toggleAdjMode('discount')}>
                      {discountMode === 'percent' ? '%' : 'R$'}
                    </button>
                  </span>
                  {discountMode === 'percent' && discountValue > 0 ? <small className="xsale-muted">= {formatMoney(discountValue)}</small> : null}
                </label>
                <label className="xsale-adj">
                  <span className="admin-label">Acr.</span>
                  <span className="xsale-adj__input">
                    {surchargeMode === 'percent' ? (
                      <input className="admin-input" type="number" min={0} step="0.01" inputMode="decimal" value={generalSurcharge || ''} placeholder="0" aria-label="Acréscimo em %" onChange={(e) => setGeneralSurcharge(Math.max(0, Number(e.target.value) || 0))} />
                    ) : (
                      <CurrencyInput className="admin-input" value={generalSurcharge} onChange={setGeneralSurcharge} ariaLabel="Acréscimo em R$" />
                    )}
                    <button type="button" className="xsale-adj__toggle" title="Alternar R$ / %" onClick={() => toggleAdjMode('surcharge')}>
                      {surchargeMode === 'percent' ? '%' : 'R$'}
                    </button>
                  </span>
                  {surchargeMode === 'percent' && surchargeValue > 0 ? <small className="xsale-muted">= {formatMoney(surchargeValue)}</small> : null}
                </label>
              </div>
              <div className={warrantyType === 'store' ? 'xsale-grid xsale-grid--2' : 'xsale-stack'}>
                <AdminPicker
                  label="Garantia"
                  value={warrantyType}
                  options={[
                    { value: 'store', label: 'Garantia da loja' },
                    { value: 'manufacturer', label: 'Somente do fabricante' },
                    { value: 'none', label: 'Sem garantia' },
                  ]}
                  onChange={(value) => {
                    const next = value as WarrantyType;
                    // Troca o texto padrão junto, a menos que o vendedor já tenha escrito o dele.
                    if (Object.values(WARRANTY_TERMS).includes(warrantyTerms) || warrantyTerms === storeWarrantyTerms(warrantyMonths) || !warrantyTerms.trim()) {
                      setWarrantyTerms(next === 'store' ? storeWarrantyTerms(warrantyMonths) : WARRANTY_TERMS[next]);
                    }
                    setWarrantyType(next);
                  }}
                />
                {warrantyType === 'store' ? (
                  <div>
                    <label className="admin-label">Prazo (meses)</label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      className="admin-input"
                      value={warrantyMonths}
                      onChange={(e) => {
                        const months = Number(e.target.value);
                        // Os termos acompanham o prazo: texto padrão é refeito; texto próprio só troca o "N dias".
                        const oldDays = Math.max(1, Math.round(warrantyMonths || 0)) * 30;
                        const newDays = Math.max(1, Math.round(months || 0)) * 30;
                        if (warrantyTerms === storeWarrantyTerms(warrantyMonths) || !warrantyTerms.trim()) setWarrantyTerms(storeWarrantyTerms(months));
                        else if (months > 0) setWarrantyTerms(warrantyTerms.replace(new RegExp(`\\b${oldDays}\\s+dias\\b`, 'i'), `${newDays} dias`));
                        setWarrantyMonths(months);
                      }}
                    />
                  </div>
                ) : null}
              </div>
              <div>
                <label className="admin-label">Termos da garantia</label>
                <input type="text" className="admin-input" value={warrantyTerms} onChange={(e) => setWarrantyTerms(e.target.value)} />
              </div>
              <div>
                <label className="admin-label">Observações</label>
                <input type="text" className="admin-input" placeholder="Ex.: entregue com película 3D aplicada" value={saleNotes} onChange={(e) => setSaleNotes(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="xsale-card xsale-total">
            <small>Total da venda</small>
            <strong className="xsale-total__value">{formatMoney(totalCharged)}</strong>
            {paymentQuotes.map((quote, index) => (
              <span key={index} className="xsale-muted">
                {paymentQuotes.length > 1 ? `${quote.method}: ${formatMoney(quote.total)}` : quote.method}
                {quote.installments > 1 ? ` · ${quote.installments}x de ${formatMoney(quote.perInstallment)}` : paymentQuotes.length > 1 ? '' : ' · à vista'}
              </span>
            ))}
            {cardInterest > 0 ? (
              <span className="xsale-muted">
                Inclui juros do cartão de {formatMoney(cardInterest)}
                {paymentQuotes
                  .filter((quote) => quote.interest > 0)
                  .map((quote) => ` (${quote.rate.toLocaleString('pt-BR')}% em ${quote.installments}x)`)
                  .join('')}
                {interestLines.some((line) => Number(line.interestFreeInstallments) > 0) ? ' · produtos sem juros neste parcelamento ficam de fora' : ''}
              </span>
            ) : null}
            {isPrivileged ? (
              <div className="xsale-profit" title="Visível só para gerente e dono">
                <span>🔒 Resultado</span>
                <span>Custo <strong>{formatMoney(totalCost)}</strong></span>
                <span>Lucro <strong className="xsale-good">{formatMoney(grossProfit)}</strong></span>
                <span>Margem <strong className="xsale-good">{marginPercent}%</strong></span>
              </div>
            ) : null}
          </section>
        </aside>
      </form>

      {savedSaleId && !createdReceipt ? (
        <div className="xsale-card xsale-done">
          <p>Venda {savedSaleId} já gravada.</p>
          <button type="button" className="btn btn--primary" onClick={handleResetForm}>Iniciar nova venda</button>
        </div>
      ) : null}
      {historyOpen ? <ExternalSalesHistory onClose={() => setHistoryOpen(false)} onEdit={canCorrectSales ? (saleId) => void startEdit(saleId) : undefined} /> : null}
      {createdReceipt ? <WarrantyReceiptModal receipt={createdReceipt} onClose={handleResetForm} onNewSale={handleResetForm} /> : null}
      {showPickupModal ? (
        <CashPickupModal onClose={() => setShowPickupModal(false)} onSuccess={() => alert('Recolhimento registrado com sucesso no financeiro!')} />
      ) : null}
      {showPendingModal ? (
        <DailyPendingModal onClose={() => setShowPendingModal(false)} onOpenPickupModal={() => setShowPickupModal(true)} />
      ) : null}
    </div>
  );
}
