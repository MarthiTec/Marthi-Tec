import { Router } from 'express';
import { z } from 'zod';
import { preRegisterClientAccount } from '../services/authService.js';
import { createSecureToken } from '../services/tokenService.js';
import { sendInternalNotificationEmail, sendWelcomeEmail } from '../services/emailService.js';
import { pool } from '../db/pool.js';

/**
 * Cadastro público de parceiro, ciclo de contratação e ativação comercial.
 */
export const partnersRouter = Router();

export type ContractingStatus =
  | 'contratacao_iniciada'
  | 'aguardando_pagamento'
  | 'pagamento_aprovado'
  | 'pagamento_recusado'
  | 'pagamento_pendente'
  | 'cliente_criado'
  | 'acesso_pendente'
  | 'acesso_ativado'
  | 'contratacao_cancelada';

export type PartnerSignupRecord = z.infer<typeof signupSchema> & {
  id: string;
  status: ContractingStatus;
  paymentMethod?: string;
  transactionRef?: string;
  paymentConfirmedAt?: string;
  monthlyAmount: number;
  activationTokenSentAt?: string;
  createdAt: string;
  updatedAt: string;
  auditTrail: Array<{
    status: ContractingStatus;
    timestamp: string;
    detail: string;
  }>;
};

const signupSchema = z
  .object({
    planId: z.enum(['bronze', 'silver', 'golden', 'start', 'growth', 'scale']),
    modules: z
      .array(z.enum(['totem', 'presales', 'os', 'erp', 'fiscal', 'ecommerce', 'pdv']))
      .min(1, 'Selecione ao menos um módulo.'),
    documentType: z.enum(['cnpj', 'cpf']),
    document: z.string().min(11).max(18),
    legalName: z.string().min(2).max(180),
    tradeName: z.string().min(2).max(180),
    email: z.string().email(),
    phone: z.string().min(8).max(20),
    zipCode: z.string().min(8).max(9),
    street: z.string().min(2).max(180),
    number: z.string().min(1).max(20),
    complement: z.string().max(120).optional().default(''),
    district: z.string().min(2).max(120),
    city: z.string().min(2).max(120),
    state: z.string().length(2),
    segment: z.string().max(80).optional().default(''),
    contactName: z.string().min(2).max(120),
    contactRole: z.string().max(80).optional().default(''),
    notes: z.string().max(1000).optional().default(''),
    payNow: z.boolean().optional().default(false),
    paymentMethod: z.string().optional().default('pix'),
    transactionRef: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const unique = new Set(data.modules);
    if (unique.size !== data.modules.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['modules'],
        message: 'Módulos duplicados não são permitidos.',
      });
    }
  });

const paymentConfirmSchema = z.object({
  protocol: z.string().min(3),
  paymentMethod: z.string().default('pix'),
  transactionRef: z.string().optional(),
  notes: z.string().optional(),
});

function calculatePlanAmount(planId: string): number {
  switch (planId) {
    case 'golden':
    case 'scale':
      return 597;
    case 'silver':
    case 'growth':
      return 497;
    default:
      return 197;
  }
}

function planDisplayName(planId: string): string {
  switch (planId) {
    case 'golden':
    case 'scale':
      return 'Golden (Completo)';
    case 'silver':
    case 'growth':
      return 'Silver (Intermediário)';
    default:
      return 'Bronze (Essencial)';
  }
}

// In-memory store de contratações com controle de unicidade por e-mail e documento
const signupsStore = new Map<string, PartnerSignupRecord>();
const processedTransactions = new Set<string>();

/**
 * 1. Conclusão da Contratação
 * Registra o pedido de contratação, previne duplicidades e aguarda confirmação de pagamento.
 */
partnersRouter.post('/api/v1/partners/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos no cadastro de parceiro.',
        details: parsed.error.flatten(),
      },
    });
    return;
  }

  const data = parsed.data;
  const cleanDoc = data.document.replace(/\D/g, '');
  const normEmail = data.email.trim().toLowerCase();

  // Verifica se já existe contratação ativa para este cliente (evita clientes duplicados)
  let existingId: string | null = null;
  for (const [id, item] of signupsStore.entries()) {
    if (
      item.email.toLowerCase() === normEmail ||
      item.document.replace(/\D/g, '') === cleanDoc
    ) {
      existingId = id;
      break;
    }
  }

  const id = existingId || `PRT-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  const monthlyAmount = calculatePlanAmount(data.planId);

  const initialStatus: ContractingStatus = data.payNow ? 'pagamento_aprovado' : 'aguardando_pagamento';

  const record: PartnerSignupRecord = {
    ...data,
    id,
    status: initialStatus,
    monthlyAmount,
    createdAt: signupsStore.get(id)?.createdAt || now,
    updatedAt: now,
    auditTrail: [
      ...(signupsStore.get(id)?.auditTrail || []),
      {
        status: 'contratacao_iniciada',
        timestamp: now,
        detail: `Contratação iniciada para plano ${planDisplayName(data.planId)} (${data.tradeName})`,
      },
      {
        status: initialStatus,
        timestamp: now,
        detail: data.payNow
          ? `Pagamento processado imediatamente via ${data.paymentMethod}`
          : 'Aguardando confirmação de pagamento pelo gateway/PIX',
      },
    ],
  };

  signupsStore.set(id, record);

  // Pré-registra a conta com segurança (sem senha em texto puro!)
  try {
    await preRegisterClientAccount({
      email: data.email,
      name: data.contactName || data.tradeName,
      tradeName: data.tradeName,
      clientAccountId: id,
      role: 'admin',
    });
  } catch (err) {
    console.warn('[partners] DB/Memory pre-register account fallback:', err);
  }

  // Se o pagamento já foi aprovado na chamada (ex: confirmação imediata no checkout)
  if (record.status === 'pagamento_aprovado') {
    await executePaymentActivation(record, data.paymentMethod || 'pix', data.transactionRef);
  }

  console.log('[partners] Contratação registrada', {
    id,
    planId: record.planId,
    tradeName: record.tradeName,
    status: record.status,
  });

  res.status(201).json({
    success: true,
    data: {
      id,
      status: record.status,
      monthlyAmount: record.monthlyAmount,
      planName: planDisplayName(record.planId),
      message:
        record.status === 'pagamento_aprovado'
          ? 'Contratação e pagamento confirmados! Link para criação de senha enviado por e-mail.'
          : 'Contratação registrada com sucesso. Aguardando confirmação do pagamento para ativação.',
    },
  });
});

/**
 * 2. Confirmação de Pagamento com Idempotência Estrita
 * Acionado por Webhook de Gateway ou Confirmação Manual pelo Administrador.
 */
partnersRouter.post('/api/v1/partners/payment-confirm', async (req, res, next) => {
  try {
    const body = paymentConfirmSchema.parse(req.body);
    const protocol = body.protocol.trim();

    // 1. Busca registro
    let record = signupsStore.get(protocol);
    if (!record) {
      for (const item of signupsStore.values()) {
        if (
          item.email.toLowerCase() === protocol.toLowerCase() ||
          item.document.replace(/\D/g, '') === protocol.replace(/\D/g, '')
        ) {
          record = item;
          break;
        }
      }
    }

    if (!record) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Contratação não encontrada para o protocolo/cliente informado.' },
      });
      return;
    }

    // 2. Idempotência: se pagamento já confirmado com a mesma transação, retorna sucesso sem duplicar e-mails
    const txKey = body.transactionRef ? `${record.id}:${body.transactionRef}` : `${record.id}:paid`;
    if (
      record.status === 'acesso_ativado' ||
      record.status === 'acesso_pendente' ||
      processedTransactions.has(txKey)
    ) {
      console.log(`[partners] Pagamento já processado para protocolo ${record.id} (idempotência preservada)`);
      res.json({
        success: true,
        data: {
          id: record.id,
          status: record.status,
          alreadyProcessed: true,
          message: 'Pagamento já havia sido confirmado anteriormente. Nenhuma ação duplicada realizada.',
        },
      });
      return;
    }

    processedTransactions.add(txKey);

    // 3. Executa a ativação completa
    await executePaymentActivation(record, body.paymentMethod, body.transactionRef, body.notes);

    res.json({
      success: true,
      data: {
        id: record.id,
        status: record.status,
        message: 'Pagamento confirmado com sucesso! E-mails de boas-vindas e notificação interna enviados.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Consulta de status do ciclo de vida da contratação
 */
partnersRouter.get('/api/v1/partners/status/:protocol', (req, res) => {
  const protocol = req.params.protocol.trim();
  const record = signupsStore.get(protocol);

  if (!record) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Contratação não localizada.' },
    });
    return;
  }

  res.json({
    success: true,
    data: {
      id: record.id,
      tradeName: record.tradeName,
      legalName: record.legalName,
      email: record.email,
      phone: record.phone,
      planId: record.planId,
      planName: planDisplayName(record.planId),
      modules: record.modules,
      status: record.status,
      monthlyAmount: record.monthlyAmount,
      createdAt: record.createdAt,
      paymentConfirmedAt: record.paymentConfirmedAt,
      auditTrail: record.auditTrail,
    },
  });
});

partnersRouter.get('/api/v1/partners/signup/pending', (_req, res) => {
  const items = Array.from(signupsStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);

  res.json({
    success: true,
    data: {
      count: items.length,
      items: items.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        planId: item.planId,
        planName: planDisplayName(item.planId),
        modules: item.modules,
        tradeName: item.tradeName,
        legalName: item.legalName,
        email: item.email,
        phone: item.phone,
        status: item.status,
        monthlyAmount: item.monthlyAmount,
        city: item.city,
        state: item.state,
      })),
    },
  });
});

/**
 * Executa a esteira de ativação do cliente após confirmação efetiva do pagamento:
 * - Atualiza status para 'cliente_criado' e 'acesso_pendente'
 * - Cria token seguro de ativação
 * - Dispara e-mail profissional com a logo para o responsável
 * - Dispara e-mail interno para marthi.tecnologia@gmail.com
 * - Registra logs de auditoria
 */
async function executePaymentActivation(
  record: PartnerSignupRecord,
  paymentMethod: string,
  transactionRef?: string,
  notes?: string,
) {
  const now = new Date().toISOString();
  record.status = 'pagamento_aprovado';
  record.paymentMethod = paymentMethod;
  record.transactionRef = transactionRef || `TX-${Date.now().toString(36).toUpperCase()}`;
  record.paymentConfirmedAt = now;

  record.auditTrail.push({
    status: 'pagamento_aprovado',
    timestamp: now,
    detail: `Pagamento de R$ ${record.monthlyAmount.toFixed(2)} confirmado via ${paymentMethod} (${record.transactionRef})`,
  });

  // 1. Vincula cliente no PostgreSQL se houver pool
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', now())
         ON CONFLICT (document) DO UPDATE
         SET status = 'active', email = $6, phone = $7, updated_at = now()`,
        [
          record.id,
          record.tradeName,
          record.legalName,
          record.documentType,
          record.document,
          record.email,
          record.phone,
          record.contactName,
        ],
      );
    } catch (err) {
      console.warn('[partners] DB client_accounts insert fallback:', err);
    }
  }

  record.status = 'cliente_criado';
  record.auditTrail.push({
    status: 'cliente_criado',
    timestamp: new Date().toISOString(),
    detail: `Cliente ${record.tradeName} ativado na base comercial`,
  });

  // 2. Gera token seguro para criação da senha pelo responsável (sem senha em texto puro!)
  const { rawToken } = await createSecureToken({
    type: 'activation',
    email: record.email,
    clientId: record.id,
    name: record.contactName || record.tradeName,
    ttlHours: 48,
  });

  record.activationTokenSentAt = new Date().toISOString();
  record.status = 'acesso_pendente';
  record.auditTrail.push({
    status: 'acesso_pendente',
    timestamp: new Date().toISOString(),
    detail: `Token seguro de criação de senha gerado e e-mail de boas-vindas despachado para ${record.email}`,
  });

  // 3. E-mail de Boas-Vindas para o Cliente
  try {
    await sendWelcomeEmail({
      toEmail: record.email,
      contactName: record.contactName || record.tradeName,
      companyName: record.tradeName,
      planName: planDisplayName(record.planId),
      monthlyAmount: record.monthlyAmount,
      activationToken: rawToken,
    });
  } catch (err) {
    console.error('[partners] Erro ao enviar e-mail de boas-vindas para o cliente:', err);
  }

  // 4. E-mail Interno para a Marhi Tecnologia (marthi.tecnologia@gmail.com)
  try {
    await sendInternalNotificationEmail({
      companyName: record.tradeName,
      contactName: record.contactName || record.tradeName,
      email: record.email,
      phone: record.phone,
      planName: planDisplayName(record.planId),
      monthlyAmount: record.monthlyAmount,
      paymentMethod: record.paymentMethod,
      paymentStatus: 'Confirmado com Sucesso',
      contractedAt: record.createdAt,
      transactionRef: record.transactionRef,
      clientId: record.id,
    });
  } catch (err) {
    console.error('[partners] Erro ao enviar e-mail interno para a equipe Marhi:', err);
  }
}
