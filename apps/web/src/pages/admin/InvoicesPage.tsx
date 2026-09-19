import { useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminState } from '../../data/adminStore';
import { logAction } from '../../data/auditLog';
import { listSuppliers } from '../../data/erpRegistry';
import {
  addInvoiceLine,
  cancelInvoice,
  createInvoice,
  INVOICE_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  invoiceTotal,
  listInvoices,
  postInvoice,
  removeInvoiceLine,
  updateInvoiceDraft,
  type Invoice,
  type InvoiceKind,
} from '../../data/invoiceStore';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function InvoicesPage() {
  const { user } = useAuth();
  const [kindFilter, setKindFilter] = useState<'all' | InvoiceKind>('all');
  const [invoices, setInvoices] = useState(() => listInvoices());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stockId, setStockId] = useState('');
  const [qty, setQty] = useState(1);
  const suppliers = useMemo(() => listSuppliers(true), []);
  const stock = useMemo(() => getAdminState().stock, [invoices]);

  const filtered = useMemo(() => {
    if (kindFilter === 'all') return invoices;
    return invoices.filter((item) => item.kind === kindFilter);
  }, [invoices, kindFilter]);

  const selected = selectedId ? invoices.find((item) => item.id === selectedId) ?? null : null;

  function refresh(nextId?: string) {
    const next = listInvoices();
    setInvoices(next);
    if (nextId) setSelectedId(nextId);
  }

  function flash(ok: string) {
    setMessage(ok);
    setError('');
  }

  function fail(err: string) {
    setError(err);
    setMessage('');
  }

  function create(kind: InvoiceKind) {
    const result = createInvoice({
      kind,
      supplierId: kind === 'entry' ? suppliers[0]?.id : '',
      customerName: kind === 'exit' ? '' : '',
    });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'nota.criar',
      detail: `${INVOICE_KIND_LABEL[kind]} ${result.invoice.id}`,
    });
    refresh(result.invoice.id);
    flash('Rascunho criado.');
  }

  function saveDraft(patch: Partial<Invoice>) {
    if (!selected) return;
    const result = updateInvoiceDraft(selected.id, patch);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    refresh(selected.id);
  }

  function addLine() {
    if (!selected || !stockId) {
      fail('Selecione um item do estoque.');
      return;
    }
    const result = addInvoiceLine(selected.id, { stockId, qty });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setStockId('');
    setQty(1);
    refresh(selected.id);
    flash('Item adicionado.');
  }

  function post() {
    if (!selected) return;
    const result = postInvoice(selected.id);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'nota.lancar',
      detail: `${result.invoice.id} · ${money(invoiceTotal(result.invoice))}`,
    });
    refresh(selected.id);
    flash(
      result.invoice.kind === 'entry'
        ? 'Entrada lançada · estoque atualizado.'
        : 'Saída lançada · estoque baixado.',
    );
  }

  function cancel() {
    if (!selected) return;
    const result = cancelInvoice(selected.id);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'nota.cancelar',
      detail: result.invoice.id,
    });
    refresh(selected.id);
    flash('Nota cancelada.');
  }

  return (
    <section className="admin-page">
      <div className="admin-toolbar">
        <AdminPicker
          label="Filtro"
          value={kindFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'entry', label: 'Entradas' },
            { value: 'exit', label: 'Saídas' },
          ]}
          onChange={(value) => setKindFilter(value as 'all' | InvoiceKind)}
        />
        <button type="button" className="btn btn--primary" onClick={() => create('entry')}>
          Nova entrada
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => create('exit')}>
          Nova saída
        </button>
      </div>

      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      <div className="erp-invoices">
        <article className="admin-card">
          <h2>Notas</h2>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    Nenhuma nota ainda.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={selectedId === item.id ? 'is-selected' : ''}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <td>{item.id}</td>
                    <td>{INVOICE_KIND_LABEL[item.kind]}</td>
                    <td>{INVOICE_STATUS_LABEL[item.status]}</td>
                    <td>{money(invoiceTotal(item))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </article>

        <article className="admin-card">
          {!selected ? (
            <>
              <h2>Detalhe</h2>
              <p className="empty">Selecione ou crie uma nota.</p>
            </>
          ) : (
            <>
              <h2>
                {INVOICE_KIND_LABEL[selected.kind]} · {selected.id}
              </h2>
              <p>
                Status: <strong>{INVOICE_STATUS_LABEL[selected.status]}</strong> · Total{' '}
                {money(invoiceTotal(selected))}
              </p>

              <div className="admin-form" style={{ marginTop: 12 }}>
                <label>
                  Número / documento
                  <input
                    value={selected.number}
                    disabled={selected.status !== 'draft'}
                    onChange={(e) => saveDraft({ number: e.target.value })}
                  />
                </label>
                <label>
                  Data
                  <input
                    type="date"
                    value={selected.issuedAt.slice(0, 10)}
                    disabled={selected.status !== 'draft'}
                    onChange={(e) => saveDraft({ issuedAt: e.target.value })}
                  />
                </label>
                {selected.kind === 'entry' ? (
                  <AdminPicker
                    className="span-2"
                    label="Fornecedor"
                    value={selected.supplierId}
                    disabled={selected.status !== 'draft'}
                    options={suppliers.map((item) => ({
                      value: item.id,
                      label: item.name,
                    }))}
                    onChange={(value) => saveDraft({ supplierId: value })}
                  />
                ) : (
                  <label className="span-2">
                    Cliente / destino
                    <input
                      value={selected.customerName}
                      disabled={selected.status !== 'draft'}
                      onChange={(e) => saveDraft({ customerName: e.target.value })}
                    />
                  </label>
                )}
                <label className="span-2">
                  Observações
                  <textarea
                    value={selected.notes}
                    disabled={selected.status !== 'draft'}
                    onChange={(e) => saveDraft({ notes: e.target.value })}
                  />
                </label>
              </div>

              {selected.status === 'draft' ? (
                <div className="admin-toolbar" style={{ marginTop: 12 }}>
                  <AdminPicker
                    label="Item do estoque"
                    value={stockId}
                    placeholder="Selecionar…"
                    options={stock.map((item) => ({
                      value: item.id,
                      label: `${item.name} · qtd ${item.qty}`,
                    }))}
                    onChange={setStockId}
                  />
                  <label>
                    Qtd
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value) || 1)}
                    />
                  </label>
                  <button type="button" className="btn btn--ghost" onClick={addLine}>
                    Incluir item
                  </button>
                </div>
              ) : null}

              <table className="admin-table" style={{ marginTop: 12 }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qtd</th>
                    <th>{selected.kind === 'entry' ? 'Custo' : 'Preço'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty">
                        Sem itens.
                      </td>
                    </tr>
                  ) : (
                    selected.lines.map((line) => (
                      <tr key={line.id}>
                        <td>{line.name}</td>
                        <td>{line.qty}</td>
                        <td>
                          {money(
                            (selected.kind === 'entry' ? line.unitCost : line.unitPrice) *
                              line.qty,
                          )}
                        </td>
                        <td>
                          {selected.status === 'draft' ? (
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() => {
                                const result = removeInvoiceLine(selected.id, line.id);
                                if (!result.ok) fail(result.error);
                                else refresh(selected.id);
                              }}
                            >
                              Remover
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="admin-toolbar" style={{ marginTop: 12 }}>
                {selected.status === 'draft' ? (
                  <button type="button" className="btn btn--primary" onClick={post}>
                    Lançar nota
                  </button>
                ) : null}
                {selected.status !== 'cancelled' ? (
                  <button type="button" className="btn btn--ghost" onClick={cancel}>
                    Cancelar
                  </button>
                ) : null}
              </div>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
