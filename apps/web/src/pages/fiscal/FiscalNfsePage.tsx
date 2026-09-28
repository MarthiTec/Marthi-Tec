import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  buildNfseXmlStub,
  emitNfseFromOs,
  emitNfseStandalone,
  FISCAL_KIND_LABEL,
  FISCAL_STATUS_LABEL,
  listFiscalDocuments,
  NFSE_SERVICE_OPTIONS,
  openDanfePreview,
  type FiscalDocument,
} from '../../data/fiscalDocuments';
import { getFiscalIssuerSettings, issuerIsReadyForNfse } from '../../data/fiscalIssuerStore';
import { listWorkOrders, workOrderTotal, type WorkOrder } from '../../data/osStore';

export function FiscalNfsePage() {
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'os' | 'standalone'>('os');
  const [osId, setOsId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');
  const [amount, setAmount] = useState('');
  const [serviceKey, setServiceKey] = useState<string>('14.02');
  const [desc, setDesc] = useState('Assistência técnica / reparo de equipamento');
  const [aliqIss, setAliqIss] = useState('5.00');

  // Modal de XML
  const [xmlModalDoc, setXmlModalDoc] = useState<FiscalDocument | null>(null);
  const [xmlCopied, setXmlCopied] = useState(false);

  const ready = issuerIsReadyForNfse();
  const issuer = useMemo(() => getFiscalIssuerSettings(), [tick]);

  const orders = useMemo(
    () =>
      listWorkOrders()
        .filter((item) => item.status === 'ready' || item.status === 'delivered' || item.status === 'progress' || item.status === 'open')
        .slice(0, 50),
    [tick],
  );

  const docs = useMemo(
    () => listFiscalDocuments().filter((item) => item.kind === 'nfse').slice(0, 30),
    [tick],
  );

  function handleSelectOs(id: string) {
    setOsId(id);
    const order = orders.find((item) => item.id === id);
    if (!order) {
      setSelectedOrder(null);
      return;
    }
    setSelectedOrder(order);
    setCustomerName(order.customerName || '');
    setCustomerDocument(order.customerDocument || '');
    // Na NFS-e tributa-se a mão de obra/serviço; se labor for 0, usa o total da OS
    const serviceVal = order.labor > 0 ? order.labor : workOrderTotal(order);
    setAmount(serviceVal.toFixed(2));
    const descParts = [
      `OS nº ${order.id}`,
      order.itemName ? `Aparelho: ${order.itemName}` : '',
      order.defect ? `Defeito: ${order.defect}` : '',
      order.diagnosis || order.notes || 'Manutenção técnica de equipamento',
    ].filter(Boolean);
    setDesc(descParts.join(' · '));
    setServiceKey('14.02');
  }

  function handleTransmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    const val = Number(amount.replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0) {
      setError('Informe um valor de serviço válido maior que zero.');
      return;
    }
    if (!customerName.trim()) {
      setError('Informe o nome ou razão social do tomador do serviço.');
      return;
    }

    const service = NFSE_SERVICE_OPTIONS.find((item) => item.itemLc116 === serviceKey) || NFSE_SERVICE_OPTIONS[1];

    if (mode === 'os' && selectedOrder) {
      const result = emitNfseFromOs({
        workOrderId: selectedOrder.id,
        customerName: customerName.trim(),
        customerDocument: customerDocument.trim() || undefined,
        amount: val,
        serviceDescription: desc.trim() || `Serviço OS ${selectedOrder.id}`,
        itemLc116: service.itemLc116,
        cTribNac: service.cTribNac,
        aliqIss: Number(aliqIss) || 5,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`NFS-e ${result.document.number} vinculada à OS ${selectedOrder.id} autorizada com sucesso.`);
      setXmlModalDoc(result.document);
      setTick((v) => v + 1);
    } else {
      const result = emitNfseStandalone({
        customerName: customerName.trim(),
        customerDocument: customerDocument.trim() || undefined,
        amount: val,
        itemLc116: service.itemLc116,
        cTribNac: service.cTribNac,
        xDescServ: desc.trim() || service.label,
        aliqIss: Number(aliqIss) || 5,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`NFS-e ${result.document.number} (Lançamento Avulso) emitida com sucesso.`);
      setXmlModalDoc(result.document);
      setTick((v) => v + 1);
    }
  }

  function copyXmlToClipboard(xml: string) {
    void navigator.clipboard.writeText(xml);
    setXmlCopied(true);
    setTimeout(() => setXmlCopied(false), 2500);
  }

  function downloadXmlFile(doc: FiscalDocument) {
    const xml = buildNfseXmlStub(doc);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFSe_${doc.number || doc.id}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <section className="admin-page">
      {/* Card de Atividade do Certificado */}
      <div className="fiscal-cert-status-card">
        <div className="fiscal-cert-status-card__info">
          <span className={`fiscal-cert-badge ${ready ? 'fiscal-cert-badge--ok' : 'fiscal-cert-badge--warn'}`}>
            {ready ? '● Certificado A1 Válido' : '▲ Certificado A1 Pendente'}
          </span>
          <span>
            Emitente: <strong>{issuer.emitenteName || 'Loja Principal'}</strong> · CNPJ: {issuer.cnpj || '—'}
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--mute)' }}>
            Ambiente: <strong>{issuer.environment === 'producao' ? 'Produção (Portal Nacional)' : 'Homologação (Testes)'}</strong>
          </span>
        </div>
        <Link to="/fiscal/config" className="btn btn--ghost" style={{ fontSize: '0.82rem' }}>
          Configuração Fiscal
        </Link>
      </div>

      {!ready ? (
        <p className="qty-low" style={{ marginBottom: 14 }}>
          Atenção: Configure o emitente e o certificado em{' '}
          <Link to="/fiscal/config">Configuração fiscal</Link> antes de transmitir NFS-e oficial.
        </p>
      ) : null}

      {message ? <p className="pdv__ok" style={{ marginBottom: 14 }}>{message}</p> : null}
      {error ? <p className="qty-low" style={{ marginBottom: 14 }}>{error}</p> : null}

      {/* Formulário Principal de Emissão de NFS-e */}
      <form className="fiscal-emit-form" onSubmit={handleTransmit}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Emissão de NFS-e — Padrão DPS Nacional</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`btn btn--sm ${mode === 'os' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => {
                setMode('os');
                setError('');
              }}
            >
              🔧 Vincular a uma OS
            </button>
            <button
              type="button"
              className={`btn btn--sm ${mode === 'standalone' ? 'btn--primary' : 'btn--ghost'}`}
              onClick={() => {
                setMode('standalone');
                setSelectedOrder(null);
                setOsId('');
                setError('');
              }}
            >
              📄 Lançamento Avulso
            </button>
          </div>
        </div>

        {mode === 'os' ? (
          <div style={{ display: 'grid', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
            <AdminPicker
              label="Selecione a Ordem de Serviço (OS)"
              value={osId}
              options={[
                { value: '', label: 'Selecione uma OS da oficina…' },
                ...orders.map((o) => ({
                  value: o.id,
                  label: `${o.id} · ${o.customerName} · ${o.itemName || 'Aparelho'} (Mão de obra: R$ ${o.labor.toFixed(2)} | Total: R$ ${workOrderTotal(o).toFixed(2)})`,
                })),
              ]}
              onChange={handleSelectOs}
            />
            {selectedOrder ? (
              <div style={{ fontSize: '0.84rem', color: 'var(--ink)', lineHeight: 1.5, marginTop: 4 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <span>🔧 <strong>Aparelho:</strong> {selectedOrder.itemName || 'Equipamento'}</span>
                  <span>🔍 <strong>Defeito:</strong> {selectedOrder.defect || '—'}</span>
                  <span>👨‍🔧 <strong>Técnico:</strong> {selectedOrder.technician || 'Bancada'}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4, color: 'var(--teal)' }}>
                  <span>✓ <strong>Mão de Obra Tributável (NFS-e):</strong> R$ {selectedOrder.labor.toFixed(2)}</span>
                  <span>📦 <strong>Peças Físicas (Tributadas via ICMS/NF-e):</strong> R$ {selectedOrder.parts.toFixed(2)}</span>
                  <span style={{ color: 'var(--mute)' }}>Total da OS: R$ {workOrderTotal(selectedOrder).toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mute)' }}>
                Selecione uma OS para carregar automaticamente o cliente, o defeito, a descrição do serviço e o valor da mão de obra.
              </p>
            )}
          </div>
        ) : null}

        <div className="admin-form">
          <label>
            Tomador do Serviço (Cliente)
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nome completo ou Razão Social"
              required
            />
          </label>
          <label>
            CPF / CNPJ do Tomador
            <input
              value={customerDocument}
              onChange={(e) => setCustomerDocument(e.target.value)}
              placeholder="CPF ou CNPJ (opcional para consumidor final)"
            />
          </label>
          <label>
            Valor do Serviço (R$)
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </label>
          <label>
            Alíquota de ISS (%)
            <input
              value={aliqIss}
              onChange={(e) => setAliqIss(e.target.value)}
              inputMode="decimal"
              placeholder="5.00"
            />
          </label>
          <div className="span-2">
            <AdminPicker
              label="Serviço / Atividade Tributável (LC 116)"
              value={serviceKey}
              options={NFSE_SERVICE_OPTIONS.map((item) => ({
                value: item.itemLc116,
                label: item.label,
              }))}
              onChange={setServiceKey}
            />
          </div>
          <label className="span-2">
            Discriminação dos Serviços Prestados
            <textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Descreva detalhadamente o serviço executado..."
              required
            />
          </label>
        </div>

        <div className="admin-toolbar" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="submit" className="btn btn--primary" disabled={!ready}>
            Transmitir NFS-e (Portal Nacional)
          </button>
        </div>
      </form>

      {/* Histórico de NFS-e Emitidas */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: '1.05rem', margin: '0 0 10px' }}>Histórico de NFS-e Emitidas</h3>
        <div className="fiscal-docs-list">
          {docs.map((doc) => (
            <article key={doc.id}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <strong>
                  {FISCAL_KIND_LABEL[doc.kind]} nº {doc.number}/{doc.series} · {FISCAL_STATUS_LABEL[doc.status]}
                </strong>
                <span style={{ fontSize: '0.82rem', color: 'var(--teal)', fontWeight: 600 }}>
                  R$ {doc.amount.toFixed(2)}
                </span>
              </div>
              <span>
                Tomador: <strong>{doc.customerName}</strong> {doc.customerDocument ? `(${doc.customerDocument})` : ''} · Emissão: {new Date(doc.createdAt).toLocaleString('pt-BR')}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--mute)' }}>
                {doc.nfse?.xDescServ || doc.message}
              </span>
              <div className="admin-toolbar crud-actions" style={{ marginTop: 8, justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setXmlModalDoc(doc)}
                >
                  📄 Exibir XML
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => openDanfePreview(doc)}
                >
                  🖨️ Visualizar DANFSE
                </button>
              </div>
            </article>
          ))}
          {docs.length === 0 ? <p className="empty">Nenhuma NFS-e emitida ainda.</p> : null}
        </div>
      </div>

      {/* Modal de Exibição do XML da NFS-e */}
      {xmlModalDoc ? (
        <div className="fiscal-xml-backdrop" onClick={() => setXmlModalDoc(null)}>
          <div className="fiscal-xml-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fiscal-xml-header">
              <h3>XML da NFS-e nº {xmlModalDoc.number}</h3>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setXmlModalDoc(null)}
              >
                ✕ Fechar
              </button>
            </div>
            <pre className="fiscal-xml-content">
              {buildNfseXmlStub(xmlModalDoc)}
            </pre>
            <div className="fiscal-xml-footer">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => copyXmlToClipboard(buildNfseXmlStub(xmlModalDoc))}
              >
                {xmlCopied ? '✓ Copiado!' : '📋 Copiar XML'}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => downloadXmlFile(xmlModalDoc)}
              >
                ⬇️ Baixar Arquivo .xml
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
