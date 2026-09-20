import { useLocation } from 'react-router-dom';

/** Base do app de OS conforme a superfície (painel admin vs oficina). */
export function osBaseFromPath(pathname: string) {
  return pathname.startsWith('/painel') ? '/painel/os' : '/os';
}

export function useOsBase() {
  const { pathname } = useLocation();
  return osBaseFromPath(pathname);
}

export function osHref(base: string, suffix = '') {
  if (!suffix) return base;
  if (suffix.startsWith('?')) return `${base}${suffix}`;
  return `${base}${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
}
