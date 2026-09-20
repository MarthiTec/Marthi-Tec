import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import {
  addFinance,
  FINANCE_SOURCE_LABEL,
  getAdminState,
  type FinanceSource,
} from '../../data/adminStore';
import { logAction } from '../../data/auditLog';
import {
  ADVANCE_KIND_LABEL,
  applyAdvance,
  BANK_TYPE_LABEL,
  BILL_STATUS_LABEL,
  buildDre,
  cancelBill,
  createAdvance,
  createTreasuryMove,
  EXPENSE_CATEGORIES,
  isOverdue,
  listAdvances,
  listBankAccounts,
  listPayables,
  listReceivables,
  listTreasury,
  money,
  accountBalance,
  payablesOpenTotal,
  receivablesOpenTotal,
  refundAdvance,
  REVENUE_CATEGORIES,
  settlePayable,
  settleReceivable,
  totalTreasury,
  TREASURY_KIND_LABEL,
  upsertBankAccount,
  upsertPayable,
  upsertReceivable,
  type AdvanceKind,
  type BankAccountType,
  type TreasuryKind,
} from '../../data/financeBook';
import { listSuppliers } from '../../data/erpRegistry';

const TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'extrato', label: 'Extrato' },
  { id: 'pagar', label: 'A pagar' },
  { id: 'receber', label: 'A receber' },
  { id: 'contas', label: 'Contas bancárias' },
  { id: 'tesouraria', label: 'Tesouraria' },
  { id: 'antecipados', label: 'Antecipados' },
  { id: 'dre', label: 'DRE' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function parseTab(value: string | null): TabId {
  const match = TABS.find((tab) => tab.id === value);
  return match?.id ?? 'resumo';
}

function parseMoney(raw: string) {
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

export function FinancePage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const admin = useMemo(() => getAdminState(), [tick]);
  const accounts = useMemo(() => listBankAccounts(), [tick]);
  const payables = useMemo(() => listPayables(), [tick]);
  const receivables = useMemo(() => listReceivables(), [tick]);
  const treasury = useMemo(() => listTreasury(), [tick]);
  const advances = useMemo(() => listAdvances(), [tick]);
  const suppliers = useMemo(() => listSuppliers(true), []);
  const dre = useMemo(() => buildDre(), [tick]);

  const cashBalance = admin.finance.reduce(
    (sum, item) => sum + (item.type === 'in' ? item.amount : -item.amount),
    0,
  );

  function refresh(note?: string) {
    setTick((value) => value + 1);
    setError('');
    if (note) setMessage(note);
  }

  function audit(action: string, detail: string) {
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action,
      detail,
    });
  }

  function setTab(next: TabId) {
    const copy = new URLSearchParams(params);
    if (next === 'resumo') copy.delete('tab');
    else copy.set('tab', next);
    setParams(copy, { replace: true });
    setMessage('');
    setError('');
  }

  return (
    <section className="admin-page">
      <div className="fin-tabs" role="tablist" aria-label="Financeiro">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`fin-tabs__btn${tab === item.id ? ' is-active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      {tab === 'resumo' ? (
        <ResumoPanel
          cashBalance={cashBalance}
          treasuryTotal={totalTreasury()}
          payables={payablesOpenTotal()}
          receivables={receivablesOpenTotal()}
          dre={dre}
          onGo={setTab}
        />
      ) : null}

      {tab === 'extrato' ? (
        <ExtratoPanel
          onSaved={() => {
            refresh('Movimento lançado.');
            audit('financeiro.extrato', 'Lançamento manual');
          }}
        />
      ) : null}

      {tab === 'pagar' ? (
        <PagarPanel
          accounts={accounts}
          suppliers={suppliers}
          items={payables}
          onError={setError}
          onSaved={(note) => {
            refresh(note);
            audit('financeiro.pagar', note);
          }}
        />
      ) : null}

      {tab === 'receber' ? (
        <ReceberPanel
          accounts={accounts}
          items={receivables}
          onError={setError}
          onSaved={(note) => {
            refresh(note);
            audit('financeiro.receber', note);
          }}
        />
      ) : null}

      {tab === 'contas' ? (
        <ContasPanel
          accounts={accounts}
          onError={setError}
          onSaved={(note) => {
            refresh(note);
            audit('financeiro.conta', note);
          }}
        />
      ) : null}

      {tab === 'tesouraria' ? (
        <TesourariaPanel
          accounts={accounts}
          moves={treasury}
          onError={setError}
          onSaved={(note) => {
            refresh(note);
            audit('financeiro.tesouraria', note);
          }}
        />
      ) : null}

      {tab === 'antecipados' ? (
        <AntecipadosPanel
          accounts={accounts}
          items={advances}
          onError={setError}
          onSaved={(note) => {
            refresh(note);
            audit('financeiro.antecipado', note);
          }}
        />
      ) : null}

      {tab === 'dre' ? <DrePanel month={dre.month} lines={dre.lines} result={dre.result} /> : null}
    </section>
  );
}

function ResumoPanel({
  cashBalance,
  treasuryTotal,
  payables,
  receivables,
  dre,
  onGo,
}: {
  cashBalance: number;
  treasuryTotal: number;
  payables: number;
  receivables: number;
  dre: ReturnType<typeof buildDre>;
  onGo: (tab: TabId) => void;
}) {
  return (
    <>
      <div className="admin-grid">
        <article className="admin-card">
          <h2>Saldo caixa</h2>
          <strong>{money(cashBalance)}</strong>
          <p>Extrato operacional.</p>
        </article>
        <article className="admin-card">
          <h2>Tesouraria</h2>
          <strong>{money(treasuryTotal)}</strong>
          <p>Soma das contas bancárias.</p>
        </article>
        <article className="admin-card">
          <h2>A receber</h2>
          <strong className="price-red">{money(receivables)}</strong>
          <p>Em aberto / parcial.</p>
        </article>
        <article className="admin-card">
          <h2>A pagar</h2>
          <strong className="qty-low">{money(payables)}</strong>
          <p>Em aberto / parcial.</p>
        </article>
      </div>
      <article className="admin-card">
        <div className="dash-card__head">
          <h2>DRE do mês ({dre.month})</h2>
          <button type="button" className="btn btn--ghost" onClick={() => onGo('dre')}>
            Ver DRE completa
          </button>
        </div>
        <div className="fin-dre-preview">
          <div>
            <span>Receita</span>
            <strong className="price-red">{money(dre.revenue)}</strong>
          </div>
          <div>
            <span>Despesas</span>
            <strong className="qty-low">{money(dre.expenses)}</strong>
          </div>
          <div>
            <span>Resultado</span>
            <strong className={dre.result >= 0 ? 'price-red' : 'qty-low'}>{money(dre.result)}</strong>
          </div>
        </div>
        <div className="admin-toolbar admin-toolbar--stack" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--ghost" onClick={() => onGo('pagar')}>
            Contas a pagar
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onGo('receber')}>
            Contas a receber
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onGo('contas')}>
            Contas bancárias
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onGo('tesouraria')}>
            Tesouraria
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onGo('antecipados')}>
            Antecipados
          </button>
        </div>
      </article>
    </>
  );
}

function ExtratoPanel({ onSaved }: { onSaved: () => void }) {
  const [state, setState] = useState(() => getAdminState());
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'in' | 'out'>('out');
  const [sourceFilter, setSourceFilter] = useState<'all' | FinanceSource>('all');

  const entries =
    sourceFilter === 'all'
      ? state.finance
      : state.finance.filter((item) => item.source === sourceFilter);

  function submit() {
    const value = parseMoney(amount);
    if (!label.trim() || value <= 0) return;
    setState(addFinance({ type, label: label.trim(), amount: value, source: 'manual' }));
    setLabel('');
    setAmount('');
    onSaved();
  }

  return (
    <>
      <article className="admin-card">
        <h2>Lançar movimento</h2>
        <div className="admin-form">
          <AdminPicker
            label="Tipo"
            value={type}
            options={[
              { value: 'in', label: 'Entrada' },
              { value: 'out', label: 'Saída' },
            ]}
            onChange={(value) => setType(value as 'in' | 'out')}
          />
          <label>
            Valor
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="span-2">
            Descrição
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Lançar
          </button>
        </div>
      </article>
      <article className="admin-card">
        <div className="admin-toolbar" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1 }}>Extrato</h2>
          <AdminPicker
            compact
            label="Origem"
            value={sourceFilter}
            options={[
              { value: 'all', label: 'Todas' },
              ...(Object.keys(FINANCE_SOURCE_LABEL) as FinanceSource[]).map((key) => ({
                value: key,
                label: FINANCE_SOURCE_LABEL[key],
              })),
            ]}
            onChange={(value) => setSourceFilter(value as 'all' | FinanceSource)}
          />
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Origem</th>
              <th>Descrição</th>
              <th>Ref</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                <td>{FINANCE_SOURCE_LABEL[item.source]}</td>
                <td>{item.label}</td>
                <td>
                  {item.refId?.startsWith('OS-') ? (
                    <Link to={`/os/${item.refId}`}>{item.refId}</Link>
                  ) : (
                    item.refId || '—'
                  )}
                </td>
                <td className={item.type === 'in' ? 'price-red' : 'qty-low'}>
                  {item.type === 'in' ? '+' : '-'}
                  {money(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}

function PagarPanel({
  accounts,
  suppliers,
  items,
  onError,
  onSaved,
}: {
  accounts: ReturnType<typeof listBankAccounts>;
  suppliers: ReturnType<typeof listSuppliers>;
  items: ReturnType<typeof listPayables>;
  onError: (value: string) => void;
  onSaved: (note: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');

  function submit() {
    const result = upsertPayable({
      description,
      supplierId: supplierId || undefined,
      supplierName,
      category,
      amount: parseMoney(amount),
      dueDate,
      accountId,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setDescription('');
    setSupplierName('');
    setAmount('');
    onSaved(`Conta a pagar ${result.data.id}`);
  }

  return (
    <>
      <article className="admin-card">
        <h2>Nova conta a pagar</h2>
        <div className="admin-form">
          <label className="span-2">
            Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <AdminPicker
            label="Fornecedor cadastrado"
            value={supplierId}
            placeholder="Avulso"
            options={suppliers.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => {
              setSupplierId(value);
              const found = suppliers.find((item) => item.id === value);
              if (found) setSupplierName(found.name);
            }}
          />
          <label>
            Fornecedor (nome)
            <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          </label>
          <AdminPicker
            label="Categoria"
            value={category}
            options={EXPENSE_CATEGORIES.map((item) => ({ value: item, label: item }))}
            onChange={setCategory}
          />
          <label>
            Valor
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Vencimento
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <AdminPicker
            label="Conta para baixa"
            value={accountId}
            options={accounts.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setAccountId}
          />
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Cadastrar
          </button>
        </div>
      </article>
      <article className="admin-card">
        <h2>Contas a pagar</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Fornecedor</th>
              <th>Venc.</th>
              <th>Valor</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const open = item.amount - item.paidAmount;
              return (
                <tr key={item.id} className={isOverdue(item.dueDate, item.status) ? 'is-overdue' : ''}>
                  <td>
                    {item.description}
                    <div className="empty">{item.category}</div>
                  </td>
                  <td>{item.supplierName || '—'}</td>
                  <td>{item.dueDate}</td>
                  <td>
                    {money(item.amount)}
                    {item.paidAmount > 0 ? (
                      <div className="empty">pago {money(item.paidAmount)}</div>
                    ) : null}
                  </td>
                  <td>{BILL_STATUS_LABEL[item.status]}</td>
                  <td>
                    <div className="crud-actions">
                      {item.status === 'open' || item.status === 'partial' ? (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => {
                            const result = settlePayable(item.id, open);
                            if (!result.ok) onError(result.error);
                            else onSaved(`Baixa ${item.id}`);
                          }}
                        >
                          Pagar
                        </button>
                      ) : null}
                      {item.status === 'open' ? (
                        <button
                          type="button"
                          className="btn btn--ghost crud-actions__danger"
                          onClick={() => {
                            const result = cancelBill('payable', item.id);
                            if (!result.ok) onError(result.error);
                            else onSaved(`Cancelada ${item.id}`);
                          }}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </>
  );
}

function ReceberPanel({
  accounts,
  items,
  onError,
  onSaved,
}: {
  accounts: ReturnType<typeof listBankAccounts>;
  items: ReturnType<typeof listReceivables>;
  onError: (value: string) => void;
  onSaved: (note: string) => void;
}) {
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [category, setCategory] = useState<string>(REVENUE_CATEGORIES[2]);
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');

  function submit() {
    const result = upsertReceivable({
      description,
      customerName,
      category,
      amount: parseMoney(amount),
      dueDate,
      accountId,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setDescription('');
    setCustomerName('');
    setAmount('');
    onSaved(`Conta a receber ${result.data.id}`);
  }

  return (
    <>
      <article className="admin-card">
        <h2>Nova conta a receber</h2>
        <div className="admin-form">
          <label className="span-2">
            Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            Cliente
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>
          <AdminPicker
            label="Categoria"
            value={category}
            options={REVENUE_CATEGORIES.map((item) => ({ value: item, label: item }))}
            onChange={setCategory}
          />
          <label>
            Valor
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label>
            Vencimento
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <AdminPicker
            label="Conta para baixa"
            value={accountId}
            options={accounts.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setAccountId}
          />
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Cadastrar
          </button>
        </div>
      </article>
      <article className="admin-card">
        <h2>Contas a receber</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th>Cliente</th>
              <th>Venc.</th>
              <th>Valor</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const open = item.amount - item.receivedAmount;
              return (
                <tr key={item.id} className={isOverdue(item.dueDate, item.status) ? 'is-overdue' : ''}>
                  <td>
                    {item.description}
                    <div className="empty">{item.category}</div>
                  </td>
                  <td>{item.customerName}</td>
                  <td>{item.dueDate}</td>
                  <td>
                    {money(item.amount)}
                    {item.receivedAmount > 0 ? (
                      <div className="empty">recebido {money(item.receivedAmount)}</div>
                    ) : null}
                  </td>
                  <td>{BILL_STATUS_LABEL[item.status]}</td>
                  <td>
                    <div className="crud-actions">
                      {item.status === 'open' || item.status === 'partial' ? (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => {
                            const result = settleReceivable(item.id, open);
                            if (!result.ok) onError(result.error);
                            else onSaved(`Recebimento ${item.id}`);
                          }}
                        >
                          Receber
                        </button>
                      ) : null}
                      {item.status === 'open' ? (
                        <button
                          type="button"
                          className="btn btn--ghost crud-actions__danger"
                          onClick={() => {
                            const result = cancelBill('receivable', item.id);
                            if (!result.ok) onError(result.error);
                            else onSaved(`Cancelada ${item.id}`);
                          }}
                        >
                          Cancelar
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </article>
    </>
  );
}

function ContasPanel({
  accounts,
  onError,
  onSaved,
}: {
  accounts: ReturnType<typeof listBankAccounts>;
  onError: (value: string) => void;
  onSaved: (note: string) => void;
}) {
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [agency, setAgency] = useState('');
  const [number, setNumber] = useState('');
  const [type, setType] = useState<BankAccountType>('checking');
  const [initialBalance, setInitialBalance] = useState('0');

  function submit() {
    const result = upsertBankAccount({
      name,
      bank,
      agency,
      number,
      type,
      initialBalance: parseMoney(initialBalance),
      active: true,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setName('');
    setBank('');
    setAgency('');
    setNumber('');
    setInitialBalance('0');
    onSaved(`Conta ${result.data.name}`);
  }

  return (
    <>
      <article className="admin-card">
        <h2>Cadastrar conta bancária</h2>
        <div className="admin-form">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Operacional" />
          </label>
          <AdminPicker
            label="Tipo"
            value={type}
            options={(Object.keys(BANK_TYPE_LABEL) as BankAccountType[]).map((key) => ({
              value: key,
              label: BANK_TYPE_LABEL[key],
            }))}
            onChange={(value) => setType(value as BankAccountType)}
          />
          <label>
            Banco
            <input value={bank} onChange={(e) => setBank(e.target.value)} />
          </label>
          <label>
            Agência
            <input value={agency} onChange={(e) => setAgency(e.target.value)} />
          </label>
          <label>
            Número
            <input value={number} onChange={(e) => setNumber(e.target.value)} />
          </label>
          <label>
            Saldo inicial
            <input value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Cadastrar
          </button>
        </div>
      </article>
      <article className="admin-card">
        <h2>Contas</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tipo</th>
              <th>Banco</th>
              <th>Agência / Nº</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{BANK_TYPE_LABEL[item.type]}</td>
                <td>{item.bank || '—'}</td>
                <td>
                  {item.agency} / {item.number}
                </td>
                <td>{money(accountBalance(item.id))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}

function TesourariaPanel({
  accounts,
  moves,
  onError,
  onSaved,
}: {
  accounts: ReturnType<typeof listBankAccounts>;
  moves: ReturnType<typeof listTreasury>;
  onError: (value: string) => void;
  onSaved: (note: string) => void;
}) {
  const [kind, setKind] = useState<TreasuryKind>('transfer');
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  function submit() {
    const result = createTreasuryMove({
      kind,
      fromAccountId: kind === 'deposit' ? '' : fromAccountId,
      toAccountId: kind === 'withdraw' ? '' : toAccountId,
      amount: parseMoney(amount),
      description,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setAmount('');
    setDescription('');
    onSaved(`${TREASURY_KIND_LABEL[kind]} ${money(result.data.amount)}`);
  }

  return (
    <>
      <article className="admin-card">
        <h2>Movimento de tesouraria</h2>
        <div className="admin-form">
          <AdminPicker
            label="Tipo"
            value={kind}
            options={(Object.keys(TREASURY_KIND_LABEL) as TreasuryKind[]).map((key) => ({
              value: key,
              label: TREASURY_KIND_LABEL[key],
            }))}
            onChange={(value) => setKind(value as TreasuryKind)}
          />
          <label>
            Valor
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          {kind !== 'deposit' ? (
            <AdminPicker
              label="Origem"
              value={fromAccountId}
              options={accounts.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setFromAccountId}
            />
          ) : null}
          {kind !== 'withdraw' ? (
            <AdminPicker
              label="Destino"
              value={toAccountId}
              options={accounts.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setToAccountId}
            />
          ) : null}
          <label className="span-2">
            Descrição
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Registrar
          </button>
        </div>
      </article>
      <article className="admin-card">
        <h2>Histórico</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Tipo</th>
              <th>Descrição</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {moves.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  Nenhum movimento ainda.
                </td>
              </tr>
            ) : (
              moves.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.at).toLocaleString('pt-BR')}</td>
                  <td>{TREASURY_KIND_LABEL[item.kind]}</td>
                  <td>{item.description}</td>
                  <td>{money(item.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </>
  );
}

function AntecipadosPanel({
  accounts,
  items,
  onError,
  onSaved,
}: {
  accounts: ReturnType<typeof listBankAccounts>;
  items: ReturnType<typeof listAdvances>;
  onError: (value: string) => void;
  onSaved: (note: string) => void;
}) {
  const [kind, setKind] = useState<AdvanceKind>('customer');
  const [partyName, setPartyName] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [notes, setNotes] = useState('');

  function submit() {
    const result = createAdvance({
      kind,
      partyName,
      amount: parseMoney(amount),
      accountId,
      notes,
    });
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setPartyName('');
    setAmount('');
    setNotes('');
    onSaved(`Antecipação ${result.data.id}`);
  }

  return (
    <>
      <article className="admin-card">
        <h2>Pagamento / recebimento antecipado</h2>
        <div className="admin-form">
          <AdminPicker
            label="Tipo"
            value={kind}
            options={(Object.keys(ADVANCE_KIND_LABEL) as AdvanceKind[]).map((key) => ({
              value: key,
              label: ADVANCE_KIND_LABEL[key],
            }))}
            onChange={(value) => setKind(value as AdvanceKind)}
          />
          <label>
            Cliente / fornecedor
            <input value={partyName} onChange={(e) => setPartyName(e.target.value)} />
          </label>
          <label>
            Valor
            <input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <AdminPicker
            label="Conta"
            value={accountId}
            options={accounts.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setAccountId}
          />
          <label className="span-2">
            Observação
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Registrar
          </button>
        </div>
      </article>
      <article className="admin-card">
        <h2>Antecipações</h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Parte</th>
              <th>Valor</th>
              <th>Usado</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{ADVANCE_KIND_LABEL[item.kind]}</td>
                <td>{item.partyName}</td>
                <td>{money(item.amount)}</td>
                <td>{money(item.usedAmount)}</td>
                <td>{item.status}</td>
                <td>
                  <div className="crud-actions">
                    {item.status === 'open' ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => {
                            const open = item.amount - item.usedAmount;
                            const result = applyAdvance(item.id, open);
                            if (!result.ok) onError(result.error);
                            else onSaved(`Aplicada ${item.id}`);
                          }}
                        >
                          Aplicar
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost crud-actions__danger"
                          onClick={() => {
                            const result = refundAdvance(item.id);
                            if (!result.ok) onError(result.error);
                            else onSaved(`Estornada ${item.id}`);
                          }}
                        >
                          Estornar
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  );
}

function DrePanel({
  month,
  lines,
  result,
}: {
  month: string;
  lines: ReturnType<typeof buildDre>['lines'];
  result: number;
}) {
  return (
    <article className="admin-card">
      <div className="dash-card__head">
        <h2>DRE · {month}</h2>
        <strong className={result >= 0 ? 'price-red' : 'qty-low'}>{money(result)}</strong>
      </div>
      <p className="empty">
        Demonstrativo simplificado: caixa do mês + baixas de contas a pagar/receber. MVP local —
        depois consolida no backend.
      </p>
      <table className="admin-table fin-dre-table">
        <thead>
          <tr>
            <th>Linha</th>
            <th>Valor</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.label} className={line.kind === 'total' ? 'fin-dre-table__total' : ''}>
              <td>{line.label}</td>
              <td
                className={
                  line.kind === 'expense' || (line.kind === 'total' && line.amount < 0)
                    ? 'qty-low'
                    : line.kind === 'revenue' || line.amount > 0
                      ? 'price-red'
                      : ''
                }
              >
                {money(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
