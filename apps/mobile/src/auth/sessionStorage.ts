import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'marthi.auth.token';
const STORE_KEY = 'marthi.active.storeId';

/**
 * Persistência de sessão: SecureStore no nativo (Keychain / Keystore).
 * Web (Expo web / testes): sessionStorage — nunca localStorage permanente com token.
 */
async function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function saveToken(token: string) {
  await setItem(TOKEN_KEY, token);
}

export async function readToken(): Promise<string | null> {
  const value = await getItem(TOKEN_KEY);
  if (!value || value === 'null' || value === 'undefined' || value === 'marthi-demo-token') {
    return null;
  }
  return value;
}

export async function clearToken() {
  await deleteItem(TOKEN_KEY);
}

export async function saveActiveStoreId(storeId: string) {
  await setItem(STORE_KEY, storeId);
}

export async function readActiveStoreId(): Promise<string | null> {
  return getItem(STORE_KEY);
}

export async function clearActiveStoreId() {
  await deleteItem(STORE_KEY);
}

export async function clearSession() {
  await clearToken();
  await clearActiveStoreId();
}
