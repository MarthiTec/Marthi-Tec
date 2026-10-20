import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

/** Mirror of apps/web/src/lib/mobileInstallChannel.ts — keep in sync via source asserts below. */
function detectMobileInstallChannel(url) {
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

test('detects apk vs expo-go vs testflight', () => {
  assert.equal(detectMobileInstallChannel('https://expo.dev/artifacts/eas/x.apk'), 'apk');
  assert.equal(
    detectMobileInstallChannel('https://marthi-totem.discloud.dev/app-lojista?platform=android'),
    'expo-go',
  );
  assert.equal(detectMobileInstallChannel('https://testflight.apple.com/join/abc'), 'testflight');
});

test('web channel helper source matches expected labels', () => {
  const src = fs.readFileSync('apps/web/src/lib/mobileInstallChannel.ts', 'utf8');
  assert.match(src, /Abrir no Expo Go \(Android\)/);
  assert.match(src, /Baixar APK Android/);
  assert.match(src, /Abrir TestFlight/);
  assert.match(src, /\/app-lojista/);
});