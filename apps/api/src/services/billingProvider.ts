/**
 * Estado do provedor de cobrança recorrente da plataforma Marthi.
 * Nunca retorna valores de secrets — apenas booleans e nomes de variáveis.
 */

export type BillingProviderKind = 'manual' | 'stripe' | 'asaas' | 'mercadopago';

export type BillingProviderStatus = {
  activeProvider: BillingProviderKind;
  stripe: {
    configured: boolean;
    hasSecretKey: boolean;
    hasWebhookSecret: boolean;
    hasPublishableKey: boolean;
    portalReady: boolean;
    missingEnv: string[];
  };
  asaas: {
    configured: boolean;
    hasApiKey: boolean;
    missingEnv: string[];
  };
  mercadoPago: {
    configured: boolean;
    hasAccessToken: boolean;
    missingEnv: string[];
  };
  pix: {
    /** Chave Pix de recebimento da Marthi (painel /admin/recebimentos), não é gateway automático. */
    manualReceiveConfiguredHint: string;
    automaticProvider: BillingProviderKind | 'none';
  };
  gates: string[];
};

function envPresent(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && String(value).trim());
}

function resolveActiveProvider(): BillingProviderKind {
  const raw = (process.env.BILLING_PROVIDER || 'manual').trim().toLowerCase();
  if (raw === 'stripe' || raw === 'asaas' || raw === 'mercadopago' || raw === 'manual') {
    return raw;
  }
  return 'manual';
}

export function getBillingProviderStatus(): BillingProviderStatus {
  const activeProvider = resolveActiveProvider();
  const stripeMissing: string[] = [];
  if (!envPresent('STRIPE_SECRET_KEY')) stripeMissing.push('STRIPE_SECRET_KEY');
  if (!envPresent('STRIPE_WEBHOOK_SECRET')) stripeMissing.push('STRIPE_WEBHOOK_SECRET');
  if (!envPresent('STRIPE_PUBLISHABLE_KEY') && !envPresent('VITE_STRIPE_PUBLISHABLE_KEY')) {
    stripeMissing.push('STRIPE_PUBLISHABLE_KEY');
  }

  const asaasMissing: string[] = [];
  if (!envPresent('ASAAS_API_KEY')) asaasMissing.push('ASAAS_API_KEY');

  const mpMissing: string[] = [];
  if (!envPresent('MERCADOPAGO_ACCESS_TOKEN')) mpMissing.push('MERCADOPAGO_ACCESS_TOKEN');

  const stripeConfigured = envPresent('STRIPE_SECRET_KEY');
  const asaasConfigured = envPresent('ASAAS_API_KEY');
  const mpConfigured = envPresent('MERCADOPAGO_ACCESS_TOKEN');

  const gates: string[] = [];
  if (activeProvider === 'stripe' && !stripeConfigured) {
    gates.push('Defina STRIPE_SECRET_KEY (e webhook) no Site Discloud para ativar o portal Stripe.');
  }
  if (activeProvider === 'asaas' && !asaasConfigured) {
    gates.push('Defina ASAAS_API_KEY no Site Discloud para cobrança Asaas (PIX/cartão BR).');
  }
  if (activeProvider === 'mercadopago' && !mpConfigured) {
    gates.push('Defina MERCADOPAGO_ACCESS_TOKEN no Site Discloud para Mercado Pago.');
  }
  if (activeProvider === 'manual') {
    gates.push(
      'Modo manual ativo: confirmação de pagamento em /admin/clientes e Pix de recebimento em /admin/recebimentos. Sem checkout automático.',
    );
  }

  let automaticProvider: BillingProviderKind | 'none' = 'none';
  if (activeProvider !== 'manual') {
    if (activeProvider === 'stripe' && stripeConfigured) automaticProvider = 'stripe';
    else if (activeProvider === 'asaas' && asaasConfigured) automaticProvider = 'asaas';
    else if (activeProvider === 'mercadopago' && mpConfigured) automaticProvider = 'mercadopago';
  }

  return {
    activeProvider,
    stripe: {
      configured: stripeConfigured,
      hasSecretKey: stripeConfigured,
      hasWebhookSecret: envPresent('STRIPE_WEBHOOK_SECRET'),
      hasPublishableKey: envPresent('STRIPE_PUBLISHABLE_KEY') || envPresent('VITE_STRIPE_PUBLISHABLE_KEY'),
      portalReady: stripeConfigured,
      missingEnv: stripeMissing,
    },
    asaas: {
      configured: asaasConfigured,
      hasApiKey: asaasConfigured,
      missingEnv: asaasMissing,
    },
    mercadoPago: {
      configured: mpConfigured,
      hasAccessToken: mpConfigured,
      missingEnv: mpMissing,
    },
    pix: {
      manualReceiveConfiguredHint:
        'Chave Pix da plataforma fica em platform_payout_settings (/admin/recebimentos). Não substitui gateway de cobrança automática.',
      automaticProvider,
    },
    gates,
  };
}

export function stripeSecretKey(): string | null {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  return value || null;
}

export function stripeWebhookSecret(): string | null {
  const value = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return value || null;
}

export type PortalAudience = 'store' | 'admin';

export function portalReturnUrl(audience: PortalAudience = 'store'): string {
  const explicit = process.env.STRIPE_PORTAL_RETURN_URL?.trim();
  if (explicit) return explicit;
  const front = process.env.FRONTEND_URL?.trim() || 'https://marthi-totem.discloud.app';
  const path = audience === 'admin' ? '/admin/assinaturas' : '/painel/lojas';
  return `${front.replace(/\/$/, '')}${path}`;
}

/** Cria sessão do Customer Portal Stripe via API HTTP (sem SDK). */
export async function createStripeBillingPortalSession(
  customerId: string,
  audience: PortalAudience = 'store',
): Promise<{ url: string }> {
  const secret = stripeSecretKey();
  if (!secret) {
    throw Object.assign(new Error('Stripe não configurado: ausente STRIPE_SECRET_KEY.'), {
      status: 503,
      gate: 'stripe_missing',
    });
  }
  const body = new URLSearchParams({
    customer: customerId,
    return_url: portalReturnUrl(audience),
  });
  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const payload = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !payload.url) {
    throw Object.assign(
      new Error(payload.error?.message || 'Falha ao abrir o portal Stripe.'),
      { status: response.status >= 400 && response.status < 600 ? response.status : 502 },
    );
  }
  return { url: payload.url };
}
