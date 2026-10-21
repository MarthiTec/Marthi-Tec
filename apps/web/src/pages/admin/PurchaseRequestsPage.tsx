import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions } from '../../components/CrudKit';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';
import {
  PURCHASE_STATUS,
  apiDeletePurchaseRequest,
  apiDuplicatePurchaseRequest,
  apiListPurchaseRequests,
  apiUpdatePurchaseRequest,
  type PurchaseRequest,
  type PurchaseStatus,
} from '../../services/purchaseRequestsApi';
import './purchaseRequests.css';

const OPEN = 'open,in_progress';
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const statusOf = (value: PurchaseStatus) => PURCHASE_STATUS.find((s) => s.value === value) ?? PURCHASE_STATUS[0];
const productLine = (row: PurchaseRequest) => {
  const device = [row.deviceType, row.deviceModel].filter(Boolean).join(' ');
  const opts = [row.capacity, row.color].filter(Boolean).join(' · ');
  const condition = row.conditionLabel || (row.condition === 'used' ? 'usado' : 'novo');
  const parts = [
    row.productName || device || row.desiredOptions || 'Produto sob consulta',
    opts || row.variantLabel,
    condition ? `condição ${condition}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
};
const deviceMeta = (row: PurchaseRequest) =>
  [
    row.brand ? `Marca: ${row.brand}` : '',
    row.deviceType ? `Tipo: ${row.deviceType}` : '',
    row.deviceModel ? `Modelo: ${row.deviceModel}` : '',
    row.color ? `Cor: ${row.color}` : '',
    row.capacity ? `Capacidade: ${row.capacity}` : '',
    `Condição: ${row.conditionLabel || (row.condition === 'used' ? 'usado' : 'novo')}`,
  ]
    .filter(Boolean)
    .join(' · ');
const whatsapp = (phone: string, text: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}?text=${encodeURIComponent(text)}` : '';
};

/**
 * Solicitações de compras: pedidos do catálogo digital quando o produto/opção não está disponível.
 * Atendimento → entrada de estoque → venda (PDV) pelos fluxos já existentes.
 */
export function PurchaseRequestsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<PurchaseRequest[]>([]);
  const [filter, setFilter] = useState(OPEN);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draftNotes, setDraftNotes] = useState('');
  const [draftStatus, setDraftStatus] = useState<PurchaseStatus>('open');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiListPurchaseRequests({ q: query.trim() || undefined })
      .then((list) => {
        setRows(list);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Não foi possível carregar as solicitações.'))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const refresh = () => load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
    const poll = window.setInterval(() => !document.hidden && load(), 60_000);
    return () => {
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, refresh);
      window.clearInterval(poll);
    };
  }, [load]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of rows) map[row.status] = (map[row.status] ?? 0) + 1;
    return map;
  }, [rows]);

  const visible = useMemo(() => {
    const wanted = new Set(filter.split(',').filter(Boolean));
    return rows.filter((row) => !filter || wanted.has(row.status));
  }, [rows, filter]);

  const current = rows.find((row) => row.id === openId) ?? null;

  const replace = (updated: PurchaseRequest) => {
    setRows((list) => {
      const exists = list.some((item) => item.id === updated.id);
      return exists ? list.map((item) => (item.id === updated.id ? updated : item)) : [updated, ...list];
    });
  };

  function openDetail(row: PurchaseRequest, edit = false) {
    setOpenId(row.id);
    setEditMode(edit);
    setDraftNotes(row.notes);
    setDraftStatus(row.status === 'cancelled' ? 'open' : row.status);
  }

  async function saveEdit() {
    if (!current) return;
    setBusy(true);
    try {
      const updated = await apiUpdatePurchaseRequest(current.id, {
        status: draftStatus !== current.status ? draftStatus : undefined,
        notes: draftNotes,
        note: draftStatus !== current.status ? undefined : draftNotes !== current.notes ? 'Observação atualizada' : undefined,
      });
      replace(updated);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(row: PurchaseRequest, status: PurchaseStatus, cancelReason = '') {
    setBusy(true);
    try {
      const updated = await apiUpdatePurchaseRequest(row.id, { status, cancelReason });
      replace(updated);
      if (openId === row.id) {
        setDraftStatus(updated.status);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar a situação.');
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(row: PurchaseRequest) {
    setBusy(true);
    try {
      const created = await apiDuplicatePurchaseRequest(row.id);
      replace(created);
      openDetail(created, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível duplicar.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: PurchaseRequest) {
    const soft = row.status !== 'cancelled';
    if (!window.confirm(soft ? `Cancelar a solicitação ${row.protocol}?` : `Excluir definitivamente ${row.protocol}?`)) return;
    setBusy(true);
    try {
      const result = await apiDeletePurchaseRequest(row.id);
      if (result && 'id' in result) {
        replace(result);
      } else {
        setRows((list) => list.filter((item) => item.id !== row.id));
        if (openId === row.id) setOpenId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  }

  function goStockEntry(row: PurchaseRequest) {
    if (!row.productId) {
      setError('Vincule ou informe um produto do cadastro antes de abrir a entrada de estoque.');
      return;
    }
    navigate('/erp/produtos?aba=entradas', {
      state: {
        productId: row.productId,
        qty: row.qty,
        notes: `Solicitação ${row.protocol}${row.desiredOptions ? ` — ${row.desiredOptions}` : ''}${row.variantLabel ? ` · ${row.variantLabel}` : ''}`,
        purchaseRequestId: row.id,
        attrs: Object.fromEntries((row.attributes ?? []).filter((a) => a.value).map((a) => [a.id || a.name || 'attr', a.value])),
      },
    });
  }

  function goSale(row: PurchaseRequest) {
    if (!row.productId) {
      setError('Vincule um produto do cadastro antes de abrir a venda.');
      return;
    }
    navigate('/caixa', {
      state: {
        purchaseRequestId: row.id,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        lines: [{ stockId: row.productId, name: row.productName || productLine(row), qty: row.qty, price: 0 }],
      },
    });
  }

  const chips: Array<[string, string, number]> = [
    [OPEN, 'Em aberto', OPEN.split(',').reduce((sum, s) => sum + (counts[s] ?? 0), 0)],
    ...PURCHASE_STATUS.map((s) => [s.value, s.label, counts[s.value] ?? 0] as [string, string, number]),
    ['', 'Todas', rows.length],
  ];

  return (
    <section className="admin-page purchase-req">
      <header className="purchase-req__head">
        <p className="purchase-req__muted">
          Pedidos do catálogo digital quando o produto ou a opção desejada não está disponível. Atenda, lance a entrada de estoque e finalize a venda no PDV.
        </p>
      </header>

      <div className="purchase-req__chips" role="group" aria-label="Filtrar por situação">
        {chips.map(([value, label, count]) => (
          <button key={label} type="button" className={filter === value ? 'is-on' : ''} onClick={() => setFilter(value)}>
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>

      <div className="purchase-req__toolbar">
        <label className="admin-field">
          Buscar
          <input
            className="admin-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Protocolo, cliente, WhatsApp ou produto…"
            aria-label="Buscar solicitação de compra"
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="purchase-req__error">
          {error}
        </p>
      ) : null}

      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Protocolo</th>
              <th>Cliente</th>
              <th>Produto</th>
              <th>Situação</th>
              <th>Quando</th>
              <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              <tr>
                <td colSpan={6} className="purchase-req__muted">
                  Carregando…
                </td>
              </tr>
            ) : null}
            {!loading && !visible.length ? (
              <tr>
                <td colSpan={6} className="purchase-req__muted">
                  Nenhuma solicitação aqui.
                </td>
              </tr>
            ) : null}
            {visible.map((row) => {
              const status = statusOf(row.status);
              return (
                <tr key={row.id}>
                  <td>
                    <CrudNameButton onClick={() => openDetail(row)}>
                      <strong>{row.protocol}</strong>
                    </CrudNameButton>
                  </td>
                  <td>
                    <CrudNameButton onClick={() => openDetail(row)}>
                      <strong>{row.customerName}</strong>
                    </CrudNameButton>
                    <div className="purchase-req__muted">{row.customerPhone}</div>
                  </td>
                  <td>
                    {productLine(row)}
                    {row.qty > 1 ? ` · ${row.qty} un` : ''}
                  </td>
                  <td>
                    <span className="purchase-req__badge" style={{ ['--tone' as string]: status.tone }}>
                      {status.label}
                    </span>
                  </td>
                  <td>{when(row.createdAt)}</td>
                  <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                    <CrudRowActions
                      onView={() => openDetail(row)}
                      onEdit={() => openDetail(row, true)}
                      onDuplicate={() => void duplicate(row)}
                      onDelete={() => void remove(row)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {current ? (
        <div className="purchase-req__drawer" role="dialog" aria-modal="true" aria-label={`Solicitação ${current.protocol}`}>
          <div className="purchase-req__drawer-panel">
            <div className="purchase-req__drawer-head">
              <div>
                <h3>{current.protocol}</h3>
                <span className="purchase-req__badge" style={{ ['--tone' as string]: statusOf(current.status).tone }}>
                  {statusOf(current.status).label}
                </span>
              </div>
              <button type="button" className="btn" onClick={() => setOpenId(null)} aria-label="Fechar">
                Fechar
              </button>
            </div>

            <div className="purchase-req__detail">
              <div className="purchase-req__meta">
                <div>
                  <strong>{current.customerName}</strong> · {current.customerPhone}
                </div>
                <div>{productLine(current)}</div>
                {deviceMeta(current) ? <div>{deviceMeta(current)}</div> : null}
                {current.desiredOptions ? <div>Opções pedidas: {current.desiredOptions}</div> : null}
                {current.notes ? <div>Obs.: {current.notes}</div> : null}
                {current.handledBy ? <div>Atendente: {current.handledBy}</div> : null}
                {current.cancelReason ? <div>Cancelamento: {current.cancelReason}</div> : null}
              </div>

              {editMode ? (
                <>
                  <AdminPicker
                    label="Situação"
                    value={draftStatus}
                    options={PURCHASE_STATUS.filter((s) => s.value !== 'cancelled' || current.status === 'cancelled').map((s) => ({
                      value: s.value,
                      label: s.label,
                    }))}
                    onChange={(val) => setDraftStatus(val as PurchaseStatus)}
                  />
                  <label className="admin-field">
                    Observações internas
                    <textarea className="admin-input" rows={3} value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />
                  </label>
                  <div className="purchase-req__actions">
                    <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void saveEdit()}>
                      Salvar
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => setEditMode(false)}>
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <div className="purchase-req__actions">
                  {current.status === 'open' ? (
                    <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void setStatus(current, 'in_progress')}>
                      Iniciar atendimento
                    </button>
                  ) : null}
                  {current.status === 'in_progress' ? (
                    <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void setStatus(current, 'fulfilled')}>
                      Marcar como atendida
                    </button>
                  ) : null}
                  {current.status === 'open' || current.status === 'in_progress' ? (
                    <button type="button" className="btn" disabled={busy} onClick={() => void setStatus(current, 'cancelled', 'Cancelada pela loja')}>
                      Cancelar solicitação
                    </button>
                  ) : null}
                  {current.status === 'cancelled' ? (
                    <button type="button" className="btn" disabled={busy} onClick={() => void setStatus(current, 'open')}>
                      Reabrir
                    </button>
                  ) : null}
                  {(current.status === 'in_progress' || current.status === 'fulfilled') && current.productId ? (
                    <>
                      <button type="button" className="btn btn--primary" onClick={() => goStockEntry(current)}>
                        Entrada de estoque
                      </button>
                      <button type="button" className="btn" onClick={() => goSale(current)}>
                        Abrir venda (PDV)
                      </button>
                    </>
                  ) : null}
                  {whatsapp(current.customerPhone, `Olá ${current.customerName.split(' ')[0] || ''}! Sobre sua solicitação ${current.protocol} (${productLine(current)})…`) ? (
                    <a
                      className="btn"
                      href={whatsapp(current.customerPhone, `Olá ${current.customerName.split(' ')[0] || ''}! Sobre sua solicitação ${current.protocol} (${productLine(current)})…`)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                  <button type="button" className="btn" onClick={() => setEditMode(true)}>
                    Editar
                  </button>
                </div>
              )}

              {current.history?.length ? (
                <div>
                  <h3>Histórico</h3>
                  <ul className="purchase-req__history">
                    {[...current.history].reverse().map((entry, index) => (
                      <li key={`${entry.at}-${index}`}>
                        {when(entry.at)} · {entry.by || '—'} · {entry.note || entry.action || '—'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
