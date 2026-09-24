import { Navigate } from 'react-router-dom';

/** Boletos agora vivem dentro do hub Financeiro. */
export function ErpBoletosPage() {
  return <Navigate to="/erp/financeiro?section=boletos" replace />;
}
