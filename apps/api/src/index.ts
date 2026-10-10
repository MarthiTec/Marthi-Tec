import { app } from './app.js';
import { env } from './config/env.js';
import { checkDatabaseConnection } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { startOrderReminderWorker } from './services/orderReminders.js';

// Schema is maintained by versioned migrations. Startup must not insert demonstration
// stock, overwrite customer records or delete registrations based on fixed identifiers.
async function bootstrapDatabase() {
  const check = await checkDatabaseConnection();
  if (!check.connected) {
    console.warn('[marthi-api] MarthiDB indisponível; operações dependentes do banco não serão confirmadas.');
    return;
  }
  await runMigrations();
  console.log('[marthi-api] MarthiDB conectado e migrações concluídas.');
  // Lembretes de chegada das encomendas (WhatsApp ao cliente e à loja no dia previsto).
  startOrderReminderWorker();
}

// Keep health/static serving available while PostgreSQL initialization is in progress.
app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`[marthi-api] listening on 0.0.0.0:${env.PORT} (${env.APP_ENV})`);
  void bootstrapDatabase().catch((error) => {
    console.error('[marthi-api] Falha ao aplicar migrações; estrutura não foi confirmada:', error);
  });
});
