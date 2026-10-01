/** URL de fallback público quando VITE_API_URL não foi definido */
const PUBLIC_NEST_URL = 'https://marthi-backend.discloud.app';

/**
 * API Marthi (Nest / Express).
 * Se VITE_API_URL estiver definido, utiliza o valor configurado.
 * Em desenvolvimento local, usa string vazia para ativar o proxy do Vite.
 * Em produção na Discloud, direciona para a API oficial do backend Nest (marthi-backend.discloud.app).
 */
export function nestApiUrl() {
  const configured = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  if (configured) return configured;
  if (import.meta.env.DEV) return '';
  return PUBLIC_NEST_URL;
}

export function edgeApiUrl() {
  return nestApiUrl();
}
