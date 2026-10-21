import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import {
  AUDIT_ACTION_TYPE_FILTERS,
  AUDIT_EVENT,
  AUDIT_MODULE_FILTERS,
  clearAuditLog,
  hydrateAuditFromApi,
  listAuditEntries,
  logAction,
  type AuditEntry,
} from '../../data/auditLog';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import { apiListStoreAudit } from '../../services/erpApi';
import { isNestAuthed } from '../../services/nestClient';

function actionTypeLabel(item: AuditEntry) {
  if (item.actionTypeLabel) return item.actionTypeLabel;
  const map: Record<string, string> = {
    inclusao: 'Inclusão',
    alteracao: 'Alteração',
    exclusao: 'Exclusão',
    conclusao: 'Conclusão',
  };
  if (item.actionType && map[item.actionType]) return map[item.actionType];
  return item.kind === 'access' ? 'Acesso' : 'Ação';
}

export function AuditPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState(() => listAuditEntries());
  const [module, setModule] = useState('all');
  const [actionType, setActionType] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setEntries(listAuditEntries());
    }
    setLoading(true);
    void hydrateAuditFromApi()
      .then(refresh)
      .catch(() => refresh())
      .finally(() => setLoading(false));
    window.addEventListener(AUDIT_EVENT, refresh);
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    return () => {
      window.removeEventListener(AUDIT_EVENT, refresh);
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!isNestAuthed()) return;
    if (module === 'all' && actionType === 'all') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void apiListStoreAudit({
      module: module === 'all' ? undefined : module,
      actionType: actionType === 'all' ? undefined : actionType,
      limit: 200,
    })
      .then((rows) => {
        if (cancelled) return;
        const mapped = rows.map((row) => ({
          id: row.id,
          kind: (row.module === 'acessos' ? 'access' : 'action') as AuditEntry['kind'],
          at: row.createdAt,
          actorName: row.actorName ?? '',
          actorEmail: row.actorEmail ?? '',
          action: row.action ?? '',
          detail: row.summary || '',
          path: row.menuLabel || '',
          module: row.module || undefined,
          moduleLabel: row.moduleLabel || undefined,
          menuLabel: row.menuLabel || undefined,
          actionType: row.actionType || undefined,
          actionTypeLabel: row.actionTypeLabel || undefined,
          entity: row.entity || undefined,
          entityId: row.entityId || undefined,
        }));
        setEntries(mapped);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao filtrar auditoria.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [module, actionType]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((item) => {
      if (module !== 'all' && item.module && item.module !== module) return false;
      if (actionType !== 'all' && item.actionType && item.actionType !== actionType) return false;
      if (!needle) return true;
      return `${item.actorName} ${item.actorEmail} ${item.action} ${item.detail} ${item.path} ${item.moduleLabel || ''} ${item.menuLabel || ''} ${item.actionTypeLabel || ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [entries, module, actionType, query]);

  function clear() {
    if (!window.confirm('Limpar o histórico local deste navegador? Os registros no banco da loja permanecem.')) {
      return;
    }
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
          Trilha real da loja no MarthiDB: inclusão, alteração, exclusão e conclusão de operações, com
          módulo e menu. Sem eventos fictícios.
        </p>
        <div className="admin-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ator, ação, detalhe, menu…"
            style={{ flex: '1 1 200px' }}
          />
          <div style={{ minWidth: 180 }}>
            <AdminPicker
              compact
              label="Módulo"
              value={module}
              options={[...AUDIT_MODULE_FILTERS]}
              onChange={setModule}
            />
          </div>
          <div style={{ minWidth: 160 }}>
            <AdminPicker
              compact
              label="Tipo"
              value={actionType}
              options={[...AUDIT_ACTION_TYPE_FILTERS]}
              onChange={setActionType}
            />
          </div>
          <button type="button" className="btn btn--ghost" onClick={clear}>
            Limpar cache local
          </button>
        </div>
        {error ? <p className="empty" style={{ color: 'var(--danger, #b91c1c)' }}>{error}</p> : null}
        {loading ? <p className="empty">Carregando…</p> : null}
      </article>

      <article className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Tipo</th>
                <th>Módulo</th>
                <th>Menu</th>
                <th>Ator</th>
                <th>Ação</th>
                <th>Resumo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhum registro ainda. Operações gravadas nos módulos passam a aparecer aqui.
                  </td>
                </tr>
              ) : (
                filtered.map((item: AuditEntry) => (
                  <tr key={item.id}>
                    <td>{new Date(item.at).toLocaleString('pt-BR')}</td>
                    <td>{actionTypeLabel(item)}</td>
                    <td>{item.moduleLabel || item.module || '—'}</td>
                    <td>{item.menuLabel || item.path || '—'}</td>
                    <td>
                      {item.actorName || '—'}
                      <div className="empty">{item.actorEmail || '—'}</div>
                    </td>
                    <td>{item.action}</td>
                    <td>
                      {item.detail || '—'}
                      {item.entityId ? (
                        <div className="empty">
                          {item.entity || 'registro'} · {item.entityId}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
