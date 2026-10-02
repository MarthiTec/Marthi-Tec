/**
 * Indicador de credenciais de operadores ERP.
 * As senhas reais são armazenadas com hash e sal criptográfico no PostgreSQL pelo backend.
 * O armazenamento de senhas em localStorage foi desativado por questões de segurança e integridade.
 */

export function getErpUserPasswordHint(email: string): 'Definida' | 'Sem senha local' | null {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  return 'Definida';
}

export function setErpUserPassword(_email: string, _password: string) {
  // Persistência segura executada diretamente no backend PostgreSQL
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('marthi.erp.user-passwords.v1');
    } catch {
      // ignore
    }
  }
}

export function clearErpUserPassword(_email: string) {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem('marthi.erp.user-passwords.v1');
    } catch {
      // ignore
    }
  }
}

export function verifyErpUserPassword(_email: string, _password: string): boolean {
  // Autenticação oficial ocorre via backend /api/v1/auth/login
  return false;
}
