import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/mobile');

test('eas preview profile produces internal Android APK', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.android.buildType, 'apk');
});

test('app.json has camera permission and no embedded secrets', () => {
  const raw = fs.readFileSync(path.join(root, 'app.json'), 'utf8');
  assert.doesNotMatch(raw, /DATABASE_URL|JWT_SECRET|password\s*[:=]/i);
  const app = JSON.parse(raw);
  assert.ok(app.expo.android.permissions.includes('CAMERA'));
  assert.ok(String(app.expo.ios.infoPlist.NSCameraUsageDescription || '').length > 10);
  assert.ok(app.expo.extra?.eas?.projectId, 'eas projectId slot present (may be placeholder)');
});

test('distribution docs exist', () => {
  assert.ok(fs.existsSync(path.join(root, 'DISTRIBUTION.md')));
  assert.ok(fs.existsSync(path.join(root, 'README.md')));
  const dist = fs.readFileSync(path.join(root, 'DISTRIBUTION.md'), 'utf8');
  assert.match(dist, /eas-cli build -p android --profile preview/);
  assert.match(dist, /Ad Hoc/);
  assert.match(dist, /Play Store|App Store/i);
});

test('mobile package is excluded from Discloud Site upload', () => {
  const ignore = fs.readFileSync('.discloudignore', 'utf8');
  assert.match(ignore, /apps\/mobile/);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.deepEqual(pkg.workspaces, ['apps/api', 'apps/web']);
});
