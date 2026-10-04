import { ensureOwnerTeamMember } from '../services/ownerTeam.js';
import { randomUUID } from 'node:crypto';
import { requireSession, requirePlatformAdmin } from '../middlewares/authMiddleware.js';
import { Router } from 'express';
import { z } from 'zod';
import { preRegisterClientAccount } from '../services/authService.js';
import { createSecureToken } from '../services/tokenService.js';
import { sendInternalNotificationEmail, sendSignupReceivedEmail, sendWelcomeEmail } from '../services/emailService.js';
import { pool } from '../db/pool.js';
import { env } from '../config/env.js';
import { confirmExistingClientPayment } from '../services/clientPaymentActivation.js';

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
  protocol: z.string().min(1),
  email: z.string().optional(),
  document: z.string().optional(),
  tradeName: z.string().optional(),
  planId: z.string().optional(),
  monthlyAmount: z.coerce.number().optional(),
  paymentMethod: z.string().default('pix'),
  transactionRef: z.string().optional(),
  notes: z.string().optional(),
});

async function calculatePlanAmount(planId: string, modules: string[]): Promise<number> {
  const id = planId === 'scale' ? 'golden' : planId === 'growth' ? 'silver' : planId === 'start' ? 'bronze' : planId;
  const result = await pool.query('SELECT settings FROM platform_commercial_plans WHERE id=$1', [id]);
  const plan = result.rows[0]?.settings;
  if (!plan || plan.active === false) throw Object.assign(new Error('Plano indisponível para contratação.'), { status: 409 });
  if (!Number.isFinite(plan.priceNumeric) || plan.priceNumeric < 0) throw Object.assign(new Error('Preço do plano inválido no catálogo.'), { status: 409 });
  if (plan.allModules !== true && modules.length > plan.maxModules) throw Object.assign(new Error('Quantidade de módulos excede o limite do plano contratado.'), { status: 400 });
  return plan.priceNumeric;
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


/**
 * 1. Conclusão da Contratação
 * Registra o pedido de contratação, previne duplicidades e aguarda confirmação de pagamento.
 */
partnersRouter.post('/api/v1/partners/signup', async (req, res, next) => {
  try {
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
      throw err;
    }
  }

  if (existingId) {
    res.status(409).json({ success:false, error:{ code:'SIGNUP_EXISTS', message:'Já existe uma contratação para esses dados. Consulte a equipe Marthi para acompanhar ou alterar o cadastro.' } });
    return;
  }
  const id = `PRT-${randomUUID()}`;
  const now = new Date().toISOString();
  const monthlyAmount = await calculatePlanAmount(data.planId, data.modules);

  const initialStatus: ContractingStatus = 'aguardando_pagamento';

  const record: PartnerSignupRecord = {
    ...data,
    id,
    status: initialStatus,
    monthlyAmount,
    createdAt: now,
    updatedAt: now,
    auditTrail: [
      {
        status: 'contratacao_iniciada',
        timestamp: now,
        detail: `Contratação iniciada para plano ${planDisplayName(data.planId)} (${data.tradeName})`,
      },
      {
        status: initialStatus,
        timestamp: now,
        detail: 'Aguardando confirmação de pagamento; a preferência informada não confirma a cobrança.',
      },
    ],
  };


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
      throw err;
    }
  }

  let activationToken: string | undefined = undefined;
  // Se o pagamento já foi aprovado na chamada (ex: confirmação imediata no checkout)
  if (record.status === 'pagamento_aprovado') {
    const act = await executePaymentActivation(record, data.paymentMethod || 'pix', data.transactionRef, undefined, frontendUrl);
    activationToken = act.rawToken;
  } else {
    // 1. Notifica a equipe Marthi que uma nova contratação foi realizada e aguarda conferência do pagamento
    try {
      await sendInternalNotificationEmail({
        companyName: record.tradeName,
        contactName: record.contactName || record.tradeName,
        email: record.email,
        phone: record.phone,
        planName: planDisplayName(record.planId),
        monthlyAmount: record.monthlyAmount,
        paymentMethod: record.paymentMethod || 'pix',
        paymentStatus: 'Aguardando Pagamento Pix (Pendente de Liberação no /admin)',
        contractedAt: record.createdAt,
        transactionRef: record.transactionRef,
        clientId: record.id,
        frontendUrl,
      });
    } catch (err) {
      console.error('[partners] Erro ao enviar notificação interna de nova contratação:', err);
    }

    // 2. Envia e-mail ao cliente confirmando o registro do pedido e instruções de aguardar a liberação
    try {
      await sendSignupReceivedEmail({
        toEmail: record.email,
        contactName: record.contactName || record.tradeName,
        companyName: record.tradeName,
        planName: planDisplayName(record.planId),
        monthlyAmount: record.monthlyAmount,
        paymentMethod: record.paymentMethod || 'pix',
        protocol: record.id,
        frontendUrl,
      });
    } catch (err) {
      console.error('[partners] Erro ao enviar e-mail de recebimento de pedido para o cliente:', err);
    }
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
      activationToken,
      monthlyAmount: record.monthlyAmount,
      planName: planDisplayName(record.planId),
      message:
        record.status === 'pagamento_aprovado' || record.status === 'acesso_pendente' || record.status === 'cliente_criado'
          ? 'Contratação e pagamento confirmados! Link para criação de senha enviado por e-mail.'
          : 'Contratação registrada com sucesso. Aguardando confirmação do pagamento para ativação.',
    },
  });
  } catch (error) { next(error); }
});

/**
 * 2. Confirmação de Pagamento com Idempotência Estrita
 * Acionado por Webhook de Gateway ou Confirmação Manual pelo Administrador.
 */
partnersRouter.post('/api/v1/partners/payment-confirm', requireSession, requirePlatformAdmin, async (req, res, next) => {
  try {
    const body = paymentConfirmSchema.parse(req.body);
    const protocol = body.protocol.trim();
    const frontendUrl = resolveRequestFrontendUrl(req);

    const existing = await confirmExistingClientPayment({ protocol, paymentMethod: body.paymentMethod,
      transactionRef: body.transactionRef, notes: body.notes, actorId: req.user!.id });
    if (existing) {
      let activationEmailSent = false;
      if (existing.rawToken) {
        try {
          const sent = await sendWelcomeEmail({ toEmail: existing.account.email,
            contactName: existing.account.contact_name || existing.account.trade_name,
            companyName: existing.account.trade_name, planName: planDisplayName(existing.planId),
            monthlyAmount: existing.monthlyAmount, activationToken: existing.rawToken, frontendUrl });
          activationEmailSent = sent.success;
        } catch { activationEmailSent = false; }
      }
      res.json({ success: true, data: { id: existing.account.id, status: existing.status,
        alreadyProcessed: existing.alreadyProcessed, activationEmailSent,
        message: existing.alreadyProcessed ? 'Pagamento já confirmado no MarthiDB.' :
          existing.status === 'acesso_ativado' ? 'Pagamento confirmado no MarthiDB. Acesso liberado com a senha existente.' :
          activationEmailSent ? 'Pagamento confirmado no MarthiDB. Link de criação de senha enviado.' :
          'Pagamento confirmado no MarthiDB. O e-mail de ativação não foi enviado; use Reenviar ativação.' } });
      return;
    }

    const lookupEmail = (body.email || (protocol.includes('@') ? protocol : '')).trim().toLowerCase();
    const lookupDoc = (body.document || protocol).replace(/\D/g, '');

    // 1. Busca a contratação no MarthiDB
    let record: PartnerSignupRecord | null = null;

    if (pool) {
      try {
        const dbRes = await pool.query(
          `SELECT * FROM partner_signups
           WHERE id = $1
              OR (lower(email) = lower($2) AND $2 != '')
              OR (regexp_replace(document, '\\D', '', 'g') = $3 AND $3 != '')
           LIMIT 1`,
          [protocol, lookupEmail, lookupDoc],
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
        throw err;
      }
    }

    if (!record) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Contratação não encontrada no MarthiDB. Complete o cadastro antes de liberar o acesso.' } });
      return;
    }

    // 2. Idempotência: se o acesso já estiver totalmente ativado e senha configurada
    // 3. Executa a ativação completa
    const act = await executePaymentActivation(record, body.paymentMethod, body.transactionRef, body.notes, frontendUrl);

    res.json({
      success: true,
      data: {
        id: record.id,
        status: record.status,
        activationToken: act.rawToken,
        message: 'Pagamento confirmado no MarthiDB. O envio do acesso depende da configuração de e-mail.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Consulta de status do ciclo de vida da contratação
 */
partnersRouter.get('/api/v1/partners/status/:protocol', async (req, res, next) => {
  try {
  const protocol = req.params.protocol.trim();
  let record: PartnerSignupRecord | null = null;

  if (pool) {
    try {
      const dbRes = await pool.query(
        `SELECT * FROM partner_signups
         WHERE id = $1
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
      throw err;
    }
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
  } catch (error) { next(error); }
});

partnersRouter.get('/api/v1/partners/signup/pending', requireSession, requirePlatformAdmin, async (_req, res, next) => {
  try {
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
      throw err;
    }
  }

  throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  } catch (error) { next(error); }
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
): Promise<{ rawToken: string }> {
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
  let userId = `usr-${record.id}`;

  // 1. Vincula cliente, loja, licença e usuário no PostgreSQL
  if (pool) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // 1.1 Contas de Clientes (Tenant Root)
      const caRes = await db.query(
        `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', now(), now())
         ON CONFLICT (document) DO UPDATE
         SET status = 'active', email = $6, phone = $7, trade_name = $2, legal_name = $3, updated_at = now()
         RETURNING id`,
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
      const actualAccountId = caRes.rows[0]?.id || record.id;

      // 1.2 Loja Matriz do Lojista
      await db.query(
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
          actualAccountId,
          record.tradeName,
          record.legalName,
          record.documentType,
          record.document,
          record.email,
          record.phone || '',
          record.zipCode || '',
          record.street || '',
          record.number || '',
          record.complement || '',
          record.district || '',
          record.city || '',
          record.state || '',
        ],
      );

      // 1.3 Licença do Plano e Módulos
      const licenseModules = Array.isArray(record.modules) && record.modules.length > 0
        ? record.modules
        : [];
      if (!licenseModules.length || !record.planId) throw Object.assign(new Error('Contratação sem plano ou módulos definidos.'), { status: 409 });

      await db.query(
        `INSERT INTO store_licenses (
          id, client_account_id, store_id, plan_id, status, starts_at, expires_at,
          modules, final_price, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'active', now(), now() + interval '30 days',
          (jsonb_populate_record(NULL::store_licenses, jsonb_build_object('modules', $5::jsonb))).modules, $6, now(), now()
        ) ON CONFLICT (store_id) DO UPDATE
        SET plan_id = $4, modules = EXCLUDED.modules, status = 'active', updated_at = now()`,
        [
          `LIC-${record.id}`,
          actualAccountId,
          storeId,
          record.planId,
          JSON.stringify(licenseModules),
          record.monthlyAmount,
        ],
      );

      // 1.4 Usuário Admin da Conta (Aguardando criação de senha segura)
      await db.query(
        `INSERT INTO users (
          id, client_account_id, email, name, provider, password_hash, global_role, active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, 'password', 'LOCKED_PENDING_ACTIVATION', 'admin', false, now(), now()
        ) ON CONFLICT (email) DO NOTHING`,
        [
          userId,
          actualAccountId,
          record.email.trim().toLowerCase(),
          record.contactName || record.tradeName,
        ],
      );

      const actualOwner = await db.query('SELECT id,client_account_id FROM users WHERE lower(email)=lower($1) FOR UPDATE', [record.email]);
      if (!actualOwner.rows[0] || actualOwner.rows[0].client_account_id !== actualAccountId) throw Object.assign(new Error('E-mail vinculado a outra conta.'), { status: 409 });
      userId = actualOwner.rows[0].id;
      // 1.5 Vínculo do Usuário com a Loja Matriz em user_stores
      await db.query(
        `INSERT INTO user_stores (id, user_id, store_id, role, is_default, created_at)
         VALUES ('UST-' || $1 || '-' || $2, $1, $2, 'admin', true, now())
         ON CONFLICT (user_id, store_id) DO NOTHING`,
        [userId, storeId],
      );
      await ensureOwnerTeamMember(db,userId,storeId);
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally { db.release(); }
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
         WHERE id = $5
            OR lower(email) = lower($6)
            OR (regexp_replace(document, '\\D', '', 'g') = regexp_replace($7, '\\D', '', 'g') AND regexp_replace($7, '\\D', '', 'g') != '')`,
        [
          record.status,
          record.paymentMethod,
          record.transactionRef,
          JSON.stringify(record.auditTrail),
          record.id,
          record.email,
          record.document,
        ],
      );
    } catch (err) {
      throw err;
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

  return { rawToken };
}
