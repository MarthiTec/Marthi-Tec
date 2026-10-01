import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, checkDatabaseConnection } from './pool.js';
import type { Pool, PoolClient } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveMigrationsDir(): string {
  const candidates = [
    path.join(__dirname, 'migrations'),
    path.join(__dirname, '../../apps/api/src/db/migrations'),
    path.join(process.cwd(), 'dist/db/migrations'),
    path.join(process.cwd(), 'apps/api/src/db/migrations'),
    path.join(process.cwd(), 'apps/api/dist/db/migrations'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(__dirname, 'migrations');
}

export const MIGRATIONS_DIR = resolveMigrationsDir();

export async function runMigrations(customPool?: Pool) {
  const db = customPool || pool;
  if (!db) {
    throw new Error('Banco de dados não configurado. Verifique as variáveis DATABASE_URL ou DB_*.');
  }

  const migrationsDir = resolveMigrationsDir();

  const client: PoolClient = await db.connect();
  try {
    // 1. Criar tabela de controle de migrations
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // 2. Listar migrations já executadas
    const res = await client.query<{ name: string }>('SELECT name FROM _migrations ORDER BY id ASC');
    const appliedSet = new Set(res.rows.map((r) => r.name));

    // 3. Ler arquivos .sql da pasta de migrations
    if (!fs.existsSync(migrationsDir)) {
      console.log('[migrate] Nenhuma pasta de migrations encontrada em:', migrationsDir);
      return [];
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const newlyApplied: string[] = [];

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      console.log(`[migrate] Aplicando migration: ${file}...`);
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        newlyApplied.push(file);
        console.log(`[migrate] ✓ ${file} aplicada com sucesso!`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] ✗ Erro ao aplicar migration ${file}:`, err);
        throw err;
      }
    }

    if (newlyApplied.length === 0) {
      console.log('[migrate] Todas as migrations já estão aplicadas. Schema atualizado.');
    } else {
      console.log(`[migrate] Sucesso! ${newlyApplied.length} migration(s) executada(s).`);
    }

    return newlyApplied;
  } finally {
    client.release();
  }
}

// Execução direta via CLI
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  (async () => {
    try {
      console.log('[migrate] Iniciando verificação de conexão...');
      const check = await checkDatabaseConnection();
      if (!check.connected) {
        console.error('[migrate] Falha na conexão com o banco de dados:', check.error);
        process.exit(1);
      }
      await runMigrations();
      process.exit(0);
    } catch (error) {
      console.error('[migrate] Erro fatal durante a execução de migrations:', error);
      process.exit(1);
    }
  })();
}
