import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import {
  adjustStockQty,
  cancelPosSaleOrder,
  findStockByCode,
  findStockMatches,
  getAdminState,
  getOrderById,
  restorePosSaleOrder,
  searchOrders,
  updatePosSaleOrder,
  upsertCustomer,
  type Customer,
  type PaymentMethod,
  type SalesOrder,
  type StockItem,
} from '../../data/adminStore';
import {
  hoursLeftLabel,
  listCanceledSalesWithinWindow,
  markCanceledSaleRestored,
  registerCanceledSale,
  type CanceledSaleEntry,
  CANCELED_SALES_EVENT,
} from '../../data/canceledSalesStore';
import {
  addCashAporte,
  addCashSangria,
  APORTE_REASONS,
  cancelStoreCredit,
  cashBeneficiaryLabel,
  CASH_KIND_LABEL,
  closeCashSession,
  deleteCashMovement,
  findCashSessionForOrder,
  issueStoreCredit,
  listCashSessions,
  listStoreCredits,
  openCashDrawer,
  openCashSession,
  redeemStoreCredit,
  registerExchange,
  reopenCashSession,
  getOpenCashSession,
  SANGRIA_REASONS,
  summarizeCashSession,
  updateCashMovement,
  type CashBeneficiaryType,
  type CashCloseBreakdown,
  type CashMovement,
  type CashSession,
  type ExchangeLine,
} from '../../data/cashRegisterStore';
import {
  getCashSettings,
  updateCashSettings,
  type CashSettings,
} from '../../data/cashSettings';
import { listEmployees, userIsStoreAdmin } from '../../data/erpRegistry';
import { lookupCep, maskCep } from '../../services/cep';
import {
  cancelFiscalDocumentForSale,
  emitNfeFromSale,
  FISCAL_KIND_LABEL,
  FISCAL_STATUS_LABEL,
  getLatestFiscalDocumentForRef,
  reprintFiscalDocument,
} from '../../data/fiscalDocuments';
import { hasModule } from '../../data/storePlan';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function stripQtyPrefix(label: string) {
  return label.replace(/^\d+\s*x\s*/i, '').trim();
}

function namesMatch(a: string, b: string) {
  const left = stripQtyPrefix(a).toLowerCase();
  const right = stripQtyPrefix(b).toLowerCase();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function returnLinesFromOrder(order: SalesOrder): ExchangeLine[] {
  const bare = stripQtyPrefix(order.productName.split(',')[0] ?? order.productName);
  const match =
    findStockMatches(bare, 8).find((item) => namesMatch(item.name, bare)) ??
    findStockMatches(bare, 1)[0];
  if (match) {
    return [
      {
        stockId: match.id,
        name: match.name,
        sku: match.sku,
        qty: 1,
        unitPrice: roundMoney(order.amount),
      },
    ];
  }
  return [
    {
      stockId: `sale:${order.id}`,
      name: bare || order.productName,
      sku: '',
      qty: 1,
      unitPrice: roundMoney(order.amount),
    },
  ];
}

function formatDateTimeLocal(iso?: string) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplay(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

type ClosePayChannel = 'cash' | 'pix' | 'debit' | 'credit' | 'check' | 'deposit' | 'other';

function classifySalePayment(payment: string, methods: PaymentMethod[]): ClosePayChannel {
  const blob = payment.toLowerCase();
  if (/cheque|cheq/.test(blob)) return 'check';
  if (/dep[oó]sito|transfer/.test(blob)) return 'deposit';
  if (/pix/.test(blob)) return 'pix';
  if (/d[eé]bito|debit/.test(blob)) return 'debit';
  if (/cr[eé]dito|credit|cart[aã]o/.test(blob) && !/d[eé]bito/.test(blob)) return 'credit';
  if (/dinheiro|esp[eé]cie|cash/.test(blob)) return 'cash';
  const matched = methods.find((item) => blob.includes(item.name.toLowerCase()));
  if (matched?.type === 'cash') return 'cash';
  if (matched?.type === 'pix') return 'pix';
  if (matched?.type === 'debit') return 'debit';
  if (matched?.type === 'credit') return 'credit';
  return 'other';
}

function parseMoneyInput(value: string) {
  const raw = String(value).trim();
  if (!raw) return 0;
  if (raw.includes(',')) {
    return Math.max(0, Number(raw.replace(/\./g, '').replace(',', '.')) || 0);
  }
  return Math.max(0, Number(raw.replace(/\s/g, '')) || 0);
}

function formatMoneyField(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type CaixaPanel =
  | 'sales'
  | 'canceled'
  | 'open'
  | 'aporte'
  | 'sangria'
  | 'movements'
  | 'exchange'
  | 'vale'
  | 'close'
  | 'sessions'
  | 'price'
  | 'customer'
  | 'settings'
  | null;

type PanelProps = {
  panel: Exclude<CaixaPanel, null>;
  operatorName: string;
  cashSession: CashSession | null;
  exchangeOrderId?: string | null;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => void;
  onOpenExchange?: (orderId: string) => void;
  onCustomerCreated?: (customer: Customer) => void;
};

export function CaixaPanelHost(props: PanelProps) {
  const { panel, onClose } = props;
  return (
    <div className="pdv__modal" role="dialog" aria-modal="true">
      <button type="button" className="pdv__modal-backdrop" aria-label="Fechar" onClick={onClose} />
      <div className="admin-card pdv__modal-card pdv__modal-card--wide">
        {panel === 'sales' ? <SalesPanel {...props} /> : null}
        {panel === 'canceled' ? <CanceledSalesPanel {...props} /> : null}
        {panel === 'open' ? <OpenPanel {...props} /> : null}
        {panel === 'aporte' || panel === 'sangria' ? <SupplyPanel {...props} kind={panel} /> : null}
        {panel === 'movements' ? <MovementsPanel {...props} /> : null}
        {panel === 'exchange' ? <ExchangePanel {...props} /> : null}
        {panel === 'vale' ? <ValePanel {...props} /> : null}
        {panel === 'close' ? <ClosePanel {...props} /> : null}
        {panel === 'sessions' ? <SessionsPanel {...props} /> : null}
        {panel === 'price' ? <PricePanel {...props} /> : null}
        {panel === 'customer' ? <CustomerQuickPanel {...props} /> : null}
        {panel === 'settings' ? <CashSettingsPanel {...props} /> : null}
      </div>
    </div>
  );
}

function SalesPanel({ onClose, onDone, onError, onOpenExchange }: PanelProps) {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirmDialog();
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');
  const [selected, setSelected] = useState<SalesOrder | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDocument, setEditDocument] = useState('');
  const [editPayment, setEditPayment] = useState('');
  const [editItems, setEditItems] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editAt, setEditAt] = useState('');
  const [tick, setTick] = useState(0);
  const fiscalOn = hasModule('fiscal');
  const sessions = useMemo(() => listCashSessions(), [tick]);
  const hits = useMemo(() => {
    const base = searchOrders({
      query,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 120,
    });
    if (!sessionFilter) return base.slice(0, 60);
    return base
      .filter((order) => {
        if (order.cashSessionId === sessionFilter) return true;
        return findCashSessionForOrder(order.id)?.id === sessionFilter;
      })
      .slice(0, 60);
  }, [query, dateFrom, dateTo, sessionFilter, tick]);
  const fiscal = selected
    ? getLatestFiscalDocumentForRef('sale', selected.id)
    : null;
  const selectedSession =
    selected?.cashSessionId
      ? sessions.find((item) => item.id === selected.cashSessionId) ?? null
      : selected
        ? findCashSessionForOrder(selected.id)
        : null;
  const canEmitNfce =
    Boolean(selected) &&
    selected?.status === 'sold' &&
    fiscalOn &&
    (!fiscal || fiscal.kind === 'receipt' || fiscal.status === 'cancelled' || fiscal.status === 'error');
  const canEdit = Boolean(selected && selected.status === 'sold');
  const canExchange = Boolean(selected && selected.status === 'sold' && onOpenExchange);

  function refresh() {
    setTick((value) => value + 1);
    if (selected) {
      const next = getOrderById(selected.id);
      setSelected(next);
      if (next && editing) startEdit(next);
    }
  }

  function startEdit(order: SalesOrder) {
    setEditing(true);
    setEditName(order.customerName);
    setEditDocument(order.customerDocument ?? '');
    setEditPayment(order.payment);
    setEditItems(order.productName);
    setEditAmount(String(order.amount));
    setEditAt(formatDateTimeLocal(order.createdAt));
  }

  function cancelEdit() {
    setEditing(false);
  }

  function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const result = updatePosSaleOrder({
      orderId: selected.id,
      customerName: editName,
      customerDocument: editDocument,
      payment: editPayment,
      productName: editItems,
      amount: Number(editAmount.replace(',', '.')) || 0,
      createdAt: editAt,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'pdv.venda.editar',
      detail: `${result.order.id} · ${money(result.order.amount)}`,
    });
    setSelected(result.order);
    setEditing(false);
    setTick((value) => value + 1);
    onDone(`Venda ${result.order.id} atualizada.`);
  }

  function reprint() {
    if (!selected) return;
    const result = reprintFiscalDocument(selected.id);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onDone(`Reimpressão · ${FISCAL_KIND_LABEL[result.document.kind]} ${result.document.number}`);
    window.alert(result.text);
  }

  function emitNfce() {
    if (!selected) return;
    const result = emitNfeFromSale({
      orderId: selected.id,
      customerName: selected.customerName,
      amount: selected.amount,
      asNfce: true,
      customerDocument: selected.customerDocument,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    refresh();
    onDone(
      `${FISCAL_KIND_LABEL[result.document.kind]} ${result.document.number} · ${FISCAL_STATUS_LABEL[result.document.status]}`,
    );
  }

  async function cancelSale() {
    if (!selected) return;
    const ok = await confirm({
      title: 'Cancelar venda?',
      message: `Tem certeza que deseja cancelar a venda ${selected.id}? Ela ficará disponível para estorno por 24 horas.`,
      confirmLabel: 'Cancelar venda',
      danger: true,
    });
    if (!ok) return;
    const fiscalCancel = cancelFiscalDocumentForSale(selected.id);
    const result = cancelPosSaleOrder(selected.id);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    registerCanceledSale({
      order: result.order,
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
    });
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'pdv.venda.cancelar',
      detail: `${result.order.id} · ${money(result.order.amount)} · estorno 24h`,
    });
    refresh();
    onDone(
      `Venda ${result.order.id} cancelada (estorno 24h)${fiscalCancel.ok ? ` · ${FISCAL_KIND_LABEL[fiscalCancel.document.kind]} cancelada` : ''}`,
    );
  }

  function sessionLabel(order: SalesOrder) {
    if (order.cashSessionId) return order.cashSessionId;
    return findCashSessionForOrder(order.id)?.id ?? '—';
  }

  return (
    <div className="caixa-panel caixa-panel--sales">
      {dialog}
      <div className="caixa-panel__head">
        <h2>Consultar vendas</h2>
        <p className="empty">
          Filtre por data/hora e caixa. Edite, emita NFC-e ou abra uma troca a partir da venda.
        </p>
      </div>

      <div className="caixa-panel__filters">
        <label className="caixa-panel__full">
          Buscar
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setEditing(false);
            }}
            placeholder="PED-… / Maria / iPhone / Pix"
            autoFocus
          />
        </label>
        <label>
          De
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setSelected(null);
              setEditing(false);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setSelected(null);
              setEditing(false);
            }}
          />
        </label>
        <label>
          Caixa
          <select
            value={sessionFilter}
            onChange={(e) => {
              setSessionFilter(e.target.value);
              setSelected(null);
              setEditing(false);
            }}
          >
            <option value="">Todos os caixas</option>
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.id} · {session.status === 'open' ? 'Aberto' : 'Fechado'} ·{' '}
                {formatDisplay(session.openedAt)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="caixa-sales-list" role="list">
        {hits.length === 0 ? (
          <p className="empty caixa-sales-list__empty">
            {query || dateFrom || dateTo || sessionFilter
              ? 'Nenhuma venda encontrada com esses filtros.'
              : 'Nenhuma venda ainda.'}
          </p>
        ) : (
          hits.map((order) => {
            const doc = getLatestFiscalDocumentForRef('sale', order.id);
            const status =
              order.status === 'cancelled'
                ? 'Cancelada'
                : doc
                  ? FISCAL_STATUS_LABEL[doc.status]
                  : 'Sem DF-e';
            return (
              <button
                key={order.id}
                type="button"
                role="listitem"
                className={`caixa-sales-card ${selected?.id === order.id ? 'is-selected' : ''}`}
                onClick={() => {
                  setSelected(order);
                  setEditing(false);
                }}
              >
                <div className="caixa-sales-card__top">
                  <strong>{order.id}</strong>
                  <span className="price-red">{money(order.amount)}</span>
                </div>
                <div className="caixa-sales-card__meta">
                  <span>{order.customerName}</span>
                  <span>{sessionLabel(order)}</span>
                </div>
                <div className="caixa-sales-card__foot">
                  <em>{order.productName}</em>
                  <span>
                    {status} · {formatDisplay(order.createdAt)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {selected ? (
        <div className="caixa-panel__detail">
          {editing ? (
            <form className="caixa-panel__edit" onSubmit={saveEdit}>
              <div className="caixa-panel__grid">
                <label className="caixa-panel__full">
                  Cliente
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} required />
                </label>
                <label>
                  Documento
                  <input
                    value={editDocument}
                    onChange={(e) => setEditDocument(e.target.value)}
                    placeholder="CPF/CNPJ"
                  />
                </label>
                <label>
                  Valor
                  <input
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                <label className="caixa-panel__full">
                  Pagamento
                  <input
                    value={editPayment}
                    onChange={(e) => setEditPayment(e.target.value)}
                    required
                  />
                </label>
                <label className="caixa-panel__full">
                  Itens
                  <input value={editItems} onChange={(e) => setEditItems(e.target.value)} required />
                </label>
                <label className="caixa-panel__full">
                  Data/hora da venda
                  <input
                    type="datetime-local"
                    value={editAt}
                    onChange={(e) => setEditAt(e.target.value)}
                    required
                  />
                </label>
              </div>
              <div className="caixa-panel__actions">
                <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
                  Descartar
                </button>
                <button type="submit" className="btn btn--primary">
                  Salvar edição
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="caixa-panel__summary">
                <div>
                  <span>Pedido</span>
                  <strong>{selected.id}</strong>
                </div>
                <div>
                  <span>Cliente</span>
                  <strong>{selected.customerName}</strong>
                </div>
                <div>
                  <span>Documento</span>
                  <strong>{selected.customerDocument || '—'}</strong>
                </div>
                <div>
                  <span>Pagamento</span>
                  <strong>{selected.payment}</strong>
                </div>
                <div>
                  <span>Caixa</span>
                  <strong>
                    {selectedSession
                      ? `${selectedSession.id} · ${selectedSession.status === 'open' ? 'Aberto' : 'Fechado'}`
                      : sessionLabel(selected)}
                  </strong>
                </div>
                <div>
                  <span>SEFAZ / DF-e</span>
                  <strong className={fiscal?.status === 'authorized' ? 'pdv__ok' : undefined}>
                    {fiscal
                      ? `${FISCAL_KIND_LABEL[fiscal.kind]} · ${FISCAL_STATUS_LABEL[fiscal.status]}`
                      : 'Sem documento fiscal'}
                  </strong>
                </div>
                <div>
                  <span>Quando</span>
                  <strong>{formatDisplay(selected.createdAt)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong className="price-red">{money(selected.amount)}</strong>
                </div>
              </div>
              {fiscal ? (
                <p className="empty caixa-panel__fiscal-note">
                  {fiscal.kind !== 'receipt'
                    ? `Nº ${fiscal.number}/${fiscal.series} · chave ${fiscal.accessKey.slice(0, 20)}…`
                    : `Notinha ${fiscal.number}`}
                </p>
              ) : null}
              <div className="caixa-panel__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => startEdit(selected)}
                  disabled={!canEdit}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => onOpenExchange?.(selected.id)}
                  disabled={!canExchange}
                >
                  Criar troca
                </button>
                <button type="button" className="btn btn--ghost" onClick={reprint} disabled={!fiscal}>
                  Reimprimir
                </button>
                {canEmitNfce ? (
                  <button type="button" className="btn btn--ghost" onClick={emitNfce}>
                    Emitir NFC-e
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void cancelSale()}
                  disabled={selected.status === 'cancelled'}
                >
                  Cancelar venda
                </button>
                <button type="button" className="btn btn--primary" onClick={onClose}>
                  Fechar
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="pdv__modal-actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

function CanceledSalesPanel({ onClose, onDone, onError }: PanelProps) {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirmDialog();
  const [entries, setEntries] = useState<CanceledSaleEntry[]>(() => listCanceledSalesWithinWindow());

  useEffect(() => {
    function refresh() {
      setEntries(listCanceledSalesWithinWindow());
    }
    refresh();
    window.addEventListener(CANCELED_SALES_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CANCELED_SALES_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  async function restore(entry: CanceledSaleEntry) {
    const ok = await confirm({
      title: 'Estornar cancelamento?',
      message: `Tem certeza que deseja restaurar a venda ${entry.orderId}? O cancelamento será revertido.`,
      confirmLabel: 'Restaurar venda',
      danger: false,
    });
    if (!ok) return;
    const result = restorePosSaleOrder(entry.orderId, entry.snapshot);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    markCanceledSaleRestored(entry.id);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'pdv.venda.restaurar',
      detail: `${result.order.id} · ${money(result.order.amount)} · estorno do cancelamento`,
    });
    setEntries(listCanceledSalesWithinWindow());
    onDone(`Venda ${result.order.id} restaurada (estorno do cancelamento).`);
  }

  return (
    <div className="caixa-panel caixa-panel--canceled">
      {dialog}
      <div className="caixa-panel__head">
        <h2>Vendas canceladas (24h)</h2>
        <p className="empty">
          Cancelamentos recentes ficam aqui por 24 horas para possível estorno. Depois são removidos
          automaticamente.
        </p>
      </div>
      <div className="caixa-panel__table">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Valor</th>
              <th>Cancelado em</th>
              <th>Expira em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <p className="empty">Nenhuma venda cancelada na janela de 24h.</p>
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.orderId}</td>
                  <td>{entry.snapshot.customerName}</td>
                  <td className="price-red">{money(entry.snapshot.amount)}</td>
                  <td>{formatDisplay(entry.canceledAt)}</td>
                  <td>{hoursLeftLabel(entry.expiresAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => void restore(entry)}
                    >
                      Restaurar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function OpenPanel({ operatorName, onClose, onDone, onError, onRefresh }: PanelProps) {
  const [name, setName] = useState(operatorName);
  const [amount, setAmount] = useState('100');
  const [at, setAt] = useState(formatDateTimeLocal());
  const [note, setNote] = useState('');
  const [drawerMsg, setDrawerMsg] = useState<string | null>(null);

  function openDrawer() {
    openCashDrawer(name || operatorName, 'Contagem antes da abertura');
    setDrawerMsg('Sinal enviado à gaveta (simulado). Conte o dinheiro e informe o valor.');
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = openCashSession({
      openingFloat: Number(amount.replace(',', '.')) || 0,
      operatorName: name,
      note,
      openedAt: at,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onRefresh();
    onDone(
      `Caixa ${result.session.id} aberto · ${money(result.session.openingFloat)} · ${formatDisplay(result.session.openedAt)}`,
    );
    onClose();
  }

  return (
    <form className="caixa-panel caixa-panel--fit" onSubmit={submit}>
      <div className="caixa-panel__head">
        <h2>Abrir caixa</h2>
        <p className="empty">
          Informe operador, data/hora e fundo de troco. Use a gaveta para contar o dinheiro antes de
          confirmar.
        </p>
      </div>
      <div className="caixa-panel__body">
      <div className="caixa-panel__grid">
        <label>
          Operador
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Data e hora
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
        </label>
        <label>
          Valor do caixa (fundo)
          <input
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        <label>
          Observação
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </label>
      </div>
      {drawerMsg ? <p className="pdv__ok">{drawerMsg}</p> : null}
      </div>
      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--ghost" onClick={openDrawer}>
          Abrir gaveta
        </button>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary">
          Confirmar abertura
        </button>
      </div>
    </form>
  );
}

function SupplyPanel({
  kind,
  operatorName,
  cashSession,
  onClose,
  onDone,
  onError,
  onRefresh,
}: PanelProps & { kind: 'aporte' | 'sangria' }) {
  const reasons = kind === 'aporte' ? APORTE_REASONS : SANGRIA_REASONS;
  const employees = useMemo(() => listEmployees(true), []);
  const [amount, setAmount] = useState('');
  const [at, setAt] = useState(formatDateTimeLocal());
  const [reason, setReason] = useState<string>(reasons[0]);
  const [note, setNote] = useState('');
  const [beneficiaryType, setBeneficiaryType] = useState<CashBeneficiaryType>('store');
  const [employeeId, setEmployeeId] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (beneficiaryType === 'employee' && !employeeId) {
      onError('Selecione o funcionário.');
      return;
    }
    const employee = employees.find((item) => item.id === employeeId);
    const payload = {
      amount: Number(amount.replace(',', '.')) || 0,
      reason,
      note: note.trim() || reason,
      beneficiaryType,
      beneficiaryId: beneficiaryType === 'employee' ? employeeId : undefined,
      beneficiaryName: beneficiaryType === 'employee' ? employee?.name : 'Loja',
      operatorName,
      at,
    };
    const result = kind === 'aporte' ? addCashAporte(payload) : addCashSangria(payload);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onRefresh();
    onDone(
      `${kind === 'aporte' ? 'Aporte' : 'Sangria'} · ${reason} · ${payload.beneficiaryName} · ${money(payload.amount)}`,
    );
    onClose();
  }

  return (
    <form className="caixa-panel caixa-panel--fit" onSubmit={submit}>
      <div className="caixa-panel__head">
        <h2>{kind === 'aporte' ? 'Aporte / suprimento' : 'Sangria'}</h2>
        <p className="empty">
          Caixa {cashSession?.id ?? '—'} · esperado {money(cashSession?.expectedCash ?? 0)}
        </p>
      </div>
      <div className="caixa-panel__body">
      <div className="caixa-panel__grid">
        <label>
          Valor
          <input
            type="number"
            step="0.01"
            min={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Data e hora
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
        </label>
        <AdminPicker
          label="Motivo"
          value={reason}
          options={[...reasons]}
          onChange={setReason}
        />
        <AdminPicker
          label="Para quem"
          value={beneficiaryType}
          options={[
            { value: 'store', label: 'Loja' },
            { value: 'employee', label: 'Funcionário' },
          ]}
          onChange={(value) => {
            const next = value as CashBeneficiaryType;
            setBeneficiaryType(next);
            if (next === 'store') setEmployeeId('');
          }}
        />
        {beneficiaryType === 'employee' ? (
          <AdminPicker
            className="caixa-panel__full"
            label="Funcionário"
            value={employeeId}
            placeholder="Selecione…"
            options={employees.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setEmployeeId}
          />
        ) : null}
        <label className="caixa-panel__full">
          Observação (opcional)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Detalhe extra, se precisar"
          />
        </label>
      </div>
      </div>
      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary">
          Confirmar
        </button>
      </div>
    </form>
  );
}

type CashSupplyMovement = CashMovement & { kind: 'aporte' | 'sangria' };

function MovementsPanel({ cashSession, onClose, onDone, onError, onRefresh }: PanelProps) {
  const { confirm, dialog } = useConfirmDialog();
  const employees = useMemo(() => listEmployees(true), []);
  const rows = useMemo(
    () =>
      (cashSession?.movements ?? [])
        .filter((item): item is CashSupplyMovement => item.kind === 'aporte' || item.kind === 'sangria')
        .slice()
        .reverse(),
    [cashSession],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editAt, setEditAt] = useState('');
  const [editBeneficiaryType, setEditBeneficiaryType] = useState<CashBeneficiaryType>('store');
  const [editEmployeeId, setEditEmployeeId] = useState('');

  function reasonsFor(kind: 'aporte' | 'sangria'): string[] {
    return kind === 'aporte' ? [...APORTE_REASONS] : [...SANGRIA_REASONS];
  }

  function startEdit(row: CashSupplyMovement) {
    const list = reasonsFor(row.kind);
    const currentReason = row.reason && list.includes(row.reason) ? row.reason : list[0];
    setEditingId(row.id);
    setEditAmount(String(row.amount));
    setEditReason(currentReason);
    setEditNote(row.note);
    setEditAt(formatDateTimeLocal(row.createdAt));
    setEditBeneficiaryType(row.beneficiaryType === 'employee' ? 'employee' : 'store');
    setEditEmployeeId(row.beneficiaryId ?? '');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditAmount('');
    setEditReason('');
    setEditNote('');
    setEditAt('');
    setEditBeneficiaryType('store');
    setEditEmployeeId('');
  }

  function saveEdit(id: string) {
    if (editBeneficiaryType === 'employee' && !editEmployeeId) {
      onError('Selecione o funcionário.');
      return;
    }
    const employee = employees.find((item) => item.id === editEmployeeId);
    const result = updateCashMovement({
      movementId: id,
      amount: Number(editAmount.replace(',', '.')) || 0,
      reason: editReason,
      note: editNote.trim() || editReason,
      at: editAt,
      beneficiaryType: editBeneficiaryType,
      beneficiaryId: editBeneficiaryType === 'employee' ? editEmployeeId : undefined,
      beneficiaryName: editBeneficiaryType === 'employee' ? employee?.name : 'Loja',
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    cancelEdit();
    onRefresh();
    onDone('Movimento atualizado e saldo recalculado.');
  }

  async function remove(id: string) {
    const row = rows.find((item) => item.id === id);
    const ok = await confirm({
      title: 'Excluir movimento?',
      message: `Tem certeza que deseja excluir este ${row ? CASH_KIND_LABEL[row.kind].toLowerCase() : 'movimento'}? O saldo do caixa será recalculado.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const result = deleteCashMovement(id);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    if (editingId === id) cancelEdit();
    onRefresh();
    onDone('Movimento excluído e saldo recalculado.');
  }

  return (
    <div className="caixa-panel caixa-panel--fit">
      {dialog}
      <div className="caixa-panel__head">
        <h2>Sangrias e aportes</h2>
        <p className="empty">Consulte, edite no grid ou exclua lançamentos do caixa aberto.</p>
      </div>
      {rows.length === 0 ? (
        <p className="empty">Nenhuma sangria ou aporte neste caixa.</p>
      ) : (
        <div className="caixa-panel__table">
          <table className="admin-table caixa-mov-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Motivo</th>
                <th>Para</th>
                <th>Valor</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const editing = editingId === row.id;
                const reasonOptions = reasonsFor(row.kind);
                const rowClass = row.kind === 'sangria' ? 'is-sangria' : 'is-aporte';
                return (
                  <Fragment key={row.id}>
                    <tr className={`${rowClass} caixa-mov-main`}>
                      <td>{CASH_KIND_LABEL[row.kind]}</td>
                      <td>
                        {editing ? (
                          <AdminPicker
                            compact
                            className="caixa-mov-picker"
                            label="Motivo"
                            value={editReason}
                            options={reasonOptions}
                            onChange={setEditReason}
                          />
                        ) : (
                          row.reason || '—'
                        )}
                      </td>
                      <td>
                        {editing ? (
                          <div className="caixa-mov-beneficiary">
                            <AdminPicker
                              compact
                              className="caixa-mov-picker"
                              label="Para quem"
                              value={editBeneficiaryType}
                              options={[
                                { value: 'store', label: 'Loja' },
                                { value: 'employee', label: 'Funcionário' },
                              ]}
                              onChange={(value) => {
                                const next = value as CashBeneficiaryType;
                                setEditBeneficiaryType(next);
                                if (next === 'store') setEditEmployeeId('');
                              }}
                            />
                            {editBeneficiaryType === 'employee' ? (
                              <AdminPicker
                                compact
                                className="caixa-mov-picker"
                                label="Funcionário"
                                value={editEmployeeId}
                                placeholder="Selecione…"
                                options={employees.map((item) => ({
                                  value: item.id,
                                  label: item.name,
                                }))}
                                onChange={setEditEmployeeId}
                              />
                            ) : null}
                          </div>
                        ) : (
                          cashBeneficiaryLabel(row)
                        )}
                      </td>
                      <td className="caixa-mov-amount">
                        {editing ? (
                          <input
                            className="caixa-mov-input"
                            type="number"
                            step="0.01"
                            min={0.01}
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          money(row.amount)
                        )}
                      </td>
                      <td className="caixa-mov-date">
                        {editing ? (
                          <input
                            className="caixa-mov-input"
                            type="datetime-local"
                            value={editAt}
                            onChange={(e) => setEditAt(e.target.value)}
                          />
                        ) : (
                          formatDisplay(row.createdAt)
                        )}
                      </td>
                    </tr>
                    <tr className={`${rowClass} caixa-mov-meta`}>
                      <td colSpan={5}>
                        <div className="caixa-mov-meta__row">
                          <span className="caixa-mov-note__label">Obs.</span>
                          <div className="caixa-mov-meta__line">
                            <div className="caixa-mov-note">
                              {editing ? (
                                <input
                                  className="caixa-mov-input caixa-mov-input--note"
                                  value={editNote}
                                  onChange={(e) => setEditNote(e.target.value)}
                                  placeholder="Observação"
                                />
                              ) : (
                                <p>{row.note?.trim() || '—'}</p>
                              )}
                            </div>
                            <div className="caixa-mov-actions">
                              {editing ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn--primary"
                                    onClick={() => saveEdit(row.id)}
                                  >
                                    Salvar
                                  </button>
                                  <button type="button" className="btn btn--ghost" onClick={cancelEdit}>
                                    Cancelar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn--ghost"
                                    disabled={Boolean(editingId)}
                                    onClick={() => startEdit(row)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--ghost"
                                    disabled={Boolean(editingId)}
                                    onClick={() => void remove(row.id)}
                                  >
                                    Excluir
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function ExchangePanel({
  operatorName,
  exchangeOrderId,
  onClose,
  onDone,
  onError,
  onRefresh,
}: PanelProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SalesOrder[]>([]);
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [returnLines, setReturnLines] = useState<ExchangeLine[]>([]);
  const [outLines, setOutLines] = useState<ExchangeLine[]>([]);
  const [stockQuery, setStockQuery] = useState('');
  const [stockHits, setStockHits] = useState<StockItem[]>([]);
  const [target, setTarget] = useState<'return' | 'out'>('return');
  const [settleAs, setSettleAs] = useState<'cash' | 'credit'>('cash');
  const [note, setNote] = useState('');

  const returnTotal = roundMoney(
    returnLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0),
  );
  const outTotal = roundMoney(outLines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0));
  const delta = roundMoney(outTotal - returnTotal);

  useEffect(() => {
    setHits(searchOrders(query, 10));
  }, [query]);

  useEffect(() => {
    setStockHits(findStockMatches(stockQuery, 8));
  }, [stockQuery]);

  useEffect(() => {
    if (!exchangeOrderId) return;
    const initial = getOrderById(exchangeOrderId);
    if (!initial || initial.status !== 'sold') return;
    setOrder(initial);
    setQuery(initial.id);
    setHits([]);
    setReturnLines(returnLinesFromOrder(initial));
    setOutLines([]);
    setTarget('out');
  }, [exchangeOrderId]);

  function pickOrder(item: SalesOrder) {
    setOrder(item);
    setQuery(item.id);
    setHits([]);
    setReturnLines(returnLinesFromOrder(item));
    setOutLines([]);
    setTarget('out');
  }

  function unitPriceFor(item: StockItem, side: 'return' | 'out') {
    if (side === 'return' && order) {
      const bare = stripQtyPrefix(order.productName).toLowerCase();
      if (
        bare.includes(item.name.toLowerCase()) ||
        item.name.toLowerCase().includes(bare.slice(0, 16))
      ) {
        return roundMoney(order.amount);
      }
    }
    if (side === 'out') {
      const matchedReturn = returnLines.find(
        (row) => row.stockId === item.id || namesMatch(row.name, item.name),
      );
      if (matchedReturn) return roundMoney(matchedReturn.unitPrice);
    }
    return roundMoney(item.price);
  }

  function addStock(item: StockItem) {
    const line: ExchangeLine = {
      stockId: item.id,
      name: item.name,
      sku: item.sku,
      qty: 1,
      unitPrice: unitPriceFor(item, target),
    };
    if (target === 'return') {
      setReturnLines((prev) => {
        const existing = prev.find((row) => row.stockId === item.id);
        if (existing) {
          return prev.map((row) =>
            row.stockId === item.id ? { ...row, qty: row.qty + 1 } : row,
          );
        }
        return [...prev, line];
      });
    } else {
      if (item.qty <= 0) {
        onError(`${item.name} sem estoque para saída.`);
        return;
      }
      setOutLines((prev) => {
        const existing = prev.find((row) => row.stockId === item.id);
        if (existing) {
          return prev.map((row) =>
            row.stockId === item.id ? { ...row, qty: row.qty + 1 } : row,
          );
        }
        return [...prev, line];
      });
    }
    setStockQuery('');
    setStockHits([]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!order && !query.trim()) {
      onError('Busque a venda (número, cliente ou produto).');
      return;
    }
    const result = registerExchange({
      orderId: order?.id || query.trim(),
      customerName: order?.customerName || 'Cliente',
      customerPhone: '',
      returnLines,
      outLines,
      note,
      operatorName,
      settleAs,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }

    for (const line of returnLines) {
      if (!line.stockId.startsWith('sale:')) adjustStockQty(line.stockId, line.qty);
    }
    for (const line of outLines) {
      adjustStockQty(line.stockId, -line.qty);
    }

    onRefresh();
    const creditMsg = result.credit ? ` · vale ${result.credit.code}` : '';
    onDone(
      `Troca ${result.exchange.id} · devolve ${money(returnTotal)} · sai ${money(outTotal)}${creditMsg}`,
    );
    onClose();
  }

  const diffClass =
    delta > 0 ? 'caixa-diff is-pos' : delta < 0 ? 'caixa-diff is-neg' : 'caixa-diff is-zero';

  return (
    <form className="caixa-panel caixa-panel--fit" onSubmit={submit}>
      <div className="caixa-panel__head">
        <h2>Troca de produto</h2>
        <p className="empty">
          Localize a venda, devolva o item (estoque volta) e escolha o produto que sai. Diferença em
          dinheiro ou vale-compra.
        </p>
      </div>

      <div className="caixa-panel__body">
      <label className="caixa-panel__full">
        Buscar venda (nº, cliente ou produto)
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOrder(null);
          }}
          placeholder="PED-… / Maria / iPhone"
          autoFocus
        />
      </label>
      {hits.length > 0 && !order ? (
        <ul className="caixa-panel__hits">
          {hits.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => pickOrder(item)}>
                <strong>{item.id}</strong>
                <span>
                  {item.customerName} · {item.productName}
                </span>
                <em>{money(item.amount)}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {order ? (
        <p className="pdv__ok">
          Venda {order.id} · {order.customerName} · {order.productName} · {money(order.amount)} ·{' '}
          {formatDisplay(order.createdAt)}
        </p>
      ) : null}

      <div className="caixa-panel__tabs">
        <button
          type="button"
          className={target === 'return' ? 'is-active' : ''}
          onClick={() => setTarget('return')}
        >
          Devolvendo
        </button>
        <button
          type="button"
          className={target === 'out' ? 'is-active' : ''}
          onClick={() => setTarget('out')}
        >
          Saindo
        </button>
      </div>

      <div className="caixa-panel__scan">
        <input
          value={stockQuery}
          onChange={(e) => setStockQuery(e.target.value)}
          placeholder={
            target === 'return' ? 'SKU/IMEI do produto que volta' : 'SKU/IMEI do produto que sai'
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const item = findStockByCode(stockQuery);
              if (!item) {
                onError('Produto não encontrado.');
                return;
              }
              addStock(item);
            }
          }}
        />
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            const item = findStockByCode(stockQuery);
            if (!item) {
              onError('Produto não encontrado.');
              return;
            }
            addStock(item);
          }}
        >
          Incluir
        </button>
      </div>
      {stockHits.length > 0 ? (
        <ul className="caixa-panel__hits">
          {stockHits.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => addStock(item)}>
                <strong>{item.name}</strong>
                <span>
                  {item.sku} · {item.qty} un. · {money(item.price)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="caixa-panel__split">
        <div>
          <h3>Volta ao estoque</h3>
          {returnLines.length === 0 ? (
            <p className="empty">Nenhum item</p>
          ) : (
            <ul>
              {returnLines.map((line) => (
                <li key={line.stockId}>
                  {line.qty}x {line.name} · {money(line.unitPrice * line.qty)}
                </li>
              ))}
            </ul>
          )}
          <strong>{money(returnTotal)}</strong>
        </div>
        <div>
          <h3>Sai do estoque</h3>
          {outLines.length === 0 ? (
            <p className="empty">Nenhum item</p>
          ) : (
            <ul>
              {outLines.map((line) => (
                <li key={line.stockId}>
                  {line.qty}x {line.name} · {money(line.unitPrice * line.qty)}
                </li>
              ))}
            </ul>
          )}
          <strong>{money(outTotal)}</strong>
        </div>
      </div>

      <p className={diffClass}>
        Diferença: {money(delta)}{' '}
        {delta > 0 ? '(cliente paga)' : delta < 0 ? '(loja devolve / vale)' : '(troca igual)'}
      </p>

      <div className="caixa-panel__grid">
        <AdminPicker
          label="Acertar diferença"
          value={settleAs}
          options={[
            { value: 'cash', label: 'Dinheiro no caixa' },
            { value: 'credit', label: 'Gerar vale-compra (se loja deve)' },
          ]}
          onChange={(value) => setSettleAs(value as 'cash' | 'credit')}
        />
        <label>
          Observação
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      </div>

      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary">
          Confirmar troca
        </button>
      </div>
    </form>
  );
}

function ValePanel({ operatorName, onClose, onDone, onError, onRefresh }: PanelProps) {
  const { confirm, dialog } = useConfirmDialog();
  const [mode, setMode] = useState<'issue' | 'redeem' | 'list'>('list');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [credits, setCredits] = useState(() => listStoreCredits());

  function refresh() {
    setCredits(listStoreCredits());
    onRefresh();
  }

  async function cancelCredit(creditId: string, code: string) {
    const ok = await confirm({
      title: 'Cancelar vale?',
      message: `Tem certeza que deseja cancelar o vale ${code}? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Cancelar vale',
      danger: true,
    });
    if (!ok) return;
    const result = cancelStoreCredit(creditId);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    refresh();
    onDone(`Vale ${code} cancelado.`);
  }

  function issue(event: FormEvent) {
    event.preventDefault();
    const result = issueStoreCredit({
      customerName,
      customerPhone: phone,
      amount: Number(amount.replace(',', '.')) || 0,
      note,
      operatorName,
      affectCash: true,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    refresh();
    onDone(`Vale ${result.credit.code} · ${money(result.credit.amount)}`);
    setMode('list');
  }

  function redeem(event: FormEvent) {
    event.preventDefault();
    const result = redeemStoreCredit({
      code,
      amount: Number(amount.replace(',', '.')) || 0,
      operatorName,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    refresh();
    onDone(`Resgate ${result.credit.code} · saldo ${money(result.credit.remaining)}`);
    setMode('list');
  }

  return (
    <div className="caixa-panel caixa-panel--fit">
      {dialog}
      <div className="caixa-panel__head">
        <h2>Vale-compra</h2>
      </div>
      <div className="caixa-panel__tabs">
        <button type="button" className={mode === 'list' ? 'is-active' : ''} onClick={() => setMode('list')}>
          Consultar
        </button>
        <button type="button" className={mode === 'issue' ? 'is-active' : ''} onClick={() => setMode('issue')}>
          Emitir
        </button>
        <button type="button" className={mode === 'redeem' ? 'is-active' : ''} onClick={() => setMode('redeem')}>
          Resgatar
        </button>
      </div>

      {mode === 'list' ? (
        credits.length === 0 ? (
          <p className="empty">Nenhum vale emitido.</p>
        ) : (
          <div className="caixa-panel__table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Saldo</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {credits.map((credit) => (
                  <tr key={credit.id}>
                    <td>{credit.code}</td>
                    <td>{credit.customerName}</td>
                    <td>{money(credit.remaining)}</td>
                    <td>{credit.status}</td>
                    <td>
                      {credit.status === 'open' ? (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => void cancelCredit(credit.id, credit.code)}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {mode === 'issue' ? (
        <form className="caixa-panel__grid" onSubmit={issue}>
          <label>
            Cliente
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          </label>
          <label>
            WhatsApp
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label>
            Valor
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label>
            Obs.
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="pdv__modal-actions caixa-panel__full">
            <button type="submit" className="btn btn--primary">
              Emitir vale
            </button>
          </div>
        </form>
      ) : null}

      {mode === 'redeem' ? (
        <form className="caixa-panel__grid" onSubmit={redeem}>
          <label>
            Código
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <label>
            Valor a usar
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <div className="pdv__modal-actions caixa-panel__full">
            <button type="submit" className="btn btn--primary">
              Resgatar
            </button>
          </div>
        </form>
      ) : null}

      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function ClosePanel({
  operatorName,
  cashSession,
  onClose,
  onDone,
  onError,
  onRefresh,
}: PanelProps) {
  const summary = useMemo(
    () => (cashSession ? summarizeCashSession(cashSession) : null),
    [cashSession],
  );
  const paymentMethods = useMemo(() => getAdminState().payments, []);
  const channelExpected = useMemo(() => {
    const totals: Record<ClosePayChannel, number> = {
      cash: 0,
      pix: 0,
      debit: 0,
      credit: 0,
      check: 0,
      deposit: 0,
      other: 0,
    };
    if (!cashSession) return totals;
    const orders = getAdminState().orders.filter(
      (order) =>
        order.status === 'sold' &&
        (order.cashSessionId === cashSession.id ||
          findCashSessionForOrder(order.id)?.id === cashSession.id),
    );
    for (const order of orders) {
      totals[classifySalePayment(order.payment, paymentMethods)] += order.amount;
    }
    return {
      cash: roundMoney(totals.cash),
      pix: roundMoney(totals.pix),
      debit: roundMoney(totals.debit),
      credit: roundMoney(totals.credit),
      check: roundMoney(totals.check),
      deposit: roundMoney(totals.deposit),
      other: roundMoney(totals.other),
    };
  }, [cashSession, paymentMethods]);

  const expectedDrawer = cashSession?.expectedCash ?? 0;
  const showExpected = getCashSettings().showExpectedOnClose;
  const [countedCash, setCountedCash] = useState(() => formatMoneyField(expectedDrawer));
  const [countedPix, setCountedPix] = useState(() => formatMoneyField(channelExpected.pix));
  const [countedDebit, setCountedDebit] = useState(() => formatMoneyField(channelExpected.debit));
  const [countedCredit, setCountedCredit] = useState(() => formatMoneyField(channelExpected.credit));
  const [countedCheck, setCountedCheck] = useState(() => formatMoneyField(channelExpected.check));
  const [countedDeposit, setCountedDeposit] = useState(() =>
    formatMoneyField(channelExpected.deposit),
  );
  const [countedOther, setCountedOther] = useState(() => formatMoneyField(channelExpected.other));
  const [at, setAt] = useState(formatDateTimeLocal());
  const [note, setNote] = useState('');
  const [confirmSangria, setConfirmSangria] = useState(false);
  const [confirmAporte, setConfirmAporte] = useState(false);
  const [confirmExchange, setConfirmExchange] = useState(false);
  const [confirmVale, setConfirmVale] = useState(false);
  const [receiptsChecked, setReceiptsChecked] = useState(false);

  const cashCount = parseMoneyInput(countedCash);
  const pixCount = parseMoneyInput(countedPix);
  const debitCount = parseMoneyInput(countedDebit);
  const creditCount = parseMoneyInput(countedCredit);
  const checkCount = parseMoneyInput(countedCheck);
  const depositCount = parseMoneyInput(countedDeposit);
  const otherCount = parseMoneyInput(countedOther);

  const cashDiff = roundMoney(cashCount - expectedDrawer);
  const pixDiff = roundMoney(pixCount - channelExpected.pix);
  const debitDiff = roundMoney(debitCount - channelExpected.debit);
  const creditDiff = roundMoney(creditCount - channelExpected.credit);
  const checkDiff = roundMoney(checkCount - channelExpected.check);
  const depositDiff = roundMoney(depositCount - channelExpected.deposit);
  const otherDiff = roundMoney(otherCount - channelExpected.other);
  const channelExpectedTotal = roundMoney(
    channelExpected.pix +
      channelExpected.debit +
      channelExpected.credit +
      channelExpected.check +
      channelExpected.deposit +
      channelExpected.other,
  );
  const channelCountedTotal = roundMoney(
    pixCount + debitCount + creditCount + checkCount + depositCount + otherCount,
  );
  const channelDiffTotal = roundMoney(channelCountedTotal - channelExpectedTotal);

  const movements = cashSession?.movements ?? [];
  const sangrias = movements.filter((row) => row.kind === 'sangria');
  const aportes = movements.filter((row) => row.kind === 'aporte');
  const exchanges = movements.filter((row) => row.kind === 'exchange');
  const vales = movements.filter((row) => row.kind === 'vale');

  const needSangria = sangrias.length > 0;
  const needAporte = aportes.length > 0;
  const needExchange = exchanges.length > 0;
  const needVale = vales.length > 0;
  const checksOk =
    receiptsChecked &&
    (!needSangria || confirmSangria) &&
    (!needAporte || confirmAporte) &&
    (!needExchange || confirmExchange) &&
    (!needVale || confirmVale);

  function openDrawer() {
    openCashDrawer(operatorName, 'Contagem no fechamento');
  }

  function markAllChecked(on: boolean) {
    if (needSangria) setConfirmSangria(on);
    if (needAporte) setConfirmAporte(on);
    if (needExchange) setConfirmExchange(on);
    if (needVale) setConfirmVale(on);
    setReceiptsChecked(on);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!checksOk) {
      onError('Confirme os movimentos e notinhas (ou marque Tudo conferido).');
      return;
    }
    const breakdown: CashCloseBreakdown = {
      countedCash: cashCount,
      countedPix: pixCount,
      countedDebit: debitCount,
      countedCredit: creditCount,
      countedCheck: checkCount,
      countedDeposit: depositCount,
      countedOther: otherCount,
      confirmedSangria: !needSangria || confirmSangria,
      confirmedAporte: !needAporte || confirmAporte,
      confirmedExchange: !needExchange || confirmExchange,
      confirmedVale: !needVale || confirmVale,
      receiptsChecked,
    };
    const result = closeCashSession({
      countedCash: cashCount,
      operatorName,
      note:
        note.trim() ||
        `Prestação · gaveta ${money(cashCount)} (dif ${money(cashDiff)}) · canais ${money(channelCountedTotal)} (dif ${money(channelDiffTotal)})`,
      closedAt: at,
      breakdown,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onRefresh();
    onDone(
      `Caixa fechado · gaveta ${money(cashCount)} (dif ${money(cashDiff)}) · canais dif ${money(channelDiffTotal)}`,
    );
    onClose();
  }

  function diffClass(value: number) {
    return value === 0 ? 'pdv__ok' : 'pdv__alert';
  }

  function moneyField(
    label: string,
    expected: number,
    value: string,
    setValue: (next: string) => void,
    diff: number,
    autoFocus = false,
  ) {
    return (
      <label>
        {label}
        <small className={showExpected ? undefined : 'caixa-close__esp-slot'}>
          {showExpected ? `Esp. ${money(expected)}` : '\u00a0'}
        </small>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setValue(formatMoneyField(parseMoneyInput(value)))}
          autoFocus={autoFocus}
          required={autoFocus}
        />
        <em className={diffClass(diff)}>{money(diff)}</em>
      </label>
    );
  }

  return (
    <form className="caixa-panel caixa-panel--fit caixa-panel--close" onSubmit={submit}>
      <div className="caixa-panel__head caixa-close__head">
        <div>
          <h2>Fechamento de caixa</h2>
          <p className="empty">
            {cashSession?.id ?? '—'} · {cashSession?.operatorName ?? operatorName} · Tab nos valores · Enter fecha
          </p>
        </div>
        <label className="caixa-close__ok-all">
          <input
            type="checkbox"
            checked={checksOk}
            onChange={(e) => markAllChecked(e.target.checked)}
          />
          <span>Tudo conferido</span>
        </label>
      </div>

      <div className="caixa-close">
        <div className="caixa-close__work">
          <div className="caixa-close__chips" role="group" aria-label="Validar movimentos">
            <label
              className={`caixa-close__chip ${!needSangria || confirmSangria ? 'is-on' : ''} ${!needSangria ? 'is-skip' : ''}`}
            >
              <input
                type="checkbox"
                checked={!needSangria || confirmSangria}
                disabled={!needSangria}
                onChange={(e) => setConfirmSangria(e.target.checked)}
              />
              Sangria {sangrias.length} · {money(summary?.sangrias ?? 0)}
            </label>
            <label
              className={`caixa-close__chip ${!needAporte || confirmAporte ? 'is-on' : ''} ${!needAporte ? 'is-skip' : ''}`}
            >
              <input
                type="checkbox"
                checked={!needAporte || confirmAporte}
                disabled={!needAporte}
                onChange={(e) => setConfirmAporte(e.target.checked)}
              />
              Aporte {aportes.length} · {money(summary?.aportes ?? 0)}
            </label>
            <label
              className={`caixa-close__chip ${!needExchange || confirmExchange ? 'is-on' : ''} ${!needExchange ? 'is-skip' : ''}`}
            >
              <input
                type="checkbox"
                checked={!needExchange || confirmExchange}
                disabled={!needExchange}
                onChange={(e) => setConfirmExchange(e.target.checked)}
              />
              Troca {exchanges.length} · {money(summary?.exchanges ?? 0)}
            </label>
            <label
              className={`caixa-close__chip ${!needVale || confirmVale ? 'is-on' : ''} ${!needVale ? 'is-skip' : ''}`}
            >
              <input
                type="checkbox"
                checked={!needVale || confirmVale}
                disabled={!needVale}
                onChange={(e) => setConfirmVale(e.target.checked)}
              />
              Vale {vales.length} · {money(summary?.vales ?? 0)}
            </label>
            <label className={`caixa-close__chip ${receiptsChecked ? 'is-on' : ''}`}>
              <input
                type="checkbox"
                checked={receiptsChecked}
                onChange={(e) => setReceiptsChecked(e.target.checked)}
              />
              Notinhas
            </label>
          </div>

          <div className="caixa-close__counts">
            {moneyField('Dinheiro gaveta', expectedDrawer, countedCash, setCountedCash, cashDiff, true)}
            {moneyField('Pix', channelExpected.pix, countedPix, setCountedPix, pixDiff)}
            {moneyField('Débito', channelExpected.debit, countedDebit, setCountedDebit, debitDiff)}
            {moneyField('Crédito', channelExpected.credit, countedCredit, setCountedCredit, creditDiff)}
            {moneyField('Cheque', channelExpected.check, countedCheck, setCountedCheck, checkDiff)}
            {moneyField(
              'Depósito',
              channelExpected.deposit,
              countedDeposit,
              setCountedDeposit,
              depositDiff,
            )}
            {moneyField('Outros', channelExpected.other, countedOther, setCountedOther, otherDiff)}
            <label>
              Fechamento
              <small className="caixa-close__esp-slot">&nbsp;</small>
              <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required />
              <em className="caixa-close__esp-slot">&nbsp;</em>
            </label>
            <label className="caixa-close__note">
              Obs.
              <small>Opcional</small>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pendência…" />
            </label>
          </div>

          <details className="caixa-close__details">
            <summary>Extrato ({movements.length})</summary>
            <div className="caixa-panel__table caixa-panel__table--compact">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Movimento</th>
                    <th>Valor</th>
                    <th>Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <p className="empty">Sem movimentos.</p>
                      </td>
                    </tr>
                  ) : (
                    movements.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {CASH_KIND_LABEL[row.kind]}
                          {row.reason ? ` · ${row.reason}` : row.note ? ` · ${row.note}` : ''}
                          {row.kind === 'sangria' || row.kind === 'aporte'
                            ? ` · ${cashBeneficiaryLabel(row)}`
                            : ''}
                        </td>
                        <td>{money(row.amount)}</td>
                        <td>{formatDisplay(row.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </details>

          <div className="caixa-close__actions">
            {!checksOk ? (
              <p className="pdv__alert">Marque Tudo conferido (ou os chips) e Enter para fechar.</p>
            ) : (
              <p className={diffClass(cashDiff)}>
                Dif. gaveta {money(cashDiff)} · canais {money(channelDiffTotal)}
              </p>
            )}
            <div className="pdv__modal-actions">
              <button type="button" className="btn btn--ghost" onClick={openDrawer}>
                Abrir gaveta
              </button>
              <button type="button" className="btn btn--ghost" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn--primary" disabled={!checksOk}>
                Confirmar fechamento
              </button>
            </div>
          </div>
        </div>

        <aside className="caixa-close__rail" aria-label="Resumo do fechamento">
          <h3>Resumo</h3>
          <div className="caixa-close__card">
            <span>Saldo inicial</span>
            <strong>{money(summary?.openingFloat ?? 0)}</strong>
          </div>
          <div className="caixa-close__card">
            <span>Vendas</span>
            <strong>
              {money(summary?.salesTotal ?? 0)} · {summary?.saleCount ?? 0}
            </strong>
          </div>
          <div className="caixa-close__card">
            <span>Esp. gaveta</span>
            <strong>{money(expectedDrawer)}</strong>
          </div>
          <div className="caixa-close__card">
            <span>Contado</span>
            <strong>{money(cashCount)}</strong>
          </div>
          <div className="caixa-close__card">
            <span>Dif. gaveta</span>
            <strong className={diffClass(cashDiff)}>{money(cashDiff)}</strong>
          </div>
          <div className="caixa-close__divider" />
          <div className="caixa-close__card">
            <span>Canais esp.</span>
            <strong>{money(channelExpectedTotal)}</strong>
          </div>
          <div className="caixa-close__card">
            <span>Canais cont.</span>
            <strong>{money(channelCountedTotal)}</strong>
          </div>
          <div className="caixa-close__card">
            <span>Dif. canais</span>
            <strong className={diffClass(channelDiffTotal)}>{money(channelDiffTotal)}</strong>
          </div>
        </aside>
      </div>
    </form>
  );
}

function CashSettingsPanel({ onClose, onDone }: PanelProps) {
  const { user } = useAuth();
  const isAdmin = userIsStoreAdmin(user?.email);
  const [form, setForm] = useState<CashSettings>(() => getCashSettings());

  function patch<K extends keyof CashSettings>(key: K, value: CashSettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const next = updateCashSettings(
      isAdmin
        ? form
        : {
            drawerEnabled: form.drawerEnabled,
            drawerPort: form.drawerPort,
            scaleEnabled: form.scaleEnabled,
            scalePort: form.scalePort,
            printerEnabled: form.printerEnabled,
            printerName: form.printerName,
          },
    );
    setForm(next);
    onDone('Configurações do caixa salvas.');
    onClose();
  }

  return (
    <form className="caixa-panel caixa-panel--fit" onSubmit={save}>
      <div className="caixa-panel__head">
        <h2>Configurações do caixa</h2>
        <p className="empty">Gaveta, balança, impressora{isAdmin ? ' e opções administrativas' : ''}.</p>
      </div>
      <div className="caixa-panel__body">
        <fieldset className="caixa-settings__set">
          <legend>Periféricos</legend>
          <label className="caixa-panel__check">
            <input
              type="checkbox"
              checked={form.drawerEnabled}
              onChange={(e) => patch('drawerEnabled', e.target.checked)}
            />
            <span>Gaveta habilitada</span>
          </label>
          <label>
            Porta / identificação da gaveta
            <input
              value={form.drawerPort}
              onChange={(e) => patch('drawerPort', e.target.value)}
              placeholder="COM3, USB…"
              disabled={!form.drawerEnabled}
            />
          </label>
          <label className="caixa-panel__check">
            <input
              type="checkbox"
              checked={form.scaleEnabled}
              onChange={(e) => patch('scaleEnabled', e.target.checked)}
            />
            <span>Balança habilitada</span>
          </label>
          <label>
            Porta da balança
            <input
              value={form.scalePort}
              onChange={(e) => patch('scalePort', e.target.value)}
              placeholder="COM4…"
              disabled={!form.scaleEnabled}
            />
          </label>
          <label className="caixa-panel__check">
            <input
              type="checkbox"
              checked={form.printerEnabled}
              onChange={(e) => patch('printerEnabled', e.target.checked)}
            />
            <span>Impressora habilitada</span>
          </label>
          <label>
            Nome da impressora
            <input
              value={form.printerName}
              onChange={(e) => patch('printerName', e.target.value)}
              placeholder="EPSON TM-T20…"
              disabled={!form.printerEnabled}
            />
          </label>
        </fieldset>

        {isAdmin ? (
          <fieldset className="caixa-settings__set">
            <legend>Administrativo</legend>
            <label className="caixa-panel__check">
              <input
                type="checkbox"
                checked={form.showExpectedOnClose}
                onChange={(e) => patch('showExpectedOnClose', e.target.checked)}
              />
              <span>Exibir saldo esperado no fechamento (Esp.)</span>
            </label>
            <p className="empty">
              Desligado: o operador conta sem ver o valor do sistema — evita “colar” o esperado.
            </p>
            <label className="caixa-panel__check">
              <input
                type="checkbox"
                checked={form.requirePasswordToDeleteItem}
                onChange={(e) => patch('requirePasswordToDeleteItem', e.target.checked)}
              />
              <span>Exigir senha para excluir item do carrinho</span>
            </label>
            <label>
              Senha de exclusão
              <input
                type="password"
                value={form.deleteItemPassword}
                onChange={(e) => patch('deleteItemPassword', e.target.value)}
                disabled={!form.requirePasswordToDeleteItem}
                autoComplete="new-password"
              />
            </label>
            <label className="caixa-panel__check">
              <input
                type="checkbox"
                checked={form.allowEditUnitPrice}
                onChange={(e) => patch('allowEditUnitPrice', e.target.checked)}
              />
              <span>Permitir editar preço unitário no PDV</span>
            </label>
            <p className="empty">
              Balança ligada: produtos em <strong>KG</strong> entram com o peso lido automaticamente.
            </p>
          </fieldset>
        ) : (
          <p className="empty">Opções administrativas só aparecem para perfil administrador.</p>
        )}
      </div>
      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary">
          Salvar
        </button>
      </div>
    </form>
  );
}

function SessionsPanel({ operatorName, cashSession, onClose, onDone, onError, onRefresh }: PanelProps) {
  const [sessions, setSessions] = useState(() => listCashSessions());
  const [selected, setSelected] = useState<CashSession | null>(null);
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const openNow = cashSession?.status === 'open' ? cashSession : getOpenCashSession();
  const canReopenAny = !openNow;

  function refresh() {
    setSessions(listCashSessions());
    onRefresh();
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo
      ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? `${dateTo}T23:59:59.999` : dateTo).getTime()
      : null;

    return sessions.filter((session) => {
      if (statusFilter !== 'all' && session.status !== statusFilter) return false;
      const opened = new Date(session.openedAt).getTime();
      if (fromTs != null && !Number.isNaN(fromTs) && opened < fromTs) return false;
      if (toTs != null && !Number.isNaN(toTs) && opened > toTs) return false;
      if (!needle) return true;
      const blob =
        `${session.id} ${session.operatorName} ${session.status} ${session.closedAt ?? ''}`.toLowerCase();
      return blob.includes(needle);
    });
  }, [sessions, query, dateFrom, dateTo, statusFilter]);

  function reopen(id: string) {
    if (!canReopenAny) {
      onError('Feche o caixa atual antes de reabrir um caixa antigo.');
      return;
    }
    const result = reopenCashSession({ sessionId: id, operatorName });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    refresh();
    onDone(`Caixa ${result.session.id} reaberto.`);
    onClose();
  }

  return (
    <div className="caixa-panel caixa-panel--fit caixa-panel--sessions">
      <div className="caixa-panel__head">
        <h2>Consulta de caixas</h2>
        <p className="empty">
          Filtre por data, status ou operador.
          {canReopenAny
            ? ' Reabrir só aparece em caixas fechados enquanto não houver caixa aberto.'
            : ' Há um caixa aberto — reabrir fica bloqueado até o fechamento.'}
        </p>
      </div>

      <div className="caixa-panel__filters">
        <label className="caixa-panel__full">
          Buscar
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="CX-… / operador"
            autoFocus
          />
        </label>
        <label>
          De
          <input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <label>
          Até
          <input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'open' | 'closed');
              setSelected(null);
            }}
          >
            <option value="all">Todos</option>
            <option value="open">Abertos</option>
            <option value="closed">Fechados</option>
          </select>
        </label>
      </div>

      <div className="caixa-sales-list" role="list">
        {filtered.length === 0 ? (
          <p className="empty caixa-sales-list__empty">
            {sessions.length === 0
              ? 'Nenhum caixa registrado ainda.'
              : 'Nenhum caixa encontrado com esses filtros.'}
          </p>
        ) : (
          filtered.map((session) => {
            const isCurrent = openNow?.id === session.id;
            const showReopen = session.status === 'closed' && canReopenAny && !isCurrent;
            return (
              <div
                key={session.id}
                role="listitem"
                className={`caixa-sales-card caixa-session-card ${selected?.id === session.id ? 'is-selected' : ''}`}
              >
                <button
                  type="button"
                  className="caixa-session-card__main"
                  onClick={() => setSelected(session)}
                >
                  <div className="caixa-sales-card__top">
                    <strong>{session.id}</strong>
                    <span className={session.status === 'open' ? 'pdv__ok' : undefined}>
                      {session.status === 'open' ? 'Aberto' : 'Fechado'}
                    </span>
                  </div>
                  <div className="caixa-sales-card__meta">
                    <span>{session.operatorName}</span>
                    <span>{money(session.expectedCash)}</span>
                  </div>
                  <div className="caixa-sales-card__foot">
                    <em>Aberto {formatDisplay(session.openedAt)}</em>
                    <span>
                      {isCurrent
                        ? 'Atual'
                        : session.closedAt
                          ? `Fechado ${formatDisplay(session.closedAt)}`
                          : '—'}
                    </span>
                  </div>
                </button>
                {showReopen ? (
                  <button
                    type="button"
                    className="btn btn--primary caixa-session-card__reopen"
                    onClick={() => reopen(session.id)}
                  >
                    Reabrir
                  </button>
                ) : null}
                {session.status === 'closed' && !canReopenAny ? (
                  <span className="empty caixa-session-card__hint">Feche o atual para reabrir</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {selected ? (
        <div className="caixa-panel__summary">
          <div>
            <span>Caixa</span>
            <strong>{selected.id}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{selected.status === 'open' ? 'Aberto' : 'Fechado'}</strong>
          </div>
          <div>
            <span>Fechado</span>
            <strong>{selected.closedAt ? formatDisplay(selected.closedAt) : '—'}</strong>
          </div>
          <div>
            <span>Contado</span>
            <strong>{selected.countedCash != null ? money(selected.countedCash) : '—'}</strong>
          </div>
          <div>
            <span>Diferença</span>
            <strong>{selected.difference != null ? money(selected.difference) : '—'}</strong>
          </div>
          <div>
            <span>Reaberturas</span>
            <strong>{selected.reopenCount}</strong>
          </div>
          <div>
            <span>Movimentos</span>
            <strong>{selected.movements.length}</strong>
          </div>
          {selected.closeBreakdown ? (
            <div>
              <span>Canais no fechamento</span>
              <strong>
                Pix {money(selected.closeBreakdown.countedPix)} · Déb{' '}
                {money(selected.closeBreakdown.countedDebit)} · Créd{' '}
                {money(selected.closeBreakdown.countedCredit)}
              </strong>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function PricePanel({ onClose }: PanelProps) {
  const [query, setQuery] = useState('');
  const tables = getAdminState().priceTables.filter((item) => item.active);
  const hits = useMemo(() => findStockMatches(query, 12), [query]);

  return (
    <div className="caixa-panel caixa-panel--fit">
      <div className="caixa-panel__head">
        <h2>Consulta de preço</h2>
        <p className="empty">Busque por nome, SKU ou IMEI — sem alterar o carrinho.</p>
      </div>
      <label className="caixa-panel__full">
        Produto
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite para buscar"
          autoFocus
        />
      </label>
      <div className="caixa-panel__table">
        {hits.length === 0 ? (
          <p className="empty">{query ? 'Nenhum produto.' : 'Comece a digitar.'}</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>SKU</th>
                <th>Estoque</th>
                <th>Preço base</th>
                {tables.slice(0, 2).map((table) => (
                  <th key={table.id}>{table.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hits.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.sku}</td>
                  <td>{item.qty}</td>
                  <td className="price-red">{money(item.price)}</td>
                  {tables.slice(0, 2).map((table) => (
                    <td key={table.id}>
                      {money(item.price * (1 + table.percent / 100))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function onlyDigitsLocal(value: string) {
  return value.replace(/\D/g, '');
}

function formatCpfLocal(value: string) {
  const digits = onlyDigitsLocal(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCpfLocal(value: string) {
  const cpf = onlyDigitsLocal(value);
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

function formatPhoneLocal(value: string) {
  const digits = onlyDigitsLocal(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function CustomerQuickPanel({ onClose, onDone, onError, onCustomerCreated }: PanelProps) {
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [cepStatus, setCepStatus] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  async function consultCep(raw: string) {
    const digits = onlyDigitsLocal(raw);
    if (digits.length !== 8) return;
    setCepLoading(true);
    setCepStatus('Consultando CEP…');
    try {
      const address = await lookupCep(digits);
      setZipCode(address.zipCode);
      if (address.street) setStreet(address.street);
      if (address.complement) setComplement(address.complement);
      if (address.neighborhood) setNeighborhood(address.neighborhood);
      if (address.city) setCity(address.city);
      if (address.state) setState(address.state);
      setCepStatus('Endereço preenchido pelo CEP.');
    } catch (error) {
      setCepStatus(error instanceof Error ? error.message : 'Falha ao consultar CEP.');
    } finally {
      setCepLoading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const cpfDigits = onlyDigitsLocal(document);
    if (!trimmedName) {
      onError('Informe o nome do cliente.');
      return;
    }
    if (cpfDigits.length !== 11 || !isValidCpfLocal(cpfDigits)) {
      onError('Informe um CPF válido.');
      return;
    }

    try {
      const next = await upsertCustomer({
        name: trimmedName,
        document: formatCpfLocal(cpfDigits),
        phone: phone.trim(),
        email: email.trim(),
        zipCode: zipCode.trim(),
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        active: true,
      });

      const saved =
        next.customers.find((item) => onlyDigitsLocal(item.document) === cpfDigits) ??
        next.customers[0];

      if (saved) onCustomerCreated?.(saved);
      onDone(`Cliente ${saved?.name ?? trimmedName} cadastrado.`);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao cadastrar cliente.');
    }
  }

  return (
    <form className="caixa-panel caixa-panel--fit" onSubmit={submit}>
      <div className="caixa-panel__head">
        <h2>Cadastro rápido de cliente</h2>
        <p className="empty">Obrigatório: nome e CPF. Endereço, telefone e e-mail são opcionais.</p>
      </div>
      <div className="caixa-panel__body">
        <div className="caixa-panel__grid">
          <label className="caixa-panel__full">
            Nome *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              required
              autoFocus
            />
          </label>
          <label>
            CPF *
            <input
              value={document}
              onChange={(e) => setDocument(formatCpfLocal(e.target.value))}
              placeholder="000.000.000-00"
              inputMode="numeric"
              required
            />
          </label>
          <label>
            Telefone
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhoneLocal(e.target.value))}
              placeholder="(00) 00000-0000"
              inputMode="tel"
            />
          </label>
          <label className="caixa-panel__full">
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="opcional"
            />
          </label>
          <label>
            CEP
            <input
              value={zipCode}
              onChange={(e) => {
                const masked = maskCep(e.target.value);
                setZipCode(masked);
                setCepStatus('');
                if (onlyDigitsLocal(masked).length === 8) void consultCep(masked);
              }}
              onBlur={() => void consultCep(zipCode)}
              placeholder="00000-000"
              inputMode="numeric"
              disabled={cepLoading}
            />
          </label>
          <label>
            Número
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="nº"
            />
          </label>
          <label className="caixa-panel__full">
            Endereço
            <input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Rua / avenida"
            />
          </label>
          <label>
            Complemento
            <input
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              placeholder="opcional"
            />
          </label>
          <label>
            Bairro
            <input
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
            />
          </label>
          <label>
            Cidade
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label>
            UF
            <input
              value={state}
              onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="UF"
              maxLength={2}
            />
          </label>
        </div>
        {cepStatus ? <p className="empty">{cepStatus}</p> : null}
      </div>
      <div className="pdv__modal-actions">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="btn btn--primary" disabled={cepLoading}>
          Salvar cliente
        </button>
      </div>
    </form>
  );
}
