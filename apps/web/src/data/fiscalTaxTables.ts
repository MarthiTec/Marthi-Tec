/**
 * Tabelas CST e cClassTrib (reforma IBS/CBS).
 * Fonte oficial: API Conformidade Fácil SVRS
 * https://cff.svrs.rs.gov.br/api/v1/consultas/classTrib
 * (produção exige certificado ICP-Brasil mTLS — no browser usamos cache local + tentativa).
 * Dual-path: Nest quando autenticado; senão localStorage / fetch browser.
 */

import {
  apiGetTaxTables,
  apiPutTaxTables,
  apiSyncTaxTables,
  type ApiTaxTables,
} from '../services/erpApi';
import { isNestAuthed } from '../services/nestClient';

const STORAGE_KEY = 'marthi.fiscal.tax-tables.v1';

export const CCLASSTRIB_API_URL = 'https://cff.svrs.rs.gov.br/api/v1/consultas/classTrib';
export const CCLASSTRIB_PORTAL_URL =
  'https://dfe-portal.svrs.rs.gov.br/Cff/ClassificacaoTributaria';

export type FiscalCstCode = {
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export type FiscalCClassTrib = {
  code: string;
  name: string;
  /** CST IBS/CBS associado (3 primeiros dígitos em geral). */
  cstCode: string;
  description: string;
  linkLc?: string;
  active: boolean;
};

export type FiscalDocPurpose =
  | 'normal'
  | 'devolucao'
  | 'credito_reforma'
  | 'debito_reforma';

type TaxTablesState = {
  csts: FiscalCstCode[];
  cClassTribs: FiscalCClassTrib[];
  lastSyncAt: string;
  lastSyncSource: 'seed' | 'api' | 'manual';
  lastSyncMessage: string;
};

export const NFE_DOC_PURPOSE_LABEL: Record<FiscalDocPurpose, string> = {
  normal: 'Normal',
  devolucao: 'Devolução',
  credito_reforma: 'Crédito da reforma (IBS/CBS)',
  debito_reforma: 'Débito da reforma (IBS/CBS)',
};

export const NFE_DOC_PURPOSE_HINT: Record<FiscalDocPurpose, string> = {
  normal: 'Operação regular de entrada ou saída.',
  devolucao: 'Devolução de mercadoria (CFOP de retorno).',
  credito_reforma: 'Documento de crédito IBS/CBS da reforma tributária.',
  debito_reforma: 'Documento de débito IBS/CBS da reforma tributária.',
};

const SEED_CSTS: FiscalCstCode[] = [
  { code: '000', name: 'Tributação integral', description: 'CST IBS/CBS — tributação integral', active: true },
  { code: '010', name: 'Tributação com alíquotas uniformes setoriais', description: '', active: true },
  { code: '011', name: 'Tributação com alíquotas uniformes setoriais reduzidas', description: '', active: true },
  { code: '200', name: 'Alíquota reduzida', description: 'Redução de alíquota IBS/CBS', active: true },
  { code: '220', name: 'Alíquota reduzida com redutor de base', description: '', active: true },
  { code: '400', name: 'Isenção', description: '', active: true },
  { code: '410', name: 'Imunidade e não incidência', description: '', active: true },
  { code: '510', name: 'Diferimento', description: '', active: true },
  { code: '550', name: 'Suspensão', description: '', active: true },
  { code: '800', name: 'Transferência de crédito', description: '', active: true },
  { code: '810', name: 'Ajuste de IBS/CBS', description: '', active: true },
  { code: '820', name: 'Tributação em regime específico', description: '', active: true },
  { code: '830', name: 'Exclusão da BC', description: '', active: true },
];

const SEED_CCLASS: FiscalCClassTrib[] = [
  { code: '000001', cstCode: '000', name: 'Situações tributadas integralmente pelo IBS e pela CBS', description: 'Classificação padrão', active: true },
  { code: '200001', cstCode: '200', name: 'Aquisições e importações com redução de alíquota', description: '', active: true },
  { code: '200002', cstCode: '200', name: 'Fornecimentos com redução de alíquota', description: '', active: true },
  { code: '200003', cstCode: '200', name: 'Redução de alíquota — cestas básicas', description: '', active: true },
  { code: '410001', cstCode: '410', name: 'Imunidade e não incidência', description: '', active: true },
  { code: '550001', cstCode: '550', name: 'Exportações de bens materiais', description: '', active: true },
  { code: '620001', cstCode: '620', name: 'Tributação monofásica sobre combustíveis', description: '', active: true },
  { code: '820001', cstCode: '820', name: 'Regime específico — serviços financeiros', description: '', active: true },
  { code: '830001', cstCode: '830', name: 'Exclusão da BC — energia elétrica', description: '', active: true },
];

function seed(): TaxTablesState {
  return {
    csts: SEED_CSTS,
    cClassTribs: SEED_CCLASS,
    lastSyncAt: '',
    lastSyncSource: 'seed',
    lastSyncMessage: 'Tabelas iniciais (seed). Sincronize com a API SVRS quando o certificado estiver no Nest.',
  };
}

function load(): TaxTablesState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = seed();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<TaxTablesState>;
    return {
      ...seed(),
      ...parsed,
      csts: Array.isArray(parsed.csts) && parsed.csts.length ? parsed.csts : SEED_CSTS,
      cClassTribs:
        Array.isArray(parsed.cClassTribs) && parsed.cClassTribs.length
          ? parsed.cClassTribs
          : SEED_CCLASS,
    };
  } catch {
    return seed();
  }
}

function save(state: TaxTablesState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event('marthi-fiscal-tax-tables-updated'));
}

function nestError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function mapTaxTables(row: ApiTaxTables): TaxTablesState {
  return {
    csts: (row.csts ?? []).map((item) => ({
      code: item.code,
      name: item.name,
      description: item.description ?? '',
      active: item.active ?? true,
    })),
    cClassTribs: (row.cClassTribs ?? []).map((item) => ({
      code: item.code,
      name: item.name,
      cstCode: item.cstCode ?? item.code.slice(0, 3),
      description: item.description ?? '',
      linkLc: item.linkLc,
      active: item.active ?? true,
    })),
    lastSyncAt: row.lastSyncAt ?? '',
    lastSyncSource: row.lastSyncSource ?? 'manual',
    lastSyncMessage: row.lastSyncMessage ?? '',
  };
}

function taxTablesBody(state: TaxTablesState) {
  return {
    csts: state.csts.map((item) => ({
      code: item.code,
      name: item.name,
      description: item.description || undefined,
      active: item.active,
    })),
    cClassTribs: state.cClassTribs.map((item) => ({
      code: item.code,
      name: item.name,
      cstCode: item.cstCode || undefined,
      description: item.description || undefined,
      linkLc: item.linkLc || undefined,
      active: item.active,
    })),
  };
}

export function replaceTaxTables(state: TaxTablesState) {
  save(state);
}

export async function hydrateTaxTablesFromApi() {
  if (!isNestAuthed()) return;
  const row = await apiGetTaxTables();
  replaceTaxTables(mapTaxTables(row));
}

export function getTaxTablesMeta() {
  const state = load();
  return {
    lastSyncAt: state.lastSyncAt,
    lastSyncSource: state.lastSyncSource,
    lastSyncMessage: state.lastSyncMessage,
    cstCount: state.csts.length,
    cClassCount: state.cClassTribs.length,
  };
}

export function listFiscalCsts(activeOnly = false) {
  const items = load().csts.sort((a, b) => a.code.localeCompare(b.code));
  return activeOnly ? items.filter((item) => item.active) : items;
}

export function listFiscalCClassTribs(activeOnly = false, cstCode?: string) {
  let items = load().cClassTribs.sort((a, b) => a.code.localeCompare(b.code));
  if (cstCode) items = items.filter((item) => item.cstCode === cstCode);
  return activeOnly ? items.filter((item) => item.active) : items;
}

export async function upsertFiscalCst(
  input: Omit<FiscalCstCode, 'active'> & { active?: boolean },
): Promise<{ ok: true; item: FiscalCstCode } | { ok: false; error: string }> {
  const code = input.code.replace(/\D/g, '').padStart(3, '0').slice(0, 3);
  if (code.length !== 3) return { ok: false, error: 'CST deve ter 3 dígitos.' };
  if (!input.name.trim()) return { ok: false, error: 'Informe o nome do CST.' };
  const state = load();
  const next: FiscalCstCode = {
    code,
    name: input.name.trim(),
    description: (input.description ?? '').trim(),
    active: input.active ?? true,
  };
  const idx = state.csts.findIndex((item) => item.code === code);
  if (idx >= 0) state.csts[idx] = next;
  else state.csts.push(next);
  state.lastSyncSource = 'manual';
  state.lastSyncMessage = `CST ${code} atualizado manualmente.`;

  if (isNestAuthed()) {
    try {
      const row = await apiPutTaxTables(taxTablesBody(state));
      const mapped = mapTaxTables(row);
      save(mapped);
      const item = mapped.csts.find((rowItem) => rowItem.code === code) ?? next;
      return { ok: true, item };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao salvar CST.') };
    }
  }

  save(state);
  return { ok: true, item: next };
}

export async function upsertFiscalCClassTrib(
  input: Omit<FiscalCClassTrib, 'active'> & { active?: boolean },
): Promise<{ ok: true; item: FiscalCClassTrib } | { ok: false; error: string }> {
  const code = input.code.replace(/\D/g, '').padStart(6, '0').slice(0, 6);
  if (code.length !== 6) return { ok: false, error: 'cClassTrib deve ter 6 dígitos.' };
  if (!input.name.trim()) return { ok: false, error: 'Informe o nome do cClassTrib.' };
  const state = load();
  const next: FiscalCClassTrib = {
    code,
    name: input.name.trim(),
    cstCode: (input.cstCode || code.slice(0, 3)).replace(/\D/g, '').padStart(3, '0').slice(0, 3),
    description: (input.description ?? '').trim(),
    linkLc: input.linkLc,
    active: input.active ?? true,
  };
  const idx = state.cClassTribs.findIndex((item) => item.code === code);
  if (idx >= 0) state.cClassTribs[idx] = next;
  else state.cClassTribs.push(next);
  state.lastSyncSource = 'manual';
  state.lastSyncMessage = `cClassTrib ${code} atualizado manualmente.`;

  if (isNestAuthed()) {
    try {
      const row = await apiPutTaxTables(taxTablesBody(state));
      const mapped = mapTaxTables(row);
      save(mapped);
      const item = mapped.cClassTribs.find((rowItem) => rowItem.code === code) ?? next;
      return { ok: true, item };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao salvar cClassTrib.') };
    }
  }

  save(state);
  return { ok: true, item: next };
}

function mapApiPayload(raw: unknown): { csts: FiscalCstCode[]; cClassTribs: FiscalCClassTrib[] } {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data)
      : raw && typeof raw === 'object' && Array.isArray((raw as { itens?: unknown }).itens)
        ? ((raw as { itens: unknown[] }).itens)
        : [];

  const cstMap = new Map<string, FiscalCstCode>();
  const classes: FiscalCClassTrib[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const cClass =
      String(item.cClassTrib ?? item.cClasTrib ?? item.codigo ?? item.code ?? '').replace(/\D/g, '');
    const cst =
      String(item.cst ?? item.Cst ?? item.CST ?? cClass.slice(0, 3)).replace(/\D/g, '').padStart(3, '0');
    const name = String(
      item.nomeCClassTrib ?? item.nome ?? item.name ?? item.descricao ?? item.description ?? cClass,
    );
    const cstName = String(item.nomeCst ?? item.NomeCst ?? item.cstNome ?? `CST ${cst}`);
    if (cst.length === 3 && !cstMap.has(cst)) {
      cstMap.set(cst, {
        code: cst,
        name: cstName,
        description: '',
        active: true,
      });
    }
    if (cClass.length >= 6) {
      classes.push({
        code: cClass.padStart(6, '0').slice(0, 6),
        name,
        cstCode: cst.slice(0, 3),
        description: String(item.descricao ?? item.description ?? ''),
        linkLc: item.linkLc ? String(item.linkLc) : undefined,
        active: true,
      });
    }
  }

  return { csts: [...cstMap.values()], cClassTribs: classes };
}

/**
 * Tenta a API oficial SVRS. No browser costuma falhar sem mTLS —
 * nesse caso mantém o seed e orienta a sincronizar via Nest.
 */
export async function syncTaxTablesFromGovApi(): Promise<
  { ok: true; count: number; message: string } | { ok: false; error: string }
> {
  if (isNestAuthed()) {
    try {
      const row = await apiSyncTaxTables();
      const mapped = mapTaxTables(row);
      save(mapped);
      return {
        ok: true,
        count: mapped.cClassTribs.length,
        message: mapped.lastSyncMessage || `Sync Nest · ${mapped.csts.length} CST · ${mapped.cClassTribs.length} cClassTrib.`,
      };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao sincronizar tabelas no Nest.') };
    }
  }

  try {
    const response = await fetch(CCLASSTRIB_API_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const json = (await response.json()) as unknown;
    const mapped = mapApiPayload(json);
    if (mapped.cClassTribs.length === 0 && mapped.csts.length === 0) {
      throw new Error('Resposta sem CST/cClassTrib reconhecíveis.');
    }
    const state = load();
    if (mapped.csts.length) state.csts = mapped.csts;
    if (mapped.cClassTribs.length) state.cClassTribs = mapped.cClassTribs;
    state.lastSyncAt = new Date().toISOString();
    state.lastSyncSource = 'api';
    state.lastSyncMessage = `Sincronizado da API SVRS · ${state.csts.length} CST · ${state.cClassTribs.length} cClassTrib.`;
    save(state);
    return {
      ok: true,
      count: state.cClassTribs.length,
      message: state.lastSyncMessage,
    };
  } catch (error) {
    const state = load();
    state.lastSyncAt = new Date().toISOString();
    state.lastSyncSource = 'seed';
    state.lastSyncMessage =
      'API SVRS exige certificado digital (mTLS). Mantendo tabela local — portal: ' +
      CCLASSTRIB_PORTAL_URL;
    save(state);
    return {
      ok: false,
      error:
        error instanceof Error
          ? `${error.message}. Use o portal Conformidade Fácil ou sincronize pelo Nest com o certificado A1.`
          : 'Falha ao consultar a API do governo.',
    };
  }
}

export async function resetTaxTablesToSeed() {
  const initial = seed();
  initial.lastSyncAt = new Date().toISOString();
  initial.lastSyncMessage = 'Tabelas restauradas para o seed Marthi.';

  if (isNestAuthed()) {
    try {
      const row = await apiPutTaxTables(taxTablesBody(initial));
      const mapped = mapTaxTables(row);
      save(mapped);
      return mapped;
    } catch {
      // fallback local
    }
  }

  save(initial);
  return initial;
}
