import { HubPage, type HubTab } from '../../components/HubPage';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessPath, userIsStoreAdmin } from '../../data/erpRegistry';
import { hubFullAccess, type PeopleTab } from '../../data/hubPaths';
import { CustomersPage } from './CustomersPage';
import { EmployeesPage } from './EmployeesPage';
import { PermissionsPage } from './PermissionsPage';
import { SellersPage } from './SellersPage';
import { SuppliersPage } from './SuppliersPage';

const TABS: Array<HubTab<PeopleTab> & { legacy: string }> = [
  { id: 'clientes', label: 'Clientes', icon: 'user', legacy: '/erp/clientes', hint: 'Quem compra na loja. Também dá para cadastrar direto na venda.', render: () => <CustomersPage /> },
  { id: 'fornecedores', label: 'Fornecedores', icon: 'factory', legacy: '/erp/fornecedores', hint: 'De quem a loja compra. Aparece no cadastro do produto e nas notas de entrada.', render: () => <SuppliersPage /> },
  { id: 'vendedores', label: 'Vendedores', icon: 'badge', legacy: '/erp/vendedores', hint: 'Quem vende e a comissão de cada um.', render: () => <SellersPage /> },
  { id: 'funcionarios', label: 'Funcionários', icon: 'people', legacy: '/erp/funcionarios', hint: 'Equipe da loja e o acesso de cada pessoa ao sistema.', render: () => <EmployeesPage /> },
  { id: 'permissoes', label: 'Permissões', icon: 'shield', legacy: '/erp/permissoes', hint: 'O que cada funcionário pode ver e fazer.', render: () => <PermissionsPage /> },
];

/** Pessoas numa tela só: clientes, fornecedores, vendedores, funcionários e permissões. */
export function PeoplePage() {
  const { user } = useAuth();
  const full = hubFullAccess(user?.role, userIsStoreAdmin(user?.email));
  // Mesma regra do painel: admin da loja vê tudo; os demais, conforme a permissão de cada tela.
  const allowed = TABS.filter((tab) => full || canAccessPath(tab.legacy, user?.email));
  if (allowed.length === 0) return <p className="empty">Sem permissão para os cadastros de pessoas.</p>;
  return (
    <HubPage
      icon="people"
      title="Pessoas"
      subtitle="Clientes, fornecedores, vendedores e equipe num lugar só. Escolha a aba e cadastre sem trocar de tela."
      tabs={allowed}
    />
  );
}
