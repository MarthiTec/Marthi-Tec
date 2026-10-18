import { Pool, type PoolConfig } from 'pg';
import { env } from '../config/env.js';

function sslFromUrl(connectionString: string): PoolConfig['ssl'] | undefined {
  try {
    const url = new URL(connectionString);
    const mode = url.searchParams.get('sslmode')?.toLowerCase();
    if (mode === 'disable' || mode === 'allow') return undefined;
    if (mode === 'require' || mode === 'verify-ca' || mode === 'verify-full') {
      return { rejectUnauthorized: false };
    }
    // Hostnames sem ponto (ex.: marthitec216, localhost, postgres) são contêineres internos na VLAN privada
    if (!url.hostname.includes('.') || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return undefined;
    }
    if (mode === 'prefer') {
      return { rejectUnauthorized: false };
    }
  } catch {
    // ignore parse errors; fall through
  }
  if (env.DB_SSLMODE === 'disable') return undefined;
  if (env.DB_SSLMODE === 'require') {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function buildPoolConfig(): PoolConfig {
  if (env.DATABASE_URL) {
    return {
      connectionString: env.DATABASE_URL,
      ssl: sslFromUrl(env.DATABASE_URL),
      connectionTimeoutMillis: 8000,
    };
  }

  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_DATABASE,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    ssl:
      env.DB_SSLMODE === 'disable'
        ? undefined
        : env.DB_SSLMODE === 'require' || env.APP_ENV === 'production'
          ? { rejectUnauthorized: false }
          : undefined,
    connectionTimeoutMillis: 8000,
  };
}

export const dbConfigured = Boolean(
  env.DATABASE_URL || (env.DB_HOST && env.DB_DATABASE && env.DB_USERNAME && env.DB_PASSWORD),
);

/**
 * When DATABASE_URL / DB_* are missing, expose a Pool-shaped proxy that fails closed.
 * Business routes must not fall through to in-memory demo data.
 */
function createUnconfiguredPool(): Pool {
  const fail = (): never => {
    throw Object.assign(
      new Error('MarthiDB indisponível. Configure DATABASE_URL (ou DB_HOST/DB_DATABASE/DB_USERNAME/DB_PASSWORD).'),
      { status: 503 },
    );
  };
  return new Proxy({} as Pool, {
    get(_target, prop) {
      if (prop === 'on') {
        return () => createUnconfiguredPool();
      }
      if (prop === 'then') {
        return undefined;
      }
      if (prop === 'end' || prop === 'close') {
        return async () => undefined;
      }
      return (..._args: unknown[]) => fail();
    },
  });
}

function createLivePool(): Pool {
  const live = new Pool(buildPoolConfig());
  live.on('error', (err) => {
    console.warn('[marthi-api] Pool de conexões PostgreSQL emitiu erro não crítico:', err.message);
  });
  return live;
}

export const pool: Pool = dbConfigured ? createLivePool() : createUnconfiguredPool();

function publicDbError(error: unknown): string {
  if (!(error instanceof Error)) return 'Falha ao conectar no PostgreSQL.';
  const message = error.message.replace(/:[^:@/]+@/g, ':***@');
  return message.slice(0, 240);
}

export async function checkDatabaseConnection(): Promise<{
  configured: boolean;
  connected: boolean;
  error: string | null;
}> {
  if (!dbConfigured) {
    return {
      configured: false,
      connected: false,
      error: 'Variáveis de banco não configuradas.',
    };
  }

  try {
    await pool.query('SELECT 1');
    return {
      configured: dbConfigured,
      connected: true,
      error: null,
    };
  } catch (error) {
    return {
      configured: dbConfigured,
      connected: false,
      error: publicDbError(error),
    };
  }
}
