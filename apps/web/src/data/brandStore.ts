import { useCallback, useEffect, useRef, useState } from 'react';
import { nestDelete, nestGet, nestPatch, nestPost } from '../services/nestClient';
import { STORE_CONTEXT_CHANGED_EVENT } from './multiStoreStore';

export type Brand = { id: string; name: string; slug: string; active: boolean; productCount: number; logo?: string | null; logoSource?: '' | 'upload' | 'auto' };
export const BRANDS_EVENT = 'marthi-brands-updated';
export function normalizeBrand(value: string | undefined | null) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function notify() { window.dispatchEvent(new Event(BRANDS_EVENT)); }
export function fetchBrands(_force = false) { return nestGet<Brand[]>('/brands'); }
export async function createBrand(name: string) { const brand = await nestPost<Brand>('/brands', { name: name.trim() }); notify(); return brand; }
export async function updateBrand(id: string, body: Partial<Pick<Brand, 'name' | 'active' | 'logo'>>) { const brand = await nestPatch<Brand>(`/brands/${id}`, body); notify(); return brand; }
/** Busca o ícone padrão da marca pelo nome (Simple Icons) e salva no banco. */
export async function autoBrandLogo(id: string) { const brand = await nestPost<Brand>(`/brands/${id}/logo/auto`); notify(); return brand; }
/** Preenche o ícone de todas as marcas sem ícone; devolve quais foram encontradas. */
export async function autoFillBrandLogos() { const result = await nestPost<{ found: string[]; missing: string[] }>('/brands/logos/auto'); notify(); return result; }
export async function deleteBrand(id: string) { await nestDelete(`/brands/${id}`); notify(); }
export function findBrand(brands: Brand[], value: string | undefined | null) {
  const key = normalizeBrand(value);
  return key ? brands.find(b => b.slug === key || normalizeBrand(b.name) === key) : undefined;
}
export function useBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  const reload = useCallback(async () => {
    const current = ++version.current;
    setLoading(true); setError('');
    try { const rows = await fetchBrands(); if (current === version.current) setBrands(rows); }
    catch (err) { if (current === version.current) { setBrands([]); setError(err instanceof Error ? err.message : 'Não foi possível carregar as marcas.'); } }
    finally { if (current === version.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const changed = () => { setBrands([]); void reload(); };
    void reload();
    window.addEventListener(BRANDS_EVENT, reload);
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, changed);
    return () => { ++version.current; window.removeEventListener(BRANDS_EVENT, reload); window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, changed); };
  }, [reload]);
  return { brands, loading, error, reload };
}
