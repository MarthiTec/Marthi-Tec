const STORAGE_KEY = 'marthi.audit.v1';
const MAX_ENTRIES = 400;

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
  const state = load();
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
  state.entries = [entry, ...state.entries].slice(0, MAX_ENTRIES);
  save(state);
  window.dispatchEvent(new Event('marthi-audit-updated'));
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
  window.dispatchEvent(new Event('marthi-audit-updated'));
}
