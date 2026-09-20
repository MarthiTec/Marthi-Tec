import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminState } from '../../data/adminStore';
import { logAction } from '../../data/auditLog';
import { getSupplier, listSuppliers } from '../../data/erpRegistry';
import {
  cancelNfeDocument,
  consultNfeStatus,
  FISCAL_KIND_LABEL,
  FISCAL_STATUS_LABEL,
  getFiscalDocumentForRef,
  openDanfePreview,
  transmitNfeForInvoice,
  type FiscalDocument,
} from '../../data/fiscalDocuments';
import {
  getFiscalIssuerSettings,
  issuerIsReadyForNfe,
  SEFAZ_ENV_LABEL,
} from '../../data/fiscalIssuerStore';
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
import {
  NFE_DOC_PURPOSE_HINT,
  NFE_DOC_PURPOSE_LABEL,
  type FiscalDocPurpose,
} from '../../data/fiscalTaxTables';
import { hasModule } from '../../data/storePlan';

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function InvoicesPage() {
  const { user } = useAuth();
  const fiscalOn = hasModule('fiscal');
  const [kindFilter, setKindFilter] = useState<'all' | InvoiceKind>('all');
  const [invoices, setInvoices] = useState(() => listInvoices());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [stockId, setStockId] = useState('');
  const [qty, setQty] = useState(1);
  const [fiscalTick, setFiscalTick] = useState(0);
  const [cancelReason, setCancelReason] = useState('Cancelamento solicitado pelo emitente');
  const suppliers = useMemo(() => listSuppliers(true), []);
  const stock = useMemo(() => getAdminState().stock, [invoices]);
  const issuer = useMemo(() => getFiscalIssuerSettings(), [fiscalTick, message]);

  const filtered = useMemo(() => {
    if (kindFilter === 'all') return invoices;
    return invoices.filter((item) => item.kind === kindFilter);
  }, [invoices, kindFilter]);

  const selected = selectedId ? invoices.find((item) => item.id === selectedId) ?? null : null;
  const fiscalDoc = useMemo(
    () => (selected ? getFiscalDocumentForRef('invoice', selected.id) : null),
    [selected, fiscalTick],
  );

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

  function partyName(invoice: Invoice) {
    if (invoice.kind === 'entry') {
      return getSupplier(invoice.supplierId)?.name || 'Fornecedor';
    }
    return invoice.customerName || 'Destinatário';
  }

  function transmit(asNfce = false) {
    if (!selected) return;
    if (selected.status !== 'posted') {
      fail('Lance a nota no estoque antes de transmitir a NF-e.');
      return;
    }
    if (!issuerIsReadyForNfe(issuer)) {
      fail('Configure certificado, senha e emitente em Configuração fiscal.');
      return;
    }
    const result = transmitNfeForInvoice({
      invoiceId: selected.id,
      kind: selected.kind,
      customerName: partyName(selected),
      amount: invoiceTotal(selected),
      asNfce: asNfce && selected.kind === 'exit',
      documentPurpose: selected.documentPurpose ?? 'normal',
      items: selected.lines.map((line) => ({
        name: line.name,
        qty: line.qty,
        unitPrice: selected.kind === 'entry' ? line.unitCost : line.unitPrice,
      })),
    });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setFiscalTick((value) => value + 1);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'nota.transmitir_nfe',
      detail: `${result.document.kind} ${result.document.number} · ${result.document.accessKey}`,
    });
    flash(
      `${FISCAL_KIND_LABEL[result.document.kind]} ${result.document.number} transmitida (${SEFAZ_ENV_LABEL[result.document.nfe?.environment ?? issuer.environment]}) · protocolo ${result.document.nfe?.protocol}`,
    );
  }

  function consult(doc: FiscalDocument) {
    const result = consultNfeStatus(doc.id);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setFiscalTick((value) => value + 1);
    flash(
      `Consulta SEFAZ: ${result.document.nfe?.statusCode} — ${result.document.nfe?.statusMessage}`,
    );
  }

  function cancelFiscal(doc: FiscalDocument) {
    const result = cancelNfeDocument(doc.id, cancelReason);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setFiscalTick((value) => value + 1);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'nota.cancelar_nfe',
      detail: `${result.document.number} · ${cancelReason}`,
    });
    flash(`${FISCAL_KIND_LABEL[result.document.kind]} cancelada na SEFAZ.`);
  }

  function danfe(doc: FiscalDocument, print: boolean) {
    const result = openDanfePreview(doc, print);
    if (!result.ok) fail(result.error);
  }

  function danfeFromNote(print: boolean) {
    if (!selected) return;
    if (fiscalDoc) {
      danfe(fiscalDoc, print);
      return;
    }
    if (selected.lines.length === 0) {
      fail('Inclua itens para visualizar a DANFE.');
      return;
    }
    const draftDoc: FiscalDocument = {
      id: `DRAFT-${selected.id}`,
      kind: 'nfe',
      status: 'pending',
      refType: 'invoice',
      refId: selected.id,
      customerName: partyName(selected),
      amount: invoiceTotal(selected),
      number: selected.number || '—',
      series: issuer.nfeSeries || '1',
      accessKey: 'PREVIEW-SEM-TRANSMISSAO',
      provider: 'sefaz_mock',
      createdAt: new Date().toISOString(),
      message: `Pré-visualização DANFE · ${NFE_DOC_PURPOSE_LABEL[selected.documentPurpose ?? 'normal']} · ainda não transmitida`,
      items: selected.lines.map((line) => ({
        name: line.name,
        qty: line.qty,
        unitPrice: selected.kind === 'entry' ? line.unitCost : line.unitPrice,
      })),
      nfe: {
        environment: issuer.environment,
        protocol: '—',
        receiptNumber: '—',
        statusCode: '—',
        statusMessage: 'Pré-visualização',
        xmlDigest: '',
        documentPurpose: selected.documentPurpose ?? 'normal',
      },
    };
    danfe(draftDoc, print);
  }

  return (
    <section className="admin-page">
      <div className="admin-toolbar">
        <AdminPicker
          compact
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
        {fiscalOn ? (
          <>
            <Link to="/fiscal/config" className="btn btn--ghost">
              Configuração fiscal
            </Link>
            <Link to="/fiscal/cst" className="btn btn--ghost">
              CST / cClassTrib
            </Link>
          </>
        ) : null}
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
                <th>Fiscal</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    Nenhuma nota ainda.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const doc = getFiscalDocumentForRef('invoice', item.id);
                  return (
                    <tr
                      key={item.id}
                      className={selectedId === item.id ? 'is-selected' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <td>{item.id}</td>
                      <td>{INVOICE_KIND_LABEL[item.kind]}</td>
                      <td>{INVOICE_STATUS_LABEL[item.status]}</td>
                      <td>
                        {doc
                          ? `${FISCAL_KIND_LABEL[doc.kind]} · ${FISCAL_STATUS_LABEL[doc.status]}`
                          : '—'}
                      </td>
                      <td>{money(invoiceTotal(item))}</td>
                    </tr>
                  );
                })
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
              <p className="fiscal-note-meta">
                Status: <span>{INVOICE_STATUS_LABEL[selected.status]}</span>
                {' · '}
                Total {money(invoiceTotal(selected))}
                {fiscalOn ? (
                  <>
                    {' · '}
                    Ambiente SEFAZ: <span>{SEFAZ_ENV_LABEL[issuer.environment]}</span>
                  </>
                ) : null}
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
                <AdminPicker
                  className="span-2"
                  label="Tipo de documento (NF-e)"
                  value={selected.documentPurpose ?? 'normal'}
                  disabled={selected.status !== 'draft'}
                  options={(Object.keys(NFE_DOC_PURPOSE_LABEL) as FiscalDocPurpose[]).map((key) => ({
                    value: key,
                    label: NFE_DOC_PURPOSE_LABEL[key],
                  }))}
                  onChange={(value) =>
                    saveDraft({ documentPurpose: value as FiscalDocPurpose })
                  }
                />
                <p className="span-2 empty" style={{ margin: 0 }}>
                  {NFE_DOC_PURPOSE_HINT[selected.documentPurpose ?? 'normal']}
                </p>
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
                <div className="erp-invoice-lines">
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
                  <label className="erp-invoice-qty">
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
                    Cancelar lançamento
                  </button>
                ) : null}
                {fiscalOn ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => danfeFromNote(false)}
                    >
                      Visualizar DANFE
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => danfeFromNote(true)}
                    >
                      Imprimir DANFE
                    </button>
                  </>
                ) : null}
              </div>

              {fiscalOn ? (
                <div className="os-nfse-result" style={{ marginTop: 18 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>NF-e / transmissão SEFAZ</h3>
                  <p className="empty" style={{ marginTop: 0 }}>
                    Transmitir gera o XML, envia e consulta o recibo. Configure certificado e ambiente em{' '}
                    <Link to="/fiscal/config">Configuração fiscal</Link>.
                  </p>

                  {fiscalDoc ? (
                    <>
                      <p>
                        <strong>
                          {FISCAL_KIND_LABEL[fiscalDoc.kind]} {fiscalDoc.number}/{fiscalDoc.series}
                        </strong>{' '}
                        · {FISCAL_STATUS_LABEL[fiscalDoc.status]}
                      </p>
                      <pre className="os-nfse-pre">
                        {[
                          `Ambiente: ${SEFAZ_ENV_LABEL[fiscalDoc.nfe?.environment ?? issuer.environment]}`,
                          `Chave: ${fiscalDoc.accessKey}`,
                          `Protocolo: ${fiscalDoc.nfe?.protocol ?? '—'}`,
                          `Recibo: ${fiscalDoc.nfe?.receiptNumber ?? '—'}`,
                          `Consulta: ${fiscalDoc.nfe?.statusCode ?? '—'} — ${fiscalDoc.nfe?.statusMessage ?? '—'}`,
                          fiscalDoc.nfe?.consultedAt
                            ? `Consultado em: ${new Date(fiscalDoc.nfe.consultedAt).toLocaleString('pt-BR')}`
                            : '',
                          fiscalDoc.message,
                        ]
                          .filter(Boolean)
                          .join('\n')}
                      </pre>
                      <div className="admin-toolbar" style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => consult(fiscalDoc)}
                        >
                          Consultar status
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => danfe(fiscalDoc, false)}
                        >
                          Visualizar DANFE
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => danfe(fiscalDoc, true)}
                        >
                          Imprimir DANFE
                        </button>
                      </div>
                      {fiscalDoc.status === 'authorized' ? (
                        <div className="admin-form" style={{ marginTop: 12 }}>
                          <label className="span-2">
                            Justificativa do cancelamento (mín. 15 caracteres)
                            <input
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                            />
                          </label>
                          <div className="span-2 admin-toolbar">
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() => cancelFiscal(fiscalDoc)}
                            >
                              Cancelar NF-e
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="admin-toolbar" style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn btn--primary"
                        disabled={selected.status !== 'posted'}
                        onClick={() => transmit(false)}
                      >
                        Transmitir NF-e
                      </button>
                      {!issuerIsReadyForNfe(issuer) ? (
                        <Link to="/fiscal/config" className="btn btn--ghost">
                          Cadastrar certificado
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </article>
      </div>
    </section>
  );
}
