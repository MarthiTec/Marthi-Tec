import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import { money } from '../../data/financeBook';
import {
  CLIENT_STATUS_LABEL,
  clientPresenceLabel,
  listMarthiClients,
  MARTHI_CLIENTS_EVENT,
  planLabel,
  setMarthiClientPaymentOk,
  setMarthiClientStatus,
  type MarthiClient,
  type MarthiClientStatus,
} from '../../data/marthiClientsStore';
import { PRESENCE_EVENT } from '../../data/presenceStore';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';

function formatLastSeen(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

type PendingAction =
  | { type: 'block'; client: MarthiClient }
  | { type: 'inactive'; client: MarthiClient }
  | { type: 'reactivate'; client: MarthiClient }
  | { type: 'payment'; client: MarthiClient; paymentOk: boolean };

export function MarthiClientsPage() {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirmDialog();
  const [clients, setClients] = useState<MarthiClient[]>(() => listMarthiClients());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MarthiClientStatus>('all');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setClients(listMarthiClients());
    }
    refresh();
    window.addEventListener(MARTHI_CLIENTS_EVENT, refresh);
    window.addEventListener(PRESENCE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(MARTHI_CLIENTS_EVENT, refresh);
      window.removeEventListener(PRESENCE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (statusFilter !== 'all' && client.status !== statusFilter) return false;
      if (!needle) return true;
      return `${client.tradeName} ${client.email} ${client.planId} ${client.notes}`
        .toLowerCase()
        .includes(needle);
    });
  }, [clients, query, statusFilter]);

  async function runAction(action: PendingAction) {
    const { client } = action;
    let message = '';
    let confirmLabel = 'Confirmar';

    if (action.type === 'block') {
      message = `Tem certeza que deseja bloquear “${client.tradeName}” por falta de pagamento?`;
      confirmLabel = 'Bloquear';
    } else if (action.type === 'inactive') {
      message = `Tem certeza que deseja inativar “${client.tradeName}”?`;
      confirmLabel = 'Inativar';
    } else if (action.type === 'reactivate') {
      message = `Tem certeza que deseja reativar “${client.tradeName}”? Confirme que o pagamento foi comprovado.`;
      confirmLabel = 'Reativar';
    } else {
      message = action.paymentOk
        ? `Marcar pagamento de “${client.tradeName}” como em dia?`
        : `Marcar pagamento de “${client.tradeName}” como em atraso?`;
      confirmLabel = 'Atualizar';
    }

    const ok = await confirm({
      title: 'Tem certeza?',
      message,
      confirmLabel,
      danger: action.type === 'block' || action.type === 'inactive',
    });
    if (!ok) return;

    const actorName = user?.name ?? 'Marthi';
    const actorEmail = user?.email ?? '';

    if (action.type === 'block') {
      setMarthiClientStatus(client.clientId, 'blocked');
      logAction({
        actorName,
        actorEmail,
        action: 'marthi.cliente.bloquear',
        detail: `${client.tradeName} (${client.clientId}) · falta de pagamento`,
      });
      setFlash(`Cliente ${client.tradeName} bloqueado.`);
      return;
    }

    if (action.type === 'inactive') {
      setMarthiClientStatus(client.clientId, 'inactive');
      logAction({
        actorName,
        actorEmail,
        action: 'marthi.cliente.inativar',
        detail: `${client.tradeName} (${client.clientId})`,
      });
      setFlash(`Cliente ${client.tradeName} inativado.`);
      return;
    }

    if (action.type === 'reactivate') {
      setMarthiClientPaymentOk(client.clientId, true);
      setMarthiClientStatus(client.clientId, 'active');
      logAction({
        actorName,
        actorEmail,
        action: 'marthi.cliente.reativar',
        detail: `${client.tradeName} (${client.clientId}) · pagamento comprovado`,
      });
      setFlash(`Cliente ${client.tradeName} reativado.`);
      return;
    }

    setMarthiClientPaymentOk(client.clientId, action.paymentOk);
    logAction({
      actorName,
      actorEmail,
      action: action.paymentOk ? 'marthi.cliente.pagamento_ok' : 'marthi.cliente.pagamento_atraso',
      detail: `${client.tradeName} (${client.clientId})`,
    });
    setFlash(
      action.paymentOk
        ? `Pagamento de ${client.tradeName} marcado em dia.`
        : `Pagamento de ${client.tradeName} marcado em atraso.`,
    );
  }

  return (
    <section className="admin-page">
      {dialog}
      <div className="dash-hero">
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Parceiros contratados · presença e cobrança
          </p>
          <h1 className="dash-hero__title">Clientes ativos</h1>
        </div>
      </div>

      {flash ? (
        <p className="pdv__ok" role="status">
          {flash}
        </p>
      ) : null}

      <div className="admin-toolbar">
        <label className="admin-toolbar__search">
          Buscar
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, e-mail, plano…"
          />
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="blocked">Bloqueados</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
      </div>

      <article className="admin-card">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th>Mensalidade</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Sessão / último acesso</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <p className="empty">Nenhum cliente encontrado.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((client) => {
                  const presence = clientPresenceLabel(client);
                  return (
                    <tr key={client.clientId}>
                      <td>
                        <strong>{client.tradeName}</strong>
                        <br />
                        <span className="empty">{client.email}</span>
                      </td>
                      <td>{planLabel(client.planId)}</td>
                      <td>{money(client.monthlyAmount)}</td>
                      <td>
                        <span className={client.paymentOk ? 'marthi-pill marthi-pill--ok' : 'marthi-pill marthi-pill--late'}>
                          {client.paymentOk ? 'Em dia' : 'Em atraso'}
                        </span>
                      </td>
                      <td>{CLIENT_STATUS_LABEL[client.status]}</td>
                      <td>
                        <span
                          className={
                            presence === 'online'
                              ? 'marthi-pill marthi-pill--online'
                              : 'marthi-pill marthi-pill--offline'
                          }
                        >
                          {presence === 'online' ? 'Online' : 'Offline'}
                        </span>
                        <br />
                        <span className="empty">{formatLastSeen(client.lastSeenAt)}</span>
                      </td>
                      <td>
                        <div className="marthi-actions">
                          <button
                            type="button"
                            className="btn btn--ghost"
                            onClick={() =>
                              void runAction({
                                type: 'payment',
                                client,
                                paymentOk: !client.paymentOk,
                              })
                            }
                          >
                            {client.paymentOk ? 'Marcar atraso' : 'Pagamento ok'}
                          </button>
                          {client.status !== 'blocked' ? (
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() => void runAction({ type: 'block', client })}
                            >
                              Bloquear
                            </button>
                          ) : null}
                          {client.status !== 'inactive' ? (
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() => void runAction({ type: 'inactive', client })}
                            >
                              Inativar
                            </button>
                          ) : null}
                          {client.status !== 'active' || !client.paymentOk ? (
                            <button
                              type="button"
                              className="btn btn--primary"
                              onClick={() => void runAction({ type: 'reactivate', client })}
                            >
                              Reativar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
