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

export async function submitPartnerSignup(payload: PartnerSignupPayload) {
  const base = nestApiUrl();
  const response = await fetch(`${base}/api/v1/partners/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
