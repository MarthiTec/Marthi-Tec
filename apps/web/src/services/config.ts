/** Nest público. Usado no build do site quando VITE_API_URL não foi definido. */
const PUBLIC_NEST_URL = 'https://marthi-backend.discloud.app';

/**
 * Nest API (Marthi-Backend).
 * Dev com VITE_API_URL vazio: mesma origem, e o Vite encaminha para o Nest local.
 * Build de produção sem a variável: o site chama o Nest, não a API Express.
 */
export function nestApiUrl() {
  const configured = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  if (configured) return configured;
  if (import.meta.env.DEV) return '';
  return PUBLIC_NEST_URL;
}

/** @deprecated O site não guarda mais leads/PDV. Tudo vai para o Nest. */
export function edgeApiUrl() {
  return nestApiUrl();
}
