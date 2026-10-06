import { nestGet } from '../services/nestClient';
import { ADMIN_STATE_EVENT, STOCK_EVENT, invalidateAdminMemory } from './adminStore';
import { ATTRIBUTES_EVENT } from './attributeStore';
import { TOTEM_SETTINGS_EVENT, invalidateTotemSettingsMemory } from './totemSettings';

export const TOTEM_LIVE_CHANNEL = 'marthi-totem-live';
export const TOTEM_LIVE_EVENT = 'marthi-totem-live';

export function notifyTotemLive() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TOTEM_LIVE_EVENT));
  try {
    const channel = new BroadcastChannel(TOTEM_LIVE_CHANNEL);
    channel.postMessage({ at: Date.now() });
    channel.close();
  } catch {
    /* BroadcastChannel indisponível */
  }
}

export function subscribeTotemLive(onChange: () => void | Promise<void>) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  let refreshing = false;
  let disposed = false;
  function refresh() {
    if (refreshing || disposed) return;
    refreshing = true;
    invalidateAdminMemory();
    invalidateTotemSettingsMemory();
    try {
      void Promise.resolve(onChange()).catch(() => undefined).finally(() => { refreshing = false; });
    } catch {
      refreshing = false;
    }
  }

  function onStorage(event: StorageEvent) {
    const keys = ['marthi.admin.v2', 'marthi.admin.v1', 'marthi.totem.settings.v1', 'marthi.attributes.v1'];
    if (event.key && !keys.some(key => event.key === key || event.key!.startsWith(`${key}:`))) {
      return;
    }
    refresh();
  }

  window.addEventListener(STOCK_EVENT, refresh);
  window.addEventListener(ADMIN_STATE_EVENT, refresh);
  window.addEventListener(ATTRIBUTES_EVENT, refresh);
  window.addEventListener(TOTEM_SETTINGS_EVENT, refresh);
  window.addEventListener(TOTEM_LIVE_EVENT, refresh);
  window.addEventListener('storage', onStorage);

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(TOTEM_LIVE_CHANNEL);
    channel.onmessage = () => refresh();
  } catch {
    channel = null;
  }

  function safeBackgroundPoll() {
    // Não executa polling se a aba estiver em segundo plano ou se outra chamada estiver pendente
    if (typeof document !== 'undefined' && document.hidden) return;
    refresh();
  }

  // Intervalo seguro de 45s (evita estourar o rate limiter/throttler do servidor)
  const poll = window.setInterval(safeBackgroundPoll, 45_000);
  let revision: string | null = null;
  let checkingRevision = false;
  async function checkRevision() {
    if(disposed || checkingRevision || document.hidden) return;
    checkingRevision=true;
    try {
      const next=await nestGet<{revision:string}>('/totem/revision');
      if(!disposed && revision!==null && revision!==next.revision) refresh();
      revision=next.revision;
    }catch { /* O polling completo continua tentando após falhas de conexão. */ }
    finally {checkingRevision=false;}
  }
  void checkRevision();
  const revisionPoll=window.setInterval(checkRevision,5_000);
  window.addEventListener('online',refresh);


  return () => {
    disposed = true;
    window.removeEventListener(STOCK_EVENT, refresh);
    window.removeEventListener(ADMIN_STATE_EVENT, refresh);
    window.removeEventListener(ATTRIBUTES_EVENT, refresh);
    window.removeEventListener(TOTEM_SETTINGS_EVENT, refresh);
    window.removeEventListener(TOTEM_LIVE_EVENT, refresh);
    window.removeEventListener('storage', onStorage);
    channel?.close();
    window.clearInterval(poll);
    window.clearInterval(revisionPoll);
    window.removeEventListener('online',refresh);
  };
}
