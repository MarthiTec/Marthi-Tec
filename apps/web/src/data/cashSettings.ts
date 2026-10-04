import { readModuleState, loadModuleState, saveModuleState } from './moduleState';
import { nestPost } from '../services/nestClient';
import { getPosTerminalId } from './posDraftStore';
/** Configurações locais do PDV / caixa. */

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
  deletePasswordConfigured?: boolean;
  /** Permite editar preço unitário no grid do PDV. */
  allowEditUnitPrice: boolean;
  /** Habilita módulo e ações de Orçamento na venda / PDV. */
  enableQuotes: boolean;
  /** Habilita Venda Avulsa no caixa (padrão). */
  enableAdHocSales?: boolean;
  /** Configuração específica por terminal/caixa (ex: { 'CAIXA-01': true, 'CAIXA-02': false }). */
  terminalAdHocSales?: Record<string, boolean>;
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
  deleteItemPassword: '',
  allowEditUnitPrice: false,
  enableQuotes: true,
  enableAdHocSales: true,
  terminalAdHocSales: {},
};

function load(): CashSettings { return readModuleState('cash-settings', DEFAULTS); }
async function save(next: CashSettings) { const saved = await saveModuleState('cash-settings', next); window.dispatchEvent(new Event(CASH_SETTINGS_EVENT)); return saved; }

export function getCashSettings() {
  return load();
}

export async function updateCashSettings(patch: Partial<CashSettings>) {
  const next = { ...load(), ...patch };
  return await save(next);
}

export async function verifyDeleteItemPassword(password: string) {
  const result = await nestPost<{ valid: boolean }>('/module-state/cash-settings/verify-password', { password });
  return result.valid;
}

/** Última leitura informada pelo dispositivo (kg). */
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
 * Sem leitura real disponível: devolve null.
 */
export function readScaleKg(): number | null {
  if (!load().scaleEnabled) return null;
  return getLastScaleKg();
}

/** Verifica se a Venda Avulsa está habilitada para o terminal/caixa informado */
export function isAdHocEnabledForTerminal(terminalId?: string): boolean {
  const settings = load();
  const tid = (terminalId || getPosTerminalId()).trim();
  if (settings.terminalAdHocSales && typeof settings.terminalAdHocSales[tid] === 'boolean') {
    return settings.terminalAdHocSales[tid];
  }
  return settings.enableAdHocSales ?? true;
}

/** Altera a configuração de Venda Avulsa de um terminal e registra na auditoria */
export async function setAdHocEnabledForTerminal(
  terminalId: string,
  enabled: boolean,
  actor?: { name: string; email: string },
) {
  const tid = terminalId.trim() || getPosTerminalId();
  const settings = load();
  const prevMap = settings.terminalAdHocSales || {};
  const prevStatus = isAdHocEnabledForTerminal(tid);
  const nextMap = { ...prevMap, [tid]: enabled };

  await updateCashSettings({
    terminalAdHocSales: nextMap,
  });

  // Registro de Auditoria detalhado
  import('./auditLog').then(({ logAudit }) => {
    logAudit({
      kind: 'action',
      actorName: actor?.name || 'Administrador',
      actorEmail: actor?.email || 'admin@marthi.com.br',
      action: `Configuração Venda Avulsa: ${enabled ? 'Ativada' : 'Desativada'} no ${tid}`,
      detail: `Terminal ${tid}: Venda Avulsa alterada de "${prevStatus ? 'Ativada' : 'Desativada'}" para "${enabled ? 'Ativada' : 'Desativada'}"`,
      path: '/caixa/configuracoes',
    });
  });
}

/** Lista todos os terminais conhecidos e seus status de Venda Avulsa */
export function listTerminalAdHocConfigs(): Array<{ terminalId: string; enabled: boolean }> {
  const settings = load();
  const knownTerminals = [getPosTerminalId()];
  const map = settings.terminalAdHocSales || {};
  for (const tid of Object.keys(map)) {
    if (!knownTerminals.includes(tid)) {
      knownTerminals.push(tid);
    }
  }
  return knownTerminals.map((tid) => ({
    terminalId: tid,
    enabled: isAdHocEnabledForTerminal(tid),
  }));
}


export async function hydrateCashSettingsFromApi() { await loadModuleState('cash-settings', DEFAULTS); window.dispatchEvent(new Event(CASH_SETTINGS_EVENT)); }
