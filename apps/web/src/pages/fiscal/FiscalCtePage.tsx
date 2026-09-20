import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  emitCteDocument,
  FISCAL_KIND_LABEL,
  FISCAL_STATUS_LABEL,
  listFiscalDocuments,
  openDanfePreview,
} from '../../data/fiscalDocuments';
import { issuerIsReadyForCte } from '../../data/fiscalIssuerStore';

export function FiscalCtePage() {
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [shipper, setShipper] = useState('');
  const [consignee, setConsignee] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [cargo, setCargo] = useState('');

  const ready = issuerIsReadyForCte();
  const docs = useMemo(
    () => listFiscalDocuments().filter((item) => item.kind === 'cte').slice(0, 20),
    [tick],
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    const value = Number(amount.replace(',', '.'));
    const result = emitCteDocument({
      shipperName: shipper.trim(),
      consigneeName: consignee.trim(),
      originCity: origin.trim(),
      destinationCity: destination.trim(),
      amount: value,
      cargoDesc: cargo.trim() || 'Carga geral',
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`${FISCAL_KIND_LABEL.cte} ${result.document.number} autorizada (simulação SEFAZ).`);
    setTick((value) => value + 1);
  }

  return (
    <section className="admin-page">
      {!ready ? (
        <p className="qty-low">
          Configure certificado e emitente em <Link to="/fiscal/config">Configuração fiscal</Link>.
        </p>
      ) : null}
      {message ? <p className="empty">{message}</p> : null}
      {error ? <p className="qty-low">{error}</p> : null}

      <form className="fiscal-emit-form" onSubmit={onSubmit}>
        <div className="admin-form">
          <label>
            Remetente
            <input value={shipper} onChange={(e) => setShipper(e.target.value)} required />
          </label>
          <label>
            Destinatário
            <input value={consignee} onChange={(e) => setConsignee(e.target.value)} required />
          </label>
          <label>
            Município origem
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} required />
          </label>
          <label>
            Município destino
            <input value={destination} onChange={(e) => setDestination(e.target.value)} required />
          </label>
          <label>
            Valor do frete
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required />
          </label>
          <label className="span-2">
            Descrição da carga
            <input value={cargo} onChange={(e) => setCargo(e.target.value)} />
          </label>
        </div>
        <button type="submit" className="btn btn--primary" disabled={!ready}>
          Transmitir CT-e
        </button>
      </form>

      <div className="fiscal-docs-list">
        {docs.map((doc) => (
          <article key={doc.id}>
            <strong>
              {FISCAL_KIND_LABEL[doc.kind]} {doc.number}/{doc.series} · {FISCAL_STATUS_LABEL[doc.status]}
            </strong>
            <span>
              {doc.customerName} · R$ {doc.amount.toFixed(2)} · {doc.message}
            </span>
            <div className="admin-toolbar" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn--ghost" onClick={() => openDanfePreview(doc)}>
                DACTE / visualizar
              </button>
            </div>
          </article>
        ))}
        {docs.length === 0 ? <p className="empty">Nenhum CT-e emitido ainda.</p> : null}
      </div>
    </section>
  );
}
