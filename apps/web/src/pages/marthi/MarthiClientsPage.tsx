import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import { PARTNER_MODULES, type PartnerModuleId, type PlanId } from '../../data/catalog';
import { money } from '../../data/financeBook';
import {
  CLIENT_STATUS_LABEL,
  clientPresenceLabel,
  listMarthiClients,
  MARTHI_CLIENTS_EVENT,
  planLabel,
  planMonthlyAmount,
  setMarthiClientPaymentOk,
  setMarthiClientStatus,
  upsertMarthiClient,
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

type EditForm = {
  clientId: string;
  tradeName: string;
  email: string;
  planId: PlanId;
  monthlyAmount: string;
  status: MarthiClientStatus;
  paymentOk: boolean;
  notes: string;
  modules: PartnerModuleId[];
};

function toEditForm(client: MarthiClient): EditForm {
  return {
    clientId: client.clientId,
    tradeName: client.tradeName,
    email: client.email,
    planId: client.planId,
    monthlyAmount: String(client.monthlyAmount),
    status: client.status,
    paymentOk: client.paymentOk,
    notes: client.notes,
    modules: [...client.modules],
  };
}

export function MarthiClientsPage() {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirmDialog();
  const [clients, setClients] = useState<MarthiClient[]>(() => listMarthiClients());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MarthiClientStatus>('all');
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

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

  function openEdit(client: MarthiClient) {
    setFormError(null);
    setEditing(toEditForm(client));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleModule(moduleId: PartnerModuleId) {
    if (!editing) return;
    setEditing({
      ...editing,
      modules: editing.modules.includes(moduleId)
        ? editing.modules.filter((id) => id !== moduleId)
        : [...editing.modules, moduleId],
    });
  }

  function saveEdit() {
    if (!editing) return;
    const tradeName = editing.tradeName.trim();
    const email = editing.email.trim().toLowerCase();
    if (!tradeName || !email.includes('@')) {
      setFormError('Informe nome da empresa e um e-mail válido.');
      return;
    }
    const amount = Number(editing.monthlyAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError('Mensalidade inválida.');
      return;
    }

    const saved = upsertMarthiClient({
      clientId: editing.clientId,
      tradeName,
      email,
      planId: editing.planId,
      monthlyAmount: amount,
      status: editing.status,
      paymentOk: editing.paymentOk,
      notes: editing.notes.trim(),
      modules: editing.modules,
    });

    logAction({
      actorName: user?.name ?? 'Marthi',
      actorEmail: user?.email ?? '',
      action: 'marthi.cliente.editar',
      detail: `${saved.tradeName} (${saved.clientId}) · ${planLabel(saved.planId)}`,
    });

    setFlash(`Registro de ${saved.tradeName} atualizado.`);
    setEditing(null);
    setFormError(null);
    setClients(listMarthiClients());
  }

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

      {editing ? (
        <article className="admin-card marthi-edit">
          <h2>Editar empresa · {editing.tradeName || editing.clientId}</h2>
          {formError ? <p className="qty-low">{formError}</p> : null}
          <div className="admin-form">
            <label>
              Nome fantasia / empresa
              <input
                value={editing.tradeName}
                onChange={(e) => setEditing({ ...editing, tradeName: e.target.value })}
              />
            </label>
            <label>
              E-mail de acesso
              <input
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </label>
            <AdminPicker
              label="Plano"
              value={editing.planId}
              options={[
                { value: 'bronze', label: 'Bronze' },
                { value: 'silver', label: 'Silver' },
                { value: 'golden', label: 'Golden' },
              ]}
              onChange={(value) => {
                const planId = value as PlanId;
                setEditing({
                  ...editing,
                  planId,
                  monthlyAmount: String(planMonthlyAmount(planId)),
                });
              }}
            />
            <label>
              Mensalidade (R$)
              <input
                value={editing.monthlyAmount}
                onChange={(e) => setEditing({ ...editing, monthlyAmount: e.target.value })}
              />
            </label>
            <AdminPicker
              label="Status"
              value={editing.status}
              options={[
                { value: 'active', label: 'Ativo' },
                { value: 'blocked', label: 'Bloqueado' },
                { value: 'inactive', label: 'Inativo' },
              ]}
              onChange={(value) =>
                setEditing({ ...editing, status: value as MarthiClientStatus })
              }
            />
            <AdminPicker
              label="Pagamento"
              value={editing.paymentOk ? '1' : '0'}
              options={[
                { value: '1', label: 'Em dia' },
                { value: '0', label: 'Em atraso' },
              ]}
              onChange={(value) => setEditing({ ...editing, paymentOk: value === '1' })}
            />
            <label className="span-2">
              Observações internas
              <textarea
                rows={3}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </label>
            <div className="span-2 marthi-modules">
              <span>Módulos contratados</span>
              <div className="marthi-modules__list">
                {PARTNER_MODULES.map((module) => (
                  <label key={module.id} className="marthi-modules__item">
                    <input
                      type="checkbox"
                      checked={editing.modules.includes(module.id)}
                      onChange={() => toggleModule(module.id)}
                    />
                    <span>{module.name}</span>
                  </label>
                ))}
              </div>
              <p className="empty marthi-modules__hint">
                Dica: clique na linha do cliente na tabela para abrir esta edição.
              </p>
            </div>
            <div className="span-2 admin-toolbar">
              <button type="button" className="btn btn--primary" onClick={saveEdit}>
                Salvar alterações
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setEditing(null);
                  setFormError(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </article>
      ) : null}

      <div className="admin-toolbar marthi-toolbar">
        <label className="marthi-toolbar__field marthi-toolbar__field--grow">
          <span>Buscar</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome, e-mail, plano…"
          />
        </label>
        <div className="marthi-toolbar__field">
          <AdminPicker
            label="Status"
            value={statusFilter}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'active', label: 'Ativos' },
              { value: 'blocked', label: 'Bloqueados' },
              { value: 'inactive', label: 'Inativos' },
            ]}
            onChange={(value) => setStatusFilter(value as typeof statusFilter)}
          />
        </div>
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
                    <tr
                      key={client.clientId}
                      className="marthi-row"
                      onClick={() => openEdit(client)}
                      title="Clique para editar"
                    >
                      <td>
                        <strong>{client.tradeName}</strong>
                        <br />
                        <span className="empty">{client.email}</span>
                      </td>
                      <td>{planLabel(client.planId)}</td>
                      <td>{money(client.monthlyAmount)}</td>
                      <td>
                        <span
                          className={
                            client.paymentOk ? 'marthi-pill marthi-pill--ok' : 'marthi-pill marthi-pill--late'
                          }
                        >
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
                      <td onClick={(e) => e.stopPropagation()}>
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
                              className="btn btn--ghost"
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
