import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminIcon } from '../../components/AdminIcons';
import { AdminPicker } from '../../components/AdminPicker';
import { BrandLogo } from '../../components/BrandLogo';
import { UserChip } from '../../components/UserChip';
import { OperatorProfilePanel } from '../../components/OperatorProfilePanel';
import { useAuth } from '../../contexts/AuthContext';
import {
  applyPriceTable,
  closePosSale,
  findStockByCode,
  getAdminState,
  stockItemImages,
  type Customer,
  type PaymentMethod,
  type PriceTable,
  type StockItem,
} from '../../data/adminStore';
import {
  getOpenCashSession,
  registerCashSale,
  type CashSession,
} from '../../data/cashRegisterStore';
import { listSellers } from '../../data/erpRegistry';
import { emitNfeFromSale, emitSaleCheckoutDocument, FISCAL_KIND_LABEL } from '../../data/fiscalDocuments';
import { hasDemoAccess } from '../../data/demoLeadStore';
import { hasModule } from '../../data/storePlan';
import { getTotemExitPassword } from '../../data/totemSettings';
import { CaixaPanelHost, type CaixaPanel } from './CaixaPanels';
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

type CartLine = {
  key: string;
  stockId: string;
  name: string;
  sku: string;
  imei: string;
  qty: number;
  basePrice: number;
  unitPrice: number;
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function lineKey(item: StockItem, scannedImei: boolean) {
  return scannedImei && item.imei ? `imei:${item.imei}` : `stk:${item.id}`;
}

export function CaixaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const operatorName = user?.name ?? 'Operador';
  const [exitOpen, setExitOpen] = useState(false);
  const [exitPassword, setExitPassword] = useState('');
  const [exitError, setExitError] = useState<string | null>(null);
  const initial = getAdminState();
  const [customers, setCustomers] = useState(initial.customers);
  const [stock, setStock] = useState(initial.stock);
  const tables = initial.priceTables.filter((item) => item.active);
  const payments = initial.payments.filter((item) => item.active);
  const [code, setCode] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState(CONSUMIDOR_FINAL);
  const [customerPhone, setCustomerPhone] = useState('');
  const [walkIn, setWalkIn] = useState(true);
  const [askCpf, setAskCpf] = useState(false);
  const [customerCpf, setCustomerCpf] = useState('');
  const defaultPayment = payments[0];
  const [paymentId, setPaymentId] = useState(defaultPayment?.id ?? '');
  const [tableId, setTableId] = useState(
    defaultPayment?.priceTableId && tables.some((item) => item.id === defaultPayment.priceTableId)
      ? defaultPayment.priceTableId
      : (tables[0]?.id ?? ''),
  );
  const [installments, setInstallments] = useState(1);
  const [discount, setDiscount] = useState(0);
  const [surcharge, setSurcharge] = useState(0);
  const [sellerId, setSellerId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastOrderAmount, setLastOrderAmount] = useState(0);
  const [lastCustomerName, setLastCustomerName] = useState('');
  const [cashSession, setCashSession] = useState<CashSession | null>(() => getOpenCashSession());
  const [panel, setPanel] = useState<CaixaPanel>(null);
  const [opsMenuOpen, setOpsMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [drawerFlash, setDrawerFlash] = useState<string | null>(null);
  const fiscalOn = hasModule('fiscal');
  const sellers = useMemo(() => listSellers(true), []);
  const codeRef = useRef<HTMLInputElement>(null);
  const linesRef = useRef(lines);
  const finishRef = useRef<() => void>(() => undefined);
  const openPanelRef = useRef<(op: Exclude<CaixaPanel, null>) => void>(() => undefined);
  const quickStock = useMemo(() => stock.filter((item) => item.qty > 0).slice(0, 10), [stock]);

  useEffect(() => {
    if (!hasDemoAccess('caixa') && !user) {
      navigate('/', { replace: true });
    }
  }, [navigate, user]);

  const table = tables.find((item) => item.id === tableId);
  const payment = payments.find((item) => item.id === paymentId);
  const seller = sellers.find((item) => item.id === sellerId);
  const cashOpen = Boolean(cashSession);

  const pricedLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        unitPrice: applyPriceTable(line.basePrice, table),
      })),
    [lines, table],
  );

  const subtotal = pricedLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const total = Math.max(0, subtotal - discount + surcharge);

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

  function addItem(item: StockItem, scannedImei: boolean) {
    const available = item.qty;
    if (available <= 0) {
      setError(`${item.name} sem estoque.`);
      return;
    }
    const key = lineKey(item, scannedImei);
    const current = linesRef.current;
    const existing = current.find((line) => line.key === key);
    const nextQty = (existing?.qty ?? 0) + 1;
    if (nextQty > available) {
      setError(`Estoque insuficiente para ${item.name} (${available} un.).`);
      return;
    }
    const unitPrice = applyPriceTable(item.price, table);
    const nextLine: CartLine = {
      key,
      stockId: item.id,
      name: item.name,
      sku: item.sku,
      imei: scannedImei ? item.imei : existing?.imei || item.imei,
      qty: nextQty,
      basePrice: item.price,
      unitPrice,
    };
    setLines(existing ? current.map((line) => (line.key === key ? nextLine : line)) : [...current, nextLine]);
    setError(null);
    setMessage(`${item.name} · Enter no código · F2 fecha`);
    focusCode();
  }

  function scan(event?: FormEvent) {
    event?.preventDefault();
    const needle = code.trim();
    if (!needle) {
      if (linesRef.current.length > 0) finishRef.current();
      return;
    }
    const item = findStockByCode(needle);
    if (!item) {
      setError('Produto não encontrado. Use SKU, código de barras ou IMEI.');
      setMessage(null);
      focusCode();
      return;
    }
    const compact = needle.toLowerCase().replace(/\s+/g, '');
    const scannedImei = item.imei.toLowerCase().replace(/\s+/g, '') === compact;
    addItem(item, scannedImei);
    setCode('');
  }

  function changeQty(key: string, qty: number) {
    const line = lines.find((item) => item.key === key);
    if (!line) return;
    const item = stock.find((entry) => entry.id === line.stockId);
    const max = item?.qty ?? 1;
    const nextQty = Math.max(1, Math.min(max, qty));
    setLines(lines.map((entry) => (entry.key === key ? { ...entry, qty: nextQty } : entry)));
  }

  function removeLine(key: string) {
    setLines(lines.filter((line) => line.key !== key));
    focusCode();
  }

  function onPaymentChange(id: string) {
    setPaymentId(id);
    const method = payments.find((item) => item.id === id);
    if (method?.priceTableId && tables.some((item) => item.id === method.priceTableId)) {
      setTableId(method.priceTableId);
    }
    setInstallments(1);
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
    if (!payment || !table) {
      setError('Cadastre tabela de preço e forma de pagamento no ERP antes de vender.');
      return;
    }
    const cpfDigits = onlyDigits(customerCpf);
    if (askCpf) {
      if (cpfDigits.length !== 11 || !isValidCpf(cpfDigits)) {
        setError('Informe um CPF válido para a nota.');
        return;
      }
    }
    const installmentLabel =
      payment.maxInstallments > 1 && installments > 1 ? ` ${installments}x` : '';
    const saleTotal = total;
    const saleCustomer = walkIn || !customerName.trim() ? CONSUMIDOR_FINAL : customerName.trim();
    const saleCpf = askCpf ? cpfDigits : '';
    try {
      const state = await closePosSale({
        ticketId: null,
        customerName: saleCustomer,
        customerPhone: walkIn ? '' : customerPhone.trim(),
        customerDocument: saleCpf,
        paymentName: `${payment.name}${installmentLabel}`,
        priceTableName: table.name,
        paymentMethodId: payment.id,
        priceTableId: table.id,
        discount,
        surcharge,
        sellerId: seller?.id,
        sellerName: seller?.name,
        lines: pricedLines.map((line) => ({
          stockId: line.stockId,
          name: line.name,
          qty: line.qty,
          unitPrice: line.unitPrice,
          imei: line.imei,
        })),
      });
      const order = state.orders[0];
      setLastOrderId(order?.id ?? null);
      setLastOrderAmount(saleTotal);
      setLastCustomerName(saleCustomer || order?.customerName || CONSUMIDOR_FINAL);
      setStock(state.stock);
      setCustomers(state.customers);
      setLines([]);
      setDiscount(0);
      setSurcharge(0);
      setSellerId('');
      setInstallments(1);
      setAskCpf(false);
      setCustomerCpf('');
      pickCustomer(undefined);
      setWalkIn(true);
      setPaymentId(payments[0]?.id ?? '');
      setTableId(
        payments[0]?.priceTableId && tables.some((item) => item.id === payments[0].priceTableId)
          ? payments[0].priceTableId
          : (tables[0]?.id ?? ''),
      );

      if (order) {
        registerCashSale(saleTotal, operatorName, `Venda ${order.id}`);
        refreshCash();
      }

      let docMsg = '';
      if (order) {
        const emitted = emitSaleCheckoutDocument({
          orderId: order.id,
          customerName: saleCustomer,
          amount: saleTotal,
          customerDocument: saleCpf,
          fiscalIntegrated: fiscalOn,
        });
        if (emitted.ok) {
          docMsg = ` · ${FISCAL_KIND_LABEL[emitted.document.kind]} ${emitted.document.number}`;
        }
      }

      setError(null);
      setMessage(`Pedido ${order?.id ?? ''} · ${money(saleTotal)}${docMsg}`);
      focusCode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao fechar a venda.');
    }
  }

  finishRef.current = finish;

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
    setExitPassword('');
    setExitError(null);
  }

  function confirmExit(event: FormEvent) {
    event.preventDefault();
    if (exitPassword.trim() !== getTotemExitPassword()) {
      setExitError('Senha incorreta. Só a loja pode sair do PDV.');
      return;
    }
    navigate(user ? '/painel' : '/');
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
        if (inCodeField || !typing) {
          setCode('');
          setError(null);
          focusCode();
        }
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (key === 'o') {
          event.preventDefault();
          setOpsMenuOpen((open) => !open);
          return;
        }
        if (key === 'c') {
          event.preventDefault();
          openPanelRef.current('sales');
          return;
        }
        if (key === 'v') {
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fiscalOn, lastOrderId, quickStock, code, table, cashOpen, panel, exitOpen, opsMenuOpen, profileOpen]);

  useEffect(() => {
    function onDrawer() {
      setDrawerFlash('Gaveta aberta (sinal enviado)');
      window.setTimeout(() => setDrawerFlash(null), 2500);
    }
    window.addEventListener('marthi-cash-drawer', onDrawer);
    return () => window.removeEventListener('marthi-cash-drawer', onDrawer);
  }, []);

  return (
    <div
      className={`caixa-app ${opsMenuOpen ? 'is-ops-open' : ''} ${profileOpen ? 'is-profile-dock' : ''}`}
    >
      <header className="caixa-app__top">
        <button
          type="button"
          className="caixa-app__ops-btn"
          aria-label="Operações do caixa · Alt+O"
          aria-expanded={opsMenuOpen}
          title="Operações · Alt+O"
          onClick={() => setOpsMenuOpen((open) => !open)}
        >
          <AdminIcon name="ops" />
          <kbd>Alt+O</kbd>
        </button>
        <BrandLogo variant="mark" className="caixa-app__mark" />
        <div className="caixa-app__brand">
          <strong>PDV · Caixa</strong>
        </div>
        <button type="button" className="caixa-app__exit" onClick={requestExit}>
          Sair
        </button>
      </header>

      {opsMenuOpen && !profileOpen ? (
        <button
          type="button"
          className="caixa-app__ops-backdrop"
          aria-label="Fechar operações"
          onClick={() => setOpsMenuOpen(false)}
        />
      ) : null}

      <div className="caixa-app__workspace">
        <aside
          className={`caixa-app__ops-drawer ${opsMenuOpen || profileOpen ? 'is-open' : ''}`}
          aria-hidden={!opsMenuOpen && !profileOpen}
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
              setOpsMenuOpen(true);
              setProfileOpen(true);
            }}
          />
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
          <button type="button" onClick={() => openPanel('sales')}>
            <kbd>Alt+C</kbd>
            <span>Consultar vendas</span>
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
      </aside>

      {profileOpen ? (
        <div className="caixa-app__body">
          <header className="caixa-app__heading">
            <div>
              <p className="admin__kicker">PDV</p>
              <h1>Meu perfil</h1>
            </div>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setProfileOpen(false);
                focusCode();
              }}
            >
              Fechar
            </button>
          </header>
          <div className="caixa-app__content">
            <OperatorProfilePanel workspaceLabel="PDV Marthi" />
          </div>
        </div>
      ) : (
      <section className="admin-page pdv pdv--caixa">
      <header className="pdv__caixa-bar">
        <div className="pdv__caixa-title">
          <p className="admin__kicker">Caixa</p>
          <h1>Lançar venda</h1>
        </div>
        <div className={`pdv__caixa-status ${cashOpen ? 'is-open' : 'is-closed'}`}>
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
              <span>Alt+O operações · F7 abre</span>
            </>
          )}
        </div>
        <div className="pdv__hotkeys" aria-label="Atalhos da venda">
          <kbd>Insert</kbd>
          <span>código</span>
          <kbd>Enter</kbd>
          <span>incluir</span>
          <kbd>F2</kbd>
          <span>fechar venda</span>
          <kbd>Esc</kbd>
          <span>limpar</span>
          {fiscalOn ? (
            <>
              <kbd>F4</kbd>
              <span>NFC-e</span>
            </>
          ) : null}
          <kbd>Alt+1…9</kbd>
          <span>estoque</span>
        </div>
      </header>
      {drawerFlash ? <p className="pdv__ok caixa-app__flash">{drawerFlash}</p> : null}

      <div className="pdv__caixa-body">
        <div className="pdv__caixa-main">
          <article className="admin-card pdv__scan">
            <form className="pdv__code" onSubmit={scan}>
              <label className="pdv__code-field">
                Código / SKU / IMEI
                <input
                  ref={codeRef}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Leia o código e pressione Enter"
                  autoComplete="off"
                />
              </label>
              <button type="submit" className="btn btn--primary">
                Incluir
              </button>
              <button
                type="button"
                className="btn btn--primary pdv__pay-btn"
                onClick={finish}
                disabled={!pricedLines.length}
              >
                F2 · Fechar {money(total)}
              </button>
            </form>
            {error ? <p className="pdv__alert">{error}</p> : null}
            {message ? <p className="pdv__ok">{message}</p> : null}
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
              <span className="empty">Alt + número</span>
            </div>
            <div className="pdv__chips">
              {quickStock.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className="pdv__chip"
                  disabled={item.qty <= 0}
                  onClick={() => addItem(item, false)}
                  title={`Alt+${index + 1}`}
                >
                  <span className="pdv__chip-key">{index + 1}</span>
                  {stockItemImages(item)[0] ? (
                    <img src={stockItemImages(item)[0]} alt="" width={28} height={28} />
                  ) : (
                    <AdminIcon name="box" />
                  )}
                  <span className="pdv__chip-name">{item.name}</span>
                  <span className="pdv__chip-qty">{item.qty} un.</span>
                </button>
              ))}
            </div>
          </article>

          <article className="admin-card pdv__cart pdv__cart--caixa">
            <h2>Itens</h2>
            <div className="pdv__cart-scroll">
              {pricedLines.length === 0 ? (
                <p className="empty">Nenhum item. Escaneie ou use o estoque rápido.</p>
              ) : (
                <table className="admin-table">
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
                      <tr key={line.key}>
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
                              <strong className="pdv__item">{line.name}</strong>
                              <small>
                                {line.sku}
                                {line.imei ? ` · IMEI ${line.imei}` : ''}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <input
                            className="pdv__qty"
                            type="number"
                            min={1}
                            value={line.qty}
                            onChange={(e) => changeQty(line.key, Number(e.target.value))}
                          />
                        </td>
                        <td>{money(line.unitPrice)}</td>
                        <td className="price-red">{money(line.unitPrice * line.qty)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn--ghost btn--icon"
                            aria-label="Remover item"
                            title="Remover item"
                            onClick={() => removeLine(line.key)}
                          >
                            <AdminIcon name="trash" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </article>
        </div>

        <aside className="admin-card pdv__side pdv__side--caixa">
          <h2>Pagamento</h2>
          <div className="pdv__consumer">
            <button
              type="button"
              className={`pdv__consumer-btn ${walkIn ? 'is-active' : ''}`}
              onClick={() => pickCustomer(undefined)}
            >
              Consumidor Final
            </button>
            <span className="empty">Venda avulsa sem cadastro</span>
          </div>
          <div className="admin-form pdv__form pdv__form--caixa">
            <AdminPicker
              className="span-2"
              label="Cliente cadastrado"
              value={customerId}
              placeholder="Consumidor Final"
              options={customers.map((customer) => ({
                value: customer.id,
                label: `${customer.name} · ${customer.phone}`,
              }))}
              onChange={(value) => pickCustomer(customers.find((item) => item.id === value))}
            />
            <label>
              Nome
              <input
                value={customerName}
                disabled={walkIn}
                onChange={(e) => {
                  setWalkIn(false);
                  setCustomerName(e.target.value);
                  setCustomerId('');
                }}
              />
            </label>
            <label>
              Telefone
              <input
                value={customerPhone}
                disabled={walkIn}
                onChange={(e) => {
                  setWalkIn(false);
                  setCustomerPhone(e.target.value);
                  setCustomerId('');
                }}
              />
            </label>
            <label className="span-2 pdv__cpf-check">
              <input
                type="checkbox"
                checked={askCpf}
                onChange={(e) => {
                  setAskCpf(e.target.checked);
                  if (!e.target.checked) setCustomerCpf('');
                }}
              />
              <span>
                Informar CPF na {fiscalOn ? 'NFC-e' : 'notinha'}
                <small>
                  {fiscalOn
                    ? 'Com Emissor Fiscal: ao fechar emite NFC-e.'
                    : 'Sem emissor: ao fechar gera notinha de venda.'}
                </small>
              </span>
            </label>
            {askCpf ? (
              <label className="span-2">
                CPF
                <input
                  value={customerCpf}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  onChange={(e) => setCustomerCpf(formatCpf(e.target.value))}
                />
              </label>
            ) : null}
            <AdminPicker
              className="span-2"
              label="Tabela"
              value={tableId}
              options={tables.map((item) => ({
                value: item.id,
                label: `${item.name} (${item.percent > 0 ? '+' : ''}${item.percent}%)`,
              }))}
              onChange={setTableId}
            />
            <AdminPicker
              className="span-2"
              label="Pagamento"
              value={paymentId}
              options={payments.map((item) => ({
                value: item.id,
                label: `${item.name}${linkedTableName(item, tables)}`,
              }))}
              onChange={onPaymentChange}
            />
            <AdminPicker
              className="span-2"
              label="Vendedor"
              value={sellerId}
              placeholder="Sem vendedor"
              options={sellers.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setSellerId}
            />
            {payment && payment.maxInstallments > 1 && pricedLines.length > 0 ? (
              <AdminPicker
                className="span-2"
                label="Parcelas"
                value={String(installments)}
                options={Array.from({ length: payment.maxInstallments }, (_, index) => {
                  const count = index + 1;
                  return {
                    value: String(count),
                    label: `${count}x de ${money(total / count)}`,
                  };
                })}
                onChange={(value) => setInstallments(Number(value))}
              />
            ) : null}
            <label>
              Desconto
              <input
                type="number"
                min={0}
                value={discount || ''}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Acréscimo
              <input
                type="number"
                min={0}
                value={surcharge || ''}
                onChange={(e) => setSurcharge(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <dl className="pdv__totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{money(subtotal)}</dd>
            </div>
            <div className="pdv__total">
              <dt>Total</dt>
              <dd className="price-red">{money(total)}</dd>
            </div>
          </dl>

          <div className="pdv__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={finish}
              disabled={!pricedLines.length}
            >
              F2 · Confirmar venda
            </button>
            {fiscalOn && lastOrderId ? (
              <button type="button" className="btn btn--ghost" onClick={() => emitFiscal(true)}>
                <AdminIcon name="fiscal" />
                F4 · NFC-e
              </button>
            ) : (
              <button type="button" className="btn btn--ghost" onClick={() => openPanel('sales')}>
                Consultar vendas
              </button>
            )}
          </div>
        </aside>
      </div>

      {panel ? (
        <CaixaPanelHost
          panel={panel}
          operatorName={operatorName}
          cashSession={cashSession}
          onClose={() => {
            setPanel(null);
            focusCode();
          }}
          onDone={(text) => {
            setMessage(text);
            setError(null);
          }}
          onError={(text) => setError(text)}
          onRefresh={refreshCash}
          onCustomerCreated={(customer) => {
            setCustomers(getAdminState().customers);
            pickCustomer(customer);
          }}
        />
      ) : null}
    </section>
      )}
      </div>

      {exitOpen ? (
        <div className="caixa-lock" role="dialog" aria-modal="true" aria-labelledby="caixa-exit-title">
          <form className="caixa-lock__card" onSubmit={confirmExit}>
            <h2 id="caixa-exit-title">Saída protegida</h2>
            <p>Digite a senha da loja para sair do PDV. O operador não acessa o painel por aqui.</p>
            {exitError ? (
              <p className="pdv__alert" role="alert">
                {exitError}
              </p>
            ) : null}
            <label>
              Senha
              <input
                type="password"
                value={exitPassword}
                onChange={(e) => setExitPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </label>
            <div className="caixa-lock__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setExitOpen(false);
                  focusCode();
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary">
                Sair do PDV
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function linkedTableName(method: PaymentMethod, tables: PriceTable[]) {
  const table = tables.find((item) => item.id === method.priceTableId);
  return table ? ` · ${table.name}` : '';
}
