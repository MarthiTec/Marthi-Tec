import { useCanOpen } from './AreaGuard';
import { ERP_TOP_SHORTCUTS } from '../data/screenDirectory';
import { AppsGridMenu, type AppsGridItem } from './AppsGridMenu';

/**
 * Atalhos da Retaguarda (API de aparelhos, Taxas & Maquininhas, Relatórios, Auditoria)
 * no mesmo padrão de grade do Painel. Addon no topo — não remove itens da sidebar.
 */
export function ErpAppsMenu() {
  const canOpen = useCanOpen();

  const items: AppsGridItem[] = ERP_TOP_SHORTCUTS.filter((item) => canOpen(item.path)).map(
    ({ id, label, hint, icon, path, also }) => ({
      id,
      label,
      hint,
      icon,
      to: path,
      also,
    }),
  );

  if (items.length === 0) return null;

  return (
    <AppsGridMenu
      items={items}
      ariaLabel="Atalhos da Retaguarda"
      title="API de aparelhos, taxas, relatórios e auditoria"
    />
  );
}
