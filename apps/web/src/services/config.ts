/** URL de fallback público quando VITE_API_URL não foi definido e fora do navegador. */
const PUBLIC_NEST_URL = 'https://marthi-totem.discloud.app';

/**
 * API Marthi (Nest / Express).
 * Se VITE_API_URL estiver definido, utiliza o valor configurado.
 * Em desenvolvimento local, usa string vazia para ativar o proxy do Vite.
 * Em produção no navegador, usa window.location.origin para conectar com a mesma instância (same-origin).
 */
export function nestApiUrl() {
  const configured = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  if (configured) return configured;
  if (import.meta.env.DEV) return '';
  if (typeof window !== 'undefined' && window.location.origin) return window.location.origin;
  return PUBLIC_NEST_URL;
}

export function edgeApiUrl() {
  return nestApiUrl();
}
