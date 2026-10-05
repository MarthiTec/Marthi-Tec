import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isNestAuthed, nestRequest } from '../services/nestClient';

type StoreUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: string;
};

type Summary = {
  storeId: string;
  tradeName: string;
  activeUsers: number;
  inactiveUsers: number;
  users: StoreUser[];
  totalUsers: number;
  missingEmail: number;
  duplicateLogins: number;
  conflictingStatuses: number;
  withoutAccount: number;
};

export function CompanyUserSummary() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [viewingStore, setViewingStore] = useState<Summary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setError('');
    setLoading(true);
    if (!isNestAuthed()) {
      setError('Entre com uma conta Marthi autenticada no backend para consultar o banco.');
      setLoading(false);
      return () => controller.abort();
    }
    void nestRequest<Summary[]>('/admin/company-users', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setRows(data);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Falha ao consultar usuários.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user?.id, revision]);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = window.setInterval(onVisible, 60_000);
    window.addEventListener('marthi-erp-registry-updated', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('marthi-erp-registry-updated', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <article className="admin-card">
      <div className="dash-card__head" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Usuários do sistema por empresa</h2>
          <p className="empty" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
            Contas de acesso e operadores ativos por loja consultados no banco MarthiDB.
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          {loading ? 'Consultando…' : 'Atualizar'}
        </button>
      </div>

      {loading ? <p role="status" style={{ padding: '16px 0' }}>Consultando usuários no banco…</p> : null}
      {error ? <p className="qty-low" role="alert">{error}</p> : null}

      {rows ? (
        <div style={{ marginTop: 14 }}>
          {rows.length === 0 ? (
            <p className="empty">Nenhuma empresa cadastrada no banco.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map((row) => (
                <div
                  key={row.storeId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: '1px solid var(--line)',
                    background: 'var(--card)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                >
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)' }}>
                      {row.tradeName}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--mute)', marginTop: 2 }}>
                      Loja: <code>{row.storeId}</code>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    {row.activeUsers > 0 ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 14px',
                          borderRadius: 20,
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          background: 'rgba(16, 185, 129, 0.14)',
                          color: '#059669',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}
                      >
                        <span style={{ fontSize: '0.65rem' }}>●</span>
                        {row.activeUsers} {row.activeUsers === 1 ? 'ativo' : 'ativos'}
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '6px 14px',
                          borderRadius: 20,
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          background: 'var(--card-2, #f1f5f9)',
                          color: 'var(--mute, #64748b)',
                          border: '1px solid var(--line, #e2e8f0)',
                        }}
                      >
                        0 ativos
                      </span>
                    )}

                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() => setViewingStore(row)}
                      title={`Ver lista de usuários de ${row.tradeName}`}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      Ver Usuários ({row.totalUsers}) →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Modal para visualizar os usuários ativos da empresa selecionada */}
      {viewingStore && (
        <div className="marthi-modal-backdrop" onClick={() => setViewingStore(null)}>
          <div
            className="marthi-modal-card"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head">
              <div>
                <span className="marthi-modal-kicker">Equipe &amp; Acessos</span>
                <h2 style={{ margin: 0 }}>{viewingStore.tradeName}</h2>
                <div style={{ fontSize: '0.82rem', color: 'var(--mute)', marginTop: 2 }}>
                  Loja: <code>{viewingStore.storeId}</code> · {viewingStore.activeUsers} usuário(s) ativo(s)
                </div>
              </div>
              <button
                type="button"
                className="marthi-modal-close"
                onClick={() => setViewingStore(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <div className="marthi-modal-form">
              {viewingStore.users.length === 0 ? (
                <p className="empty" style={{ padding: '24px 0', textAlign: 'center' }}>
                  Nenhum usuário vinculado a esta loja no momento.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                  {viewingStore.users.map((member) => (
                    <div
                      key={member.id || member.email}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid var(--line)',
                        background: 'var(--card-2, #f8fafc)',
                        gap: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{member.name}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--mute)' }}>{member.email}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--mute)', marginTop: 2 }}>
                          Função: <strong>{member.role === 'admin' ? 'Administrador' : member.role}</strong>
                        </div>
                      </div>

                      <div>
                        {member.active ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 10px',
                              borderRadius: 12,
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              background: 'rgba(16, 185, 129, 0.16)',
                              color: '#059669',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                            }}
                          >
                            ● Ativo
                          </span>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '4px 10px',
                              borderRadius: 12,
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#dc2626',
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                            }}
                          >
                            Inativo
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="marthi-modal-foot" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setViewingStore(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
