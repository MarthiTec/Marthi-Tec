import { useEffect, useState } from 'react';
import { nestGet } from '../services/nestClient';
export type DeviceModel = { brand: string; model: string; colors: string[]; capacities: string[]; sourceUrl: string };
export function normalizeText(value: string | null | undefined) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function attributeKind(name: string): 'color' | 'capacity' | null {
  const value = normalizeText(name);
  return /\b(cor|cores|color|colour)\b/.test(value) ? 'color' : /(capac|armazen|memoria|storage)/.test(value) ? 'capacity' : null;
}
export function useDeviceReference(name: string) {
  const [device, setDevice] = useState<DeviceModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setDevice(null); setError(''); setLoading(false);
    if (!/\biphone\b/i.test(name)) return;
    setLoading(true);
    const timer = setTimeout(() => {
      nestGet<DeviceModel | null>(`/device-reference?name=${encodeURIComponent(name)}`)
        .then(row => { if (active) setDevice(row); })
        .catch(() => { if (active) setError('Não foi possível consultar o modelo. Você pode preencher os dados manualmente.'); })
        .finally(() => { if (active) setLoading(false); });
    }, 500);
    return () => { active = false; clearTimeout(timer); };
  }, [name]);
  return { device, loading, error };
}
