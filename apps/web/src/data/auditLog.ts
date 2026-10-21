import { storeScopedKey } from './storeCache';
import {
  apiCreateAudit,
  apiCreateStoreAudit,
  apiListAudit,
  apiListStoreAudit,
  type ApiAuditEntry,
  type ApiStoreAuditEntry,
} from '../services/erpApi';
import { isNestAuthed } from '../services/nestClient';

const STORAGE_KEY = 'marthi.audit.v1';
const MAX_ENTRIES = 400;
export const AUDIT_EVENT = 'marthi-audit-updated';

export type AuditKind = 'access' | 'action';

export type AuditEntry = {
  id: string;
  kind: AuditKind;
  at: string;
  actorName: string;
  actorEmail: string;
  action: string;
  detail: string;
  path: string;
  module?: string;
  moduleLabel?: string;
  menuLabel?: string;
  actionType?: string;
  actionTypeLabel?: string;
  entity?: string;
  entityId?: string;
};

type AuditState = {
  entries: AuditEntry[];
};

function uid() {
  return `AUD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function mapNestEntry(row: ApiAuditEntry): AuditEntry {
  return {
    id: row.id,
    kind: row.kind,
    at: row.at,
    actorName: row.actorName ?? '',
    actorEmail: row.actorEmail ?? '',
    action: row.action ?? '',
    detail: row.detail ?? '',
    path: row.path ?? '',
  };
}

function mapStoreEntry(row: ApiStoreAuditEntry): AuditEntry {
  const kind: AuditKind =
    row.module === 'acessos' || String(row.details?.kind || '') === 'access' ? 'access' : 'action';
  return {
    id: row.id,
    kind,
    at: row.createdAt,
    actorName: row.actorName ?? '',
    actorEmail: row.actorEmail ?? '',
    action: row.action ?? '',
    detail: row.summary || '',
    path: row.menuLabel || (typeof row.details?.path === 'string' ? row.details.path : '') || '',
    module: row.module || undefined,
    moduleLabel: row.moduleLabel || undefined,
    menuLabel: row.menuLabel || undefined,
    actionType: row.actionType || undefined,
    actionTypeLabel: row.actionTypeLabel || undefined,
    entity: row.entity || undefined,
    entityId: row.entityId || undefined,
  };
}

function inferActionType(action: string, kind: AuditKind): 'inclusao' | 'alteracao' | 'exclusao' | 'conclusao' {
  const a = action.toLowerCase();
  if (kind === 'access') return 'conclusao';
  if (/(excluir|delete|cancelar|remover|inativar)/.test(a)) return 'exclusao';
  if (/(criar|create|incluir|novo)/.test(a)) return 'inclusao';
  if (/(concluir|baixar|fechar|abrir|enviar|aprovar|pagar|receber|finaliz)/.test(a)) return 'conclusao';
  return 'alteracao';
}

function inferModule(action: string, path: string): string {
  const hay = `${action} ${path}`.toLowerCase();
  if (/login|logout|denied|acesso/.test(hay)) return 'acessos';
  if (/produto|estoque|stock|brand|atribut/.test(hay)) return 'produtos_estoque';
  if (/entrada|supplier_entry/.test(hay)) return 'entrada';
  if (/movimento|ajuste|balance/.test(hay)) return 'movimentos';
  if (/externa|venda\.externa/.test(hay)) return 'vendas';
  if (/pdv|caixa|venda_avulsa|pos\./.test(hay)) return 'pdv';
  if (/cliente|customer/.test(hay)) return 'clientes';
  if (/vendedor|fornecedor|funcionario|pessoas|seller|supplier/.test(hay)) return 'pessoas';
  if (/financ|pagar|receber|conta|tesouraria|boleto|cnab/.test(hay)) return 'financeiro';
  if (/catalogo|totem/.test(hay)) return 'catalogo_digital';
  if (/cotac|or[cç]amento|quote/.test(hay)) return 'cotacoes';
  return 'sistema';
}

function load(): AuditState {
  try {
    const raw = localStorage.getItem(storeScopedKey(STORAGE_KEY));
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as Partial<AuditState>;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

function save(state: AuditState) {
  localStorage.setItem(storeScopedKey(STORAGE_KEY), JSON.stringify(state));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUDIT_EVENT));
  }
}

export function replaceAuditLog(entries: AuditEntry[]) {
  save({ entries: entries.slice(0, MAX_ENTRIES) });
}

/** Hidrata a partir de MarthiDB (`audit_logs`); Nest `/audit` é fallback legado. */
export async function hydrateAuditFromApi() {
  if (!isNestAuthed()) return;
  try {
    const rows = await apiListStoreAudit({ limit: 200 });
    if (Array.isArray(rows) && rows.length) {
      replaceAuditLog(rows.map(mapStoreEntry));
      return;
    }
  } catch {
    /* fallback Nest abaixo */
  }
  try {
    const rows = await apiListAudit();
    replaceAuditLog(rows.map(mapNestEntry));
  } catch {
    /* mantém cache local */
  }
}

export function listAuditEntries() {
  return load().entries;
}

export function logAudit(input: {
  kind: AuditKind;
  actorName: string;
  actorEmail: string;
  action: string;
  detail?: string;
  path?: string;
}) {
  const path = input.path ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  const entry: AuditEntry = {
    id: uid(),
    kind: input.kind,
    at: new Date().toISOString(),
    actorName: input.actorName.trim() || 'Sistema',
    actorEmail: input.actorEmail.trim().toLowerCase(),
    action: input.action.trim(),
    detail: (input.detail ?? '').trim(),
    path,
    module: inferModule(input.action, path),
    actionType: inferActionType(input.action, input.kind),
    menuLabel: path || undefined,
  };

  const state = load();
  state.entries = [entry, ...state.entries].slice(0, MAX_ENTRIES);
  save(state);

  if (isNestAuthed()) {
    // Fonte de verdade: MarthiDB via Express.
    void apiCreateStoreAudit({
      action: entry.action,
      entity: 'ui',
      actionType: entry.actionType as 'inclusao' | 'alteracao' | 'exclusao' | 'conclusao',
      module: entry.module,
      menuLabel: entry.path || undefined,
      summary: entry.detail || undefined,
      path: entry.path || undefined,
      kind: entry.kind,
    })
      .then((row) => {
        const next = load();
        const withoutTemp = next.entries.filter((item) => item.id !== entry.id);
        replaceAuditLog([mapStoreEntry(row), ...withoutTemp]);
      })
      .catch(() => {
        /* mantém cópia local se a API falhar */
      });

    // Compatibilidade com Nest trail legado (não bloqueia).
    void apiCreateAudit({
      kind: entry.kind,
      actorName: entry.actorName,
      actorEmail: entry.actorEmail,
      action: entry.action,
      detail: entry.detail || undefined,
      path: entry.path || undefined,
    }).catch(() => undefined);
  }

  return entry;
}

export function logAccess(input: {
  actorName: string;
  actorEmail: string;
  action: 'login' | 'logout' | 'denied';
  detail?: string;
}) {
  return logAudit({
    kind: 'access',
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    action: input.action,
    detail: input.detail,
  });
}

export function logAction(input: {
  actorName: string;
  actorEmail: string;
  action: string;
  detail?: string;
  path?: string;
}) {
  return logAudit({
    kind: 'action',
    ...input,
  });
}

export function clearAuditLog() {
  save({ entries: [] });
}

export const AUDIT_MODULE_FILTERS = [
  { value: 'all', label: 'Todos os módulos' },
  { value: 'produtos_estoque', label: 'Produtos & Estoque' },
  { value: 'entrada', label: 'Entrada de estoque' },
  { value: 'movimentos', label: 'Movimentos' },
  { value: 'vendas', label: 'Venda externa' },
  { value: 'pdv', label: 'PDV / Caixa' },
  { value: 'clientes', label: 'Clientes' },
  { value: 'pessoas', label: 'Pessoas' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'catalogo_digital', label: 'Catálogo digital' },
  { value: 'cotacoes', label: 'Cotações / Orçamentos' },
  { value: 'acessos', label: 'Acessos' },
  { value: 'sistema', label: 'Sistema' },
] as const;

export const AUDIT_ACTION_TYPE_FILTERS = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'inclusao', label: 'Inclusão' },
  { value: 'alteracao', label: 'Alteração' },
  { value: 'exclusao', label: 'Exclusão' },
  { value: 'conclusao', label: 'Conclusão' },
] as const;
