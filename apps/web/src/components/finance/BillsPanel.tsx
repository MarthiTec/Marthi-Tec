import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../AdminPicker';
import { CurrencyInput } from '../CurrencyInput';
import { QuickModal } from '../QuickModal';
import { SettleBillModal } from '../SettleBillModal';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import {
  BILL_STATUS_LABEL,
  deleteBill,
  EXPENSE_CATEGORIES,
  loadBillMovements,
  money,
  revertBill,
  REVENUE_CATEGORIES,
  settlePayableDetailed,
  settleReceivableDetailed,
  upsertPayable,
  upsertReceivable,
  type BankAccount,
  type BillKind,
  type BillStatus,
  type Payable,
  type Receivable,
  type SettleBillOptions,
} from '../../data/financeBook';
import type { ApiBillMovement } from '../../services/erpApi';
import './billsPanel.css';

/**
 * Contas a pagar e a receber num só lugar (como num ERP financeiro): filtros por situação,
 * período, categoria e busca; e em cada conta ver, editar, duplicar, baixar, estornar e excluir.
 * As regras (estorno antes de excluir, conta de venda/entrada de estoque corrigida na origem)
 * são do servidor; a tela só antecipa o aviso.
 */
type Bill = Payable | Receivable;
type Row = {
  bill: Bill;
  id: string;
  description: string;
  party: string;
  category: string;
  amount: number;
  settled: number;
  balance: number;
  due: string;
  status: BillStatus;
  overdue: boolean;
  settledAt: string;
  origin: string;
  /** Documento do título (a compra da entrada de estoque usa o código da entrada: não é documento). */
  document: string;
};
type StatusFilter = 'open' | 'overdue' | 'settled' | 'all';
type PeriodFilter = 'all' | 'prev' | 'month' | 'next' | 'custom';
type FormMode = { mode: 'new' | 'edit' | 'duplicate'; bill?: Bill };

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const day = (value: unknown) => String(value ?? '').slice(0, 10);
const dateBr = (value: string) => (value ? value.slice(0, 10).split('-').reverse().join('/') : '—');
const monthRange = (offset: number) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return [iso(start), iso(end)] as const;
};
const nextMonth = (date: string) => {
  const [y, m, d] = day(date).split('-').map(Number);
  if (!y) return today();
  const target = new Date(y, m, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

const countLabel = (count: number) => `${count} ${count === 1 ? 'conta' : 'contas'}`;

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'open', label: 'Em aberto' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'settled', label: 'Liquidadas' },
  { id: 'all', label: 'Todas' },
];
const PERIODS: Array<{ value: PeriodFilter; label: string }> = [
  { value: 'all', label: 'Qualquer data' },
  { value: 'prev', label: 'Mês passado' },
  { value: 'month', label: 'Este mês' },
  { value: 'next', label: 'Próximo mês' },
  { value: 'custom', label: 'Período…' },
];

export function BillsPanel({
  kind,
  items,
  accounts,
  suppliers = [],
  onError,
  onSaved,
}: {
  kind: BillKind;
  items: Bill[];
  accounts: BankAccount[];
  suppliers?: Array<{ id: string; name: string }>;
  onError: (message: string) => void;
  onSaved: (note: string) => void;
}) {
  const payable = kind === 'payable';
  const words = payable
    ? { title: 'Contas a pagar', one: 'conta a pagar', party: 'Fornecedor', settle: 'Baixar', settled: 'Pago', settledAt: 'Pago em' }
    : { title: 'Contas a receber', one: 'conta a receber', party: 'Cliente', settle: 'Receber', settled: 'Recebido', settledAt: 'Recebido em' };
  const { confirm, dialog } = useConfirmDialog();
  const [status, setStatus] = useState<StatusFilter>('open');
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormMode | null>(null);
  const [viewing, setViewing] = useState<Bill | null>(null);
  const [settling, setSettling] = useState<Bill | null>(null);
  const [busyId, setBusyId] = useState('');

  const rows = useMemo<Row[]>(() => {
    const now = today();
    return items.map((bill) => {
      const settled = payable ? (bill as Payable).paidAmount : (bill as Receivable).receivedAmount;
      const due = day(bill.dueDate);
      const open = bill.status === 'open' || bill.status === 'partial';
      return {
        bill,
        id: bill.id,
        description: bill.description,
        party: payable ? (bill as Payable).supplierName : (bill as Receivable).customerName,
        category: bill.category || '—',
        amount: bill.amount,
        settled,
        balance: Math.max(0, Math.round((bill.amount - settled) * 100) / 100),
        due,
        status: bill.status,
        overdue: open && due < now,
        settledAt: day(payable ? (bill as Payable).paidAt : (bill as Receivable).receivedAt),
        origin: payable
          ? (bill as Payable).stockEntryId
            ? 'Entrada de estoque'
            : ''
          : (bill as Receivable).saleId
            ? `Venda ${(bill as Receivable).saleId}`
            : '',
        document: bill.documentNumber && bill.documentNumber !== (bill as Payable).stockEntryId ? bill.documentNumber : '',
      };
    });
  }, [items, payable]);

  // Período e busca valem para os totais; a situação escolhe as linhas.
  const scoped = useMemo(() => {
    const [start, end] =
      period === 'prev' ? monthRange(-1) : period === 'month' ? monthRange(0) : period === 'next' ? monthRange(1) : period === 'custom' ? [from, to] : ['', ''];
    const term = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!start || row.due >= start) &&
        (!end || row.due <= end) &&
        (!category || row.category === category) &&
        (!term || [row.description, row.party, row.category, row.bill.documentNumber ?? '', row.id].some((text) => text.toLowerCase().includes(term))),
    );
  }, [rows, period, from, to, category, search]);

  const visible = useMemo(() => {
    const list = scoped.filter((row) => {
      if (status === 'open') return row.status === 'open' || row.status === 'partial';
      if (status === 'overdue') return row.overdue;
      if (status === 'settled') return row.status === 'paid';
      return true;
    });
    const settledView = status === 'settled';
    return [...list].sort((a, b) => (settledView ? (b.settledAt || b.due).localeCompare(a.settledAt || a.due) : a.due.localeCompare(b.due)));
  }, [scoped, status]);

  const totals = useMemo(() => {
    const sum = (list: Row[], pick: (row: Row) => number) => list.reduce((total, row) => total + pick(row), 0);
    const open = scoped.filter((row) => row.status === 'open' || row.status === 'partial');
    const overdue = open.filter((row) => row.overdue);
    const settled = scoped.filter((row) => row.settled > 0);
    return {
      open: { count: open.length, value: sum(open, (row) => row.balance) },
      overdue: { count: overdue.length, value: sum(overdue, (row) => row.balance) },
      settled: { count: settled.length, value: sum(settled, (row) => row.settled) },
    };
  }, [scoped]);

  const categories = useMemo(
    () => [...new Set([...(payable ? EXPENSE_CATEGORIES : REVENUE_CATEGORIES), ...rows.map((row) => row.category).filter((c) => c !== '—')])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [rows, payable],
  );

  async function run(id: string, action: () => Promise<{ ok: boolean; error?: string }>, note: string) {
    setBusyId(id);
    const result = await action();
    setBusyId('');
    if (!result.ok) onError(result.error ?? 'Não foi possível concluir.');
    else onSaved(note);
    return result.ok;
  }

  async function handleDelete(row: Row) {
    const ok = await confirm({
      title: `Excluir ${words.one}`,
      message: `${row.description} · ${money(row.amount)} · vence ${dateBr(row.due)}. A conta sai do financeiro.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) await run(row.id, () => deleteBill(kind, row.id), `Conta excluída: ${row.description}`);
  }

  async function handleRevert(row: Row) {
    const ok = await confirm({
      title: 'Estornar baixa',
      message: `${row.description}: ${money(row.settled)} ${payable ? 'pago' : 'recebido'} volta para em aberto e o lançamento sai do caixa.`,
      confirmLabel: 'Estornar',
      danger: true,
    });
    if (ok && (await run(row.id, () => revertBill(kind, row.id), `Baixa estornada: ${row.description}`))) setViewing(null);
  }

  async function handleSettle(options: SettleBillOptions) {
    if (!settling) return;
    const result = payable ? await settlePayableDetailed(settling.id, options) : await settleReceivableDetailed(settling.id, options);
    if (!result.ok) {
      onError(result.error);
      throw new Error(result.error);
    }
    onSaved(`${payable ? 'Pagamento' : 'Recebimento'} registrado: ${settling.description}`);
    setSettling(null);
    setViewing(null);
  }

  // Conta com baixa ou gerada por venda/entrada: o valor não muda na edição.
  const editingRow = form?.mode === 'edit' ? rows.find((row) => row.id === form.bill?.id) : undefined;
  const lockReason = (row: Row) => (row.settled > 0 ? 'Estorne a baixa antes de excluir.' : row.origin ? `Gerada por ${row.origin.toLowerCase()}: corrija na origem.` : '');

  return (
    <article className="admin-card bills">
      <header className="bills__head">
        <h2>{words.title}</h2>
        <button type="button" className="btn btn--primary" onClick={() => setForm({ mode: 'new' })}>
          + Nova {words.one}
        </button>
      </header>

      <div className="bills__totals">
        <button type="button" className={status === 'open' ? 'is-active' : ''} onClick={() => setStatus('open')}>
          <span>Em aberto</span>
          <strong>{money(totals.open.value)}</strong>
          <small>{countLabel(totals.open.count)}</small>
        </button>
        <button type="button" className={`is-danger${status === 'overdue' ? ' is-active' : ''}`} onClick={() => setStatus('overdue')}>
          <span>Vencidas</span>
          <strong>{money(totals.overdue.value)}</strong>
          <small>{countLabel(totals.overdue.count)}</small>
        </button>
        <button type="button" className={status === 'settled' ? 'is-active' : ''} onClick={() => setStatus('settled')}>
          <span>{payable ? 'Pagas' : 'Recebidas'}</span>
          <strong>{money(totals.settled.value)}</strong>
          <small>{countLabel(totals.settled.count)}</small>
        </button>
      </div>

      <div className="bills__filters">
        <div className="bills__chips" role="tablist" aria-label="Situação">
          {STATUS_FILTERS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={status === item.id} className={status === item.id ? 'is-active' : ''} onClick={() => setStatus(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <input className="bills__search" type="search" value={search} placeholder={`Buscar descrição, ${words.party.toLowerCase()}, documento…`} aria-label="Buscar conta" onChange={(e) => setSearch(e.target.value)} />
        <AdminPicker compact label="Vencimento" value={period} options={PERIODS} onChange={(value) => setPeriod(value as PeriodFilter)} />
        {period === 'custom' ? (
          <span className="bills__range">
            <input type="date" value={from} aria-label="De" onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} aria-label="Até" onChange={(e) => setTo(e.target.value)} />
          </span>
        ) : null}
        <AdminPicker compact label="Categoria" value={category} options={[{ value: '', label: 'Todas' }, ...categories.map((c) => ({ value: c, label: c }))]} onChange={setCategory} />
      </div>

      <div className="bills__table" role="table" aria-label={words.title}>
        <div className="bills__row bills__row--head" role="row">
          <span role="columnheader">Vencimento</span>
          <span role="columnheader">Descrição</span>
          <span role="columnheader">{words.party}</span>
          <span role="columnheader">Valor</span>
          <span role="columnheader">Saldo</span>
          <span role="columnheader">Situação</span>
          <span role="columnheader" aria-label="Ações" />
        </div>
        {visible.length === 0 ? <p className="bills__empty">Nenhuma conta neste filtro.</p> : null}
        {visible.map((row) => {
          const open = row.status === 'open' || row.status === 'partial';
          const lock = lockReason(row);
          return (
            <div key={row.id} role="row" className={`bills__row${row.overdue ? ' is-overdue' : ''}`}>
              <span role="cell" data-label="Vencimento">{dateBr(row.due)}</span>
              <span role="cell" data-label="Descrição" className="bills__desc">
                <button type="button" className="bills__link" onClick={() => setViewing(row.bill)}>
                  {row.description}
                </button>
                <small>
                  {row.category}
                  {row.document ? ` · Doc ${row.document}` : ''}
                  {row.origin ? ` · ${row.origin}` : ''}
                </small>
              </span>
              <span role="cell" data-label={words.party}>{row.party || '—'}</span>
              <span role="cell" data-label="Valor" className="bills__money">{money(row.amount)}</span>
              <span role="cell" data-label="Saldo" className="bills__money">{row.status === 'cancelled' ? '—' : money(row.balance)}</span>
              <span role="cell" data-label="Situação">
                <em className={`bills__status is-${row.overdue ? 'overdue' : row.status}`}>{row.overdue ? 'Vencida' : row.status === 'paid' ? words.settled : BILL_STATUS_LABEL[row.status]}</em>
              </span>
              <span role="cell" className="bills__actions">
                {open ? (
                  <button type="button" className="btn btn--primary btn--sm" disabled={busyId === row.id} onClick={() => setSettling(row.bill)}>
                    {words.settle}
                  </button>
                ) : null}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setViewing(row.bill)}>Ver</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm({ mode: 'edit', bill: row.bill })}>Editar</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm({ mode: 'duplicate', bill: row.bill })}>Duplicar</button>
                {row.settled > 0 ? (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busyId === row.id} onClick={() => void handleRevert(row)}>Estornar</button>
                ) : null}
                <button type="button" className="btn btn--ghost btn--sm bills__danger" disabled={Boolean(lock) || busyId === row.id} title={lock || 'Excluir conta'} onClick={() => void handleDelete(row)}>
                  Excluir
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {form ? (
        <BillForm
          kind={kind}
          form={form}
          accounts={accounts}
          suppliers={suppliers}
          categories={categories}
          lockAmount={Boolean(editingRow && (editingRow.settled > 0 || editingRow.origin))}
          onClose={() => setForm(null)}
          onSaved={(note) => {
            setForm(null);
            onSaved(note);
          }}
        />
      ) : null}
      {viewing ? (
        <BillView
          kind={kind}
          row={rows.find((row) => row.id === viewing.id) ?? null}
          accounts={accounts}
          words={words}
          onClose={() => setViewing(null)}
          onEdit={(bill) => {
            setViewing(null);
            setForm({ mode: 'edit', bill });
          }}
          onDuplicate={(bill) => {
            setViewing(null);
            setForm({ mode: 'duplicate', bill });
          }}
          onSettle={(bill) => setSettling(bill)}
          onRevert={(row) => void handleRevert(row)}
        />
      ) : null}
      <SettleBillModal open={Boolean(settling)} kind={kind} item={settling} accounts={accounts} onConfirm={handleSettle} onClose={() => setSettling(null)} />
      {dialog}
    </article>
  );
}

/** Nova conta, edição ou duplicação (a cópia vence no mês seguinte). */
function BillForm({
  kind,
  form,
  accounts,
  suppliers,
  categories,
  lockAmount,
  onClose,
  onSaved,
}: {
  kind: BillKind;
  form: FormMode;
  accounts: BankAccount[];
  suppliers: Array<{ id: string; name: string }>;
  categories: string[];
  lockAmount: boolean;
  onClose: () => void;
  onSaved: (note: string) => void;
}) {
  const payable = kind === 'payable';
  const source = form.bill;
  const [description, setDescription] = useState(source?.description ?? '');
  const [supplierId, setSupplierId] = useState(payable ? (source as Payable | undefined)?.supplierId ?? '' : '');
  const [party, setParty] = useState(source ? (payable ? (source as Payable).supplierName : (source as Receivable).customerName) : '');
  const [category, setCategory] = useState(source?.category || (payable ? EXPENSE_CATEGORIES[0] : REVENUE_CATEGORIES[2]));
  const [amount, setAmount] = useState(source?.amount ?? 0);
  const [dueDate, setDueDate] = useState(source ? (form.mode === 'duplicate' ? nextMonth(source.dueDate) : day(source.dueDate)) : today());
  const [documentNumber, setDocumentNumber] = useState(form.mode === 'edit' ? source?.documentNumber ?? '' : '');
  const [accountId, setAccountId] = useState(source?.accountId ?? '');
  const [notes, setNotes] = useState(form.mode === 'edit' ? source?.notes ?? '' : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const id = form.mode === 'edit' ? source?.id : undefined;
    const common = { id, description, category, amount, dueDate, accountId, notes, documentNumber: documentNumber.trim() || undefined };
    const result = payable ? await upsertPayable({ ...common, supplierId: supplierId || undefined, supplierName: party }) : await upsertReceivable({ ...common, customerName: party });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    onSaved(form.mode === 'edit' ? `Conta atualizada: ${result.data.description}` : `Conta lançada: ${result.data.description}`);
  }

  const title = form.mode === 'edit' ? 'Editar conta' : form.mode === 'duplicate' ? 'Duplicar conta' : payable ? 'Nova conta a pagar' : 'Nova conta a receber';
  return (
    <QuickModal title={title} subtitle={form.mode === 'duplicate' ? 'Cópia com vencimento no mês seguinte; confira e salve.' : undefined} submitLabel="Salvar" busy={saving} error={error} onClose={onClose} onSubmit={submit}>
      <div className="bills-form">
        <label className="admin-field bills-form__wide">
          Descrição
          <input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {payable ? (
          <AdminPicker
            label="Fornecedor cadastrado"
            value={supplierId}
            options={[{ value: '', label: 'Avulso (digitar o nome)' }, ...suppliers.map((item) => ({ value: item.id, label: item.name }))]}
            onChange={(value) => {
              setSupplierId(value);
              const found = suppliers.find((item) => item.id === value);
              if (found) setParty(found.name);
            }}
          />
        ) : null}
        <label className="admin-field">
          {payable ? 'Fornecedor (nome)' : 'Cliente'}
          <input value={party} maxLength={200} onChange={(e) => setParty(e.target.value)} />
        </label>
        <AdminPicker label="Categoria" value={category} options={categories.map((item) => ({ value: item, label: item }))} onChange={setCategory} />
        <label className="admin-field">
          Valor
          <CurrencyInput value={amount} onChange={setAmount} ariaLabel="Valor da conta" disabled={lockAmount} />
          {lockAmount ? <small className="bills-form__hint">Conta com baixa ou gerada por venda/entrada: o valor muda pelo estorno ou na origem.</small> : null}
        </label>
        <label className="admin-field">
          Vencimento
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label className="admin-field">
          Nº do documento (boleto, nota)
          <input value={documentNumber} maxLength={80} onChange={(e) => setDocumentNumber(e.target.value)} />
        </label>
        <AdminPicker label="Conta bancária" value={accountId} options={[{ value: '', label: 'Definir na baixa' }, ...accounts.map((item) => ({ value: item.id, label: item.name }))]} onChange={setAccountId} />
        <label className="admin-field bills-form__wide">
          Observações
          <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
    </QuickModal>
  );
}

/** Ficha da conta: dados, origem e as baixas que ela já teve no caixa. */
function BillView({
  kind,
  row,
  accounts,
  words,
  onClose,
  onEdit,
  onDuplicate,
  onSettle,
  onRevert,
}: {
  kind: BillKind;
  row: Row | null;
  accounts: BankAccount[];
  words: { party: string; settle: string; settled: string; settledAt: string };
  onClose: () => void;
  onEdit: (bill: Bill) => void;
  onDuplicate: (bill: Bill) => void;
  onSettle: (bill: Bill) => void;
  onRevert: (row: Row) => void;
}) {
  const [movements, setMovements] = useState<ApiBillMovement[] | null>(null);
  useEffect(() => {
    if (!row) return;
    let alive = true;
    setMovements(null);
    loadBillMovements(row.id)
      .then((list) => alive && setMovements(list))
      .catch(() => alive && setMovements([]));
    return () => {
      alive = false;
    };
  }, [row?.id, row?.settled]);
  if (!row) return null;
  const bill = row.bill;
  const open = row.status === 'open' || row.status === 'partial';
  const accountName = (id: string) => accounts.find((item) => item.id === id)?.name ?? '';
  return (
    <QuickModal title={row.description} subtitle={`${kind === 'payable' ? 'Conta a pagar' : 'Conta a receber'} · ${row.id}`} submitLabel="Fechar" readOnly onClose={onClose} onSubmit={onClose}>
      <dl className="bills-view">
        <div><dt>{words.party}</dt><dd>{row.party || '—'}</dd></div>
        <div><dt>Categoria</dt><dd>{row.category}</dd></div>
        <div><dt>Vencimento</dt><dd>{dateBr(row.due)}{row.overdue ? ' · vencida' : ''}</dd></div>
        <div><dt>Situação</dt><dd>{row.status === 'paid' ? words.settled : BILL_STATUS_LABEL[row.status]}</dd></div>
        <div><dt>Valor</dt><dd>{money(row.amount)}</dd></div>
        <div><dt>{words.settled}</dt><dd>{money(row.settled)}{row.settledAt ? ` em ${dateBr(row.settledAt)}` : ''}</dd></div>
        <div><dt>Saldo</dt><dd>{money(row.balance)}</dd></div>
        <div><dt>Conta bancária</dt><dd>{accountName(bill.accountId) || '—'}</dd></div>
        {row.document ? <div><dt>Documento</dt><dd>{row.document}</dd></div> : null}
        {row.origin ? <div><dt>Origem</dt><dd>{row.origin}</dd></div> : null}
        {bill.notes ? <div className="bills-view__wide"><dt>Observações</dt><dd>{bill.notes}</dd></div> : null}
      </dl>
      <h3 className="bills-view__title">Baixas no caixa</h3>
      {movements === null ? <p className="bills__empty">Carregando…</p> : null}
      {movements?.length === 0 ? <p className="bills__empty">Nenhuma baixa registrada.</p> : null}
      {movements?.length ? (
        <ul className="bills-view__moves">
          {movements.map((move) => (
            <li key={move.id}>
              <span>{new Date(move.at).toLocaleDateString('pt-BR')}</span>
              <span>{move.label}</span>
              <strong>{money(move.amount)}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="bills-view__actions">
        {open ? <button type="button" className="btn btn--primary" onClick={() => onSettle(bill)}>{words.settle}</button> : null}
        <button type="button" className="btn btn--ghost" onClick={() => onEdit(bill)}>Editar</button>
        <button type="button" className="btn btn--ghost" onClick={() => onDuplicate(bill)}>Duplicar</button>
        {row.settled > 0 ? <button type="button" className="btn btn--ghost" onClick={() => onRevert(row)}>Estornar baixa</button> : null}
      </div>
    </QuickModal>
  );
}
