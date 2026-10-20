import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const copyScript = path.join(repoRoot, 'scripts', 'copy-api-migrations.mjs');

function stageCopyScript(root) {
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.copyFileSync(copyScript, path.join(root, 'scripts', 'copy-api-migrations.mjs'));
}

function runCopyIn(root) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'copy-api-migrations.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('API build removes obsolete SQL artifacts before copying approved migrations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marthi-migration-sync-'));
  try {
    const src = path.join(root, 'apps/api/src/db/migrations');
    const dest = path.join(root, 'dist/db/migrations');
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(dest, { recursive: true });
    stageCopyScript(root);
    fs.writeFileSync(path.join(src, '0051_current.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(dest, '0018_deleted_seed.sql'), 'DELETE FROM stores;');

    const r = runCopyIn(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.deepEqual(fs.readdirSync(dest).filter((n) => n.endsWith('.sql')).sort(), [
      '0051_current.sql',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-api-migrations fails closed when source is empty', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marthi-migration-empty-'));
  try {
    fs.mkdirSync(path.join(root, 'apps/api/src/db/migrations'), { recursive: true });
    stageCopyScript(root);
    const r = runCopyIn(root);
    assert.notEqual(r.status, 0);
    assert.match(String(r.stderr || r.stdout), /empty|missing/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('copy-api-migrations mirrors every source SQL including newly added files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marthi-migration-new-'));
  try {
    const src = path.join(root, 'apps/api/src/db/migrations');
    const dest = path.join(root, 'dist/db/migrations');
    fs.mkdirSync(src, { recursive: true });
    fs.mkdirSync(dest, { recursive: true });
    stageCopyScript(root);

    fs.writeFileSync(path.join(src, '0112_platform_payout_pix_marthi.sql'), 'SELECT 1;');
    fs.writeFileSync(path.join(dest, '0112_platform_payout_pix_marthi.sql'), 'SELECT 1;');
    // Simulate Discloud leftover dist stopping at 0112 while source already has 0113
    fs.writeFileSync(path.join(src, '0113_sales_catalogs_public_slug.sql'), 'SELECT 2;');

    const r = runCopyIn(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.deepEqual(fs.readdirSync(dest).filter((n) => n.endsWith('.sql')).sort(), [
      '0112_platform_payout_pix_marthi.sql',
      '0113_sales_catalogs_public_slug.sql',
    ]);
    assert.equal(
      fs.readFileSync(path.join(dest, '0113_sales_catalogs_public_slug.sql'), 'utf8'),
      'SELECT 2;',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repo build:api copy keeps dist/db/migrations identical to source', () => {
  const src = path.join(repoRoot, 'apps/api/src/db/migrations');
  const dest = path.join(repoRoot, 'dist/db/migrations');
  const r = spawnSync(process.execPath, [copyScript], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const approved = fs.readdirSync(src).filter((n) => n.endsWith('.sql')).sort();
  const copied = fs.readdirSync(dest).filter((n) => n.endsWith('.sql')).sort();
  assert.deepEqual(copied, approved);
  assert.ok(copied.some((n) => n.startsWith('0113_')), '0113_* must land in dist');
});
