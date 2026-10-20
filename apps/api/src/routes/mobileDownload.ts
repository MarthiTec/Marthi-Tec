import { Router } from 'express';
import { env } from '../config/env.js';

/** Links públicos de instalação do app lojista (env Discloud / local). */
export const mobileDownloadRouter = Router();

const DISTRIBUTION_GUIDE_URL =
  'https://github.com/MarthiTec/Marthi-Tec/blob/main/apps/mobile/DISTRIBUTION.md';

type Channel = 'apk' | 'expo-go' | 'testflight' | 'generic';

function detectChannel(url: string | null | undefined): Channel {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return 'generic';
  if (u.includes('testflight.apple.com') || u.startsWith('itms-services:')) return 'testflight';
  if (/\.apk(\?|#|$)/.test(u) || (u.includes('artifacts/eas/') && u.includes('apk'))) return 'apk';
  if (
    u.includes('expo.dev') ||
    u.includes('expo.io') ||
    u.includes('.exp.direct') ||
    u.startsWith('exp://') ||
    u.includes('/app-lojista') ||
    u.includes('exps://')
  ) {
    return 'expo-go';
  }
  return 'generic';
}

/** Fallback Expo Go quando env ainda não injeta no container (git sync) ou está vazio. */
function defaultInstallUrl(platform: 'android' | 'ios'): string | null {
  const base = String(env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (!base.startsWith('https://')) return null;
  return `${base}/app-lojista?platform=${platform}`;
}

/** Lê em request-time: git-sync às vezes atrasa/omit vars no bootstrap do módulo. */
function runtimeUrl(...keys: string[]): string | undefined {
  for (const key of keys) {
    const fromProcess = String(process.env[key] || '').trim();
    if (fromProcess) return fromProcess;
  }
  return undefined;
}

function resolveInstallUrl(
  platform: 'android' | 'ios',
  parsed: string | undefined,
  runtimeKeys: string[],
): string | null {
  const live = runtimeUrl('EXPO_DEV_CLIENT_URL', ...runtimeKeys) || parsed || env.EXPO_DEV_CLIENT_URL;
  if (live) return live;
  return defaultInstallUrl(platform);
}

mobileDownloadRouter.get('/api/v1/mobile/download', (_req, res) => {
  // Prefer env (APK/TestFlight/EAS / tunnel). Fallback: página pública Expo Go em /app-lojista.
  const androidApkUrl = resolveInstallUrl('android', env.MOBILE_ANDROID_APK_URL, [
    'MOBILE_ANDROID_APK_URL',
  ]);
  const iosInstallUrl = resolveInstallUrl('ios', env.MOBILE_IOS_INSTALL_URL, ['MOBILE_IOS_INSTALL_URL']);
  const expoDevClientUrl =
    runtimeUrl('EXPO_DEV_CLIENT_URL') || env.EXPO_DEV_CLIENT_URL || null;
  res.json({
    success: true,
    data: {
      androidApkUrl,
      iosInstallUrl,
      expoDevClientUrl,
      androidChannel: detectChannel(androidApkUrl),
      iosChannel: detectChannel(iosInstallUrl),
      distributionGuideUrl: DISTRIBUTION_GUIDE_URL,
    },
  });
});
