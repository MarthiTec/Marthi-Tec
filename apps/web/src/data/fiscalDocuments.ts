/**
 * Adapter fiscal (MVP).
 * NFS-e: modelo Portal Nacional (DPS → ADN).
 * NF-e/NFC-e: ciclo transmitir (gerar+enviar+consultar) com DANFE.
 * Hoje: emissão simulada. Próximo: ACBr / SEFAZ / ADN real.
 */

import {
  appendFiscalLog,
  archiveFiscalXml,
  getFiscalIssuerSettings,
  issuerIsReadyForCte,
  issuerIsReadyForMdfe,
  issuerIsReadyForNfe,
  issuerIsReadyForNfse,
  SEFAZ_ENV_LABEL,
} from './fiscalIssuerStore';

const STORAGE_KEY = 'marthi.fiscal.docs.v1';

export type FiscalDocKind = 'nfe' | 'nfce' | 'nfse' | 'cte' | 'mdfe' | 'receipt';
export type FiscalDocStatus = 'authorized' | 'pending' | 'cancelled' | 'error';
export type FiscalRefType = 'sale' | 'os' | 'invoice' | 'transport' | 'manifest';
export type NfseEnvironment = 'homologacao' | 'producao';
export type SefazEnvironment = 'homologacao' | 'producao';

/** Rastreio SEFAZ da NF-e / NFC-e. */
export type NfeSefazTrace = {
  environment: SefazEnvironment;
  protocol: string;
  receiptNumber: string;
  consultedAt?: string;
  statusCode: string;
  statusMessage: string;
  xmlDigest: string;
  /** Tipo do documento na emissão. */
  documentPurpose?: 'normal' | 'devolucao' | 'credito_reforma' | 'debito_reforma';
};

/** Campos da DPS (Declaração de Prestação de Serviços) — Portal Nacional. */
export type NfsePortalDps = {
  environment: NfseEnvironment;
  /** Identificador da DPS no prestador. */
  dpsId: string;
  /** Código IBGE do município de emissão. */
  cLocEmi: string;
  municipioEmissao: string;
  /** Código de Tributação Nacional (cTribNac). */
  cTribNac: string;
  /** Código de Tributação Municipal (cTribMun), quando houver. */
  cTribMun: string;
  /** Descrição do serviço (xDescServ). */
  xDescServ: string;
  vServ: number;
  /** Alíquota ISS (%). */
  aliqIss: number;
  vIss: number;
  /** Código LC 116 / lista de serviços. */
  itemLc116: string;
  tomadorDocument: string;
  tomadorName: string;
  /** Protocolo ADN (Ambiente de Dados Nacional). */
  protocoloAdn: string;
};

export type FiscalDocument = {
  id: string;
  kind: FiscalDocKind;
  status: FiscalDocStatus;
  refType: FiscalRefType;
  refId: string;
  customerName: string;
  customerDocument?: string;
  amount: number;
  number: string;
  series: string;
  accessKey: string;
  provider: 'mock' | 'portal_nacional' | 'sefaz_mock';
  createdAt: string;
  message: string;
  nfse?: NfsePortalDps;
  nfe?: NfeSefazTrace;
  /** Itens para DANFE. */
  items?: { name: string; qty: number; unitPrice: number }[];
};

type State = { documents: FiscalDocument[] };

export const FISCAL_KIND_LABEL: Record<FiscalDocKind, string> = {
  nfe: 'NF-e',
  nfce: 'NFC-e',
  nfse: 'NFS-e',
  cte: 'CT-e',
  mdfe: 'MDF-e',
  receipt: 'Notinha',
};

export const NFSE_ENV_LABEL: Record<NfseEnvironment, string> = {
  homologacao: 'Homologação (Portal Nacional)',
  producao: 'Produção (Portal Nacional)',
};

/** Catálogo curto de serviços típicos de assistência técnica (LC 116). */
export const NFSE_SERVICE_OPTIONS = [
  {
    itemLc116: '14.01',
    cTribNac: '140101',
    label: '14.01 — Lubrificação, limpeza, manutenção e reparo de máquinas/equipamentos',
  },
  {
    itemLc116: '14.02',
    cTribNac: '140201',
    label: '14.02 — Assistência técnica / instalação / montagem',
  },
  {
    itemLc116: '17.01',
    cTribNac: '170101',
    label: '17.01 — Assessoria / consultoria técnica',
  },
  {
    itemLc116: '10.02',
    cTribNac: '100201',
    label: '10.02 — Agenciamento / intermediação',
  },
] as const;

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { documents: [] };
    const parsed = JSON.parse(raw) as Partial<State>;
    return { documents: Array.isArray(parsed.documents) ? parsed.documents : [] };
  } catch {
    return { documents: [] };
  }
}

function save(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-fiscal-docs-updated'));
}

function fakeAccessKey(digits = 50) {
  let key = '';
  for (let i = 0; i < digits; i += 1) key += String(Math.floor(Math.random() * 10));
  return key;
}

function fakeProtocoloAdn() {
  return `ADN${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
}

export function listFiscalDocuments() {
  return load().documents;
}

export function getFiscalDocument(id: string) {
  return load().documents.find((item) => item.id === id) ?? null;
}

export function getFiscalDocumentForRef(refType: FiscalRefType, refId: string) {
  return (
    load().documents.find(
      (item) => item.refType === refType && item.refId === refId && item.status === 'authorized',
    ) ?? null
  );
}

/** Último documento fiscal do pedido (qualquer status). */
export function getLatestFiscalDocumentForRef(refType: FiscalRefType, refId: string) {
  return (
    load().documents.find((item) => item.refType === refType && item.refId === refId) ?? null
  );
}

export const FISCAL_STATUS_LABEL: Record<FiscalDocStatus, string> = {
  authorized: 'Autorizada SEFAZ / ADN',
  pending: 'Pendente ADN',
  cancelled: 'Cancelada',
  error: 'Rejeitada',
};

export function cancelFiscalDocumentForSale(
  orderId: string,
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  const state = load();
  const document = state.documents.find(
    (item) => item.refType === 'sale' && item.refId === orderId && item.status === 'authorized',
  );
  if (!document) return { ok: false, error: 'Nenhum documento autorizado para cancelar.' };
  document.status = 'cancelled';
  document.message = `Cancelamento simulado · ${document.message}`;
  save(state);
  return { ok: true, document };
}

export function reprintFiscalDocument(
  orderId: string,
): { ok: true; document: FiscalDocument; text: string } | { ok: false; error: string } {
  const document = getLatestFiscalDocumentForRef('sale', orderId);
  if (!document) return { ok: false, error: 'Nada para reimprimir neste pedido.' };
  const text = [
    `${FISCAL_KIND_LABEL[document.kind]} ${document.number}/${document.series}`,
    `Status: ${FISCAL_STATUS_LABEL[document.status]}`,
    `Cliente: ${document.customerName}`,
    `Valor: ${document.amount.toFixed(2)}`,
    document.accessKey ? `Chave: ${document.accessKey}` : '',
    document.message,
  ]
    .filter(Boolean)
    .join('\n');
  return { ok: true, document, text };
}

export function emitNfeFromSale(input: {
  orderId: string;
  customerName: string;
  amount: number;
  asNfce?: boolean;
  customerDocument?: string;
}): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  if (!input.orderId) return { ok: false, error: 'Pedido inválido.' };
  if (input.amount <= 0) return { ok: false, error: 'Valor deve ser maior que zero.' };

  const existing = getFiscalDocumentForRef('sale', input.orderId);
  if (existing) return { ok: false, error: `Já existe ${FISCAL_KIND_LABEL[existing.kind]} para este pedido.` };

  const kind: FiscalDocKind = input.asNfce ? 'nfce' : 'nfe';
  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind,
    status: 'authorized',
    refType: 'sale',
    refId: input.orderId,
    customerName: input.customerName || 'Consumidor Final',
    customerDocument: input.customerDocument || '',
    amount: input.amount,
    number: String(1000 + state.documents.length + 1),
    series: '1',
    accessKey: fakeAccessKey(44),
    provider: 'mock',
    createdAt: new Date().toISOString(),
    message: `${FISCAL_KIND_LABEL[kind]} simulada (homologação local). Integrar ACBr API / SEFAZ em produção.`,
  };
  state.documents.unshift(document);
  save(state);
  return { ok: true, document };
}

/** Emite NFC-e se o plano tem Emissor Fiscal; senão, notinha de venda. */
export function emitSaleCheckoutDocument(input: {
  orderId: string;
  customerName: string;
  amount: number;
  customerDocument?: string;
  fiscalIntegrated: boolean;
}): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  if (input.fiscalIntegrated) {
    return emitNfeFromSale({
      orderId: input.orderId,
      customerName: input.customerName,
      amount: input.amount,
      asNfce: true,
      customerDocument: input.customerDocument,
    });
  }

  if (!input.orderId) return { ok: false, error: 'Pedido inválido.' };
  if (input.amount <= 0) return { ok: false, error: 'Valor deve ser maior que zero.' };

  const existing = getFiscalDocumentForRef('sale', input.orderId);
  if (existing) return { ok: false, error: `Já existe ${FISCAL_KIND_LABEL[existing.kind]} para este pedido.` };

  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind: 'receipt',
    status: 'authorized',
    refType: 'sale',
    refId: input.orderId,
    customerName: input.customerName || 'Consumidor Final',
    customerDocument: input.customerDocument || '',
    amount: input.amount,
    number: String(5000 + state.documents.length + 1),
    series: 'NV',
    accessKey: `NV${Date.now()}`,
    provider: 'mock',
    createdAt: new Date().toISOString(),
    message: 'Notinha de venda (sem emissor fiscal). Ative o módulo Emissor Fiscal para NFC-e.',
  };
  state.documents.unshift(document);
  save(state);
  return { ok: true, document };
}

export type EmitNfsePortalInput = {
  workOrderId: string;
  customerName: string;
  customerDocument?: string;
  amount: number;
  serviceDescription: string;
  itemLc116?: string;
  cTribNac?: string;
  cTribMun?: string;
  cLocEmi?: string;
  municipioEmissao?: string;
  aliqIss?: number;
  environment?: NfseEnvironment;
};

/**
 * Emite NFS-e no modelo Portal Nacional (gera DPS e simula autorização ADN).
 */
export function emitNfseFromOs(
  input: EmitNfsePortalInput,
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  if (!input.workOrderId) return { ok: false, error: 'OS inválida.' };
  if (input.amount <= 0) return { ok: false, error: 'Valor do serviço deve ser maior que zero.' };
  if (!input.serviceDescription.trim()) {
    return { ok: false, error: 'Informe a descrição do serviço (xDescServ).' };
  }

  const existing = getFiscalDocumentForRef('os', input.workOrderId);
  if (existing) return { ok: false, error: 'Já existe NFS-e para esta OS.' };

  const issuer = getFiscalIssuerSettings();
  const service =
    NFSE_SERVICE_OPTIONS.find((item) => item.itemLc116 === input.itemLc116) ??
    NFSE_SERVICE_OPTIONS[0];
  const aliqIss = input.aliqIss ?? issuer.issqnRateDefault ?? 5;
  const vIss = Math.round(input.amount * (aliqIss / 100) * 100) / 100;
  const environment = input.environment ?? issuer.environment;
  const dpsId = `DPS${Date.now().toString(36).toUpperCase()}`;

  const nfse: NfsePortalDps = {
    environment,
    dpsId,
    cLocEmi: input.cLocEmi?.trim() || issuer.cMun || '3304557',
    municipioEmissao:
      input.municipioEmissao?.trim() ||
      `${issuer.municipio || 'Rio de Janeiro'} - ${issuer.uf || 'RJ'}`,
    cTribNac: input.cTribNac?.trim() || service.cTribNac,
    cTribMun: input.cTribMun?.trim() || '',
    xDescServ: input.serviceDescription.trim(),
    vServ: input.amount,
    aliqIss,
    vIss,
    itemLc116: input.itemLc116?.trim() || service.itemLc116,
    tomadorDocument: (input.customerDocument ?? '').replace(/\D/g, ''),
    tomadorName: input.customerName || 'Tomador',
    protocoloAdn: fakeProtocoloAdn(),
  };

  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind: 'nfse',
    status: 'authorized',
    refType: 'os',
    refId: input.workOrderId,
    customerName: nfse.tomadorName,
    customerDocument: nfse.tomadorDocument,
    amount: input.amount,
    number: String(2000 + state.documents.length + 1),
    series: issuer.nfseSeries || '1',
    accessKey: fakeAccessKey(50),
    provider: 'portal_nacional',
    createdAt: new Date().toISOString(),
    message: `NFS-e Portal Nacional · DPS ${dpsId} autorizada no ADN (${NFSE_ENV_LABEL[environment]}). Trocar mock por ADN real em produção.`,
    nfse,
  };
  state.documents.unshift(document);
  save(state);

  const xml = buildNfseXmlStub(document);
  archiveFiscalXml({
    family: 'nfse',
    fileName: `NFSe-${document.number}-${document.accessKey.slice(0, 8)}.xml`,
    xml,
    refId: input.workOrderId,
  });
  appendFiscalLog({
    family: 'nfse',
    action: 'transmitir',
    detail: `${document.number}/${document.series} · DPS ${dpsId} · ${NFSE_ENV_LABEL[environment]}`,
    refId: input.workOrderId,
  });

  return { ok: true, document };
}

export function formatNfsePortalSummary(document: FiscalDocument) {
  if (document.kind !== 'nfse' || !document.nfse) {
    return `${FISCAL_KIND_LABEL[document.kind]} ${document.number}`;
  }
  const dps = document.nfse;
  return [
    `NFS-e ${document.number}/${document.series} · ${FISCAL_STATUS_LABEL[document.status]}`,
    `Ambiente: ${NFSE_ENV_LABEL[dps.environment]}`,
    `DPS: ${dps.dpsId}`,
    `Protocolo ADN: ${dps.protocoloAdn}`,
    `Chave: ${document.accessKey}`,
    `cLocEmi: ${dps.cLocEmi} (${dps.municipioEmissao})`,
    `LC 116: ${dps.itemLc116} · cTribNac: ${dps.cTribNac}${dps.cTribMun ? ` · cTribMun: ${dps.cTribMun}` : ''}`,
    `Tomador: ${dps.tomadorName}${dps.tomadorDocument ? ` · ${dps.tomadorDocument}` : ''}`,
    `Serviço: ${dps.xDescServ}`,
    `vServ ${dps.vServ.toFixed(2)} · ISS ${dps.aliqIss}% = ${dps.vIss.toFixed(2)}`,
  ].join('\n');
}

function protocolNumber() {
  return `${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 90 + 10)}`;
}

function xmlDigest() {
  return Array.from({ length: 28 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  )
    .join('')
    .toUpperCase();
}

export type TransmitNfeInvoiceInput = {
  invoiceId: string;
  kind: 'entry' | 'exit';
  customerName: string;
  customerDocument?: string;
  amount: number;
  items: { name: string; qty: number; unitPrice: number }[];
  /** NFC-e só faz sentido em saída ao consumidor; entrada usa NF-e. */
  asNfce?: boolean;
  documentPurpose?: 'normal' | 'devolucao' | 'credito_reforma' | 'debito_reforma';
};

/**
 * Transmitir = gerar XML → enviar SEFAZ → consultar recibo (autorização).
 * MVP: simula o ciclo completo com status intermediário.
 */
export function transmitNfeForInvoice(
  input: TransmitNfeInvoiceInput,
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  const issuer = getFiscalIssuerSettings();
  if (!issuerIsReadyForNfe(issuer)) {
    return {
      ok: false,
      error: 'Cadastre certificado digital, senha e dados do emitente em Configuração fiscal.',
    };
  }
  if (input.asNfce && (!issuer.cscId.trim() || !issuer.cscToken.trim())) {
    return { ok: false, error: 'NFC-e exige CSC Id e CSC Token na configuração fiscal.' };
  }
  if (!input.invoiceId) return { ok: false, error: 'Nota inválida.' };
  if (input.amount <= 0) return { ok: false, error: 'Valor da nota deve ser maior que zero.' };
  if (input.items.length === 0) return { ok: false, error: 'Inclua itens antes de transmitir.' };

  const existing = getFiscalDocumentForRef('invoice', input.invoiceId);
  if (existing && existing.status === 'authorized') {
    return { ok: false, error: `Já existe ${FISCAL_KIND_LABEL[existing.kind]} autorizada para esta nota.` };
  }
  if (existing && existing.status === 'pending') {
    return consultNfeStatus(existing.id);
  }

  const kind: FiscalDocKind = input.asNfce ? 'nfce' : 'nfe';
  const series = input.asNfce ? issuer.nfceSeries || '1' : issuer.nfeSeries || '1';
  const receipt = protocolNumber();
  const purpose = input.documentPurpose ?? 'normal';
  const purposeLabel =
    purpose === 'devolucao'
      ? 'Devolução'
      : purpose === 'credito_reforma'
        ? 'Crédito reforma'
        : purpose === 'debito_reforma'
          ? 'Débito reforma'
          : 'Normal';
  const state = load();

  const document: FiscalDocument = {
    id: uid('DFE'),
    kind,
    status: 'authorized',
    refType: 'invoice',
    refId: input.invoiceId,
    customerName: input.customerName || (input.kind === 'entry' ? 'Fornecedor' : 'Destinatário'),
    customerDocument: input.customerDocument || '',
    amount: input.amount,
    number: String(3000 + state.documents.length + 1),
    series,
    accessKey: fakeAccessKey(44),
    provider: 'sefaz_mock',
    createdAt: new Date().toISOString(),
    message: `${FISCAL_KIND_LABEL[kind]} ${purposeLabel} · ambiente ${SEFAZ_ENV_LABEL[issuer.environment]} · protocolo ${receipt}`,
    items: input.items,
    nfe: {
      environment: issuer.environment,
      protocol: receipt,
      receiptNumber: `REC${receipt.slice(0, 8)}`,
      consultedAt: new Date().toISOString(),
      statusCode: '100',
      statusMessage: 'Autorizado o uso da NF-e',
      xmlDigest: xmlDigest(),
      documentPurpose: purpose,
    },
  };

  // Remove rascunho pendente anterior da mesma nota, se houver.
  state.documents = state.documents.filter(
    (item) => !(item.refType === 'invoice' && item.refId === input.invoiceId && item.status === 'pending'),
  );
  state.documents.unshift(document);
  save(state);

  const family = kind === 'nfce' ? 'nfce' : 'nfe';
  archiveFiscalXml({
    family,
    fileName: `${kind.toUpperCase()}-${document.number}-${document.accessKey.slice(0, 8)}.xml`,
    xml: buildNfeXmlStub(document),
    refId: input.invoiceId,
  });
  appendFiscalLog({
    family,
    action: 'transmitir',
    detail: `${document.number}/${document.series} · prot. ${receipt} · ${SEFAZ_ENV_LABEL[issuer.environment]}`,
    refId: input.invoiceId,
  });

  return { ok: true, document };
}

/** Consulta status na SEFAZ (recibo / protocolo). */
export function consultNfeStatus(
  documentId: string,
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  const state = load();
  const document = state.documents.find((item) => item.id === documentId);
  if (!document) return { ok: false, error: 'Documento fiscal não encontrado.' };
  if (document.kind !== 'nfe' && document.kind !== 'nfce') {
    return { ok: false, error: 'Consulta SEFAZ disponível apenas para NF-e / NFC-e.' };
  }
  if (document.status === 'cancelled') {
    return { ok: false, error: 'Documento já cancelado.' };
  }

  const issuer = getFiscalIssuerSettings();
  const nowIso = new Date().toISOString();
  if (document.status === 'pending') {
    document.status = 'authorized';
    document.message = `${FISCAL_KIND_LABEL[document.kind]} autorizada após consulta do recibo.`;
  }
  document.nfe = {
    environment: document.nfe?.environment ?? issuer.environment,
    protocol: document.nfe?.protocol || protocolNumber(),
    receiptNumber: document.nfe?.receiptNumber || `REC${Date.now().toString().slice(-8)}`,
    consultedAt: nowIso,
    statusCode: document.status === 'authorized' ? '100' : document.nfe?.statusCode || '105',
    statusMessage:
      document.status === 'authorized'
        ? 'Autorizado o uso da NF-e'
        : document.nfe?.statusMessage || 'Lote em processamento',
    xmlDigest: document.nfe?.xmlDigest || xmlDigest(),
  };
  save(state);
  appendFiscalLog({
    family: document.kind === 'nfce' ? 'nfce' : 'nfe',
    action: 'consultar',
    detail: `${document.nfe?.statusCode} — ${document.nfe?.statusMessage}`,
    refId: document.refId,
  });
  return { ok: true, document };
}

export function cancelNfeDocument(
  documentId: string,
  justification = 'Cancelamento solicitado pelo emitente',
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  const state = load();
  const document = state.documents.find((item) => item.id === documentId);
  if (!document) return { ok: false, error: 'Documento fiscal não encontrado.' };
  if (document.kind !== 'nfe' && document.kind !== 'nfce') {
    return { ok: false, error: 'Cancelamento SEFAZ disponível apenas para NF-e / NFC-e.' };
  }
  if (document.status === 'cancelled') return { ok: false, error: 'Documento já cancelado.' };
  if (document.status !== 'authorized') {
    return { ok: false, error: 'Só é possível cancelar NF-e autorizada.' };
  }
  if (justification.trim().length < 15) {
    return { ok: false, error: 'Justificativa de cancelamento deve ter ao menos 15 caracteres.' };
  }

  document.status = 'cancelled';
  document.message = `Cancelada · ${justification.trim()}`;
  if (document.nfe) {
    document.nfe = {
      ...document.nfe,
      statusCode: '101',
      statusMessage: 'Cancelamento de NF-e homologado',
      consultedAt: new Date().toISOString(),
    };
  }
  save(state);
  appendFiscalLog({
    family: document.kind === 'nfce' ? 'nfce' : 'nfe',
    action: 'cancelar',
    detail: justification.trim(),
    refId: document.refId,
  });
  return { ok: true, document };
}

export function buildDanfeHtml(document: FiscalDocument) {
  const issuer = getFiscalIssuerSettings();
  const items = document.items?.length
    ? document.items
    : [{ name: 'Mercadoria / serviço', qty: 1, unitPrice: document.amount }];
  const envLabel = document.nfe
    ? SEFAZ_ENV_LABEL[document.nfe.environment]
    : SEFAZ_ENV_LABEL[issuer.environment];
  const rows = items
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.qty}</td>
        <td>${item.unitPrice.toFixed(2)}</td>
        <td>${(item.qty * item.unitPrice).toFixed(2)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>DANFE ${document.number}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .box { border: 1px solid #222; padding: 10px; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #333; padding: 6px; text-align: left; }
    th { background: #f0f0f0; }
    .muted { color: #555; font-size: 12px; }
    .key { word-break: break-all; font-family: ui-monospace, monospace; font-size: 12px; }
    @media print { body { margin: 8mm; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print muted" style="margin-bottom:12px">Pré-visualização DANFE · ${FISCAL_KIND_LABEL[document.kind]}</div>
  <div class="box grid">
    <div>
      <h1>DANFE — Documento Auxiliar da ${FISCAL_KIND_LABEL[document.kind]}</h1>
      <div class="muted">${envLabel} · Status: ${FISCAL_STATUS_LABEL[document.status]}</div>
      <p><strong>${escapeHtml(issuer.emitenteName || 'Emitente')}</strong><br/>
      CNPJ ${escapeHtml(issuer.cnpj || '—')} · IE ${escapeHtml(issuer.ie || '—')}<br/>
      ${escapeHtml(issuer.municipio || '')}/${escapeHtml(issuer.uf || '')}</p>
    </div>
    <div>
      <p><strong>Nº ${document.number}</strong> · Série ${document.series}</p>
      <p class="muted">Protocolo: ${escapeHtml(document.nfe?.protocol || '—')}</p>
      <p class="key">Chave de acesso<br/>${document.accessKey}</p>
    </div>
  </div>
  <div class="box">
    <strong>Destinatário / Remetente</strong>
    <p>${escapeHtml(document.customerName)}${
      document.customerDocument ? ` · ${escapeHtml(document.customerDocument)}` : ''
    }</p>
  </div>
  <div class="box">
    <table>
      <thead>
        <tr><th>#</th><th>Descrição</th><th>Qtd</th><th>V. Unit</th><th>Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;margin:10px 0 0"><strong>Total R$ ${document.amount.toFixed(2)}</strong></p>
  </div>
  <p class="muted">${escapeHtml(document.message)}</p>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildNfeXmlStub(document: FiscalDocument) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe${document.accessKey}">
      <ide>
        <nNF>${document.number}</nNF>
        <serie>${document.series}</serie>
        <tpAmb>${document.nfe?.environment === 'producao' ? '1' : '2'}</tpAmb>
      </ide>
      <dest>
        <xNome>${escapeHtml(document.customerName)}</xNome>
      </dest>
      <total><vNF>${document.amount.toFixed(2)}</vNF></total>
    </infNFe>
  </NFe>
  <protNFe>
    <nProt>${document.nfe?.protocol ?? ''}</nProt>
    <cStat>${document.nfe?.statusCode ?? ''}</cStat>
    <xMotivo>${escapeHtml(document.nfe?.statusMessage ?? '')}</xMotivo>
  </protNFe>
</nfeProc>
`;
}

function buildNfseXmlStub(document: FiscalDocument) {
  const dps = document.nfse;
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe>
  <infNFSe>
    <numero>${document.number}</numero>
    <serie>${document.series}</serie>
    <chaveAcesso>${document.accessKey}</chaveAcesso>
    <DPS id="${dps?.dpsId ?? ''}">
      <cLocEmi>${dps?.cLocEmi ?? ''}</cLocEmi>
      <cTribNac>${dps?.cTribNac ?? ''}</cTribNac>
      <xDescServ>${escapeHtml(dps?.xDescServ ?? '')}</xDescServ>
      <vServ>${(dps?.vServ ?? document.amount).toFixed(2)}</vServ>
    </DPS>
    <protocoloAdn>${dps?.protocoloAdn ?? ''}</protocoloAdn>
  </infNFSe>
</NFSe>
`;
}

export function openDanfePreview(document: FiscalDocument, print = false) {
  const html = buildDanfeHtml(document);
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700');
  if (!popup) return { ok: false as const, error: 'Pop-up bloqueado. Permita janelas para ver o DANFE.' };
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  if (print) {
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }
  return { ok: true as const };
}

export type EmitNfseStandaloneInput = {
  customerName: string;
  customerDocument?: string;
  amount: number;
  itemLc116?: string;
  cTribNac?: string;
  xDescServ: string;
  aliqIss?: number;
};

/** NFS-e avulsa (sem OS) — mesma DPS / ADN mock. */
export function emitNfseStandalone(
  input: EmitNfseStandaloneInput,
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  if (!input.customerName.trim()) return { ok: false, error: 'Informe o tomador.' };
  if (input.amount <= 0) return { ok: false, error: 'Valor do serviço deve ser maior que zero.' };
  if (!input.xDescServ.trim()) return { ok: false, error: 'Informe a descrição do serviço.' };

  const issuer = getFiscalIssuerSettings();
  if (!issuerIsReadyForNfse(issuer)) {
    return { ok: false, error: 'Cadastre certificado e dados do emitente em Configuração fiscal.' };
  }

  const service =
    NFSE_SERVICE_OPTIONS.find((item) => item.itemLc116 === input.itemLc116) ?? NFSE_SERVICE_OPTIONS[0];
  const aliqIss = input.aliqIss ?? issuer.issqnRateDefault ?? 5;
  const vIss = Math.round(input.amount * (aliqIss / 100) * 100) / 100;
  const dpsId = `DPS${Date.now().toString(36).toUpperCase()}`;
  const refId = uid('NFSE');

  const nfse: NfsePortalDps = {
    environment: issuer.environment,
    dpsId,
    cLocEmi: issuer.cMun || '3304557',
    municipioEmissao: `${issuer.municipio || 'Rio de Janeiro'} - ${issuer.uf || 'RJ'}`,
    cTribNac: input.cTribNac?.trim() || service.cTribNac,
    cTribMun: '',
    xDescServ: input.xDescServ.trim(),
    vServ: input.amount,
    aliqIss,
    vIss,
    itemLc116: input.itemLc116?.trim() || service.itemLc116,
    tomadorDocument: (input.customerDocument ?? '').replace(/\D/g, ''),
    tomadorName: input.customerName.trim(),
    protocoloAdn: fakeProtocoloAdn(),
  };

  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind: 'nfse',
    status: 'authorized',
    refType: 'os',
    refId,
    customerName: nfse.tomadorName,
    customerDocument: nfse.tomadorDocument,
    amount: input.amount,
    number: String(2000 + state.documents.length + 1),
    series: issuer.nfseSeries || '1',
    accessKey: fakeAccessKey(50),
    provider: 'portal_nacional',
    createdAt: new Date().toISOString(),
    message: `NFS-e avulsa · DPS ${dpsId} · ${NFSE_ENV_LABEL[issuer.environment]}`,
    nfse,
  };
  state.documents.unshift(document);
  save(state);
  archiveFiscalXml({
    family: 'nfse',
    fileName: `NFSe-${document.number}-${document.accessKey.slice(0, 8)}.xml`,
    xml: buildNfseXmlStub(document),
    refId,
  });
  appendFiscalLog({
    family: 'nfse',
    action: 'transmitir',
    detail: `${document.number}/${document.series} · avulsa · DPS ${dpsId}`,
    refId,
  });
  return { ok: true, document };
}

export type EmitCteInput = {
  shipperName: string;
  consigneeName: string;
  originCity: string;
  destinationCity: string;
  amount: number;
  cargoDesc: string;
};

export function emitCteDocument(
  input: EmitCteInput,
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  const issuer = getFiscalIssuerSettings();
  if (!issuerIsReadyForCte(issuer)) {
    return { ok: false, error: 'Cadastre certificado e dados do emitente em Configuração fiscal.' };
  }
  if (!input.shipperName.trim() || !input.consigneeName.trim()) {
    return { ok: false, error: 'Informe remetente e destinatário.' };
  }
  if (input.amount <= 0) return { ok: false, error: 'Valor do frete deve ser maior que zero.' };

  const refId = uid('CTE');
  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind: 'cte',
    status: 'authorized',
    refType: 'transport',
    refId,
    customerName: `${input.shipperName.trim()} → ${input.consigneeName.trim()}`,
    amount: input.amount,
    number: String(3000 + state.documents.length + 1),
    series: issuer.cteSeries || '1',
    accessKey: fakeAccessKey(44),
    provider: 'sefaz_mock',
    createdAt: new Date().toISOString(),
    message: `CT-e ${input.originCity} → ${input.destinationCity} · ${input.cargoDesc} · ${SEFAZ_ENV_LABEL[issuer.environment]}`,
    nfe: {
      environment: issuer.environment,
      protocol: protocolNumber(),
      receiptNumber: protocolNumber(),
      statusCode: '100',
      statusMessage: 'Autorizado o uso do CT-e',
      xmlDigest: xmlDigest(),
    },
  };
  state.documents.unshift(document);
  save(state);
  appendFiscalLog({
    family: 'cte',
    action: 'transmitir',
    detail: `${document.number}/${document.series} · ${document.customerName}`,
    refId,
  });
  return { ok: true, document };
}

export type EmitMdfeInput = {
  driverName: string;
  vehiclePlate: string;
  ufStart: string;
  ufEnd: string;
  linkedDocs: string[];
};

export function emitMdfeDocument(
  input: EmitMdfeInput,
): { ok: true; document: FiscalDocument } | { ok: false; error: string } {
  const issuer = getFiscalIssuerSettings();
  if (!issuerIsReadyForMdfe(issuer)) {
    return { ok: false, error: 'Cadastre certificado e dados do emitente em Configuração fiscal.' };
  }
  if (!input.driverName.trim()) return { ok: false, error: 'Informe o condutor.' };
  if (!input.vehiclePlate.trim()) return { ok: false, error: 'Informe a placa.' };
  if (input.ufStart.length !== 2 || input.ufEnd.length !== 2) {
    return { ok: false, error: 'Informe UF início e fim com 2 letras.' };
  }

  const refId = uid('MDFE');
  const linked = input.linkedDocs.length > 0 ? input.linkedDocs.join(', ') : 'sem docs vinculados';
  const state = load();
  const document: FiscalDocument = {
    id: uid('DFE'),
    kind: 'mdfe',
    status: 'authorized',
    refType: 'manifest',
    refId,
    customerName: `${input.driverName.trim()} · ${input.vehiclePlate.trim().toUpperCase()}`,
    amount: 0,
    number: String(4000 + state.documents.length + 1),
    series: issuer.mdfeSeries || '1',
    accessKey: fakeAccessKey(44),
    provider: 'sefaz_mock',
    createdAt: new Date().toISOString(),
    message: `MDF-e ${input.ufStart}→${input.ufEnd} · docs: ${linked} · ${SEFAZ_ENV_LABEL[issuer.environment]}`,
    nfe: {
      environment: issuer.environment,
      protocol: protocolNumber(),
      receiptNumber: protocolNumber(),
      statusCode: '100',
      statusMessage: 'Autorizado o uso do MDF-e',
      xmlDigest: xmlDigest(),
    },
  };
  state.documents.unshift(document);
  save(state);
  appendFiscalLog({
    family: 'mdfe',
    action: 'transmitir',
    detail: `${document.number}/${document.series} · ${document.customerName}`,
    refId,
  });
  return { ok: true, document };
}
