/**
 * Trava de quiosque: depois que o /totem é aberto neste aparelho, o navegador fica preso
 * no totem até alguém da loja digitar a senha de saída (conferida no servidor).
 *
 * A trava é do aparelho, não da loja: o computador do gerente continua livre enquanto o
 * totem do salão fica travado. Por isso ela mora no navegador do próprio totem, e guarda
 * só o endereço do totem para onde voltar — nenhuma informação da loja.
 */
const LOCK_KEY = 'marthi.totem.kiosk_lock.v1';

export function lockDeviceToTotem(totemUrl: string) {
  try {
    localStorage.setItem(LOCK_KEY, totemUrl);
  } catch {
    /* Sem storage (aba anônima bloqueada): a trava vale só enquanto a página estiver aberta. */
  }
}

export function unlockDeviceFromTotem() {
  try {
    localStorage.removeItem(LOCK_KEY);
  } catch {
    /* nada a limpar */
  }
}

/** Endereço do totem para onde o aparelho deve voltar, ou null se o aparelho está livre. */
export function lockedTotemUrl(): string | null {
  try {
    const value = localStorage.getItem(LOCK_KEY);
    return value && value.startsWith('/totem') ? value : null;
  } catch {
    return null;
  }
}

/** Telas que o cliente pode ver com o aparelho travado: o próprio totem e o acompanhamento do pedido. */
export function isAllowedWhileTotemLocked(pathname: string) {
  return /^\/totem(?:\/|$)/.test(pathname) || pathname.startsWith('/acompanhar-retirada/');
}
