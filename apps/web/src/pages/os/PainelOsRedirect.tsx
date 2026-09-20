import { Navigate, useLocation } from 'react-router-dom';

/** Mantém bookmarks antigos do painel apontando para o app de OS. */
export function PainelOsRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/painel\/os/, '') || '';
  return <Navigate to={`/os${rest}${location.search}${location.hash}`} replace />;
}
