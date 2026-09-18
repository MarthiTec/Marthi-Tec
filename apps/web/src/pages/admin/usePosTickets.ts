import { useCallback, useEffect, useState } from 'react';
import { fetchPosTickets, type PosTicket } from '../../services/pos';

export function usePosTickets() {
  const [tickets, setTickets] = useState<PosTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const items = await fetchPosTickets();
      setTickets(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o PDV.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 8000);
    return () => window.clearInterval(timer);
  }, [reload]);

  return { tickets, error, loading, reload, setTickets };
}
