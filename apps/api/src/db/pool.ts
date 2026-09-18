import { Pool, type PoolConfig } from 'pg';
import { env } from '../config/env.js';

function buildPoolConfig(): PoolConfig | null {
  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
      ssl: env.APP_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    };
  }

  if (!env.DB_HOST || !env.DB_DATABASE) {
    return null;
  }

  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_DATABASE,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    ssl:
      env.DB_SSLMODE === 'require' || env.APP_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

const poolConfig = buildPoolConfig();

export const dbConfigured = poolConfig !== null;
export const pool = poolConfig ? new Pool(poolConfig) : null;

export async function checkDatabaseConnection(): Promise<{
  configured: boolean;
  connected: boolean;
  error: string | null;
}> {
  if (!pool) {
    return {
      configured: false,
      connected: false,
      error: 'Variáveis de banco não configuradas.',
    };
  }

  try {
    await pool.query('SELECT 1');
    return {
      configured: true,
      connected: true,
      error: null,
    };
  } catch {
    return {
      configured: true,
      connected: false,
      error: 'Falha ao conectar no PostgreSQL.',
    };
  }
}
