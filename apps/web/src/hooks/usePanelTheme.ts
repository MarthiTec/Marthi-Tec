import { useEffect, useState } from 'react';
import {
  getPanelTheme,
  PANEL_THEME_EVENT,
  setPanelTheme,
  togglePanelTheme,
  type PanelTheme,
} from '../data/panelThemeStore';

/** Tema do painel principal (claro/escuro). Outros módulos ainda não usam. */
export function usePanelTheme() {
  const [theme, setTheme] = useState<PanelTheme>(() => getPanelTheme());

  useEffect(() => {
    function refresh() {
      setTheme(getPanelTheme());
    }
    window.addEventListener(PANEL_THEME_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PANEL_THEME_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    setTheme: (value: PanelTheme) => setPanelTheme(value),
    toggle: () => togglePanelTheme(),
  };
}
