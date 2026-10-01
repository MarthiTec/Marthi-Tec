/** URL de fallback público quando VITE_API_URL não foi definido */
const PUBLIC_API_URL = 'https://marthi-totem.discloud.dev';

/**
 * API Marthi (Express / Nest).
 * Se VITE_API_URL estiver definido, utiliza o valor configurado.
 * Em desenvolvimento local, usa string vazia para ativar o proxy do Vite.
 * No navegador em produção, utiliza a mesma origem (window.location.origin) para garantir conectividade direta.
 */
export function nestApiUrl() {
  const configured = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  if (configured) return configured;
  if (import.meta.env.DEV) return '';
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin;
  }
  return PUBLIC_API_URL;
}

export function edgeApiUrl() {
  return nestApiUrl();
}
