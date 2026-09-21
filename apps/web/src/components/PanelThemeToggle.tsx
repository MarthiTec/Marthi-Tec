import { usePanelTheme } from '../hooks/usePanelTheme';
import './panelThemeToggle.css';

type PanelThemeToggleProps = {
  className?: string;
};

/** Tema claro/escuro da operação — vale no painel e em todos os módulos. */
export function PanelThemeToggle({ className = '' }: PanelThemeToggleProps) {
  const { theme, setTheme } = usePanelTheme();

  return (
    <div className={`panel-theme ${className}`} role="group" aria-label="Tema da operação">
      <p className="panel-theme__label">
        Tema da operação
        <em>Claro ou escuro em todos os apps desta conta.</em>
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
