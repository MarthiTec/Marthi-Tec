import { apiCreateAudit, apiListAudit, type ApiAuditEntry } from '../services/erpApi';
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
};

type AuditState = {
  entries: AuditEntry[];
};

function uid() {
  return `AUD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function mapEntry(row: ApiAuditEntry): AuditEntry {
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

function load(): AuditState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as Partial<AuditState>;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

function save(state: AuditState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUDIT_EVENT));
  }
}

export function replaceAuditLog(entries: AuditEntry[]) {
  save({ entries: entries.slice(0, MAX_ENTRIES) });
}

export async function hydrateAuditFromApi() {
  if (!isNestAuthed()) return;
  const rows = await apiListAudit();
  replaceAuditLog(rows.map(mapEntry));
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
  const entry: AuditEntry = {
    id: uid(),
    kind: input.kind,
    at: new Date().toISOString(),
    actorName: input.actorName.trim() || 'Sistema',
    actorEmail: input.actorEmail.trim().toLowerCase(),
    action: input.action.trim(),
    detail: (input.detail ?? '').trim(),
    path: input.path ?? (typeof window !== 'undefined' ? window.location.pathname : ''),
  };

  const state = load();
  state.entries = [entry, ...state.entries].slice(0, MAX_ENTRIES);
  save(state);

  if (isNestAuthed()) {
    void apiCreateAudit({
      kind: entry.kind,
      actorName: entry.actorName,
      actorEmail: entry.actorEmail,
      action: entry.action,
      detail: entry.detail || undefined,
      path: entry.path || undefined,
    })
      .then((row) => {
        const next = load();
        const withoutTemp = next.entries.filter((item) => item.id !== entry.id);
        replaceAuditLog([mapEntry(row), ...withoutTemp]);
      })
      .catch(() => {
        /* mantém cópia local se a API falhar */
      });
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
