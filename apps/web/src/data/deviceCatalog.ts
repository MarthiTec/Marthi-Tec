import { useEffect, useState } from 'react';
import { nestGet } from '../services/nestClient';
export type DeviceModel = { brand: string; model: string; colors: string[]; capacities: string[]; sourceUrl: string; specifications?:Record<string,unknown>; fetchedAt?:string; stale?:boolean };
export function normalizeText(value: string | null | undefined) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function attributeKind(name: string): 'color' | 'capacity' | null {
  const value = normalizeText(name);
  return /\b(cor|cores|color|colour)\b/.test(value) ? 'color' : /(capac|armazen|memoria|storage)/.test(value) ? 'capacity' : null;
}
export function useDeviceReference(name: string,brand='') {
  const [device, setDevice] = useState<DeviceModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setDevice(null); setError(''); setLoading(false);
    if (name.trim().length<3) return;
    setLoading(true);
    const timer = setTimeout(() => {
      nestGet<DeviceModel | null>(`/device-reference?name=${encodeURIComponent(name)}&brand=${encodeURIComponent(brand)}`)
        .then(row => { if (active) setDevice(row); })
        .catch(e => { if (active) setError(e instanceof Error?e.message:'Não foi possível consultar o modelo. Você pode preencher os dados manualmente.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [name,brand]);
  return { device, loading, error };
}
