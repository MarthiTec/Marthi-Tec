import { app } from './app.js';
import { env } from './config/env.js';
import { pool, checkDatabaseConnection } from './db/pool.js';
import { runMigrations } from './db/migrate.js';

async function start() {
  const check = await checkDatabaseConnection();
  if (!check.connected) throw new Error('MarthiDB indisponível; inicialização interrompida.');
  await runMigrations();
  app.listen(env.PORT, '0.0.0.0', () => {
    console.log('[marthi-api] listening on port', env.PORT);
  });
}
void start().catch(async () => {
  console.error('[marthi-api] Falha ao preparar MarthiDB. Verifique conexão e migrations.');
  await pool?.end();
  process.exitCode = 1;
});
