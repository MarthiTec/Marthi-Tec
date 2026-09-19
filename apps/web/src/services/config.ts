/** Nest API (Marthi-Backend). Empty = same-origin / Vite proxy to localhost:8080. */
export function nestApiUrl() {
  return (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
}

/** Express legado no Site totem (totem leads, POS) — sempre mesma origem. */
export function edgeApiUrl() {
  return '';
}
