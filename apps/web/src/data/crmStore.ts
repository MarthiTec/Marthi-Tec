/**
 * CRM Marthi — leads (homepage/parceiro/contato), kanban, claim exclusivo e chat.
 */

import { listDemoLeads, type DemoLead, DEMO_PRODUCT_LABEL } from './demoLeadStore';
import { listSellers, type Seller } from './erpRegistry';
import { getAdminState, upsertCustomer } from './adminStore';
import { getOperatorProfile } from './operatorProfile';
import { isNestAuthed } from '../services/nestClient';
import {
  apiClaimCrmLead,
  apiCreateCrmActivity,
  apiCreateCrmLead,
  apiGetCrmProfile,
  apiListCrmActivities,
  apiListCrmLeadMessages,
  apiListCrmLeads,
  apiListCrmSellerMessages,
  apiMoveCrmLead,
  apiPutCrmProfile,
  apiSendCrmLeadMessage,
  apiSendCrmSellerMessage,
  apiUpdateCrmLead,
  type ApiCrmActivity,
  type ApiCrmLead,
  type ApiCrmMessage,
  type ApiCrmSellerProfile,
} from '../services/erpApi';

const STORAGE_KEY = 'marthi.crm.v2';
export const CRM_EVENT = 'marthi-crm-updated';
export const CRM_ALERT_EVENT = 'marthi-crm-alert';
export const CRM_ALERT_STORAGE_KEY = 'marthi.crm.alert';

export type CrmSellerAlert = {
  id: string;
  kind: 'lead' | 'message';
  title: string;
  body: string;
  leadId: string;
  createdAt: string;
};

function emitCrmSellerAlert(input: {
  kind: 'lead' | 'message';
  title: string;
  body: string;
  leadId: string;
}) {
  if (typeof window === 'undefined') return;
  const alert: CrmSellerAlert = {
    id: uid('ALERT'),
    kind: input.kind,
    title: input.title,
    body: input.body.slice(0, 180),
    leadId: input.leadId,
    createdAt: now(),
  };
  try {
    localStorage.setItem(CRM_ALERT_STORAGE_KEY, JSON.stringify(alert));
  } catch {
    /* quota */
  }
  window.dispatchEvent(new CustomEvent(CRM_ALERT_EVENT, { detail: alert }));
}

export const CRM_INTEREST_OPTIONS = [
  'Totem de autoatendimento',
  'Caixa / PDV',
  'OS / Oficina',
  'Emissor fiscal',
  'E-commerce',
  'CRM Marthi',
  'ERP completo',
  'Parceiro lojista',
  'Plano mensal Marthi',
  'Candidato a vendedor',
] as const;

export const CRM_SEGMENT_OPTIONS = [
  'Loja de celulares',
  'Assistência técnica',
  'Ótica',
  'Farmácia',
  'Clínica / saúde',
  'Varejo geral',
  'E-commerce próprio',
  'Outro',
] as const;

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
  /** Leads de demonstração do funil Marthi. */
  seededMocks: boolean;
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
  return {
    leads: [],
    messages: [],
    profiles: [],
    activities: [],
    migratedDemo: false,
    seededMocks: false,
  };
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function nestError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function mapLead(row: ApiCrmLead): CrmLead {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? '',
    whatsapp: row.whatsapp ?? '',
    source: row.source,
    interest: row.interest ?? '',
    value: row.value ?? 0,
    stage: row.stage,
    ownerSellerId: row.ownerSellerId ?? null,
    ownerName: row.ownerName ?? '',
    claimedAt: row.claimedAt ?? undefined,
    notes: row.notes ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    externalRef: row.externalRef,
    customerId: row.customerId,
    paidAt: row.paidAt ?? undefined,
    graduation: row.graduation ?? undefined,
    polo: row.polo ?? undefined,
    sourceInfo: row.sourceInfo ?? undefined,
    hideContact: Boolean(row.hideContact),
  };
}

function mapActivity(row: ApiCrmActivity): CrmActivity {
  return {
    id: row.id,
    leadId: row.leadId,
    kind: row.kind,
    title: row.title ?? '',
    body: row.body ?? '',
    fromSellerId: row.fromSellerId ?? null,
    fromName: row.fromName ?? '',
    createdAt: row.createdAt,
    dueAt: row.dueAt ?? undefined,
  };
}

function mapMessage(row: ApiCrmMessage): CrmMessage {
  return {
    id: row.id,
    kind: row.kind === 'sellers' ? 'sellers' : 'lead',
    leadId: row.leadId,
    sellerPairKey: row.sellerPairKey,
    fromSellerId: row.fromSellerId ?? null,
    fromName: row.fromName ?? '',
    fromLead: Boolean(row.fromLead),
    text: row.text ?? row.body ?? '',
    createdAt: row.createdAt,
  };
}

function mapProfile(row: ApiCrmSellerProfile): CrmSellerProfile {
  return {
    sellerId: row.sellerId,
    displayName: row.displayName,
    handle: row.handle ?? '',
    bio: row.bio ?? '',
    avatarUrl: row.avatarUrl ?? '',
    coverUrl: row.coverUrl ?? '',
    city: row.city ?? '',
    specialty: row.specialty ?? '',
    whatsapp: row.whatsapp ?? '',
    instagram: row.instagram ?? '',
    linkedin: row.linkedin ?? '',
    website: row.website ?? '',
    publicProfile: Boolean(row.publicProfile),
    updatedAt: row.updatedAt,
  };
}

function putLead(state: State, lead: CrmLead) {
  const idx = state.leads.findIndex((item) => item.id === lead.id);
  if (idx >= 0) state.leads[idx] = lead;
  else state.leads = [lead, ...state.leads];
}

function putActivity(state: State, activity: CrmActivity) {
  const idx = state.activities.findIndex((item) => item.id === activity.id);
  if (idx >= 0) state.activities[idx] = activity;
  else state.activities = [activity, ...state.activities];
}

function putMessage(state: State, message: CrmMessage) {
  const idx = state.messages.findIndex((item) => item.id === message.id);
  if (idx >= 0) state.messages[idx] = message;
  else state.messages = [...state.messages, message];
}

function putProfile(state: State, profile: CrmSellerProfile) {
  const idx = state.profiles.findIndex((item) => item.sellerId === profile.sellerId);
  if (idx >= 0) state.profiles[idx] = profile;
  else state.profiles = [profile, ...state.profiles];
}

/** Substitui fatias do CRM (bootstrap Nest). */
export function replaceCrmState(partial: Partial<State>) {
  const state = load();
  save({
    leads: partial.leads ?? state.leads,
    messages: partial.messages ?? state.messages,
    profiles: partial.profiles ?? state.profiles,
    activities: partial.activities ?? state.activities,
    migratedDemo: partial.migratedDemo ?? state.migratedDemo,
    seededMocks: partial.seededMocks ?? state.seededMocks,
  });
}

export async function hydrateCrmFromApi() {
  if (!isNestAuthed()) return;
  const leads = await apiListCrmLeads();
  const mapped = leads.map(mapLead);
  // Nest é a fonte de verdade: remove mocks locais e mantém mensagens/atividades só se ainda forem do Nest.
  const nestLeadIds = new Set(mapped.map((item) => item.id));
  const state = load();
  replaceCrmState({
    leads: mapped,
    messages: state.messages.filter(
      (item) => item.kind === 'sellers' || (item.leadId && nestLeadIds.has(item.leadId)),
    ).filter((item) => !item.leadId?.startsWith('CRM-MOCK')),
    activities: state.activities.filter(
      (item) => nestLeadIds.has(item.leadId) && !item.leadId.startsWith('CRM-MOCK'),
    ),
    profiles: state.profiles,
    migratedDemo: true,
    seededMocks: true,
  });
}

/** Carrega atividades + mensagens de um lead sob demanda. */
export async function refreshCrmLeadThreadFromApi(leadId: string) {
  if (!isNestAuthed()) return;
  try {
    const [activities, messages] = await Promise.all([
      apiListCrmActivities(leadId),
      apiListCrmLeadMessages(leadId),
    ]);
    const state = load();
    state.activities = [
      ...activities.map(mapActivity),
      ...state.activities.filter((item) => item.leadId !== leadId),
    ];
    state.messages = [
      ...state.messages.filter((item) => !(item.kind === 'lead' && item.leadId === leadId)),
      ...messages.map(mapMessage),
    ];
    save(state);
  } catch {
    /* keep cache */
  }
}

export async function refreshCrmSellerMessagesFromApi(sellerA: string, sellerB: string) {
  if (!isNestAuthed()) return;
  try {
    const messages = await apiListCrmSellerMessages(sellerA, sellerB);
    const key = sellerPairKey(sellerA, sellerB);
    const state = load();
    state.messages = [
      ...state.messages.filter((item) => !(item.kind === 'sellers' && item.sellerPairKey === key)),
      ...messages.map(mapMessage),
    ];
    save(state);
  } catch {
    /* keep cache */
  }
}

function load(): State {
  try {
    // Migra v1 → v2 se ainda existir no browser.
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('marthi.crm.v1');
    const nestMode = isNestAuthed();
    if (!raw) {
      const initial = empty();
      let boot = nestMode ? initial : migrateDemoLeads(initial);
      if (!nestMode) boot = seedMockLeads(boot);
      else boot = { ...boot, migratedDemo: true, seededMocks: true };
      save(boot);
      return load();
    }
    const parsed = JSON.parse(raw) as Partial<State>;
    let state: State = {
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      migratedDemo: Boolean(parsed.migratedDemo),
      seededMocks: Boolean(parsed.seededMocks),
    };
    let dirty = false;
    if (nestMode) {
      // Nest authed: nunca injeta CRM-MOCK-* e marca seed como feito.
      if (!state.seededMocks) {
        state = { ...state, seededMocks: true, migratedDemo: true };
        dirty = true;
      }
    } else {
      if (!state.migratedDemo) {
        state = migrateDemoLeads(state);
        dirty = true;
      }
      if (!state.seededMocks) {
        state = seedMockLeads(state);
        dirty = true;
      }
    }
    if (dirty) save(state);
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

function buildMockCatalog(sellers: Seller[]): Array<{
  lead: CrmLead;
  activities: Omit<CrmActivity, 'id'>[];
  messages: Omit<CrmMessage, 'id'>[];
}> {
  const bruno = sellers.find((item) => /bruno/i.test(item.name)) ?? sellers[0] ?? null;
  const camilaName = 'Camila Santos';
  const camilaId = 'VEN-MOCK-CAMILA';

  const catalog: Array<{
    lead: CrmLead;
    activities: Omit<CrmActivity, 'id'>[];
    messages: Omit<CrmMessage, 'id'>[];
  }> = [
    {
      lead: {
        id: 'CRM-MOCK-01',
        name: 'Renata Oliveira | CellMix Três Rios',
        email: 'renata@cellmix.local',
        whatsapp: '24998112233',
        source: 'demo',
        interest: 'Totem de autoatendimento',
        value: 1890,
        stage: 'leads',
        ownerSellerId: null,
        ownerName: '',
        notes: 'Pediu demo do totem na homepage. Quer 2 unidades.',
        createdAt: hoursAgo(5),
        updatedAt: hoursAgo(5),
        externalRef: 'mock:totem-renata',
        graduation: 'Loja de celulares',
        polo: 'Três Rios — RJ',
        sourceInfo: 'Demo homepage · Totem',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-01',
          kind: 'system',
          title: 'Lead criado',
          body: 'Lead criado · fonte: Demo homepage.',
          fromSellerId: null,
          fromName: 'Sistema',
          createdAt: hoursAgo(5),
        },
        {
          leadId: 'CRM-MOCK-01',
          kind: 'comment',
          title: 'Comentário',
          body: 'Loja no Shopping Olga Sola — alto fluxo de sábado.',
          fromSellerId: null,
          fromName: 'Sistema',
          createdAt: hoursAgo(4.5),
        },
      ],
      messages: [],
    },
    {
      lead: {
        id: 'CRM-MOCK-02',
        name: 'João Pedro Ferreira',
        email: 'jp.ferreira@gmail.com',
        whatsapp: '24991234567',
        source: 'contact',
        interest: 'Caixa / PDV',
        value: 990,
        stage: 'leads',
        ownerSellerId: null,
        ownerName: '',
        notes: 'Contato pelo formulário do site. Troca de sistema atual.',
        createdAt: hoursAgo(28),
        updatedAt: hoursAgo(26),
        externalRef: 'mock:pdv-joao',
        graduation: 'Assistência técnica',
        polo: 'Petrópolis — RJ',
        sourceInfo: 'Formulário contato · site',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-02',
          kind: 'system',
          title: 'Lead criado',
          body: 'Lead criado · fonte: Contato.',
          fromSellerId: null,
          fromName: 'Sistema',
          createdAt: hoursAgo(28),
        },
      ],
      messages: [],
    },
    {
      lead: {
        id: 'CRM-MOCK-03',
        name: 'Marina Souza · Ótica Vision',
        email: 'marina@oticavision.local',
        whatsapp: '21988776655',
        source: 'partner',
        interest: 'ERP completo',
        value: 2490,
        stage: 'waiting',
        ownerSellerId: bruno?.id ?? null,
        ownerName: bruno?.name ?? '',
        claimedAt: hoursAgo(20),
        notes: 'Cadastro parceiro — plano profissional.',
        createdAt: hoursAgo(30),
        updatedAt: hoursAgo(6),
        externalRef: 'mock:partner-marina',
        graduation: 'Ótica',
        polo: 'Niterói — RJ',
        sourceInfo: 'Cadastro parceiro · plano Pro',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-03',
          kind: 'system',
          title: 'Lead puxado',
          body: `${bruno?.name ?? 'Vendedor'} assumiu o atendimento.`,
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          createdAt: hoursAgo(20),
        },
        {
          leadId: 'CRM-MOCK-03',
          kind: 'message',
          title: 'Mensagem enviada',
          body: 'Marina, enviei o link da demo do ERP. Me avisa se abriu?',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          createdAt: hoursAgo(18),
        },
        {
          leadId: 'CRM-MOCK-03',
          kind: 'schedule',
          title: 'Agendamento',
          body: 'Call de apresentação amanhã às 10h.',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          createdAt: hoursAgo(12),
          dueAt: hoursAgo(-18),
        },
      ],
      messages: [
        {
          kind: 'lead',
          leadId: 'CRM-MOCK-03',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          text: 'Marina, enviei o link da demo do ERP. Me avisa se abriu?',
          createdAt: hoursAgo(18),
        },
      ],
    },
    {
      lead: {
        id: 'CRM-MOCK-04',
        name: 'Carlos Mendes | TechPhone',
        email: 'carlos@techphone.local',
        whatsapp: '24997654321',
        source: 'demo',
        interest: 'OS / Oficina',
        value: 1290,
        stage: 'waiting',
        ownerSellerId: camilaId,
        ownerName: camilaName,
        claimedAt: hoursAgo(40),
        notes: 'Quer OS + estoque de peças.',
        createdAt: hoursAgo(48),
        updatedAt: hoursAgo(8),
        externalRef: 'mock:os-carlos',
        graduation: 'Assistência técnica',
        polo: 'Três Rios — RJ',
        sourceInfo: 'Demo homepage · OS',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-04',
          kind: 'system',
          title: 'Lead puxado',
          body: `${camilaName} assumiu o atendimento.`,
          fromSellerId: camilaId,
          fromName: camilaName,
          createdAt: hoursAgo(40),
        },
        {
          leadId: 'CRM-MOCK-04',
          kind: 'task',
          title: 'Tarefa',
          body: 'Enviar vídeo do kanban de OS.',
          fromSellerId: camilaId,
          fromName: camilaName,
          createdAt: hoursAgo(36),
          dueAt: hoursAgo(-4),
        },
      ],
      messages: [
        {
          kind: 'lead',
          leadId: 'CRM-MOCK-04',
          fromSellerId: camilaId,
          fromName: camilaName,
          text: 'Carlos, a OS tem quadro kanban e agenda. Quer que eu mostre ao vivo?',
          createdAt: hoursAgo(35),
        },
        {
          kind: 'lead',
          leadId: 'CRM-MOCK-04',
          fromSellerId: null,
          fromName: 'Carlos Mendes',
          fromLead: true,
          text: 'Quero sim, pode ser depois das 16h.',
          createdAt: hoursAgo(34),
        },
      ],
    },
    {
      lead: {
        id: 'CRM-MOCK-05',
        name: 'Farmácia Vida Plena',
        email: 'compras@vidaplena.local',
        whatsapp: '21995551234',
        source: 'contact',
        interest: 'Emissor fiscal',
        value: 790,
        stage: 'attending',
        ownerSellerId: bruno?.id ?? null,
        ownerName: bruno?.name ?? '',
        claimedAt: hoursAgo(72),
        notes: 'NF-e + NFC-e para balcão.',
        createdAt: hoursAgo(80),
        updatedAt: hoursAgo(3),
        externalRef: 'mock:fiscal-farmacia',
        graduation: 'Farmácia',
        polo: 'Nova Friburgo — RJ',
        sourceInfo: 'WhatsApp comercial Marthi',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-05',
          kind: 'activity',
          title: 'Atividade',
          body: 'Reunião: mapeou CST e CFOP do estoque atual.',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          createdAt: hoursAgo(24),
        },
      ],
      messages: [
        {
          kind: 'lead',
          leadId: 'CRM-MOCK-05',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          text: 'Enviei a proposta do emissor com NF-e e NFS-e.',
          createdAt: hoursAgo(10),
        },
      ],
    },
    {
      lead: {
        id: 'CRM-MOCK-06',
        name: 'Luciana Prado',
        email: 'luciana.prado@outlook.com',
        whatsapp: '24990001122',
        source: 'demo',
        interest: 'E-commerce',
        value: 1590,
        stage: 'attending',
        ownerSellerId: camilaId,
        ownerName: camilaName,
        claimedAt: hoursAgo(50),
        notes: 'Quer ML + site próprio integrados ao estoque.',
        createdAt: hoursAgo(60),
        updatedAt: hoursAgo(2),
        externalRef: 'mock:ecom-luciana',
        graduation: 'E-commerce próprio',
        polo: 'Volta Redonda — RJ',
        sourceInfo: 'Demo homepage · E-commerce',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-06',
          kind: 'comment',
          title: 'Comentário',
          body: 'Já vende no Mercado Livre — prioridade é sincronizar estoque.',
          fromSellerId: camilaId,
          fromName: camilaName,
          createdAt: hoursAgo(14),
        },
      ],
      messages: [],
    },
    {
      lead: {
        id: 'CRM-MOCK-07',
        name: 'Diego Ramos · Phone House',
        email: 'diego@phonehouse.local',
        whatsapp: '24993334455',
        source: 'partner',
        interest: 'Plano mensal Marthi',
        value: 3490,
        stage: 'attending',
        ownerSellerId: bruno?.id ?? null,
        ownerName: bruno?.name ?? '',
        claimedAt: hoursAgo(90),
        notes: 'Pacote Totem + Caixa + OS.',
        createdAt: hoursAgo(100),
        updatedAt: hoursAgo(1),
        externalRef: 'mock:plano-diego',
        graduation: 'Loja de celulares',
        polo: 'Juiz de Fora — MG',
        sourceInfo: 'Parceiro · indicação Ana',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-07',
          kind: 'activity',
          title: 'Atividade',
          body: 'Visitou a loja — aprovou layout do totem.',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          createdAt: hoursAgo(30),
        },
      ],
      messages: [
        {
          kind: 'lead',
          leadId: 'CRM-MOCK-07',
          fromSellerId: null,
          fromName: 'Diego Ramos',
          fromLead: true,
          text: 'Podemos fechar se o treinamento entrar no pacote.',
          createdAt: hoursAgo(5),
        },
      ],
    },
    {
      lead: {
        id: 'CRM-MOCK-08',
        name: 'Clínica Bem Estar',
        email: 'admin@bemestar.local',
        whatsapp: '2133334455',
        source: 'contact',
        interest: 'CRM Marthi',
        value: 690,
        stage: 'payment',
        ownerSellerId: bruno?.id ?? null,
        ownerName: bruno?.name ?? '',
        claimedAt: hoursAgo(120),
        notes: 'Link de pagamento PIX enviado.',
        createdAt: hoursAgo(140),
        updatedAt: hoursAgo(4),
        externalRef: 'mock:crm-clinica',
        graduation: 'Clínica / saúde',
        polo: 'Rio de Janeiro — RJ',
        sourceInfo: 'Instagram · @marthi.tecnologia',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-08',
          kind: 'system',
          title: 'Etapa alterada',
          body: 'Movido para Envio link pagamento.',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          createdAt: hoursAgo(4),
        },
      ],
      messages: [
        {
          kind: 'lead',
          leadId: 'CRM-MOCK-08',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          text: 'Segue o link PIX do plano CRM. Qualquer dúvida me chama.',
          createdAt: hoursAgo(4),
        },
      ],
    },
    {
      lead: {
        id: 'CRM-MOCK-09',
        name: 'Andreia Lopes',
        email: 'andreia.lopes@empresa.local',
        whatsapp: '24996667788',
        source: 'demo',
        interest: 'Totem de autoatendimento',
        value: 1890,
        stage: 'payment',
        ownerSellerId: camilaId,
        ownerName: camilaName,
        claimedAt: hoursAgo(160),
        notes: 'Aguardando confirmação do cartão.',
        createdAt: hoursAgo(180),
        updatedAt: hoursAgo(9),
        externalRef: 'mock:totem-andreia',
        graduation: 'Varejo geral',
        polo: 'Barra Mansa — RJ',
        sourceInfo: 'Demo homepage · Totem',
        hideContact: true,
      },
      activities: [],
      messages: [],
    },
    {
      lead: {
        id: 'CRM-MOCK-10',
        name: 'Mercado Express Centro',
        email: 'ti@mercadoexpress.local',
        whatsapp: '24994445566',
        source: 'partner',
        interest: 'ERP completo',
        value: 4200,
        stage: 'won',
        ownerSellerId: bruno?.id ?? null,
        ownerName: bruno?.name ?? '',
        claimedAt: hoursAgo(200),
        notes: 'Fechado — aguarda pagamento final para virar cliente.',
        createdAt: hoursAgo(220),
        updatedAt: hoursAgo(12),
        externalRef: 'mock:erp-mercado',
        graduation: 'Varejo geral',
        polo: 'Três Rios — RJ',
        sourceInfo: 'Parceiro · feira do varejo',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-10',
          kind: 'system',
          title: 'Negócio fechado',
          body: 'Negócio fechado. Continua como lead até confirmar o pagamento.',
          fromSellerId: bruno?.id ?? null,
          fromName: bruno?.name ?? 'Vendedor',
          createdAt: hoursAgo(12),
        },
      ],
      messages: [],
    },
    {
      lead: {
        id: 'CRM-MOCK-11',
        name: 'Patrícia Nunes',
        email: '',
        whatsapp: '24991112233',
        source: 'careers',
        interest: 'Candidato a vendedor',
        value: 0,
        stage: 'leads',
        ownerSellerId: null,
        ownerName: '',
        notes: 'Cidade: Três Rios\nExperiência: 3 anos em varejo de celular',
        createdAt: hoursAgo(10),
        updatedAt: hoursAgo(10),
        externalRef: 'mock:careers-patricia',
        graduation: 'Outro',
        polo: 'Três Rios — RJ',
        sourceInfo: 'Trabalhe conosco · homepage',
        hideContact: false,
      },
      activities: [
        {
          leadId: 'CRM-MOCK-11',
          kind: 'system',
          title: 'Lead criado',
          body: 'Candidata a vendedora via Trabalhe conosco.',
          fromSellerId: null,
          fromName: 'Sistema',
          createdAt: hoursAgo(10),
        },
      ],
      messages: [],
    },
    {
      lead: {
        id: 'CRM-MOCK-12',
        name: 'Gabriel Costa · iFix Hub',
        email: 'gabriel@ifixhub.local',
        whatsapp: '21990008877',
        source: 'demo',
        interest: 'Caixa / PDV',
        value: 990,
        stage: 'waiting',
        ownerSellerId: null,
        ownerName: '',
        notes: 'Pool aberto — interessado em sangria/aporte e vale-troca.',
        createdAt: hoursAgo(15),
        updatedAt: hoursAgo(15),
        externalRef: 'mock:pdv-gabriel',
        graduation: 'Assistência técnica',
        polo: 'Duque de Caxias — RJ',
        sourceInfo: 'Demo homepage · Caixa',
        hideContact: false,
      },
      activities: [],
      messages: [],
    },
  ];

  return catalog;
}

function seedMockLeads(state: State): State {
  const existing = new Set(
    state.leads.map((item) => item.externalRef || item.id).filter(Boolean),
  );
  const sellers = listSellers(true);
  const catalog = buildMockCatalog(sellers);
  const next: State = {
    ...state,
    leads: [...state.leads],
    activities: [...state.activities],
    messages: [...state.messages],
    seededMocks: true,
  };

  for (const entry of catalog) {
    if (existing.has(entry.lead.externalRef ?? '') || existing.has(entry.lead.id)) continue;
    next.leads.unshift(entry.lead);
    for (const activity of entry.activities) {
      next.activities.unshift({
        ...activity,
        id: uid('ACT'),
      });
    }
    for (const message of entry.messages) {
      next.messages.push({
        ...message,
        id: uid('MSG'),
      });
    }
    if (entry.activities.length === 0) {
      pushActivity(next, {
        leadId: entry.lead.id,
        kind: 'system',
        title: 'Lead criado',
        body: `Lead criado · fonte: ${CRM_SOURCE_LABEL[entry.lead.source]}.`,
        fromSellerId: null,
        fromName: 'Sistema',
        createdAt: entry.lead.createdAt,
      });
      pushActivity(next, {
        leadId: entry.lead.id,
        kind: 'system',
        title: 'Negócio criado',
        body: `Negócio criado para ${entry.lead.name} a partir do lead.`,
        fromSellerId: null,
        fromName: 'Sistema',
        createdAt: entry.lead.createdAt,
      });
    }
  }

  return next;
}

/** Reinsere leads mocados (útil se o board estiver vazio). */
export function resetCrmMockLeads(): { ok: true; added: number } {
  if (isNestAuthed()) return { ok: true, added: 0 };
  const state = load();
  state.seededMocks = false;
  const before = state.leads.length;
  const next = seedMockLeads(state);
  save(next);
  return { ok: true, added: Math.max(0, next.leads.length - before) };
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

export async function createCrmLead(input: {
  name: string;
  email?: string;
  whatsapp?: string;
  source: CrmLeadSource;
  interest?: string;
  value?: number;
  notes?: string;
  externalRef?: string;
  stage?: CrmStage;
  graduation?: string;
  polo?: string;
  sourceInfo?: string;
  hideContact?: boolean;
  ownerSellerId?: string | null;
  ownerName?: string;
  /** Não dispara toast/som (ex.: chat homepage que já notifica a mensagem). */
  quiet?: boolean;
}): Promise<{ ok: true; lead: CrmLead } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: 'Informe o nome do lead.' };

  if (isNestAuthed()) {
    try {
      if (input.externalRef) {
        const existing = load().leads.find((item) => item.externalRef === input.externalRef);
        if (existing) return { ok: true, lead: existing };
      }
      const row = await apiCreateCrmLead({
        name,
        email: input.email?.trim() || undefined,
        whatsapp: input.whatsapp?.trim() || undefined,
        source: input.source,
        interest: input.interest?.trim() || undefined,
        value: input.value !== undefined ? Math.max(0, input.value) : undefined,
        notes: input.notes?.trim() || undefined,
        externalRef: input.externalRef || undefined,
        stage: input.stage,
        graduation: input.graduation?.trim() || undefined,
        polo: input.polo?.trim() || undefined,
        sourceInfo: input.sourceInfo?.trim() || undefined,
        hideContact: input.hideContact,
        ownerSellerId: input.ownerSellerId || undefined,
      });
      const lead = mapLead(row);
      const state = load();
      putLead(state, lead);
      save(state);
      if (!input.quiet && input.source !== 'manual') {
        emitCrmSellerAlert({
          kind: 'lead',
          title: lead.name,
          body: [CRM_SOURCE_LABEL[lead.source], lead.interest || lead.notes]
            .filter(Boolean)
            .join(' · '),
          leadId: lead.id,
        });
      }
      return { ok: true, lead };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao criar lead.') };
    }
  }

  const state = load();
  if (input.externalRef) {
    const dup = state.leads.find((item) => item.externalRef === input.externalRef);
    if (dup) return { ok: true, lead: dup };
  }
  const stamped = now();
  const ownerSellerId = input.ownerSellerId ?? null;
  const ownerName = (input.ownerName ?? '').trim();
  const stage =
    input.stage && CRM_BOARD_STAGES.includes(input.stage)
      ? input.stage
      : ownerSellerId
        ? 'attending'
        : 'leads';
  const lead: CrmLead = {
    id: uid('CRM'),
    name,
    email: (input.email ?? '').trim().toLowerCase(),
    whatsapp: (input.whatsapp ?? '').replace(/\D/g, ''),
    source: input.source,
    interest: (input.interest ?? '').trim(),
    value: Math.max(0, input.value ?? 0),
    stage,
    ownerSellerId,
    ownerName: ownerSellerId ? ownerName || 'Vendedor' : '',
    claimedAt: ownerSellerId ? stamped : undefined,
    notes: (input.notes ?? '').trim(),
    createdAt: stamped,
    updatedAt: stamped,
    externalRef: input.externalRef,
    graduation: (input.graduation ?? '').trim(),
    polo: (input.polo ?? '').trim(),
    sourceInfo: (input.sourceInfo ?? '').trim() || CRM_SOURCE_LABEL[input.source],
    hideContact: Boolean(input.hideContact),
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
  if (ownerSellerId) {
    pushActivity(state, {
      leadId: lead.id,
      kind: 'system',
      title: 'Lead atribuído',
      body: `${lead.ownerName} ficou responsável desde a criação.`,
      fromSellerId: ownerSellerId,
      fromName: lead.ownerName,
    });
  }
  save(state);
  if (!input.quiet && input.source !== 'manual') {
    emitCrmSellerAlert({
      kind: 'lead',
      title: lead.name,
      body: [CRM_SOURCE_LABEL[lead.source], lead.interest || lead.notes]
        .filter(Boolean)
        .join(' · '),
      leadId: lead.id,
    });
  }
  return { ok: true, lead };
}

/** Homepage demo → CRM. */
export async function ingestDemoLeadToCrm(demo: DemoLead) {
  return createCrmLead({
    name: `${demo.firstName} ${demo.lastName}`.trim(),
    email: demo.email,
    whatsapp: demo.whatsapp,
    source: 'demo',
    interest: DEMO_PRODUCT_LABEL[demo.product],
    externalRef: demo.id,
  });
}

export async function ingestPartnerLeadToCrm(input: {
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

export async function ingestContactLeadToCrm(input: {
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
export async function ingestSellerApplicantToCrm(input: {
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

/** Interesse em contratar — cadastro pelo login / Solicitar demo leve. */
export async function ingestContractInterestToCrm(input: {
  name: string;
  email: string;
  whatsapp: string;
  company?: string;
  notes?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const company = (input.company ?? '').trim();
  return createCrmLead({
    name: input.name,
    email,
    whatsapp: input.whatsapp,
    source: 'partner',
    interest: 'Contratar sistema Marthi',
    notes: [
      company ? `Empresa: ${company}` : '',
      email ? `E-mail: ${email}` : '',
      (input.notes ?? '').trim(),
    ]
      .filter(Boolean)
      .join('\n'),
    externalRef: `contract:${email || input.whatsapp.replace(/\D/g, '')}`,
  });
}

/**
 * Puxar lead do pool. Só um vendedor por vez.
 * Se já tiver dono diferente → bloqueia.
 */
export async function claimCrmLead(
  leadId: string,
  sellerId: string,
  sellerName: string,
): Promise<{ ok: true; lead: CrmLead } | { ok: false; error: string }> {
  if (isNestAuthed()) {
    try {
      const row = await apiClaimCrmLead(leadId, { sellerId });
      const lead = mapLead(row);
      const state = load();
      putLead(state, lead);
      save(state);
      return { ok: true, lead };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao puxar lead.') };
    }
  }

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

export async function moveCrmLead(
  leadId: string,
  stage: CrmStage,
  sellerId: string,
  sellerName?: string,
): Promise<{ ok: true; lead: CrmLead } | { ok: false; error: string }> {
  if (isNestAuthed()) {
    try {
      const row = await apiMoveCrmLead(leadId, {
        stage,
        sellerId,
      });
      const lead = mapLead(row);
      const state = load();
      putLead(state, lead);
      save(state);
      return { ok: true, lead };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao mover lead.') };
    }
  }

  const state = load();
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  const lead = state.leads[index];
  const stamped = now();
  let working = lead;

  if (!working.ownerSellerId) {
    if (!sellerName?.trim()) {
      return { ok: false, error: 'Puxe o lead antes de mover no funil.' };
    }
    working = {
      ...working,
      ownerSellerId: sellerId,
      ownerName: sellerName.trim(),
      claimedAt: stamped,
      updatedAt: stamped,
    };
    pushActivity(state, {
      leadId: working.id,
      kind: 'system',
      title: 'Lead puxado',
      body: `${working.ownerName} assumiu o atendimento ao mover no funil.`,
      fromSellerId: sellerId,
      fromName: working.ownerName,
      createdAt: stamped,
    });
  } else if (working.ownerSellerId !== sellerId) {
    return { ok: false, error: `Só ${working.ownerName} pode mover este lead.` };
  }

  state.leads[index] = {
    ...working,
    stage,
    updatedAt: stamped,
  };
  pushActivity(state, {
    leadId: working.id,
    kind: 'system',
    title: stage === 'won' ? 'Negócio fechado' : 'Etapa alterada',
    body:
      stage === 'won'
        ? 'Negócio fechado. Continua como lead até confirmar o pagamento e virar cliente Marthi.'
        : stage === 'payment'
          ? 'Link de pagamento enviado. Aguardando confirmação.'
          : `Movido para ${CRM_STAGE_LABEL[stage]}.`,
    fromSellerId: sellerId,
    fromName: working.ownerName,
    createdAt: stamped,
  });
  save(state);
  return { ok: true, lead: state.leads[index] };
}

/**
 * Confirma pagamento e só então cria o cliente no painel.
 * Exige estágio won (negócio fechado) e responsável.
 */
export async function confirmCrmLeadPaidAsCustomer(
  leadId: string,
  sellerId: string,
): Promise<{ ok: true; lead: CrmLead; customerId: string } | { ok: false; error: string }> {
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

  const created = await promoteLeadToCustomer(lead);
  if (!created.customerId) {
    return { ok: false, error: 'Não foi possível criar o cliente Marthi.' };
  }
  const stamped = now();
  const notes = lead.notes
    ? `${lead.notes}\n[Pagamento confirmado · cliente ${created.customerId}]`
    : `[Pagamento confirmado · cliente ${created.customerId}]`;

  if (isNestAuthed()) {
    try {
      if (lead.stage !== 'won') {
        await apiMoveCrmLead(leadId, { stage: 'won', sellerId });
      }
      const row = await apiUpdateCrmLead(leadId, { notes });
      const mapped = mapLead(row);
      const next: CrmLead = {
        ...mapped,
        stage: 'won',
        paidAt: stamped,
        customerId: created.customerId,
        notes,
        updatedAt: stamped,
      };
      const nestState = load();
      putLead(nestState, next);
      save(nestState);
      return { ok: true, lead: next, customerId: created.customerId };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao confirmar pagamento.') };
    }
  }

  state.leads[index] = {
    ...lead,
    stage: 'won',
    paidAt: stamped,
    customerId: created.customerId,
    updatedAt: stamped,
    notes,
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
export async function closeCrmLeadAsCustomer(
  leadId: string,
  sellerId: string,
): Promise<{ ok: true; lead: CrmLead; customerId: string } | { ok: false; error: string }> {
  const moved = await moveCrmLead(leadId, 'won', sellerId);
  if (!moved.ok) return moved;
  return confirmCrmLeadPaidAsCustomer(leadId, sellerId);
}

export function listCrmConvertedCustomers() {
  return load().leads.filter((item) => Boolean(item.customerId && item.paidAt));
}

async function promoteLeadToCustomer(lead: CrmLead): Promise<{ customerId: string }> {
  await upsertCustomer({
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

export async function ensureCrmSellerProfile(
  sellerId: string,
  fallbackName: string,
): Promise<CrmSellerProfile> {
  const existing = getCrmSellerProfile(sellerId);
  if (existing) return existing;

  if (isNestAuthed()) {
    try {
      const row = await apiGetCrmProfile(sellerId);
      const profile = mapProfile(row);
      const state = load();
      putProfile(state, profile);
      save(state);
      return profile;
    } catch {
      /* fallback local below */
    }
  }

  const op = getOperatorProfile(fallbackName);
  const seedName = op.displayName.trim() || fallbackName;
  const handle = seedName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
    .slice(0, 24) || 'vendedor';
  const profile: CrmSellerProfile = {
    sellerId,
    displayName: seedName,
    handle,
    bio: 'Vendedor Marthi — complete seu perfil no CRM interno.',
    avatarUrl: op.photo ?? '',
    coverUrl: '',
    city: '',
    specialty: 'Comercial',
    whatsapp: op.phone,
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

export async function saveCrmSellerProfile(
  input: Partial<CrmSellerProfile> & { sellerId: string; displayName: string },
): Promise<{ ok: true; profile: CrmSellerProfile } | { ok: false; error: string }> {
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

  if (isNestAuthed()) {
    try {
      const row = await apiPutCrmProfile(input.sellerId, {
        displayName,
        handle,
        bio: input.bio,
        avatarUrl: input.avatarUrl,
        coverUrl: input.coverUrl,
        city: input.city,
        specialty: input.specialty,
        whatsapp: input.whatsapp,
        instagram: input.instagram,
        linkedin: input.linkedin,
        website: input.website,
        publicProfile: input.publicProfile,
      });
      const profile = mapProfile(row);
      const state = load();
      putProfile(state, profile);
      save(state);
      return { ok: true, profile };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao salvar perfil.') };
    }
  }

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

export async function updateCrmLeadValue(
  leadId: string,
  value: number,
  sellerId: string,
): Promise<{ ok: true; lead: CrmLead } | { ok: false; error: string }> {
  if (isNestAuthed()) {
    try {
      const row = await apiUpdateCrmLead(leadId, { value: Math.max(0, value) });
      const lead = mapLead(row);
      const state = load();
      putLead(state, lead);
      save(state);
      return { ok: true, lead };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao atualizar valor.') };
    }
  }

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

export async function updateCrmLeadDetails(
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
): Promise<{ ok: true; lead: CrmLead } | { ok: false; error: string }> {
  if (isNestAuthed()) {
    try {
      const body: Parameters<typeof apiUpdateCrmLead>[1] = {};
      if (patch.value !== undefined) body.value = Math.max(0, patch.value);
      if (patch.interest !== undefined) body.interest = patch.interest.trim();
      if (patch.graduation !== undefined) body.graduation = patch.graduation.trim();
      if (patch.polo !== undefined) body.polo = patch.polo.trim();
      if (patch.sourceInfo !== undefined) body.sourceInfo = patch.sourceInfo.trim();
      if (patch.notes !== undefined) body.notes = patch.notes;
      if (patch.hideContact !== undefined) body.hideContact = patch.hideContact;
      if (patch.email !== undefined) body.email = patch.email.trim().toLowerCase();
      if (patch.whatsapp !== undefined) body.whatsapp = patch.whatsapp.replace(/\D/g, '');
      const row = await apiUpdateCrmLead(leadId, body);
      const lead = mapLead(row);
      const state = load();
      putLead(state, lead);
      save(state);
      return { ok: true, lead };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao atualizar lead.') };
    }
  }

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

export async function addCrmActivity(input: {
  leadId: string;
  kind: Exclude<CrmActivityKind, 'system'>;
  title?: string;
  body: string;
  sellerId: string;
  sellerName: string;
  dueAt?: string;
}): Promise<{ ok: true; activity: CrmActivity } | { ok: false; error: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: 'Descreva a atividade.' };

  if (isNestAuthed()) {
    try {
      const row = await apiCreateCrmActivity(input.leadId, {
        kind: input.kind,
        title: input.title?.trim() || undefined,
        body,
        sellerId: input.sellerId,
        dueAt: input.dueAt || undefined,
      });
      const activity = mapActivity(row);
      const state = load();
      putActivity(state, activity);
      const lead = state.leads.find((item) => item.id === input.leadId);
      if (lead) putLead(state, { ...lead, updatedAt: now() });
      save(state);
      return { ok: true, activity };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao registrar atividade.') };
    }
  }

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

export async function addCrmLeadNote(
  leadId: string,
  note: string,
  sellerId: string,
): Promise<{ ok: true; lead: CrmLead } | { ok: false; error: string }> {
  const line = note.trim();
  if (!line) return { ok: false, error: 'Informe a observação.' };

  if (isNestAuthed()) {
    try {
      const activity = await apiCreateCrmActivity(leadId, {
        kind: 'comment',
        title: 'Observação',
        body: line,
        sellerId,
      });
      const state = load();
      putActivity(state, mapActivity(activity));
      const lead = state.leads.find((item) => item.id === leadId);
      if (!lead) return { ok: false, error: 'Lead não encontrado.' };
      const stamp = new Date().toLocaleString('pt-BR');
      const notes = lead.notes ? `${lead.notes}\n[${stamp}] ${line}` : `[${stamp}] ${line}`;
      const row = await apiUpdateCrmLead(leadId, { notes });
      const mapped = mapLead(row);
      putLead(state, mapped);
      save(state);
      return { ok: true, lead: mapped };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao anotar no lead.') };
    }
  }

  const state = load();
  const index = state.leads.findIndex((item) => item.id === leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  const lead = state.leads[index];
  if (lead.ownerSellerId !== sellerId) {
    return { ok: false, error: 'Só o responsável pode anotar neste lead.' };
  }
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

export async function sendLeadMessage(input: {
  leadId: string;
  sellerId: string;
  sellerName: string;
  text: string;
  /** Simula resposta do lead (MVP). */
  asLead?: boolean;
  /** Não dispara toast/som. */
  quiet?: boolean;
}): Promise<{ ok: true; message: CrmMessage } | { ok: false; error: string }> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Digite a mensagem.' };

  if (isNestAuthed()) {
    try {
      const row = await apiSendCrmLeadMessage(input.leadId, {
        text,
        sellerId: input.sellerId,
        asLead: input.asLead,
      });
      const message = mapMessage(row);
      const state = load();
      putMessage(state, message);
      const lead = state.leads.find((item) => item.id === input.leadId);
      if (lead) {
        // claim automático pode ter ocorrido no Nest — refetch leve via patch updatedAt
        putLead(state, { ...lead, updatedAt: now() });
      }
      save(state);
      if (input.asLead && !input.quiet && lead) {
        emitCrmSellerAlert({
          kind: 'message',
          title: lead.name,
          body: text,
          leadId: lead.id,
        });
      }
      return { ok: true, message };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao enviar mensagem.') };
    }
  }

  const state = load();
  const index = state.leads.findIndex((item) => item.id === input.leadId);
  if (index < 0) return { ok: false, error: 'Lead não encontrado.' };
  let lead = state.leads[index];

  if (input.asLead) {
    // Cliente/lead pode falar mesmo sem dono (canal aberto).
  } else if (!lead.ownerSellerId) {
    // Responder no inbox puxa o lead automaticamente.
    lead = {
      ...lead,
      ownerSellerId: input.sellerId,
      ownerName: input.sellerName,
      claimedAt: lead.claimedAt ?? now(),
      stage: lead.stage === 'leads' ? 'attending' : lead.stage,
      updatedAt: now(),
    };
    state.leads[index] = lead;
  } else if (lead.ownerSellerId !== input.sellerId) {
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
  state.leads[index] = { ...state.leads[index], updatedAt: now() };
  pushActivity(state, {
    leadId: input.leadId,
    kind: 'message',
    title: input.asLead ? 'Mensagem do cliente' : 'Mensagem enviada',
    body: text,
    fromSellerId: input.asLead ? null : input.sellerId,
    fromName: input.asLead ? lead.name : input.sellerName,
  });
  save(state);
  if (input.asLead && !input.quiet) {
    emitCrmSellerAlert({
      kind: 'message',
      title: lead.name,
      body: text,
      leadId: lead.id,
    });
  }
  return { ok: true, message };
}

/**
 * Canal público (homepage): cliente inicia/continua conversa com a equipe comercial.
 * Cria lead de contato se necessário e grava mensagem como fromLead.
 */
export async function postHomepageCrmChat(input: {
  name: string;
  whatsapp: string;
  email?: string;
  text: string;
  leadId?: string;
}): Promise<{ ok: true; lead: CrmLead; message: CrmMessage } | { ok: false; error: string }> {
  const name = input.name.trim();
  const whatsapp = input.whatsapp.trim();
  const text = input.text.trim();
  if (!name) return { ok: false, error: 'Informe seu nome.' };
  if (whatsapp.replace(/\D/g, '').length < 8) {
    return { ok: false, error: 'Informe um WhatsApp válido.' };
  }
  if (!text) return { ok: false, error: 'Digite a mensagem.' };

  const phoneKey = whatsapp.replace(/\D/g, '');
  let lead: CrmLead | null = null;
  let createdFresh = false;

  if (input.leadId) {
    lead = getCrmLead(input.leadId);
  }
  if (!lead) {
    lead =
      listCrmLeads().find(
        (item) =>
          item.source === 'contact' &&
          item.whatsapp.replace(/\D/g, '') === phoneKey &&
          item.stage !== 'lost' &&
          item.stage !== 'won',
      ) ?? null;
  }
  if (!lead) {
    const created = await createCrmLead({
      name,
      email: input.email,
      whatsapp,
      source: 'contact',
      interest: 'Chat homepage',
      notes: text,
      stage: 'leads',
      externalRef: `chat:${phoneKey}`,
      quiet: true,
    });
    if (!created.ok) return created;
    lead = created.lead;
    createdFresh = true;
  }

  const result = await sendLeadMessage({
    leadId: lead.id,
    sellerId:
      lead.ownerSellerId ||
      listSellers(true)[0]?.id ||
      'GUEST',
    sellerName: lead.ownerName || listSellers(true)[0]?.name || 'Canal aberto',
    text,
    asLead: true,
    quiet: true,
  });
  if (!result.ok) return result;
  emitCrmSellerAlert({
    kind: createdFresh ? 'lead' : 'message',
    title: name,
    body: text,
    leadId: lead.id,
  });
  const fresh = getCrmLead(lead.id);
  if (!fresh) return { ok: false, error: 'Lead sumiu após a mensagem.' };
  return { ok: true, lead: fresh, message: result.message };
}

export type CrmInboxThread = {
  id: string;
  kind: 'lead' | 'sellers';
  title: string;
  subtitle: string;
  preview: string;
  updatedAt: string;
  unanswered: boolean;
  unreadFromClient: boolean;
  leadId?: string;
  peerSellerId?: string;
  peerSellerName?: string;
  channel: string;
  value?: number;
};

/** Threads do inbox (estilo canais abertos): clientes + colegas. */
export function listCrmInboxThreads(sellerId: string): CrmInboxThread[] {
  const state = load();
  const threads: CrmInboxThread[] = [];

  for (const lead of state.leads) {
    if (lead.stage === 'lost') continue;
    const msgs = state.messages
      .filter((item) => item.kind === 'lead' && item.leadId === lead.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = msgs[msgs.length - 1];
    const lastFromClient = Boolean(last?.fromLead);
    const isMine = lead.ownerSellerId === sellerId;
    const isPool = !lead.ownerSellerId;
    const unanswered = lastFromClient || (isPool && msgs.length > 0);

    if (!msgs.length && !isMine && !(isPool && lead.source === 'contact')) continue;
    if (lead.ownerSellerId && !isMine && !unanswered) continue;

    threads.push({
      id: `lead:${lead.id}`,
      kind: 'lead',
      title: lead.name,
      subtitle: lead.interest || CRM_SOURCE_LABEL[lead.source],
      preview: last?.text || lead.notes || 'Aguardando primeiro contato…',
      updatedAt: last?.createdAt || lead.updatedAt,
      unanswered,
      unreadFromClient: lastFromClient,
      leadId: lead.id,
      channel: CRM_SOURCE_LABEL[lead.source],
      value: lead.value,
    });
  }

  const peerKeys = new Set<string>();
  for (const msg of state.messages) {
    if (msg.kind !== 'sellers' || !msg.sellerPairKey) continue;
    const [a, b] = msg.sellerPairKey.split('::');
    if (a !== sellerId && b !== sellerId) continue;
    peerKeys.add(msg.sellerPairKey);
  }
  for (const key of peerKeys) {
    const [a, b] = key.split('::');
    const peerId = a === sellerId ? b : a;
    const msgs = state.messages
      .filter((item) => item.kind === 'sellers' && item.sellerPairKey === key)
      .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    const last = msgs[msgs.length - 1];
    if (!last) continue;
    const peerName =
      last.fromSellerId === peerId
        ? last.fromName
        : listSellers(true).find((item) => item.id === peerId)?.name || 'Colega';
    threads.push({
      id: `sellers:${key}`,
      kind: 'sellers',
      title: peerName,
      subtitle: 'Chat interno',
      preview: last.text,
      updatedAt: last.createdAt,
      unanswered: last.fromSellerId !== sellerId,
      unreadFromClient: false,
      peerSellerId: peerId,
      peerSellerName: peerName,
      channel: 'Interno',
    });
  }

  return threads.sort((a, b) => {
    if (a.unanswered !== b.unanswered) return a.unanswered ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function crmInboxUnansweredCount(sellerId: string) {
  return listCrmInboxThreads(sellerId).filter((item) => item.unanswered).length;
}

export async function sendSellerMessage(input: {
  fromSellerId: string;
  fromName: string;
  toSellerId: string;
  text: string;
}): Promise<{ ok: true; message: CrmMessage } | { ok: false; error: string }> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Digite a mensagem.' };
  if (input.fromSellerId === input.toSellerId) {
    return { ok: false, error: 'Escolha outro vendedor.' };
  }

  if (isNestAuthed()) {
    try {
      const row = await apiSendCrmSellerMessage({
        fromSellerId: input.fromSellerId,
        toSellerId: input.toSellerId,
        text,
      });
      const message = mapMessage(row);
      const state = load();
      putMessage(state, message);
      save(state);
      return { ok: true, message };
    } catch (error) {
      return { ok: false, error: nestError(error, 'Falha ao enviar mensagem.') };
    }
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
