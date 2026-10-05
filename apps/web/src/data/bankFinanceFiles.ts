import { readModuleState, loadModuleState, saveModuleState } from './moduleState';
/** Configuração de arquivos bancários, remessa/retorno CNAB e conciliação (MVP local). */

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

function seedConciliation(): ConciliationRow[] { return []; }

function seed(): StoreState {
  return {
    config: defaultConfig(),
    remessas: [],
    retornos: [],
    conciliation: seedConciliation(),
  };
}

function load(): StoreState { return readModuleState('bank-files', seed()); }

async function save(state: StoreState) { await saveModuleState('bank-files', state); emit(); }

export function getBankFileConfig() {
  return load().config;
}

export async function saveBankFileConfig(patch: Partial<BankFileConfig>) {
  const state = load();
  state.config = {
    ...state.config,
    ...patch,
    updatedAt: now(),
  };
  await save(state);
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

export async function createRemessaBatch(input: {
  bankAccountId: string;
  boletos: Array<{
    id: string;
    amount: number;
    dueDate: string;
    customerName: string;
    nossoNumero?: string;
  }>;
}): Promise<{ batch: RemessaBatch; nossoNumeros: Record<string, string> }> {
  void input;
  throw new Error('Configure um adaptador homologado para o banco antes de gerar remessas CNAB. Nenhum arquivo bancário foi emitido.');
}

export async function markRemessaSent(id: string) {
  const state = load();
  const target = state.remessas.find((item) => item.id === id);
  if (!target || target.status === 'cancelled') return null;
  target.status = 'sent';
  await save(state);
  return target;
}

export async function cancelRemessa(id: string) {
  const state = load();
  const target = state.remessas.find((item) => item.id === id);
  if (!target || target.status === 'sent') return null;
  target.status = 'cancelled';
  await save(state);
  return target;
}

export async function importRetornoBatch(_input: {
  bankAccountId: string;
  fileName: string;
  rawText: string;
  suggested: Array<{ nossoNumero: string; boletoId?: string; amount: number; occurrence: string }>;
}): Promise<RetornoBatch> {
  throw new Error('Configure um adaptador homologado para importar retornos bancários. Nenhum pagamento foi registrado.');
}

export async function markRetornoProcessed(id: string) {
  const state = load();
  const target = state.retornos.find((item) => item.id === id);
  if (!target) return null;
  target.status = 'processed';
  target.processedAt = now();
  await save(state);
  return target;
}

export async function addConciliationRow(input: {
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
  await save(state);
  return row;
}

export async function matchConciliationRow(
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
  await save(state);
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

export async function hydrateBankFilesFromApi() { await loadModuleState('bank-files', seed()); emit(); }
