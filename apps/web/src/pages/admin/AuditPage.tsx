import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import {
  clearAuditLog,
  listAuditEntries,
  type AuditEntry,
  type AuditKind,
} from '../../data/auditLog';
import { logAction } from '../../data/auditLog';

export function AuditPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState(() => listAuditEntries());
  const [kind, setKind] = useState<'all' | AuditKind>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    function refresh() {
      setEntries(listAuditEntries());
    }
    window.addEventListener('marthi-audit-updated', refresh);
    return () => window.removeEventListener('marthi-audit-updated', refresh);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false;
      if (!needle) return true;
      return `${item.actorName} ${item.actorEmail} ${item.action} ${item.detail} ${item.path}`
        .toLowerCase()
        .includes(needle);
    });
  }, [entries, kind, query]);

  function clear() {
    if (!window.confirm('Limpar todo o histórico de auditoria deste navegador?')) return;
    clearAuditLog();
    setEntries([]);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'auditoria.limpar',
      detail: 'Histórico local apagado',
    });
    setEntries(listAuditEntries());
  }

  return (
    <section className="admin-page">
      <article className="admin-card">
        <h2>Auditoria e acessos</h2>
        <p>
          Registro local de login/logout e ações sensíveis (cadastros, notas). Em produção isso
          migra para o backend.
        </p>
        <div className="admin-toolbar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ator, ação, detalhe…"
          />
          <AdminPicker
            label="Tipo"
            value={kind}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'access', label: 'Acessos' },
              { value: 'action', label: 'Ações' },
            ]}
            onChange={(value) => setKind(value as 'all' | AuditKind)}
          />
          <button type="button" className="btn btn--ghost" onClick={clear}>
            Limpar log
          </button>
        </div>
      </article>

      <article className="admin-card">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Tipo</th>
              <th>Ator</th>
              <th>Ação</th>
              <th>Detalhe</th>
              <th>Rota</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  Nenhum registro ainda.
                </td>
              </tr>
            ) : (
              filtered.map((item: AuditEntry) => (
                <tr key={item.id}>
                  <td>{new Date(item.at).toLocaleString('pt-BR')}</td>
                  <td>{item.kind === 'access' ? 'Acesso' : 'Ação'}</td>
                  <td>
                    {item.actorName}
                    <div className="empty">{item.actorEmail || '—'}</div>
                  </td>
                  <td>{item.action}</td>
                  <td>{item.detail || '—'}</td>
                  <td>{item.path || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
