import { useLocation } from 'react-router-dom';
import { HubPage, type HubTab } from '../../components/HubPage';
import { useAuth } from '../../contexts/AuthContext';
import { canAccessPath } from '../../data/erpRegistry';
import type { SpecsTab } from '../../data/hubPaths';
import { AttributesPage } from './AttributesPage';
import { BrandsPage } from './BrandsPage';
import { PickupMethodsPage } from './PickupMethodsPage';

/** Especificações dos produtos numa tela só: marcas, atributos (cor, capacidade…) e tipos de retirada. */
export function SpecificationsPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Cada aba respeita a permissão da tela que existia antes dela.
  const legacy = pathname.startsWith('/painel/totem')
    ? { marcas: '/painel/totem/marcas', atributos: '/painel/totem/atributos', retirada: '/painel/totem' }
    : { marcas: '/erp/marcas', atributos: '/erp/atributos', retirada: '/erp/tipos-retirada' };
  const tabs: HubTab<SpecsTab>[] = [
    { id: 'marcas', label: 'Marcas', icon: 'tag', hint: 'Marcas dos produtos, com o ícone que aparece na vitrine do totem.', render: () => <BrandsPage /> },
    { id: 'atributos', label: 'Atributos', icon: 'sliders', hint: 'Cor, capacidade, tamanho… Os valores viram as variações do produto.', render: () => <AttributesPage /> },
    { id: 'retirada', label: 'Tipos de retirada', icon: 'truck', hint: 'Em mãos, encomenda, entrega: como o cliente recebe o produto e o prazo de cada forma.', render: () => <PickupMethodsPage /> },
  ];
  const allowed = tabs.filter((tab) => canAccessPath(legacy[tab.id], user?.email));
  if (allowed.length === 0) return <p className="empty">Sem permissão para as especificações dos produtos.</p>;
  return (
    <HubPage
      icon="tag"
      title="Especificações"
      subtitle="Tudo o que descreve os produtos num lugar só: marcas, atributos e tipos de retirada."
      tabs={allowed}
    />
  );
}
