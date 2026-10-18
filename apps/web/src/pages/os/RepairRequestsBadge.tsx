import { useEffect, useState } from 'react';
import { apiRepairRequestsSummary } from '../../services/repairsApi';
import { STORE_CONTEXT_CHANGED_EVENT } from '../../data/multiStoreStore';

export const REPAIRS_CHANGED = 'marthi-repairs-changed';

/** Quantas solicitações de orçamento estão aguardando análise (indicador de novas no menu da OS). */
export function useNewRepairRequests() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      apiRepairRequestsSummary()
        .then((data) => alive && setCount(data.pending))
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(() => !document.hidden && void load(), 60_000);
    window.addEventListener(REPAIRS_CHANGED, load);
    window.addEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(REPAIRS_CHANGED, load);
      window.removeEventListener(STORE_CONTEXT_CHANGED_EVENT, load);
    };
  }, []);
  return count;
}
