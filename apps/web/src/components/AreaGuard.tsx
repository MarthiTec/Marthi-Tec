import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccessPath, userIsStoreAdmin } from '../data/erpRegistry';
import { hubFullAccess } from '../data/hubPaths';
import { AccessDeniedPage } from '../pages/admin/AccessDeniedPage';

/** A pessoa pode abrir este endereço? Dono/admin/gerente sempre; os demais, conforme Pessoas › Permissões. */
export function useCanOpen() {
  const { user } = useAuth();
  const full = hubFullAccess(user?.role, userIsStoreAdmin(user?.email));
  return (path: string) => full || canAccessPath(path.split('?')[0], user?.email);
}

/**
 * Confere a tela atual contra as permissões do funcionário, em qualquer módulo (Retaguarda, OS,
 * Caixa, Fiscal, E-commerce). Sem acesso, mostra o aviso em vez da tela.
 */
export function AreaGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const canOpen = useCanOpen();
  if (canOpen(pathname)) return <>{children}</>;
  return <AccessDeniedPage pathname={pathname} />;
}
