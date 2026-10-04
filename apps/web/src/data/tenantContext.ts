/**
 * Tenant / Account Context
 * Permite isolar os dados (vendas, estoque, usuários, ordens de serviço)
 * por cliente/conta contratante no localStorage e no sistema.
 */

export function getActiveTenantKey(): string {
  if (typeof window === 'undefined') return 'default';
  try {
    const token = window.localStorage.getItem('marthi.auth.token');
    if (!token) return 'default';

    // Cliente contratante autenticado
    if (token.startsWith('marthi-client-token:')) {
      const parts = token.slice('marthi-client-token:'.length).split(':');
      const clientId = parts[0]?.trim();
      return clientId ? `client_${clientId}` : 'default';
    }

    // Funcionário de loja autenticado
    if (token.startsWith('marthi-employee-token:')) {
      const parts = token.slice('marthi-employee-token:'.length).split(':');
      const empId = parts[0]?.trim();
      return empId ? `emp_${empId}` : 'default';
    }

    // Staff da Marthi Tecnologia (operações internas / demo staff)
    if (token.startsWith('marthi-staff-local:')) {
      const email = token.slice('marthi-staff-local:'.length).trim().toLowerCase();
      return `staff_${email.replace(/[^a-z0-9]/g, '_')}`;
    }

    // Token JWT (se conectado ao Nest backend)
    const dotIdx = token.indexOf('.');
    if (dotIdx > 0) {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)))) as { clientAccountId?: string; email?: string };
        if (payload.clientAccountId) return `acc_${payload.clientAccountId}`;
        if (payload.email) return `user_${payload.email.replace(/[^a-z0-9]/g, '_')}`;
      }
    }
  } catch {
    /* fallback seguro */
  }
  return 'default';
}

/** Retorna a chave do localStorage com namespace do tenant atual */
export function tenantScopedKey(baseKey: string, specificTenant?: string): string {
  const tenant = specificTenant || getActiveTenantKey();
  if (!tenant || tenant === 'default') return baseKey;
  return `${baseKey}:${tenant}`;
}

/** Verifica se a sessão atual é de um cliente novo/real (não-demo) */
export function isRealClientTenant(): boolean {
  const key = getActiveTenantKey();
  return key.startsWith('client_') || key.startsWith('acc_') || key.startsWith('emp_');
}
