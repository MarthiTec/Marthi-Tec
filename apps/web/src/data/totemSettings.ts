export type TotemMode = 'kiosk' | 'catalog';

export type TotemSettings = {
  mode: TotemMode;
  /** Senha para sair da tela /totem (operador da loja). */
  exitPassword: string;
  /**
   * true = totem usa o estoque do ERP (itens com “exibir no totem”).
   * false = catálogo demo isolado do ERP.
   */
  shareStockWithErp: boolean;
};

const STORAGE_KEY = 'marthi.totem.settings.v1';
export const TOTEM_SETTINGS_EVENT = 'marthi-totem-settings';

const DEFAULT_EXIT = import.meta.env.VITE_TOTEM_EXIT_PASSWORD?.trim() || 'cellponto';

let memorySettings: TotemSettings | null = null;

export function defaultTotemSettings(): TotemSettings {
  return {
    mode: 'kiosk',
    exitPassword: DEFAULT_EXIT,
    shareStockWithErp: false,
  };
}

function normalizeExitPassword(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_EXIT;
  const trimmed = value.trim();
  return trimmed || DEFAULT_EXIT;
}

function read(): TotemSettings {
  if (memorySettings) return { ...memorySettings };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultTotemSettings();
    const parsed = JSON.parse(raw) as Partial<TotemSettings>;
    return {
      mode: parsed.mode === 'catalog' ? 'catalog' : 'kiosk',
      exitPassword: normalizeExitPassword(parsed.exitPassword),
      shareStockWithErp: Boolean(parsed.shareStockWithErp),
    };
  } catch {
    return defaultTotemSettings();
  }
}

export function getTotemSettings() {
  return read();
}

export function getTotemExitPassword() {
  return read().exitPassword;
}

export function replaceTotemSettings(input: TotemSettings) {
  const next: TotemSettings = {
    mode: input.mode === 'catalog' ? 'catalog' : 'kiosk',
    exitPassword: normalizeExitPassword(input.exitPassword),
    shareStockWithErp: Boolean(input.shareStockWithErp),
  };
  memorySettings = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(TOTEM_SETTINGS_EVENT));
  return next;
}

export async function saveTotemSettings(
  input: Partial<TotemSettings> & Pick<TotemSettings, 'mode'>,
) {
  const current = read();
  const next: TotemSettings = {
    mode: input.mode === 'catalog' ? 'catalog' : 'kiosk',
    exitPassword: normalizeExitPassword(
      input.exitPassword !== undefined ? input.exitPassword : current.exitPassword,
    ),
    shareStockWithErp:
      input.shareStockWithErp !== undefined
        ? Boolean(input.shareStockWithErp)
        : current.shareStockWithErp,
  };
  const { isNestAuthed } = await import('../services/nestClient');
  if (isNestAuthed()) {
    const { apiPutTotemSettings } = await import('../services/erpApi');
    const saved = await apiPutTotemSettings(next);
    return replaceTotemSettings(saved);
  }
  return replaceTotemSettings(next);
}
