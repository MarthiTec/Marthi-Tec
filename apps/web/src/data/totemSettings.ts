export type TotemMode = 'kiosk' | 'catalog';

export type TotemSettings = {
  mode: TotemMode;
};

const STORAGE_KEY = 'marthi.totem.settings.v1';
export const TOTEM_SETTINGS_EVENT = 'marthi-totem-settings';

export function defaultTotemSettings(): TotemSettings {
  return { mode: 'kiosk' };
}

function read(): TotemSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTotemSettings();
    const parsed = JSON.parse(raw) as Partial<TotemSettings>;
    return {
      mode: parsed.mode === 'catalog' ? 'catalog' : 'kiosk',
    };
  } catch {
    return defaultTotemSettings();
  }
}

export function getTotemSettings() {
  return read();
}

export function saveTotemSettings(input: TotemSettings) {
  const next: TotemSettings = {
    mode: input.mode === 'catalog' ? 'catalog' : 'kiosk',
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(TOTEM_SETTINGS_EVENT));
  return next;
}
