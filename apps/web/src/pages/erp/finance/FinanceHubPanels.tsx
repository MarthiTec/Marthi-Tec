import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminPicker } from '../../../components/AdminPicker';
import {
  CrudListBar,
  matchesQuery,
  type CrudStatusFilter,
} from '../../../components/CrudKit';
import {
  addFinance,
  getAdminState,
} from '../../../data/adminStore';
import {
  attachBoletoToRemessa,
  BOLETO_EVENT,
  BOLETO_KIND_LABEL,
  BOLETO_STATUS_LABEL,
  cancelBoleto,
  createBoleto,
  findBoletoByNossoNumero,
  listBoletos,
  listOpenBankBoletos,
  markBoletoPaid,
  type Boleto,
  type BoletoKind,
} from '../../../data/boletoStore';
import {
  BANK_FILES_EVENT,
  CNAB_LAYOUT_LABEL,
  CONCILIATION_STATUS_LABEL,
  cancelRemessa,
  conciliationSnapshot,
  createRemessaBatch,
  downloadTextFile,
  getBankFileConfig,
  importRetornoBatch,
  listConciliation,
  listRemessas,
  listRetornos,
  markRemessaSent,
  markRetornoProcessed,
  matchConciliationRow,
  addConciliationRow,
  REMESSA_STATUS_LABEL,
  RETORNO_STATUS_LABEL,
  saveBankFileConfig,
  type CnabLayout,
  type ConciliationStatus,
} from '../../../data/bankFinanceFiles';
import {
  listBankAccounts,
  listReceivables,
  money,
  settleReceivable,
  upsertReceivable,
} from '../../../data/financeBook';

function defaultDue() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function parseMoney(raw: string) {
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

function useFinanceTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    function refresh() {
      setTick((value) => value + 1);
    }
    const events = [BOLETO_EVENT, BANK_FILES_EVENT, 'marthi-finance-book-updated'];
    for (const event of events) window.addEventListener(event, refresh);
    return () => {
      for (const event of events) window.removeEventListener(event, refresh);
    };
  }, []);
  return tick;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function FinanceBoletosPanel({
  onMessage,
  onError,
}: {
  onMessage: (note: string) => void;
  onError: (note: string) => void;
}) {
  const tick = useFinanceTick();
  const accounts = useMemo(() => listBankAccounts(true), [tick]);
  const receivables = useMemo(
    () => listReceivables().filter((item) => item.status === 'open' || item.status === 'partial'),
    [tick],
  );
  const config = useMemo(() => getBankFileConfig(), [tick]);
  const items = useMemo(() => listBoletos(), [tick]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState<BoletoKind>('bank');
  const [customerName, setCustomerName] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(defaultDue);
  const [bankAccountId, setBankAccountId] = useState(config.defaultBankAccountId);
  const [receivableId, setReceivableId] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const activeLike = item.status === 'open' || item.status === 'paid';
      if (status === 'active' && item.status !== 'open') return false;
      if (status === 'inactive' && item.status === 'open') return false;
      void activeLike;
      return matchesQuery(
        `${item.id} ${item.customerName} ${item.customerDocument} ${item.description} ${item.kind} ${item.nossoNumero ?? ''}`,
        query,
      );
    });
  }, [items, query, status]);

  const detail = items.find((item) => item.id === detailId) ?? null;

  function resetForm() {
    setCustomerName('');
    setCustomerDocument('');
    setDescription('');
    setAmount('');
    setDueDate(defaultDue());
    setReceivableId('');
    setKind('bank');
    setBankAccountId(config.defaultBankAccountId);
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const value = parseMoney(amount);
    if (!customerName.trim()) {
      onError('Informe o pagador.');
      return;
    }
    if (value <= 0) {
      onError('Valor inválido.');
      return;
    }
    if ((kind === 'bank' || kind === 'hybrid') && !bankAccountId && accounts.length) {
      onError('Selecione a conta bancária para o boleto.');
      return;
    }
    const boleto = createBoleto({
      kind,
      customerName,
      customerDocument,
      description: description || BOLETO_KIND_LABEL[kind],
      amount: value,
      dueDate,
      bankAccountId: bankAccountId || undefined,
      receivableId: receivableId || undefined,
    });
    onMessage(`${BOLETO_KIND_LABEL[boleto.kind]} ${boleto.id} emitido.`);
    resetForm();
    setShowForm(false);
    setDetailId(boleto.id);
  }

  async function onPay(item: Boleto) {
    const paid = markBoletoPaid(item.id);
    if (!paid) {
      onError('Não foi possível baixar o boleto.');
      return;
    }
    if (item.receivableId) {
      await settleReceivable(item.receivableId, item.amount);
    } else {
      const created = await upsertReceivable({
        description: `Boleto ${item.id} · ${item.description}`,
        customerName: item.customerName,
        category: 'Recebimentos',
        amount: item.amount,
        dueDate: item.dueDate,
        accountId: item.bankAccountId || config.defaultBankAccountId || accounts[0]?.id || '',
        notes: `Baixa automática do boleto ${item.id}`,
      });
      if (created.ok) await settleReceivable(created.data.id, item.amount);
    }
    void addFinance({
      type: 'in',
      amount: item.amount,
      label: `Baixa boleto ${item.id} · ${item.customerName}`,
      source: 'manual',
    }).catch(() => {
      /* extrato API pode falhar offline — boleto já baixado */
    });
    onMessage(`Boleto ${item.id} baixado e lançado no financeiro.`);
  }

  return (
    <div className="fin-hub-panel">
      <div className="fin-hub-hero">
        <div>
          <h2>Boletos e cobranças</h2>
          <p>
            Emita Pix, boleto bancário ou híbrido. Vincule a uma conta a receber e baixe com
            lançamento automático no extrato.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Fechar emissão' : 'Emitir boleto'}
        </button>
      </div>

      {showForm ? (
        <form className="admin-card fin-hub-card" onSubmit={onCreate}>
          <h3>Nova cobrança</h3>
          <div className="admin-form">
            <AdminPicker
              label="Tipo"
              value={kind}
              options={[
                { value: 'bank', label: 'Boleto bancário' },
                { value: 'hybrid', label: 'Híbrido (Pix + boleto)' },
                { value: 'pix', label: 'Pix puro' },
              ]}
              onChange={(value) => setKind(value as BoletoKind)}
            />
            <AdminPicker
              label="Conta bancária"
              value={bankAccountId}
              placeholder="Selecionar conta"
              options={accounts.map((item) => ({
                value: item.id,
                label: `${item.name} · ${item.bank || 'sem banco'}`,
              }))}
              onChange={setBankAccountId}
            />
            <label>
              Pagador
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nome ou razão social"
                required
              />
            </label>
            <label>
              CPF/CNPJ
              <input
                value={customerDocument}
                onChange={(e) => setCustomerDocument(e.target.value)}
                placeholder="Documento"
              />
            </label>
            <label>
              Valor (R$)
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                required
              />
            </label>
            <label>
              Vencimento
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
            </label>
            <AdminPicker
              label="Vincular a receber (opcional)"
              value={receivableId}
              placeholder="Sem vínculo"
              options={receivables.map((item) => ({
                value: item.id,
                label: `${item.customerName} · ${money(item.amount - item.receivedAmount)}`,
              }))}
              onChange={(value) => {
                setReceivableId(value);
                const recv = receivables.find((item) => item.id === value);
                if (recv) {
                  setCustomerName(recv.customerName);
                  setAmount(String(recv.amount - recv.receivedAmount));
                  setDueDate(recv.dueDate);
                  setDescription(recv.description);
                  if (recv.accountId) setBankAccountId(recv.accountId);
                }
              }}
            />
            <label className="span-2">
              Descrição
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Referência da cobrança"
              />
            </label>
          </div>
          <div className="admin-toolbar" style={{ marginTop: 12 }}>
            <button type="submit" className="btn btn--primary">
              Gerar cobrança
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <article className="admin-card fin-hub-card">
        <CrudListBar
          query={query}
          onQueryChange={setQuery}
          placeholder="Buscar boleto, pagador ou nosso número…"
          status={status}
          onStatusChange={setStatus}
          statusLabel="Situação"
        />
        {filtered.length === 0 ? (
          <p className="empty">Nenhum boleto encontrado.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cobrança</th>
                  <th>Tipo</th>
                  <th>Pagador</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className={item.id === detailId ? 'is-selected' : ''}>
                    <td>
                      <button
                        type="button"
                        className="admin-table__name-btn"
                        onClick={() => setDetailId(item.id)}
                      >
                        {item.id}
                      </button>
                      {item.nossoNumero ? (
                        <>
                          <br />
                          <span className="empty">NN {item.nossoNumero}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className={`erp-boleto-kind erp-boleto-kind--${item.kind}`}>
                        {BOLETO_KIND_LABEL[item.kind]}
                      </span>
                    </td>
                    <td>
                      {item.customerName}
                      {item.customerDocument ? (
                        <>
                          <br />
                          <span className="empty">{item.customerDocument}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="price-red">{money(item.amount)}</td>
                    <td>{new Date(`${item.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                    <td>{BOLETO_STATUS_LABEL[item.status]}</td>
                    <td className="admin-table__actions">
                      {item.status === 'open' ? (
                        <div className="admin-toolbar">
                          <button type="button" className="btn btn--ghost" onClick={() => void onPay(item)}>
                            Baixar
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                              cancelBoleto(item.id);
                              onMessage(`Boleto ${item.id} cancelado.`);
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {detail ? (
        <article className="admin-card fin-hub-card">
          <div className="dash-card__head">
            <h3>Detalhe · {detail.id}</h3>
            <button type="button" className="btn btn--ghost" onClick={() => setDetailId(null)}>
              Fechar
            </button>
          </div>
          <p className="empty">{detail.description}</p>
          {detail.pixCopyPaste ? (
            <div className="fin-copy-block">
              <span>Pix Copia e Cola</span>
              <code>{detail.pixCopyPaste}</code>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={async () => {
                  const ok = await copyText(detail.pixCopyPaste ?? '');
                  onMessage(ok ? 'Pix copiado.' : 'Não foi possível copiar.');
                }}
              >
                Copiar Pix
              </button>
            </div>
          ) : null}
          {detail.digitableLine ? (
            <div className="fin-copy-block">
              <span>Linha digitável</span>
              <code>{detail.digitableLine}</code>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={async () => {
                  const ok = await copyText(detail.digitableLine ?? '');
                  onMessage(ok ? 'Linha digitável copiada.' : 'Não foi possível copiar.');
                }}
              >
                Copiar linha
              </button>
            </div>
          ) : null}
        </article>
      ) : null}
    </div>
  );
}

export function FinanceConciliacaoPanel({
  onMessage,
  onError,
}: {
  onMessage: (note: string) => void;
  onError: (note: string) => void;
}) {
  const tick = useFinanceTick();
  const accounts = useMemo(() => listBankAccounts(true), [tick]);
  const config = useMemo(() => getBankFileConfig(), [tick]);
  const rows = useMemo(() => listConciliation(), [tick]);
  const snap = useMemo(() => conciliationSnapshot(), [tick]);
  const finance = useMemo(() => getAdminState().finance.slice(0, 40), [tick]);
  const boletos = useMemo(() => listBoletos().filter((item) => item.status === 'open' || item.status === 'paid'), [tick]);
  const [filter, setFilter] = useState<ConciliationStatus | 'all'>('pending');
  const [accountId, setAccountId] = useState(config.defaultBankAccountId);
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');

  const visible = rows.filter((row) => (filter === 'all' ? true : row.status === filter));

  function addRow(event: FormEvent) {
    event.preventDefault();
    const value = parseMoney(amount);
    if (!description.trim() || value <= 0) {
      onError('Informe descrição e valor do movimento bancário.');
      return;
    }
    addConciliationRow({
      bankAccountId: accountId,
      statementDate,
      description,
      amount: value,
      direction,
    });
    setDescription('');
    setAmount('');
    onMessage('Movimento do extrato bancário adicionado à conciliação.');
  }

  return (
    <div className="fin-hub-panel">
      <div className="fin-hub-hero">
        <div>
          <h2>Conciliação bancária</h2>
          <p>
            Compare o extrato do banco com lançamentos e boletos. Marque como conciliado, ignore ou
            vincule manualmente.
          </p>
        </div>
        <div className="fin-hub-kpis">
          <div>
            <span>Pendentes</span>
            <strong>{snap.pending}</strong>
          </div>
          <div>
            <span>Créditos abertos</span>
            <strong className="price-red">{money(snap.pendingIn)}</strong>
          </div>
          <div>
            <span>Débitos abertos</span>
            <strong className="qty-low">{money(snap.pendingOut)}</strong>
          </div>
        </div>
      </div>

      <form className="admin-card fin-hub-card" onSubmit={addRow}>
        <h3>Importar linha do extrato</h3>
        <p className="empty">Cole linhas do OFX/CSV manualmente por enquanto — pasta sugerida: {config.conciliationFolder}</p>
        <div className="admin-form">
          <AdminPicker
            label="Conta"
            value={accountId}
            options={accounts.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setAccountId}
          />
          <label>
            Data
            <input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
          </label>
          <AdminPicker
            label="Tipo"
            value={direction}
            options={[
              { value: 'in', label: 'Crédito (entrada)' },
              { value: 'out', label: 'Débito (saída)' },
            ]}
            onChange={(value) => setDirection(value as 'in' | 'out')}
          />
          <label>
            Valor
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </label>
          <label className="span-2">
            Descrição no banco
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn--primary">
            Adicionar à fila
          </button>
        </div>
      </form>

      <article className="admin-card fin-hub-card">
        <div className="admin-toolbar">
          <AdminPicker
            compact
            label="Filtro"
            value={filter}
            options={[
              { value: 'pending', label: 'Pendentes' },
              { value: 'matched', label: 'Conciliados' },
              { value: 'ignored', label: 'Ignorados' },
              { value: 'all', label: 'Todos' },
            ]}
            onChange={(value) => setFilter(value as ConciliationStatus | 'all')}
          />
        </div>
        {visible.length === 0 ? (
          <p className="empty">Nada nesta fila.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Vincular</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(`${row.statementDate}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                    <td>
                      {row.description}
                      <br />
                      <span className="empty">{row.direction === 'in' ? 'Crédito' : 'Débito'}</span>
                    </td>
                    <td className={row.direction === 'in' ? 'price-red' : 'qty-low'}>
                      {money(row.amount)}
                    </td>
                    <td>{CONCILIATION_STATUS_LABEL[row.status]}</td>
                    <td>
                      {row.status === 'pending' ? (
                        <div className="fin-concile-actions">
                          <AdminPicker
                            compact
                            label="Extrato interno"
                            value=""
                            placeholder="Lançamento…"
                            options={finance.map((item) => ({
                              value: item.id,
                              label: `${item.type === 'in' ? '+' : '-'} ${money(item.amount)} · ${item.label.slice(0, 28)}`,
                            }))}
                            onChange={(value) => {
                              matchConciliationRow(row.id, {
                                status: 'matched',
                                matchedFinanceId: value,
                              });
                              onMessage('Conciliado com lançamento do extrato.');
                            }}
                          />
                          <AdminPicker
                            compact
                            label="Boleto"
                            value=""
                            placeholder="Boleto…"
                            options={boletos.map((item) => ({
                              value: item.id,
                              label: `${item.id} · ${money(item.amount)}`,
                            }))}
                            onChange={(value) => {
                              matchConciliationRow(row.id, {
                                status: 'matched',
                                matchedBoletoId: value,
                              });
                              onMessage('Conciliado com boleto.');
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                              matchConciliationRow(row.id, { status: 'ignored' });
                              onMessage('Movimento ignorado.');
                            }}
                          >
                            Ignorar
                          </button>
                        </div>
                      ) : (
                        <span className="empty">
                          {row.matchedFinanceId || row.matchedBoletoId || '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}

export function FinanceRemessaRetornoPanel({
  onMessage,
  onError,
}: {
  onMessage: (note: string) => void;
  onError: (note: string) => void;
}) {
  const tick = useFinanceTick();
  const config = useMemo(() => getBankFileConfig(), [tick]);
  const accounts = useMemo(() => listBankAccounts(true), [tick]);
  const openBank = useMemo(() => listOpenBankBoletos(), [tick]);
  const remessas = useMemo(() => listRemessas(), [tick]);
  const retornos = useMemo(() => listRetornos(), [tick]);
  const [selected, setSelected] = useState<string[]>([]);
  const [accountId, setAccountId] = useState(config.defaultBankAccountId);
  const [retornoName, setRetornoName] = useState('');
  const [retornoText, setRetornoText] = useState('');

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function generateRemessa() {
    try {
      const boletos = openBank.filter((item) => selected.includes(item.id));
      const { batch, nossoNumeros } = createRemessaBatch({
        bankAccountId: accountId,
        boletos: boletos.map((item) => ({
          id: item.id,
          amount: item.amount,
          dueDate: item.dueDate,
          customerName: item.customerName,
          nossoNumero: item.nossoNumero,
        })),
      });
      attachBoletoToRemessa(batch.boletoIds, batch.id, nossoNumeros);
      downloadTextFile(batch.fileName, batch.contentPreview);
      setSelected([]);
      onMessage(
        `Remessa ${batch.fileName} gerada em “${batch.folderPath}”. Arquivo baixado para envio ao banco.`,
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao gerar remessa.');
    }
  }

  function onImportRetorno(event: FormEvent) {
    event.preventDefault();
    const open = listOpenBankBoletos();
    const suggested =
      open.length > 0
        ? open.slice(0, Math.min(5, open.length)).map((item) => ({
            nossoNumero: item.nossoNumero || item.id.replace(/\D/g, '').slice(-8) || '00000001',
            boletoId: item.id,
            amount: item.amount,
            occurrence: '06-Liquidação',
          }))
        : [
            {
              nossoNumero: '00000001',
              amount: 100,
              occurrence: '06-Liquidação (sem match)',
            },
          ];

    // Se o texto tiver nosso número, tenta casar
    const fromText = retornoText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const digits = line.replace(/\D/g, '');
        const nn = digits.slice(-8) || digits;
        const found = findBoletoByNossoNumero(nn);
        return {
          nossoNumero: nn || '00000000',
          boletoId: found?.id,
          amount: found?.amount ?? (parseMoney(line) || 0),
          occurrence: '06-Liquidação',
        };
      })
      .filter((item) => item.nossoNumero !== '00000000');

    const batch = importRetornoBatch({
      bankAccountId: accountId,
      fileName: retornoName,
      rawText: retornoText,
      suggested: fromText.length ? fromText : suggested,
    });
    setRetornoName('');
    setRetornoText('');
    onMessage(
      `Retorno ${batch.fileName} importado · ${batch.paidCount} liquidados · ${batch.unmatchedCount} sem match.`,
    );
  }

  async function processRetorno(id: string) {
    const batch = listRetornos().find((item) => item.id === id);
    if (!batch) return;
    let paid = 0;
    for (const item of batch.items) {
      if (!item.boletoId) continue;
      const boleto = listBoletos().find((row) => row.id === item.boletoId);
      if (!boleto || boleto.status !== 'open') continue;
      markBoletoPaid(boleto.id);
      if (boleto.receivableId) await settleReceivable(boleto.receivableId, boleto.amount);
      void addFinance({
        type: 'in',
        amount: boleto.amount,
        label: `Retorno ${batch.fileName} · ${boleto.id}`,
        source: 'manual',
      }).catch(() => {
        /* ignore */
      });
      paid += 1;
    }
    markRetornoProcessed(id);
    onMessage(`Retorno processado: ${paid} boleto(s) baixado(s).`);
  }

  return (
    <div className="fin-hub-panel">
      <div className="fin-hub-hero">
        <div>
          <h2>Remessa e retorno</h2>
          <p>
            Gere arquivo CNAB {config.cnabLayout} dos boletos em aberto e importe o retorno do banco
            para liquidar automaticamente. Pastas: remessa em <strong>{config.remessaFolder}</strong>
            , retorno em <strong>{config.retornoFolder}</strong>.
          </p>
        </div>
      </div>

      <div className="admin-grid fin-hub-split">
        <article className="admin-card fin-hub-card">
          <h3>Gerar remessa</h3>
          <div className="admin-form">
            <AdminPicker
              label="Conta / convênio"
              value={accountId}
              options={accounts.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setAccountId}
            />
          </div>
          {openBank.length === 0 ? (
            <p className="empty">Nenhum boleto bancário/híbrido em aberto.</p>
          ) : (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Boleto</th>
                    <th>Pagador</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {openBank.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(item.id)}
                          onChange={() => toggle(item.id)}
                          aria-label={`Selecionar ${item.id}`}
                        />
                      </td>
                      <td>
                        {item.id}
                        {item.remessaBatchId ? (
                          <>
                            <br />
                            <span className="empty">Já em remessa</span>
                          </>
                        ) : null}
                      </td>
                      <td>{item.customerName}</td>
                      <td>{money(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="admin-toolbar" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={!selected.length}
              onClick={generateRemessa}
            >
              Gerar e baixar remessa
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setSelected(openBank.map((item) => item.id))}
            >
              Marcar todos
            </button>
          </div>
        </article>

        <article className="admin-card fin-hub-card">
          <h3>Importar retorno</h3>
          <form onSubmit={onImportRetorno}>
            <div className="admin-form">
              <label className="span-2">
                Nome do arquivo
                <input
                  value={retornoName}
                  onChange={(e) => setRetornoName(e.target.value)}
                  placeholder="RETORNO_240_….RET"
                />
              </label>
              <label className="span-2">
                Conteúdo / colar linhas
                <textarea
                  value={retornoText}
                  onChange={(e) => setRetornoText(e.target.value)}
                  rows={6}
                  placeholder="Cole o CNAB de retorno ou deixe vazio para simular com boletos abertos"
                />
              </label>
            </div>
            <div className="admin-toolbar" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn--primary">
                Importar retorno
              </button>
            </div>
          </form>
        </article>
      </div>

      <article className="admin-card fin-hub-card">
        <h3>Histórico de remessas</h3>
        {remessas.length === 0 ? (
          <p className="empty">Nenhuma remessa gerada.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Layout</th>
                  <th>Qtd</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {remessas.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.fileName}
                      <br />
                      <span className="empty">{item.folderPath}</span>
                    </td>
                    <td>{CNAB_LAYOUT_LABEL[item.layout]}</td>
                    <td>{item.boletoIds.length}</td>
                    <td>{money(item.totalAmount)}</td>
                    <td>{REMESSA_STATUS_LABEL[item.status]}</td>
                    <td className="admin-table__actions">
                      <div className="admin-toolbar">
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => downloadTextFile(item.fileName, item.contentPreview)}
                        >
                          Baixar
                        </button>
                        {item.status === 'generated' ? (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                              markRemessaSent(item.id);
                              onMessage('Remessa marcada como enviada ao banco.');
                            }}
                          >
                            Enviada
                          </button>
                        ) : null}
                        {item.status !== 'sent' && item.status !== 'cancelled' ? (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() => {
                              cancelRemessa(item.id);
                              onMessage('Remessa cancelada.');
                            }}
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="admin-card fin-hub-card">
        <h3>Histórico de retornos</h3>
        {retornos.length === 0 ? (
          <p className="empty">Nenhum retorno importado.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Liquidado</th>
                  <th>Sem match</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {retornos.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.fileName}
                      <br />
                      <span className="empty">{item.folderPath}</span>
                    </td>
                    <td>{item.paidCount}</td>
                    <td>{item.unmatchedCount}</td>
                    <td>{RETORNO_STATUS_LABEL[item.status]}</td>
                    <td>
                      {item.status === 'imported' ? (
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => void processRetorno(item.id)}
                        >
                          Processar baixas
                        </button>
                      ) : (
                        <span className="empty">
                          {item.processedAt
                            ? new Date(item.processedAt).toLocaleString('pt-BR')
                            : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}

export function FinanceConfigPanel({
  onMessage,
}: {
  onMessage: (note: string) => void;
}) {
  const tick = useFinanceTick();
  const accounts = useMemo(() => listBankAccounts(true), [tick]);
  const saved = useMemo(() => getBankFileConfig(), [tick]);
  const [form, setForm] = useState(saved);

  useEffect(() => {
    setForm(saved);
  }, [saved.updatedAt]);

  function onSave(event: FormEvent) {
    event.preventDefault();
    saveBankFileConfig(form);
    onMessage('Configurações de arquivos bancários salvas.');
  }

  return (
    <div className="fin-hub-panel">
      <div className="fin-hub-hero">
        <div>
          <h2>Configurações bancárias</h2>
          <p>
            Defina pastas lógicas de remessa/retorno/extrato, convênio, carteira e layout CNAB. Os
            arquivos gerados são baixados no navegador; use os caminhos como referência da pasta no
            servidor ou máquina da loja.
          </p>
        </div>
      </div>

      <form className="admin-card fin-hub-card" onSubmit={onSave}>
        <h3>Pastas de arquivo</h3>
        <div className="admin-form">
          <label className="span-2">
            Pasta de remessas
            <input
              value={form.remessaFolder}
              onChange={(e) => setForm({ ...form, remessaFolder: e.target.value })}
              placeholder="Financeiro/Remessas"
            />
          </label>
          <label className="span-2">
            Pasta de retornos
            <input
              value={form.retornoFolder}
              onChange={(e) => setForm({ ...form, retornoFolder: e.target.value })}
              placeholder="Financeiro/Retornos"
            />
          </label>
          <label className="span-2">
            Pasta de extratos (conciliação)
            <input
              value={form.conciliationFolder}
              onChange={(e) => setForm({ ...form, conciliationFolder: e.target.value })}
              placeholder="Financeiro/Extratos"
            />
          </label>
        </div>

        <h3 style={{ marginTop: 20 }}>Convênio e CNAB</h3>
        <div className="admin-form">
          <AdminPicker
            label="Conta padrão"
            value={form.defaultBankAccountId}
            placeholder="Selecionar"
            options={accounts.map((item) => ({ value: item.id, label: item.name }))}
            onChange={(value) => setForm({ ...form, defaultBankAccountId: value })}
          />
          <AdminPicker
            label="Layout"
            value={form.cnabLayout}
            options={[
              { value: '240', label: CNAB_LAYOUT_LABEL['240'] },
              { value: '400', label: CNAB_LAYOUT_LABEL['400'] },
            ]}
            onChange={(value) => setForm({ ...form, cnabLayout: value as CnabLayout })}
          />
          <label>
            Convênio
            <input
              value={form.convenio}
              onChange={(e) => setForm({ ...form, convenio: e.target.value })}
            />
          </label>
          <label>
            Carteira
            <input
              value={form.carteira}
              onChange={(e) => setForm({ ...form, carteira: e.target.value })}
            />
          </label>
          <label>
            Cedente
            <input
              value={form.cedenteName}
              onChange={(e) => setForm({ ...form, cedenteName: e.target.value })}
            />
          </label>
          <label>
            CNPJ cedente
            <input
              value={form.cedenteDocument}
              onChange={(e) => setForm({ ...form, cedenteDocument: e.target.value })}
            />
          </label>
          <label>
            Próximo nosso número
            <input
              type="number"
              min={1}
              value={form.nextNossoNumero}
              onChange={(e) =>
                setForm({ ...form, nextNossoNumero: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </label>
          <label>
            Tolerância conciliação (centavos)
            <input
              type="number"
              min={0}
              value={form.autoMatchToleranceCents}
              onChange={(e) =>
                setForm({
                  ...form,
                  autoMatchToleranceCents: Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </label>
        </div>

        <div className="admin-toolbar" style={{ marginTop: 14 }}>
          <button type="submit" className="btn btn--primary">
            Salvar configurações
          </button>
        </div>
        <p className="empty" style={{ marginTop: 10 }}>
          Atualizado em {new Date(form.updatedAt).toLocaleString('pt-BR')}. Formas de pagamento do
          PDV ficam em Pagamentos do painel — aqui é só cobrança bancária / arquivos.
        </p>
      </form>
    </div>
  );
}
