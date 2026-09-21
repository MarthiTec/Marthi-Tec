/** Senhas locais de operadores ERP (demo / retaguarda). */
const STORAGE_KEY = 'marthi.erp.user-passwords.v1';

type PasswordMap = Record<string, string>;

function load(): PasswordMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PasswordMap) : {};
  } catch {
    return {};
  }
}

function save(map: PasswordMap) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getErpUserPasswordHint(email: string) {
  const key = email.trim().toLowerCase();
  if (!key) return null;
  const map = load();
  return map[key] ? 'Definida' : 'Sem senha local';
}

export function setErpUserPassword(email: string, password: string) {
  const key = email.trim().toLowerCase();
  if (!key) throw new Error('Informe o e-mail do usuário.');
  if (password.trim().length < 4) throw new Error('Senha com no mínimo 4 caracteres.');
  const map = load();
  map[key] = password.trim();
  save(map);
}

export function clearErpUserPassword(email: string) {
  const key = email.trim().toLowerCase();
  const map = load();
  delete map[key];
  save(map);
}
