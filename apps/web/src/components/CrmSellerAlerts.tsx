import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CRM_ALERT_EVENT,
  CRM_ALERT_STORAGE_KEY,
  type CrmSellerAlert,
} from '../data/crmStore';
import './crmSellerAlerts.css';

function playMessageChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    master.connect(ctx.destination);

    const tones = [
      { freq: 880, start: 0, dur: 0.14 },
      { freq: 1174.7, start: 0.1, dur: 0.22 },
    ];
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.freq, now + tone.start);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.9, now + tone.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.dur + 0.05);
    }

    window.setTimeout(() => {
      void ctx.close();
    }, 800);
  } catch {
    /* autoplay / unsupported */
  }
}

type Toast = CrmSellerAlert & { key: string };

/**
 * Toasts flutuantes + som quando chega lead ou mensagem do cliente no CRM.
 */
export function CrmSellerAlerts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    function unlockAudio() {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        void ctx.resume().finally(() => {
          void ctx.close();
        });
      } catch {
        /* ignore */
      }
      window.removeEventListener('pointerdown', unlockAudio);
    }
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);

  useEffect(() => {
    function push(alert: CrmSellerAlert) {
      if (!alert?.id || seenRef.current.has(alert.id)) return;
      seenRef.current.add(alert.id);
      if (seenRef.current.size > 80) {
        const keep = [...seenRef.current].slice(-40);
        seenRef.current = new Set(keep);
      }
      const key = `${alert.id}-${Date.now()}`;
      setToasts((list) => [{ ...alert, key }, ...list].slice(0, 4));
      playMessageChime();
      window.setTimeout(() => {
        setToasts((list) => list.filter((item) => item.key !== key));
      }, 7000);
    }

    function onAlert(event: Event) {
      const detail = (event as CustomEvent<CrmSellerAlert>).detail;
      if (detail) push(detail);
    }

    function onStorage(event: StorageEvent) {
      if (event.key !== CRM_ALERT_STORAGE_KEY || !event.newValue) return;
      try {
        push(JSON.parse(event.newValue) as CrmSellerAlert);
      } catch {
        /* ignore */
      }
    }

    window.addEventListener(CRM_ALERT_EVENT, onAlert);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CRM_ALERT_EVENT, onAlert);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function dismiss(key: string) {
    setToasts((list) => list.filter((item) => item.key !== key));
  }

  if (toasts.length === 0) return null;

  return (
    <div className="crm-alerts" aria-live="polite">
      {toasts.map((toast) => (
        <article
          key={toast.key}
          className={`crm-alerts__toast crm-alerts__toast--${toast.kind}`}
          role="status"
        >
          <div className="crm-alerts__pulse" aria-hidden />
          <div className="crm-alerts__body">
            <p className="crm-alerts__kicker">
              {toast.kind === 'lead' ? 'Novo lead' : 'Nova mensagem'}
            </p>
            <strong>{toast.title}</strong>
            {toast.body ? <p>{toast.body}</p> : null}
            <div className="crm-alerts__actions">
              <Link
                className="btn btn--primary"
                to={
                  toast.kind === 'message'
                    ? `/crm/conversas?lead=${encodeURIComponent(toast.leadId)}`
                    : `/crm/negocio/${encodeURIComponent(toast.leadId)}`
                }
                onClick={() => dismiss(toast.key)}
              >
                Abrir
              </Link>
              <button type="button" className="btn btn--ghost" onClick={() => dismiss(toast.key)}>
                Fechar
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
