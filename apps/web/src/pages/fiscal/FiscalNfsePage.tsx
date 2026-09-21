import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  emitNfseFromOs,
  emitNfseStandalone,
  FISCAL_KIND_LABEL,
  FISCAL_STATUS_LABEL,
  listFiscalDocuments,
  NFSE_SERVICE_OPTIONS,
  openDanfePreview,
} from '../../data/fiscalDocuments';
import { issuerIsReadyForNfse } from '../../data/fiscalIssuerStore';
import { listWorkOrders, workOrderTotal } from '../../data/osStore';

export function FiscalNfsePage() {
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [osId, setOsId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [amount, setAmount] = useState('');
  const [serviceKey, setServiceKey] = useState<string>(NFSE_SERVICE_OPTIONS[0]?.itemLc116 ?? '14.01');
  const [desc, setDesc] = useState('Assistência técnica');

  const ready = issuerIsReadyForNfse();
  const orders = useMemo(
    () =>
      listWorkOrders()
        .filter((item) => item.status === 'ready' || item.status === 'delivered' || item.status === 'progress')
        .slice(0, 40),
    [tick],
  );
  const docs = useMemo(
    () => listFiscalDocuments().filter((item) => item.kind === 'nfse').slice(0, 20),
    [tick],
  );

  function emitFromOs() {
    setError('');
    setMessage('');
    const order = orders.find((item) => item.id === osId);
    if (!order) {
      setError('Selecione uma OS.');
      return;
    }
    const result = emitNfseFromOs({
      workOrderId: order.id,
      customerName: order.customerName,
      customerDocument: order.customerDocument,
      amount: workOrderTotal(order),
      serviceDescription:
        [order.defect, order.diagnosis, order.itemName].filter(Boolean).join(' · ') ||
        `Serviço OS ${order.id}`,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`${FISCAL_KIND_LABEL.nfse} ${result.document.number} autorizada (simulação Portal Nacional).`);
    setTick((value) => value + 1);
  }

  function emitStandalone(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    const value = Number(amount.replace(',', '.'));
    const service = NFSE_SERVICE_OPTIONS.find((item) => item.itemLc116 === serviceKey);
    const result = emitNfseStandalone({
      customerName: customerName.trim(),
      customerDocument: customerDocument.trim() || undefined,
      amount: value,
      itemLc116: service?.itemLc116 ?? '14.01',
      cTribNac: service?.cTribNac ?? '140101',
      xDescServ: desc.trim() || service?.label || 'Serviço',
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`${FISCAL_KIND_LABEL.nfse} ${result.document.number} emitida.`);
    setTick((value) => value + 1);
  }

  return (
    <section className="admin-page">
      {!ready ? (
        <p className="qty-low">
          Configure o emitente e o certificado em{' '}
          <Link to="/fiscal/config">Configuração fiscal</Link> antes de emitir NFS-e.
        </p>
      ) : null}
      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      <div className="admin-toolbar">
        <AdminPicker
          compact
          label="OS"
          value={osId}
          options={[
            { value: '', label: 'Selecione a OS' },
            ...orders.map((item) => ({
              value: item.id,
              label: `${item.id} · ${item.customerName} · R$ ${workOrderTotal(item).toFixed(2)}`,
            })),
          ]}
          onChange={setOsId}
        />
        <button type="button" className="btn btn--primary" disabled={!ready} onClick={emitFromOs}>
          Emitir NFS-e da OS
        </button>
        <Link to="/os" className="btn btn--ghost">
          Abrir oficina
        </Link>
      </div>

      <form className="fiscal-emit-form" onSubmit={emitStandalone}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Lançamento avulso</h2>
        <div className="admin-form">
          <label>
            Tomador
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
          </label>
          <label>
            CPF/CNPJ
            <input value={customerDocument} onChange={(e) => setCustomerDocument(e.target.value)} />
          </label>
          <label>
            Valor do serviço
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
          </label>
          <AdminPicker
            label="Serviço (LC 116)"
            value={serviceKey}
            options={NFSE_SERVICE_OPTIONS.map((item) => ({
              value: item.itemLc116,
              label: item.label,
            }))}
            onChange={setServiceKey}
          />
          <label className="span-2">
            Descrição
            <input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar" style={{ marginTop: 12 }}>
          <button type="submit" className="btn btn--primary" disabled={!ready}>
            Transmitir NFS-e
          </button>
        </div>
      </form>

      <div className="fiscal-docs-list">
        {docs.map((doc) => (
          <article key={doc.id}>
            <strong>
              {FISCAL_KIND_LABEL[doc.kind]} {doc.number}/{doc.series} · {FISCAL_STATUS_LABEL[doc.status]}
            </strong>
            <span>
              {doc.customerName} · R$ {doc.amount.toFixed(2)} · {new Date(doc.createdAt).toLocaleString('pt-BR')}
            </span>
            <div className="admin-toolbar" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn--ghost" onClick={() => openDanfePreview(doc)}>
                Visualizar
              </button>
            </div>
          </article>
        ))}
        {docs.length === 0 ? <p className="empty">Nenhuma NFS-e emitida ainda.</p> : null}
      </div>
    </section>
  );
}
