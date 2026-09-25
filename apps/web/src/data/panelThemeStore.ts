const STORAGE_KEY = 'marthi.panel.theme.v1';
const PROFILE_STORAGE_KEY = 'marthi.operator.profile';
export const PANEL_THEME_EVENT = 'marthi-panel-theme-updated';

export type PanelTheme = 'light' | 'dark';

function asTheme(value: unknown): PanelTheme | null {
  return value === 'dark' || value === 'light' ? value : null;
}

function profileId() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { email?: string; displayName?: string };
    return String(parsed.email || parsed.displayName || '')
      .trim()
      .toLowerCase();
  } catch {
    return '';
  }
}

function keyedStorage(id: string) {
  return id ? `${STORAGE_KEY}:${id}` : STORAGE_KEY;
}

function readTheme(): PanelTheme {
  try {
    const id = profileId();
    if (id) {
      const keyed = asTheme(localStorage.getItem(keyedStorage(id)));
      if (keyed) return keyed;
      const storedProfile = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}') as {
        theme?: unknown;
      };
      const fromProfile = asTheme(storedProfile.theme);
      if (fromProfile) return fromProfile;
    }
    const generic = asTheme(localStorage.getItem(STORAGE_KEY));
    if (generic) return generic;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function getPanelTheme(): PanelTheme {
  return readTheme();
}

function persistProfileTheme(theme: PanelTheme) {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    parsed.theme = theme;
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export function setPanelTheme(theme: PanelTheme) {
  const id = profileId();
  localStorage.setItem(STORAGE_KEY, theme);
  if (id) localStorage.setItem(keyedStorage(id), theme);
  persistProfileTheme(theme);
  window.dispatchEvent(new Event(PANEL_THEME_EVENT));
  void (async () => {
    try {
      const { patchOperatorProfileTheme } = await import('./operatorProfile');
      patchOperatorProfileTheme(theme);
      const { isNestAuthed } = await import('../services/nestClient');
      if (!isNestAuthed()) return;
      const { apiPutOperatorProfile } = await import('../services/erpApi');
      await apiPutOperatorProfile({ theme });
    } catch {
      /* ignore — tema já ficou no cache local */
    }
  })();
}

export function syncThemeForProfile(email: string, theme?: PanelTheme | null) {
  const id = email.trim().toLowerCase();
  const fromProfile = asTheme(theme);
  if (fromProfile) {
    if (id) localStorage.setItem(keyedStorage(id), fromProfile);
    localStorage.setItem(STORAGE_KEY, fromProfile);
    window.dispatchEvent(new Event(PANEL_THEME_EVENT));
    return;
  }
  if (!id) return;
  const keyed = asTheme(localStorage.getItem(keyedStorage(id)));
  if (keyed) {
    localStorage.setItem(STORAGE_KEY, keyed);
    persistProfileTheme(keyed);
    window.dispatchEvent(new Event(PANEL_THEME_EVENT));
  }
}

export function togglePanelTheme(): PanelTheme {
  const next: PanelTheme = readTheme() === 'dark' ? 'light' : 'dark';
  setPanelTheme(next);
  return next;
}
