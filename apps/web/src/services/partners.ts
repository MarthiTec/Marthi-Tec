import { nestApiUrl } from './config';

export type PartnerSignupPayload = {
  planId: string;
  modules: string[];
  documentType: 'cnpj' | 'cpf';
  document: string;
  legalName: string;
  tradeName: string;
  email: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  segment: string;
  contactName: string;
  contactRole: string;
  notes: string;
};

const VALID_BACKEND_MODULES = new Set(['totem', 'os', 'erp', 'fiscal', 'ecommerce']);

/**
 * Normaliza a lista de módulos para o enum estrito aceito pelo backend:
 * ['totem', 'os', 'erp', 'fiscal', 'ecommerce']
 * O módulo 'pdv' do catálogo de UI é mapeado para 'erp'.
 */
export function normalizeModulesForBackend(modules: string[]): string[] {
  const result = new Set<string>();
  for (const m of modules || []) {
    const key = (m || '').toLowerCase().trim();
    if (key === 'pdv') {
      result.add('erp');
    } else if (VALID_BACKEND_MODULES.has(key)) {
      result.add(key);
    }
  }
  const array = Array.from(result);
  return array.length > 0 ? array : ['erp'];
}

export async function submitPartnerSignup(payload: PartnerSignupPayload) {
  const base = nestApiUrl();

  // Garante apenas os campos estritamente permitidos pela whitelist do backend
  const sanitizedPayload = {
    planId: payload.planId,
    modules: normalizeModulesForBackend(payload.modules),
    documentType: payload.documentType,
    document: payload.document,
    legalName: payload.legalName,
    tradeName: payload.tradeName,
    email: payload.email,
    phone: payload.phone,
    zipCode: payload.zipCode,
    street: payload.street,
    number: payload.number,
    complement: payload.complement || '',
    district: payload.district,
    city: payload.city,
    state: payload.state,
    segment: payload.segment || '',
    contactName: payload.contactName,
    contactRole: payload.contactRole || '',
    notes: payload.notes || '',
  };

  const response = await fetch(`${base}/api/v1/partners/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizedPayload),
  });

  const body = (await response.json().catch(() => null)) as
    | { success: true; data: { id: string } }
    | { success: false; error?: { message?: string } }
    | null;

  if (!response.ok || !body || body.success !== true) {
    throw new Error(
      (body && 'error' in body && body.error?.message) ||
        'Não foi possível enviar o cadastro. Tente novamente.',
    );
  }

  return body.data;
}
