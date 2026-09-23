/**
 * Conta Marthi staff (ops interno) — não é operador de loja.
 * Credenciais demo: AUTH_MARTHI_EMAIL / AUTH_MARTHI_PASSWORD (backend + .env.example).
 */

const DEFAULT_STAFF_EMAIL = 'marthi.tecnologia@gmail.com';

/** E-mails com acesso ao Painel Marthi (`/admin`). */
export const MARTHI_STAFF_EMAILS = [
  DEFAULT_STAFF_EMAIL,
  (import.meta.env.VITE_AUTH_MARTHI_EMAIL as string | undefined)?.trim().toLowerCase(),
]
  .filter(Boolean)
  .map((email) => email!.toLowerCase());

export const MARTHI_STAFF_ROLE = 'marthi_admin' as const;

export function normalizeStaffEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase();
}

export function isMarthiStaffEmail(email: string | null | undefined) {
  const normalized = normalizeStaffEmail(email);
  if (!normalized) return false;
  return MARTHI_STAFF_EMAILS.includes(normalized);
}

/** Credenciais locais (fallback quando a API Nest não está disponível). */
export function getMarthiStaffDemoCredentials() {
  return {
    email: (
      (import.meta.env.VITE_AUTH_MARTHI_EMAIL as string | undefined)?.trim() || DEFAULT_STAFF_EMAIL
    ).toLowerCase(),
    password:
      (import.meta.env.VITE_AUTH_MARTHI_PASSWORD as string | undefined)?.trim() || 'Marthi170926',
    name: 'Marthi Tecnologia',
  };
}

export function matchesMarthiStaffLogin(email: string, password: string) {
  const creds = getMarthiStaffDemoCredentials();
  return (
    normalizeStaffEmail(email) === creds.email && password.trim() === creds.password
  );
}
