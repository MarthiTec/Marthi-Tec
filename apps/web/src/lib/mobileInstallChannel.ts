/** Classifica URL de instalação do app lojista para rótulos honestos no painel. */

export type MobileInstallChannel = 'apk' | 'expo-go' | 'testflight' | 'generic';

export function detectMobileInstallChannel(url: string | null | undefined): MobileInstallChannel {
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

export function androidInstallCtaLabel(channel: MobileInstallChannel): string {
  if (channel === 'apk') return 'Baixar APK Android';
  if (channel === 'expo-go') return 'Abrir no Expo Go (Android)';
  return 'Abrir link Android';
}

export function iosInstallCtaLabel(channel: MobileInstallChannel): string {
  if (channel === 'testflight') return 'Abrir TestFlight';
  if (channel === 'expo-go') return 'Abrir no Expo Go (iPhone)';
  if (channel === 'apk') return 'Link iOS';
  return 'Instalar no iPhone / iPad';
}

export function androidInstallLead(channel: MobileInstallChannel): string {
  if (channel === 'apk') return 'APK para sideload em dispositivos de teste da loja.';
  if (channel === 'expo-go') {
    return 'Canal temporário via Expo Go (ainda sem APK EAS assinado). Não é um arquivo .apk.';
  }
  return 'Link de acesso Android configurado no Site.';
}

export function iosInstallLead(channel: MobileInstallChannel): string {
  if (channel === 'testflight') return 'TestFlight interno / Ad Hoc quando disponível.';
  if (channel === 'expo-go') {
    return 'Canal temporário via Expo Go (ainda sem build iOS Ad Hoc / TestFlight).';
  }
  return 'Link de instalação iOS configurado no Site.';
}
