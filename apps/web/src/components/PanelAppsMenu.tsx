import { TOP_SHORTCUTS } from '../data/screenDirectory';
import { AppsGridMenu, type AppsGridItem } from './AppsGridMenu';

// Log-out é sempre a última opção.
const PANEL_APPS: AppsGridItem[] = [
  ...TOP_SHORTCUTS.map(({ id, label, hint, icon, path, adminOnly }) => ({
    id,
    label,
    hint,
    icon,
    to: path,
    adminOnly,
  })),
  { id: 'logout', label: 'Log-out', hint: 'Encerrar a sessão', icon: 'logout', danger: true },
];

/**
 * Atalhos gerais do painel (Painel, Usuários, Operações, Lojas, Central de ajuda, Log-out) num botão de grade
 * no topo, como nas outras telas. A barra lateral fica só com os módulos (Totem, PDV, OS…).
 */
export function PanelAppsMenu({ isAdmin, onLogout }: { isAdmin: boolean; onLogout: () => void }) {
  return (
    <AppsGridMenu
      items={PANEL_APPS}
      isAdmin={isAdmin}
      onLogout={onLogout}
      ariaLabel="Atalhos do painel"
      title="Painel, usuários, operações, lojas, faturamento, ajuda e log-out"
    />
  );
}
