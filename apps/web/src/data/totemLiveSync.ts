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

export function subscribeTotemLive(onChange: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  function refresh() {
    invalidateAdminMemory();
    invalidateTotemSettingsMemory();
    onChange();
  }

  function onStorage(event: StorageEvent) {
    if (
      event.key &&
      event.key !== 'marthi.admin.v1' &&
      event.key !== 'marthi.totem.settings.v1' &&
      event.key !== 'marthi.attributes.v1'
    ) {
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

  const poll = window.setInterval(refresh, 2500);

  return () => {
    window.removeEventListener(STOCK_EVENT, refresh);
    window.removeEventListener(ADMIN_STATE_EVENT, refresh);
    window.removeEventListener(ATTRIBUTES_EVENT, refresh);
    window.removeEventListener(TOTEM_SETTINGS_EVENT, refresh);
    window.removeEventListener(TOTEM_LIVE_EVENT, refresh);
    window.removeEventListener('storage', onStorage);
    channel?.close();
    window.clearInterval(poll);
  };
}
