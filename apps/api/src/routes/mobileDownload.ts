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

mobileDownloadRouter.get('/api/v1/mobile/download', (_req, res) => {
  // Prefer env (APK/TestFlight/EAS). Fallback: página pública Expo Go em /app-lojista.
  const androidApkUrl = env.MOBILE_ANDROID_APK_URL ?? defaultInstallUrl('android');
  const iosInstallUrl = env.MOBILE_IOS_INSTALL_URL ?? defaultInstallUrl('ios');
  res.json({
    success: true,
    data: {
      androidApkUrl,
      iosInstallUrl,
      androidChannel: detectChannel(androidApkUrl),
      iosChannel: detectChannel(iosInstallUrl),
      distributionGuideUrl: DISTRIBUTION_GUIDE_URL,
    },
  });
});
