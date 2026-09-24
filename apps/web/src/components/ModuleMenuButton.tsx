import { AdminIcon } from './AdminIcons';
import './moduleMenuButton.css';

type ModuleMenuButtonProps = {
  open: boolean;
  onClick: () => void;
  className?: string;
  /** Atalho exibido no botão (padrão Alt+M). */
  shortcut?: string;
  openLabel?: string;
  closeLabel?: string;
  title?: string;
};

/**
 * Botão padrão Menu / Fechar dos apps independentes (ERP, PDV, OS, Fiscal, CRM, E-commerce).
 * Ícone `ops` + rótulo + kbd — mesmo visual do ERP.
 */
export function ModuleMenuButton({
  open,
  onClick,
  className = '',
  shortcut = 'Alt+M',
  openLabel = 'Menu',
  closeLabel = 'Fechar',
  title,
}: ModuleMenuButtonProps) {
  return (
    <button
      type="button"
      className={`module-menu-btn ${open ? 'is-open' : ''} ${className}`.trim()}
      aria-label={open ? `${closeLabel} menu` : `${openLabel} menu`}
      aria-expanded={open}
      title={title ?? `Menu · ${shortcut}`}
      onClick={onClick}
    >
      <AdminIcon name="ops" />
      <span>{open ? closeLabel : openLabel}</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}
