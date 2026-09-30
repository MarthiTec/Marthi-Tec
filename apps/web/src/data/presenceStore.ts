import { listEmployees } from './erpRegistry';
import { getOperatorProfile, PROFILE_EVENT } from './operatorProfile';
import { tenantScopedKey } from './tenantContext';

const STORAGE_KEY = 'marthi.team.presence.v1';
export const PRESENCE_EVENT = 'marthi-presence-updated';

export type PresenceModule =
  | 'painel'
  | 'caixa'
  | 'os'
  | 'erp'
  | 'fiscal'
  | 'ecommerce'
  | 'crm'
  | 'totem'
  | 'offline';

export type PresenceAvailability = 'active' | 'away';

export type PresenceAwayReason =
  | 'lunch'
  | 'meeting'
  | 'break'
  | 'external'
  | 'other'
  | null;

export type TeamPresence = {
  /** Chave estável (e-mail normalizado ou id local). */
  userKey: string;
  displayName: string;
  role: string;
  photo: string | null;
  email: string;
  module: PresenceModule;
  availability: PresenceAvailability;
  awayReason: PresenceAwayReason;
  awayNote: string;
  updatedAt: string;
  lastSeenAt: string;
};

export const PRESENCE_MODULE_LABEL: Record<PresenceModule, string> = {
  painel: 'Painel',
  caixa: 'PDV / Caixa',
  os: 'Oficina',
  erp: 'Retaguarda',
  fiscal: 'Emissor fiscal',
  ecommerce: 'E-commerce',
  crm: 'CRM Marthi',
  totem: 'Totem',
  offline: 'Offline',
};

export const PRESENCE_AWAY_LABEL: Record<Exclude<PresenceAwayReason, null>, string> = {
  lunch: 'Almoço',
  meeting: 'Reunião',
  break: 'Pausa',
  external: 'Atendimento externo',
  other: 'Outro motivo',
};

export const PRESENCE_AWAY_OPTIONS: Array<{
  value: PresenceAwayReason;
  label: string;
}> = [
  { value: 'lunch', label: 'Almoço' },
  { value: 'meeting', label: 'Reunião' },
  { value: 'break', label: 'Pausa' },
  { value: 'external', label: 'Atendimento externo' },
  { value: 'other', label: 'Outro motivo' },
];

type State = {
  entries: TeamPresence[];
};

function now() {
  return new Date().toISOString();
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function empty(): State {
  return { entries: [] };
}

function isMockPresence(entry: { displayName?: string; email?: string; userKey?: string }): boolean {
  const name = (entry.displayName || '').toLowerCase();
  const mail = (entry.email || '').toLowerCase();
  const key = (entry.userKey || '').toLowerCase();
  return (
    name.includes('marthi basic') ||
    name.includes('marthi teste') ||
    name.trim() === 'operador' ||
    name.trim() === 'operador caixa' ||
    name.includes('administrador da loja') ||
    mail.includes('@loja.local') ||
    mail.includes('@celsul.local') ||
    mail.includes('@parceiro.local') ||
    key.includes('marthi basic') ||
    key.includes('marthi teste') ||
    key === 'local:operador'
  );
}

function load(): State {
  try {
    const key = tenantScopedKey(STORAGE_KEY);
    const raw = localStorage.getItem(key) || localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<State>;
    const entries = (Array.isArray(parsed.entries) ? parsed.entries : []).filter(
      (e) => !isMockPresence(e),
    );
    return { entries };
  } catch {
    return empty();
  }
}

function save(state: State) {
  const key = tenantScopedKey(STORAGE_KEY);
  localStorage.setItem(key, JSON.stringify(state));
  window.dispatchEvent(new Event(PRESENCE_EVENT));
}

function upsert(entry: TeamPresence) {
  const state = load();
  const idx = state.entries.findIndex((item) => item.userKey === entry.userKey);
  if (idx >= 0) state.entries[idx] = entry;
  else state.entries.unshift(entry);
  save(state);
  return entry;
}

export function resolvePresenceUserKey(email?: string | null, fallbackName?: string) {
  const mail = normalizeKey(email ?? '');
  if (mail) return mail;
  return `local:${normalizeKey(fallbackName || 'operador') || 'operador'}`;
}

export function getPresence(userKey: string): TeamPresence | null {
  return load().entries.find((item) => item.userKey === userKey) ?? null;
}

export function listPresenceEntries() {
  return [...load().entries].filter((e) => !isMockPresence(e)).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/** Equipe do ERP + presença ao vivo (quem está logado / onde / status). */
export function listTeamPresenceBoard(currentUserKey?: string): TeamPresence[] {
  const employees = listEmployees(true).filter((e) => e.isSystemUser && !isMockPresence({ displayName: e.name, email: e.userEmail || e.email }));
  const live = listPresenceEntries();
  const liveByKey = new Map(live.map((item) => [item.userKey, item]));
  const stamp = now();

  const byKey = new Map<string, TeamPresence>();

  for (const employee of employees) {
    if (isMockPresence({ displayName: employee.name, email: employee.userEmail || employee.email })) continue;
    const key = resolvePresenceUserKey(employee.userEmail || employee.email, employee.name);
    const existing = liveByKey.get(key);
    if (existing && !isMockPresence(existing)) {
      byKey.set(key, {
        ...existing,
        displayName: employee.name || existing.displayName,
        role: employee.role || existing.role,
        email: employee.userEmail || employee.email || existing.email,
      });
    } else {
      byKey.set(key, {
        userKey: key,
        displayName: employee.name,
        role: employee.role,
        photo: null,
        email: employee.userEmail || employee.email,
        module: 'offline',
        availability: 'away',
        awayReason: null,
        awayNote: '',
        updatedAt: stamp,
        lastSeenAt: stamp,
      });
    }
  }

  // Se o usuário atual logado não estiver na lista de employees da loja, adiciona ele
  if (currentUserKey && !byKey.has(currentUserKey)) {
    const meLive = liveByKey.get(currentUserKey);
    if (meLive && !isMockPresence(meLive)) {
      byKey.set(currentUserKey, meLive);
    }
  }

  const rows = [...byKey.values()];
  rows.sort((a, b) => {
    const score = (item: TeamPresence) => {
      if (currentUserKey && item.userKey === currentUserKey) return 0;
      if (item.module !== 'offline' && item.availability === 'active') return 1;
      if (item.module !== 'offline') return 2;
      return 3;
    };
    const diff = score(a) - score(b);
    if (diff !== 0) return diff;
    return a.displayName.localeCompare(b.displayName, 'pt-BR');
  });
  return rows;
}

export function presenceStatusLabel(entry: TeamPresence) {
  if (entry.module === 'offline') return 'Offline';
  if (entry.availability === 'active') return 'Ativo';
  if (entry.awayReason) return PRESENCE_AWAY_LABEL[entry.awayReason];
  return 'Ausente';
}

export function presenceDetailLabel(entry: TeamPresence) {
  if (entry.module === 'offline') return 'Fora do sistema';
  const place = PRESENCE_MODULE_LABEL[entry.module];
  if (entry.availability === 'active') return `Em ${place}`;
  const reason = entry.awayReason ? PRESENCE_AWAY_LABEL[entry.awayReason] : 'Ausente';
  return `${reason} · último em ${place}`;
}

type HeartbeatInput = {
  email?: string | null;
  displayName: string;
  role?: string;
  photo?: string | null;
  module: PresenceModule;
};

/** Mantém o usuário atual vivo no módulo aberto. Não sobrescreve “away” com active. */
export function heartbeatPresence(input: HeartbeatInput) {
  const userKey = resolvePresenceUserKey(input.email, input.displayName);
  const current = getPresence(userKey);
  const stamp = now();
  const profile = getOperatorProfile(input.displayName, input.email ?? '');

  const next: TeamPresence = {
    userKey,
    displayName: profile.displayName || input.displayName,
    role: profile.role || input.role || 'Operador',
    photo: input.photo ?? profile.photo,
    email: profile.email || input.email || '',
    module: input.module,
    availability: current?.availability === 'away' ? 'away' : 'active',
    awayReason: current?.availability === 'away' ? current.awayReason : null,
    awayNote: current?.availability === 'away' ? current.awayNote : '',
    updatedAt: stamp,
    lastSeenAt: stamp,
  };
  return upsert(next);
}

export function setPresenceAvailability(input: {
  email?: string | null;
  displayName: string;
  availability: PresenceAvailability;
  awayReason?: PresenceAwayReason;
  awayNote?: string;
  module?: PresenceModule;
}) {
  const userKey = resolvePresenceUserKey(input.email, input.displayName);
  const current = getPresence(userKey);
  const profile = getOperatorProfile(input.displayName, input.email ?? '');
  const stamp = now();

  const next: TeamPresence = {
    userKey,
    displayName: profile.displayName || input.displayName,
    role: profile.role || current?.role || 'Operador',
    photo: profile.photo ?? current?.photo ?? null,
    email: profile.email || input.email || current?.email || '',
    module: input.module ?? current?.module ?? 'painel',
    availability: input.availability,
    awayReason: input.availability === 'away' ? input.awayReason ?? 'other' : null,
    awayNote: input.availability === 'away' ? (input.awayNote ?? '').trim() : '',
    updatedAt: stamp,
    lastSeenAt: stamp,
  };
  return upsert(next);
}

export function markPresenceOffline(email?: string | null, displayName = 'Operador') {
  const userKey = resolvePresenceUserKey(email, displayName);
  const current = getPresence(userKey);
  if (!current) return null;
  const stamp = now();
  return upsert({
    ...current,
    module: 'offline',
    availability: 'away',
    awayReason: null,
    awayNote: '',
    updatedAt: stamp,
    lastSeenAt: stamp,
  });
}

/** Stale: sem heartbeat recente vira offline na visão do painel. */
export function pruneStalePresence(maxAgeMs = 1000 * 60 * 8) {
  const state = load();
  const cutoff = Date.now() - maxAgeMs;
  let dirty = false;
  const next = state.entries.map((item) => {
    if (item.module === 'offline') return item;
    const seen = Date.parse(item.lastSeenAt);
    if (!Number.isFinite(seen) || seen >= cutoff) return item;
    dirty = true;
    return {
      ...item,
      module: 'offline' as const,
      availability: 'away' as const,
      awayReason: null,
      awayNote: '',
      updatedAt: now(),
    };
  });
  if (dirty) save({ entries: next });
}

if (typeof window !== 'undefined') {
  window.addEventListener(PROFILE_EVENT, () => {
    /* consumidores reagem via PRESENCE_EVENT após próximo heartbeat */
  });
}
