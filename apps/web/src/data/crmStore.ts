/**
 * CRM Marthi — leads (homepage/parceiro/contato), kanban, claim exclusivo e chat.
 */

import { listDemoLeads, type DemoLead, DEMO_PRODUCT_LABEL } from './demoLeadStore';
import { listSellers, type Seller } from './erpRegistry';
import { getAdminState, upsertCustomer } from './adminStore';

const STORAGE_KEY = 'marthi.crm.v1';
export const CRM_EVENT = 'marthi-crm-updated';

export type CrmStage = 'leads' | 'waiting' | 'attending' | 'payment' | 'won' | 'lost';

export type CrmLeadSource = 'demo' | 'partner' | 'contact' | 'manual' | 'careers';

export type CrmLead = {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  source: CrmLeadSource;
  interest: string;
  value: number;
  stage: CrmStage;
  /** Vendedor responsável — exclusivo enquanto atender. */
  ownerSellerId: string | null;
  ownerName: string;
  claimedAt?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** ID do demo lead / protocolo parceiro, se houver. */
  externalRef?: string;
  /** Cliente criado no painel só após fechar + confirmar pagamento. */
  customerId?: string;
  /** Pagamento confirmado — pré-requisito para virar cliente Marthi. */
  paidAt?: string;
  /** Graduação / segmento (detalhe do negócio). */
  graduation?: string;
  /** Polo / cidade. */
  polo?: string;
  /** Detalhe da fonte (ex.: Meta Lead Ads). */
  sourceInfo?: string;
  /** Oculta contato na UI até o responsável liberar. */
  hideContact?: boolean;
};

export type CrmActivityKind =
  | 'activity'
  | 'comment'
  | 'message'
  | 'schedule'
  | 'task'
  | 'system';

export type CrmActivity = {
  id: string;
  leadId: string;
  kind: CrmActivityKind;
  title: string;
  body: string;
  fromSellerId: string | null;
  fromName: string;
  createdAt: string;
  /** ISO — agendamento / tarefa. */
  dueAt?: string;
};

/** Perfil social do vendedor na rede Marthi CRM. */
export type CrmSellerProfile = {
  sellerId: string;
  displayName: string;
  handle: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  city: string;
  specialty: string;
  whatsapp: string;
  instagram: string;
  linkedin: string;
  website: string;
  publicProfile: boolean;
  updatedAt: string;
};

export type CrmChatKind = 'lead' | 'sellers';

export type CrmMessage = {
  id: string;
  kind: CrmChatKind;
  /** leadId quando kind=lead */
  leadId?: string;
  /** Par de vendedores (ordenados) quando kind=sellers */
  sellerPairKey?: string;
  fromSellerId: string | null;
  fromName: string;
  /** true = mensagem “do lead” (simulação / canal externo). */
  fromLead?: boolean;
  text: string;
  createdAt: string;
};

type State = {
  leads: CrmLead[];
  messages: CrmMessage[];
  profiles: CrmSellerProfile[];
  activities: CrmActivity[];
  migratedDemo: boolean;
};

export const CRM_STAGE_LABEL: Record<CrmStage, string> = {
  leads: 'Leads — primeiro contato',
  waiting: 'Aguardando resposta',
  attending: 'Em atendimento',
  payment: 'Envio link pagamento',
  won: 'Negócio fechado',
  lost: 'Perdido',
};

export const CRM_BOARD_STAGES: CrmStage[] = ['leads', 'waiting', 'attending', 'payment', 'won'];

export const CRM_PIPELINE_STAGES: CrmStage[] = ['leads', 'waiting', 'attending', 'payment', 'won'];

export const CRM_ACTIVITY_LABEL: Record<CrmActivityKind, string> = {
  activity: 'Atividade',
  comment: 'Comentário',
  message: 'Mensagem',
  schedule: 'Agendamento',
  task: 'Tarefa',
  system: 'Sistema',
};

export const CRM_SOURCE_LABEL: Record<CrmLeadSource, string> = {
  demo: 'Demo homepage',
  partner: 'Cadastro parceiro',
  contact: 'Contato',
  manual: 'Manual',
  careers: 'Trabalhe conosco',
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function now() {
  return new Date().toISOString();
}

function empty(): State {
  return { leads: [], messages: [], profiles: [], activities: [], migratedDemo: false };
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = empty();
      save(migrateDemoLeads(initial));
      return load();
    }
    const parsed = JSON.parse(raw) as Partial<State>;
    let state: State = {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      migratedDemo: Boolean(parsed.migratedDemo),
    };
    if (!state.migratedDemo) {
      state = migrateDemoLeads(state);
      save(state);
    }
    return state;
  } catch {
    return empty();
  }
}

function save(state: State) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(CRM_EVENT));
}

function pushActivity(
  state: State,
  input: Omit<CrmActivity, 'id' | 'createdAt'> & { createdAt?: string },
) {
  state.activities.unshift({
    id: uid('ACT'),
    createdAt: input.createdAt ?? now(),
    leadId: input.leadId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    fromSellerId: input.fromSellerId,
    fromName: input.fromName,
    dueAt: input.dueAt,
  });
}

function demoToLead(demo: DemoLead): CrmLead {
  return {
    id: uid('CRM'),
    name: `${demo.firstName} ${demo.lastName}`.trim(),
    email: demo.email,
    whatsapp: demo.whatsapp,
    source: 'demo',
    interest: DEMO_PRODUCT_LABEL[demo.product] ?? demo.product,
    value: 0,
    stage: 'leads',
    ownerSellerId: null,
    ownerName: '',
    notes: '',
    createdAt: demo.createdAt,
    updatedAt: demo.createdAt,
    externalRef: demo.id,
    graduation: '',
    polo: '',
    sourceInfo: 'Demo homepage',
    hideContact: false,
  };
}

function migrateDemoLeads(state: State): State {
  const existing = new Set(state.leads.map((item) => item.externalRef).filter(Boolean));
  const incoming = listDemoLeads()
    .filter((item) => !existing.has(item.id))
    .map(demoToLead);
  for (const lead of incoming) {
    pushActivity(state, {
      leadId: lead.id,
      kind: 'system',
      title: 'Lead criado',
      body: `Lead criado · fonte: ${CRM_SOURCE_LABEL[lead.source]}.`,
      fromSellerId: null,
      fromName: 'Sistema',
      createdAt: lead.createdAt,
    });
    pushActivity(state, {
      leadId: lead.id,
      kind: 'system',
      title: 'Negócio criado',
      body: `Negócio criado para ${lead.name} a partir do lead.`,
      fromSellerId: null,
      fromName: 'Sistema',
      createdAt: lead.createdAt,
    });
  }
  return {
    ...state,
    leads: [...incoming, ...state.leads],
    migratedDemo: true,
  };
}

export function listCrmLeads() {
  return load().leads;
}

export function getCrmLead(id: string) {
  return load().leads.find((item) => item.id === id) ?? null;
}

export function listCrmLeadsByStage(stage: CrmStage) {
  return load().leads.filter((item) => item.stage === stage);
}

export function crmStageTotals(stage: CrmStage) {
  const leads = listCrmLeadsByStage(stage);
  return {
    count: leads.length,
    value: leads.reduce((sum, item) => sum + (item.value || 0), 0),
  };
}

export function resolveCrmSeller(
  userName: string | undefined,
  userEmail: string | undefined,
): { sellerId: string; sellerName: string; seller: Seller | null } {
  const sellers = listSellers(true);
  const email = (userEmail ?? '').trim().toLowerCase();
  const name = (userName ?? '').trim();
  const byEmail = email
    ? sellers.find((item) => item.email.trim().toLowerCase() === email)
    : undefined;
  const byName = name
    ? sellers.find((item) => item.name.trim().toLowerCase() === name.toLowerCase())
    : undefined;
  const seller = byEmail ?? byName ?? null;
  if (seller) {
    return { sellerId: seller.id, sellerName: seller.name, seller };
  }
  return {
    sellerId: `OP-${(email || name || 'vendedor').slice(0, 24)}`,
    sellerName: name || email || 'Vendedor',
    seller: null,
  };
}

export function createCrmLead(input: {
  name: string;
  email?: string;
  whatsapp?: string;
  source: CrmLeadSource;
  interest?: string;
  value?: number;
  notes?: string;
  externalRef?: string;
}): { ok: true; lead: CrmLead } | { ok: false; error: string } {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: 'Informe o nome do lead.' };
  const state = load();
  if (input.externalRef) {
    const dup = state.leads.find((item) => item.externalRef === input.externalRef);
    if (dup) return { ok: true, lead: dup };
  }
  const lead: CrmLead = {
    id: uid('CRM'),
    name,
    email: (input.email ?? '').trim().toLowerCase(),
    whatsapp: (input.whatsapp ?? '').replace(/\D/g, ''),
    source: input.source,
    interest: (input.interest ?? '').trim(),
    value: input.value ?? 0,
    stage: 'leads',
    ownerSellerId: null,
    ownerName: '',
    notes: (input.notes ?? '').trim(),
    createdAt: now(),
    updatedAt: now(),
    externalRef: input.externalRef,
    graduation: '',
    polo: '',
    sourceInfo: CRM_SOURCE_LABEL[input.source],
    hideContact: false,
  };
  state.leads.unshift(lead);
  pushActivity(state, {
    leadId: lead.id,
    kind: 'system',
    title: 'Lead criado',
    body: `Lead criado · fonte: ${CRM_SOURCE_LABEL[lead.source]}.`,
    fromSellerId: null,
    fromName: 'Sistema',
  });
  pushActivity(state, {
    leadId: lead.id,
    kind: 'system',
    title: 'Negócio criado',
    body: `Negócio criado para ${lead.name} a partir do lead.`,
    fromSellerId: null,
    fromName: 'Sistema',
  });
  save(state);
  return { ok: true, lead };
}

/** Homepage demo → CRM. */
export function ingestDemoLeadToCrm(demo: DemoLead) {
  return createCrmLead({
    name: `${demo.firstName} ${demo.lastName}`.trim(),
    email: demo.email,
    whatsapp: demo.whatsapp,
    source: 'demo',
    interest: DEMO_PRODUCT_LABEL[demo.product],
    externalRef: demo.id,
  });
}

export function ingestPartnerLeadToCrm(input: {
  protocol: string;
  tradeName: string;
  contactName: string;
  email: string;
  phone: string;
  planName: string;
}) {
  return createCrmLead({
    name: input.contactName || input.tradeName,
    email: input.email,
    whatsapp: input.phone,
    source: 'partner',
    interest: `Parceiro · ${input.planName} · ${input.tradeName}`,
    notes: `Protocolo ${input.protocol}`,
    externalRef: `partner:${input.protocol}`,
  });
}

export function ingestContactLeadToCrm(input: {
  name: string;
  email?: string;
  whatsapp?: string;
  message?: string;
}) {
  return createCrmLead({
    name: input.name,
    email: input.email,
    whatsapp: input.whatsapp,
    source: 'contact',
    interest: 'Contato site',
    notes: input.message,
  });
}

/** Candidato a vendedor — homepage Trabalhe conosco. */
export function ingestSellerApplicantToCrm(input: {
  name: string;
  whatsapp: string;
  city?: string;
  experience?: string;
}) {
  const city = (input.city ?? '').trim();
  const experience = (input.experience ?? '').trim();
  return createCrmLead({
    name: input.name,
    whatsapp: input.whatsapp,
    source: 'careers',
    interest: 'Candidato a vendedor',
    notes: [city ? `Cidade: ${city}` : '', experience ? `Experiência: ${experience}` : '']
      .filter(Boolean)
      .join('\n'),
    externalRef: `careers:${input.whatsapp.replace(/\D/g, '')}:${input.name.trim().toLowerCase()}`,
  });
}

/**
 * Puxar lead do pool. Só um vendedor por vez.
 * Se já tiver dono diferente → bloqueia.
 */
export function claimCrmLead(
  leadId: string,
  sellerId: string,
  sellerName: string,
): { ok: true; lead: CrmLead } | { ok: false; error: string } {
  const state = load();
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  const lead = state.leads[index];
  if (lead.ownerSellerId && lead.ownerSellerId !== sellerId) {
    return {
      ok: false,
      error: `Lead sob responsabilidade de ${lead.ownerName}. Outro vendedor não pode atender.`,
    };
  }
  const claimedAt = now();
  state.leads[index] = {
    ...lead,
    ownerSellerId: sellerId,
    ownerName: sellerName,
    claimedAt: lead.claimedAt ?? claimedAt,
    stage: lead.stage === 'leads' ? 'attending' : lead.stage,
    updatedAt: claimedAt,
  };
  pushActivity(state, {
    leadId: lead.id,
    kind: 'system',
    title: 'Lead puxado',
    body: `${sellerName} assumiu o atendimento.`,
    fromSellerId: sellerId,
    fromName: sellerName,
    createdAt: claimedAt,
  });
  if (lead.stage === 'leads') {
    pushActivity(state, {
      leadId: lead.id,
      kind: 'system',
      title: 'Etapa alterada',
      body: `Movido para ${CRM_STAGE_LABEL.attending}.`,
      fromSellerId: sellerId,
      fromName: sellerName,
      createdAt: claimedAt,
    });
  }
  save(state);
  return { ok: true, lead: state.leads[index] };
}

export function canSellerAccessLeadChat(lead: CrmLead, sellerId: string) {
  return Boolean(lead.ownerSellerId && lead.ownerSellerId === sellerId);
}

export function moveCrmLead(
  leadId: string,
  stage: CrmStage,
  sellerId: string,
): { ok: true; lead: CrmLead } | { ok: false; error: string } {
  const state = load();
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  const lead = state.leads[index];
  if (!lead.ownerSellerId) {
    return { ok: false, error: 'Puxe o lead antes de mover no funil.' };
  }
  if (lead.ownerSellerId !== sellerId) {
    return { ok: false, error: `Só ${lead.ownerName} pode mover este lead.` };
  }

  const stamped = now();
  state.leads[index] = {
    ...lead,
    stage,
    updatedAt: stamped,
  };
  pushActivity(state, {
    leadId: lead.id,
    kind: 'system',
    title: stage === 'won' ? 'Negócio fechado' : 'Etapa alterada',
    body:
      stage === 'won'
        ? 'Negócio fechado. Continua como lead até confirmar o pagamento e virar cliente Marthi.'
        : stage === 'payment'
          ? 'Link de pagamento enviado. Aguardando confirmação.'
          : `Movido para ${CRM_STAGE_LABEL[stage]}.`,
    fromSellerId: sellerId,
    fromName: lead.ownerName,
    createdAt: stamped,
  });
  save(state);
  return { ok: true, lead: state.leads[index] };
}

/**
 * Confirma pagamento e só então cria o cliente no painel.
 * Exige estágio won (negócio fechado) e responsável.
 */
export function confirmCrmLeadPaidAsCustomer(
  leadId: string,
  sellerId: string,
): { ok: true; lead: CrmLead; customerId: string } | { ok: false; error: string } {
  const state = load();
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  const lead = state.leads[index];
  if (!lead.ownerSellerId) {
    return { ok: false, error: 'Puxe o lead antes de confirmar pagamento.' };
  }
  if (lead.ownerSellerId !== sellerId) {
    return { ok: false, error: `Só ${lead.ownerName} pode confirmar o pagamento.` };
  }
  if (lead.stage !== 'won' && lead.stage !== 'payment') {
    return {
      ok: false,
      error: 'Feche o negócio (ou envie o link de pagamento) antes de confirmar o pagamento.',
    };
  }
  if (lead.customerId) {
    return { ok: true, lead, customerId: lead.customerId };
  }

  const created = promoteLeadToCustomer(lead);
  if (!created.customerId) {
    return { ok: false, error: 'Não foi possível criar o cliente Marthi.' };
  }
  const stamped = now();
  state.leads[index] = {
    ...lead,
    stage: 'won',
    paidAt: stamped,
    customerId: created.customerId,
    updatedAt: stamped,
    notes: lead.notes
      ? `${lead.notes}\n[Pagamento confirmado · cliente ${created.customerId}]`
      : `[Pagamento confirmado · cliente ${created.customerId}]`,
  };
  pushActivity(state, {
    leadId: lead.id,
    kind: 'system',
    title: 'Pagamento confirmado',
    body: `Pagamento ok · lead virou cliente Marthi ${created.customerId}.`,
    fromSellerId: sellerId,
    fromName: lead.ownerName,
    createdAt: stamped,
  });
  save(state);
  return { ok: true, lead: state.leads[index], customerId: created.customerId };
}

/** @deprecated Use confirmCrmLeadPaidAsCustomer — cliente só após pagar. */
export function closeCrmLeadAsCustomer(
  leadId: string,
  sellerId: string,
): { ok: true; lead: CrmLead; customerId: string } | { ok: false; error: string } {
  const moved = moveCrmLead(leadId, 'won', sellerId);
  if (!moved.ok) return moved;
  return confirmCrmLeadPaidAsCustomer(leadId, sellerId);
}

export function listCrmConvertedCustomers() {
  return load().leads.filter((item) => Boolean(item.customerId && item.paidAt));
}

function promoteLeadToCustomer(lead: CrmLead): { customerId: string } {
  upsertCustomer({
    name: lead.name,
    phone: lead.whatsapp,
    email: lead.email,
    document: '',
    city: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    state: '',
    active: true,
  });
  const phoneKey = lead.whatsapp.replace(/\D/g, '');
  const emailKey = lead.email.trim().toLowerCase();
  const customers = getAdminState().customers;
  const found =
    customers.find((item) => phoneKey && item.phone.replace(/\D/g, '') === phoneKey) ??
    customers.find((item) => emailKey && item.email.trim().toLowerCase() === emailKey) ??
    customers.find((item) => item.name.trim().toLowerCase() === lead.name.trim().toLowerCase());
  return { customerId: found?.id ?? '' };
}

export function getCrmSellerProfile(sellerId: string): CrmSellerProfile | null {
  return load().profiles.find((item) => item.sellerId === sellerId) ?? null;
}

export function ensureCrmSellerProfile(
  sellerId: string,
  fallbackName: string,
): CrmSellerProfile {
  const existing = getCrmSellerProfile(sellerId);
  if (existing) return existing;
  const handle = fallbackName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
    .slice(0, 24) || 'vendedor';
  const profile: CrmSellerProfile = {
    sellerId,
    displayName: fallbackName,
    handle,
    bio: 'Vendedor Marthi — configure seu perfil na rede CRM.',
    avatarUrl: '',
    coverUrl: '',
    city: '',
    specialty: 'Comercial',
    whatsapp: '',
    instagram: '',
    linkedin: '',
    website: '',
    publicProfile: true,
    updatedAt: now(),
  };
  const state = load();
  state.profiles.unshift(profile);
  save(state);
  return profile;
}

export function saveCrmSellerProfile(
  input: Partial<CrmSellerProfile> & { sellerId: string; displayName: string },
): { ok: true; profile: CrmSellerProfile } | { ok: false; error: string } {
  const displayName = input.displayName.trim();
  if (displayName.length < 2) return { ok: false, error: 'Informe o nome de exibição.' };
  let handle = (input.handle ?? displayName)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._]/g, '')
    .replace(/^\.|\.$/g, '')
    .slice(0, 24);
  if (!handle) return { ok: false, error: 'Informe um @handle válido.' };

  const state = load();
  const conflict = state.profiles.find(
    (item) => item.handle === handle && item.sellerId !== input.sellerId,
  );
  if (conflict) return { ok: false, error: 'Este @handle já está em uso.' };

  const idx = state.profiles.findIndex((item) => item.sellerId === input.sellerId);
  const base: CrmSellerProfile =
    idx >= 0
      ? state.profiles[idx]
      : {
          sellerId: input.sellerId,
          displayName,
          handle,
          bio: '',
          avatarUrl: '',
          coverUrl: '',
          city: '',
          specialty: 'Comercial',
          whatsapp: '',
          instagram: '',
          linkedin: '',
          website: '',
          publicProfile: true,
          updatedAt: now(),
        };

  const profile: CrmSellerProfile = {
    ...base,
    ...input,
    sellerId: input.sellerId,
    displayName,
    handle,
    bio: (input.bio ?? base.bio).trim(),
    avatarUrl: (input.avatarUrl ?? base.avatarUrl).trim(),
    coverUrl: (input.coverUrl ?? base.coverUrl).trim(),
    city: (input.city ?? base.city).trim(),
    specialty: (input.specialty ?? base.specialty).trim(),
    whatsapp: (input.whatsapp ?? base.whatsapp).replace(/\D/g, ''),
    instagram: (input.instagram ?? base.instagram).trim().replace(/^@/, ''),
    linkedin: (input.linkedin ?? base.linkedin).trim(),
    website: (input.website ?? base.website).trim(),
    publicProfile: input.publicProfile ?? base.publicProfile,
    updatedAt: now(),
  };

  if (idx >= 0) state.profiles[idx] = profile;
  else state.profiles.unshift(profile);
  save(state);
  return { ok: true, profile };
}

export function listCrmPublicProfiles() {
  return load().profiles.filter((item) => item.publicProfile);
}

export function listCrmWonLeads() {
  return load().leads.filter((item) => item.stage === 'won');
}

export function updateCrmLeadValue(
  leadId: string,
  value: number,
  sellerId: string,
): { ok: true; lead: CrmLead } | { ok: false; error: string } {
  const state = load();
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  const lead = state.leads[index];
  if (lead.ownerSellerId !== sellerId) {
    return { ok: false, error: 'Só o vendedor responsável pode alterar o valor.' };
  }
  state.leads[index] = { ...lead, value: Math.max(0, value), updatedAt: now() };
  save(state);
  return { ok: true, lead: state.leads[index] };
}

export function updateCrmLeadDetails(
  leadId: string,
  sellerId: string,
  patch: Partial<
    Pick<
      CrmLead,
      | 'value'
      | 'interest'
      | 'graduation'
      | 'polo'
      | 'sourceInfo'
      | 'notes'
      | 'hideContact'
      | 'email'
      | 'whatsapp'
    >
  >,
): { ok: true; lead: CrmLead } | { ok: false; error: string } {
  const state = load();
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  const lead = state.leads[index];
  if (!lead.ownerSellerId) {
    return { ok: false, error: 'Puxe o lead antes de editar.' };
  }
  if (lead.ownerSellerId !== sellerId) {
    return { ok: false, error: 'Só o responsável pode editar este negócio.' };
  }
  state.leads[index] = {
    ...lead,
    value: patch.value !== undefined ? Math.max(0, patch.value) : lead.value,
    interest: patch.interest !== undefined ? patch.interest.trim() : lead.interest,
    graduation:
      patch.graduation !== undefined ? patch.graduation.trim() : (lead.graduation ?? ''),
    polo: patch.polo !== undefined ? patch.polo.trim() : (lead.polo ?? ''),
    sourceInfo:
      patch.sourceInfo !== undefined ? patch.sourceInfo.trim() : (lead.sourceInfo ?? ''),
    notes: patch.notes !== undefined ? patch.notes : lead.notes,
    hideContact: patch.hideContact ?? lead.hideContact,
    email: patch.email !== undefined ? patch.email.trim().toLowerCase() : lead.email,
    whatsapp:
      patch.whatsapp !== undefined ? patch.whatsapp.replace(/\D/g, '') : lead.whatsapp,
    updatedAt: now(),
  };
  save(state);
  return { ok: true, lead: state.leads[index] };
}

export function listCrmActivities(leadId: string) {
  const state = load();
  let items = state.activities.filter((item) => item.leadId === leadId);
  if (items.length === 0) {
    const lead = state.leads.find((item) => item.id === leadId);
    if (lead) {
      pushActivity(state, {
        leadId: lead.id,
        kind: 'system',
        title: 'Lead criado',
        body: `Lead criado · fonte: ${CRM_SOURCE_LABEL[lead.source]}.`,
        fromSellerId: null,
        fromName: 'Sistema',
        createdAt: lead.createdAt,
      });
      pushActivity(state, {
        leadId: lead.id,
        kind: 'system',
        title: 'Negócio criado',
        body: `Negócio criado para ${lead.name} a partir do lead.`,
        fromSellerId: null,
        fromName: 'Sistema',
        createdAt: lead.createdAt,
      });
      save(state);
      items = state.activities.filter((item) => item.leadId === leadId);
    }
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addCrmActivity(input: {
  leadId: string;
  kind: Exclude<CrmActivityKind, 'system'>;
  title?: string;
  body: string;
  sellerId: string;
  sellerName: string;
  dueAt?: string;
}): { ok: true; activity: CrmActivity } | { ok: false; error: string } {
  const body = input.body.trim();
  if (!body) return { ok: false, error: 'Descreva a atividade.' };
  const state = load();
  const lead = state.leads.find((item) => item.id === input.leadId);
  if (!lead) return { ok: false, error: 'Lead não encontrado.' };
  if (!lead.ownerSellerId) {
    return { ok: false, error: 'Puxe o lead antes de registrar atividades.' };
  }
  if (lead.ownerSellerId !== input.sellerId) {
    return { ok: false, error: `Só ${lead.ownerName} pode registrar neste negócio.` };
  }
  const title = (input.title ?? CRM_ACTIVITY_LABEL[input.kind]).trim();
  const activity: CrmActivity = {
    id: uid('ACT'),
    leadId: input.leadId,
    kind: input.kind,
    title,
    body,
    fromSellerId: input.sellerId,
    fromName: input.sellerName,
    createdAt: now(),
    dueAt: input.dueAt,
  };
  state.activities.unshift(activity);
  state.leads = state.leads.map((item) =>
    item.id === input.leadId ? { ...item, updatedAt: now() } : item,
  );
  save(state);
  return { ok: true, activity };
}

export function addCrmLeadNote(
  leadId: string,
  note: string,
  sellerId: string,
): { ok: true; lead: CrmLead } | { ok: false; error: string } {
  const state = load();
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  const lead = state.leads[index];
  if (lead.ownerSellerId !== sellerId) {
    return { ok: false, error: 'Só o responsável pode anotar neste lead.' };
  }
  const line = note.trim();
  if (!line) return { ok: false, error: 'Informe a observação.' };
  const stamp = new Date().toLocaleString('pt-BR');
  state.leads[index] = {
    ...lead,
    notes: lead.notes ? `${lead.notes}\n[${stamp}] ${line}` : `[${stamp}] ${line}`,
    updatedAt: now(),
  };
  save(state);
  return { ok: true, lead: state.leads[index] };
}

export function sellerPairKey(a: string, b: string) {
  return [a, b].sort().join('::');
}

export function listLeadMessages(leadId: string) {
  return load()
    .messages.filter((item) => item.kind === 'lead' && item.leadId === leadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function listSellerMessages(sellerA: string, sellerB: string) {
  const key = sellerPairKey(sellerA, sellerB);
  return load()
    .messages.filter((item) => item.kind === 'sellers' && item.sellerPairKey === key)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function sendLeadMessage(input: {
  leadId: string;
  sellerId: string;
  sellerName: string;
  text: string;
  /** Simula resposta do lead (MVP). */
  asLead?: boolean;
}): { ok: true; message: CrmMessage } | { ok: false; error: string } {
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Digite a mensagem.' };
  const state = load();
  const lead = state.leads.find((item) => item.id === input.leadId);
  if (!lead) return { ok: false, error: 'Lead não encontrado.' };
  if (!lead.ownerSellerId) {
    return { ok: false, error: 'Puxe o lead antes de conversar.' };
  }
  if (lead.ownerSellerId !== input.sellerId) {
    return {
      ok: false,
      error: `Este lead é de ${lead.ownerName}. Só ele pode conversar.`,
    };
  }
  const message: CrmMessage = {
    id: uid('MSG'),
    kind: 'lead',
    leadId: input.leadId,
    fromSellerId: input.asLead ? null : input.sellerId,
    fromName: input.asLead ? lead.name : input.sellerName,
    fromLead: Boolean(input.asLead),
    text,
    createdAt: now(),
  };
  state.messages.push(message);
  pushActivity(state, {
    leadId: input.leadId,
    kind: 'message',
    title: input.asLead ? 'Mensagem do lead' : 'Mensagem enviada',
    body: text,
    fromSellerId: input.asLead ? null : input.sellerId,
    fromName: input.asLead ? lead.name : input.sellerName,
  });
  save(state);
  return { ok: true, message };
}

export function sendSellerMessage(input: {
  fromSellerId: string;
  fromName: string;
  toSellerId: string;
  text: string;
}): { ok: true; message: CrmMessage } | { ok: false; error: string } {
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Digite a mensagem.' };
  if (input.fromSellerId === input.toSellerId) {
    return { ok: false, error: 'Escolha outro vendedor.' };
  }
  const state = load();
  const message: CrmMessage = {
    id: uid('MSG'),
    kind: 'sellers',
    sellerPairKey: sellerPairKey(input.fromSellerId, input.toSellerId),
    fromSellerId: input.fromSellerId,
    fromName: input.fromName,
    text,
    createdAt: now(),
  };
  state.messages.push(message);
  save(state);
  return { ok: true, message };
}

export function whatsappHref(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  const base = `https://wa.me/55${digits.replace(/^55/, '')}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
