import { useCallback, useEffect, useState } from 'react';
import {
  POS_QUEUE_EVENT,
  listQueueTickets,
  mergeQueueTickets,
  type QueueTicket,
} from '../../data/posQueueStore';
import { fetchPosTickets } from '../../services/pos';

export function usePosTickets() {
  const [tickets, setTickets] = useState<QueueTicket[]>(() => listQueueTickets());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const local = listQueueTickets();
    setTickets(local);
    try {
      setError(null);
      const remote = await fetchPosTickets();
      setTickets(mergeQueueTickets(listQueueTickets(), remote));
    } catch (err) {
      if (local.length === 0) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar o PDV.');
      } else {
        setError(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = window.setInterval(() => void reload(), 8000);
    function onQueue() {
      setTickets(listQueueTickets());
    }
    window.addEventListener(POS_QUEUE_EVENT, onQueue);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(POS_QUEUE_EVENT, onQueue);
    };
  }, [reload]);

  return { tickets, error, loading, reload, setTickets };
}
