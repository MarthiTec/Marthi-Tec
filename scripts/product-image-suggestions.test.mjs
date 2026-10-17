import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET = 'test-only-secret-'.repeat(4);
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const { parseAppleModels, matchReference } = await import('../dist/services/deviceReference.js');
const { searchTerm, commonsSuggestions } = await import('../dist/routes/productImages.js');

const appleHtml = `
<h2 class="gb-header">iPhone 18 Pro Max</h2>
<img class="gb-image" alt="Quatro iPhones" src="https://cdsassets.apple.com/live/7WUAS350/images/iphone/iphone-18-pro-max-colors.png" height="700"/>
<p>Capacidade: 256 GB, 512 GB, 1 TB, 2 TB</p><p>Cores: Preto, Branco, Azul, Bordô</p>
<h2 class="gb-header">iPhone 18 Pro</h2>
<img class="gb-image" src="https://evil.example.com/x.png"/>
<p>Capacidade: 256 GB</p><p>Cores: Bordô</p>`;

test('the official photo of each iPhone model comes from the Apple page (only Apple HTTPS images)', () => {
  const models = parseAppleModels(appleHtml);
  assert.equal(matchReference('IPHONE 18 PRO MAX', models).image, 'https://cdsassets.apple.com/live/7WUAS350/images/iphone/iphone-18-pro-max-colors.png');
  assert.equal(matchReference('IPHONE 18 PRO', models).image, undefined, 'an image from another site is ignored');
});

test('the search term drops capacity, condition and notes, and adds the brand when the name lacks it', () => {
  assert.equal(searchTerm('IPHONE 17 PRO (RESERVADO) 256GB NOVO'), 'IPHONE 17 PRO');
  assert.equal(searchTerm('REDMI NOTE 15 PRO + 512GB', 'Xiaomi'), 'REDMI NOTE 15 PRO +');
  assert.equal(searchTerm('MOTO G85 128 GB USADO', 'Motorola'), 'Motorola MOTO G85');
});

test('Commons results become HTTPS Wikimedia suggestions with source and license; other hosts are dropped', () => {
  const json = {
    query: {
      pages: {
        2: { index: 2, title: 'File:Redmi Note 15 back.jpg', imageinfo: [{ thumburl: 'https://upload.wikimedia.org/x/800px-b.jpg?utm_source=commons', url: 'https://upload.wikimedia.org/x/b.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Redmi_Note_15_back.jpg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a href="x">Fulano</a>' } } }] },
        1: { index: 1, title: 'File:Redmi Note 15.jpg', imageinfo: [{ thumburl: 'https://thumb.wikimedia.org/x/800px-a.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Redmi_Note_15.jpg' }] },
        3: { index: 3, title: 'File:Other.jpg', imageinfo: [{ thumburl: 'http://example.com/c.jpg' }] },
      },
    },
  };
  const list = commonsSuggestions(json);
  assert.deepEqual(list.map((s) => s.title), ['Redmi Note 15', 'Redmi Note 15 back']);
  assert.equal(list[1].url, 'https://upload.wikimedia.org/x/800px-b.jpg', 'tracking query removed');
  assert.equal(list[1].license, 'CC BY-SA 4.0 · Fulano');
  assert.equal(list[0].source, 'Wikimedia Commons');
});
