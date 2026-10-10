import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { QuickModal } from '../../components/QuickModal';
import { findBrand, useBrands } from '../../data/brandStore';
import { getActiveStore, STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import { CONDITION_LABEL, conditionCode } from '../../data/productCondition';
import {
  apiImeiHistory,
  apiImeiReport,
  apiImeiRevert,
  apiImeiWriteOff,
  IMEI_STATUS_LABEL,
  type ImeiHistory,
  type ImeiReportRow,
  type ImeiStatus,
  type ImeiWriteOffKind,
} from '../../services/imeiApi';
import './stockReport.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBr = (iso: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const dateTimeBr = (iso: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

type StatusFilter = 'in_stock' | 'out' | 'all' | ImeiStatus;
const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'in_stock', label: 'Em estoque' },
  { value: 'out', label: 'Saíram (todas as saídas)' },
  { value: 'sale', label: 'Vendidos' },
  { value: 'bonus', label: 'Bonificação' },
  { value: 'internal', label: 'Uso interno' },
  { value: 'loss', label: 'Perda / defeito' },
  { value: 'all', label: 'Todos' },
];
type SortKey = 'entry-desc' | 'entry-asc' | 'exit-desc' | 'model' | 'cost-desc' | 'price-desc';
const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'entry-desc', label: 'Entrada mais recente' },
  { value: 'entry-asc', label: 'Entrada mais antiga' },
  { value: 'exit-desc', label: 'Saída mais recente' },
  { value: 'model', label: 'Modelo (A–Z)' },
  { value: 'cost-desc', label: 'Maior custo' },
  { value: 'price-desc', label: 'Maior venda' },
];
const WRITE_OFF_OPTIONS: Array<{ value: ImeiWriteOffKind; label: string }> = [
  { value: 'bonus', label: 'Bonificação (brinde)' },
  { value: 'internal', label: 'Uso interno' },
  { value: 'loss', label: 'Perda / defeito' },
];

const statusClass = (status: ImeiStatus) => (status === 'in_stock' ? 'is-stock' : 'is-sold');
const modelOf = (row: ImeiReportRow) => [row.typeName, row.modelName].filter(Boolean).join(' ') || row.productName;
const attrsOf = (row: ImeiReportRow) => Object.values(row.attrs ?? {}).filter(Boolean).join(' · ');

/**
 * Relatório de estoque por IMEI: cada aparelho com modelo, descrição, custo, venda, entrada e saída.
 * Daqui se vê o histórico do IMEI e se dá baixa manual (bonificação, uso interno, perda) ou estorno.
 */
export function ImeiReportPage() {
  const [rows, setRows] = useState<ImeiReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { brands } = useBrands();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('in_stock');
  const [origin, setOrigin] = useState('');
  const [entryFrom, setEntryFrom] = useState('');
  const [entryTo, setEntryTo] = useState('');
  const [exitFrom, setExitFrom] = useState('');
  const [exitTo, setExitTo] = useState('');
  const [sort, setSort] = useState<SortKey>('entry-desc');

  const [history, setHistory] = useState<ImeiHistory | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [writeOff, setWriteOff] = useState<{ row: ImeiReportRow; kind: ImeiWriteOffKind; notes: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiImeiReport()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar o relatório.'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (status === 'out' && row.status === 'in_stock') return false;
      if (status !== 'out' && status !== 'all' && row.status !== status) return false;
      if (origin && row.originKind !== origin) return false;
      if (entryFrom && row.entryDate < entryFrom) return false;
      if (entryTo && row.entryDate > entryTo) return false;
      if (exitFrom && (!row.exitDate || row.exitDate.slice(0, 10) < exitFrom)) return false;
      if (exitTo && (!row.exitDate || row.exitDate.slice(0, 10) > exitTo)) return false;
      if (q) {
        const text = `${row.imei} ${row.productName} ${modelOf(row)} ${row.brand} ${findBrand(brands, row.brand)?.name ?? ''} ${attrsOf(row)} ${row.origin} ${row.customerName} ${row.saleId} ${row.notes}`.toLowerCase();
        if (!q.split(/\s+/).every((term) => text.includes(term))) return false;
      }
      return true;
    });
    const sorters: Record<SortKey, (a: ImeiReportRow, b: ImeiReportRow) => number> = {
      'entry-desc': (a, b) => b.entryDate.localeCompare(a.entryDate),
      'entry-asc': (a, b) => a.entryDate.localeCompare(b.entryDate),
      'exit-desc': (a, b) => (b.exitDate || '').localeCompare(a.exitDate || ''),
      model: (a, b) => modelOf(a).localeCompare(modelOf(b), 'pt-BR') || a.imei.localeCompare(b.imei),
      'cost-desc': (a, b) => b.cost - a.cost,
      'price-desc': (a, b) => b.price - a.price,
    };
    return [...filtered].sort(sorters[sort]);
  }, [rows, query, status, origin, entryFrom, entryTo, exitFrom, exitTo, sort, brands]);

  const totals = useMemo(() => {
    const cost = visible.reduce((sum, row) => sum + row.cost, 0);
    const price = visible.reduce((sum, row) => sum + row.price, 0);
    const soldRows = visible.filter((row) => row.status === 'sale');
    const profit = soldRows.reduce((sum, row) => sum + row.price - row.cost, 0);
    return { count: visible.length, cost, price, sold: soldRows.length, profit };
  }, [visible]);

  async function openHistory(imei: string) {
    setHistoryBusy(true);
    setModalError('');
    try {
      setHistory(await apiImeiHistory(imei));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o histórico.');
    } finally {
      setHistoryBusy(false);
    }
  }

  async function confirmWriteOff() {
    if (!writeOff || busy) return;
    setBusy(true);
    setModalError('');
    try {
      const result = await apiImeiWriteOff(writeOff.row.imei, { kind: writeOff.kind, notes: writeOff.notes.trim() });
      setNotice(`Baixa registrada: IMEI ${writeOff.row.imei} (${IMEI_STATUS_LABEL[writeOff.kind]}). O aparelho saiu do estoque.`);
      setWriteOff(null);
      setHistory(result.history);
      load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Não foi possível dar baixa.');
    } finally {
      setBusy(false);
    }
  }

  async function revert(outputId: string) {
    if (!history || busy) return;
    const reason = window.prompt('Motivo do estorno (opcional):', '') ?? null;
    if (reason === null) return;
    setBusy(true);
    setModalError('');
    try {
      await apiImeiRevert(outputId, reason);
      setNotice(`Baixa estornada: o IMEI ${history.imei} voltou ao estoque.`);
      setHistory(await apiImeiHistory(history.imei));
      load();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Não foi possível estornar.');
    } finally {
      setBusy(false);
    }
  }

  function print() {
    document.body.classList.add('is-printing-report');
    const done = () => {
      document.body.classList.remove('is-printing-report');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  const store = getActiveStore();
  const table = (printing: boolean) => (
    <table className="stock-report__table">
      <thead>
        <tr>
          <th>IMEI</th>
          <th>Modelo</th>
          <th>Descrição</th>
          <th>Variação</th>
          <th>Condição</th>
          <th>Origem</th>
          <th>Entrada</th>
          <th className="is-num">Custo</th>
          <th className="is-num">Venda</th>
          <th>Situação</th>
          <th>Saída</th>
          <th>Cliente / obs.</th>
          {printing ? null : <th>Ações</th>}
        </tr>
      </thead>
      <tbody>
        {visible.map((row) => (
          <tr key={`${row.entryId}:${row.imei}`}>
            <td className="is-mono">
              {printing ? (
                row.imei
              ) : (
                <button type="button" className="imei-report__link" disabled={historyBusy} onClick={() => void openHistory(row.imei)} title="Ver o histórico deste IMEI">
                  {row.imei}
                </button>
              )}
            </td>
            <td className="is-name">
              <strong>{modelOf(row)}</strong>
              {row.brand ? <small>{findBrand(brands, row.brand)?.name ?? row.brand}</small> : null}
            </td>
            <td>{row.productName}</td>
            <td>{attrsOf(row) || '—'}</td>
            <td>
              {CONDITION_LABEL[conditionCode(row.condition) || 'new']}
              {row.batteryLevel != null ? ` · ${row.batteryLevel}%` : ''}
            </td>
            <td>{row.origin || '—'}</td>
            <td>{dateBr(row.entryDate)}</td>
            <td className="is-num">{money(row.cost)}</td>
            <td className="is-num">{money(row.price)}</td>
            <td>
              <span className={`stock-report__status ${statusClass(row.status)}`}>{IMEI_STATUS_LABEL[row.status]}</span>
            </td>
            <td>{row.exitDate ? dateTimeBr(row.exitDate) : '—'}</td>
            <td className="is-notes">{[row.customerName, row.notes].filter(Boolean).join(' · ') || '—'}</td>
            {printing ? null : (
              <td>
                {row.status === 'in_stock' ? (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setModalError(''); setWriteOff({ row, kind: 'bonus', notes: '' }); }}>
                    Dar baixa
                  </button>
                ) : (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={historyBusy} onClick={() => void openHistory(row.imei)}>
                    Histórico
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
        {!visible.length ? (
          <tr>
            <td colSpan={13} className="empty">{loading ? 'Carregando IMEIs…' : 'Nenhum IMEI com esses filtros.'}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
  const footer = (
    <footer className="stock-report__totals">
      <span><strong>{totals.count}</strong> {totals.count === 1 ? 'aparelho' : 'aparelhos'}</span>
      <span>Custo total <strong>{money(totals.cost)}</strong></span>
      <span>Venda total <strong>{money(totals.price)}</strong></span>
      {totals.sold ? <span>Lucro nas vendas <strong>{money(totals.profit)}</strong></span> : null}
    </footer>
  );

  return (
    <section className="admin-page stock-report">
      <article className="admin-card stock-report__filters">
        <div className="stock-report__filters-head">
          <div>
            <h2>Estoque por IMEI</h2>
            <p className="empty">Cada aparelho com modelo, custo, venda, entrada e saída. Clique no IMEI para ver o histórico. Vendido sai do estoque sozinho; bonificação, uso interno e perda pelo botão “Dar baixa”.</p>
          </div>
          <button type="button" className="btn btn--primary" disabled={loading || !visible.length} onClick={print}>
            Imprimir
          </button>
        </div>
        {error ? <p role="alert" className="qty-low">{error}</p> : null}
        {notice ? <p className="imei-report__notice">{notice}</p> : null}
        <div className="admin-form stock-report__grid">
          <label>
            Buscar
            <input value={query} placeholder="IMEI, modelo, cor, fornecedor, cliente…" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <AdminPicker label="Situação" value={status} options={STATUS_OPTIONS} onChange={(value) => setStatus(value as StatusFilter)} />
          <AdminPicker
            label="Origem"
            value={origin}
            options={[
              { value: '', label: 'Todas' },
              { value: 'company', label: 'Empresa (fornecedor)' },
              { value: 'upgrade', label: 'Upgrade' },
              { value: 'trade_in', label: 'Troca de cliente' },
            ]}
            onChange={setOrigin}
          />
          <AdminPicker label="Ordenar por" value={sort} options={SORT_OPTIONS} onChange={(value) => setSort(value as SortKey)} />
          <label>
            Entrada de
            <input type="date" value={entryFrom} onChange={(e) => setEntryFrom(e.target.value)} />
          </label>
          <label>
            Entrada até
            <input type="date" value={entryTo} onChange={(e) => setEntryTo(e.target.value)} />
          </label>
          <label>
            Saída de
            <input type="date" value={exitFrom} onChange={(e) => setExitFrom(e.target.value)} />
          </label>
          <label>
            Saída até
            <input type="date" value={exitTo} onChange={(e) => setExitTo(e.target.value)} />
          </label>
        </div>
      </article>

      <article className="admin-card stock-report__preview">
        <div className="stock-report__sheet">{table(false)}{footer}</div>
      </article>

      {history ? (
        <QuickModal title={`Histórico do IMEI ${history.imei}`} subtitle={history.productName || 'IMEI fora das entradas de estoque'} submitLabel="Fechar" error={modalError} onClose={() => setHistory(null)} onSubmit={() => setHistory(null)}>
          <p>
            Situação atual:{' '}
            <span className={`stock-report__status ${history.status === 'in_stock' ? 'is-stock' : 'is-sold'}`}>
              {history.status === 'unknown' ? 'Não encontrado' : IMEI_STATUS_LABEL[history.status]}
            </span>
          </p>
          <ol className="imei-history">
            {history.events.map((event, index) => (
              <li key={index} className={`imei-history__item is-${event.type}`}>
                <div>
                  <strong>{event.label}</strong>
                  <small>{event.at.length > 10 ? dateTimeBr(event.at) : dateBr(event.at)}</small>
                </div>
                {event.detail ? <p>{event.detail}</p> : null}
                {event.canRevert && event.outputId ? (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void revert(event.outputId!)}>
                    Estornar baixa
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </QuickModal>
      ) : null}

      {writeOff ? (
        <QuickModal
          title={`Dar baixa no IMEI ${writeOff.row.imei}`}
          subtitle={`${modelOf(writeOff.row)} · ${writeOff.row.productName}. O aparelho sai do estoque e fica no histórico.`}
          submitLabel="Dar baixa"
          busy={busy}
          error={modalError}
          onClose={() => setWriteOff(null)}
          onSubmit={confirmWriteOff}
        >
          <AdminPicker label="Motivo" value={writeOff.kind} options={WRITE_OFF_OPTIONS} onChange={(value) => setWriteOff({ ...writeOff, kind: value as ImeiWriteOffKind })} />
          <label className="admin-field">
            Observação
            <textarea rows={2} maxLength={500} value={writeOff.notes} placeholder="Ex.: brinde para o cliente João, aparelho da vitrine…" onChange={(e) => setWriteOff({ ...writeOff, notes: e.target.value })} />
          </label>
        </QuickModal>
      ) : null}

      {createPortal(
        <div className="stock-report-print">
          <div className="stock-report__sheet">
            <header className="stock-report__sheet-head">
              <div>
                <strong>Estoque por IMEI</strong>
                <span>{store?.tradeName || store?.name || ''}</span>
              </div>
              <div className="stock-report__sheet-meta">
                <span>Emitido em {new Date().toLocaleString('pt-BR')}</span>
                <span>{STATUS_OPTIONS.find((o) => o.value === status)?.label}</span>
              </div>
            </header>
            {table(true)}
            {footer}
          </div>
        </div>,
        document.body,
      )}
    </section>
  );
}
