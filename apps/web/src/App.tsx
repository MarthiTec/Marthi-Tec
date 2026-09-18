import { useEffect, useState } from 'react';
import { getHealth, type HealthPayload } from './services/api';

export function App() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Falha ao consultar API');
      });
  }, []);

  return (
    <main className="page">
      <header className="hero">
        <p className="brand">Marthi</p>
        <h1>Painel administrativo</h1>
        <p className="lead">
          Base React pronta para o time evoluir cadastros, totem e integrações.
        </p>
      </header>

      <section className="status-panel" aria-live="polite">
        <h2>Status da API</h2>
        {error && <p className="error">{error}</p>}
        {!error && !health && <p className="muted">Verificando conexão...</p>}
        {health && (
          <ul>
            <li>
              <span>Serviço</span>
              <strong>{health.service}</strong>
            </li>
            <li>
              <span>Status</span>
              <strong>{health.status}</strong>
            </li>
            <li>
              <span>Banco</span>
              <strong>
                {health.database.connected
                  ? 'conectado'
                  : health.database.configured
                    ? 'falhou'
                    : 'não configurado'}
              </strong>
            </li>
          </ul>
        )}
      </section>

      <section className="next">
        <h2>Próximos módulos</h2>
        <p className="muted">
          Produtos, variantes, preços e leads — ver <code>docs/team-split.md</code>.
        </p>
      </section>
    </main>
  );
}
