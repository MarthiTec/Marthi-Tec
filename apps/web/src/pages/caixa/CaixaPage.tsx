import {PickupFields} from '../../components/PickupFields';
import type {DeliveryAddress} from '../../data/pickup';
import { SaleAttributeFields } from '../../components/SaleAttributeFields';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { BrandLogo } from '../../components/BrandLogo';
import { StoreSwitcher } from '../../components/StoreSwitcher';
import { ExitOrLogoutDialog } from '../../components/ExitOrLogoutDialog';
import { ModuleMenuButton } from '../../components/ModuleMenuButton';
import { UserChip } from '../../components/UserChip';
import { CurrencyInput } from '../../components/CurrencyInput';
import { OsEcosystemMenu } from '../os/OsEcosystemMenu';
import { OperatorProfilePanel } from '../../components/OperatorProfilePanel';
import { useAuth } from '../../contexts/AuthContext';
import { registerWorkOrderPayment, logWorkOrderActivity } from '../../data/osStore';
import {
  applyPriceTable,
  attachOrderCashSession,
  closePosSale,
  findStockByCode,
  findStockMatches,
  getAdminState,
  isWeighedUnit,
  normalizeSaleQty,
  parsePriceLabel,
  stockItemImages,
  type Customer,
  type StockItem,
  type StockUnit,
} from '../../data/adminStore';
import {
  listOpenCashierTickets,
  markTicketImported,
  POS_QUEUE_EVENT,
  ticketVariation,
  type QueueTicket,
} from '../../data/posQueueStore';
import {
  getOpenCashSession,
  openCashDrawer,
  registerCashSale,
  type CashSession,
} from '../../data/cashRegisterStore';
import {
  CASH_SETTINGS_EVENT,
  getCashSettings,
  isAdHocEnabledForTerminal,
  readScaleKg,
  verifyDeleteItemPassword,
} from '../../data/cashSettings';
import {
  listSellers,
  userCanCancelItem,
  userCanCancelSale,
  userIsStoreAdmin,
  userCanLaunchAdHoc,
} from '../../data/erpRegistry';
import { logAudit } from '../../data/auditLog';
import {
  evaluateCampaignForLine,
  PROMO_EVENT,
} from '../../data/promoCampaignStore';
import {
  markQuoteConverted,
  POS_QUOTES_EVENT,
  type PosQuote,
} from '../../data/posQuotesStore';
import { QuoteCommercialPrintModal } from '../../components/QuoteCommercialPrintModal';
import {
  clearCompletedDraftSale,
  deleteDraftSale,
  generateSaleLocalId,
  getPosTerminalId,
  listActiveDraftSales,
  saveDraftSale,
  type PosDraftSale,
} from '../../data/posDraftStore';
import { emitNfeFromSale, emitSaleCheckoutDocument, FISCAL_KIND_LABEL } from '../../data/fiscalDocuments';
import { hasDemoAccess } from '../../data/demoLeadStore';
import { hasModule } from '../../data/storePlan';
import { getTotemSettings } from '../../data/totemSettings';
import { enqueueKitchenOrder } from '../../data/kitchenOrderStore';
import { usePresenceSession } from '../../hooks/usePresence';
import { usePanelTheme } from '../../hooks/usePanelTheme';
import { CaixaPanelHost, type CaixaPanel } from './CaixaPanels';
import { CaixaPaymentSplit } from './CaixaPaymentSplit';
import {
  createSplit,
  describeSplit,
  isVoucherPayment,
  roundMoney,
  summarizeSplit,
  syncSingleSplit,
  type SplitPayment,
} from './paymentSplit';
import { useStoreCustomization } from '../../data/storeSegment';
import '../admin/admin.css';
import './caixa.css';

const CONSUMIDOR_FINAL = 'Consumidor Final';

function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCpf(value: string) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let dig = (sum * 10) % 11;
  if (dig === 10) dig = 0;
  if (dig !== Number(cpf[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  dig = (sum * 10) % 11;
  if (dig === 10) dig = 0;
  return dig === Number(cpf[10]);
}

type MoneyMode = 'money' | 'percent';

type CartLine = {
  pickupMethodId?:string;deliveryAddress?:DeliveryAddress;sourceTicketId?:string;
  attributes?: Array<{id:string;name:string;value:string}>;
  key: string;
  stockId: string;
  name: string;
  sku: string;
  imei: string;
  qty: number;
  unit: StockUnit;
  basePrice: number;
  unitPrice: number;
  priceTableId: string;
  lineDiscount: number;
  lineDiscountMode: MoneyMode;
  lineSurcharge: number;
  lineSurchargeMode: MoneyMode;
  /** Se o preço unitário foi fixado (ex: carregado de Orçamento Comercial) */
  isFrozenPrice?: boolean;
  /** Preço resultante da tabela antes de promoções */
  tablePrice?: number;
  /** Campanha aplicada (faixa / brinde / regra). */
  promoLabel?: string;
  promoExplanation?: string;
  campaignId?: string;
  /** Venda Avulsa: produto ou serviço rápido sem cadastro e sem movimentação de estoque */
  isAdHoc?: boolean;
  itemType?: 'product' | 'ad_hoc';
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moneyAdj(base: number, value: number, mode: MoneyMode) {
  if (!value) return 0;
  if (mode === 'percent') return Math.round(((base * value) / 100) * 100) / 100;
  return Math.round(value * 100) / 100;
}

function lineKey(item: StockItem, scannedImei: boolean) {
  return scannedImei && item.imei ? `imei:${item.imei}` : `stk:${item.id}`;
}

/** Aceita `12*`, `12*SKU`, `12x SKU`, `1,5x código`. */
function parseCodeInput(raw: string): { qty: number | null; code: string; waitingForCode: boolean } {
  const trimmed = raw.trim();
  const onlyQty = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*[\*xX×]\s*$/);
  if (onlyQty) {
    const qty = Number(onlyQty[1].replace(',', '.'));
    return {
      qty: Number.isFinite(qty) && qty > 0 ? qty : null,
      code: '',
      waitingForCode: true,
    };
  }
  const withCode = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*[\*xX×]\s*(.+)$/);
  if (withCode) {
    const qty = Number(withCode[1].replace(',', '.'));
    return {
      qty: Number.isFinite(qty) && qty > 0 ? qty : null,
      code: withCode[2].trim(),
      waitingForCode: false,
    };
  }
  return { qty: null, code: trimmed, waitingForCode: false };
}

function formatQty(qty: number, unit: StockUnit) {
  if (isWeighedUnit(unit)) {
    return qty.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }
  return String(Math.round(qty));
}

function formatPendingQty(qty: number) {
  return Number.isInteger(qty)
    ? String(qty)
    : qty.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

export function CaixaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  usePresenceSession('caixa');
  const { isDark } = usePanelTheme();
  const operatorName = user?.name ?? 'Operador';
  const [exitOpen, setExitOpen] = useState(false);
  const initial = getAdminState();
  const [customers, setCustomers] = useState(initial.customers);
  const [stock, setStock] = useState(initial.stock);
  const tables = initial.priceTables.filter((item) => item.active);
  const payments = useMemo(() => {
    const list = getAdminState().payments.filter((item) => item.active);
    if (list.some((item) => isVoucherPayment(item))) return list;
    return [
      ...list,
      {
        id: 'PAY-VC',
        name: 'Vale Crédito',
        type: 'other' as const,
        priceTableId: tables[0]?.id ?? 'TAB-VISTA',
        maxInstallments: 1,
        active: true,
      },
    ];
  }, [tables]);
  const [code, setCode] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState(CONSUMIDOR_FINAL);
  const [customerPhone, setCustomerPhone] = useState('');
  const [walkIn, setWalkIn] = useState(true);
  const [customerPickOpen, setCustomerPickOpen] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [deletePrompt, setDeletePrompt] = useState<{ key: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [cancelSalePrompt, setCancelSalePrompt] = useState(false);
  const [cancelSalePassword, setCancelSalePassword] = useState('');
  const [askCpf, setAskCpf] = useState(false);
  const [customerCpf, setCustomerCpf] = useState('');
  const [clientPanelOpen, setClientPanelOpen] = useState(false);
  const defaultPayment = payments[0];
  const [splits, setSplits] = useState<SplitPayment[]>(() => [
    createSplit(defaultPayment?.id ?? ''),
  ]);
  /** Enquanto o operador não rateia, a única forma acompanha o total sozinha. */
  const [splitTouched, setSplitTouched] = useState(false);
  const [defaultTableId, setDefaultTableId] = useState(
    defaultPayment?.priceTableId && tables.some((item) => item.id === defaultPayment.priceTableId)
      ? defaultPayment.priceTableId
      : (tables[0]?.id ?? ''),
  );
  const [discount, setDiscount] = useState(0);
  const [discountMode, setDiscountMode] = useState<MoneyMode>('money');
  const [surcharge, setSurcharge] = useState(0);
  const [surchargeMode, setSurchargeMode] = useState<MoneyMode>('money');
  const [sellerId, setSellerId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastOrderAmount, setLastOrderAmount] = useState(0);
  const [lastChange, setLastChange] = useState(0);
  const [lastCustomerName, setLastCustomerName] = useState('');
  const [cashSession, setCashSession] = useState<CashSession | null>(() => getOpenCashSession());
  const [panel, setPanel] = useState<CaixaPanel>(null);
  const [exchangeOrderId, setExchangeOrderId] = useState<string | null>(null);
  const [opsMenuOpen, setOpsMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerFlash, setDrawerFlash] = useState<string | null>(null);
  const [lineAdjKey, setLineAdjKey] = useState<string | null>(null);
  const [lineTableKey, setLineTableKey] = useState<string | null>(null);
  const [cashSettings, setCashSettings] = useState(() => getCashSettings());
  const [totemQueue, setTotemQueue] = useState<QueueTicket[]>(() => listOpenCashierTickets());
  const [customerPrefill, setCustomerPrefill] = useState<{ name?: string; phone?: string } | undefined>(undefined);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [linkedOsId, setLinkedOsId] = useState<string | null>(null);
  const [linkedQuoteId, setLinkedQuoteId] = useState<string | null>(null);
  const [printQuote, setPrintQuote] = useState<PosQuote | null>(null);
  const [autoPrintQuote, setAutoPrintQuote] = useState(false);
  const [currentLocalId, setCurrentLocalId] = useState<string>(() => generateSaleLocalId());
  const [recoveredDrafts, setRecoveredDrafts] = useState<PosDraftSale[]>([]);
  const [selectedRecoveryDraft, setSelectedRecoveryDraft] = useState<PosDraftSale | null>(null);
  const [recoveryPromptOpen, setRecoveryPromptOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    function onQueueUpdate() {
      setTotemQueue(listOpenCashierTickets());
    }
    window.addEventListener(POS_QUEUE_EVENT, onQueueUpdate);
    return () => window.removeEventListener(POS_QUEUE_EVENT, onQueueUpdate);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function checkForDraft() {
      if (location.state) return;
      try {
        const terminalId = getPosTerminalId();
        const drafts = await listActiveDraftSales(terminalId);
        if (isMounted && drafts.length > 0) {
          setRecoveredDrafts(drafts);
          setSelectedRecoveryDraft(drafts[0]);
          setRecoveryPromptOpen(true);
        }
      } catch (err) {
        console.error('[CaixaPage] Erro ao buscar vendas em andamento no IndexedDB:', err);
      }
    }
    void checkForDraft();
    return () => {
      isMounted = false;
    };
  }, [location.state]);

  function handleConfirmRecovery(draft: PosDraftSale) {
    setCurrentLocalId(draft.localId);
    setLines(draft.lines as CartLine[]);
    if (draft.customer) {
      setCustomerId(draft.customer.id || '');
      setCustomerName(draft.customer.name || CONSUMIDOR_FINAL);
      setCustomerPhone(draft.customer.phone || '');
      setCustomerCpf(draft.customer.document || '');
      setAskCpf(Boolean(draft.customer.askCpf));
      setWalkIn(Boolean(draft.customer.walkIn));
    }
    if (draft.sellerId) setSellerId(draft.sellerId);
    if (draft.defaultTableId) setDefaultTableId(draft.defaultTableId);
    setDiscount(draft.discount || 0);
    setDiscountMode(draft.discountMode || 'money');
    setSurcharge(draft.surcharge || 0);
    setSurchargeMode(draft.surchargeMode || 'money');
    if (draft.splits && draft.splits.length) {
      setSplits(
        draft.splits.map((s) => ({
          key: s.key || `split-${Math.random().toString(36).slice(2, 7)}`,
          methodId: s.methodId,
          amount: Number(s.amount) || 0,
          installments: Math.max(1, Number(s.installments) || 1),
          tendered: Number(s.tendered) || 0,
        })),
      );
      setSplitTouched(Boolean(draft.splitTouched));
    }
    if (draft.linkedOsId) setLinkedOsId(draft.linkedOsId);
    if (draft.linkedQuoteId) setLinkedQuoteId(draft.linkedQuoteId);

    setRecoveryPromptOpen(false);
    setSelectedRecoveryDraft(null);
    setRecoveredDrafts([]);
    setMessage(
      `Venda em andamento recuperada com ${draft.lines.length} ${
        draft.lines.length === 1 ? 'item' : 'itens'
      }.`,
    );
    focusCode();
  }

  async function handleDiscardRecovery(draft: PosDraftSale) {
    await deleteDraftSale(draft.localId);
    const remaining = recoveredDrafts.filter((d) => d.localId !== draft.localId);
    if (remaining.length > 0) {
      setRecoveredDrafts(remaining);
      setSelectedRecoveryDraft(remaining[0]);
    } else {
      setRecoveredDrafts([]);
      setSelectedRecoveryDraft(null);
      setRecoveryPromptOpen(false);
      setCurrentLocalId(generateSaleLocalId());
      setMessage('Venda anterior descartada. PDV pronto para nova venda.');
      focusCode();
    }
  }

  async function executeCancelSale() {
    const oldId = currentLocalId;
    await deleteDraftSale(oldId);
    setLines([]);
    resetSplits();
    setDiscount(0);
    setSurcharge(0);
    setSellerId('');
    setCustomerId('');
    setCustomerName(CONSUMIDOR_FINAL);
    setCustomerPhone('');
    setCustomerCpf('');
    setAskCpf(false);
    setWalkIn(true);
    setLinkedOsId(null);
    setLinkedQuoteId(null);
    setCurrentLocalId(generateSaleLocalId());
    setMessage('Venda cancelada e descartada.');
    focusCode();
  }

  async function handleCancelCurrentSale() {
    if (!pricedLines.length) return;
    const canCancel = userCanCancelSale(user?.email);
    if (!canCancel) {
      setCancelSalePassword('');
      setCancelSalePrompt(true);
      return;
    }
    if (
      !window.confirm(
        `Tem certeza que deseja cancelar e descartar a venda atual com ${pricedLines.length} itens? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }
    await executeCancelSale();
  }

  async function confirmCancelSale(event: FormEvent) {
    event.preventDefault();
    let authorized = false;
    try { authorized = await verifyDeleteItemPassword(cancelSalePassword); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível conferir autorização.'); return; }
    if (!authorized) {
      setError('Senha administrativa / autorização incorreta.');
      return;
    }
    setCancelSalePrompt(false);
    setCancelSalePassword('');
    await executeCancelSale();
  }

  const persistTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    if (lines.length === 0) {
      void deleteDraftSale(currentLocalId);
      return;
    }

    persistTimeoutRef.current = setTimeout(async () => {
      try {
        const draft: PosDraftSale = {
          localId: currentLocalId,
          status: 'in_progress',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          operatorName,
          operatorEmail: user?.email,
          terminalId: getPosTerminalId(),
          cashSessionId: cashSession?.id ?? null,
          customer: {
            id: customerId,
            name: customerName,
            phone: customerPhone,
            document: customerCpf,
            askCpf,
            walkIn,
          },
          sellerId,
          defaultTableId,
          discount,
          discountMode,
          surcharge,
          surchargeMode,
          splits: splits.map((s) => ({
            key: s.key,
            methodId: s.methodId,
            amount: s.amount,
            installments: s.installments,
            tendered: s.tendered,
          })),
          splitTouched,
          lines: lines.map((l) => ({
            key: l.key,
            stockId: l.stockId,
            name: l.name,
            sku: l.sku,
            qty: l.qty,
            unit: l.unit,
            basePrice: l.basePrice,
            unitPrice: l.unitPrice,
            priceTableId: l.priceTableId,
            lineDiscount: l.lineDiscount,
            lineDiscountMode: l.lineDiscountMode,
            lineSurcharge: l.lineSurcharge,
            lineSurchargeMode: l.lineSurchargeMode,
            isFrozenPrice: l.isFrozenPrice,
            promoLabel: l.promoLabel,
            promoExplanation: l.promoExplanation,
            campaignId: l.campaignId,
            imei: l.imei,
          })),
          linkedOsId,
          linkedQuoteId,
        };

        await saveDraftSale(draft);
      } catch (err) {
        console.error('[CaixaPage] Erro ao persistir venda no IndexedDB:', err);
      }
    }, 40);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [
    currentLocalId,
    lines,
    customerId,
    customerName,
    customerPhone,
    customerCpf,
    askCpf,
    walkIn,
    sellerId,
    defaultTableId,
    discount,
    discountMode,
    surcharge,
    surchargeMode,
    splits,
    splitTouched,
    linkedOsId,
    linkedQuoteId,
    operatorName,
    user?.email,
    cashSession?.id,
  ]);

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (lines.length > 0) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [lines.length]);

  function handleConvertQuoteToCart(quote: PosQuote, updatePrices: boolean) {
    setLinkedQuoteId(quote.id);
    const cartLines: CartLine[] = quote.lines.map((l, idx) => {
      const stk = stock.find((s) => s.id === l.stockId);
      const basePrice = updatePrices && stk ? stk.price : l.basePrice || l.unitPrice;
      const unitPrice = updatePrices && stk ? stk.price : l.unitPrice;
      return {
        key: `quote-${quote.id}-${idx}-${Date.now()}`,
        stockId: l.stockId || '',
        name: l.name,
        sku: l.sku || stk?.sku || '',
        qty: l.qty || 1,
        unit: (l.unit as StockUnit) || (stk?.unit as StockUnit) || 'UN',
        basePrice,
        unitPrice,
        priceTableId: quote.priceTableId || '',
        lineDiscount: updatePrices ? 0 : l.lineDiscount || 0,
        lineDiscountMode: l.lineDiscountMode || 'money',
        lineSurcharge: updatePrices ? 0 : l.lineSurcharge || 0,
        lineSurchargeMode: l.lineSurchargeMode || 'money',
        isFrozenPrice: !updatePrices || Boolean(l.isAdHoc),
        promoLabel: updatePrices ? undefined : l.promoLabel,
        imei: '',
        isAdHoc: l.isAdHoc,
        itemType: l.itemType,
      };
    });

    setLines(cartLines);
    if (quote.customerId) setCustomerId(quote.customerId);
    if (quote.customerName) {
      setCustomerName(quote.customerName);
      setWalkIn(false);
    }
    if (quote.customerPhone) setCustomerPhone(quote.customerPhone);
    if (quote.customerDocument) {
      setCustomerCpf(formatCpf(quote.customerDocument));
      setAskCpf(true);
    }
    if (quote.sellerId) setSellerId(quote.sellerId);
    if (!updatePrices) {
      setDiscount(quote.discount || 0);
      setDiscountMode(quote.discountMode || 'money');
      setSurcharge(quote.surcharge || 0);
      setSurchargeMode(quote.surchargeMode || 'money');
    } else {
      setDiscount(0);
      setSurcharge(0);
    }

    setMessage(`Orçamento #${quote.quoteNumber} carregado no PDV. Conclua a venda normalmente.`);
  }

  useEffect(() => {
    const navState = location.state as {
      osId?: string;
      quote?: PosQuote;
      updatePrices?: boolean;
      customerName?: string;
      customerPhone?: string;
      customerDocument?: string;
      lines?: Array<{
        stockId?: string;
        name: string;
        qty: number;
        price: number;
      }>;
    } | null;

    if (navState?.quote) {
      handleConvertQuoteToCart(navState.quote, Boolean(navState.updatePrices));
      window.history.replaceState({}, document.title);
      return;
    }

    if (navState?.osId && navState.lines?.length) {
      setLinkedOsId(navState.osId);
      const cartLines: CartLine[] = navState.lines.map((l, idx) => ({
        key: `os-${navState.osId}-${idx}-${Date.now()}`,
        stockId: l.stockId || '',
        name: l.name,
        sku: '',
        qty: l.qty || 1,
        basePrice: l.price || 0,
        unitPrice: l.price || 0,
        priceTableId: '',
        unit: 'UN',
        lineDiscount: 0,
        lineDiscountMode: 'money',
        lineSurcharge: 0,
        lineSurchargeMode: 'money',
        imei: '',
      }));
      setLines(cartLines);
      if (navState.customerName) {
        setCustomerName(navState.customerName);
        setWalkIn(false);
      }
      if (navState.customerPhone) {
        setCustomerPhone(navState.customerPhone);
      }
      if (navState.customerDocument) {
        setCustomerCpf(navState.customerDocument);
        setAskCpf(true);
      }
      setMessage(`Ordem de Serviço #${navState.osId} carregada no PDV para recebimento.`);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const fiscalOn = hasModule('fiscal');
  const isAdmin = userIsStoreAdmin(user?.email);
  const terminalId = getPosTerminalId();
  const canLaunchAdHoc = isAdHocEnabledForTerminal(terminalId) && userCanLaunchAdHoc(user?.email);
  const customization = useStoreCustomization();
  const sellers = useMemo(() => listSellers(true), []);
  const codeRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef(lines);
  const finishRef = useRef<() => void>(() => undefined);
  const addSplitRef = useRef<() => void>(() => undefined);
  const toggleClientPanelRef = useRef<() => void>(() => undefined);
  const openPanelRef = useRef<(op: Exclude<CaixaPanel, null>) => void>(() => undefined);
  const quickStock = useMemo(() => stock.filter((item) => item.qty > 0).slice(0, 10), [stock]);
  const codeParsed = useMemo(() => parseCodeInput(code), [code]);
  const searchMatches = useMemo(() => {
    if (codeParsed.waitingForCode) return [] as StockItem[];
    const needle = codeParsed.code.trim();
    if (needle.length < 1) return [] as StockItem[];
    return findStockMatches(needle, 8);
  }, [codeParsed]);
  const pendingQty = codeParsed.qty;
  const codePlaceholder =
    pendingQty != null
      ? `${formatPendingQty(pendingQty)}*SKU Enter`
      : '12*SKU Enter · código ou barras';

  useEffect(() => {
    if (!hasDemoAccess('caixa') && !user) {
      navigate('/', { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    const sync = () => setCashSettings(getCashSettings());
    window.addEventListener(CASH_SETTINGS_EVENT, sync);
    window.addEventListener('storage', sync);
    window.addEventListener(PROMO_EVENT, sync);
    window.addEventListener(POS_QUOTES_EVENT, sync);
    return () => {
      window.removeEventListener(CASH_SETTINGS_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener(PROMO_EVENT, sync);
      window.removeEventListener(POS_QUOTES_EVENT, sync);
    };
  }, []);

  const seller = sellers.find((item) => item.id === sellerId);
  const cashOpen = Boolean(cashSession);
  const clientPanelSummary = [
    askCpf && customerCpf ? `CPF ${customerCpf}` : 'sem CPF na nota',
    seller ? `Vendedor: ${seller.name}` : 'sem vendedor',
  ].join(' · ');

  const pricedLines = useMemo(
    () =>
      lines.map((line) => {
        if (line.isAdHoc) {
          const unitPrice = line.unitPrice;
          const lineBase = Math.round(unitPrice * line.qty * 100) / 100;
          const disc = moneyAdj(lineBase, line.lineDiscount, line.lineDiscountMode);
          const sur = moneyAdj(lineBase, line.lineSurcharge, line.lineSurchargeMode);
          const lineTotal = Math.max(0, lineBase - disc + sur);
          return {
            ...line,
            unitPrice,
            tablePrice: unitPrice,
            lineBase,
            lineDiscMoney: disc,
            lineSurMoney: sur,
            lineTotal,
            promoLabel: '',
            promoExplanation: '',
            tableName: 'Avulso',
          };
        }

        const lineTable =
          tables.find((item) => item.id === line.priceTableId) ??
          tables.find((item) => item.id === defaultTableId) ??
          tables[0];

        const tableUnitPrice =
          line.isFrozenPrice && line.unitPrice > 0
            ? line.unitPrice
            : applyPriceTable(line.basePrice, lineTable);

        const standardLineTotal = Math.round(tableUnitPrice * line.qty * 100) / 100;
        let unitPrice = tableUnitPrice;
        let lineBase = standardLineTotal;
        let promoLabel = line.isFrozenPrice ? line.promoLabel || '' : '';
        let promoExplanation = line.isFrozenPrice ? line.promoExplanation || '' : '';

        if (!line.isFrozenPrice) {
          const stk = stock.find((s) => s.id === line.stockId);
          const evalResult = evaluateCampaignForLine(
            {
              id: line.stockId,
              name: line.name,
              sku: line.sku,
              supplierId: stk?.supplierId,
              category: stk?.attrs?.categoria || stk?.kind,
              brand: stk?.attrs?.marca,
              attrs: stk?.attrs,
            },
            line.qty,
            tableUnitPrice,
          );

          // Hard guard: A promoção NUNCA pode encarecer o produto nem igualar sem brinde.
          // Se o valor calculado for maior ou igual ao total padrão sem benefício, descarta a campanha.
          if (
            evalResult.appliedCampaign &&
            (evalResult.lineBaseTotal < standardLineTotal || evalResult.giftDescription)
          ) {
            unitPrice = Math.min(tableUnitPrice, evalResult.unitPrice);
            lineBase = Math.min(standardLineTotal, evalResult.lineBaseTotal);
            promoLabel = evalResult.promoLabel;
            promoExplanation = evalResult.explanation || '';
          } else {
            unitPrice = tableUnitPrice;
            lineBase = standardLineTotal;
            promoLabel = '';
            promoExplanation = '';
          }
        }

        const disc = moneyAdj(lineBase, line.lineDiscount, line.lineDiscountMode);
        const sur = moneyAdj(lineBase, line.lineSurcharge, line.lineSurchargeMode);
        const lineTotal = Math.max(0, lineBase - disc + sur);
        return {
          ...line,
          unitPrice,
          tablePrice: tableUnitPrice,
          lineBase,
          lineDiscMoney: disc,
          lineSurMoney: sur,
          lineTotal,
          promoLabel,
          promoExplanation,
          tableName: lineTable?.name ?? '',
        };
      }),
    [lines, tables, defaultTableId, stock],
  );

  const activeQuoteDraft = useMemo(() => {
    const saleTable =
      tables.find((item) => item.id === defaultTableId) ?? tables[0];
    return {
      lines: pricedLines.map((l) => ({
        stockId: l.stockId,
        sku: l.sku,
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        basePrice: l.basePrice,
        unitPrice: l.unitPrice,
        lineDiscount: l.lineDiscount,
        lineDiscountMode: l.lineDiscountMode,
        lineSurcharge: l.lineSurcharge,
        lineSurchargeMode: l.lineSurchargeMode,
        total: l.lineTotal,
        promoLabel: l.promoLabel,
        campaignId: l.campaignId,
        isAdHoc: l.isAdHoc,
        itemType: l.itemType,
      })),
      customerId,
      customerName: walkIn || !customerName.trim() ? '' : customerName.trim(),
      customerPhone: walkIn ? '' : customerPhone.trim(),
      customerCpf: askCpf ? onlyDigits(customerCpf) : '',
      sellerId: seller?.id,
      sellerName: seller?.name,
      priceTableName: saleTable?.name || 'Padrão',
      priceTableId: saleTable?.id || '',
      discount,
      discountMode,
      surcharge,
      surchargeMode,
      subtotal: pricedLines.reduce((sum, line) => sum + line.lineBase, 0),
      total: Math.max(
        0,
        pricedLines.reduce((sum, line) => sum + line.lineBase, 0) -
          (moneyAdj(pricedLines.reduce((sum, line) => sum + line.lineBase, 0), discount, discountMode) +
            pricedLines.reduce((sum, line) => sum + line.lineDiscMoney, 0)) +
          (moneyAdj(pricedLines.reduce((sum, line) => sum + line.lineBase, 0), surcharge, surchargeMode) +
            pricedLines.reduce((sum, line) => sum + line.lineSurMoney, 0)),
      ),
    };
  }, [
    pricedLines,
    customerId,
    walkIn,
    customerName,
    customerPhone,
    askCpf,
    customerCpf,
    seller,
    defaultTableId,
    tables,
    discount,
    discountMode,
    surcharge,
    surchargeMode,
  ]);

  const subtotal = pricedLines.reduce((sum, line) => sum + line.lineBase, 0);
  const itemsDiscount = pricedLines.reduce((sum, line) => sum + line.lineDiscMoney, 0);
  const itemsSurcharge = pricedLines.reduce((sum, line) => sum + line.lineSurMoney, 0);
  const cartDiscount = moneyAdj(subtotal, discount, discountMode);
  const cartSurcharge = moneyAdj(subtotal, surcharge, surchargeMode);
  const discountMoney = cartDiscount + itemsDiscount;
  const surchargeMoney = cartSurcharge + itemsSurcharge;
  const total = Math.max(0, subtotal - discountMoney + surchargeMoney);
  const unitCount = pricedLines.reduce(
    (sum, line) => sum + (isWeighedUnit(line.unit) ? 0 : line.qty),
    0,
  );
  const weighedQty = pricedLines.reduce(
    (sum, line) => sum + (isWeighedUnit(line.unit) ? line.qty : 0),
    0,
  );

  const splitRows = useMemo(
    () => syncSingleSplit(splits, total, splitTouched),
    [splits, total, splitTouched],
  );
  const paySummary = useMemo(
    () => summarizeSplit(splitRows, payments, total),
    [splitRows, payments, total],
  );
  const primaryPayment = payments.find((item) => item.id === splitRows[0]?.methodId);

  linesRef.current = lines;

  function refreshCash() {
    setCashSession(getOpenCashSession());
    setStock(getAdminState().stock);
  }

  function focusCode() {
    window.requestAnimationFrame(() => {
      const input = codeRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
  }

  function openPanel(next: Exclude<CaixaPanel, null>) {
    setOpsMenuOpen(false);
    if (next !== 'exchange') setExchangeOrderId(null);
    setPanel(next);
    setError(null);
  }

  openPanelRef.current = openPanel;

  function handleAddAdHocLine(item: { name: string; unitPrice: number; qty: number }) {
    const key = `adhoc:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
    const newLine: CartLine = {
      key,
      stockId: '',
      name: item.name,
      sku: 'AVULSO',
      imei: '',
      qty: item.qty,
      unit: 'UN',
      basePrice: item.unitPrice,
      unitPrice: item.unitPrice,
      priceTableId: '',
      lineDiscount: 0,
      lineDiscountMode: 'money',
      lineSurcharge: 0,
      lineSurchargeMode: 'money',
      isFrozenPrice: true,
      isAdHoc: true,
      itemType: 'ad_hoc',
    };
    setLines((prev) => [...prev, newLine]);
    focusCode();
  }

  function handleImportTotemTicket(ticket: QueueTicket) {
    const rawPrice = ticket.cashPrice || parsePriceLabel(ticket.priceLabel) || 0;
    const attrStr = ticketVariation(ticket);
    const itemFullName = ticket.productName + (attrStr ? ` (${attrStr})` : '');
    const lineKey = `totem:${ticket.id}:${Date.now()}`;
    const newLine: CartLine = {
      key: lineKey,
      stockId: ticket.stockId||'',sourceTicketId:ticket.id,pickupMethodId:ticket.pickupMethodId,deliveryAddress:ticket.deliveryAddress,attributes:ticket.attributes,
      name: itemFullName,
      sku: 'TOTEM',
      imei: '',
      qty: 1,
      unit: 'UN',
      basePrice: rawPrice,
      unitPrice: rawPrice,
      priceTableId: '',
      lineDiscount: 0,
      lineDiscountMode: 'money',
      lineSurcharge: 0,
      lineSurchargeMode: 'money',
      isFrozenPrice: true,
      isAdHoc: !ticket.stockId,
      itemType: 'product',
      promoLabel: `Totem ${ticket.ticketSenha || ticket.id}`,
    };
    setLines((prev) => [...prev, newLine]);

    const cleanPhone = onlyDigits(ticket.customerPhone);
    const admin = getAdminState();
    const existing = admin.customers.find(
      (c: Customer) =>
        (cleanPhone && onlyDigits(c.phone) === cleanPhone) ||
        (cleanPhone && c.name.trim().toLowerCase() === ticket.customerName.trim().toLowerCase())
    );

    markTicketImported(ticket.id);
    setTotemQueue(listOpenCashierTickets());

    if (existing) {
      pickCustomer(existing);
      setCustomerPrefill(undefined);
      setPanel(null);
      setMessage(`Pedido do Totem (${ticket.ticketSenha || ticket.id}) carregado com sucesso para ${existing.name}!`);
    } else {
      setWalkIn(false);
      setCustomerId('');
      setCustomerName(ticket.customerName);
      setCustomerPhone(ticket.customerPhone);
      setCustomerPrefill({ name: ticket.customerName, phone: ticket.customerPhone });
      setPanel('customer');
      setMessage(`Pedido do Totem (${ticket.ticketSenha || ticket.id}) carregado! Complete o cadastro do cliente.`);
    }
    focusCode();
  }

  function pickCustomer(customer: Customer | undefined) {
    if (!customer) {
      setWalkIn(true);
      setCustomerId('');
      setCustomerName(CONSUMIDOR_FINAL);
      setCustomerPhone('');
      return;
    }
    setWalkIn(false);
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    if (customer.document) {
      setAskCpf(true);
      setCustomerCpf(formatCpf(customer.document));
    }
  }

  function resolveAddQty(item: StockItem, qtyOverride?: number | null) {
    const unit: StockUnit = item.unit === 'KG' ? 'KG' : 'UN';
    let qtyAdd = qtyOverride ?? pendingQty ?? null;
    if (qtyAdd == null) {
      if (isWeighedUnit(unit) && getCashSettings().scaleEnabled) {
        qtyAdd = readScaleKg();
      } else {
        qtyAdd = 1;
      }
    }
    return qtyAdd;
  }

  function addItem(item: StockItem, scannedImei: boolean, qtyOverride?: number | null) {
    const unit: StockUnit = item.unit === 'KG' ? 'KG' : 'UN';
    const available = item.qty;
    if (available <= 0) {
      setError(`${item.name} sem estoque.`);
      return;
    }
    const qtyAddRaw = resolveAddQty(item, qtyOverride);
    if (qtyAddRaw == null || !Number.isFinite(qtyAddRaw) || qtyAddRaw <= 0) {
      setError('Não há leitura válida da balança. Informe o peso medido para adicionar o produto.');
      return;
    }
    if (!isWeighedUnit(unit) && Math.abs(qtyAddRaw % 1) > 1e-9) {
      setError(`${item.name} é UN — quantidade deve ser inteira (ex.: 12*).`);
      return;
    }
    const addQty = normalizeSaleQty(qtyAddRaw, unit);
    const key = lineKey(item, scannedImei);
    const current = linesRef.current;
    const existing = current.find((line) => line.key === key);
    const nextQty = normalizeSaleQty((existing?.qty ?? 0) + addQty, unit);
    if (nextQty > available) {
      setError(
        `Estoque insuficiente para ${item.name} (${formatQty(available, unit)} ${unit}).`,
      );
      return;
    }
    const lineTable =
      tables.find((row) => row.id === (existing?.priceTableId ?? defaultTableId)) ?? tables[0];
    const unitPrice = applyPriceTable(item.price, lineTable);
    const nextLine: CartLine = {
      key,
      stockId: item.id,
      name: item.name,
      sku: item.sku,
      imei: scannedImei ? item.imei : existing?.imei || item.imei,
      qty: nextQty,
      unit,
      basePrice: existing?.basePrice ?? item.price,
      unitPrice,
      priceTableId: existing?.priceTableId ?? defaultTableId ?? lineTable?.id ?? '',
      lineDiscount: existing?.lineDiscount ?? 0,
      lineDiscountMode: existing?.lineDiscountMode ?? 'money',
      lineSurcharge: existing?.lineSurcharge ?? 0,
      lineSurchargeMode: existing?.lineSurchargeMode ?? 'money',
    };
    setLines(existing ? current.map((line) => (line.key === key ? nextLine : line)) : [...current, nextLine]);
    setCode('');
    setError(null);
    const evalPreview = evaluateCampaignForLine(
      {
        id: item.id,
        name: item.name,
        sku: item.sku,
        supplierId: item.supplierId,
        category: item.attrs?.categoria || item.kind,
        brand: item.attrs?.marca,
        attrs: item.attrs,
      },
      nextQty,
      unitPrice,
    );
    const standardAddTotal = Math.round(unitPrice * nextQty * 100) / 100;
    const hasPromoBenefit =
      evalPreview.appliedCampaign &&
      (evalPreview.lineBaseTotal < standardAddTotal || Boolean(evalPreview.giftDescription));

    setMessage(
      hasPromoBenefit
        ? `${item.name} · ${formatQty(addQty, unit)} ${unit} · ✨ ${evalPreview.promoLabel}`
        : `${item.name} · ${formatQty(addQty, unit)} ${unit}`,
    );
    focusCode();
  }

  function scan(event?: FormEvent) {
    event?.preventDefault();
    const needle = code.trim();
    if (!needle) {
      if (linesRef.current.length > 0) finishRef.current();
      return;
    }
    const parsed = parseCodeInput(needle);
    if (parsed.waitingForCode) {
      setMessage(`Qty ${formatPendingQty(parsed.qty ?? 1)}* · digite SKU, barras ou escolha na lista`);
      setError(null);
      focusCode();
      return;
    }
    const codePart = parsed.code;
    if (!codePart) {
      focusCode();
      return;
    }
    const item = findStockByCode(codePart);
    if (!item) {
      if (searchMatches.length === 1) {
        addItem(searchMatches[0], false, parsed.qty);
        return;
      }
      setError('Produto não encontrado. Use SKU, código de barras ou IMEI.');
      setMessage(null);
      focusCode();
      return;
    }
    const compact = codePart.toLowerCase().replace(/\s+/g, '');
    const scannedImei = item.imei.toLowerCase().replace(/\s+/g, '') === compact;
    addItem(item, scannedImei, parsed.qty);
  }

  function changeQty(key: string, qty: number) {
    const line = lines.find((item) => item.key === key);
    if (!line) return;
    const item = stock.find((entry) => entry.id === line.stockId);
    const max = item?.qty ?? 1;
    const nextQty = Math.min(max, normalizeSaleQty(qty, line.unit));
    setLines(lines.map((entry) => (entry.key === key ? { ...entry, qty: nextQty } : entry)));
  }

  function changeLineBasePrice(key: string, price: number) {
    if (!cashSettings.allowEditUnitPrice) return;
    const next = Math.max(0, Math.round((Number(price) || 0) * 100) / 100);
    setLines(lines.map((entry) => (entry.key === key ? { ...entry, basePrice: next } : entry)));
  }

  function patchLine(key: string, patch: Partial<CartLine>) {
    setLines(lines.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  }

  function removeLine(key: string) {
    const settings = getCashSettings();
    const canCancelItem = userCanCancelItem(user?.email);
    if (!canCancelItem || settings.requirePasswordToDeleteItem) {
      setDeletePassword('');
      setDeletePrompt({ key });
      return;
    }
    setLines(lines.filter((line) => line.key !== key));
    if (lineAdjKey === key) setLineAdjKey(null);
    if (lineTableKey === key) setLineTableKey(null);
    focusCode();
  }

  async function confirmDeleteLine(event: FormEvent) {
    event.preventDefault();
    if (!deletePrompt) return;
    let authorized = false;
    try { authorized = await verifyDeleteItemPassword(deletePassword); }
    catch (error) { setError(error instanceof Error ? error.message : 'Não foi possível conferir autorização.'); return; }
    if (!authorized) {
      setError('Senha administrativa / autorização incorreta.');
      return;
    }
    setLines(lines.filter((line) => line.key !== deletePrompt.key));
    setDeletePrompt(null);
    setDeletePassword('');
    setError(null);
    focusCode();
  }

  function resetSplits() {
    setSplits([createSplit(payments[0]?.id ?? '')]);
    setSplitTouched(false);
  }

  function patchSplit(
    key: string,
    patch: Partial<SplitPayment>,
    options?: { touch?: boolean },
  ) {
    if (options?.touch) setSplitTouched(true);
    setSplits(splitRows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setError(null);
    // A tabela de preço continua seguindo a forma principal, como antes.
    if (patch.methodId && splitRows[0]?.key === key) {
      const method = payments.find((item) => item.id === patch.methodId);
      if (method?.priceTableId && tables.some((item) => item.id === method.priceTableId)) {
        setDefaultTableId(method.priceTableId);
      }
    }
  }

  function addSplit() {
    if (!payments.length) return;
    const used = new Set(splitRows.map((row) => row.methodId));
    const next = payments.find((item) => !used.has(item.id)) ?? payments[0];
    const rest = Math.max(
      0,
      roundMoney(total - splitRows.reduce((sum, row) => sum + row.amount, 0)),
    );
    setSplitTouched(true);
    setSplits([...splitRows, createSplit(next.id, rest)]);
    setError(null);
  }

  function removeSplit(key: string) {
    const left = splitRows.filter((row) => row.key !== key);
    if (!left.length) return;
    // Voltando a uma forma só, o valor volta a acompanhar o total sozinho.
    setSplitTouched(left.length > 1);
    setSplits(left);
    setError(null);
  }

  function toggleClientPanel() {
    setClientPanelOpen((open) => {
      if (open) {
        setCustomerPickOpen(false);
        return false;
      }
      return true;
    });
  }

  async function finish() {
    if (!pricedLines.length) {
      setError('Informe ao menos um produto.');
      focusCode();
      return;
    }
    if (!cashOpen) {
      setError('Abra o caixa antes de fechar a venda.');
      openPanel('open');
      return;
    }
    if (!primaryPayment || !tables.length) {
      setError('Cadastre tabela de preço e forma de pagamento na Retaguarda antes de vender.');
      return;
    }
    if (!paySummary.settled) {
      if (paySummary.remaining > 0.005) {
        setError(`Falta receber ${money(paySummary.remaining)} para fechar a venda.`);
      } else if (paySummary.remaining < -0.005) {
        setError(
          `As formas de pagamento somam ${money(-paySummary.remaining)} acima do total.`,
        );
      } else {
        setError(
          `Valor recebido em dinheiro é ${money(paySummary.missingTender)} menor que o lançado.`,
        );
      }
      return;
    }
    const saleTable =
      tables.find((item) => item.id === defaultTableId) ??
      tables.find((item) => item.id === pricedLines[0]?.priceTableId) ??
      tables[0];
    if (!saleTable) {
      setError('Cadastre tabela de preço na Retaguarda antes de vender.');
      return;
    }
    const cpfDigits = onlyDigits(customerCpf);
    if (askCpf) {
      if (cpfDigits.length !== 11 || !isValidCpf(cpfDigits)) {
        setError('Informe um CPF válido para a nota.');
        return;
      }
    }
    const paymentLabel = describeSplit(splitRows, payments);
    const saleChange = paySummary.change;
    const saleCash = paySummary.cashDue;
    const saleTotal = total;
    const saleCustomer = walkIn || !customerName.trim() ? CONSUMIDOR_FINAL : customerName.trim();
    const saleCpf = askCpf ? cpfDigits : '';
    try {
      const state = await closePosSale({
        ticketId: null,
        localId: currentLocalId,
        customerName: saleCustomer,
        customerPhone: walkIn ? '' : customerPhone.trim(),
        customerDocument: saleCpf,
        paymentName: paymentLabel,
        priceTableName: saleTable.name,
        paymentMethodId: primaryPayment.id,
        priceTableId: saleTable.id,
        discount: discountMoney,
        surcharge: surchargeMoney,
        sellerId: seller?.id,
        sellerName: seller?.name,
        lines: pricedLines.map((line) => ({
          stockId: line.stockId,
          name: line.name,
          pickupMethodId:line.pickupMethodId,deliveryAddress:line.deliveryAddress,sourceTicketId:line.sourceTicketId,
          attributes: line.attributes,
          qty: line.qty,
          unitPrice: line.unitPrice,
          imei: line.imei,
          isAdHoc: line.isAdHoc,
          itemType: line.isAdHoc ? 'ad_hoc' : (line.itemType || 'product'),
        })),
      });
      const order = state.orders[0];
      const adHocLines = pricedLines.filter((l) => l.isAdHoc);
      if (adHocLines.length > 0) {
        logAudit({
          kind: 'action',
          actorName: user?.name || operatorName,
          actorEmail: user?.email || '',
          action: 'venda_avulsa_lancada',
          detail: `Venda ${order?.id || currentLocalId}: ${adHocLines.length} item(ns) avulso(s) lançado(s). Total avulso: R$ ${adHocLines.reduce((acc, l) => acc + l.lineTotal, 0).toFixed(2)}. Terminal: ${terminalId}`,
          path: '/caixa',
        });
      }
      if (linkedOsId) {
        void registerWorkOrderPayment(linkedOsId, {
          method: paymentLabel,
          amount: saleTotal,
          receivedAmount: saleCash,
          change: saleChange,
          operatorName: user?.name || 'Operador PDV',
          note: `Recebimento via PDV/Caixa (Venda ${order?.id || ''})`,
        });
        void logWorkOrderActivity(
          linkedOsId,
          'Recebimento PDV',
          'adicionou',
          `Venda ${order?.id || ''} concluída no PDV - Valor ${saleTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} via ${paymentLabel}`,
          user?.name,
        );
        setLinkedOsId(null);
      }
      if (linkedQuoteId) {
        try { await markQuoteConverted(linkedQuoteId, order?.id || '', user?.name || operatorName); }
        catch (error) { setError('Venda registrada, mas o vínculo com o orçamento não foi atualizado: ' + (error instanceof Error ? error.message : 'Atualize e confira o orçamento.')); }
        setLinkedQuoteId(null);
      }
      setLastOrderId(order?.id ?? null);
      setLastOrderAmount(saleTotal);
      setLastChange(saleChange);
      setLastCustomerName(saleCustomer || order?.customerName || CONSUMIDOR_FINAL);
      setStock(state.stock);
      setCustomers(state.customers);
      setLines([]);
      void clearCompletedDraftSale(currentLocalId);
      setCurrentLocalId(generateSaleLocalId());
      setDiscount(0);
      setDiscountMode('money');
      setSurcharge(0);
      setSurchargeMode('money');
      setLineAdjKey(null);
      setLineTableKey(null);
      setSellerId('');
      setAskCpf(false);
      setCustomerCpf('');
      setClientPanelOpen(false);
      setCustomerPickOpen(false);
      pickCustomer(undefined);
      setWalkIn(true);
      resetSplits();
      setDefaultTableId(
        payments[0]?.priceTableId && tables.some((item) => item.id === payments[0].priceTableId)
          ? payments[0].priceTableId
          : (tables[0]?.id ?? ''),
      );

      if (order) {
        const cashNote = [
          `Venda ${order.id}`,
          saleCash > 0 ? `dinheiro ${money(saleCash)}` : null,
          saleChange > 0 ? `troco ${money(saleChange)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        const cashSale = registerCashSale(saleTotal, operatorName, cashNote, order.id, {
          cashAmount: saleCash,
        });
        if (cashSale.ok) {
          attachOrderCashSession(order.id, cashSale.session.id);
        }
        if (saleCash > 0) {
          void openCashDrawer(operatorName, `Venda ${order.id} em dinheiro`);
        }
        refreshCash();
        const settings = getTotemSettings();
        const foodOps =
          settings.vertical === 'food' || settings.printTicket || settings.offerFulfillment;
        if (foodOps && pricedLines.length) {
          try {
            enqueueKitchenOrder({
              channel: 'balcao',
              customerName: saleCustomer,
              sourceTicketId: order.id,
              lines: pricedLines.map((line) => ({
                name: line.name,
                qty: line.qty,
                detail: line.imei ? `IMEI ${line.imei}` : '',
              })),
            });
          } catch {
            /* não bloqueia a venda */
          }
        }
      }

      let docMsg = '';
      if (order) {
        const emitted = emitSaleCheckoutDocument({
          orderId: order.id,
          customerName: saleCustomer,
          amount: saleTotal,
          customerDocument: saleCpf,
          fiscalIntegrated: fiscalOn,
          items: pricedLines.map((line) => ({
            name: line.name,
            qty: line.qty,
            unitPrice: line.unitPrice,
          })),
        });
        if (emitted.ok) {
          docMsg = ` · ${FISCAL_KIND_LABEL[emitted.document.kind]} ${emitted.document.number}`;
        }
      }

      setError(null);
      const changeMsg = saleChange > 0 ? ` · troco ${money(saleChange)}` : '';
      setMessage(
        `Pedido ${order?.id ?? ''} · ${money(saleTotal)} · ${paymentLabel}${changeMsg}${docMsg}`,
      );
      focusCode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fechar a venda.');
    }
  }

  finishRef.current = finish;
  addSplitRef.current = addSplit;
  toggleClientPanelRef.current = toggleClientPanel;

  function emitFiscal(asNfce: boolean) {
    if (!lastOrderId) return;
    const result = emitNfeFromSale({
      orderId: lastOrderId,
      customerName: lastCustomerName,
      amount: lastOrderAmount,
      asNfce,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setMessage(
      `${FISCAL_KIND_LABEL[result.document.kind]} ${result.document.number} autorizada (simulação).`,
    );
    focusCode();
  }

  function requestExit() {
    setExitOpen(true);
  }

  useEffect(() => {
    focusCode();
    function onCashUpdated() {
      refreshCash();
    }
    window.addEventListener('marthi-cash-updated', onCashUpdated);
    return () => window.removeEventListener('marthi-cash-updated', onCashUpdated);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      const inCodeField = target === codeRef.current;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

      if (event.key === 'Insert') {
        event.preventDefault();
        if (panel) setPanel(null);
        setOpsMenuOpen(false);
        setCode('');
        setError(null);
        focusCode();
        return;
      }

      if (event.key === 'F2') {
        event.preventDefault();
        finishRef.current();
        return;
      }
      if (event.altKey && (key === 'o' || key === 'O')) {
        if (cashSettings.enableQuotes !== false) {
          event.preventDefault();
          openPanelRef.current('quotes');
        }
        return;
      }
      if (event.altKey && (key === 't' || key === 'T')) {
        if (totemQueue.length > 0) {
          event.preventDefault();
          openPanelRef.current('totem_queue');
        }
        return;
      }
      if (event.key === 'F3') {
        event.preventDefault();
        focusCode();
        return;
      }
      if (event.key === 'F4' && fiscalOn && lastOrderId) {
        event.preventDefault();
        emitFiscal(true);
        return;
      }
      if (event.key === 'F6') {
        event.preventDefault();
        if (cashOpen) openPanelRef.current('exchange');
        return;
      }
      if (event.key === 'F7') {
        event.preventDefault();
        openPanelRef.current(cashOpen ? 'movements' : 'open');
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        if (cashOpen) openPanelRef.current('sangria');
        return;
      }
      if (event.key === 'F9') {
        event.preventDefault();
        if (cashOpen) openPanelRef.current('aporte');
        return;
      }
      if (event.key === 'F10') {
        event.preventDefault();
        if (cashOpen) openPanelRef.current('close');
        return;
      }
      if (event.key === 'F11') {
        event.preventDefault();
        openPanelRef.current('price');
        return;
      }
      if (event.key === 'F12') {
        event.preventDefault();
        openPanelRef.current('sessions');
        return;
      }
      if (event.key === 'Escape') {
        if (exitOpen) {
          event.preventDefault();
          setExitOpen(false);
          focusCode();
          return;
        }
        if (profileOpen) {
          event.preventDefault();
          setProfileOpen(false);
          focusCode();
          return;
        }
        if (panel) {
          event.preventDefault();
          setPanel(null);
          focusCode();
          return;
        }
        if (opsMenuOpen) {
          event.preventDefault();
          setOpsMenuOpen(false);
          focusCode();
          return;
        }
        if (clientPanelOpen) {
          event.preventDefault();
          setClientPanelOpen(false);
          setCustomerPickOpen(false);
          focusCode();
          return;
        }
        if (inCodeField || !typing) {
          setCode('');
          setError(null);
          focusCode();
        }
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (key === 'm') {
          event.preventDefault();
          setOpsMenuOpen((open) => !open);
          return;
        }
        if (key === 'a' || event.code === 'KeyA') {
          event.preventDefault();
          if (!cashOpen) {
            setError('Abra o caixa antes de lançar vendas (F7).');
          } else if (!canLaunchAdHoc) {
            setError('Venda Avulsa desativada neste terminal ou usuário sem permissão.');
          } else {
            openPanelRef.current('ad_hoc');
          }
          return;
        }
        if (key === 'c') {
          event.preventDefault();
          openPanelRef.current('sales');
          return;
        }
        if (key === 'e') {
          event.preventDefault();
          openPanelRef.current('canceled');
          return;
        }
        if (key === 'p' || event.code === 'KeyP') {
          event.preventDefault();
          addSplitRef.current();
          return;
        }
        // Alt+D é reservado pelo Chrome (barra de endereço); usamos também KeyL.
        if (key === 'd' || key === 'l' || event.code === 'KeyD' || event.code === 'KeyL') {
          event.preventDefault();
          toggleClientPanelRef.current();
          return;
        }
        if (key === 'v' || event.code === 'KeyV') {
          event.preventDefault();
          if (cashOpen) openPanelRef.current('vale');
          return;
        }
        if (key === 'n') {
          event.preventDefault();
          openPanelRef.current('customer');
          return;
        }
        if (/^[1-9]$/.test(key)) {
          event.preventDefault();
          const item = quickStock[Number(key) - 1];
          if (item) addItem(item, false);
          return;
        }
      }

      // Enter no código vazio fecha a venda; Tab/Enter nos botões seguem o navegador
      if (event.key === 'Enter' && inCodeField && !code.trim() && linesRef.current.length > 0) {
        event.preventDefault();
        finishRef.current();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    fiscalOn,
    lastOrderId,
    quickStock,
    code,
    cashOpen,
    panel,
    exitOpen,
    opsMenuOpen,
    profileOpen,
    clientPanelOpen,
    canLaunchAdHoc,
  ]);

  useEffect(() => {
    function onDrawer() {
      setDrawerFlash('Gaveta aberta (sinal enviado)');
      window.setTimeout(() => setDrawerFlash(null), 2500);
    }
    window.addEventListener('marthi-cash-drawer', onDrawer);
    return () => window.removeEventListener('marthi-cash-drawer', onDrawer);
  }, []);

  useEffect(() => {
    if (!shortcutsOpen) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.caixa-app__shortcuts')) return;
      setShortcutsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setShortcutsOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [shortcutsOpen]);

  return (
    <div
      className={`caixa-app ${opsMenuOpen ? 'is-ops-open' : ''} ${profileOpen ? 'is-profile-dock' : ''} ${
        isDark ? 'is-theme-dark' : ''
      }`}
    >
      <header className="caixa-app__top">
        <OsEcosystemMenu />
        <ModuleMenuButton open={opsMenuOpen} onClick={() => setOpsMenuOpen((open) => !open)} />
        <StoreSwitcher compact />
        <BrandLogo variant="mark" className="caixa-app__mark" />
        <div className="caixa-app__brand">
          <strong>PDV · Caixa</strong>
        </div>
        {isAdmin ? (
          <Link to="/painel" className="app-to-panel-btn" title="Voltar ao Painel Administrativo">
            <AdminIcon name="home" />
            <span>Painel</span>
          </Link>
        ) : null}
        <div className="caixa-app__top-actions">
          {totemQueue.length > 0 ? (
            <button
              type="button"
              className="caixa-totem-queue-btn"
              onClick={() => openPanel('totem_queue')}
              title={`${totemQueue.length} pedido(s) do Totem aguardando atendimento no caixa (Alt+T)`}
            >
              <span className="caixa-totem-queue-btn__bell" aria-hidden>🛎️</span>
              <span className="caixa-totem-queue-btn__text">Fila Totem</span>
              <span className="caixa-totem-queue-btn__badge">{totemQueue.length}</span>
            </button>
          ) : null}
          <div className={`caixa-app__shortcuts ${shortcutsOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="caixa-app__exit caixa-app__shortcuts-btn"
              aria-expanded={shortcutsOpen}
              aria-haspopup="true"
              title="Atalhos do caixa"
              onClick={() => setShortcutsOpen((open) => !open)}
            >
              Atalhos
            </button>
            {shortcutsOpen ? (
              <div className="caixa-app__shortcuts-menu" role="menu">
                <p className="caixa-app__shortcuts-label">Venda</p>
                <button type="button" role="menuitem" onClick={() => { setShortcutsOpen(false); focusCode(); }}>
                  <kbd>Insert</kbd> código
                </button>
                <button type="button" role="menuitem" onClick={() => { setShortcutsOpen(false); focusCode(); }}>
                  <kbd>Enter</kbd> incluir
                </button>
                <button type="button" role="menuitem" onClick={() => { setShortcutsOpen(false); void finishRef.current(); }}>
                  <kbd>F2</kbd> fechar venda
                </button>
                <button type="button" role="menuitem" onClick={() => { setShortcutsOpen(false); focusCode(); }}>
                  <kbd>F3</kbd> focar código
                </button>
                <button type="button" role="menuitem" onClick={() => setShortcutsOpen(false)}>
                  <kbd>Esc</kbd> limpar
                </button>
                {fiscalOn ? (
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!lastOrderId}
                    onClick={() => {
                      setShortcutsOpen(false);
                      if (lastOrderId) emitFiscal(true);
                    }}
                  >
                    <kbd>F4</kbd> NFC-e
                  </button>
                ) : null}
                <button type="button" role="menuitem" onClick={() => setShortcutsOpen(false)}>
                  <kbd>Alt+P</kbd> forma pgto.
                </button>
                <button type="button" role="menuitem" onClick={() => setShortcutsOpen(false)}>
                  <kbd>Alt+L</kbd> cliente / CPF / vendedor
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canLaunchAdHoc}
                  onClick={() => {
                    setShortcutsOpen(false);
                    if (canLaunchAdHoc) openPanel('ad_hoc');
                  }}
                >
                  <kbd>Alt+A</kbd> venda avulsa
                </button>
                {totemQueue.length > 0 ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setShortcutsOpen(false);
                      openPanel('totem_queue');
                    }}
                  >
                    <kbd>Alt+T</kbd> fila totem ({totemQueue.length})
                  </button>
                ) : null}
                <button type="button" role="menuitem" onClick={() => setShortcutsOpen(false)}>
                  <kbd>Alt+1…9</kbd> estoque
                </button>
                <button type="button" role="menuitem" onClick={() => setShortcutsOpen(false)}>
                  <kbd>12*</kbd> qty + SKU
                </button>

                <p className="caixa-app__shortcuts-label">Caixa</p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShortcutsOpen(false);
                    openPanel(cashOpen ? 'movements' : 'open');
                  }}
                >
                  <kbd>F7</kbd> {cashOpen ? 'movimentos' : 'abrir caixa'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!cashOpen}
                  onClick={() => {
                    setShortcutsOpen(false);
                    if (cashOpen) openPanel('sangria');
                  }}
                >
                  <kbd>F8</kbd> sangria
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!cashOpen}
                  onClick={() => {
                    setShortcutsOpen(false);
                    if (cashOpen) openPanel('aporte');
                  }}
                >
                  <kbd>F9</kbd> aporte
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!cashOpen}
                  className="is-danger"
                  onClick={() => {
                    setShortcutsOpen(false);
                    if (cashOpen) openPanel('close');
                  }}
                >
                  <kbd>F10</kbd> fechamento
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShortcutsOpen(false);
                    openPanel('sessions');
                  }}
                >
                  <kbd>F12</kbd> consulta caixas
                </button>

                <p className="caixa-app__shortcuts-label">Consultas</p>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShortcutsOpen(false);
                    openPanel('sales');
                  }}
                >
                  <kbd>Alt+C</kbd> consultar vendas
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShortcutsOpen(false);
                    openPanel('canceled');
                  }}
                >
                  <kbd>Alt+E</kbd> estorno (24h)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!cashOpen}
                  onClick={() => {
                    setShortcutsOpen(false);
                    if (cashOpen) openPanel('exchange');
                  }}
                >
                  <kbd>F6</kbd> troca
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShortcutsOpen(false);
                    openPanel('price');
                  }}
                >
                  <kbd>F11</kbd> consulta preço
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShortcutsOpen(false);
                    openPanel('customer');
                  }}
                >
                  <kbd>Alt+N</kbd> novo cliente
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!cashOpen}
                  onClick={() => {
                    setShortcutsOpen(false);
                    if (cashOpen) openPanel('vale');
                  }}
                >
                  <kbd>Alt+V</kbd> vale-compra
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShortcutsOpen(false);
                    setOpsMenuOpen((open) => !open);
                  }}
                >
                  <kbd>Alt+M</kbd> menu operações
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="caixa-app__exit" onClick={requestExit}>
            Sair
          </button>
        </div>
      </header>

      {opsMenuOpen ? (
        <button
          type="button"
          className="caixa-app__ops-backdrop"
          aria-label="Fechar operações"
          onClick={() => setOpsMenuOpen(false)}
        />
      ) : null}

      <div className="caixa-app__workspace">
        <aside
          className={`caixa-app__ops-drawer ${opsMenuOpen ? 'is-open' : ''}`}
          aria-hidden={!opsMenuOpen}
        >
          <div className="caixa-app__ops-head">
            <strong>Operações</strong>
            <button
              type="button"
              className="caixa-app__ops-close"
              title="Central do caixa"
              aria-label="Fechar menu e voltar ao caixa"
              onClick={() => {
                setProfileOpen(false);
                setOpsMenuOpen(false);
                focusCode();
              }}
            >
              <AdminIcon name="home" />
            </button>
          </div>
          <UserChip
            onOpen={() => {
              setPanel(null);
              setProfileOpen(true);
              const mobile =
                typeof window !== 'undefined' &&
                window.matchMedia('(max-width: 980px)').matches;
              setOpsMenuOpen(!mobile);
            }}
          />
          <div className={`caixa-app__cash-pill ${cashOpen ? 'is-open' : 'is-closed'}`}>
            {cashOpen && cashSession ? (
              <>
                <strong>Caixa aberto</strong>
                <span>
                  Esperado {money(cashSession.expectedCash)} · {cashSession.operatorName}
                </span>
              </>
            ) : (
              <>
                <strong>Caixa fechado</strong>
                <span>F7 abre · Alt+M operações</span>
              </>
            )}
          </div>
          <nav className="caixa-app__ops-nav" aria-label="Operações do caixa">
            <button
              type="button"
              className="caixa-app__ops-central"
              onClick={() => {
                setProfileOpen(false);
                setOpsMenuOpen(false);
                focusCode();
              }}
            >
              <AdminIcon name="home" />
              <span>Central</span>
            </button>
            {customization.showTablesAndKitchen ? (
              <>
                <Link to="/mesa" className="caixa-app__ops-central" onClick={() => setOpsMenuOpen(false)}>
                  <AdminIcon name="ops" />
                  <span>Mesas / garçom</span>
                </Link>
                <Link to="/cozinha" className="caixa-app__ops-central" onClick={() => setOpsMenuOpen(false)}>
                  <AdminIcon name="ops" />
                  <span>Tela da cozinha</span>
                </Link>
              </>
            ) : null}
          <button type="button" onClick={() => openPanel('sales')}>
            <kbd>Alt+C</kbd>
            <span>Consultar vendas</span>
          </button>
          {canLaunchAdHoc ? (
            <button
              type="button"
              disabled={!cashOpen}
              onClick={() => openPanel('ad_hoc')}
              title="Lançar produto ou serviço avulso sem estoque (Alt+A)"
            >
              <kbd>Alt+A</kbd>
              <span>Venda Avulsa</span>
            </button>
          ) : null}
          {cashSettings.enableQuotes !== false ? (
            <button type="button" onClick={() => openPanel('quotes')} title="Consultar orçamentos comerciais (Alt+O)">
              <kbd>Alt+O</kbd>
              <span>Orçamentos</span>
            </button>
          ) : null}
          {totemQueue.length > 0 ? (
            <button
              type="button"
              className="caixa-app__ops-totem"
              onClick={() => openPanel('totem_queue')}
              title="Pedidos aguardando atendimento do Totem"
            >
              <kbd>Alt+T</kbd>
              <span>Fila Totem ({totemQueue.length})</span>
            </button>
          ) : null}
          <button type="button" onClick={() => openPanel('canceled')}>
            <kbd>Alt+E</kbd>
            <span>Estorno (24h)</span>
          </button>
          <button type="button" disabled={!cashOpen} onClick={() => openPanel('exchange')}>
            <kbd>F6</kbd>
            <span>Troca</span>
          </button>
          <button type="button" onClick={() => openPanel(cashOpen ? 'movements' : 'open')}>
            <kbd>F7</kbd>
            <span>{cashOpen ? 'Movimentos' : 'Abrir caixa'}</span>
          </button>
          <button type="button" disabled={!cashOpen} onClick={() => openPanel('sangria')}>
            <kbd>F8</kbd>
            <span>Sangria</span>
          </button>
          <button type="button" disabled={!cashOpen} onClick={() => openPanel('aporte')}>
            <kbd>F9</kbd>
            <span>Aporte</span>
          </button>
          <button type="button" disabled={!cashOpen} onClick={() => openPanel('vale')} title="Alt+V">
            <kbd>Alt+V</kbd>
            <span>Vale-compra</span>
          </button>
          <button type="button" onClick={() => openPanel('price')}>
            <kbd>F11</kbd>
            <span>Consulta preço</span>
          </button>
          <button type="button" onClick={() => openPanel('customer')}>
            <kbd>Alt+N</kbd>
            <span>Novo cliente</span>
          </button>
          <button type="button" onClick={() => openPanel('sessions')}>
            <kbd>F12</kbd>
            <span>Consulta caixas</span>
          </button>
          <button
            type="button"
            className="is-danger"
            disabled={!cashOpen}
            onClick={() => openPanel('close')}
          >
            <kbd>F10</kbd>
            <span>Fechamento</span>
          </button>
        </nav>
        <div className="module-side-foot">
          <button
            type="button"
            className="module-side-foot__link"
            onClick={() => openPanel('settings')}
          >
            <img src="/pdv/settings.png" alt="" className="pdv__ico-img pdv__ico-img--foot" />
            <span>Configurações</span>
          </button>
          {isAdmin ? (
            <Link to="/painel" className="module-side-foot__link" onClick={() => setOpsMenuOpen(false)}>
              <AdminIcon name="home" />
              <span>Abrir Painel</span>
            </Link>
          ) : null}
        </div>
      </aside>

      {profileOpen ? (
        <div className="caixa-app__body">
          <header className="caixa-app__heading">
            <div>
              <p className="admin__kicker">PDV</p>
              <h1>Meu perfil</h1>
            </div>
            <div className="caixa-app__heading-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setOpsMenuOpen((open) => !open)}
              >
                {opsMenuOpen ? 'Fechar menu' : 'Abrir menu'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setProfileOpen(false);
                  setOpsMenuOpen(false);
                  focusCode();
                }}
              >
                Fechar
              </button>
            </div>
          </header>
          <div className="caixa-app__content">
            <OperatorProfilePanel workspaceLabel="PDV Marthi" />
          </div>
        </div>
      ) : (
      <section className="admin-page pdv pdv--caixa">
      {drawerFlash ? <p className="pdv__ok caixa-app__flash">{drawerFlash}</p> : null}

      <div className="pdv__caixa-body">
        <div className="pdv__caixa-main">
          <article className="admin-card pdv__scan">
            <form className="pdv__code" onSubmit={scan}>
              <label className="pdv__code-field">
                <span className="pdv__code-label">
                  {customization.showImei ? 'Código / SKU / IMEI' : 'Código / SKU / Barras'}
                </span>
                <input
                  ref={codeRef}
                  autoFocus
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      scan();
                    }
                  }}
                  placeholder={codePlaceholder}
                  autoComplete="off"
                />
                {searchMatches.length > 0 ? (
                  <div className="pdv__suggest" role="listbox">
                    {searchMatches.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="pdv__suggest-hit"
                        onClick={() => addItem(item, false, pendingQty)}
                      >
                        <strong>{item.name}</strong>
                        <span>
                          {item.sku || item.barcode || '—'} · {item.unit ?? 'UN'} ·{' '}
                          {money(item.price)}
                          {pendingQty != null ? ` · ×${formatPendingQty(pendingQty)}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </label>
              <button type="submit" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
              <div className="pdv__code-side">
                <button
                  type="button"
                  className="pdv__adhoc-desc"
                  onClick={() => {
                    if (!cashOpen) {
                      setError('Abra o caixa antes de lançar vendas (F7).');
                    } else if (canLaunchAdHoc) {
                      openPanel('ad_hoc');
                    } else {
                      setError('Venda Avulsa desativada neste caixa ou usuário sem permissão.');
                    }
                  }}
                  disabled={!cashOpen}
                  title={
                    canLaunchAdHoc
                      ? 'Lançar produto ou serviço avulso sem estoque (Alt+A)'
                      : 'Venda Avulsa não permitida neste caixa ou usuário sem permissão'
                  }
                >
                  <strong>+ Venda Avulsa</strong>
                </button>
                <button
                  type="button"
                  className="btn btn--primary pdv__pay-btn"
                  onClick={finish}
                  disabled={!pricedLines.length}
                >
                  Fechar {money(total)}
                </button>
              </div>
            </form>
            {pendingQty != null ? (
              <p className="pdv__ok">
                Quantidade {formatPendingQty(pendingQty)}* — escaneie, digite o código ou clique no
                estoque rápido
              </p>
            ) : null}
            {error ? <p className="pdv__alert">{error}</p> : null}
            {message && pendingQty == null ? <p className="pdv__ok">{message}</p> : null}
            {!tables.length || !payments.length ? (
              <p className="empty">
                Cadastre tabelas de preço e formas de pagamento no painel administrativo antes de
                vender.
              </p>
            ) : null}
          </article>

          <article className="admin-card pdv__quick pdv__quick--caixa">
            <div className="pdv__quick-head">
              <h3>Estoque rápido</h3>
              <span className="empty pdv__desk-only">
                Alt + número
                {pendingQty != null ? ` · ×${formatPendingQty(pendingQty)}` : ''}
              </span>
            </div>
            <div className="pdv__chips">
              {quickStock.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className="pdv__chip"
                  disabled={item.qty <= 0}
                  onClick={() => addItem(item, false, pendingQty)}
                  title={`Alt+${index + 1}${pendingQty != null ? ` · ${formatPendingQty(pendingQty)}*` : ''}`}
                >
                  <span className="pdv__chip-key">{index + 1}</span>
                  {stockItemImages(item)[0] ? (
                    <img src={stockItemImages(item)[0]} alt="" width={28} height={28} />
                  ) : (
                    <AdminIcon name="box" />
                  )}
                  <span className="pdv__chip-name">{item.name}</span>
                  <span className="pdv__chip-qty">
                    {formatQty(item.qty, item.unit === 'KG' ? 'KG' : 'UN')} {item.unit ?? 'UN'}
                  </span>
                </button>
              ))}
            </div>
          </article>

          <article className="admin-card pdv__cart pdv__cart--caixa">
            <div className="pdv__cart-header-row">
              <h2 style={{ margin: 0 }}>Itens</h2>
              {pricedLines.length > 0 ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  style={{ color: '#ef4444', fontSize: '0.76rem', padding: '2px 8px' }}
                  onClick={handleCancelCurrentSale}
                  title="Cancelar e descartar a venda atual em andamento"
                >
                  🗑️ Cancelar venda
                </button>
              ) : null}
            </div>
            <div className="pdv__cart-scroll">
              {pricedLines.length === 0 ? (
                <p className="empty">Nenhum item. Escaneie ou use o estoque rápido.</p>
              ) : (
                <div className="admin-table-container"><table className="admin-table pdv__cart-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Qtd</th>
                      <th>Unitário</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricedLines.map((line) => (
                      <tr key={line.key} className={lineAdjKey === line.key ? 'is-adj-open' : ''}>
                        <td>
                          <div className="pdv__line">
                            {stockItemImages(stock.find((item) => item.id === line.stockId))[0] ? (
                              <img
                                src={stockItemImages(stock.find((item) => item.id === line.stockId))[0]}
                                alt=""
                                width={36}
                                height={36}
                              />
                            ) : null}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <strong className="pdv__item">{line.name}</strong>
                                <PickupFields product={stock.find(item=>item.id===line.stockId)} methodId={line.pickupMethodId} address={line.deliveryAddress} onChange={(pickupMethodId,deliveryAddress,price)=>setLines(current=>current.map(entry=>entry.key===line.key?{...entry,pickupMethodId,deliveryAddress,unitPrice:price??entry.unitPrice}:entry))}/>
                                <SaleAttributeFields surface="pdv" product={stock.find(item=>item.id===line.stockId)} picked={line.attributes} onChange={attributes=>setLines(current=>current.map(entry=>entry.key===line.key ? {...entry,attributes} : entry))}/>
                                {line.isAdHoc ? (
                                  <span
                                    style={{
                                      background: '#e0f2fe',
                                      color: '#0369a1',
                                      padding: '0.1rem 0.4rem',
                                      borderRadius: '4px',
                                      fontSize: '0.68rem',
                                      fontWeight: 800,
                                      border: '1px solid #bae6fd',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.04em',
                                    }}
                                    title="Item lançado de forma avulsa sem movimentação de estoque"
                                  >
                                    Avulso
                                  </span>
                                ) : null}
                              </div>
                              <small>
                                {line.isAdHoc ? 'Sem estoque' : line.sku}
                                {line.imei ? ` · IMEI ${line.imei}` : ''}
                                {` · ${line.unit}`}
                                {line.tableName ? ` · ${line.tableName}` : ''}
                                {line.promoLabel ? (
                                  <span
                                    style={{
                                      marginLeft: '0.4rem',
                                      background: '#ecfdf5',
                                      color: '#047857',
                                      padding: '0.1rem 0.4rem',
                                      borderRadius: '4px',
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      border: '1px solid #a7f3d0',
                                    }}
                                    title={line.promoExplanation || line.promoLabel}
                                  >
                                    ✨ {line.promoLabel}
                                  </span>
                                ) : null}
                                {line.lineDiscMoney > 0 || line.lineSurMoney > 0
                                  ? ` · adj. ${money(line.lineSurMoney - line.lineDiscMoney)}`
                                  : ''}
                              </small>
                              {lineTableKey === line.key && tables.length > 0 ? (
                                <div className="pdv__line-table" style={{ marginTop: 6 }}>
                                  <AdminPicker
                                    label="Tabela de preço"
                                    value={line.priceTableId || defaultTableId}
                                    options={tables.map((item) => ({
                                      value: item.id,
                                      label: `${item.name} (${item.percent > 0 ? '+' : ''}${item.percent}%)`,
                                    }))}
                                    onChange={(val) => {
                                      patchLine(line.key, { priceTableId: val });
                                      setLineTableKey(null);
                                      focusCode();
                                    }}
                                  />
                                </div>
                              ) : null}
                              {lineAdjKey === line.key ? (
                                <div className="pdv__line-adj">
                                  <label>
                                    Desc.
                                    <span className="pdv__adj-input">
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={line.lineDiscount || ''}
                                        onChange={(e) =>
                                          patchLine(line.key, {
                                            lineDiscount: Number(e.target.value) || 0,
                                          })
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="pdv__adj-toggle"
                                        title="Alternar R$ / %"
                                        onClick={() =>
                                          patchLine(line.key, {
                                            lineDiscountMode:
                                              line.lineDiscountMode === 'money' ? 'percent' : 'money',
                                          })
                                        }
                                      >
                                        {line.lineDiscountMode === 'percent' ? '%' : 'R$'}
                                      </button>
                                    </span>
                                  </label>
                                  <label>
                                    Acr.
                                    <span className="pdv__adj-input">
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={line.lineSurcharge || ''}
                                        onChange={(e) =>
                                          patchLine(line.key, {
                                            lineSurcharge: Number(e.target.value) || 0,
                                          })
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="pdv__adj-toggle"
                                        title="Alternar R$ / %"
                                        onClick={() =>
                                          patchLine(line.key, {
                                            lineSurchargeMode:
                                              line.lineSurchargeMode === 'money' ? 'percent' : 'money',
                                          })
                                        }
                                      >
                                        {line.lineSurchargeMode === 'percent' ? '%' : 'R$'}
                                      </button>
                                    </span>
                                  </label>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <input
                            className="pdv__qty"
                            type="number"
                            min={isWeighedUnit(line.unit) ? 0.001 : 1}
                            step={isWeighedUnit(line.unit) ? 0.001 : 1}
                            value={line.qty}
                            onChange={(e) => changeQty(line.key, Number(e.target.value))}
                          />
                        </td>
                        <td>
                          {cashSettings.allowEditUnitPrice ? (
                            <CurrencyInput
                              className="pdv__price-edit"
                              value={line.basePrice}
                              ariaLabel="Preço base do item"
                              title="Preço base (antes da tabela)"
                              onChange={(val) => changeLineBasePrice(line.key, val)}
                            />
                          ) : (
                            <div>
                              {line.promoLabel && line.unitPrice < (line.tablePrice ?? line.basePrice) ? (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ textDecoration: 'line-through', fontSize: '0.74rem', color: '#94a3b8' }}>
                                    {money(line.tablePrice ?? line.basePrice)}
                                  </span>
                                  <span style={{ color: '#059669', fontWeight: 700 }}>
                                    {money(line.unitPrice)}
                                  </span>
                                </div>
                              ) : (
                                money(line.unitPrice)
                              )}
                            </div>
                          )}
                        </td>
                        <td className="price-red">{money(line.lineTotal)}</td>
                        <td>
                          <div className="pdv__line-actions">
                            <button
                              type="button"
                              className={`btn btn--ghost btn--icon pdv__line-ico ${
                                lineTableKey === line.key ? 'is-on' : ''
                              }`}
                              aria-label="Tabela de preço do item"
                              title={line.tableName ? `Tabela: ${line.tableName}` : 'Tabela de preço'}
                              onClick={() => {
                                setLineAdjKey(null);
                                setLineTableKey((prev) => (prev === line.key ? null : line.key));
                              }}
                            >
                              <img src="/pdv/price-table.png" alt="" className="pdv__ico-img" />
                            </button>
                            <button
                              type="button"
                              className={`btn btn--ghost btn--icon pdv__line-ico ${
                                lineAdjKey === line.key ? 'is-on' : ''
                              }`}
                              aria-label="Desconto ou acréscimo no item"
                              title="Desconto / acréscimo"
                              onClick={() => {
                                setLineTableKey(null);
                                setLineAdjKey((prev) => (prev === line.key ? null : line.key));
                              }}
                            >
                              <img src="/pdv/discount.png" alt="" className="pdv__ico-img" />
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--icon pdv__line-ico"
                              aria-label="Remover item"
                              title="Remover item"
                              onClick={() => removeLine(line.key)}
                            >
                              <img src="/pdv/trash.png" alt="" className="pdv__ico-img" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          </article>
        </div>

        <aside className="admin-card pdv__side pdv__side--caixa">
          <h2>Pagamento</h2>

          <section
            className={`pdv-client${clientPanelOpen ? ' is-open' : ''}${
              !walkIn || askCpf || sellerId ? ' has-detail' : ''
            }`}
            aria-label="Dados do cliente"
          >
            <div className="pdv-client__head">
              <h3>Dados do cliente</h3>
              <button
                type="button"
                className="pdv-split__add"
                aria-expanded={clientPanelOpen}
                title="Exibir ou ocultar cliente, CPF e vendedor · Alt+L"
                onClick={toggleClientPanel}
              >
                {clientPanelOpen ? 'Ocultar' : 'Exibir'}
                <kbd>Alt+L</kbd>
              </button>
            </div>

            <div className={`pdv-client__card${customerPickOpen ? ' is-picking' : ''}`}>
              {clientPanelOpen ? (
                <>
                  <div className={`pdv__consumer ${customerPickOpen ? 'is-picking' : ''}`}>
                    <button
                      type="button"
                      className="pdv__consumer-btn is-active"
                      onClick={() => setCustomerPickOpen((open) => !open)}
                      title="Buscar cliente cadastrado"
                    >
                      {walkIn ? 'Consumidor Final' : customerName}
                    </button>
                    <span className="empty">
                      {walkIn
                        ? 'Venda avulsa · clique para buscar cliente'
                        : `${customerPhone || 'Cliente cadastrado'} · clique para trocar`}
                    </span>
                    {customerPickOpen ? (
                      <div className="pdv__customer-pick">
                        <input
                          value={customerQuery}
                          onChange={(e) => setCustomerQuery(e.target.value)}
                          placeholder="Buscar nome ou telefone…"
                          autoFocus
                        />
                        <button
                          type="button"
                          className={`pdv__customer-hit ${walkIn ? 'is-active' : ''}`}
                          onClick={() => {
                            pickCustomer(undefined);
                            setCustomerPickOpen(false);
                            setCustomerQuery('');
                          }}
                        >
                          <strong>Consumidor Final</strong>
                          <span>Venda avulsa sem cadastro</span>
                        </button>
                        {customers
                          .filter((customer) => {
                            const needle = customerQuery.trim().toLowerCase();
                            if (!needle) return true;
                            return `${customer.name} ${customer.phone} ${customer.document ?? ''}`
                              .toLowerCase()
                              .includes(needle);
                          })
                          .slice(0, 8)
                          .map((customer) => (
                            <button
                              key={customer.id}
                              type="button"
                              className={`pdv__customer-hit ${
                                customerId === customer.id ? 'is-active' : ''
                              }`}
                              onClick={() => {
                                pickCustomer(customer);
                                setCustomerPickOpen(false);
                                setCustomerQuery('');
                              }}
                            >
                              <strong>{customer.name}</strong>
                              <span>{customer.phone || 'Sem telefone'}</span>
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="pdv__cpf-seller-row">
                    <div className="pdv__cpf-block">
                      <button
                        type="button"
                        className={`pdv__cpf-toggle${askCpf ? ' is-on' : ''}`}
                        aria-pressed={askCpf}
                        onClick={() => {
                          setAskCpf((prev) => {
                            if (prev) setCustomerCpf('');
                            return !prev;
                          });
                        }}
                      >
                        <span className="pdv__cpf-radio" aria-hidden />
                        <span>CPF na nota</span>
                      </button>
                      <input
                        className="pdv__cpf-inline"
                        value={customerCpf}
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        disabled={!askCpf}
                        onChange={(e) => setCustomerCpf(formatCpf(e.target.value))}
                        aria-label="CPF na nota"
                      />
                    </div>
                    <AdminPicker
                      label="Vendedor"
                      value={sellerId}
                      placeholder="Sem vendedor"
                      options={[
                        { value: '', label: 'Sem vendedor' },
                        ...sellers.map((item) => ({ value: item.id, label: item.name })),
                      ]}
                      onChange={setSellerId}
                    />
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="pdv-client__summary"
                  onClick={toggleClientPanel}
                  title="Exibir dados do cliente · Alt+L"
                >
                  <strong>{walkIn ? 'Consumidor Final' : customerName}</strong>
                  <span>{clientPanelSummary}</span>
                </button>
              )}
            </div>
          </section>

          <div className="admin-form pdv__form pdv__form--caixa pdv__form--compact">
            <div className="span-2">
              <CaixaPaymentSplit
                payments={payments}
                rows={splitRows}
                summary={paySummary}
                onPatch={patchSplit}
                onAdd={addSplit}
                onRemove={removeSplit}
                onOpenVale={() => openPanel('vale')}
              />
            </div>
            <div className="span-2 pdv__line-adj pdv__pay-adj">
              <label>
                Desc.
                <span className="pdv__adj-input">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                  />
                  <button
                    type="button"
                    className="pdv__adj-toggle"
                    title="Alternar R$ / %"
                    onClick={() =>
                      setDiscountMode((mode) => (mode === 'money' ? 'percent' : 'money'))
                    }
                  >
                    {discountMode === 'percent' ? '%' : 'R$'}
                  </button>
                </span>
              </label>
              <label>
                Acr.
                <span className="pdv__adj-input">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={surcharge}
                    onChange={(e) => setSurcharge(Number(e.target.value) || 0)}
                  />
                  <button
                    type="button"
                    className="pdv__adj-toggle"
                    title="Alternar R$ / %"
                    onClick={() =>
                      setSurchargeMode((mode) => (mode === 'money' ? 'percent' : 'money'))
                    }
                  >
                    {surchargeMode === 'percent' ? '%' : 'R$'}
                  </button>
                </span>
              </label>
            </div>
          </div>

          <dl className="pdv__totals pdv__totals--caixa">
            <div className="pdv__totals-meta">
              <dt>Itens</dt>
              <dd>
                {pricedLines.length}
                <span className="pdv__totals-hint">
                  {' '}
                  · {formatQty(unitCount, 'UN')} un
                  {weighedQty > 0 ? ` · ${formatQty(weighedQty, 'KG')} kg` : ''}
                </span>
              </dd>
            </div>
            <div>
              <dt>Subtotal</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            {discountMoney > 0 ? (
              <div className="pdv__totals-disc">
                <dt>Descontos</dt>
                <dd>−{money(discountMoney)}</dd>
              </div>
            ) : null}
            {surchargeMoney > 0 ? (
              <div className="pdv__totals-plus">
                <dt>Acréscimos</dt>
                <dd>+{money(surchargeMoney)}</dd>
              </div>
            ) : null}
            <div className="pdv__total">
              <dt>Total</dt>
              <dd className="price-red">{money(total)}</dd>
            </div>
            <div className="pdv__totals-paid">
              <dt>Pago</dt>
              <dd>{money(paySummary.allocated)}</dd>
            </div>
            {paySummary.remaining > 0.005 ? (
              <div className="pdv__totals-lack">
                <dt>Falta</dt>
                <dd className="price-red">{money(paySummary.remaining)}</dd>
              </div>
            ) : null}
            {paySummary.change > 0 ? (
              <div className="pdv__total-change">
                <dt>Troco</dt>
                <dd>{money(paySummary.change)}</dd>
              </div>
            ) : null}
          </dl>

          {!pricedLines.length && lastChange > 0 ? (
            <p className="pdv__change-banner">
              <span>Troco da última venda</span>
              <strong>{money(lastChange)}</strong>
            </p>
          ) : null}

          <div className="pdv__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={finish}
              disabled={!pricedLines.length}
            >
              {pricedLines.length && paySummary.remaining > 0.005
                ? `Falta ${money(paySummary.remaining)}`
                : 'F2 · Confirmar venda'}
            </button>
            {cashSettings.enableQuotes !== false ? (
              <button
                type="button"
                className="btn btn--secondary"
                style={{ background: '#0284c7', borderColor: '#0369a1', color: '#fff', fontWeight: 600 }}
                onClick={() => openPanel('save_quote')}
                disabled={!pricedLines.length}
                title="Salvar itens do carrinho como proposta/orçamento comercial"
              >
                📝 Salvar Orçamento
              </button>
            ) : null}
            {fiscalOn && lastOrderId ? (
              <button type="button" className="btn btn--ghost" onClick={() => emitFiscal(true)}>
                <AdminIcon name="fiscal" />
                F4 · NFC-e
              </button>
            ) : null}
          </div>
        </aside>
      </div>

      {panel ? (
        <CaixaPanelHost
          panel={panel}
          operatorName={operatorName}
          cashSession={cashSession}
          exchangeOrderId={exchangeOrderId}
          activeQuoteDraft={activeQuoteDraft}
          onConvertQuoteToCart={handleConvertQuoteToCart}
          onOpenPrintQuote={(q) => {
            setAutoPrintQuote(false);
            setPrintQuote(q);
          }}
          onQuoteSaved={(q, shouldAutoPrint) => {
            setLines([]);
            setAutoPrintQuote(Boolean(shouldAutoPrint));
            setPrintQuote(q);
          }}
          onClose={() => {
            setPanel(null);
            setExchangeOrderId(null);
            setCustomerPrefill(undefined);
            focusCode();
          }}
          onDone={(text) => {
            setMessage(text);
            setError(null);
          }}
          onError={(text) => setError(text)}
          onRefresh={refreshCash}
          onOpenExchange={(orderId) => {
            setExchangeOrderId(orderId);
            setPanel('exchange');
            setError(null);
          }}
          onCustomerCreated={(customer) => {
            setCustomers(getAdminState().customers);
            pickCustomer(customer);
            setCustomerPrefill(undefined);
          }}
          onAddAdHocLine={handleAddAdHocLine}
          onImportTotemTicket={handleImportTotemTicket}
          prefillCustomer={customerPrefill}
        />
      ) : null}

      <QuoteCommercialPrintModal
        quote={printQuote}
        open={Boolean(printQuote)}
        onClose={() => {
          setPrintQuote(null);
          setAutoPrintQuote(false);
        }}
        operatorName={operatorName}
        autoPrint={autoPrintQuote}
        onConvertToSale={(q) => handleConvertQuoteToCart(q, false)}
      />

      {deletePrompt ? (
        <div className="pdv__modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="pdv__modal-backdrop"
            aria-label="Fechar"
            onClick={() => {
              setDeletePrompt(null);
              setDeletePassword('');
            }}
          />
          <form className="admin-card pdv__modal-card" onSubmit={confirmDeleteLine}>
            <h2>Excluir item do carrinho</h2>
            <p className="empty">Informe a senha administrativa para autorizar a remoção do item.</p>
            <label>
              Senha administrativa
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </label>
            <div className="pdv__modal-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setDeletePrompt(null);
                  setDeletePassword('');
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary">
                Confirmar exclusão
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {cancelSalePrompt ? (
        <div className="pdv__modal" role="dialog" aria-modal="true">
          <button
            type="button"
            className="pdv__modal-backdrop"
            aria-label="Fechar"
            onClick={() => {
              setCancelSalePrompt(false);
              setCancelSalePassword('');
            }}
          />
          <form className="admin-card pdv__modal-card" onSubmit={confirmCancelSale}>
            <h2>Autorização: Cancelar Venda</h2>
            <p className="empty">
              Seu usuário não possui permissão para cancelar vendas. Digite a senha administrativa para autorizar o cancelamento.
            </p>
            <label>
              Senha administrativa
              <input
                type="password"
                value={cancelSalePassword}
                onChange={(e) => setCancelSalePassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </label>
            <div className="pdv__modal-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setCancelSalePrompt(false);
                  setCancelSalePassword('');
                }}
              >
                Voltar
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                style={{ background: '#ef4444', borderColor: '#dc2626' }}
              >
                Autorizar e Cancelar Venda
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {recoveryPromptOpen && selectedRecoveryDraft ? (
        <div className="pdv__modal" style={{ zIndex: 10010 }} role="dialog" aria-modal="true">
          <div className="admin-card pdv__modal-card" style={{ maxWidth: '540px', padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.75rem' }}>💾</span>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--ink, #0f172a)' }}>
                  Venda em Andamento Recuperada
                </h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--mute, #64748b)' }}>
                  Terminal: {selectedRecoveryDraft.terminalId} · ID: {selectedRecoveryDraft.localId}
                </span>
              </div>
            </div>

            <p style={{ margin: '8px 0 12px', fontSize: '0.9rem', lineHeight: 1.5, color: 'var(--ink, #0f172a)' }}>
              Identificamos uma venda iniciada anteriormente que não foi concluída neste terminal.
              <br />
              <span style={{ fontSize: '0.84rem', color: 'var(--mute, #64748b)' }}>
                Última alteração:{' '}
                <strong>
                  {new Date(selectedRecoveryDraft.updatedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </strong>
                {selectedRecoveryDraft.customer?.name &&
                selectedRecoveryDraft.customer.name !== CONSUMIDOR_FINAL
                  ? ` · Cliente: ${selectedRecoveryDraft.customer.name}`
                  : ''}
              </span>
            </p>

            {recoveredDrafts.length > 1 ? (
              <div style={{ marginBottom: '12px' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink, #0f172a)' }}>
                  Selecione a venda a retomar ({recoveredDrafts.length} encontradas):
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                  {recoveredDrafts.map((d) => (
                    <button
                      key={d.localId}
                      type="button"
                      className={`btn btn--ghost ${
                        d.localId === selectedRecoveryDraft.localId ? 'is-active' : ''
                      }`}
                      style={{
                        justifyContent: 'space-between',
                        textAlign: 'left',
                        padding: '8px 12px',
                        border: '1px solid var(--line)',
                        background:
                          d.localId === selectedRecoveryDraft.localId ? 'var(--card-2)' : 'transparent',
                      }}
                      onClick={() => setSelectedRecoveryDraft(d)}
                    >
                      <span>
                        <strong>#{d.localId}</strong> ({d.lines.length} itens)
                      </span>
                      <span>
                        {new Date(d.updatedAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                background: 'var(--card-2, rgba(0, 0, 0, 0.04))',
                border: '1px solid var(--line, rgba(148, 163, 184, 0.2))',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '16px',
                fontSize: '0.82rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  marginBottom: '6px',
                  paddingBottom: '4px',
                  borderBottom: '1px solid var(--line, rgba(148, 163, 184, 0.15))',
                }}
              >
                <span>Itens ({selectedRecoveryDraft.lines.length}):</span>
                <span style={{ color: 'var(--accent, #10b981)' }}>
                  Total:{' '}
                  {money(
                    selectedRecoveryDraft.lines.reduce(
                      (acc, cur) => acc + cur.unitPrice * cur.qty,
                      0,
                    ),
                  )}
                </span>
              </div>
              {selectedRecoveryDraft.lines.map((l, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '3px 0',
                    borderBottom: '1px dashed var(--line, rgba(148, 163, 184, 0.12))',
                  }}
                >
                  <span>
                    {l.qty} {l.unit} × {l.name}
                  </span>
                  <strong>{money(l.unitPrice * l.qty)}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ color: '#ef4444' }}
                onClick={() => {
                  if (
                    window.confirm(
                      'Deseja realmente DESCARTAR estes itens e iniciar uma nova venda em branco?',
                    )
                  ) {
                    void handleDiscardRecovery(selectedRecoveryDraft);
                  }
                }}
              >
                🗑️ Descartar Venda
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => handleConfirmRecovery(selectedRecoveryDraft)}
                autoFocus
              >
                ✓ Continuar Venda ({selectedRecoveryDraft.lines.length} itens)
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
      )}
      </div>

      <ExitOrLogoutDialog
        open={exitOpen}
        onClose={() => {
          setExitOpen(false);
          focusCode();
        }}
        appName="PDV"
        exitActionLabel="Sair do PDV"
        afterExitTo={user ? '/painel' : '/'}
      />
    </div>
  );
}

