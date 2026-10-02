import { Router } from 'express';
import { z } from 'zod';
import { preRegisterClientAccount } from '../services/authService.js';
import { createSecureToken } from '../services/tokenService.js';
import { sendInternalNotificationEmail, sendWelcomeEmail } from '../services/emailService.js';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';

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

function resolveRequestFrontendUrl(req: any): string {
  const origin = req.get('origin') || req.get('referer');
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.protocol && u.host && !u.host.includes('localhost:5173')) {
        return `${u.protocol}//${u.host}`;
      }
    } catch {}
  }
  return env.FRONTEND_URL || 'https://marthi-totem.discloud.dev';
}

// In-memory store de fallback para contratações
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
  const frontendUrl = resolveRequestFrontendUrl(req);

  // Verifica se já existe contratação ativa para este cliente (evita clientes duplicados)
  let existingId: string | null = null;

  if (pool) {
    try {
      const existingRes = await pool.query(
        `SELECT id, status, created_at, audit_trail FROM partner_signups
         WHERE lower(email) = $1 OR regexp_replace(document, '\\D', '', 'g') = $2
         LIMIT 1`,
        [normEmail, cleanDoc],
      );
      if (existingRes.rows.length > 0) {
        existingId = existingRes.rows[0].id;
      }
    } catch (err) {
      console.warn('[partners] DB lookup existing signup warning:', err);
    }
  }

  if (!existingId) {
    for (const [id, item] of signupsStore.entries()) {
      if (
        item.email.toLowerCase() === normEmail ||
        item.document.replace(/\D/g, '') === cleanDoc
      ) {
        existingId = id;
        break;
      }
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

  // Persiste no PostgreSQL partner_signups
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO partner_signups (
          id, plan_id, modules, document_type, document, legal_name, trade_name,
          email, phone, zip_code, street, number, complement, district, city,
          state, segment, contact_name, contact_role, notes, status, monthly_amount,
          payment_method, transaction_ref, audit_trail, created_at, updated_at
        ) VALUES (
          $1, $2, $3::jsonb, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22,
          $23, $24, $25::jsonb, $26, $27
        ) ON CONFLICT (id) DO UPDATE SET
          plan_id = $2, modules = $3::jsonb, legal_name = $6, trade_name = $7,
          email = $8, phone = $9, status = $21, monthly_amount = $22,
          audit_trail = $25::jsonb, updated_at = $27`,
        [
          record.id, record.planId, JSON.stringify(record.modules), record.documentType, record.document,
          record.legalName, record.tradeName, record.email, record.phone, record.zipCode,
          record.street, record.number, record.complement || '', record.district, record.city,
          record.state, record.segment || '', record.contactName, record.contactRole || '',
          record.notes || '', record.status, record.monthlyAmount, record.paymentMethod || 'pix',
          record.transactionRef || null, JSON.stringify(record.auditTrail), record.createdAt, record.updatedAt,
        ],
      );
    } catch (err) {
      console.warn('[partners] DB partner_signups save error:', err);
    }
  }

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
    await executePaymentActivation(record, data.paymentMethod || 'pix', data.transactionRef, undefined, frontendUrl);
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
        record.status === 'pagamento_aprovado' || record.status === 'acesso_pendente' || record.status === 'cliente_criado'
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
    const frontendUrl = resolveRequestFrontendUrl(req);

    // 1. Busca registro no DB ou em memória
    let record: PartnerSignupRecord | null = null;

    if (pool) {
      try {
        const dbRes = await pool.query(
          `SELECT * FROM partner_signups
           WHERE id = $1 OR lower(email) = lower($1) OR regexp_replace(document, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
           LIMIT 1`,
          [protocol],
        );
        if (dbRes.rows.length > 0) {
          const row = dbRes.rows[0];
          record = {
            id: row.id,
            payNow: false,
            planId: row.plan_id,
            modules: typeof row.modules === 'string' ? JSON.parse(row.modules) : row.modules,
            documentType: row.document_type,
            document: row.document,
            legalName: row.legal_name,
            tradeName: row.trade_name,
            email: row.email,
            phone: row.phone,
            zipCode: row.zip_code,
            street: row.street,
            number: row.number,
            complement: row.complement || '',
            district: row.district,
            city: row.city,
            state: row.state,
            segment: row.segment || '',
            contactName: row.contact_name,
            contactRole: row.contact_role || '',
            notes: row.notes || '',
            status: row.status,
            monthlyAmount: Number(row.monthly_amount),
            paymentMethod: row.payment_method || 'pix',
            transactionRef: row.transaction_ref,
            paymentConfirmedAt: row.payment_confirmed_at,
            activationTokenSentAt: row.activation_token_sent_at,
            auditTrail: typeof row.audit_trail === 'string' ? JSON.parse(row.audit_trail) : row.audit_trail || [],
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
        }
      } catch (err) {
        console.warn('[partners] DB payment-confirm lookup warning:', err);
      }
    }

    if (!record) {
      record = signupsStore.get(protocol) || null;
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
    await executePaymentActivation(record, body.paymentMethod, body.transactionRef, body.notes, frontendUrl);

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
partnersRouter.get('/api/v1/partners/status/:protocol', async (req, res) => {
  const protocol = req.params.protocol.trim();
  let record: PartnerSignupRecord | null = null;

  if (pool) {
    try {
      const dbRes = await pool.query(
        `SELECT * FROM partner_signups
         WHERE id = $1 OR lower(email) = lower($1) OR regexp_replace(document, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
         LIMIT 1`,
        [protocol],
      );
      if (dbRes.rows.length > 0) {
        const row = dbRes.rows[0];
        record = {
          id: row.id,
          payNow: false,
          planId: row.plan_id,
          modules: typeof row.modules === 'string' ? JSON.parse(row.modules) : row.modules,
          documentType: row.document_type,
          document: row.document,
          legalName: row.legal_name,
          tradeName: row.trade_name,
          email: row.email,
          phone: row.phone,
          zipCode: row.zip_code,
          street: row.street,
          number: row.number,
          complement: row.complement || '',
          district: row.district,
          city: row.city,
          state: row.state,
          segment: row.segment || '',
          contactName: row.contact_name,
          contactRole: row.contact_role || '',
          notes: row.notes || '',
          status: row.status,
          monthlyAmount: Number(row.monthly_amount),
          paymentMethod: row.payment_method || 'pix',
          transactionRef: row.transaction_ref,
          paymentConfirmedAt: row.payment_confirmed_at,
          activationTokenSentAt: row.activation_token_sent_at,
          auditTrail: typeof row.audit_trail === 'string' ? JSON.parse(row.audit_trail) : row.audit_trail || [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    } catch (err) {
      console.warn('[partners] DB status lookup warning:', err);
    }
  }

  if (!record) {
    record = signupsStore.get(protocol) || null;
  }

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

partnersRouter.get('/api/v1/partners/signup/pending', async (_req, res) => {
  if (pool) {
    try {
      const dbRes = await pool.query(
        `SELECT id, created_at, plan_id, modules, trade_name, legal_name, email, phone, status, monthly_amount, city, state
         FROM partner_signups
         ORDER BY created_at DESC
         LIMIT 100`,
      );
      res.json({
        success: true,
        data: {
          count: dbRes.rows.length,
          items: dbRes.rows.map((item) => ({
            id: item.id,
            createdAt: item.created_at,
            planId: item.plan_id,
            planName: planDisplayName(item.plan_id),
            modules: typeof item.modules === 'string' ? JSON.parse(item.modules) : item.modules,
            tradeName: item.trade_name,
            legalName: item.legal_name,
            email: item.email,
            phone: item.phone,
            status: item.status,
            monthlyAmount: Number(item.monthly_amount),
            city: item.city,
            state: item.state,
          })),
        },
      });
      return;
    } catch (err) {
      console.warn('[partners] DB pending lookup fallback to memory:', err);
    }
  }

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
 * - Cria client_account, loja matriz, licença, usuário admin e vínculo user_stores no PostgreSQL
 * - Cria token seguro de ativação
 * - Dispara e-mail profissional com a logo para o responsável (usando frontendUrl)
 * - Dispara e-mail interno para marthi.tecnologia@gmail.com
 * - Registra logs de auditoria
 */
async function executePaymentActivation(
  record: PartnerSignupRecord,
  paymentMethod: string,
  transactionRef?: string,
  notes?: string,
  frontendUrl?: string,
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

  const storeId = `STR-${record.id}`;
  const userId = `usr-${record.id}`;

  // 1. Vincula cliente, loja, licença e usuário no PostgreSQL
  if (pool) {
    try {
      // 1.1 Contas de Clientes (Tenant Root)
      await pool.query(
        `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', now(), now())
         ON CONFLICT (document) DO UPDATE
         SET status = 'active', email = $6, phone = $7, trade_name = $2, legal_name = $3, updated_at = now()`,
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

      // 1.2 Loja Matriz do Lojista
      await pool.query(
        `INSERT INTO stores (
          id, client_account_id, trade_name, legal_name, document_type, document,
          email, phone, zip_code, street, number, complement, district, city, state,
          tax_regime, is_matrix, active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14, $15,
          'simples_nacional', true, true, now(), now()
        ) ON CONFLICT (id) DO UPDATE
        SET trade_name = $3, legal_name = $4, email = $7, phone = $8, active = true, updated_at = now()`,
        [
          storeId,
          record.id,
          record.tradeName,
          record.legalName,
          record.documentType,
          record.document,
          record.email,
          record.phone,
          record.zipCode || '25800-000',
          record.street || 'Rua Principal',
          record.number || '100',
          record.complement || '',
          record.district || 'Centro',
          record.city || 'Três Rios',
          record.state || 'RJ',
        ],
      );

      // 1.3 Licença do Plano e Módulos
      await pool.query(
        `INSERT INTO store_licenses (
          id, client_account_id, store_id, plan_id, status, starts_at, expires_at,
          modules, final_price, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'active', now(), now() + interval '30 days',
          $5::jsonb, $6, now(), now()
        ) ON CONFLICT (id) DO UPDATE
        SET plan_id = $4, modules = $5::jsonb, status = 'active', updated_at = now()`,
        [
          `LIC-${record.id}`,
          record.id,
          storeId,
          record.planId,
          JSON.stringify(record.modules),
          record.monthlyAmount,
        ],
      );

      // 1.4 Usuário Admin da Conta (Aguardando criação de senha segura)
      await pool.query(
        `INSERT INTO users (
          id, client_account_id, email, name, provider, password_hash, global_role, active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'password', 'LOCKED_PENDING_ACTIVATION', 'admin', false, now(), now()
        ) ON CONFLICT (email) DO UPDATE
        SET client_account_id = $2, name = $4, updated_at = now()`,
        [
          userId,
          record.id,
          record.email.trim().toLowerCase(),
          record.contactName || record.tradeName,
        ],
      );

      // 1.5 Vínculo do Usuário com a Loja Matriz em user_stores
      await pool.query(
        `INSERT INTO user_stores (user_id, store_id, role, is_default, created_at)
         VALUES ($1, $2, 'admin', true, now())
         ON CONFLICT (user_id, store_id) DO NOTHING`,
        [userId, storeId],
      );
    } catch (err) {
      console.warn('[partners] DB tenant activation records creation error:', err);
    }
  }

  record.status = 'cliente_criado';
  record.auditTrail.push({
    status: 'cliente_criado',
    timestamp: new Date().toISOString(),
    detail: `Cliente ${record.tradeName} e loja matriz ${storeId} ativados no PostgreSQL`,
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

  // Atualiza status em partner_signups
  if (pool) {
    try {
      await pool.query(
        `UPDATE partner_signups
         SET status = $1, payment_confirmed_at = now(), payment_method = $2,
             transaction_ref = $3, activation_token_sent_at = now(), audit_trail = $4::jsonb, updated_at = now()
         WHERE id = $5`,
        [record.status, record.paymentMethod, record.transactionRef, JSON.stringify(record.auditTrail), record.id],
      );
    } catch (err) {
      console.warn('[partners] DB partner_signups update error:', err);
    }
  }

  // 3. E-mail de Boas-Vindas para o Cliente
  try {
    await sendWelcomeEmail({
      toEmail: record.email,
      contactName: record.contactName || record.tradeName,
      companyName: record.tradeName,
      planName: planDisplayName(record.planId),
      monthlyAmount: record.monthlyAmount,
      activationToken: rawToken,
      frontendUrl,
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
      frontendUrl,
    });
  } catch (err) {
    console.error('[partners] Erro ao enviar e-mail interno para a equipe Marhi:', err);
  }
}
