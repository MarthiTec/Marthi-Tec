import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiCancelSale, apiGetSaleReceipt, apiListExternalSales, type ApiExternalSaleSummary } from '../services/erpApi';
import { QuickModal } from './QuickModal';
import { WarrantyReceiptModal } from './WarrantyReceiptModal';
import './quickModal.css';

const PERIODS = [
  { id: 'today', label: 'Hoje', days: 0 },
  { id: '7', label: '7 dias', days: 7 },
  { id: '30', label: '30 dias', days: 30 },
  { id: '90', label: '90 dias', days: 90 },
] as const;

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Início do período no fuso do navegador (o "hoje" da loja). */
function periodStart(days: number) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  return start.toISOString();
}

/**
 * Vendas externas já feitas: buscar por cliente, telefone, documento ou número da venda,
 * reimprimir / reenviar o comprovante e cancelar (o servidor confere a permissão).
 */
export function ExternalSalesHistory({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('7');
  const [status, setStatus] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ApiExternalSaleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<unknown>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<ApiExternalSaleSummary | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const days = PERIODS.find((item) => item.id === period)?.days ?? 7;
      setRows(await apiListExternalSales({ from: periodStart(days), to: new Date(Date.now() + 60000).toISOString(), search: query, status }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as vendas.');
    } finally {
      setLoading(false);
    }
  }, [period, query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !receipt && !cancelling && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, receipt, cancelling]);

  async function openReceipt(id: string) {
    setOpening(id);
    setError('');
    try {
      setReceipt(await apiGetSaleReceipt(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o comprovante.');
    } finally {
      setOpening(null);
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    if (cancelReason.trim().length < 3) return setCancelError('Informe o motivo do cancelamento.');
    setCancelBusy(true);
    setCancelError('');
    try {
      await apiCancelSale(cancelling.id, cancelReason.trim());
      setCancelling(null);
      setCancelReason('');
      await load();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Não foi possível cancelar a venda.');
    } finally {
      setCancelBusy(false);
    }
  }

  const total = rows.filter((row) => row.status !== 'cancelled').reduce((sum, row) => sum + row.amount, 0);

  return createPortal(
    <div className="quick-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="quick-modal__card sales-history" role="dialog" aria-modal="true" aria-label="Vendas externas realizadas">
        <header className="quick-modal__head">
          <div>
            <h2>Vendas realizadas</h2>
            <p>Consulte, reimprima ou reenvie o comprovante e cancele vendas externas.</p>
          </div>
          <button type="button" className="quick-modal__close" aria-label="Fechar" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="sales-history__filters">
          <input
            type="search"
            value={search}
            placeholder="Buscar cliente, telefone, CPF ou nº da venda"
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="sales-history__chips" role="group" aria-label="Período">
            {PERIODS.map((item) => (
              <button key={item.id} type="button" className={period === item.id ? 'is-active' : ''} onClick={() => setPeriod(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="sales-history__chips" role="group" aria-label="Situação">
            {([
              ['all', 'Todas'],
              ['completed', 'Concluídas'],
              ['cancelled', 'Canceladas'],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" className={status === id ? 'is-active' : ''} onClick={() => setStatus(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {error ? (
          <p className="quick-modal__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="sales-history__list">
          {loading ? <p className="sales-history__empty">Carregando vendas…</p> : null}
          {!loading && rows.length === 0 ? <p className="sales-history__empty">Nenhuma venda encontrada nesse período.</p> : null}
          {!loading &&
            rows.map((row) => (
              <article key={row.id} className={`sales-history__row${row.status === 'cancelled' ? ' is-cancelled' : ''}`}>
                <div className="sales-history__main">
                  <strong>{row.customerName}</strong>
                  <small>
                    {when(row.createdAt)} · {row.id}
                    {row.sellerName ? ` · ${row.sellerName}` : ''}
                  </small>
                  {row.items ? <span>{row.items}</span> : null}
                  {row.status === 'cancelled' ? <em>Cancelada{row.cancelReason ? `: ${row.cancelReason}` : ''}</em> : null}
                </div>
                <div className="sales-history__side">
                  <strong>{money(row.amount)}</strong>
                  <small>{row.payment}</small>
                  <div className="sales-history__actions">
                    <button type="button" className="btn btn--ghost btn--sm" disabled={opening === row.id} onClick={() => void openReceipt(row.id)}>
                      {opening === row.id ? 'Abrindo…' : '🖨 Comprovante'}
                    </button>
                    {row.status !== 'cancelled' ? (
                      <button type="button" className="btn btn--danger btn--sm" onClick={() => { setCancelling(row); setCancelReason(''); setCancelError(''); }}>
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
        </div>
        <footer className="sales-history__foot">
          <span>
            {rows.length} {rows.length === 1 ? 'venda' : 'vendas'} · Total concluído <strong>{money(total)}</strong>
          </span>
        </footer>
      </section>

      {receipt ? <WarrantyReceiptModal reprint receipt={receipt as never} onClose={() => setReceipt(null)} onNewSale={() => setReceipt(null)} /> : null}

      {cancelling ? (
        <QuickModal
          title="Cancelar venda"
          subtitle={`${cancelling.customerName} · ${money(cancelling.amount)} · ${cancelling.id}`}
          submitLabel="Cancelar venda"
          busy={cancelBusy}
          error={cancelError}
          onClose={() => setCancelling(null)}
          onSubmit={confirmCancel}
        >
          <label>
            Motivo do cancelamento *
            <textarea rows={3} value={cancelReason} maxLength={300} onChange={(event) => setCancelReason(event.target.value)} />
            <small>O estoque e o financeiro da venda são estornados. Só administradores e gerentes podem cancelar.</small>
          </label>
        </QuickModal>
      ) : null}
    </div>,
    document.querySelector('.admin') ?? document.body,
  );
}
