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

function parseModulesColumn(raw: unknown): PartnerSignupRecord['modules'] {
  if (Array.isArray(raw)) return raw as PartnerSignupRecord['modules'];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed
        .slice(1, -1)
        .split(',')
        .map((s) => s.replace(/^"|"$/g, '').trim())
        .filter(Boolean) as PartnerSignupRecord['modules'];
    }
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? (parsed as PartnerSignupRecord['modules']) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function calculatePlanAmount(planId: string, modules: string[]): Promise<number> {
  const id = planId === 'scale' ? 'golden' : planId === 'growth' ? 'silver' : planId === 'start' ? 'bronze' : planId;
  const fallbackPlans: Record<string, { priceNumeric: number; maxModules: number; allModules: boolean; active: boolean }> = {
    bronze: { priceNumeric: 197, maxModules: 1, allModules: false, active: true },
    silver: { priceNumeric: 497, maxModules: 2, allModules: false, active: true },
    golden: { priceNumeric: 597, maxModules: 5, allModules: true, active: true },
  };
  let plan = fallbackPlans[id];
  if (pool) {
    try {
      const result = await pool.query('SELECT settings FROM platform_commercial_plans WHERE id=$1', [id]);
      if (result.rows[0]?.settings) {
        plan = result.rows[0].settings;
      }
    } catch {
      // Usa plano padrão se a tabela ainda não estiver populada
    }
  }
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


let partnerSignupsSchemaEnsured = false;

export async function ensurePartnerSignupsSchema(): Promise<void> {
  if (partnerSignupsSchemaEnsured || !pool) return;
  try {
    await pool.query(`
      DO $$
      DECLARE
        r RECORD;
        def TEXT;
      BEGIN
        -- Converte colunas enum legadas nas tabelas de onboarding/licenciamento para TEXT
        FOR r IN
          SELECT c.table_name, c.column_name, c.column_default
            FROM information_schema.columns c
            JOIN pg_type t ON t.typname = c.udt_name AND t.typtype = 'e'
           WHERE c.table_schema = current_schema()
             AND c.table_name IN (
               'partner_signups', 'client_accounts', 'stores', 'store_licenses',
               'users', 'user_stores', 'employees', 'auth_tokens'
             )
        LOOP
          BEGIN
            IF r.column_default IS NOT NULL THEN
              EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', r.table_name, r.column_name);
            END IF;
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE text USING %I::text', r.table_name, r.column_name, r.column_name);
            IF r.column_default IS NOT NULL THEN
              def := regexp_replace(r.column_default, '::"?[A-Za-z_]+"?$', '');
              EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', r.table_name, r.column_name, def);
            END IF;
          EXCEPTION WHEN others THEN NULL; END;
        END LOOP;

        -- Garante DEFAULT em todas as colunas NOT NULL sem default herdadas do Prisma
        -- (ADD COLUMN IF NOT EXISTS não aplica DEFAULT quando a coluna já existia sem default)
        FOR r IN
          SELECT table_name, column_name, data_type, is_nullable
            FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND table_name IN (
               'partner_signups', 'client_accounts', 'stores', 'store_licenses',
               'users', 'user_stores', 'employees', 'auth_tokens'
             )
             AND column_name <> 'id'
             AND column_default IS NULL
        LOOP
          BEGIN
            IF r.column_name = 'totem_exit_password' THEN
              EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
              EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT ''''', r.table_name, r.column_name);
            ELSIF r.column_name IN ('created_at', 'updated_at', 'starts_at', 'confirmed_at') THEN
              EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT now()', r.table_name, r.column_name);
            ELSIF r.is_nullable = 'NO' THEN
              IF r.data_type IN ('text', 'character varying', 'character') THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT ''''', r.table_name, r.column_name);
              ELSIF r.data_type IN ('integer', 'bigint', 'smallint', 'numeric', 'double precision', 'real') THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT 0', r.table_name, r.column_name);
              ELSIF r.data_type = 'boolean' THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT false', r.table_name, r.column_name);
              ELSIF r.data_type LIKE 'timestamp%' THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT now()', r.table_name, r.column_name);
              ELSIF r.data_type = 'jsonb' THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT ''{}''::jsonb', r.table_name, r.column_name);
              ELSIF r.data_type = 'json' THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT ''{}''::json', r.table_name, r.column_name);
              ELSE
                EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
              END IF;
            END IF;
          EXCEPTION WHEN others THEN
            BEGIN
              EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', r.table_name, r.column_name);
            EXCEPTION WHEN others THEN NULL; END;
          END;
        END LOOP;

        BEGIN
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'golden';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS modules JSONB NOT NULL DEFAULT '[]'::jsonb;
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'cnpj';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS document TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS legal_name TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS trade_name TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS zip_code TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS street TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS number TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS complement TEXT DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS district TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS segment TEXT DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS contact_role TEXT DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aguardando_pagamento';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'pix';
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS transaction_ref TEXT;
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS activation_token_sent_at TIMESTAMPTZ;
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS audit_trail JSONB NOT NULL DEFAULT '[]'::jsonb;
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
          ALTER TABLE partner_signups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'partner_signups' AND column_name = 'plan'
          ) THEN
            EXECUTE 'ALTER TABLE partner_signups ALTER COLUMN plan DROP NOT NULL';
          END IF;
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'partner_signups'
              AND column_name = 'modules'
              AND data_type <> 'jsonb'
          ) THEN
            ALTER TABLE partner_signups ALTER COLUMN modules DROP DEFAULT;
            ALTER TABLE partner_signups ALTER COLUMN modules TYPE JSONB USING to_jsonb(modules);
            ALTER TABLE partner_signups ALTER COLUMN modules SET DEFAULT '[]'::jsonb;
          END IF;
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'store_licenses'
              AND column_name = 'modules'
              AND data_type = 'ARRAY'
              AND udt_name <> '_text'
          ) THEN
            ALTER TABLE store_licenses ALTER COLUMN modules DROP DEFAULT;
            ALTER TABLE store_licenses ALTER COLUMN modules TYPE TEXT[] USING modules::text[];
            ALTER TABLE store_licenses ALTER COLUMN modules SET DEFAULT ARRAY['totem', 'os', 'erp', 'fiscal', 'ecommerce']::TEXT[];
          END IF;
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS access_token TEXT NOT NULL DEFAULT '';
          ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
          ALTER TABLE client_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS state_registration TEXT NOT NULL DEFAULT '';
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS municipal_registration TEXT NOT NULL DEFAULT '';
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS access_token TEXT NOT NULL DEFAULT '';
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS ibge_city_code TEXT NOT NULL DEFAULT '';
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS segment TEXT NOT NULL DEFAULT 'assistencia_tecnica';
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS totem_exit_password TEXT DEFAULT '';
          ALTER TABLE stores ALTER COLUMN totem_exit_password DROP NOT NULL;
          ALTER TABLE stores ALTER COLUMN totem_exit_password SET DEFAULT '';
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS totem_settings JSONB DEFAULT '{}'::jsonb;
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS communication_settings JSONB DEFAULT '{}'::jsonb;
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
          ALTER TABLE stores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS base_price NUMERIC(12,2) NOT NULL DEFAULT 0;
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS final_price NUMERIC(12,2) NOT NULL DEFAULT 0;
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly';
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ NOT NULL DEFAULT now();
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
          ALTER TABLE store_licenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id TEXT;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'password';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
          ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_phone TEXT NOT NULL DEFAULT '';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_address TEXT NOT NULL DEFAULT '';
          ALTER TABLE users ADD COLUMN IF NOT EXISTS panel_theme TEXT NOT NULL DEFAULT 'light';
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          ALTER TABLE user_stores ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE user_stores ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
          ALTER TABLE user_stores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS document TEXT NOT NULL DEFAULT '';
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'operator';
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_system_user BOOLEAN NOT NULL DEFAULT false;
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS user_email TEXT NOT NULL DEFAULT '';
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS access_areas JSONB NOT NULL DEFAULT '[]'::jsonb;
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'employees'
              AND column_name = 'access_areas'
              AND data_type <> 'jsonb'
          ) THEN
            ALTER TABLE employees ALTER COLUMN access_areas DROP DEFAULT;
            ALTER TABLE employees ALTER COLUMN access_areas TYPE JSONB USING to_jsonb(access_areas);
            ALTER TABLE employees ALTER COLUMN access_areas SET DEFAULT '[]'::jsonb;
          END IF;
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          CREATE TABLE IF NOT EXISTS auth_tokens (
            id TEXT PRIMARY KEY,
            token_hash TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            email TEXT NOT NULL,
            client_id TEXT,
            name TEXT,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS token_hash TEXT;
          ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'activation';
          ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
          ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS client_id TEXT;
          ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS name TEXT;
          ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
          ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
          ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
        EXCEPTION WHEN others THEN NULL; END;

        BEGIN
          CREATE TABLE IF NOT EXISTS client_payment_confirmations (
            client_account_id TEXT PRIMARY KEY REFERENCES client_accounts(id),
            store_id TEXT NOT NULL REFERENCES stores(id),
            payment_method TEXT NOT NULL,
            transaction_ref TEXT,
            notes TEXT NOT NULL DEFAULT '',
            confirmed_by TEXT NOT NULL REFERENCES users(id),
            confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            contracting_status TEXT NOT NULL CHECK (contracting_status IN ('acesso_pendente','acesso_ativado'))
          );
        EXCEPTION WHEN others THEN NULL; END;
      END $$;
    `);
    partnerSignupsSchemaEnsured = true;
  } catch (err) {
    console.warn('[partners] Falha não-bloqueante ao reparar schema de partner_signups:', err);
  }
}

/**
 * 1. Conclusão da Contratação
 * Registra o pedido de contratação, previne duplicidades e aguarda confirmação de pagamento.
 */
partnersRouter.post('/api/v1/partners/signup', async (req, res, next) => {
  try {
  await ensurePartnerSignupsSchema();
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
        `SELECT id, status FROM partner_signups
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
          $1, $2,
          (jsonb_populate_record(NULL::partner_signups, jsonb_build_object('modules', $3::jsonb))).modules,
          $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22,
          $23, $24, $25::jsonb, $26, $27
        ) ON CONFLICT (id) DO UPDATE SET
          plan_id = $2,
          modules = EXCLUDED.modules,
          legal_name = $6, trade_name = $7,
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
    await ensurePartnerSignupsSchema();
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
          const parsedModules = parseModulesColumn(row.modules);
          const resolvedPlanId = row.plan_id || row.plan || 'golden';
          record = {
            id: row.id,
            payNow: false,
            planId: resolvedPlanId,
            modules: parsedModules.length > 0
              ? parsedModules
              : (resolvedPlanId === 'golden' || resolvedPlanId === 'scale'
                  ? ['totem', 'os', 'erp', 'fiscal', 'ecommerce']
                  : ['erp']),
            documentType: row.document_type || 'cnpj',
            document: row.document || '',
            legalName: row.legal_name || row.trade_name || 'Cliente Marthi',
            tradeName: row.trade_name || row.legal_name || 'Cliente Marthi',
            email: row.email,
            phone: row.phone || '',
            zipCode: row.zip_code || '',
            street: row.street || '',
            number: row.number || '',
            complement: row.complement || '',
            district: row.district || '',
            city: row.city || '',
            state: row.state || '',
            segment: row.segment || '',
            contactName: row.contact_name || row.trade_name || 'Responsável',
            contactRole: row.contact_role || '',
            notes: row.notes || '',
            status: row.status || 'aguardando_pagamento',
            monthlyAmount: Number(row.monthly_amount ?? 0),
            paymentMethod: row.payment_method || 'pix',
            transactionRef: row.transaction_ref,
            paymentConfirmedAt: row.payment_confirmed_at,
            activationTokenSentAt: row.activation_token_sent_at,
            auditTrail: typeof row.audit_trail === 'string'
              ? (() => { try { return JSON.parse(row.audit_trail); } catch { return []; } })()
              : (Array.isArray(row.audit_trail) ? row.audit_trail : []),
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

    // 2. Executa a ativação completa com idempotência
    const act = await executePaymentActivation(
      record,
      body.paymentMethod,
      body.transactionRef,
      body.notes,
      frontendUrl,
      req.user?.id,
    );

    res.json({
      success: true,
      data: {
        id: act.accountId || record.id,
        status: record.status,
        activationToken: act.rawToken,
        message: 'Pagamento confirmado no MarthiDB. O envio do acesso depende da configuração de e-mail.',
      },
    });
  } catch (error) {
    if (error instanceof Error && !(error as { status?: number }).status) {
      console.error('[partners] Erro em payment-confirm:', error);
      (error as Error & { status?: number }).status = 422;
      error.message = `Falha ao liberar acesso no MarthiDB: ${error.message}`;
    }
    next(error);
  }
});

/**
 * Consulta de status do ciclo de vida da contratação
 */
partnersRouter.get('/api/v1/partners/status/:protocol', async (req, res, next) => {
  try {
  await ensurePartnerSignupsSchema();
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
          planId: row.plan_id || row.plan || 'golden',
          modules: parseModulesColumn(row.modules),
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
  await ensurePartnerSignupsSchema();
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
            modules: parseModulesColumn(item.modules),
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
  actorId?: string,
): Promise<{ rawToken: string; accountId: string }> {
  const now = new Date().toISOString();
  record.status = 'pagamento_aprovado';
  record.paymentMethod = paymentMethod;
  record.transactionRef = transactionRef || `TX-${Date.now().toString(36).toUpperCase()}`;
  record.paymentConfirmedAt = now;

  if (!Array.isArray(record.auditTrail)) {
    record.auditTrail = [];
  }
  record.auditTrail.push({
    status: 'pagamento_aprovado',
    timestamp: now,
    detail: `Pagamento de R$ ${Number(record.monthlyAmount || 0).toFixed(2)} confirmado via ${paymentMethod} (${record.transactionRef})`,
  });

  let storeId = `STR-${record.id}`;
  let userId = `usr-${record.id}`;
  let actualAccountId = record.id;

  // 1. Vincula cliente, loja, licença e usuário no PostgreSQL
  if (pool) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // 1.1 Contas de Clientes (Tenant Root)
      const existingAcc = await db.query(
        `SELECT id FROM client_accounts
         WHERE id = $1
            OR (regexp_replace(document, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g') AND regexp_replace($2, '\\D', '', 'g') <> '')
         ORDER BY (id = $1) DESC, created_at ASC
         LIMIT 1`,
        [record.id, record.document || ''],
      );
      if (existingAcc.rows[0]) {
        actualAccountId = existingAcc.rows[0].id;
        await db.query(
          `UPDATE client_accounts
           SET status = 'active', email = $2, phone = $3, trade_name = $4, legal_name = $5, contact_name = $6, updated_at = now()
           WHERE id = $1`,
          [
            actualAccountId,
            record.email.trim(),
            record.phone || '',
            record.tradeName,
            record.legalName || record.tradeName,
            record.contactName || record.tradeName,
          ],
        );
      } else {
        await db.query(
          `INSERT INTO client_accounts (id, trade_name, legal_name, document_type, document, email, phone, contact_name, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', now(), now())`,
          [
            actualAccountId,
            record.tradeName,
            record.legalName || record.tradeName,
            record.documentType || 'cnpj',
            record.document,
            record.email.trim(),
            record.phone || '',
            record.contactName || record.tradeName,
          ],
        );
      }

      // 1.2 Loja Matriz do Lojista
      const existingStore = await db.query(
        `SELECT id, client_account_id FROM stores
         WHERE id = $1 OR client_account_id = $2
         ORDER BY (id = $1) DESC, is_matrix DESC, created_at ASC
         LIMIT 1`,
        [storeId, actualAccountId],
      );
      if (existingStore.rows[0] && existingStore.rows[0].client_account_id === actualAccountId) {
        storeId = existingStore.rows[0].id;
        await db.query(
          `UPDATE stores
           SET trade_name = $2, legal_name = $3, email = $4, phone = $5,
               zip_code = $6, street = $7, number = $8, complement = $9,
               district = $10, city = $11, state = $12, active = true, updated_at = now()
           WHERE id = $1`,
          [
            storeId,
            record.tradeName,
            record.legalName || record.tradeName,
            record.email.trim(),
            record.phone || '',
            record.zipCode || '',
            record.street || '',
            record.number || '',
            record.complement || '',
            record.district || '',
            record.city || '',
            (record.state || '').slice(0, 2).toUpperCase(),
          ],
        );
      } else {
        if (existingStore.rows[0]) {
          storeId = `STR-${randomUUID()}`;
        }
        await db.query(
          `INSERT INTO stores (
            id, client_account_id, trade_name, legal_name, document_type, document,
            email, phone, zip_code, street, number, complement, district, city, state,
            tax_regime, is_matrix, active, totem_exit_password, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12, $13, $14, $15,
            'simples_nacional', true, true, '', now(), now()
          )`,
          [
            storeId,
            actualAccountId,
            record.tradeName,
            record.legalName || record.tradeName,
            record.documentType || 'cnpj',
            record.document,
            record.email.trim(),
            record.phone || '',
            record.zipCode || '',
            record.street || '',
            record.number || '',
            record.complement || '',
            record.district || '',
            record.city || '',
            (record.state || '').slice(0, 2).toUpperCase(),
          ],
        );
      }

      // 1.3 Licença do Plano e Módulos
      const licenseModules = Array.isArray(record.modules) && record.modules.length > 0
        ? record.modules
        : (record.planId === 'golden' || record.planId === 'scale'
            ? ['totem', 'os', 'erp', 'fiscal', 'ecommerce']
            : ['erp']);
      if (!licenseModules.length || !record.planId) throw Object.assign(new Error('Contratação sem plano ou módulos definidos.'), { status: 409 });

      const existingLic = await db.query(
        `SELECT id FROM store_licenses WHERE store_id = $1 OR id = $2 LIMIT 1`,
        [storeId, `LIC-${record.id}`],
      );
      if (existingLic.rows[0]) {
        await db.query(
          `UPDATE store_licenses
           SET client_account_id = $1, store_id = $2, plan_id = $3, status = 'active',
               modules = (jsonb_populate_record(NULL::store_licenses, jsonb_build_object('modules', $4::jsonb))).modules,
               final_price = $5, updated_at = now()
           WHERE id = $6`,
          [
            actualAccountId,
            storeId,
            record.planId,
            JSON.stringify(licenseModules),
            record.monthlyAmount,
            existingLic.rows[0].id,
          ],
        );
      } else {
        await db.query(
          `INSERT INTO store_licenses (
            id, client_account_id, store_id, plan_id, status, starts_at, expires_at,
            modules, base_price, final_price, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, 'active', now(), now() + interval '30 days',
            (jsonb_populate_record(NULL::store_licenses, jsonb_build_object('modules', $5::jsonb))).modules,
            $6, $6, now(), now()
          )`,
          [
            `LIC-${record.id}`,
            actualAccountId,
            storeId,
            record.planId,
            JSON.stringify(licenseModules),
            record.monthlyAmount,
          ],
        );
      }

      // 1.4 Usuário Admin da Conta (Aguardando criação de senha segura)
      const normEmail = record.email.trim().toLowerCase();
      const actualOwner = await db.query(
        'SELECT id, client_account_id, password_hash, provider, active, global_role FROM users WHERE lower(email) = $1 FOR UPDATE',
        [normEmail],
      );

      if (!actualOwner.rows[0]) {
        const existingUserById = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
        if (existingUserById.rows[0]) {
          userId = `usr-${randomUUID()}`;
        }
        await db.query(
          `INSERT INTO users (
            id, client_account_id, email, name, provider, password_hash, global_role, active, created_at
          ) VALUES (
            $1, $2, $3, $4, 'password', 'LOCKED_PENDING_ACTIVATION', 'admin', false, now()
          )`,
          [
            userId,
            actualAccountId,
            normEmail,
            record.contactName || record.tradeName,
          ],
        );
      } else {
        userId = actualOwner.rows[0].id;
        if (
          actualOwner.rows[0].client_account_id !== actualAccountId &&
          actualOwner.rows[0].global_role !== 'superadmin' &&
          actualOwner.rows[0].client_account_id !== 'PRT-MUM5YWBG8DSR'
        ) {
          await db.query(
            `UPDATE users SET client_account_id = $2, name = COALESCE(NULLIF($3, ''), name) WHERE id = $1`,
            [userId, actualAccountId, record.contactName || record.tradeName],
          );
        }
      }

      // 1.5 Vínculo do Usuário com a Loja Matriz em user_stores
      await db.query(
        `INSERT INTO user_stores (id, user_id, store_id, role, is_default, created_at)
         SELECT $1, $2, $3, 'admin', true, now()
         WHERE NOT EXISTS (SELECT 1 FROM user_stores WHERE user_id = $2 AND store_id = $3)`,
        [`UST-${randomUUID()}`, userId, storeId],
      );
      await ensureOwnerTeamMember(db, userId, storeId);

      await db.query('SAVEPOINT sp_payment_conf');
      try {
        const actorRow = await db.query(
          `SELECT id FROM users WHERE id = $1 OR id = $2 OR global_role = 'superadmin' ORDER BY (id = $1) DESC, (id = $2) DESC LIMIT 1`,
          [actorId || '', userId],
        );
        const confirmedById = actorRow.rows[0]?.id || userId;
        await db.query(
          `INSERT INTO client_payment_confirmations (
             client_account_id, store_id, payment_method, transaction_ref, notes, confirmed_by, contracting_status
           ) VALUES ($1, $2, $3, $4, $5, $6, 'acesso_pendente')
           ON CONFLICT (client_account_id) DO UPDATE
           SET contracting_status = EXCLUDED.contracting_status, confirmed_at = now()`,
          [actualAccountId, storeId, paymentMethod, record.transactionRef || null, notes || '', confirmedById],
        );
        await db.query('RELEASE SAVEPOINT sp_payment_conf');
      } catch {
        await db.query('ROLLBACK TO SAVEPOINT sp_payment_conf');
      }

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
    clientId: actualAccountId,
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
      console.warn('[partners] Aviso ao atualizar status em partner_signups:', err);
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
      clientId: actualAccountId,
      frontendUrl,
    });
  } catch (err) {
    console.error('[partners] Erro ao enviar e-mail interno para a equipe Marhi:', err);
  }

  return { rawToken, accountId: actualAccountId };
}
