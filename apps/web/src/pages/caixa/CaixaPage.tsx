import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { BrandLogo } from '../../components/BrandLogo';
import { ExitOrLogoutDialog } from '../../components/ExitOrLogoutDialog';
import { UserChip } from '../../components/UserChip';
import { OperatorProfilePanel } from '../../components/OperatorProfilePanel';
import { useAuth } from '../../contexts/AuthContext';
import {
  applyPriceTable,
  attachOrderCashSession,
  closePosSale,
  findStockByCode,
  findStockMatches,
  getAdminState,
  isWeighedUnit,
  normalizeSaleQty,
  stockItemImages,
  type Customer,
  type StockItem,
  type StockUnit,
} from '../../data/adminStore';
import {
  getOpenCashSession,
  openCashDrawer,
  registerCashSale,
  type CashSession,
} from '../../data/cashRegisterStore';
import {
  CASH_SETTINGS_EVENT,
  getCashSettings,
  readScaleKg,
  verifyDeleteItemPassword,
} from '../../data/cashSettings';
import { listSellers, userIsStoreAdmin } from '../../data/erpRegistry';
import {
  applyTierTotal,
  findCampaignsForStock,
  PROMO_EVENT,
} from '../../data/promoCampaignStore';
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
  /** Campanha aplicada (faixa / brinde). */
  promoLabel?: string;
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
  const [askCpf, setAskCpf] = useState(false);
  const [customerCpf, setCustomerCpf] = useState('');
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const fiscalOn = hasModule('fiscal');
  const isAdmin = userIsStoreAdmin(user?.email);
  const sellers = useMemo(() => listSellers(true), []);
  const codeRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef(lines);
  const finishRef = useRef<() => void>(() => undefined);
  const addSplitRef = useRef<() => void>(() => undefined);
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
    return () => {
      window.removeEventListener(CASH_SETTINGS_EVENT, sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener(PROMO_EVENT, sync);
    };
  }, []);

  const seller = sellers.find((item) => item.id === sellerId);
  const cashOpen = Boolean(cashSession);

  const pricedLines = useMemo(
    () =>
      lines.map((line) => {
        const lineTable =
          tables.find((item) => item.id === line.priceTableId) ??
          tables.find((item) => item.id === defaultTableId) ??
          tables[0];
        let unitPrice = applyPriceTable(line.basePrice, lineTable);
        let lineBase = Math.round(unitPrice * line.qty * 100) / 100;
        let promoLabel = '';
        const campaigns = findCampaignsForStock(line.stockId);
        const tier = campaigns.find((item) => item.kind === 'tier' && item.tiers.length > 0);
        if (tier) {
          lineBase = applyTierTotal(line.qty, unitPrice, tier.tiers);
          unitPrice = line.qty > 0 ? Math.round((lineBase / line.qty) * 100) / 100 : unitPrice;
          promoLabel = tier.name;
        }
        const gift = campaigns.find((item) => item.kind === 'gift');
        if (gift && line.qty >= gift.giftMinQty) {
          promoLabel = promoLabel
            ? `${promoLabel} · ${gift.name}`
            : `${gift.name} (brinde ≥${gift.giftMinQty})`;
        }
        const disc = moneyAdj(lineBase, line.lineDiscount, line.lineDiscountMode);
        const sur = moneyAdj(lineBase, line.lineSurcharge, line.lineSurchargeMode);
        const lineTotal = Math.max(0, lineBase - disc + sur);
        return {
          ...line,
          unitPrice,
          lineBase,
          lineDiscMoney: disc,
          lineSurMoney: sur,
          lineTotal,
          promoLabel,
          tableName: lineTable?.name ?? '',
        };
      }),
    [lines, tables, defaultTableId],
  );

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
        qtyAdd = readScaleKg() ?? 1;
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
    const camps = findCampaignsForStock(item.id);
    const promoHit = camps.find((c) => c.kind === 'tier' || (c.kind === 'gift' && nextQty >= c.giftMinQty));
    setMessage(
      promoHit
        ? `${item.name} · ${formatQty(addQty, unit)} ${unit} · campanha ${promoHit.name}`
        : `${item.name} · ${formatQty(addQty, unit)} ${unit}`,
    );
    focusCode();
  }
