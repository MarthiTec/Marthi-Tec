/** Leads de demo da homepage → CRM local. */

const STORAGE_KEY = 'marthi.demo.leads.v1';
const ACCESS_KEY = 'marthi.demo.access.v1';
const CONTRACTED_KEY = 'marthi.store.contracted';

export type DemoProduct = 'totem' | 'caixa' | 'os' | 'erp';

export type DemoLead = {
  id: string;
  product: DemoProduct;
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  createdAt: string;
};

export const DEMO_PRODUCT_LABEL: Record<DemoProduct, string> = {
  totem: 'Totem',
  caixa: 'PDV / Caixa',
  os: 'Ordem de serviço',
  erp: 'ERP',
};

function uid() {
  return `LEAD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function loadLeads(): DemoLead[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { leads?: DemoLead[] };
    return Array.isArray(parsed.leads) ? parsed.leads : [];
  } catch {
    return [];
  }
}

function saveLeads(leads: DemoLead[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ leads }));
  window.dispatchEvent(new Event('marthi-demo-leads-updated'));
}

export function markStoreContracted() {
  localStorage.setItem(CONTRACTED_KEY, '1');
  window.dispatchEvent(new Event('marthi-plan-updated'));
}

export function isStoreContracted() {
  try {
    if (localStorage.getItem(CONTRACTED_KEY) === '1') return true;
    if (localStorage.getItem('marthi.auth.token')) return true;
    return false;
  } catch {
    return false;
  }
}

export function listDemoLeads() {
  return loadLeads();
}

export function saveDemoLead(input: {
  product: DemoProduct;
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
}): { ok: true; lead: DemoLead } | { ok: false; error: string } {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const whatsapp = input.whatsapp.replace(/\D/g, '');
  if (firstName.length < 2) return { ok: false, error: 'Informe o nome.' };
  if (lastName.length < 2) return { ok: false, error: 'Informe o sobrenome.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'E-mail inválido.' };
  if (whatsapp.length < 10) return { ok: false, error: 'WhatsApp inválido.' };

  const lead: DemoLead = {
    id: uid(),
    product: input.product,
    firstName,
    lastName,
    email,
    whatsapp,
    createdAt: new Date().toISOString(),
  };
  const leads = loadLeads();
  leads.unshift(lead);
  saveLeads(leads);
  grantDemoAccess(input.product, lead.id);
  // CRM ingest (lazy to avoid circular import)
  void import('./crmStore')
    .then(({ ingestDemoLeadToCrm }) => ingestDemoLeadToCrm(lead))
    .catch(() => undefined);
  return { ok: true, lead };
}

export function grantDemoAccess(product: DemoProduct, leadId: string) {
  let products: DemoProduct[] = [product];
  try {
    const raw = sessionStorage.getItem(ACCESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { product?: string; products?: string[]; leadId?: string };
      const prev = Array.isArray(parsed.products)
        ? parsed.products
        : parsed.product
          ? [parsed.product]
          : [];
      products = [...new Set([...prev, product])].filter((item): item is DemoProduct =>
        ['totem', 'caixa', 'os', 'erp'].includes(item),
      );
    }
  } catch {
    products = [product];
  }
  sessionStorage.setItem(
    ACCESS_KEY,
    JSON.stringify({ product, products, leadId, at: Date.now() }),
  );
}

/** Libera demos + loja contratada (Golden) para apresentação ao vivo com o cliente. */
export function enableLivePresentation(options?: { leadId?: string }) {
  const leadId = options?.leadId ?? `LIVE-${Date.now().toString(36).toUpperCase()}`;
  for (const product of ['totem', 'caixa', 'os', 'erp'] as DemoProduct[]) {
    grantDemoAccess(product, leadId);
  }
  markStoreContracted();
  void import('./storePlan').then(({ replaceStoreEntitlement, defaultEntitlement }) => {
    replaceStoreEntitlement(defaultEntitlement());
  });
  return leadId;
}

export function hasDemoAccess(product: DemoProduct) {
  if (isStoreContracted()) return true;
  try {
    const raw = sessionStorage.getItem(ACCESS_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { product?: string; products?: string[]; at?: number };
    const allowed = Array.isArray(parsed.products)
      ? parsed.products
      : parsed.product
        ? [parsed.product]
        : [];
    if (!allowed.includes(product)) return false;
    // sessão de demo válida por 8h
    if (typeof parsed.at === 'number' && Date.now() - parsed.at > 8 * 60 * 60 * 1000) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
