import { usePanelTheme } from '../hooks/usePanelTheme';
import './panelThemeToggle.css';

type PanelThemeToggleProps = {
  className?: string;
};

/** Alterna claro/escuro — aplicado só no painel principal por enquanto. */
export function PanelThemeToggle({ className = '' }: PanelThemeToggleProps) {
  const { theme, setTheme } = usePanelTheme();

  return (
    <div className={`panel-theme ${className}`} role="group" aria-label="Tema do painel">
      <p className="panel-theme__label">
        Tema do painel
        <em>Só no painel principal por enquanto · outros módulos seguem claros.</em>
      </p>
      <div className="panel-theme__switch">
        <button
          type="button"
          className={theme === 'light' ? 'is-active' : ''}
          aria-pressed={theme === 'light'}
          onClick={() => setTheme('light')}
        >
          Claro
        </button>
        <button
          type="button"
          className={theme === 'dark' ? 'is-active' : ''}
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme('dark')}
        >
          Escuro
        </button>
      </div>
    </div>
  );
}
