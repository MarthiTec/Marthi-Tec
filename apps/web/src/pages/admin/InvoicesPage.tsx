import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { getAdminState } from '../../data/adminStore';
import { logAction } from '../../data/auditLog';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import { getSupplier, listSuppliers } from '../../data/erpRegistry';
import {
  buildNfeXmlStub,
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
  invoiceItemsTotal,
  invoiceTotal,
  listInvoices,
  postInvoice,
  removeInvoiceLine,
  updateInvoiceDraft,
  type Invoice,
  type InvoiceKind,
} from '../../data/invoiceStore';
import {
  defaultCfopForPurpose,
  ENTRY_DOC_PURPOSES,
  EXIT_DOC_PURPOSES,
  getPurposeHint,
  getPurposeLabel,
  type FiscalDocPurpose,
} from '../../data/fiscalTaxTables';
import { listCfopsForKind } from '../../data/fiscalCatalog';
import { listStores } from '../../data/multiStoreStore';
import { formatCpfCnpj } from '../../utils/documentUtils';

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
  const [fiscalTick, setFiscalTick] = useState(0);
  const [cancelReason] = useState('Cancelamento solicitado pelo emitente');

  // Modal de XML
  const [xmlModalDoc, setXmlModalDoc] = useState<FiscalDocument | null>(null);
  const [xmlCopied, setXmlCopied] = useState(false);

  // Aba do detalhe da nota: 'geral' | 'cabecalho' | 'totais' | 'conformidade'
  const [detailTab, setDetailTab] = useState<'geral' | 'cabecalho' | 'totais' | 'conformidade'>('geral');

  const suppliers = useMemo(() => listSuppliers(true), []);
  const stores = useMemo(() => listStores(), []);
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

  // Lista estrita de CFOPs de acordo com a direção da nota selecionada (1/2/3 para entrada, 5/6/7 para saída)
  const allowedCfops = useMemo(() => {
    if (!selected) return [];
    return listCfopsForKind(selected.kind);
  }, [selected?.kind]);

  // Finalidades permitidas por direção da nota
  const allowedPurposes = useMemo(() => {
    if (!selected) return [];
    return selected.kind === 'entry' ? ENTRY_DOC_PURPOSES : EXIT_DOC_PURPOSES;
  }, [selected?.kind]);

  useEffect(() => {
    function onRefresh() {
      setInvoices(listInvoices());
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, onRefresh);
    window.addEventListener('marthi-invoices-updated', onRefresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, onRefresh);
      window.removeEventListener('marthi-invoices-updated', onRefresh);
    };
  }, []);

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

  async function create(kind: InvoiceKind) {
    const defaultPurpose = 'normal';
    const suggestedCfop = defaultCfopForPurpose(defaultPurpose, kind);
    const suggestedNatOp = getPurposeLabel(defaultPurpose, kind);

    const result = await createInvoice({
      kind,
      series: issuer.nfeSeries || '1',
      natOp: suggestedNatOp,
      cfopCode: suggestedCfop,
      documentPurpose: defaultPurpose,
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
    flash('Rascunho criado com CFOP coerente.');
  }

  async function saveDraft(patch: Partial<Invoice>) {
    if (!selected) return;
    const result = await updateInvoiceDraft(selected.id, patch);
    if (!result.ok) {
      fail(result.error);
      return;
    }
    refresh(selected.id);
  }

  async function addLine() {
    if (!selected || !stockId) {
      fail('Selecione um item do estoque.');
      return;
    }
    const result = await addInvoiceLine(selected.id, { stockId, qty });
    if (!result.ok) {
      fail(result.error);
      return;
    }
    setStockId('');
    setQty(1);
    refresh(selected.id);
    flash('Item adicionado.');
  }

  async function post() {
    if (!selected) return;
    const result = await postInvoice(selected.id);
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

  async function cancel() {
    if (!selected) return;
    const result = await cancelInvoice(selected.id);
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
      return getSupplier(invoice.supplierId)?.name || invoice.customerName || 'Fornecedor';
    }
    return invoice.customerName || 'Destinatário';
  }

  function partyDocument(invoice: Invoice) {
    if (invoice.customerDocument?.trim()) return invoice.customerDocument.trim();
    if (invoice.kind === 'entry' && invoice.supplierId) {
      return getSupplier(invoice.supplierId)?.document || '';
    }
    return '';
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
    if (
      (selected.documentPurpose === 'devolucao' || selected.documentPurpose === 'retorno') &&
      (!selected.refNfeKey || selected.refNfeKey.length < 44)
    ) {
      fail('Notas de devolução ou retorno exigem a chave de acesso da NF-e referenciada (44 dígitos).');
      return;
    }

    const docPurpose = selected.documentPurpose ?? 'normal';
    const cfop = selected.cfopCode || defaultCfopForPurpose(docPurpose, selected.kind);

    // Validação estrita de compatibilidade de CFOP com o tipo de operação
    if (selected.kind === 'entry' && (cfop.startsWith('5') || cfop.startsWith('6') || cfop.startsWith('7'))) {
      fail(`Erro Fiscal: Operação de ENTRADA não permite CFOP de saída (${cfop}). Selecione um CFOP iniciado por 1 ou 2.`);
      return;
    }
    if (selected.kind === 'exit' && (cfop.startsWith('1') || cfop.startsWith('2') || cfop.startsWith('3'))) {
      fail(`Erro Fiscal: Operação de SAÍDA não permite CFOP de entrada (${cfop}). Selecione um CFOP iniciado por 5 ou 6.`);
      return;
    }

    const result = transmitNfeForInvoice({
      invoiceId: selected.id,
      kind: selected.kind,
      customerName: partyName(selected),
      customerDocument: partyDocument(selected),
      amount: invoiceTotal(selected),
      asNfce: asNfce && selected.kind === 'exit',
      documentPurpose: docPurpose,
      cfopCode: cfop,
      refNfeKey: selected.refNfeKey,
      targetStoreId: selected.targetStoreId,
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
    flash(
      `${asNfce ? FISCAL_KIND_LABEL.nfce : FISCAL_KIND_LABEL.nfe} ${result.document.number} autorizada na SEFAZ.`,
    );
  }

  function danfe(doc: FiscalDocument, print = false) {
    const res = openDanfePreview(doc, print);
    if (!res.ok) fail(res.error);
  }

  function previewDanfe(print = false) {
    if (!selected) return;
    if (fiscalDoc) {
      danfe(fiscalDoc, print);
      return;
    }
    if (selected.lines.length === 0) {
      fail('Inclua itens para visualizar a DANFE.');
      return;
    }
    const docPurpose = selected.documentPurpose ?? 'normal';
    const draftDoc: FiscalDocument = {
      id: `DRAFT-${selected.id}`,
      kind: 'nfe',
      status: 'pending',
      refType: 'invoice',
      refId: selected.id,
      customerName: partyName(selected),
      amount: invoiceTotal(selected),
      number: selected.number || '—',
      series: selected.series || issuer.nfeSeries || '1',
      accessKey: 'PREVIEW-SEM-TRANSMISSAO',
      provider: 'sefaz_mock',
      createdAt: new Date().toISOString(),
      message: `Pré-visualização DANFE · ${getPurposeLabel(docPurpose, selected.kind)} · ainda não transmitida`,
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
        documentPurpose: docPurpose,
      },
    };
    danfe(draftDoc, print);
  }

  function handleOpenXml(docToView?: FiscalDocument | null) {
    if (docToView) {
      setXmlModalDoc(docToView);
      return;
    }
    if (!selected) return;
    const docPurpose = selected.documentPurpose ?? 'normal';
    const draftDoc: FiscalDocument = fiscalDoc || {
      id: `XML-${selected.id}`,
      kind: 'nfe',
      status: 'authorized',
      refType: 'invoice',
      refId: selected.id,
      customerName: partyName(selected),
      customerDocument: partyDocument(selected),
      cfopCode: selected.cfopCode || defaultCfopForPurpose(docPurpose, selected.kind),
      amount: invoiceTotal(selected),
      number: selected.number || '1',
      series: selected.series || '1',
      accessKey: `332609${cleanDocument(issuer.cnpj || '00000000000100')}55001${String(selected.number).padStart(9, '0')}1000000018`,
      provider: 'sefaz_mock',
      createdAt: new Date().toISOString(),
      message: selected.notes || 'Emissão regular de nota fiscal',
      refNfeKey: selected.refNfeKey,
      items: selected.lines.map((line) => ({
        name: line.name,
        qty: line.qty,
        unitPrice: selected.kind === 'entry' ? line.unitCost : line.unitPrice,
      })),
      nfe: {
        environment: issuer.environment,
        protocol: '133260000000001',
        receiptNumber: 'REC2026001',
        statusCode: '100',
        statusMessage: 'Autorizado o uso da NF-e',
        xmlDigest: 'Wp6Z9v8h34+=',
        documentPurpose: docPurpose,
      },
    };
    setXmlModalDoc(draftDoc);
  }

  function copyXmlToClipboard(xml: string) {
    void navigator.clipboard.writeText(xml);
    setXmlCopied(true);
    setTimeout(() => setXmlCopied(false), 2500);
  }

  function downloadXmlFile(doc: FiscalDocument) {
    const xml = buildNfeXmlStub(doc);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NFe_${doc.number || doc.id}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleCancelFiscalDoc() {
    if (!fiscalDoc) return;
    const reason = window.prompt('Motivo do cancelamento na SEFAZ (mínimo 15 caracteres):', cancelReason);
    if (!reason || reason.trim().length < 15) {
      fail('Cancelamento exige justificativa com pelo menos 15 caracteres.');
      return;
    }
    const res = cancelNfeDocument(fiscalDoc.id, reason.trim());
    if (!res.ok) {
      fail(res.error);
      return;
    }
    setFiscalTick((v) => v + 1);
    flash(`NF-e ${fiscalDoc.number} cancelada com sucesso na SEFAZ.`);
  }

  function handleConsultFiscalDoc() {
    if (!fiscalDoc) return;
    const res = consultNfeStatus(fiscalDoc.id);
    if (!res.ok) {
      fail(res.error);
      return;
    }
    setFiscalTick((v) => v + 1);
    flash(`Status SEFAZ consultado: ${res.document.nfe?.statusMessage || 'Autorizado'}.`);
  }

  function cleanDocument(doc: string) {
    return doc.replace(/\D/g, '');
  }

  // Cálculos de totais de impostos
  const itemsSum = selected ? invoiceItemsTotal(selected) : 0;
  const finalTotal = selected ? invoiceTotal(selected) : 0;
  const isTotalsMatch = Math.abs(itemsSum + (Number(selected?.vFrete) || 0) + (Number(selected?.vOutro) || 0) - (Number(selected?.vDesc) || 0) - finalTotal) < 0.01;

  // Auditoria de Conformidade Fácil para a nota selecionada
  const conformidadeReport = useMemo(() => {
    if (!selected) return [];
    const checks: { label: string; ok: boolean; message: string }[] = [];

    // 1. Direção vs CFOP
    const currentCfop = selected.cfopCode || defaultCfopForPurpose(selected.documentPurpose ?? 'normal', selected.kind);
    const isEntryCfop = currentCfop.startsWith('1') || currentCfop.startsWith('2') || currentCfop.startsWith('3');
    const isExitCfop = currentCfop.startsWith('5') || currentCfop.startsWith('6') || currentCfop.startsWith('7');
    const cfopOk = (selected.kind === 'entry' && isEntryCfop) || (selected.kind === 'exit' && isExitCfop);
    checks.push({
      label: 'Coerência CFOP vs Tipo da Nota',
      ok: cfopOk,
      message: cfopOk
        ? `CFOP ${currentCfop} é válido para operação de ${selected.kind === 'entry' ? 'ENTRADA' : 'SAÍDA'}.`
        : `INCOMPATÍVEL: CFOP ${currentCfop} não pode ser utilizado em operação de ${selected.kind === 'entry' ? 'ENTRADA' : 'SAÍDA'}.`,
    });

    // 2. Chave referenciada para devolução/retorno
    if (selected.documentPurpose === 'devolucao' || selected.documentPurpose === 'retorno') {
      const keyOk = Boolean(selected.refNfeKey && selected.refNfeKey.length === 44);
      checks.push({
        label: 'Chave de Acesso Referenciada (44 dígitos)',
        ok: keyOk,
        message: keyOk
          ? `Chave referenciada informada: ${selected.refNfeKey}`
          : 'Notas de devolução ou retorno exigem a chave de 44 dígitos da NF-e original.',
      });
    }

    // 3. Filial para transferência
    if (selected.documentPurpose === 'transferencia') {
      const storeOk = Boolean(selected.targetStoreId);
      checks.push({
        label: 'Filial de Destino / Origem',
        ok: storeOk,
        message: storeOk
          ? 'Filial vinculada com CNPJ e Inscrição Estadual.'
          : 'Selecione a loja/filial receptora da transferência.',
      });
    }

    // 4. Documento do destinatário/fornecedor
    const doc = partyDocument(selected);
    const docOk = doc.length >= 11;
    checks.push({
      label: 'Identificação Fiscal (CPF/CNPJ)',
      ok: docOk,
      message: docOk ? `Documento informado: ${doc}` : 'Informe o CPF ou CNPJ do destinatário ou fornecedor.',
    });

    // 5. Itens da nota
    const hasItems = selected.lines.length > 0;
    checks.push({
      label: 'Itens e Produtos Lançados',
      ok: hasItems,
      message: hasItems
        ? `${selected.lines.length} item(ns) incluído(s) com valor total de ${money(itemsSum)}.`
        : 'A nota deve conter pelo menos 1 item antes de ser transmitida.',
    });

    // 6. Certificado Digital
    checks.push({
      label: 'Certificado Digital A1',
      ok: issuerIsReadyForNfe(issuer),
      message: issuerIsReadyForNfe(issuer)
        ? `Certificado ativo para emitente ${issuer.emitenteName || 'Loja Principal'}.`
        : 'Configure o certificado A1 em Configuração Fiscal.',
    });

    return checks;
  }, [selected, itemsSum, issuer]);

  return (
    <section className="admin-page">
      {/* Card Superior com Status do Certificado Digital A1 */}
      <div className="fiscal-cert-status-card">
        <div className="fiscal-cert-status-card__info">
          <span className={`fiscal-cert-badge ${issuerIsReadyForNfe(issuer) ? 'fiscal-cert-badge--ok' : 'fiscal-cert-badge--warn'}`}>
            {issuerIsReadyForNfe(issuer) ? '● Certificado A1 Ativo' : '▲ Certificado A1 Pendente'}
          </span>
          <span>
            Emitente: <strong>{issuer.emitenteName || 'Loja Principal'}</strong> · CNPJ: {issuer.cnpj ? formatCpfCnpj(issuer.cnpj) : '—'}
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--mute)' }}>
            Ambiente SEFAZ: <strong>{SEFAZ_ENV_LABEL[issuer.environment]}</strong> · Série Padrão: <strong>{issuer.nfeSeries || '1'}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/painel/fiscal/config" className="btn btn--ghost btn--sm">
            ⚙️ Configuração Fiscal
          </Link>
          <Link to="/painel/fiscal/cst" className="btn btn--ghost btn--sm">
            Tributos & cClassTrib
          </Link>
        </div>
      </div>

      <div className="admin-toolbar">
        <AdminPicker
          compact
          label="Filtro"
          value={kindFilter}
          options={[
            { value: 'all', label: 'Todas as notas' },
            { value: 'entry', label: 'Notas de Entrada (Compras / Devoluções de Venda)' },
            { value: 'exit', label: 'Notas de Saída (Vendas / Devoluções de Compra)' },
          ]}
          onChange={(value) => setKindFilter(value as 'all' | InvoiceKind)}
        />
        <button type="button" className="btn btn--primary" onClick={() => void create('entry')}>
          + Nova Nota de Entrada
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => void create('exit')}>
          + Nova Nota de Saída
        </button>
      </div>

      {message ? <p className="pdv__ok" style={{ marginBottom: 14 }}>{message}</p> : null}
      {error ? <p className="qty-low" style={{ marginBottom: 14 }}>{error}</p> : null}

      <div className="erp-invoices">
        {/* Painel Esquerdo: Listagem de Notas */}
        <article className="admin-card">
          <h2>Notas Fiscais de Entrada e Saída</h2>
          <div className="admin-table-container">
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
                      Nenhuma nota encontrada neste filtro.
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
                        <td><strong>{item.id}</strong></td>
                        <td>
                          <span className={`stock-badge ${item.kind === 'entry' ? 'stock-badge--warn' : 'stock-badge--ok'}`}>
                            {INVOICE_KIND_LABEL[item.kind]}
                          </span>
                        </td>
                        <td>{INVOICE_STATUS_LABEL[item.status]}</td>
                        <td>
                          {doc
                            ? `${FISCAL_KIND_LABEL[doc.kind]} · ${FISCAL_STATUS_LABEL[doc.status]}`
                            : '—'}
                        </td>
                        <td><strong>{money(invoiceTotal(item))}</strong></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>

        {/* Painel Direito: Detalhe, Edição de Cabeçalho e Totais */}
        <article className="admin-card">
          {!selected ? (
            <>
              <h2>Detalhes da Nota</h2>
              <p className="empty">Selecione uma nota na lista ao lado ou crie uma nova entrada/saída.</p>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <h2 style={{ margin: 0 }}>
                  {INVOICE_KIND_LABEL[selected.kind]} · {selected.id}
                </h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => handleOpenXml(fiscalDoc)}
                  >
                    📄 Exibir XML
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => previewDanfe(false)}
                  >
                    🖨️ DANFE
                  </button>
                </div>
              </div>

              <p className="fiscal-note-meta" style={{ marginTop: 6 }}>
                Status: <strong>{INVOICE_STATUS_LABEL[selected.status]}</strong>
                {' · '}
                Total da Nota: <strong style={{ color: 'var(--teal)' }}>{money(invoiceTotal(selected))}</strong>
                {' · '}
                Finalidade: <span>{getPurposeLabel(selected.documentPurpose ?? 'normal', selected.kind)}</span>
              </p>

              {/* Abas do Painel de Detalhes da Nota */}
              <div style={{ display: 'flex', gap: 6, margin: '14px 0 10px', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                <button
                  type="button"
                  className={`btn btn--sm ${detailTab === 'geral' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDetailTab('geral')}
                >
                  Geral & CFOP
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${detailTab === 'cabecalho' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDetailTab('cabecalho')}
                >
                  Cabeçalho & Transporte
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${detailTab === 'totais' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDetailTab('totais')}
                >
                  Totais & Impostos
                </button>
                <button
                  type="button"
                  className={`btn btn--sm ${detailTab === 'conformidade' ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setDetailTab('conformidade')}
                >
                  ✓ Conformidade Fácil
                </button>
              </div>

              {/* ABA 1: GERAL & CFOP */}
              {detailTab === 'geral' ? (
                <div className="admin-form" style={{ marginTop: 10 }}>
                  <label>
                    Número / Documento
                    <input
                      value={selected.number}
                      disabled={selected.status !== 'draft'}
                      onChange={(e) => void saveDraft({ number: e.target.value })}
                    />
                  </label>
                  <label>
                    Data de Emissão
                    <input
                      type="date"
                      value={selected.issuedAt.slice(0, 10)}
                      disabled={selected.status !== 'draft'}
                      onChange={(e) => void saveDraft({ issuedAt: e.target.value })}
                    />
                  </label>

                  {/* Finalidade Fiscal Filtrada Estritamente por Tipo de Operação */}
                  <AdminPicker
                    className="span-2"
                    label={`Finalidade Fiscal (${selected.kind === 'entry' ? 'Operações de ENTRADA' : 'Operações de SAÍDA'})`}
                    value={selected.documentPurpose ?? 'normal'}
                    disabled={selected.status !== 'draft'}
                    options={allowedPurposes.map((key) => ({
                      value: key,
                      label: getPurposeLabel(key, selected.kind),
                    }))}
                    onChange={(value) => {
                      const purpose = value as FiscalDocPurpose;
                      const suggestedCfop = defaultCfopForPurpose(purpose, selected.kind);
                      const suggestedNatOp = getPurposeLabel(purpose, selected.kind);
                      void saveDraft({
                        documentPurpose: purpose,
                        cfopCode: suggestedCfop,
                        natOp: suggestedNatOp,
                      });
                    }}
                  />
                  <p className="span-2 empty" style={{ margin: 0, fontSize: '0.82rem' }}>
                    {getPurposeHint(selected.documentPurpose ?? 'normal', selected.kind)}
                  </p>

                  {/* Transferência entre Filiais */}
                  {selected.documentPurpose === 'transferencia' ? (
                    <AdminPicker
                      className="span-2"
                      label={`Filial de ${selected.kind === 'entry' ? 'Origem' : 'Destino'} da Transferência`}
                      value={selected.targetStoreId ?? ''}
                      disabled={selected.status !== 'draft'}
                      placeholder="Selecione a loja/filial do grupo…"
                      options={stores.map((s) => ({
                        value: s.id,
                        label: `${s.name} · CNPJ ${formatCpfCnpj(s.cnpj)} (${s.city}/${s.state})`,
                      }))}
                      onChange={(storeId) => {
                        const st = stores.find((s) => s.id === storeId);
                        if (st) {
                          void saveDraft({
                            targetStoreId: st.id,
                            customerName: st.name,
                            customerDocument: st.cnpj,
                            cfopCode: selected.kind === 'entry' ? '1152' : '5152',
                            natOp: selected.kind === 'entry' ? 'TRANSFERENCIA DE ENTRADA P/ COMERCIALIZACAO' : 'TRANSFERENCIA DE MERCADORIAS ENTRE FILIAIS',
                          });
                        } else {
                          void saveDraft({ targetStoreId: storeId });
                        }
                      }}
                    />
                  ) : null}

                  {/* Chave Referenciada (Devolução ou Retorno) */}
                  {selected.documentPurpose === 'devolucao' || selected.documentPurpose === 'retorno' ? (
                    <label className="span-2">
                      Chave de Acesso da NF-e Referenciada (44 dígitos obrigatórios)
                      <input
                        value={selected.refNfeKey ?? ''}
                        maxLength={44}
                        placeholder="Ex: 35240900000000000191550010000001011000000010"
                        disabled={selected.status !== 'draft'}
                        onChange={(e) => void saveDraft({ refNfeKey: e.target.value.replace(/\D/g, '') })}
                      />
                    </label>
                  ) : null}

                  {/* CFOP da Operação - Filtrado e Estrito */}
                  <AdminPicker
                    className="span-2"
                    label={`CFOP da Operação (${selected.kind === 'entry' ? 'Apenas Entradas 1xxx / 2xxx' : 'Apenas Saídas 5xxx / 6xxx'})`}
                    value={selected.cfopCode || defaultCfopForPurpose(selected.documentPurpose ?? 'normal', selected.kind)}
                    disabled={selected.status !== 'draft'}
                    options={allowedCfops.map((c) => ({
                      value: c.code,
                      label: `${c.code} — ${c.description}`,
                    }))}
                    onChange={(value) => void saveDraft({ cfopCode: value })}
                  />

                  {selected.kind === 'entry' ? (
                    <AdminPicker
                      label="Fornecedor"
                      value={selected.supplierId}
                      disabled={selected.status !== 'draft'}
                      options={suppliers.map((item) => ({
                        value: item.id,
                        label: item.name,
                      }))}
                      onChange={(value) => {
                        const sup = suppliers.find((s) => s.id === value);
                        void saveDraft({
                          supplierId: value,
                          customerName: sup?.name || selected.customerName,
                          customerDocument: sup?.document || selected.customerDocument,
                        });
                      }}
                    />
                  ) : (
                    <label>
                      Cliente / Destinatário
                      <input
                        value={selected.customerName}
                        disabled={selected.status !== 'draft'}
                        placeholder="Nome do cliente ou destinatário"
                        onChange={(e) => void saveDraft({ customerName: e.target.value })}
                      />
                    </label>
                  )}

                  <label>
                    CPF / CNPJ ({selected.kind === 'entry' ? 'Fornecedor' : 'Destinatário'})
                    <input
                      value={selected.customerDocument ?? ''}
                      disabled={selected.status !== 'draft'}
                      placeholder="CPF ou CNPJ (inclusive alfanumérico)"
                      onChange={(e) => void saveDraft({ customerDocument: e.target.value.toUpperCase() })}
                    />
                  </label>
                </div>
              ) : null}

              {/* ABA 2: CABEÇALHO & TRANSPORTE */}
              {detailTab === 'cabecalho' ? (
                <div className="admin-form" style={{ marginTop: 10 }}>
                  <label>
                    Série da NF-e
                    <input
                      value={selected.series || '1'}
                      disabled={selected.status !== 'draft'}
                      onChange={(e) => void saveDraft({ series: e.target.value })}
                    />
                  </label>
                  <label>
                    Data/Hora de Saída/Entrada
                    <input
                      type="date"
                      value={selected.movementAt ? selected.movementAt.slice(0, 10) : selected.issuedAt.slice(0, 10)}
                      disabled={selected.status !== 'draft'}
                      onChange={(e) => void saveDraft({ movementAt: e.target.value })}
                    />
                  </label>

                  <label className="span-2">
                    Natureza da Operação (Texto impresso no DANFE)
                    <input
                      value={selected.natOp || getPurposeLabel(selected.documentPurpose ?? 'normal', selected.kind)}
                      disabled={selected.status !== 'draft'}
                      placeholder="Ex: COMPRA PARA COMERCIALIZACAO ou VENDA DE MERCADORIA"
                      onChange={(e) => void saveDraft({ natOp: e.target.value.toUpperCase() })}
                    />
                  </label>

                  <AdminPicker
                    className="span-2"
                    label="Modalidade do Frete"
                    value={selected.modFrete || '9'}
                    disabled={selected.status !== 'draft'}
                    options={[
                      { value: '0', label: '0 — Por conta do Emitente (CIF)' },
                      { value: '1', label: '1 — Por conta do Destinatário (FOB)' },
                      { value: '2', label: '2 — Por conta de Terceiros' },
                      { value: '9', label: '9 — Sem Ocorrência de Transporte' },
                    ]}
                    onChange={(val) => void saveDraft({ modFrete: val })}
                  />

                  <label>
                    Valor do Frete (R$)
                    <input
                      type="number"
                      step="0.01"
                      value={selected.vFrete ?? ''}
                      disabled={selected.status !== 'draft'}
                      placeholder="0.00"
                      onChange={(e) => void saveDraft({ vFrete: Number(e.target.value) || 0 })}
                    />
                  </label>

                  <label>
                    Valor do Desconto (R$)
                    <input
                      type="number"
                      step="0.01"
                      value={selected.vDesc ?? ''}
                      disabled={selected.status !== 'draft'}
                      placeholder="0.00"
                      onChange={(e) => void saveDraft({ vDesc: Number(e.target.value) || 0 })}
                    />
                  </label>

                  <label className="span-2">
                    Outras Despesas Acessórias (R$)
                    <input
                      type="number"
                      step="0.01"
                      value={selected.vOutro ?? ''}
                      disabled={selected.status !== 'draft'}
                      placeholder="0.00"
                      onChange={(e) => void saveDraft({ vOutro: Number(e.target.value) || 0 })}
                    />
                  </label>

                  <label className="span-2">
                    Informações Complementares de Interesse do Contribuinte (infCpl)
                    <textarea
                      rows={3}
                      value={selected.infCpl || selected.notes}
                      disabled={selected.status !== 'draft'}
                      placeholder="Observações fiscais, dados adicionais de tributação, local de entrega..."
                      onChange={(e) => void saveDraft({ infCpl: e.target.value, notes: e.target.value })}
                    />
                  </label>
                </div>
              ) : null}

              {/* ABA 3: TOTAIS & IMPOSTOS */}
              {detailTab === 'totais' ? (
                <div style={{ marginTop: 10 }}>
                  <div className="fiscal-totals-card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <strong style={{ fontSize: '0.95rem' }}>Quadro de Totais e Tributos da Nota Fiscal</strong>
                      <span className={`fiscal-coherence-badge ${isTotalsMatch ? 'fiscal-coherence-badge--match' : 'fiscal-coherence-badge--divergent'}`}>
                        {isTotalsMatch ? '✓ Totais 100% Coerentes' : '⚠️ Divergência nos Totais'}
                      </span>
                    </div>

                    <div className="fiscal-totals-grid">
                      <div className="fiscal-totals-item">
                        <span>Total dos Produtos</span>
                        <strong>{money(itemsSum)}</strong>
                      </div>
                      <div className="fiscal-totals-item">
                        <span>Frete (+)</span>
                        <strong>{money(selected.vFrete || 0)}</strong>
                      </div>
                      <div className="fiscal-totals-item">
                        <span>Desconto (-)</span>
                        <strong>{money(selected.vDesc || 0)}</strong>
                      </div>
                      <div className="fiscal-totals-item">
                        <span>Total da Nota (vNF)</span>
                        <strong style={{ color: 'var(--teal)' }}>{money(finalTotal)}</strong>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                      <span style={{ fontSize: '0.76rem', color: 'var(--mute)', textTransform: 'uppercase', fontWeight: 700 }}>
                        Estimativa de Impostos (ICMS, PIS, COFINS e Reforma IBS/CBS)
                      </span>
                      <div className="fiscal-totals-grid" style={{ marginTop: 6 }}>
                        <div className="fiscal-totals-item">
                          <span>Base ICMS</span>
                          <strong>{money(finalTotal)}</strong>
                        </div>
                        <div className="fiscal-totals-item">
                          <span>ICMS (18%)</span>
                          <strong>{money(finalTotal * 0.18)}</strong>
                        </div>
                        <div className="fiscal-totals-item">
                          <span>PIS (1.65%)</span>
                          <strong>{money(finalTotal * 0.0165)}</strong>
                        </div>
                        <div className="fiscal-totals-item">
                          <span>COFINS (7.6%)</span>
                          <strong>{money(finalTotal * 0.076)}</strong>
                        </div>
                        <div className="fiscal-totals-item">
                          <span>IBS Reforma (0.1%)</span>
                          <strong>{money(finalTotal * 0.001)}</strong>
                        </div>
                        <div className="fiscal-totals-item">
                          <span>CBS Reforma (0.9%)</span>
                          <strong>{money(finalTotal * 0.009)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ABA 4: CONFORMIDADE FÁCIL */}
              {detailTab === 'conformidade' ? (
                <div className="fiscal-conformidade-box">
                  <div className="fiscal-conformidade-header">
                    <strong>🛡️ Conformidade Fácil — Validador Pré-SEFAZ</strong>
                    <span style={{ fontSize: '0.8rem', color: 'var(--mute)' }}>Auditoria em tempo real</span>
                  </div>
                  <ul className="fiscal-conformidade-list">
                    {conformidadeReport.map((c, i) => (
                      <li key={i} className={`fiscal-conformidade-item ${c.ok ? 'fiscal-conformidade-item--ok' : 'fiscal-conformidade-item--warn'}`}>
                        <span>{c.ok ? '✓' : '▲'}</span>
                        <div>
                          <strong>{c.label}:</strong> {c.message}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Seção de Itens da Nota */}
              <div style={{ marginTop: 18 }}>
                <h3 style={{ fontSize: '1rem', margin: '0 0 8px' }}>Itens da Nota Fiscal</h3>
                {selected.status === 'draft' ? (
                  <div className="admin-toolbar" style={{ marginBottom: 10 }}>
                    <AdminPicker
                      label="Produto / Mercadoria"
                      value={stockId}
                      options={[
                        { value: '', label: 'Selecione o produto do estoque…' },
                        ...stock.map((item) => ({
                          value: item.id,
                          label: `${item.sku ? `[${item.sku}] ` : ''}${item.name} · Custo ${money(item.cost)} · Venda ${money(item.price)}`,
                        })),
                      ]}
                      onChange={(value) => setStockId(value)}
                    />
                    <label style={{ maxWidth: 100 }}>
                      Qtd
                      <input
                        type="number"
                        min="1"
                        value={qty}
                        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                      />
                    </label>
                    <button type="button" className="btn btn--primary" onClick={() => void addLine()}>
                      + Adicionar Item
                    </button>
                  </div>
                ) : null}

                <div className="admin-table-container">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qtd</th>
                        <th>V. Unitário</th>
                        <th>Total</th>
                        {selected.status === 'draft' ? <th>Ação</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {selected.lines.length === 0 ? (
                        <tr>
                          <td colSpan={selected.status === 'draft' ? 5 : 4} className="empty">
                            Nenhum item adicionado à nota ainda.
                          </td>
                        </tr>
                      ) : (
                        selected.lines.map((line) => {
                          const unit = selected.kind === 'entry' ? line.unitCost : line.unitPrice;
                          return (
                            <tr key={line.id}>
                              <td>{line.name}</td>
                              <td>{line.qty}</td>
                              <td>{money(unit)}</td>
                              <td>{money(unit * line.qty)}</td>
                              {selected.status === 'draft' ? (
                                <td>
                                  <button
                                    type="button"
                                    className="btn btn--ghost btn--sm"
                                    onClick={async () => {
                                      await removeInvoiceLine(selected.id, line.id);
                                      refresh(selected.id);
                                    }}
                                  >
                                    Remover
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Botões de Ação da Nota */}
              <div className="admin-toolbar" style={{ marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                {selected.status === 'draft' ? (
                  <>
                    <button type="button" className="btn btn--primary" onClick={() => void post()}>
                      📦 Lançar no Estoque
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => void cancel()}>
                      Cancelar Rascunho
                    </button>
                  </>
                ) : null}

                {selected.status === 'posted' ? (
                  <>
                    <button type="button" className="btn btn--primary" onClick={() => transmit(false)}>
                      🚀 Transmitir NF-e (SEFAZ)
                    </button>
                    {selected.kind === 'exit' ? (
                      <button type="button" className="btn btn--ghost" onClick={() => transmit(true)}>
                        🧾 Transmitir como NFC-e
                      </button>
                    ) : null}
                  </>
                ) : null}

                {fiscalDoc ? (
                  <>
                    <button type="button" className="btn btn--ghost" onClick={handleConsultFiscalDoc}>
                      🔄 Consultar SEFAZ
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => handleOpenXml(fiscalDoc)}>
                      📄 Exibir XML da Nota
                    </button>
                    <button type="button" className="btn btn--ghost" onClick={() => previewDanfe(false)}>
                      🖨️ Visualizar DANFE
                    </button>
                    {fiscalDoc.status === 'authorized' ? (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        style={{ color: 'var(--red)' }}
                        onClick={handleCancelFiscalDoc}
                      >
                        ❌ Cancelar NF-e
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </>
          )}
        </article>
      </div>

      {/* Modal de Exibição do XML da Nota Fiscal */}
      {xmlModalDoc ? (
        <div className="fiscal-xml-backdrop" onClick={() => setXmlModalDoc(null)}>
          <div className="fiscal-xml-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fiscal-xml-header">
              <h3>XML da NF-e nº {xmlModalDoc.number} (Versão 4.00)</h3>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setXmlModalDoc(null)}
              >
                ✕ Fechar
              </button>
            </div>
            <pre className="fiscal-xml-content">
              {buildNfeXmlStub(xmlModalDoc)}
            </pre>
            <div className="fiscal-xml-footer">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => copyXmlToClipboard(buildNfeXmlStub(xmlModalDoc))}
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
