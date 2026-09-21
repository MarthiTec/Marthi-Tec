/**
 * CRM Marthi — leads (homepage/parceiro/contato), kanban, claim exclusivo e chat.
 */

import { listDemoLeads, type DemoLead, DEMO_PRODUCT_LABEL } from './demoLeadStore';
import { listSellers, type Seller } from './erpRegistry';
import { getAdminState, upsertCustomer } from './adminStore';

const STORAGE_KEY = 'marthi.crm.v2';
export const CRM_EVENT = 'marthi-crm-updated';

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

function load(): State {
  try {
    // Migra v1 → v2 se ainda existir no browser.
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('marthi.crm.v1');
    if (!raw) {
      const initial = empty();
      let boot = migrateDemoLeads(initial);
      boot = seedMockLeads(boot);
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
    if (!state.migratedDemo) {
      state = migrateDemoLeads(state);
      dirty = true;
    }
    if (!state.seededMocks) {
      state = seedMockLeads(state);
      dirty = true;
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

export function createCrmLead(input: {
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
}): { ok: true; lead: CrmLead } | { ok: false; error: string } {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: 'Informe o nome do lead.' };
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
export async function closeCrmLeadAsCustomer(
  leadId: string,
  sellerId: string,
): Promise<{ ok: true; lead: CrmLead; customerId: string } | { ok: false; error: string }> {
  const moved = moveCrmLead(leadId, 'won', sellerId);
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
