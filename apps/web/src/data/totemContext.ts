/** An explicit kiosk link selects its public catalog, independently of panel caches. */
export function getExplicitTotemStoreId(): string | null {
  if (typeof window === 'undefined' || !/^\/totem(?:\/|$)/.test(window.location.pathname)) return null;
  return new URLSearchParams(window.location.search).get('storeId')?.trim() || null;
}
