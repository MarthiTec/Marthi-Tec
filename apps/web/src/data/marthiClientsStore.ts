import { getPlanById, normalizePlanId, type PartnerModuleId, type PlanId } from './catalog';
import { listCrmLeads } from './crmStore';
import { listPresenceEntries } from './presenceStore';

const STORAGE_KEY = 'marthi.ops.clients.v1';
const CREDENTIALS_KEY = 'marthi.client.credentials.v1';
export const MARTHI_CLIENTS_EVENT = 'marthi-clients-updated';

export type MarthiClientStatus = 'active' | 'blocked' | 'inactive';

export type MarthiClientPaymentDetails = {
  method: string;
  identifiedAt: string;
  transactionRef?: string;
  identifiedBy?: string;
  notes?: string;
};

export type MarthiClient = {
  clientId: string;
  tradeName: string;
  legalName?: string;
  document?: string;
  phone?: string;
  email: string;
  planId: PlanId;
  modules: PartnerModuleId[];
  status: MarthiClientStatus;
  paymentOk: boolean;
  monthlyAmount: number;
  contractedAt: string;
  lastSeenAt: string | null;
  notes: string;
  password?: string;
  paymentDetails?: MarthiClientPaymentDetails;
};

type State = {
  clients: MarthiClient[];
};

export type ClientCredential = {
  email: string;
  password: string;
  name: string;
  tradeName: string;
  clientId: string;
  active: boolean;
  planId: PlanId;
  modules: PartnerModuleId[];
  createdAt: string;
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
    legalName: raw.legalName?.trim() || undefined,
    document: raw.document?.trim() || undefined,
    phone: raw.phone?.trim() || undefined,
    email: (raw.email ?? '').trim().toLowerCase(),
    planId,
    modules: Array.isArray(raw.modules) ? (raw.modules as PartnerModuleId[]) : [],
    status: raw.status === 'blocked' || raw.status === 'inactive' ? raw.status : 'active',
    paymentOk: raw.paymentOk !== false,
    monthlyAmount: typeof raw.monthlyAmount === 'number' ? raw.monthlyAmount : planMonthlyAmount(planId),
    contractedAt: raw.contractedAt || now(),
    lastSeenAt: raw.lastSeenAt ?? null,
    notes: (raw.notes ?? '').trim(),
    password: raw.password || undefined,
    paymentDetails: raw.paymentDetails,
  };
}

export function listClientCredentials(): ClientCredential[] {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveClientCredentials(creds: ClientCredential[]) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds));
}

export function setClientPassword(
  clientId: string,
  email: string,
  password: string,
  name: string,
  planId: PlanId,
  modules: PartnerModuleId[],
) {
  const list = listClientCredentials();
  const normEmail = email.trim().toLowerCase();
  const idx = list.findIndex((c) => c.email.toLowerCase() === normEmail || c.clientId === clientId);
  const entry: ClientCredential = {
    email: normEmail,
    password,
    name,
    tradeName: name,
    clientId,
    active: true,
    planId,
    modules,
    createdAt: new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  saveClientCredentials(list);
}

export function getClientCredential(email: string): ClientCredential | null {
  const norm = email.trim().toLowerCase();
  return listClientCredentials().find((c) => c.email.toLowerCase() === norm) ?? null;
}

export function verifyClientLogin(
  email: string,
  password: string,
): { client: MarthiClient; cred: ClientCredential } | null {
  const normEmail = email.trim().toLowerCase();
  const list = listClientCredentials();
  const cred = list.find((c) => c.email.toLowerCase() === normEmail);
  if (!cred) return null;
  if (cred.password !== password) return null;
  const client = listMarthiClients().find((c) => c.email.toLowerCase() === normEmail || c.clientId === cred.clientId);
  if (!client) return null;
  return { client, cred };
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
    const demoClients: MarthiClient[] = [
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
        notes: 'Exemplo aguardando confirmação de pagamento.',
      },
    ];

    // Seed default credentials
    setClientPassword('CLI-DEMO-01', 'contato@cellponto.local', '123456', 'Cell Ponto', 'golden', [
      'totem',
      'os',
      'erp',
      'fiscal',
      'ecommerce',
    ]);
    setClientPassword('CLI-DEMO-02', 'bronze@loja.local', '123456', 'Loja Bronze', 'bronze', ['totem']);

    return demoClients;
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
    (item) => item.clientId === input.clientId || (email && item.email === email),
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

export function createMarthiClientWithCredentials(input: {
  tradeName: string;
  legalName?: string;
  document?: string;
  email: string;
  phone?: string;
  password?: string;
  planId: PlanId;
  modules: PartnerModuleId[];
  monthlyAmount?: number;
  status: MarthiClientStatus;
  paymentOk: boolean;
  notes?: string;
}): { client: MarthiClient; initialPassword: string } {
  const initialPassword = input.password?.trim() || `mt${Math.random().toString(36).slice(2, 8)}`;
  const client = upsertMarthiClient({
    tradeName: input.tradeName,
    legalName: input.legalName,
    document: input.document,
    email: input.email,
    phone: input.phone,
    planId: input.planId,
    modules: input.modules,
    monthlyAmount: input.monthlyAmount,
    status: input.status,
    paymentOk: input.paymentOk,
    notes: input.notes,
    password: initialPassword,
  });

  setClientPassword(
    client.clientId,
    client.email,
    initialPassword,
    client.tradeName,
    client.planId,
    client.modules,
  );

  // Send to backend API if available
  void fetch('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: client.email,
      password: initialPassword,
      name: client.tradeName,
      tradeName: client.tradeName,
      clientAccountId: client.clientId,
      role: 'admin',
    }),
  }).catch(() => {});

  return { client, initialPassword };
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

export function identifyClientPaymentAndActivate(
  clientId: string,
  details: {
    method: string;
    transactionRef?: string;
    notes?: string;
    identifiedBy?: string;
  },
): { ok: boolean; client: MarthiClient | null } {
  const state = load();
  const client = state.clients.find((item) => item.clientId === clientId);
  if (!client) return { ok: false, client: null };

  client.paymentOk = true;
  client.status = 'active';
  client.paymentDetails = {
    method: details.method,
    identifiedAt: new Date().toISOString(),
    transactionRef: details.transactionRef?.trim() || undefined,
    identifiedBy: details.identifiedBy || 'Admin Marthi',
    notes: details.notes?.trim() || undefined,
  };
  if (details.notes?.trim()) {
    client.notes = client.notes ? `${client.notes}\n[Pagamento]: ${details.notes.trim()}` : details.notes.trim();
  }

  // Ensure client credentials exist and are active
  const creds = listClientCredentials();
  const cred = creds.find(
    (c) => c.email.toLowerCase() === client.email.toLowerCase() || c.clientId === client.clientId,
  );
  if (cred) {
    cred.active = true;
    saveClientCredentials(creds);
  } else {
    setClientPassword(
      client.clientId,
      client.email,
      'marthi123',
      client.tradeName,
      client.planId,
      client.modules,
    );
  }

  save(state);

  // Send activation to backend API
  void fetch('/api/v1/auth/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: client.email,
      paymentMethod: details.method,
      transactionRef: details.transactionRef,
    }),
  }).catch(() => {});

  return { ok: true, client };
}

export function ingestPartnerSignupToMarthiClients(input: {
  protocol: string;
  tradeName: string;
  email: string;
  planId: PlanId;
  modules: PartnerModuleId[];
  notes?: string;
  password?: string;
}) {
  const client = upsertMarthiClient({
    clientId: `CLI-${input.protocol}`,
    tradeName: input.tradeName,
    email: input.email,
    planId: input.planId,
    modules: input.modules,
    status: 'active',
    paymentOk: false, // Default unconfirmed until identified or webhook
    monthlyAmount: planMonthlyAmount(input.planId),
    contractedAt: now(),
    notes: input.notes ?? `Protocolo ${input.protocol}`,
  });

  const pwd = input.password || 'marthi123';
  setClientPassword(client.clientId, client.email, pwd, client.tradeName, client.planId, client.modules);
  return client;
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
