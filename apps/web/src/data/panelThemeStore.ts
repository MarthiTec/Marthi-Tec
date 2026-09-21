const STORAGE_KEY = 'marthi.panel.theme.v1';
export const PANEL_THEME_EVENT = 'marthi-panel-theme-updated';

export type PanelTheme = 'light' | 'dark';

function readTheme(): PanelTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') return raw;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function getPanelTheme(): PanelTheme {
  return readTheme();
}

export function setPanelTheme(theme: PanelTheme) {
  localStorage.setItem(STORAGE_KEY, theme);
  window.dispatchEvent(new Event(PANEL_THEME_EVENT));
}

export function togglePanelTheme(): PanelTheme {
  const next: PanelTheme = readTheme() === 'dark' ? 'light' : 'dark';
  setPanelTheme(next);
  return next;
}
