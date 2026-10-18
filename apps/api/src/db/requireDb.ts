/**
 * Hard gate: business data must live in MarthiDB (PostgreSQL).
 * In-memory Maps and hardcoded demo records are not allowed as runtime sources.
 */
import type { Pool } from 'pg';
import { dbConfigured, pool } from './pool.js';

export function dbUnavailableError(
  detail = 'Configure DATABASE_URL (ou DB_HOST/DB_DATABASE/DB_USERNAME/DB_PASSWORD).',
) {
  return Object.assign(new Error(`MarthiDB indisponível. ${detail}`), { status: 503 });
}

export function requirePool(): Pool {
  if (!dbConfigured) {
    throw dbUnavailableError();
  }
  return pool;
}

/**
 * Proxy Map that rejects every read/write. Retires in-memory business fallbacks.
 */
export function blockedMemoryMap(label: string): Map<string, any> {
  const deny = (): never => {
    throw dbUnavailableError(`Persistência em memória desativada (${label}).`);
  };
  return new Proxy(new Map<string, any>(), {
    get(_target, prop) {
      if (prop === Symbol.toStringTag) return 'Map';
      if (prop === 'constructor') return Map;
      return deny;
    },
  });
}
