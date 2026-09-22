import { getPlanById, normalizePlanId, type PartnerModuleId, type PlanId } from './catalog';
import { listCrmLeads } from './crmStore';
import { listPresenceEntries } from './presenceStore';

const STORAGE_KEY = 'marthi.ops.clients.v1';
export const MARTHI_CLIENTS_EVENT = 'marthi-clients-updated';

export type MarthiClientStatus = 'active' | 'blocked' | 'inactive';

export type MarthiClient = {
  clientId: string;
  tradeName: string;
  email: string;
  planId: PlanId;
  modules: PartnerModuleId[];
  status: MarthiClientStatus;
  paymentOk: boolean;
  monthlyAmount: number;
  contractedAt: string;
  lastSeenAt: string | null;
  notes: string;
};

type State = {
  clients: MarthiClient[];
};

export const CLIENT_STATUS_LABEL: Record<MarthiClientStatus, string> = {
  active: 'Ativo',
  blocked: 'Bloqueado',
  inactive: 'Inativo',
};

export function planMonthlyAmount(planId: PlanId): number {
  switch (planId) {
    case 'bronze':
      return 197;
    case 'silver':
      return 497;
    case 'golden':
      return 597;
    default:
      return 197;
  }
}

function uid() {
  return `CLI-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

function empty(): State {
  return { clients: [] };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients.map(normalizeClient) : [],
    };
  } catch {
    return empty();
  }
}

function save(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(MARTHI_CLIENTS_EVENT));
}

function normalizeClient(raw: Partial<MarthiClient>): MarthiClient {
  const planId = normalizePlanId(raw.planId) ?? 'bronze';
  return {
    clientId: raw.clientId || uid(),
    tradeName: (raw.tradeName ?? '').trim() || 'Cliente',
    email: (raw.email ?? '').trim().toLowerCase(),
    planId,
    modules: Array.isArray(raw.modules) ? (raw.modules as PartnerModuleId[]) : [],
    status: raw.status === 'blocked' || raw.status === 'inactive' ? raw.status : 'active',
    paymentOk: raw.paymentOk !== false,
    monthlyAmount: typeof raw.monthlyAmount === 'number' ? raw.monthlyAmount : planMonthlyAmount(planId),
    contractedAt: raw.contractedAt || now(),
    lastSeenAt: raw.lastSeenAt ?? null,
    notes: (raw.notes ?? '').trim(),
  };
}

function inferPlanFromInterest(interest: string): PlanId {
  const text = interest.toLowerCase();
  if (text.includes('golden') || text.includes('ouro')) return 'golden';
  if (text.includes('silver') || text.includes('prata')) return 'silver';
  if (text.includes('bronze')) return 'bronze';
  return 'bronze';
}

/** Seed a partir de leads parceiro do CRM (quando o store local está vazio). */
function seedFromPartnerLeads(existing: MarthiClient[]): MarthiClient[] {
  if (existing.length > 0) return existing;
  const partnerLeads = listCrmLeads().filter((lead) => lead.source === 'partner');
  if (partnerLeads.length === 0) {
    return [
      {
        clientId: 'CLI-DEMO-01',
        tradeName: 'Cell Ponto (demo)',
        email: 'contato@cellponto.local',
        planId: 'golden',
        modules: ['totem', 'os', 'erp', 'fiscal', 'ecommerce'],
        status: 'active',
        paymentOk: true,
        monthlyAmount: planMonthlyAmount('golden'),
        contractedAt: now(),
        lastSeenAt: null,
        notes: 'Cliente demo do seed local.',
      },
      {
        clientId: 'CLI-DEMO-02',
        tradeName: 'Loja Bronze (demo)',
        email: 'bronze@loja.local',
        planId: 'bronze',
        modules: ['totem'],
        status: 'active',
        paymentOk: false,
        monthlyAmount: planMonthlyAmount('bronze'),
        contractedAt: now(),
        lastSeenAt: null,
        notes: 'Exemplo com pagamento em atraso.',
      },
    ];
  }

  return partnerLeads.map((lead) => {
    const planId = inferPlanFromInterest(lead.interest);
    const tradeMatch = lead.interest.match(/·\s*(.+)$/);
    return normalizeClient({
      clientId: `CLI-${lead.id}`,
      tradeName: tradeMatch?.[1]?.trim() || lead.name,
      email: lead.email || `lead-${lead.id}@parceiro.local`,
      planId,
      modules: [],
      status: 'active',
      paymentOk: true,
      monthlyAmount: planMonthlyAmount(planId),
      contractedAt: lead.createdAt || now(),
      lastSeenAt: null,
      notes: lead.notes || lead.interest,
    });
  });
}

function withPresence(clients: MarthiClient[]): MarthiClient[] {
  const presence = listPresenceEntries();
  return clients.map((client) => {
    const hit = presence.find(
      (entry) => entry.email && entry.email.toLowerCase() === client.email.toLowerCase(),
    );
    if (!hit) return client;
    return { ...client, lastSeenAt: hit.lastSeenAt };
  });
}

export function listMarthiClients() {
  const state = load();
  const seeded = seedFromPartnerLeads(state.clients);
  if (seeded !== state.clients && state.clients.length === 0) {
    save({ clients: seeded });
  }
  return withPresence(seeded).sort((a, b) => a.tradeName.localeCompare(b.tradeName, 'pt-BR'));
}

export function getMarthiClient(clientId: string) {
  return listMarthiClients().find((item) => item.clientId === clientId) ?? null;
}

export function upsertMarthiClient(
  input: Partial<MarthiClient> & { tradeName: string; email: string; planId: PlanId },
): MarthiClient {
  const state = load();
  const email = input.email.trim().toLowerCase();
  const existingIdx = state.clients.findIndex(
    (item) =>
      item.clientId === input.clientId || (email && item.email === email),
  );
  const planId = normalizePlanId(input.planId) ?? 'bronze';
  const next = normalizeClient({
    ...(existingIdx >= 0 ? state.clients[existingIdx] : {}),
    ...input,
    email,
    planId,
    monthlyAmount: input.monthlyAmount ?? planMonthlyAmount(planId),
    clientId: input.clientId || (existingIdx >= 0 ? state.clients[existingIdx].clientId : uid()),
  });
  if (existingIdx >= 0) state.clients[existingIdx] = next;
  else state.clients.unshift(next);
  save(state);
  return next;
}

export function setMarthiClientStatus(
  clientId: string,
  status: MarthiClientStatus,
  notes?: string,
): MarthiClient | null {
  const state = load();
  const client = state.clients.find((item) => item.clientId === clientId);
  if (!client) return null;
  client.status = status;
  if (notes !== undefined) client.notes = notes.trim();
  if (status === 'blocked') client.paymentOk = false;
  save(state);
  return client;
}

export function setMarthiClientPaymentOk(
  clientId: string,
  paymentOk: boolean,
): MarthiClient | null {
  const state = load();
  const client = state.clients.find((item) => item.clientId === clientId);
  if (!client) return null;
  client.paymentOk = paymentOk;
  if (paymentOk && client.status === 'blocked') client.status = 'active';
  save(state);
  return client;
}

export function ingestPartnerSignupToMarthiClients(input: {
  protocol: string;
  tradeName: string;
  email: string;
  planId: PlanId;
  modules: PartnerModuleId[];
  notes?: string;
}) {
  return upsertMarthiClient({
    clientId: `CLI-${input.protocol}`,
    tradeName: input.tradeName,
    email: input.email,
    planId: input.planId,
    modules: input.modules,
    status: 'active',
    paymentOk: true,
    monthlyAmount: planMonthlyAmount(input.planId),
    contractedAt: now(),
    notes: input.notes ?? `Protocolo ${input.protocol}`,
  });
}

export type MarthiDashboardMetrics = {
  payingCount: number;
  monthlyRevenue: number;
  planDistribution: Record<PlanId, number>;
  blockedCount: number;
  inactiveCount: number;
  activeCount: number;
  paymentLateCount: number;
  onlineCount: number;
};

export function getMarthiDashboardMetrics(): MarthiDashboardMetrics {
  const clients = listMarthiClients();
  const presence = listPresenceEntries();
  const onlineEmails = new Set(
    presence
      .filter((entry) => entry.module !== 'offline')
      .map((entry) => entry.email.toLowerCase())
      .filter(Boolean),
  );

  const planDistribution: Record<PlanId, number> = {
    bronze: 0,
    silver: 0,
    golden: 0,
  };

  let monthlyRevenue = 0;
  let payingCount = 0;
  let blockedCount = 0;
  let inactiveCount = 0;
  let activeCount = 0;
  let paymentLateCount = 0;
  let onlineCount = 0;

  for (const client of clients) {
    planDistribution[client.planId] += 1;
    if (client.status === 'active') activeCount += 1;
    if (client.status === 'blocked') blockedCount += 1;
    if (client.status === 'inactive') inactiveCount += 1;
    if (!client.paymentOk) paymentLateCount += 1;
    if (client.status === 'active' && client.paymentOk) {
      payingCount += 1;
      monthlyRevenue += client.monthlyAmount;
    }
    if (client.email && onlineEmails.has(client.email.toLowerCase())) onlineCount += 1;
  }

  return {
    payingCount,
    monthlyRevenue,
    planDistribution,
    blockedCount,
    inactiveCount,
    activeCount,
    paymentLateCount,
    onlineCount,
  };
}

export function clientPresenceLabel(client: MarthiClient): 'online' | 'offline' {
  const presence = listPresenceEntries().find(
    (entry) => entry.email && entry.email.toLowerCase() === client.email.toLowerCase(),
  );
  if (presence && presence.module !== 'offline') return 'online';
  return 'offline';
}

export function planLabel(planId: PlanId) {
  return getPlanById(planId).name;
}
