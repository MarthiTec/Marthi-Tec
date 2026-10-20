import Constants from 'expo-constants';

/**
 * Base URL da API Marthi (HTTPS em produção).
 * Prioridade: EXPO_PUBLIC_API_URL → app.json extra.apiUrl → produção Discloud.
 */
export function apiBaseUrl(): string {
  const fromEnv = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;
  const fromExtra = (extra?.apiUrl || '').trim().replace(/\/$/, '');
  if (fromExtra) return fromExtra;

  // Produção Site ao vivo (baseDomain atual). Em dev local: EXPO_PUBLIC_API_URL=http://HOST:8080
  // Nota: *.discloud.app do totem ainda não roteia; use .discloud.dev até migrar o domínio.
  return 'https://marthi-totem.discloud.dev';
}

export function apiV1Url(): string {
  return `${apiBaseUrl()}/api/v1`;
}
