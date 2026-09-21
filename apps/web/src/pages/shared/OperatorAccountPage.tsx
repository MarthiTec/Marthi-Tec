import { useLocation } from 'react-router-dom';
import { OperatorProfilePanel } from '../../components/OperatorProfilePanel';
import '../admin/admin.css';

function labelForPath(pathname: string) {
  if (pathname.startsWith('/painel')) return 'painel Marthi';
  if (pathname.startsWith('/crm')) return 'CRM Marthi';
  if (pathname.startsWith('/erp')) return 'ERP Marthi';
  if (pathname.startsWith('/fiscal')) return 'Emissor Fiscal';
  if (pathname.startsWith('/ecommerce')) return 'E-commerce Marthi';
  if (pathname.startsWith('/os')) return 'Oficina Marthi';
  if (pathname.startsWith('/caixa')) return 'PDV Marthi';
  return 'Marthi';
}

/** Conta operacional embutida no shell do módulo atual — mesma tela do painel. */
export function OperatorAccountPage() {
  const { pathname } = useLocation();
  return (
    <section className="admin-page">
      <OperatorProfilePanel workspaceLabel={labelForPath(pathname)} />
    </section>
  );
}
