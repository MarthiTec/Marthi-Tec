import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  emitMdfeDocument,
  FISCAL_KIND_LABEL,
  FISCAL_STATUS_LABEL,
  listFiscalDocuments,
  openDanfePreview,
} from '../../data/fiscalDocuments';
import { issuerIsReadyForMdfe } from '../../data/fiscalIssuerStore';

export function FiscalMdfePage() {
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [driver, setDriver] = useState('');
  const [plate, setPlate] = useState('');
  const [ufStart, setUfStart] = useState('SP');
  const [ufEnd, setUfEnd] = useState('RJ');
  const [docsRef, setDocsRef] = useState('');

  const ready = issuerIsReadyForMdfe();
  const docs = useMemo(
    () => listFiscalDocuments().filter((item) => item.kind === 'mdfe').slice(0, 20),
    [tick],
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    const result = emitMdfeDocument({
      driverName: driver.trim(),
      vehiclePlate: plate.trim(),
      ufStart: ufStart.trim().toUpperCase(),
      ufEnd: ufEnd.trim().toUpperCase(),
      linkedDocs: docsRef
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(`${FISCAL_KIND_LABEL.mdfe} ${result.document.number} autorizado (simulação SEFAZ).`);
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
            Condutor
            <input value={driver} onChange={(e) => setDriver(e.target.value)} required />
          </label>
          <label>
            Placa do veículo
            <input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              required
              maxLength={8}
            />
          </label>
          <label>
            UF início
            <input value={ufStart} onChange={(e) => setUfStart(e.target.value)} required maxLength={2} />
          </label>
          <label>
            UF fim
            <input value={ufEnd} onChange={(e) => setUfEnd(e.target.value)} required maxLength={2} />
          </label>
          <label className="span-2">
            CT-e / NF-e vinculadas (separadas por vírgula)
            <input
              value={docsRef}
              onChange={(e) => setDocsRef(e.target.value)}
              placeholder="Ex.: 123, 456"
            />
          </label>
        </div>
        <button type="submit" className="btn btn--primary" disabled={!ready}>
          Transmitir MDF-e
        </button>
      </form>

      <div className="fiscal-docs-list">
        {docs.map((doc) => (
          <article key={doc.id}>
            <strong>
              {FISCAL_KIND_LABEL[doc.kind]} {doc.number}/{doc.series} · {FISCAL_STATUS_LABEL[doc.status]}
            </strong>
            <span>
              {doc.customerName} · {doc.message}
            </span>
            <div className="admin-toolbar" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn--ghost" onClick={() => openDanfePreview(doc)}>
                DAMDFE / visualizar
              </button>
            </div>
          </article>
        ))}
        {docs.length === 0 ? <p className="empty">Nenhum MDF-e emitido ainda.</p> : null}
      </div>
    </section>
  );
}
