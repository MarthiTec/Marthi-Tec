#!/usr/bin/env node
/**
 * Sync apps/api/src/db/migrations/*.sql → dist/db/migrations for runtime migrate.
 * Resolves repo root from this file (not process.cwd) so Discloud BUILD cannot
 * silently leave dist behind source. Throws unless dest exactly matches source.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repoRoot, 'apps', 'api', 'src', 'db', 'migrations');
const dest = path.join(repoRoot, 'dist', 'db', 'migrations');

function listSql(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

if (!fs.existsSync(src)) {
  throw new Error(`[copy-api-migrations] Source missing: ${src}`);
}

const approved = listSql(src);
if (!approved.length) {
  throw new Error(`[copy-api-migrations] Migration source is empty: ${src}`);
}

fs.mkdirSync(dest, { recursive: true });

for (const entry of fs.readdirSync(dest, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.sql') && !approved.includes(entry.name)) {
    fs.unlinkSync(path.join(dest, entry.name));
  }
}

for (const name of approved) {
  fs.copyFileSync(path.join(src, name), path.join(dest, name));
}

const copied = listSql(dest);
const missing = approved.filter((name) => !copied.includes(name));
const extra = copied.filter((name) => !approved.includes(name));
if (missing.length || extra.length || copied.length !== approved.length) {
  throw new Error(
    `[copy-api-migrations] dist/db/migrations out of sync with source.` +
      ` missing=[${missing.join(', ')}]` +
      ` extra=[${extra.join(', ')}]` +
      ` src=${approved.length} dest=${copied.length}`,
  );
}

console.log(
  `[copy-api-migrations] Synced ${copied.length} SQL migration(s) → ${path.relative(repoRoot, dest)}` +
    ` (latest ${copied[copied.length - 1]})`,
);
