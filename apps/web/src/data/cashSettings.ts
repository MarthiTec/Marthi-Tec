/** Configurações locais do PDV / caixa. */

const STORAGE_KEY = 'marthi.cash.settings.v1';
const SCALE_LAST_KEY = 'marthi.cash.scale.lastKg';
export const CASH_SETTINGS_EVENT = 'marthi-cash-settings';

export type CashSettings = {
  /** Mostra “Esp.” (esperado) nos campos do fechamento. */
  showExpectedOnClose: boolean;
  /** Sinaliza abertura de gaveta (já usado pelo PDV). */
  drawerEnabled: boolean;
  /** Identificador / porta da gaveta (ex.: COM3, USB). */
  drawerPort: string;
  /** Balança ligada ao caixa. */
  scaleEnabled: boolean;
  scalePort: string;
  /** Impressora de cupom / NFC-e. */
  printerEnabled: boolean;
  printerName: string;
  /** Exige senha administrativa para excluir item do carrinho. */
  requirePasswordToDeleteItem: boolean;
  /** Senha usada na exclusão (somente admin configura). */
  deleteItemPassword: string;
  /** Permite editar preço unitário no grid do PDV. */
  allowEditUnitPrice: boolean;
};

const DEFAULTS: CashSettings = {
  showExpectedOnClose: true,
  drawerEnabled: true,
  drawerPort: '',
  scaleEnabled: false,
  scalePort: '',
  printerEnabled: true,
  printerName: '',
  requirePasswordToDeleteItem: false,
  deleteItemPassword: '1234',
  allowEditUnitPrice: false,
};

let memory: CashSettings | null = null;

function load(): CashSettings {
  if (memory) return { ...memory };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CashSettings>;
      memory = { ...DEFAULTS, ...parsed };
      return { ...memory };
    }
  } catch {
    /* ignore */
  }
  memory = { ...DEFAULTS };
  return { ...memory };
}

function save(next: CashSettings) {
  memory = { ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(CASH_SETTINGS_EVENT));
}

export function getCashSettings() {
  return load();
}

export function updateCashSettings(patch: Partial<CashSettings>) {
  const next = { ...load(), ...patch };
  save(next);
  return next;
}

export function verifyDeleteItemPassword(password: string) {
  const settings = load();
  if (!settings.requirePasswordToDeleteItem) return true;
  return password.trim() === settings.deleteItemPassword;
}

/** Última leitura da balança (kg) — mock / hardware via porta. */
export function getLastScaleKg(): number | null {
  try {
    const raw = localStorage.getItem(SCALE_LAST_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : null;
  } catch {
    return null;
  }
}

export function setLastScaleKg(kg: number) {
  const value = Math.round(Math.max(0.001, kg) * 1000) / 1000;
  try {
    localStorage.setItem(SCALE_LAST_KEY, String(value));
  } catch {
    /* ignore */
  }
  return value;
}

/**
 * Lê peso da balança quando habilitada.
 * Sem hardware: devolve a última leitura ou 0,250 kg de demo.
 */
export function readScaleKg(): number | null {
  if (!load().scaleEnabled) return null;
  return getLastScaleKg() ?? setLastScaleKg(0.25);
}
