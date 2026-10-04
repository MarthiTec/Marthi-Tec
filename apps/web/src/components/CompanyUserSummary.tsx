import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isNestAuthed, nestRequest } from '../services/nestClient';

type Summary = {
  storeId: string; tradeName: string; activeUsers: number; inactiveUsers: number;
  totalUsers: number; missingEmail: number; duplicateLogins: number;
  conflictingStatuses: number; withoutAccount: number;
};

export function CompanyUserSummary() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Summary[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

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
      .then((data) => { if (!controller.signal.aborted) setRows(data); })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Falha ao consultar usuários.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user?.id, revision]);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
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
      <div className="dash-card__head">
        <h2>Usuários do sistema por empresa</h2>
        <button type="button" className="btn btn--ghost" disabled={loading}
          onClick={() => setRevision((value) => value + 1)}>Atualizar</button>
      </div>
      <p className="empty">Cadastros marcados como usuários do sistema, por e-mail de login.
        Ativo/inativo é a situação do cadastro, independente de estar online.
        Empresas e contagens consultadas no banco; atualização a cada minuto.</p>
      {loading ? <p role="status">Consultando usuários…</p> : null}
      {error ? <p className="qty-low" role="alert">{error}</p> : null}
      {rows ? (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead><tr><th>Empresa</th><th>Ativos</th><th>Inativos</th><th>Total</th><th>Conferência</th></tr></thead>
            <tbody>
              {rows.length === 0 ? <tr><td colSpan={5}>Nenhuma empresa cadastrada no banco.</td></tr> : null}
              {rows.map((row) => (
                <tr key={row.storeId}>
                  <td><strong>{row.tradeName}</strong><br /><span className="empty">{row.storeId}</span></td>
                  <td>{row.activeUsers}</td><td>{row.inactiveUsers}</td><td>{row.totalUsers}</td>
                  <td>
                    {row.missingEmail > 0 ? <div>{row.missingEmail} cadastro(s) sem e-mail, fora do total.</div> : null}
                    {row.duplicateLogins > 0 ? <div>{row.duplicateLogins} login(s) duplicados, contados uma vez.</div> : null}
                    {row.conflictingStatuses > 0 ? <div>{row.conflictingStatuses} status conflitante(s); cadastro ativo prevalece.</div> : null}
                    {row.withoutAccount > 0 ? <div>{row.withoutAccount} login(s) sem conta vinculada nesta empresa.</div> : null}
                    {row.missingEmail + row.duplicateLogins + row.withoutAccount === 0 ? 'Sem pendências' : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

