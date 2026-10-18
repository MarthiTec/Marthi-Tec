import { useCallback, useEffect, useRef, useState } from 'react';
import { nestGet, nestPut } from '../services/nestClient';
import { STORE_CONTEXT_CHANGED_EVENT } from '../data/multiStoreStore';

/**
 * Configuração de tela do usuário (filtros, aba aberta, item escolhido…) guardada no banco, por loja.
 * Lê ao abrir a tela; cada mudança é gravada logo depois (agrupando o que mudar em sequência).
 * `loaded` avisa quando a configuração salva já chegou, para a tela não sobrescrever com o padrão.
 */
export function useUserPreference<T extends Record<string, unknown>>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<T | null>(null);
  const initialRef = useRef(initial);

  useEffect(() => {
    let alive = true;
    const load = () => {
      setLoaded(false);
      nestGet<{ value: Partial<T> | null }>(`/user-preferences/${encodeURIComponent(key)}`)
        .then((data) => {
          if (alive) setValue({ ...initialRef.current, ...(data.value ?? {}) });
        })
        .catch(() => undefined)
        .finally(() => alive && setLoaded(true));
    };
    load();
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    };
  }, [key]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const next = pending.current;
    pending.current = null;
    if (next) void nestPut(`/user-preferences/${encodeURIComponent(key)}`, { value: next }).catch(() => undefined);
  }, [key]);

  // Saiu da tela com algo por gravar: grava na hora.
  useEffect(() => flush, [flush]);

  const update = useCallback(
    (patch: Partial<T>) => {
      setValue((current) => {
        const next = { ...current, ...patch };
        pending.current = next;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, 700);
        return next;
      });
    },
    [flush],
  );

  return { value, update, loaded };
}
