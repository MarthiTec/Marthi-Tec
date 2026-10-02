import { getPlanById, normalizePlanId, type PartnerModuleId, type PlanId } from './catalog';
import { listCrmLeads } from './crmStore';
import { listPresenceEntries } from './presenceStore';
import { syncBranchToMultiStore, removeBranchFromMultiStore } from './multiStoreStore';
import { nestApiUrl } from '../services/config';

const STORAGE_KEY = 'marthi.ops.clients.v2';
export const MARTHI_CLIENTS_EVENT = 'marthi-clients-updated';

export type MarthiClientStatus = 'active' | 'blocked' | 'inactive';

export type CompanyRelation = 'independent' | 'matrix' | 'branch';

export type ContractingStatus =
  | 'contratacao_iniciada'
  | 'aguardando_pagamento'
  | 'pagamento_aprovado'
  | 'cliente_criado'
  | 'acesso_pendente'
  | 'acesso_ativado'
  | 'bloqueado'
  | 'inativo';

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
  contractingStatus: ContractingStatus;
  paymentOk: boolean;
  monthlyAmount: number;
  contractedAt: string;
  activatedAt?: string;
  firstAccessAt?: string | null;
  lastSeenAt: string | null;
  notes: string;
  passwordConfigured: boolean;
  activationTokenSentAt?: string;
  phoneVerified: boolean;
  phoneVerifiedAt?: string;
  paymentDetails?: MarthiClientPaymentDetails;
  companyType?: CompanyRelation;
  parentClientId?: string | null;
  branchName?: string;
  accessToken?: string;
};

export function generateClientAccessToken(cnpj?: string, email?: string, clientId?: string): string {
  const cleanDoc = (cnpj || '').replace(/\D/g, '') || '00000000000000';
  const docPart = cleanDoc.slice(-6);
  const hashPart = Math.abs(
    (cleanDoc + (email || '')).split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0),
  )
    .toString(36)
    .toUpperCase()
    .padStart(5, '0')
    .slice(-5);
  const prefix = (clientId || 'CLI').replace(/[^a-zA-Z0-9]/g, '').slice(-3).toUpperCase();
  const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TK-${prefix || 'CLI'}-${docPart}-${hashPart}-${randPart}`;
}

type State = {
  clients: MarthiClient[];
};

export const CLIENT_STATUS_LABEL: Record<MarthiClientStatus, string> = {
  active: 'Ativo',
  blocked: 'Bloqueado',
  inactive: 'Inativo',
};

export const CONTRACTING_STATUS_LABEL: Record<ContractingStatus, string> = {
  contratacao_iniciada: 'Contratação Iniciada',
  aguardando_pagamento: 'Aguardando Pagamento',
  pagamento_aprovado: 'Pagamento Aprovado',
  cliente_criado: 'Cliente Criado',
  acesso_pendente: 'Acesso Pendente (Criar Senha)',
  acesso_ativado: 'Acesso Ativado',
  bloqueado: 'Bloqueado',
  inativo: 'Inativo',
};

export function planMonthlyAmount(planId: PlanId): number {
  switch (planId) {
    case 'golden':
      return 597;
    case 'silver':
      return 497;
    case 'bronze':
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
  const paymentOk = raw.paymentOk !== false;
  const status: MarthiClientStatus =
    raw.status === 'blocked' || raw.status === 'inactive' ? raw.status : 'active';

  let contractingStatus: ContractingStatus = raw.contractingStatus || 'acesso_ativado';
  if (!paymentOk) contractingStatus = 'aguardando_pagamento';
  else if (status === 'blocked') contractingStatus = 'bloqueado';
  else if (status === 'inactive') contractingStatus = 'inativo';
  else if (!raw.passwordConfigured) contractingStatus = 'acesso_pendente';
  else contractingStatus = 'acesso_ativado';

  return {
    clientId: raw.clientId || uid(),
    tradeName: (raw.tradeName ?? '').trim() || 'Cliente',
    legalName: raw.legalName?.trim() || undefined,
    document: raw.document?.trim() || undefined,
    phone: raw.phone?.trim() || undefined,
    email: (raw.email ?? '').trim().toLowerCase(),
    planId,
    modules: Array.isArray(raw.modules) ? (raw.modules as PartnerModuleId[]) : [],
    status,
    contractingStatus,
    paymentOk,
    monthlyAmount: typeof raw.monthlyAmount === 'number' ? raw.monthlyAmount : planMonthlyAmount(planId),
    contractedAt: raw.contractedAt || now(),
    activatedAt: raw.activatedAt || (paymentOk ? raw.contractedAt || now() : undefined),
    firstAccessAt: raw.firstAccessAt ?? null,
    lastSeenAt: raw.lastSeenAt ?? null,
    notes: (raw.notes ?? '').trim(),
    passwordConfigured: Boolean(raw.passwordConfigured),
    activationTokenSentAt: raw.activationTokenSentAt,
    phoneVerified: Boolean(raw.phoneVerified),
    phoneVerifiedAt: raw.phoneVerifiedAt,
    paymentDetails: raw.paymentDetails,
    companyType: raw.parentClientId
      ? 'branch'
      : raw.companyType === 'matrix'
        ? 'matrix'
        : 'independent',
    parentClientId: raw.parentClientId?.trim() || null,
    branchName: raw.branchName?.trim() || undefined,
    accessToken: raw.accessToken || generateClientAccessToken(raw.document, raw.email, raw.clientId),
  };
}


/** Seed demo clients */
function seedFromPartnerLeads(existing: MarthiClient[]): MarthiClient[] {
  if (existing.length > 0) return existing;
  const partnerLeads = listCrmLeads().filter((lead) => lead.source === 'partner');
  if (partnerLeads.length === 0) {
    const demoClients: MarthiClient[] = [
      {
        clientId: 'CLI-DEMO-01',
        tradeName: 'Cell Ponto',
        legalName: 'Cell Ponto Telecomunicações LTDA',
        document: '61.506.270/0001-63',
        phone: '(24) 98124-4253',
        email: 'contato@cellponto.com.br',
        accessToken: 'TK-001-000163-CPTR-88A1',
        planId: 'golden',
        modules: ['totem', 'os', 'erp', 'fiscal', 'ecommerce'],
        status: 'active',
        contractingStatus: 'acesso_ativado',
        paymentOk: true,
        monthlyAmount: planMonthlyAmount('golden'),
        contractedAt: now(),
        activatedAt: now(),
        firstAccessAt: now(),
        lastSeenAt: null,
        notes: 'Conta Matriz Cell Ponto',
        passwordConfigured: true,
        phoneVerified: true,
        phoneVerifiedAt: now(),
      },
      {
        clientId: 'CLI-DEMO-02',
        tradeName: 'Loja Bronze (demo)',
        legalName: 'Bronze Comércio e Serviços ME',
        document: '14.890.123/0001-88',
        phone: '(11) 97654-3210',
        email: 'bronze@loja.local',
        planId: 'bronze',
        modules: ['totem'],
        status: 'active',
        contractingStatus: 'aguardando_pagamento',
        paymentOk: false,
        monthlyAmount: planMonthlyAmount('bronze'),
        contractedAt: now(),
        lastSeenAt: null,
        notes: 'Exemplo de contratação aguardando confirmação de pagamento.',
        passwordConfigured: false,
        phoneVerified: false,
      },
    ];

    return demoClients;
  }

    return partnerLeads.map((lead) => {
    return normalizeClient({
      clientId: `CLI-${lead.id}`,
      tradeName: lead.name,
      email: lead.email || `lead-${lead.id}@parceiro.local`,
      phone: lead.whatsapp,
      planId: 'silver',
      modules: ['totem', 'erp'],
      status: 'active',
      contractingStatus: 'acesso_ativado',
      paymentOk: true,
      monthlyAmount: planMonthlyAmount('silver'),
      contractedAt: lead.createdAt || now(),
      passwordConfigured: true,
      phoneVerified: false,
      notes: lead.notes || 'Lead CRM',
    });
  });
}

/** Fallback local para verificação de existência do cliente */
export function verifyClientLogin(
  email: string,
  _password: string,
): { client: MarthiClient } | null {
  const norm = email.trim().toLowerCase();
  const client = listMarthiClients().find((c) => c.email.toLowerCase() === norm);
  if (!client) return null;
  return { client };
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

let isHydrating = false;

export async function hydrateMarthiClientsFromApi(): Promise<MarthiClient[]> {
  if (isHydrating) return listMarthiClients();
  isHydrating = true;
  try {
    const apiUrl = nestApiUrl();
    const res = await fetch(`${apiUrl}/api/v1/admin/clients`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return listMarthiClients();
    const json = await res.json();
    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      const state = load();
      const existingMap = new Map(state.clients.map((c) => [c.clientId, c]));

      for (const item of json.data) {
        const normalized = normalizeClient(item);
        const existing = existingMap.get(normalized.clientId);
        if (existing) {
          existingMap.set(normalized.clientId, {
            ...existing,
            ...normalized,
            accessToken: normalized.accessToken || existing.accessToken,
          });
        } else {
          existingMap.set(normalized.clientId, normalized);
        }
      }

      state.clients = Array.from(existingMap.values());
      save(state);
      return listMarthiClients();
    }
  } catch (err) {
    console.warn('[marthiClientsStore] Hydrate from API fallback:', err);
  } finally {
    isHydrating = false;
  }
  return listMarthiClients();
}

export function regenerateClientAccessToken(clientId: string): string | null {
  const state = load();
  const client = state.clients.find((c) => c.clientId === clientId);
  if (!client) return null;
  const newToken = generateClientAccessToken(client.document, client.email, client.clientId);
  client.accessToken = newToken;
  save(state);
  try {
    const apiUrl = nestApiUrl();
    fetch(`${apiUrl}/api/v1/admin/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(client),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  return newToken;
}

export function getMarthiClient(clientId: string) {
  return listMarthiClients().find((item) => item.clientId === clientId) ?? null;
}

export function upsertMarthiClient(
  input: Partial<MarthiClient> & { tradeName: string; email: string; planId: PlanId },
): MarthiClient {
  const state = load();
  const email = input.email.trim().toLowerCase();
  const docDigits = (input.document || '').replace(/\D/g, '');
  const existingIdx = state.clients.findIndex((item) => {
    if (input.clientId && item.clientId === input.clientId) return true;
    const itemDoc = (item.document || '').replace(/\D/g, '');
    if (docDigits && itemDoc && docDigits === itemDoc) return true;
    if (email && item.email.toLowerCase() === email) return true;
    return false;
  });
  const planId = normalizePlanId(input.planId) ?? 'bronze';
  const parentClientId = input.parentClientId ? input.parentClientId.trim() : null;
  const companyType: CompanyRelation = parentClientId ? 'branch' : input.companyType || 'independent';

  const next = normalizeClient({
    ...(existingIdx >= 0 ? state.clients[existingIdx] : {}),
    ...input,
    email,
    planId,
    parentClientId,
    branchName: input.branchName?.trim() || undefined,
    companyType,
    monthlyAmount: input.monthlyAmount ?? planMonthlyAmount(planId),
    clientId: input.clientId || (existingIdx >= 0 ? state.clients[existingIdx].clientId : uid()),
  });

  if (existingIdx >= 0) state.clients[existingIdx] = next;
  else state.clients.unshift(next);

  // Se for filial, atualiza o status da matriz como 'matrix' e sincroniza
  if (parentClientId) {
    const parent = state.clients.find((c) => c.clientId === parentClientId);
    if (parent) {
      parent.companyType = 'matrix';
      try {
        syncBranchToMultiStore(parent, next);
      } catch {
        /* ignore */
      }
    }
  } else {
    // Se era filial antes e virou independente, remove do multiStore da matriz
    if (existingIdx >= 0 && state.clients[existingIdx]?.parentClientId) {
      try {
        removeBranchFromMultiStore(next.clientId);
      } catch {
        /* ignore */
      }
    }
    state.clients.forEach((c) => {
      const branches = state.clients.filter((other) => other.parentClientId === c.clientId);
      if (branches.length === 0 && c.companyType === 'matrix') {
        c.companyType = 'independent';
      }
    });
  }

  save(state);

  // Persist to Postgres API in background
  try {
    const apiUrl = nestApiUrl();
    fetch(`${apiUrl}/api/v1/admin/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => {});
  } catch {
    /* ignore */
  }

  return next;
}

export function deleteMarthiClient(clientId: string): boolean {
  const state = load();
  const idx = state.clients.findIndex((item) => item.clientId === clientId);
  if (idx < 0) return false;
  const removed = state.clients.splice(idx, 1)[0];
  if (removed?.parentClientId) {
    try {
      removeBranchFromMultiStore(removed.clientId);
    } catch {
      /* ignore */
    }
  }
  state.clients.forEach((c) => {
    if (c.parentClientId === clientId) {
      c.parentClientId = null;
      c.companyType = 'independent';
    }
  });
  save(state);

  try {
    const apiUrl = nestApiUrl();
    fetch(`${apiUrl}/api/v1/admin/clients/${clientId}`, {
      method: 'DELETE',
    }).catch(() => {});
  } catch {
    /* ignore */
  }

  return true;
}

export function listPotentialMatrixClients(excludeClientId?: string): MarthiClient[] {
  const clients = listMarthiClients();
  return clients.filter((c) => {
    if (excludeClientId && c.clientId === excludeClientId) return false;
    // Não pode ser uma filial de outra empresa (não há filial de filial)
    if (c.parentClientId) return false;
    return true;
  });
}

export function getClientBranches(matrixClientId: string): MarthiClient[] {
  const clients = listMarthiClients();
  return clients.filter((c) => c.parentClientId === matrixClientId);
}

export function getClientMatrix(branchClientId: string): MarthiClient | null {
  const clients = listMarthiClients();
  const current = clients.find((c) => c.clientId === branchClientId);
  if (!current?.parentClientId) return null;
  return clients.find((c) => c.clientId === current.parentClientId) ?? null;
}

/**
 * Criação de cliente comercial com envio de token de ativação seguro por e-mail
 * (NUNCA gera ou armazena senhas em texto puro!)
 */
export async function createMarthiClientWithSecureActivation(input: {
  tradeName: string;
  legalName?: string;
  document?: string;
  email: string;
  phone?: string;
  planId: PlanId;
  modules: PartnerModuleId[];
  monthlyAmount?: number;
  status: MarthiClientStatus;
  paymentOk: boolean;
  notes?: string;
  actorName?: string;
  parentClientId?: string | null;
  branchName?: string;
}): Promise<MarthiClient> {
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
    contractingStatus: input.paymentOk ? 'acesso_pendente' : 'aguardando_pagamento',
    notes: input.notes,
    parentClientId: input.parentClientId,
    branchName: input.branchName,
    passwordConfigured: false,
    activationTokenSentAt: input.paymentOk ? now() : undefined,
  });

  // Notifica o backend para pré-registro e envio do link de ativação seguro
  if (input.paymentOk) {
    try {
      const apiUrl = nestApiUrl();
      await fetch(`${apiUrl}/api/v1/admin/clients/resend-activation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-name': input.actorName || 'Administrador Marthi',
        },
        body: JSON.stringify({
          email: client.email,
          clientName: client.tradeName,
          planName: getPlanById(client.planId).name,
        }),
      });
    } catch (err) {
      console.warn('[marthiClientsStore] Backend activation dispatch fallback:', err);
    }
  }

  return client;
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
  if (status === 'blocked') {
    client.paymentOk = false;
    client.contractingStatus = 'bloqueado';
  } else if (status === 'inactive') {
    client.contractingStatus = 'inativo';
  } else if (status === 'active') {
    client.contractingStatus = client.passwordConfigured ? 'acesso_ativado' : 'acesso_pendente';
  }
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
  if (paymentOk && client.status === 'blocked') {
    client.status = 'active';
  }
  client.contractingStatus = paymentOk
    ? client.passwordConfigured
      ? 'acesso_ativado'
      : 'acesso_pendente'
    : 'aguardando_pagamento';
  save(state);
  return client;
}

/**
 * Identifica o pagamento de um cliente e ativa automaticamente seu acesso,
 * disparando e-mail com token seguro para criação da senha e notificação interna.
 */
export async function identifyClientPaymentAndActivate(
  clientId: string,
  details: {
    method: string;
    transactionRef?: string;
    notes?: string;
    identifiedBy?: string;
  },
): Promise<{ ok: boolean; client: MarthiClient | null; message: string }> {
  const state = load();
  const client = state.clients.find((item) => item.clientId === clientId);
  if (!client) return { ok: false, client: null, message: 'Cliente não localizado.' };

  const timestamp = now();
  client.paymentOk = true;
  client.status = 'active';
  client.activatedAt = timestamp;
  client.contractingStatus = client.passwordConfigured ? 'acesso_ativado' : 'acesso_pendente';
  client.activationTokenSentAt = timestamp;
  client.paymentDetails = {
    method: details.method,
    identifiedAt: timestamp,
    transactionRef: details.transactionRef?.trim() || undefined,
    identifiedBy: details.identifiedBy || 'Administrador Marthi',
    notes: details.notes?.trim() || undefined,
  };

  if (details.notes?.trim()) {
    client.notes = client.notes ? `${client.notes}\n[Pagamento]: ${details.notes.trim()}` : details.notes.trim();
  }

  save(state);

  // Aciona a API de confirmação de pagamento para idempotência, geração de token seguro e disparo de e-mails
  try {
    const apiUrl = nestApiUrl();
    await fetch(`${apiUrl}/api/v1/partners/payment-confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        protocol: client.clientId,
        paymentMethod: details.method,
        transactionRef: details.transactionRef,
        notes: details.notes,
      }),
    });
  } catch (err) {
    console.warn('[marthiClientsStore] API payment-confirm call fallback:', err);
  }

  return {
    ok: true,
    client,
    message: `Pagamento de ${client.tradeName} confirmado! Link seguro para criação de senha enviado para ${client.email}.`,
  };
}

/**
 * Reenvia o e-mail com link de ativação / criação de senha
 */
export async function resendClientActivationEmail(
  client: MarthiClient,
  actorName: string,
): Promise<{ success: boolean; message: string }> {
  const timestamp = now();
  const state = load();
  const hit = state.clients.find((c) => c.clientId === client.clientId);
  if (hit) {
    hit.activationTokenSentAt = timestamp;
    save(state);
  }

  try {
    const apiUrl = nestApiUrl();
    const res = await fetch(`${apiUrl}/api/v1/admin/clients/resend-activation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-name': actorName,
      },
      body: JSON.stringify({
        email: client.email,
        clientName: client.tradeName,
        planName: getPlanById(client.planId).name,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        message: json?.error?.message || `Falha ao reenviar e-mail para ${client.email}.`,
      };
    }
    return {
      success: true,
      message: json?.data?.message || `Link de ativação reenviado para ${client.email}.`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : `Falha ao comunicar com o servidor de e-mail.`,
    };
  }
}

/**
 * Solicita redefinição de senha pelo Administrador (sem visualizar senhas)
 */
export async function forceClientPasswordReset(
  client: MarthiClient,
  actorName: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const apiUrl = nestApiUrl();
    const res = await fetch(`${apiUrl}/api/v1/admin/clients/force-reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-name': actorName,
      },
      body: JSON.stringify({
        email: client.email,
        clientName: client.tradeName,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        message: json?.error?.message || `Falha ao enviar e-mail de redefinição para ${client.email}.`,
      };
    }
    return {
      success: true,
      message: json?.data?.message || `E-mail de redefinição de senha enviado para ${client.email}.`,
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : `Falha ao comunicar com o servidor de e-mail.`,
    };
  }
}

/**
 * Dispara código OTP para o WhatsApp / Celular do cliente
 */
export async function sendClientPhoneVerification(
  client: MarthiClient,
): Promise<{ success: boolean; message: string }> {
  if (!client.phone) {
    return { success: false, message: 'O cliente não possui telefone cadastrado.' };
  }
  const clean = client.phone.replace(/\D/g, '');
  try {
    const apiUrl = nestApiUrl();
    const res = await fetch(`${apiUrl}/api/v1/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: clean, name: client.tradeName }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        message: json?.error?.message || 'Falha ao enviar código OTP.',
      };
    }
    return {
      success: true,
      message: json?.data?.message || 'Código OTP enviado via WhatsApp / SMS.',
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Falha ao enviar código de verificação.',
    };
  }
}

export function ingestPartnerSignupToMarthiClients(input: {
  protocol: string;
  tradeName: string;
  legalName?: string;
  document?: string;
  phone?: string;
  email: string;
  planId: PlanId;
  modules: PartnerModuleId[];
  notes?: string;
  paymentOk?: boolean;
}) {
  const client = upsertMarthiClient({
    clientId: `CLI-${input.protocol}`,
    tradeName: input.tradeName,
    legalName: input.legalName,
    document: input.document,
    phone: input.phone,
    email: input.email,
    planId: input.planId,
    modules: input.modules,
    status: 'active',
    paymentOk: input.paymentOk ?? false,
    monthlyAmount: planMonthlyAmount(input.planId),
    contractedAt: now(),
    notes: input.notes ?? `Protocolo ${input.protocol}`,
    passwordConfigured: false,
    activationTokenSentAt: input.paymentOk ? now() : undefined,
    contractingStatus: input.paymentOk ? 'acesso_pendente' : 'aguardando_pagamento',
  });
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
