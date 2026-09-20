import { useLocation } from 'react-router-dom';

/** Base do app fiscal conforme a superfície (painel vs emissor). */
export function fiscalBaseFromPath(pathname: string) {
  return pathname.startsWith('/painel') ? '/painel' : '/fiscal';
}

export function useFiscalBase() {
  const { pathname } = useLocation();
  return fiscalBaseFromPath(pathname);
}

export function fiscalHref(base: string, suffix: string) {
  if (base === '/fiscal') {
    if (!suffix) return '/fiscal';
    return `/fiscal${suffix.startsWith('/') ? suffix : `/${suffix}`}`;
  }
  if (suffix === 'nfe' || suffix === '/nfe') return '/painel/notas';
  if (suffix === 'config' || suffix === '/config') return '/painel/fiscal/config';
  if (suffix === 'cst' || suffix === '/cst') return '/painel/fiscal/cst';
  return `/painel/${suffix.replace(/^\//, '')}`;
}
