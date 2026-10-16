import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminPicker } from './AdminPicker';
import { listCashSessions } from '../data/cashRegisterStore';
import { listSellers } from '../data/erpRegistry';
import { apiSearchSales, type ApiSaleSearchItem } from '../services/erpApi';
import './salesLookup.css';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
/** datetime-local (hora do caixa) → ISO com fuso, para a busca no servidor. */
const toIso = (local: string) => (local && !Number.isNaN(new Date(local).getTime()) ? new Date(local).toISOString() : undefined);

export type SaleHit = ApiSaleSearchItem;

/**
 * Consulta de vendas no banco, igual no PDV e no painel: busca livre, IMEI enquanto digita, cliente,
 * vendedor, período, caixa e situação. A venda externa tem caixa próprio e só aparece para quem tem a
 * permissão (o servidor decide). As ações da venda selecionada vêm de quem usa o componente.
 */
export function SalesLookup({
  autoFocus,
  refreshKey = 0,
  renderActions,
  onSelect,
}: {
  autoFocus?: boolean;
  /** Mude o valor para buscar de novo (ex.: depois de cancelar uma venda). */
  refreshKey?: number;
  renderActions: (sale: SaleHit) => ReactNode;
  onSelect?: (sale: SaleHit | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [imei, setImei] = useState('');
  const [customer, setCustomer] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [session, setSession] = useState('');
  const [status, setStatus] = useState<'all' | 'sold' | 'cancelled'>('all');
  const [hits, setHits] = useState<SaleHit[]>([]);
  const [canSeeExternal, setCanSeeExternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SaleHit | null>(null);
  const sellers = useMemo(() => listSellers(true), []);
  const sessions = useMemo(() => listCashSessions(), [refreshKey]);

  // Busca no banco a cada filtro (espera a pessoa parar de digitar).
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void apiSearchSales({ q: query.trim(), imei: imei.replace(/\D/g, ''), customer: customer.trim(), sellerId, from: toIso(from), to: toIso(to), session, status, limit: 80 })
        .then((data) => {
          if (!alive) return;
          setHits(data.items);
          setCanSeeExternal(data.canSeeExternal);
          setError('');
          setSelected((current) => (current ? data.items.find((item) => item.id === current.id) ?? null : null));
        })
        .catch((err) => alive && setError(err instanceof Error ? err.message : 'Não foi possível consultar as vendas.'))
        .finally(() => alive && setLoading(false));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, imei, customer, sellerId, from, to, session, status, refreshKey]);

  function pick(sale: SaleHit | null) {
    setSelected(sale);
    onSelect?.(sale);
  }

  const imeiDigits = imei.replace(/\D/g, '');
  const total = hits.filter((item) => item.status === 'sold').reduce((sum, item) => sum + item.amount, 0);
  const sessionLabel = (sale: SaleHit) => (sale.type === 'external' ? 'Caixa da venda externa' : sale.sessionId || 'Sem caixa');

  return (
    <div className="sales-lookup">
      <div className="caixa-panel__filters sales-lookup__filters">
        <label className="sales-lookup__wide">
          Buscar
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pedido, produto, pagamento…" autoFocus={autoFocus} />
        </label>
        <label>
          IMEI
          <input value={imei} inputMode="numeric" onChange={(e) => setImei(e.target.value.replace(/[^\d]/g, '').slice(0, 17))} placeholder="Digite parte do IMEI" />
        </label>
        <label>
          Cliente
          <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Nome, telefone ou CPF" />
        </label>
        <AdminPicker
          label="Vendedor"
          value={sellerId}
          options={[{ value: '', label: 'Todos os vendedores' }, ...sellers.map((seller) => ({ value: seller.id, label: seller.name }))]}
          onChange={setSellerId}
        />
        <label>
          De
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <AdminPicker
          label="Caixa"
          value={session}
          options={[
            { value: '', label: canSeeExternal ? 'Todos os caixas' : 'Todos os caixas do PDV' },
            ...(canSeeExternal ? [{ value: 'external', label: 'Caixa da venda externa' }] : []),
            ...sessions.map((item) => ({ value: item.id, label: `${item.id} · ${item.status === 'open' ? 'Aberto' : 'Fechado'} · ${when(item.openedAt)}` })),
          ]}
          onChange={setSession}
        />
        <AdminPicker
          label="Situação"
          value={status}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'sold', label: 'Concluídas' },
            { value: 'cancelled', label: 'Canceladas' },
          ]}
          onChange={(value) => setStatus(value as typeof status)}
        />
      </div>

      <p className="sales-lookup__count" role="status">
        {loading ? 'Buscando…' : `${hits.length} ${hits.length === 1 ? 'venda' : 'vendas'} · concluídas ${money(total)}`}
        {error ? <span className="qty-low"> · {error}</span> : null}
      </p>

      <div className="caixa-sales-list" role="list">
        {!loading && hits.length === 0 ? <p className="empty caixa-sales-list__empty">Nenhuma venda com esses filtros.</p> : null}
        {hits.map((sale) => {
          const matched = imeiDigits.length >= 3 ? sale.imeis.find((value) => value.includes(imeiDigits)) : undefined;
          return (
            <button
              key={sale.id}
              type="button"
              role="listitem"
              className={`caixa-sales-card ${selected?.id === sale.id ? 'is-selected' : ''}`}
              onClick={() => pick(selected?.id === sale.id ? null : sale)}
            >
              <div className="caixa-sales-card__top">
                <strong>{sale.id}</strong>
                <span className="price-red">{money(sale.amount)}</span>
              </div>
              <div className="caixa-sales-card__meta">
                <span>{sale.customerName}</span>
                <span>{sale.sellerName || sessionLabel(sale)}</span>
              </div>
              <div className="caixa-sales-card__foot">
                <em>{sale.items}</em>
                <span>
                  {sale.status === 'cancelled' ? 'Cancelada · ' : ''}
                  {sale.type === 'external' ? 'Venda externa · ' : ''}
                  {when(sale.createdAt)}
                </span>
              </div>
              {matched ? <small className="sales-lookup__imei">IMEI {matched}</small> : null}
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="caixa-panel__detail">
          <div className="caixa-panel__summary">
            <div><span>Pedido</span><strong>{selected.id}</strong></div>
            <div><span>Cliente</span><strong>{selected.customerName}</strong></div>
            <div><span>Documento</span><strong>{selected.customerDocument || '—'}</strong></div>
            <div><span>Vendedor</span><strong>{selected.sellerName || '—'}</strong></div>
            <div><span>Pagamento</span><strong>{selected.payment || '—'}</strong></div>
            <div><span>Caixa</span><strong>{sessionLabel(selected)}</strong></div>
            <div><span>Quando</span><strong>{when(selected.createdAt)}</strong></div>
            <div><span>IMEI</span><strong>{selected.imeis.join(', ') || '—'}</strong></div>
            <div><span>Total</span><strong className="price-red">{money(selected.amount)}</strong></div>
            {selected.status === 'cancelled' ? (
              <div className="sales-lookup__cancelled"><span>Cancelada</span><strong>{selected.cancelReason || '—'}</strong></div>
            ) : null}
          </div>
          {renderActions(selected)}
        </div>
      ) : null}
    </div>
  );
}
