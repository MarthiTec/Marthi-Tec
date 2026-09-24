/** Configuração de arquivos bancários, remessa/retorno CNAB e conciliação (MVP local). */

const STORAGE_KEY = 'marthi.finance.bank-files.v1';
export const BANK_FILES_EVENT = 'marthi-bank-files';

export type CnabLayout = '240' | '400';

export type BankFileConfig = {
  /** Pasta lógica onde a remessa é “salva” (nome de pasta local / caminho sugerido). */
  remessaFolder: string;
  retornoFolder: string;
  conciliationFolder: string;
  defaultBankAccountId: string;
  convenio: string;
  carteira: string;
  cedenteName: string;
  cedenteDocument: string;
  cnabLayout: CnabLayout;
  nextNossoNumero: number;
  autoMatchToleranceCents: number;
  updatedAt: string;
};

export type RemessaStatus = 'draft' | 'generated' | 'sent' | 'cancelled';

export type RemessaBatch = {
  id: string;
  bankAccountId: string;
  layout: CnabLayout;
  status: RemessaStatus;
  boletoIds: string[];
  fileName: string;
  folderPath: string;
  lineCount: number;
  totalAmount: number;
  contentPreview: string;
  createdAt: string;
  generatedAt?: string;
};

export type RetornoStatus = 'imported' | 'processed' | 'error';

export type RetornoItem = {
  nossoNumero: string;
  boletoId?: string;
  amount: number;
  paidAt: string;
  occurrence: string;
  matched: boolean;
};

export type RetornoBatch = {
  id: string;
  bankAccountId: string;
  status: RetornoStatus;
  fileName: string;
  folderPath: string;
  rawPreview: string;
  items: RetornoItem[];
  paidCount: number;
  unmatchedCount: number;
  createdAt: string;
  processedAt?: string;
  notes: string;
};

export type ConciliationStatus = 'pending' | 'matched' | 'ignored' | 'manual';

export type ConciliationRow = {
  id: string;
  bankAccountId: string;
  statementDate: string;
  description: string;
  amount: number;
  /** in = crédito no extrato bancário; out = débito */
  direction: 'in' | 'out';
  status: ConciliationStatus;
  matchedFinanceId?: string;
  matchedBoletoId?: string;
  matchedReceivableId?: string;
  notes: string;
  createdAt: string;
};

type StoreState = {
  config: BankFileConfig;
  remessas: RemessaBatch[];
  retornos: RetornoBatch[];
  conciliation: ConciliationRow[];
};

export const CNAB_LAYOUT_LABEL: Record<CnabLayout, string> = {
  '240': 'CNAB 240',
  '400': 'CNAB 400',
};

export const REMESSA_STATUS_LABEL: Record<RemessaStatus, string> = {
  draft: 'Rascunho',
  generated: 'Gerada',
  sent: 'Enviada ao banco',
  cancelled: 'Cancelada',
};

export const RETORNO_STATUS_LABEL: Record<RetornoStatus, string> = {
  imported: 'Importado',
  processed: 'Processado',
  error: 'Com erro',
};

export const CONCILIATION_STATUS_LABEL: Record<ConciliationStatus, string> = {
  pending: 'Pendente',
  matched: 'Conciliado',
  ignored: 'Ignorado',
  manual: 'Manual',
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

function emit() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BANK_FILES_EVENT));
  }
}

function defaultConfig(): BankFileConfig {
  return {
    remessaFolder: 'Financeiro/Remessas',
    retornoFolder: 'Financeiro/Retornos',
    conciliationFolder: 'Financeiro/Extratos',
    defaultBankAccountId: '',
    convenio: '',
    carteira: '17',
    cedenteName: '',
    cedenteDocument: '',
    cnabLayout: '240',
    nextNossoNumero: 1,
    autoMatchToleranceCents: 5,
    updatedAt: now(),
  };
}

function seedConciliation(): ConciliationRow[] {
  const today = now().slice(0, 10);
  return [
    {
      id: uid('CON'),
      bankAccountId: '',
      statementDate: today,
      description: 'PIX RECEBIDO LOJA EXEMPLO',
      amount: 289,
      direction: 'in',
      status: 'pending',
      notes: 'Sugestão automática a partir do extrato bancário (demo).',
      createdAt: now(),
    },
    {
      id: uid('CON'),
      bankAccountId: '',
      statementDate: today,
      description: 'TARIFA BOLETO BANCO',
      amount: 2.5,
      direction: 'out',
      status: 'pending',
      notes: '',
      createdAt: now(),
    },
  ];
}

function seed(): StoreState {
  return {
    config: defaultConfig(),
    remessas: [],
    retornos: [],
    conciliation: seedConciliation(),
  };
}

function load(): StoreState {
  if (typeof window === 'undefined') return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = seed();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<StoreState>;
    return {
      config: { ...defaultConfig(), ...parsed.config },
      remessas: parsed.remessas ?? [],
      retornos: parsed.retornos ?? [],
      conciliation: parsed.conciliation ?? [],
    };
  } catch {
    return seed();
  }
}

function save(state: StoreState) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  emit();
}

export function getBankFileConfig() {
  return load().config;
}

export function saveBankFileConfig(patch: Partial<BankFileConfig>) {
  const state = load();
  state.config = {
    ...state.config,
    ...patch,
    updatedAt: now(),
  };
  save(state);
  return state.config;
}

export function listRemessas() {
  return [...load().remessas].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listRetornos() {
  return [...load().retornos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listConciliation(status?: ConciliationStatus) {
  const rows = [...load().conciliation].sort((a, b) =>
    b.statementDate.localeCompare(a.statementDate),
  );
  return status ? rows.filter((row) => row.status === status) : rows;
}

export function conciliationSnapshot() {
  const rows = listConciliation();
  const pending = rows.filter((row) => row.status === 'pending');
  return {
    total: rows.length,
    pending: pending.length,
    pendingIn: pending.filter((row) => row.direction === 'in').reduce((s, r) => s + r.amount, 0),
    pendingOut: pending.filter((row) => row.direction === 'out').reduce((s, r) => s + r.amount, 0),
    matched: rows.filter((row) => row.status === 'matched').length,
  };
}

function buildCnabPreview(input: {
  layout: CnabLayout;
  convenio: string;
  carteira: string;
  cedenteName: string;
  boletos: Array<{ id: string; nossoNumero: string; amount: number; dueDate: string; customerName: string }>;
}) {
  const header = `${input.layout === '240' ? '01REMESSA' : '0'} CNAB${input.layout} CONV=${input.convenio || '000'} CART=${input.carteira} CEDENTE=${input.cedenteName || 'MARTHI'}`;
  const lines = input.boletos.map(
    (item, index) =>
      `${String(index + 1).padStart(6, '0')} NN=${item.nossoNumero} BOL=${item.id} VENC=${item.dueDate} VAL=${item.amount.toFixed(2)} PAG=${item.customerName.slice(0, 40)}`,
  );
  const trailer = `TRAILER QTD=${input.boletos.length} TOTAL=${input.boletos.reduce((s, b) => s + b.amount, 0).toFixed(2)}`;
  return [header, ...lines, trailer].join('\n');
}

export function createRemessaBatch(input: {
  bankAccountId: string;
  boletos: Array<{
    id: string;
    amount: number;
    dueDate: string;
    customerName: string;
    nossoNumero?: string;
  }>;
}) {
  if (!input.boletos.length) throw new Error('Selecione ao menos um boleto bancário em aberto.');
  const state = load();
  const config = state.config;
  let nextNn = config.nextNossoNumero;
  const enriched = input.boletos.map((item) => {
    const nossoNumero = item.nossoNumero || String(nextNn++).padStart(8, '0');
    return { ...item, nossoNumero };
  });
  const stamp = now();
  const datePart = stamp.slice(0, 10).replace(/-/g, '');
  const fileName = `REMESSA_${config.cnabLayout}_${datePart}_${uid('R').slice(-4)}.REM`;
  const contentPreview = buildCnabPreview({
    layout: config.cnabLayout,
    convenio: config.convenio,
    carteira: config.carteira,
    cedenteName: config.cedenteName,
    boletos: enriched,
  });
  const batch: RemessaBatch = {
    id: uid('REM'),
    bankAccountId: input.bankAccountId || config.defaultBankAccountId,
    layout: config.cnabLayout,
    status: 'generated',
    boletoIds: enriched.map((item) => item.id),
    fileName,
    folderPath: config.remessaFolder,
    lineCount: enriched.length + 2,
    totalAmount: enriched.reduce((sum, item) => sum + item.amount, 0),
    contentPreview,
    createdAt: stamp,
    generatedAt: stamp,
  };
  state.remessas.unshift(batch);
  state.config.nextNossoNumero = nextNn;
  state.config.updatedAt = stamp;
  save(state);
  return { batch, nossoNumeros: Object.fromEntries(enriched.map((item) => [item.id, item.nossoNumero])) };
}

export function markRemessaSent(id: string) {
  const state = load();
  const target = state.remessas.find((item) => item.id === id);
  if (!target || target.status === 'cancelled') return null;
  target.status = 'sent';
  save(state);
  return target;
}

export function cancelRemessa(id: string) {
  const state = load();
  const target = state.remessas.find((item) => item.id === id);
  if (!target || target.status === 'sent') return null;
  target.status = 'cancelled';
  save(state);
  return target;
}

/** Simula importação de retorno a partir de texto/arquivo colado ou nome de arquivo. */
export function importRetornoBatch(input: {
  bankAccountId: string;
  fileName: string;
  rawText: string;
  suggested: Array<{ nossoNumero: string; boletoId?: string; amount: number; occurrence: string }>;
}) {
  const state = load();
  const stamp = now();
  const items: RetornoItem[] = input.suggested.map((row) => ({
    nossoNumero: row.nossoNumero,
    boletoId: row.boletoId,
    amount: row.amount,
    paidAt: stamp.slice(0, 10),
    occurrence: row.occurrence,
    matched: Boolean(row.boletoId),
  }));
  const batch: RetornoBatch = {
    id: uid('RET'),
    bankAccountId: input.bankAccountId || state.config.defaultBankAccountId,
    status: 'imported',
    fileName: input.fileName.trim() || `RETORNO_${stamp.slice(0, 10)}.RET`,
    folderPath: state.config.retornoFolder,
    rawPreview: input.rawText.slice(0, 2000) || '(arquivo sem conteúdo — matching por boletos abertos)',
    items,
    paidCount: items.filter((item) => item.matched).length,
    unmatchedCount: items.filter((item) => !item.matched).length,
    createdAt: stamp,
    notes: '',
  };
  state.retornos.unshift(batch);
  save(state);
  return batch;
}

export function markRetornoProcessed(id: string) {
  const state = load();
  const target = state.retornos.find((item) => item.id === id);
  if (!target) return null;
  target.status = 'processed';
  target.processedAt = now();
  save(state);
  return target;
}

export function addConciliationRow(input: {
  bankAccountId: string;
  statementDate: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  notes?: string;
}) {
  const state = load();
  const row: ConciliationRow = {
    id: uid('CON'),
    bankAccountId: input.bankAccountId || state.config.defaultBankAccountId,
    statementDate: input.statementDate,
    description: input.description.trim(),
    amount: input.amount,
    direction: input.direction,
    status: 'pending',
    notes: input.notes?.trim() ?? '',
    createdAt: now(),
  };
  state.conciliation.unshift(row);
  save(state);
  return row;
}

export function matchConciliationRow(
  id: string,
  patch: {
    status: ConciliationStatus;
    matchedFinanceId?: string;
    matchedBoletoId?: string;
    matchedReceivableId?: string;
    notes?: string;
  },
) {
  const state = load();
  const target = state.conciliation.find((item) => item.id === id);
  if (!target) return null;
  target.status = patch.status;
  target.matchedFinanceId = patch.matchedFinanceId;
  target.matchedBoletoId = patch.matchedBoletoId;
  target.matchedReceivableId = patch.matchedReceivableId;
  if (patch.notes !== undefined) target.notes = patch.notes;
  save(state);
  return target;
}

export function downloadTextFile(fileName: string, content: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
