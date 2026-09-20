/**
 * Hub único do emissor fiscal.
 * Certificado, senha, CSC, ambiente e pastas (XML / LOG / PDF) valem para
 * NF-e, NFC-e, NFS-e, CT-e, MDF-e e demais documentos fiscais.
 *
 * Browser: caminhos são preferência do cliente (agente/Nest grava no disco).
 * Cloud: preferência para sincronizar no backend Marthi.
 */

const STORAGE_KEY = 'marthi.fiscal.issuer.v1';
const LOG_KEY = 'marthi.fiscal.logs.v1';

export type FiscalSefazEnvironment = 'homologacao' | 'producao';
export type FiscalStorageMode = 'local' | 'cloud' | 'both';

export type FiscalDocFamily =
  | 'nfe'
  | 'nfce'
  | 'nfse'
  | 'cte'
  | 'mdfe'
  | 'other';

export type FiscalIssuerSettings = {
  /** Razão social / nome fantasia do emitente. */
  emitenteName: string;
  cnpj: string;
  ie: string;
  /** Inscrição municipal (ISSQN / NFS-e). */
  im: string;
  /** Código IBGE do município. */
  cMun: string;
  municipio: string;
  uf: string;
  /** Nome do arquivo .pfx/.p12 carregado. */
  certificateFileName: string;
  /** Conteúdo base64 do certificado (MVP local). */
  certificateBase64: string;
  /** Senha do certificado — só local; nunca enviar a logs. */
  certificatePassword: string;
  /** CSC Id (NFC-e). */
  cscId: string;
  /** CSC Token (NFC-e). */
  cscToken: string;
  environment: FiscalSefazEnvironment;
  /** Séries padrão por família. */
  nfeSeries: string;
  nfceSeries: string;
  nfseSeries: string;
  cteSeries: string;
  mdfeSeries: string;
  /**
   * Alíquota base CBS (%) — reforma tributária / referência do emitente.
   * Usada como default em classificação e simulações.
   */
  cbsRateBase: number;
  /** Alíquota base IBS (%) — complementar ao CBS. */
  ibsRateBase: number;
  /** Alíquota padrão ISSQN (%) para NFS-e no município do emitente. */
  issqnRateDefault: number;
  /** Alíquota ISSQN retido na fonte (%), quando aplicável. */
  issqnRetainedRate: number;
  /** Código de serviço municipal padrão (além do LC 116). */
  issqnMunicipalCode: string;
  /** Onde gravar XML / LOG / PDF. */
  storageMode: FiscalStorageMode;
  /** Pasta base na máquina (ex.: C:\\Marthi\\Fiscal). */
  localRootPath: string;
  localXmlPath: string;
  localLogPath: string;
  localPdfPath: string;
  localPdvPath: string;
  /** Preferência de nuvem Marthi (Nest sincroniza depois). */
  cloudEnabled: boolean;
  cloudBucketHint: string;
  updatedAt: string;
};

export type FiscalLogEntry = {
  id: string;
  at: string;
  family: FiscalDocFamily;
  action: string;
  detail: string;
  refId?: string;
};

export const SEFAZ_ENV_LABEL: Record<FiscalSefazEnvironment, string> = {
  homologacao: 'Homologação',
  producao: 'Produção',
};

export const FISCAL_STORAGE_LABEL: Record<FiscalStorageMode, string> = {
  local: 'Somente na máquina',
  cloud: 'Somente na nuvem Marthi',
  both: 'Máquina + nuvem',
};

export const FISCAL_FAMILY_LABEL: Record<FiscalDocFamily, string> = {
  nfe: 'NF-e',
  nfce: 'NFC-e',
  nfse: 'NFS-e',
  cte: 'CT-e',
  mdfe: 'MDF-e',
  other: 'Outros',
};

const EMPTY: FiscalIssuerSettings = {
  emitenteName: '',
  cnpj: '',
  ie: '',
  im: '',
  cMun: '3304557',
  municipio: 'Rio de Janeiro',
  uf: 'RJ',
  certificateFileName: '',
  certificateBase64: '',
  certificatePassword: '',
  cscId: '',
  cscToken: '',
  environment: 'homologacao',
  nfeSeries: '1',
  nfceSeries: '1',
  nfseSeries: '1',
  cteSeries: '1',
  mdfeSeries: '1',
  cbsRateBase: 0.9,
  ibsRateBase: 0.1,
  issqnRateDefault: 5,
  issqnRetainedRate: 0,
  issqnMunicipalCode: '',
  storageMode: 'both',
  localRootPath: 'C:\\Marthi\\Fiscal',
  localXmlPath: 'C:\\Marthi\\Fiscal\\XML',
  localLogPath: 'C:\\Marthi\\Fiscal\\LOG',
  localPdfPath: 'C:\\Marthi\\Fiscal\\PDF',
  localPdvPath: 'C:\\Marthi\\Fiscal\\PDV',
  cloudEnabled: true,
  cloudBucketHint: 'marthi-fiscal',
  updatedAt: '',
};

function load(): FiscalIssuerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<FiscalIssuerSettings>;
    return { ...EMPTY, ...parsed };
  } catch {
    return { ...EMPTY };
  }
}

function save(settings: FiscalIssuerSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event('marthi-fiscal-issuer-updated'));
}

export function getFiscalIssuerSettings() {
  return load();
}

export function resolveFiscalPaths(settings = load()) {
  const root = settings.localRootPath.trim() || EMPTY.localRootPath;
  return {
    root,
    xml: settings.localXmlPath.trim() || `${root}\\XML`,
    log: settings.localLogPath.trim() || `${root}\\LOG`,
    pdf: settings.localPdfPath.trim() || `${root}\\PDF`,
    pdv: settings.localPdvPath.trim() || `${root}\\PDV`,
  };
}

export function saveFiscalIssuerSettings(
  patch: Partial<FiscalIssuerSettings>,
): { ok: true; settings: FiscalIssuerSettings } | { ok: false; error: string } {
  const current = load();
  const next: FiscalIssuerSettings = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (next.cnpj && next.cnpj.replace(/\D/g, '').length !== 14) {
    return { ok: false, error: 'CNPJ do emitente deve ter 14 dígitos.' };
  }
  if (next.cscId && !/^\d{1,6}$/.test(next.cscId.trim())) {
    return { ok: false, error: 'CSC Id deve ser numérico (até 6 dígitos).' };
  }
  for (const [label, value] of [
    ['CBS', next.cbsRateBase],
    ['IBS', next.ibsRateBase],
    ['ISSQN', next.issqnRateDefault],
    ['ISSQN retido', next.issqnRetainedRate],
  ] as const) {
    if (Number.isNaN(value) || value < 0 || value > 100) {
      return { ok: false, error: `Alíquota ${label} deve estar entre 0 e 100%.` };
    }
  }
  if (next.storageMode === 'local' || next.storageMode === 'both') {
    if (!next.localRootPath.trim()) {
      return { ok: false, error: 'Informe a pasta base na máquina (XML / LOG / PDF).' };
    }
  }
  if (next.storageMode === 'cloud' || next.storageMode === 'both') {
    next.cloudEnabled = true;
  }
  if (next.storageMode === 'local') {
    next.cloudEnabled = false;
  }

  save(next);
  return { ok: true, settings: next };
}

export function applyRootPathCascade(root: string): Partial<FiscalIssuerSettings> {
  const base = root.trim().replace(/[\\/]+$/, '') || EMPTY.localRootPath;
  return {
    localRootPath: base,
    localXmlPath: `${base}\\XML`,
    localLogPath: `${base}\\LOG`,
    localPdfPath: `${base}\\PDF`,
    localPdvPath: `${base}\\PDV`,
  };
}

export function clearCertificate(): FiscalIssuerSettings {
  const next = {
    ...load(),
    certificateFileName: '',
    certificateBase64: '',
    certificatePassword: '',
    updatedAt: new Date().toISOString(),
  };
  save(next);
  return next;
}

/** Certificado + emitente — base comum a todos os documentos fiscais. */
export function issuerIsReady(settings = load()) {
  return Boolean(
    settings.emitenteName.trim() &&
      settings.cnpj.replace(/\D/g, '').length === 14 &&
      settings.certificateFileName &&
      settings.certificatePassword,
  );
}

export function issuerIsReadyForNfe(settings = load()) {
  return issuerIsReady(settings);
}

export function issuerIsReadyForNfce(settings = load()) {
  return issuerIsReady(settings) && Boolean(settings.cscId.trim() && settings.cscToken.trim());
}

export function issuerIsReadyForNfse(settings = load()) {
  return issuerIsReady(settings);
}

export function issuerIsReadyForCte(settings = load()) {
  return issuerIsReady(settings);
}

export function issuerIsReadyForMdfe(settings = load()) {
  return issuerIsReady(settings);
}

export function readCertificateFile(file: File): Promise<{ name: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      if (!base64) {
        reject(new Error('Não foi possível ler o certificado.'));
        return;
      }
      resolve({ name: file.name, base64 });
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function loadLogs(): FiscalLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FiscalLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLogs(entries: FiscalLogEntry[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(0, 400)));
}

export function listFiscalLogs(limit = 50) {
  return loadLogs().slice(0, limit);
}

export function appendFiscalLog(input: {
  family: FiscalDocFamily;
  action: string;
  detail: string;
  refId?: string;
}) {
  const entries = loadLogs();
  const entry: FiscalLogEntry = {
    id: `LOG-${Date.now().toString(36).toUpperCase()}`,
    at: new Date().toISOString(),
    family: input.family,
    action: input.action,
    detail: input.detail,
    refId: input.refId,
  };
  entries.unshift(entry);
  saveLogs(entries);
  window.dispatchEvent(new Event('marthi-fiscal-logs-updated'));
  return entry;
}

/** Download no browser simulando gravação na pasta configurada. */
export function downloadFiscalArtifact(input: {
  folderHint: string;
  fileName: string;
  content: string;
  mime?: string;
}) {
  const blob = new Blob([input.content], { type: input.mime ?? 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return {
    ok: true as const,
    pathHint: `${input.folderHint}\\${input.fileName}`,
  };
}

export function archiveFiscalXml(input: {
  family: FiscalDocFamily;
  fileName: string;
  xml: string;
  refId?: string;
}) {
  const settings = load();
  const paths = resolveFiscalPaths(settings);
  const shouldLocal = settings.storageMode === 'local' || settings.storageMode === 'both';
  const shouldCloud = settings.storageMode === 'cloud' || settings.storageMode === 'both';

  let pathHint = '';
  if (shouldLocal) {
    const saved = downloadFiscalArtifact({
      folderHint: paths.xml,
      fileName: input.fileName,
      content: input.xml,
    });
    pathHint = saved.pathHint;
  }

  appendFiscalLog({
    family: input.family,
    action: 'arquivo.xml',
    detail: [
      shouldLocal ? `local → ${pathHint || paths.xml}` : null,
      shouldCloud ? `nuvem → ${settings.cloudBucketHint || 'marthi-fiscal'}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    refId: input.refId,
  });

  return { ok: true as const, pathHint, cloudQueued: shouldCloud };
}
