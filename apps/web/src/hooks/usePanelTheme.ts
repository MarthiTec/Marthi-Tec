import { useEffect, useState } from 'react';
import { PROFILE_EVENT } from '../data/operatorProfile';
import {
  getPanelTheme,
  PANEL_THEME_EVENT,
  setPanelTheme,
  togglePanelTheme,
  type PanelTheme,
} from '../data/panelThemeStore';

/** Tema claro/escuro do perfil — vale em todos os apps da mesma conta. */
export function usePanelTheme() {
  const [theme, setTheme] = useState<PanelTheme>(() => getPanelTheme());

  useEffect(() => {
    function refresh() {
      setTheme(getPanelTheme());
    }
    window.addEventListener(PANEL_THEME_EVENT, refresh);
    window.addEventListener(PROFILE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PANEL_THEME_EVENT, refresh);
      window.removeEventListener(PROFILE_EVENT, refresh);
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
