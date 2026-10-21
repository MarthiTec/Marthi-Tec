import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);

const { assertPublicHttpsImageUrl } = await import('../dist/services/imageProxy.js');
const {
  flyerCssBackground,
  flyerPngFileName,
  needsImageInline,
} = await import('../apps/web/src/utils/catalogFlyerShared.ts');

test('image proxy rejects non-https, credentials and private hosts', () => {
  assert.throws(() => assertPublicHttpsImageUrl('http://example.com/a.png'), /HTTPS/);
  assert.throws(() => assertPublicHttpsImageUrl('https://127.0.0.1/a.png'), /Não é possível/);
  assert.throws(() => assertPublicHttpsImageUrl('https://192.168.0.10/a.png'), /Não é possível/);
  assert.throws(() => assertPublicHttpsImageUrl('https://localhost/a.png'), /Não é possível/);
  assert.throws(() => assertPublicHttpsImageUrl('https://user:pass@cdn.example.com/a.png'), /inválida/);
  const ok = assertPublicHttpsImageUrl('https://cdn.example.com/photos/iphone.png?w=800');
  assert.equal(ok.hostname, 'cdn.example.com');
});

test('flyer CSS background skips data URLs (print crash) and keeps short HTTPS', () => {
  assert.equal(flyerCssBackground(''), undefined);
  assert.equal(flyerCssBackground('none'), undefined);
  assert.equal(flyerCssBackground('data:image/png;base64,aaaa'), undefined);
  assert.equal(flyerCssBackground(`data:image/jpeg;base64,${'x'.repeat(5000)}`), undefined);
  assert.equal(
    flyerCssBackground('https://cdn.example.com/cover.jpg'),
    'url("https://cdn.example.com/cover.jpg")',
  );
  assert.equal(flyerCssBackground(`https://cdn.example.com/${'a'.repeat(2000)}.jpg`), undefined);
});

test('flyer PNG name and HTTPS inline detection', () => {
  assert.equal(flyerPngFileName('cell-ponto'), 'marthi-catalogo-propaganda-cell-ponto.png');
  assert.equal(flyerPngFileName('a/b c'), 'marthi-catalogo-propaganda-a-b-c.png');
  assert.equal(needsImageInline('https://cdn.example.com/a.jpg'), true);
  assert.equal(needsImageInline('data:image/png;base64,xx'), false);
  assert.equal(needsImageInline(''), false);
});
