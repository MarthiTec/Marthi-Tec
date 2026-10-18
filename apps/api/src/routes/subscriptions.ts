import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { requireAuth, requireSession, requirePlatformAdmin } from '../middlewares/authMiddleware.js';
import {
  createStripeBillingPortalSession,
  getBillingProviderStatus,
  stripeSecretKey,
  stripeWebhookSecret,
} from '../services/billingProvider.js';

export const subscriptionsRouter = Router();

type LicenseRow = {
  client_account_id: string;
  store_id: string | null;
  trade_name: string;
  email: string;
  account_status: string;
  plan_id: string;
  modules: string[] | null;
  final_price: string | number | null;
  billing_cycle: string | null;
  license_status: string | null;
  starts_at: Date | string | null;
  expires_at: Date | string | null;
};

function mapSubscription(row: Record<string, unknown>) {
  return {
    id: row.id,
    clientAccountId: row.client_account_id,
    storeId: row.store_id,
    tradeName: row.trade_name,
    email: row.email,
    accountStatus: row.account_status,
    planId: row.plan_id,
    modules: row.modules || [],
    status: row.status,
    billingCycle: row.billing_cycle,
    amount: Number(row.amount ?? 0),
    currency: row.currency || 'BRL',
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    nextChargeAt: row.next_charge_at,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    canceledAt: row.canceled_at,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id || null,
    providerSubscriptionId: row.provider_subscription_id || null,
    paymentMethodPreference: row.payment_method_preference,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInvoice(row: Record<string, unknown>) {
  return {
    id: row.id,
    clientAccountId: row.client_account_id,
    subscriptionId: row.subscription_id,
    tradeName: row.trade_name,
    amount: Number(row.amount ?? 0),
    currency: row.currency || 'BRL',
    status: row.status,
    description: row.description || '',
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueAt: row.due_at,
    paidAt: row.paid_at,
    paymentMethod: row.payment_method,
    provider: row.provider,
    providerInvoiceId: row.provider_invoice_id,
    transactionRef: row.transaction_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function periodFromLicense(license: LicenseRow) {
  const start = license.starts_at ? new Date(license.starts_at) : new Date();
  const end = license.expires_at
    ? new Date(license.expires_at)
    : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { start, end, nextCharge: end };
}

async function ensureSubscriptionFromLicense(license: LicenseRow) {
  if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
  const { start, end, nextCharge } = periodFromLicense(license);
  const status =
    license.license_status === 'active' || license.account_status === 'active'
      ? 'active'
      : license.account_status === 'blocked'
        ? 'past_due'
        : 'incomplete';
  const cycle = license.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
  const modules = Array.isArray(license.modules) ? license.modules : [];
  const amount = Number(license.final_price ?? 0);
  const id = `SUB-${license.client_account_id}`;

  const result = await pool.query(
    `INSERT INTO client_subscriptions (
       id, client_account_id, store_id, plan_id, modules, status, billing_cycle, amount,
       current_period_start, current_period_end, next_charge_at, provider, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5::text[],$6,$7,$8,$9,$10,$11,'manual',now()
     )
     ON CONFLICT (client_account_id) DO UPDATE SET
       store_id = COALESCE(EXCLUDED.store_id, client_subscriptions.store_id),
       plan_id = EXCLUDED.plan_id,
       modules = EXCLUDED.modules,
       status = CASE
         WHEN client_subscriptions.provider <> 'manual' THEN client_subscriptions.status
         ELSE EXCLUDED.status
       END,
       billing_cycle = EXCLUDED.billing_cycle,
       amount = EXCLUDED.amount,
       current_period_start = COALESCE(client_subscriptions.current_period_start, EXCLUDED.current_period_start),
       current_period_end = COALESCE(client_subscriptions.current_period_end, EXCLUDED.current_period_end),
       next_charge_at = COALESCE(client_subscriptions.next_charge_at, EXCLUDED.next_charge_at),
       updated_at = now()
     RETURNING *`,
    [
      id,
      license.client_account_id,
      license.store_id,
      license.plan_id || 'bronze',
      modules,
      status,
      cycle,
      amount,
      start.toISOString(),
      end.toISOString(),
      nextCharge.toISOString(),
    ],
  );
  return result.rows[0];
}

async function syncSubscriptionsFromLicenses() {
  if (!pool) return;
  const licenses = await pool.query(
    `SELECT c.id as client_account_id, c.trade_name, c.email, c.status as account_status,
            s.id as store_id, l.plan_id, l.modules::text[] as modules, l.final_price,
            l.billing_cycle, l.status as license_status, l.starts_at, l.expires_at
     FROM client_accounts c
     LEFT JOIN stores s ON s.client_account_id = c.id AND s.active = true
     LEFT JOIN store_licenses l ON l.client_account_id = c.id AND (l.store_id = s.id OR s.id IS NULL)
     WHERE l.id IS NOT NULL
     ORDER BY c.created_at ASC, s.is_matrix DESC NULLS LAST, s.created_at ASC NULLS LAST`,
  );
  const seen = new Set<string>();
  for (const row of licenses.rows as LicenseRow[]) {
    if (seen.has(row.client_account_id)) continue;
    seen.add(row.client_account_id);
    await ensureSubscriptionFromLicense(row);
  }
}

const listSql = `
  SELECT cs.*, c.trade_name, c.email, c.status as account_status
  FROM client_subscriptions cs
  JOIN client_accounts c ON c.id = cs.client_account_id
  ORDER BY c.trade_name ASC
`;

const detailSql = `
  SELECT cs.*, c.trade_name, c.email, c.status as account_status
  FROM client_subscriptions cs
  JOIN client_accounts c ON c.id = cs.client_account_id
  WHERE cs.client_account_id = $1
`;

subscriptionsRouter.get(
  '/api/v1/admin/billing/provider-status',
  requireSession,
  requirePlatformAdmin,
  async (_req, res, next) => {
    try {
      res.json({ success: true, data: getBillingProviderStatus() });
    } catch (error) {
      next(error);
    }
  },
);

subscriptionsRouter.get(
  '/api/v1/admin/subscriptions',
  requireSession,
  requirePlatformAdmin,
  async (req, res, next) => {
    try {
      if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
      const sync = req.query.sync !== '0';
      if (sync) await syncSubscriptionsFromLicenses();
      const result = await pool.query(listSql);
      res.json({
        success: true,
        data: {
          provider: getBillingProviderStatus(),
          subscriptions: result.rows.map(mapSubscription),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

subscriptionsRouter.get(
  '/api/v1/admin/subscriptions/:clientId',
  requireSession,
  requirePlatformAdmin,
  async (req, res, next) => {
    try {
      if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
      await syncSubscriptionsFromLicenses();
      const result = await pool.query(detailSql, [req.params.clientId]);
      if (!result.rows[0]) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assinatura não encontrada para este cliente.' } });
        return;
      }
      const invoices = await pool.query(
        `SELECT bi.*, c.trade_name
         FROM billing_invoices bi
         JOIN client_accounts c ON c.id = bi.client_account_id
         WHERE bi.client_account_id = $1
         ORDER BY COALESCE(bi.due_at, bi.created_at) DESC
         LIMIT 50`,
        [req.params.clientId],
      );
      const events = await pool.query(
        `SELECT id, event_type, provider, provider_event_id, created_at
         FROM billing_payment_events
         WHERE client_account_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.params.clientId],
      );
      res.json({
        success: true,
        data: {
          provider: getBillingProviderStatus(),
          subscription: mapSubscription(result.rows[0]),
          invoices: invoices.rows.map(mapInvoice),
          paymentEvents: events.rows.map((row) => ({
            id: row.id,
            eventType: row.event_type,
            provider: row.provider,
            providerEventId: row.provider_event_id,
            createdAt: row.created_at,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

const patchSchema = z.object({
  planId: z.string().min(1).optional(),
  modules: z.array(z.string()).optional(),
  amount: z.number().min(0).optional(),
  billingCycle: z.enum(['monthly', 'yearly']).optional(),
  status: z.enum(['trialing', 'active', 'past_due', 'canceled', 'incomplete', 'unpaid']).optional(),
  nextChargeAt: z.string().datetime().nullable().optional(),
  paymentMethodPreference: z.enum(['pix', 'card', 'boleto', 'mixed']).optional(),
  provider: z.enum(['manual', 'stripe', 'asaas', 'mercadopago']).optional(),
  providerCustomerId: z.string().nullable().optional(),
  providerSubscriptionId: z.string().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

subscriptionsRouter.patch(
  '/api/v1/admin/subscriptions/:clientId',
  requireSession,
  requirePlatformAdmin,
  async (req, res, next) => {
    try {
      if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
      const body = patchSchema.parse(req.body);
      await syncSubscriptionsFromLicenses();
      const existing = await pool.query(
        'SELECT * FROM client_subscriptions WHERE client_account_id = $1',
        [req.params.clientId],
      );
      if (!existing.rows[0]) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assinatura não encontrada.' } });
        return;
      }
      const current = existing.rows[0];
      const result = await pool.query(
        `UPDATE client_subscriptions SET
           plan_id = COALESCE($2, plan_id),
           modules = COALESCE($3::text[], modules),
           amount = COALESCE($4, amount),
           billing_cycle = COALESCE($5, billing_cycle),
           status = COALESCE($6, status),
           next_charge_at = CASE WHEN $7::text = '__clear__' THEN NULL
             WHEN $7 IS NULL THEN next_charge_at ELSE $7::timestamptz END,
           payment_method_preference = COALESCE($8, payment_method_preference),
           provider = COALESCE($9, provider),
           provider_customer_id = CASE WHEN $10::text = '__clear__' THEN NULL
             WHEN $10 IS NULL THEN provider_customer_id ELSE $10 END,
           provider_subscription_id = CASE WHEN $11::text = '__clear__' THEN NULL
             WHEN $11 IS NULL THEN provider_subscription_id ELSE $11 END,
           notes = COALESCE($12, notes),
           updated_at = now()
         WHERE client_account_id = $1
         RETURNING *`,
        [
          req.params.clientId,
          body.planId ?? null,
          body.modules ?? null,
          body.amount ?? null,
          body.billingCycle ?? null,
          body.status ?? null,
          body.nextChargeAt === null ? '__clear__' : body.nextChargeAt ?? null,
          body.paymentMethodPreference ?? null,
          body.provider ?? null,
          body.providerCustomerId === null ? '__clear__' : body.providerCustomerId ?? null,
          body.providerSubscriptionId === null ? '__clear__' : body.providerSubscriptionId ?? null,
          body.notes ?? null,
        ],
      );
      if (body.planId || body.modules) {
        await pool.query(
          `UPDATE store_licenses SET
             plan_id = COALESCE($2, plan_id),
             modules = COALESCE($3::text[], modules),
             final_price = COALESCE($4, final_price),
             updated_at = now()
           WHERE client_account_id = $1`,
          [req.params.clientId, body.planId ?? null, body.modules ?? null, body.amount ?? null],
        );
      }
      await pool.query(
        `INSERT INTO billing_payment_events(id, client_account_id, subscription_id, event_type, provider, payload)
         VALUES ($1,$2,$3,'subscription.updated','manual',$4::jsonb)`,
        [
          randomUUID(),
          req.params.clientId,
          current.id,
          JSON.stringify({ actorId: req.user!.id, patch: body }),
        ],
      );
      const joined = await pool.query(detailSql, [req.params.clientId]);
      res.json({ success: true, data: mapSubscription(joined.rows[0] || result.rows[0]) });
    } catch (error) {
      next(error);
    }
  },
);

subscriptionsRouter.post(
  '/api/v1/admin/subscriptions/:clientId/cancel',
  requireSession,
  requirePlatformAdmin,
  async (req, res, next) => {
    try {
      if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
      const immediate = Boolean(req.body?.immediate);
      const existing = await pool.query(
        'SELECT * FROM client_subscriptions WHERE client_account_id = $1',
        [req.params.clientId],
      );
      const sub = existing.rows[0];
      if (!sub) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assinatura não encontrada.' } });
        return;
      }
      const result = await pool.query(
        `UPDATE client_subscriptions SET
           cancel_at_period_end = $2,
           canceled_at = CASE WHEN $3 THEN now() ELSE canceled_at END,
           status = CASE WHEN $3 THEN 'canceled' ELSE status END,
           updated_at = now()
         WHERE client_account_id = $1
         RETURNING *`,
        [req.params.clientId, !immediate, immediate],
      );
      await pool.query(
        `INSERT INTO billing_payment_events(id, client_account_id, subscription_id, event_type, provider, payload)
         VALUES ($1,$2,$3,$4,'manual',$5::jsonb)`,
        [
          randomUUID(),
          req.params.clientId,
          sub.id,
          immediate ? 'subscription.canceled' : 'subscription.cancel_scheduled',
          JSON.stringify({ actorId: req.user!.id, immediate }),
        ],
      );
      const joined = await pool.query(detailSql, [req.params.clientId]);
      res.json({
        success: true,
        data: mapSubscription(joined.rows[0] || result.rows[0]),
        message: immediate
          ? 'Assinatura cancelada no MarthiDB.'
          : 'Cancelamento agendado para o fim do período atual (MarthiDB). Portal Stripe ainda requer customer vinculado e STRIPE_SECRET_KEY.',
      });
    } catch (error) {
      next(error);
    }
  },
);

subscriptionsRouter.post(
  '/api/v1/admin/subscriptions/:clientId/portal',
  requireSession,
  requirePlatformAdmin,
  async (req, res, next) => {
    try {
      if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
      if (!stripeSecretKey()) {
        res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Portal Stripe indisponível: defina STRIPE_SECRET_KEY no Site Discloud.',
            details: { gate: 'stripe_missing', provider: getBillingProviderStatus() },
          },
        });
        return;
      }
      const existing = await pool.query(
        'SELECT * FROM client_subscriptions WHERE client_account_id = $1',
        [req.params.clientId],
      );
      const sub = existing.rows[0];
      if (!sub) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assinatura não encontrada.' } });
        return;
      }
      if (!sub.provider_customer_id) {
        res.status(409).json({
          success: false,
          error: {
            code: 'CONFLICT',
            message:
              'Cliente sem provider_customer_id Stripe. Vincule o Customer ID na assinatura (PATCH) após criar o cliente no Stripe.',
            details: { gate: 'stripe_customer_missing' },
          },
        });
        return;
      }
      const session = await createStripeBillingPortalSession(sub.provider_customer_id);
      await pool.query(
        `INSERT INTO billing_payment_events(id, client_account_id, subscription_id, event_type, provider, payload)
         VALUES ($1,$2,$3,'portal.session_created','stripe',$4::jsonb)`,
        [randomUUID(), req.params.clientId, sub.id, JSON.stringify({ actorId: req.user!.id })],
      );
      res.json({ success: true, data: { url: session.url } });
    } catch (error) {
      next(error);
    }
  },
);

subscriptionsRouter.get(
  '/api/v1/admin/billing/invoices',
  requireSession,
  requirePlatformAdmin,
  async (req, res, next) => {
    try {
      if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
      const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : null;
      const result = clientId
        ? await pool.query(
            `SELECT bi.*, c.trade_name FROM billing_invoices bi
             JOIN client_accounts c ON c.id = bi.client_account_id
             WHERE bi.client_account_id = $1
             ORDER BY COALESCE(bi.due_at, bi.created_at) DESC LIMIT 100`,
            [clientId],
          )
        : await pool.query(
            `SELECT bi.*, c.trade_name FROM billing_invoices bi
             JOIN client_accounts c ON c.id = bi.client_account_id
             ORDER BY COALESCE(bi.due_at, bi.created_at) DESC LIMIT 100`,
          );
      res.json({ success: true, data: result.rows.map(mapInvoice) });
    } catch (error) {
      next(error);
    }
  },
);

const invoiceSchema = z.object({
  clientAccountId: z.string().min(1),
  amount: z.number().min(0),
  description: z.string().max(500).optional(),
  status: z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']).default('open'),
  dueAt: z.string().datetime().optional(),
  paidAt: z.string().datetime().optional(),
  paymentMethod: z.enum(['pix', 'card', 'boleto', 'mixed']).optional(),
  transactionRef: z.string().max(200).optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
});

subscriptionsRouter.post(
  '/api/v1/admin/billing/invoices',
  requireSession,
  requirePlatformAdmin,
  async (req, res, next) => {
    try {
      if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
      const body = invoiceSchema.parse(req.body);
      const sub = await pool.query(
        'SELECT id FROM client_subscriptions WHERE client_account_id = $1',
        [body.clientAccountId],
      );
      const id = `INV-${randomUUID()}`;
      const result = await pool.query(
        `INSERT INTO billing_invoices (
           id, client_account_id, subscription_id, amount, status, description,
           period_start, period_end, due_at, paid_at, payment_method, transaction_ref, created_by, provider
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'manual')
         RETURNING *`,
        [
          id,
          body.clientAccountId,
          sub.rows[0]?.id || null,
          body.amount,
          body.status,
          body.description || 'Mensalidade Marthi',
          body.periodStart || null,
          body.periodEnd || null,
          body.dueAt || null,
          body.paidAt || (body.status === 'paid' ? new Date().toISOString() : null),
          body.paymentMethod || null,
          body.transactionRef || null,
          req.user!.id,
        ],
      );
      const trade = await pool.query('SELECT trade_name FROM client_accounts WHERE id = $1', [
        body.clientAccountId,
      ]);
      await pool.query(
        `INSERT INTO billing_payment_events(id, client_account_id, subscription_id, invoice_id, event_type, provider, payload)
         VALUES ($1,$2,$3,$4,'invoice.created','manual',$5::jsonb)`,
        [
          randomUUID(),
          body.clientAccountId,
          sub.rows[0]?.id || null,
          id,
          JSON.stringify({ actorId: req.user!.id, status: body.status }),
        ],
      );
      res.status(201).json({
        success: true,
        data: mapInvoice({ ...result.rows[0], trade_name: trade.rows[0]?.trade_name }),
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Assinatura da conta logada (loja) — leitura para /painel/plano. */
subscriptionsRouter.get('/api/v1/billing/subscription', requireAuth, async (req, res, next) => {
  try {
    if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
    const clientAccountId = req.clientAccountId!;
    const licenses = await pool.query(
      `SELECT c.id as client_account_id, c.trade_name, c.email, c.status as account_status,
              s.id as store_id, l.plan_id, l.modules::text[] as modules, l.final_price,
              l.billing_cycle, l.status as license_status, l.starts_at, l.expires_at
       FROM client_accounts c
       LEFT JOIN stores s ON s.id = $2
       LEFT JOIN store_licenses l ON l.store_id = s.id
       WHERE c.id = $1
       LIMIT 1`,
      [clientAccountId, req.storeId],
    );
    if (licenses.rows[0]?.plan_id) {
      await ensureSubscriptionFromLicense(licenses.rows[0] as LicenseRow);
    }
    const result = await pool.query(
      `SELECT cs.*, c.trade_name, c.email, c.status as account_status
       FROM client_subscriptions cs
       JOIN client_accounts c ON c.id = cs.client_account_id
       WHERE cs.client_account_id = $1`,
      [clientAccountId],
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Nenhuma assinatura registrada para esta conta.' } });
      return;
    }
    const invoices = await pool.query(
      `SELECT bi.*, c.trade_name FROM billing_invoices bi
       JOIN client_accounts c ON c.id = bi.client_account_id
       WHERE bi.client_account_id = $1
       ORDER BY COALESCE(bi.due_at, bi.created_at) DESC LIMIT 20`,
      [clientAccountId],
    );
    const provider = getBillingProviderStatus();
    res.json({
      success: true,
      data: {
        subscription: mapSubscription(result.rows[0]),
        invoices: invoices.rows.map(mapInvoice),
        provider: {
          activeProvider: provider.activeProvider,
          portalAvailable: provider.stripe.portalReady && Boolean(result.rows[0].provider_customer_id),
          gates: provider.gates,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

subscriptionsRouter.post('/api/v1/billing/portal', requireAuth, async (req, res, next) => {
  try {
    if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
    if (!stripeSecretKey()) {
      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Portal de cartão indisponível até a Marthi ativar o Stripe no Site.',
          details: { gate: 'stripe_missing' },
        },
      });
      return;
    }
    const result = await pool.query(
      'SELECT * FROM client_subscriptions WHERE client_account_id = $1',
      [req.clientAccountId],
    );
    const sub = result.rows[0];
    if (!sub?.provider_customer_id) {
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: 'Sua conta ainda não está vinculada ao portal de pagamento. Fale com o suporte Marthi.',
          details: { gate: 'stripe_customer_missing' },
        },
      });
      return;
    }
    const session = await createStripeBillingPortalSession(sub.provider_customer_id);
    res.json({ success: true, data: { url: session.url } });
  } catch (error) {
    next(error);
  }
});

/** Webhook Stripe — só processa com STRIPE_WEBHOOK_SECRET; sem secret responde 503. */
subscriptionsRouter.post('/api/v1/billing/webhooks/stripe', async (req, res, next) => {
  try {
    const secret = stripeWebhookSecret();
    if (!secret) {
      res.status(503).json({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Webhook Stripe não ativado: ausente STRIPE_WEBHOOK_SECRET.',
          details: { gate: 'stripe_webhook_missing' },
        },
      });
      return;
    }
    // Assinatura Stripe exige raw body; neste scaffold registramos o evento somente se o header existir.
    // Ativação completa: configurar express.raw neste path e validar Stripe-Signature.
    const signature = req.headers['stripe-signature'];
    if (!signature) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Cabeçalho Stripe-Signature ausente.' } });
      return;
    }
    if (!pool) throw Object.assign(new Error('MarthiDB indisponível.'), { status: 503 });
    const eventId =
      typeof req.body?.id === 'string' ? req.body.id : `evt-unverified-${randomUUID()}`;
    const eventType = typeof req.body?.type === 'string' ? req.body.type : 'stripe.unverified';
    const prior = await pool.query(
      `SELECT id FROM billing_payment_events WHERE provider = 'stripe' AND provider_event_id = $1 LIMIT 1`,
      [eventId],
    );
    if (!prior.rows[0]) {
      await pool.query(
        `INSERT INTO billing_payment_events(id, event_type, provider, provider_event_id, payload)
         VALUES ($1,$2,'stripe',$3,$4::jsonb)`,
        [
          randomUUID(),
          eventType,
          eventId,
          JSON.stringify({ received: true, note: 'signature_header_present_awaiting_raw_body_verify' }),
        ],
      );
    }
    res.json({
      success: true,
      data: {
        received: true,
        verified: false,
        message:
          'Evento aceito em modo scaffold. Para produção, valide Stripe-Signature com raw body antes de alterar assinaturas/faturas.',
      },
    });
  } catch (error) {
    next(error);
  }
});
