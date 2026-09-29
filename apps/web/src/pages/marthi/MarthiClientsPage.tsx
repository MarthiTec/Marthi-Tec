import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import { PARTNER_MODULES, type PartnerModuleId, type PlanId } from '../../data/catalog';
import { money } from '../../data/financeBook';
import {
  CLIENT_STATUS_LABEL,
  clientPresenceLabel,
  createMarthiClientWithCredentials,
  getClientCredential,
  identifyClientPaymentAndActivate,
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

type NewClientForm = {
  tradeName: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  password: string;
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
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // New Client Creation Modal
  const [isCreating, setIsCreating] = useState(false);
  const [newForm, setNewForm] = useState<NewClientForm>({
    tradeName: '',
    legalName: '',
    document: '',
    email: '',
    phone: '',
    password: '',
    planId: 'silver',
    monthlyAmount: '497',
    status: 'active',
    paymentOk: false, // Default pending payment
    notes: '',
    modules: ['totem', 'pdv'],
  });

  // Manual Payment Activation Modal
  const [paymentModalClient, setPaymentModalClient] = useState<MarthiClient | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Activation / Credentials Success Dialog
  const [activatedNotice, setActivatedNotice] = useState<{
    client: MarthiClient;
    password?: string;
    isNew?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function refresh() {
    setClients(listMarthiClients());
  }

  useEffect(() => {
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
      if (paymentFilter === 'paid' && (!client.paymentOk || client.status !== 'active')) return false;
      if (paymentFilter === 'pending' && client.paymentOk && client.status === 'active') return false;
      if (!needle) return true;
      return `${client.tradeName} ${client.email} ${client.planId} ${client.notes} ${client.document || ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [clients, query, statusFilter, paymentFilter]);

  function openEdit(client: MarthiClient) {
    setFormError(null);
    setEditing(toEditForm(client));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleOpenCreate() {
    setNewForm({
      tradeName: '',
      legalName: '',
      document: '',
      email: '',
      phone: '',
      password: `mt${Math.random().toString(36).slice(2, 8)}`,
      planId: 'silver',
      monthlyAmount: String(planMonthlyAmount('silver')),
      status: 'active',
      paymentOk: false,
      notes: '',
      modules: ['totem', 'pdv'],
    });
    setFormError(null);
    setIsCreating(true);
  }

  function toggleNewModule(moduleId: PartnerModuleId) {
    setNewForm((current) => ({
      ...current,
      modules: current.modules.includes(moduleId)
        ? current.modules.filter((id) => id !== moduleId)
        : [...current.modules, moduleId],
    }));
  }

  function handleSaveNewClient(e: React.FormEvent) {
    e.preventDefault();
    const tradeName = newForm.tradeName.trim();
    const email = newForm.email.trim().toLowerCase();
    if (!tradeName || !email.includes('@')) {
      setFormError('Informe o nome da empresa e um e-mail válido.');
      return;
    }
    const amount = Number(newForm.monthlyAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError('Mensalidade inválida.');
      return;
    }

    const { client, initialPassword } = createMarthiClientWithCredentials({
      tradeName,
      legalName: newForm.legalName.trim() || undefined,
      document: newForm.document.trim() || undefined,
      email,
      phone: newForm.phone.trim() || undefined,
      password: newForm.password.trim(),
      planId: newForm.planId,
      modules: newForm.modules,
      monthlyAmount: amount,
      status: newForm.status,
      paymentOk: newForm.paymentOk,
      notes: newForm.notes.trim(),
    });

    logAction({
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? 'admin@marthi.com.br',
      action: 'marthi.cliente.criar',
      detail: `Novo cliente cadastrado: ${client.tradeName} (${client.email}) · ${planLabel(client.planId)}`,
    });

    setIsCreating(false);
    refresh();
    setFlash(`Cliente ${client.tradeName} cadastrado com sucesso!`);
    setActivatedNotice({
      client,
      password: initialPassword,
      isNew: true,
    });
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
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? '',
      action: 'marthi.cliente.editar',
      detail: `${saved.tradeName} (${saved.clientId}) · ${planLabel(saved.planId)}`,
    });

    setFlash(`Registro de ${saved.tradeName} atualizado.`);
    setEditing(null);
    setFormError(null);
    refresh();
  }

  function handleOpenPaymentModal(client: MarthiClient) {
    setPaymentModalClient(client);
    setPaymentMethod('pix');
    setPaymentRef('');
    setPaymentNotes('');
  }

  function handleConfirmManualPayment() {
    if (!paymentModalClient) return;
    const client = paymentModalClient;

    const res = identifyClientPaymentAndActivate(client.clientId, {
      method: paymentMethod,
      transactionRef: paymentRef,
      notes: paymentNotes,
      identifiedBy: user?.name || 'Administrador Marthi',
    });

    if (res.ok && res.client) {
      logAction({
        actorName: user?.name ?? 'Admin Marthi',
        actorEmail: user?.email ?? 'admin@marthi.com.br',
        action: 'marthi.cliente.pagamento_identificado_ativado',
        detail: `Pagamento identificado manualmente para ${client.tradeName} via ${paymentMethod} (${paymentRef || 'Sem comprovante'}). Acesso ativado.`,
      });

      const cred = getClientCredential(client.email);
      setPaymentModalClient(null);
      refresh();
      setFlash(`Pagamento de ${client.tradeName} identificado! Acesso ativado com sucesso.`);
      setActivatedNotice({
        client: res.client,
        password: cred?.password || 'marthi123',
        isNew: false,
      });
    }
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
      refresh();
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
      refresh();
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
      refresh();
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
    refresh();
  }

  function handleCopyWhatsApp(client: MarthiClient, pwd?: string) {
    const text = `🚀 *Seu acesso ao Sistema Marthi está liberado!*\n\nOlá! Confirmamos o pagamento da assinatura para a empresa *${client.tradeName}*.\n\n🔗 *Link de Acesso:* https://marthi-totem.discloud.app/login\n👤 *E-mail:* ${client.email}\n🔑 *Senha de Acesso:* ${pwd || 'Sua senha cadastrada'}\n\nVocê já pode fazer login e acessar todos os módulos contratados! Se precisar de suporte, estamos à disposição.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <section className="admin-page">
      {dialog}

      <div className="dash-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Parceiros contratados · presença, credenciais e cobrança
          </p>
          <h1 className="dash-hero__title" style={{ margin: '4px 0 0' }}>Clientes ativos &amp; Licenças</h1>
        </div>
        <div>
          <button type="button" className="btn btn--primary" onClick={handleOpenCreate}>
            + Cadastrar Novo Cliente
          </button>
        </div>
      </div>

      {flash ? (
        <p className="pdv__ok" role="status" style={{ marginTop: '16px' }}>
          {flash}
        </p>
      ) : null}

      {/* Drawer Edição */}
      {editing ? (
        <article className="admin-card marthi-edit" style={{ marginTop: '20px' }}>
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
              label="Situação do Pagamento"
              value={editing.paymentOk ? '1' : '0'}
              options={[
                { value: '1', label: 'Em dia (Confirmado)' },
                { value: '0', label: 'Aguardando Pagamento' },
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

      {/* Toolbar & Filtros */}
      <div className="admin-toolbar marthi-toolbar" style={{ marginTop: '20px' }}>
        <label className="marthi-toolbar__field marthi-toolbar__field--grow">
          <span>Buscar Cliente</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nome da empresa, e-mail, plano, CNPJ…"
          />
        </label>
        <div className="marthi-toolbar__field">
          <AdminPicker
            label="Status de Acesso"
            value={statusFilter}
            options={[
              { value: 'all', label: 'Todos os Status' },
              { value: 'active', label: 'Ativos' },
              { value: 'blocked', label: 'Bloqueados' },
              { value: 'inactive', label: 'Inativos' },
            ]}
            onChange={(value) => setStatusFilter(value as typeof statusFilter)}
          />
        </div>
        <div className="marthi-toolbar__field">
          <AdminPicker
            label="Pagamento"
            value={paymentFilter}
            options={[
              { value: 'all', label: 'Todos os Pagamentos' },
              { value: 'paid', label: 'Confirmado / Em dia' },
              { value: 'pending', label: 'Aguardando Pagamento / Ativação' },
            ]}
            onChange={(value) => setPaymentFilter(value as typeof paymentFilter)}
          />
        </div>
      </div>

      {/* Tabela de Clientes */}
      <article className="admin-card" style={{ marginTop: '16px' }}>
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cliente / Empresa</th>
                <th>Plano &amp; Módulos</th>
                <th>Mensalidade</th>
                <th>Pagamento</th>
                <th>Status</th>
                <th>Sessão / Último acesso</th>
                <th style={{ minWidth: '220px' }}>Ações Comerciais</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px' }}>
                    <p className="empty">Nenhum cliente encontrado com os filtros atuais.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((client) => {
                  const presence = clientPresenceLabel(client);
                  const needsActivation = !client.paymentOk || client.status !== 'active';
                  return (
                    <tr
                      key={client.clientId}
                      className="marthi-row"
                      onClick={() => openEdit(client)}
                      title="Clique para editar este cliente"
                    >
                      <td>
                        <strong>{client.tradeName}</strong>
                        {client.legalName && client.legalName !== client.tradeName ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--mute)' }}>{client.legalName}</div>
                        ) : null}
                        <div style={{ fontSize: '0.82rem', color: 'var(--mute)' }}>{client.email}</div>
                        {client.document ? (
                          <span style={{ fontSize: '0.74rem', color: 'var(--mute)' }}>Doc: {client.document}</span>
                        ) : null}
                      </td>
                      <td>
                        <strong>{planLabel(client.planId)}</strong>
                        <div style={{ fontSize: '0.76rem', color: 'var(--mute)', marginTop: '2px' }}>
                          {client.modules.length} módulo(s) liberado(s)
                        </div>
                      </td>
                      <td>
                        <strong>{money(client.monthlyAmount)}</strong>
                      </td>
                      <td>
                        <span
                          className={
                            client.paymentOk ? 'marthi-pill marthi-pill--ok' : 'marthi-pill marthi-pill--late'
                          }
                        >
                          {client.paymentOk ? '✓ Em dia' : '⏳ Aguardando'}
                        </span>
                        {client.paymentDetails?.method ? (
                          <div style={{ fontSize: '0.72rem', color: 'var(--mute)', marginTop: '2px' }}>
                            via {client.paymentDetails.method.toUpperCase()}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`marthi-pill ${client.status === 'active' ? 'marthi-pill--ok' : 'marthi-pill--offline'}`}>
                          {CLIENT_STATUS_LABEL[client.status]}
                        </span>
                      </td>
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
                        <div style={{ fontSize: '0.75rem', color: 'var(--mute)', marginTop: '2px' }}>
                          {formatLastSeen(client.lastSeenAt)}
                        </div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="marthi-actions" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {needsActivation ? (
                            <button
                              type="button"
                              className="btn btn--primary"
                              style={{ padding: '4px 10px', fontSize: '0.8rem', background: '#059669', borderColor: '#059669' }}
                              onClick={() => handleOpenPaymentModal(client)}
                              title="Identificar pagamento e ativar o cliente imediatamente"
                            >
                              💰 Ativar após Pagamento
                            </button>
                          ) : null}

                          <button
                            type="button"
                            className="btn btn--ghost"
                            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                            onClick={() => openEdit(client)}
                            title="Editar dados cadastrais"
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="btn btn--ghost"
                            style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                            onClick={() =>
                              void runAction({
                                type: 'payment',
                                client,
                                paymentOk: !client.paymentOk,
                              })
                            }
                            title={client.paymentOk ? 'Marcar pagamento em atraso' : 'Marcar pagamento em dia'}
                          >
                            {client.paymentOk ? 'Marcar atraso' : 'Pagamento ok'}
                          </button>

                          {client.status !== 'blocked' ? (
                            <button
                              type="button"
                              className="btn btn--ghost"
                              style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                              onClick={() => void runAction({ type: 'block', client })}
                            >
                              Bloquear
                            </button>
                          ) : null}

                          {client.status !== 'active' ? (
                            <button
                              type="button"
                              className="btn btn--ghost"
                              style={{ padding: '4px 8px', fontSize: '0.78rem' }}
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

      {/* Modal Cadastro de Novo Cliente */}
      {isCreating && (
        <div className="marthi-modal-backdrop" onClick={() => setIsCreating(false)}>
          <div
            className="marthi-modal-card marthi-modal-card--lg"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head">
              <div>
                <span className="marthi-modal-kicker">Autenticação Real &amp; Onboarding</span>
                <h2>Cadastrar Novo Cliente</h2>
              </div>
              <button
                type="button"
                className="marthi-modal-close"
                onClick={() => setIsCreating(false)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <form onSubmit={handleSaveNewClient} className="marthi-modal-form">
              {formError ? <p className="qty-low" style={{ margin: 0 }}>{formError}</p> : null}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="marthi-form-field">
                  <span>Nome Fantasia / Loja *</span>
                  <input
                    type="text"
                    required
                    value={newForm.tradeName}
                    onChange={(e) => setNewForm({ ...newForm, tradeName: e.target.value })}
                    placeholder="Ex: AutoTech Oficina"
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Razão Social</span>
                  <input
                    type="text"
                    value={newForm.legalName}
                    onChange={(e) => setNewForm({ ...newForm, legalName: e.target.value })}
                    placeholder="Ex: AutoTech Reparação LTDA"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="marthi-form-field">
                  <span>CNPJ ou CPF</span>
                  <input
                    type="text"
                    value={newForm.document}
                    onChange={(e) => setNewForm({ ...newForm, document: e.target.value })}
                    placeholder="00.000.000/0001-00"
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Telefone / WhatsApp</span>
                  <input
                    type="text"
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    placeholder="(21) 99999-9999"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="marthi-form-field">
                  <span>E-mail de Login do Cliente *</span>
                  <input
                    type="email"
                    required
                    value={newForm.email}
                    onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                    placeholder="cliente@loja.com.br"
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Senha Inicial de Acesso *</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      required
                      value={newForm.password}
                      onChange={(e) => setNewForm({ ...newForm, password: e.target.value })}
                      placeholder="Senha do cliente"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '0 10px', fontSize: '0.78rem' }}
                      onClick={() =>
                        setNewForm({
                          ...newForm,
                          password: `mt${Math.random().toString(36).slice(2, 8)}`,
                        })
                      }
                      title="Gerar senha aleatória"
                    >
                      Gerar
                    </button>
                  </div>
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="marthi-form-field">
                  <AdminPicker
                    label="Plano Comercial"
                    value={newForm.planId}
                    options={[
                      { value: 'bronze', label: 'Bronze (R$ 197/mês)' },
                      { value: 'silver', label: 'Silver (R$ 497/mês)' },
                      { value: 'golden', label: 'Golden (R$ 597/mês)' },
                    ]}
                    onChange={(val) => {
                      const planId = val as PlanId;
                      setNewForm({
                        ...newForm,
                        planId,
                        monthlyAmount: String(planMonthlyAmount(planId)),
                      });
                    }}
                  />
                </div>

                <label className="marthi-form-field">
                  <span>Mensalidade Contratada (R$)</span>
                  <input
                    type="text"
                    required
                    value={newForm.monthlyAmount}
                    onChange={(e) => setNewForm({ ...newForm, monthlyAmount: e.target.value })}
                  />
                </label>
              </div>

              <div className="marthi-form-field">
                <span>Módulos Liberados</span>
                <div className="marthi-modules__list" style={{ marginTop: '4px' }}>
                  {PARTNER_MODULES.map((module) => (
                    <label key={module.id} className="marthi-modules__item">
                      <input
                        type="checkbox"
                        checked={newForm.modules.includes(module.id)}
                        onChange={() => toggleNewModule(module.id)}
                      />
                      <span>{module.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="marthi-form-field">
                  <AdminPicker
                    label="Status Inicial"
                    value={newForm.status}
                    options={[
                      { value: 'active', label: 'Ativo (Liberado)' },
                      { value: 'inactive', label: 'Inativo (Aguardando)' },
                    ]}
                    onChange={(val) => setNewForm({ ...newForm, status: val as MarthiClientStatus })}
                  />
                </div>

                <div className="marthi-form-field">
                  <AdminPicker
                    label="Situação Inicial do Pagamento"
                    value={newForm.paymentOk ? '1' : '0'}
                    options={[
                      { value: '0', label: '⏳ Aguardando Pagamento' },
                      { value: '1', label: '✓ Pagamento Já Identificado / Em dia' },
                    ]}
                    onChange={(val) => setNewForm({ ...newForm, paymentOk: val === '1' })}
                  />
                </div>
              </div>

              <label className="marthi-form-field">
                <span>Observações Internas</span>
                <textarea
                  rows={2}
                  value={newForm.notes}
                  onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                  placeholder="Informações de contratação, contato comercial, etc."
                />
              </label>

              <div className="marthi-modal-foot">
                <button type="button" className="btn btn--ghost" onClick={() => setIsCreating(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary">
                  Concluir Cadastro &amp; Gerar Acesso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Identificar Pagamento & Ativar Cliente */}
      {paymentModalClient && (
        <div className="marthi-modal-backdrop" onClick={() => setPaymentModalClient(null)}>
          <div
            className="marthi-modal-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head">
              <div>
                <span className="marthi-modal-kicker">Financeiro &amp; Cobrança</span>
                <h2>Identificar Pagamento &amp; Ativar Cliente</h2>
              </div>
              <button
                type="button"
                className="marthi-modal-close"
                onClick={() => setPaymentModalClient(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <div className="marthi-modal-form">
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: 'rgba(5, 150, 105, 0.08)',
                  border: '1px solid rgba(5, 150, 105, 0.25)',
                  display: 'grid',
                  gap: '4px',
                  fontSize: '0.88rem',
                }}
              >
                <div>
                  <strong>Empresa:</strong> {paymentModalClient.tradeName}
                </div>
                <div>
                  <strong>E-mail:</strong> {paymentModalClient.email}
                </div>
                <div>
                  <strong>Plano:</strong> {planLabel(paymentModalClient.planId)} · {money(paymentModalClient.monthlyAmount)}/mês
                </div>
              </div>

              <div className="marthi-form-field">
                <AdminPicker
                  label="Forma / Meio de Pagamento Identificado *"
                  value={paymentMethod}
                  options={[
                    { value: 'pix', label: 'Pix (Chave / Comprovante Transferência)' },
                    { value: 'cartao', label: 'Cartão de Crédito / Débito' },
                    { value: 'ted_doc', label: 'Transferência Bancária (TED / DOC)' },
                    { value: 'boleto', label: 'Boleto Bancário Quitado' },
                    { value: 'dinheiro', label: 'Dinheiro / Pagamento Presencial' },
                    { value: 'cortesia', label: 'Cortesia Comercial / Bonificação' },
                  ]}
                  onChange={(val) => setPaymentMethod(val)}
                />
              </div>

              <label className="marthi-form-field">
                <span>Código da Transação / Protocolo / Comprovante</span>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Ex: E2E1234567890 ou comprovante #1042"
                />
              </label>

              <label className="marthi-form-field">
                <span>Observação da Ativação Manual</span>
                <textarea
                  rows={2}
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Ex: Pagamento confirmado via extrato Nubank às 14h30."
                />
              </label>

              <div
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--mute, #64748b)',
                  lineHeight: 1.4,
                  background: 'rgba(148, 163, 184, 0.08)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                }}
              >
                ℹ️ Ao confirmar, o status do cliente passará para <strong>Ativo</strong>, a flag de pagamento será marcada como <strong>Em dia</strong> e as credenciais de login serão imediatamente liberadas para acesso ao sistema.
              </div>

              <div className="marthi-modal-foot">
                <button type="button" className="btn btn--ghost" onClick={() => setPaymentModalClient(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ background: '#059669', borderColor: '#059669' }}
                  onClick={handleConfirmManualPayment}
                >
                  Confirmar Pagamento &amp; Ativar Acesso
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sucesso / Dados de Acesso para WhatsApp */}
      {activatedNotice && (
        <div className="marthi-modal-backdrop" onClick={() => setActivatedNotice(null)}>
          <div
            className="marthi-modal-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head" style={{ background: '#ecfdf5', borderColor: '#86efac' }}>
              <div>
                <span className="marthi-modal-kicker" style={{ color: '#059669' }}>
                  Acesso Liberado com Sucesso
                </span>
                <h2 style={{ color: '#065f46' }}>
                  {activatedNotice.isNew ? 'Cliente Cadastrado!' : 'Cliente Ativado!'}
                </h2>
              </div>
              <button
                type="button"
                className="marthi-modal-close"
                onClick={() => setActivatedNotice(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <div className="marthi-modal-form">
              <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--ink)' }}>
                O acesso da empresa <strong>{activatedNotice.client.tradeName}</strong> está 100% ativo e pronto para login:
              </p>

              <div
                style={{
                  background: 'var(--card-2, #f8fafc)',
                  border: '1px solid var(--line, #e2e8f0)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'grid',
                  gap: '8px',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                }}
              >
                <div>
                  <strong>Link:</strong> https://marthi-totem.discloud.app/login
                </div>
                <div>
                  <strong>E-mail:</strong> {activatedNotice.client.email}
                </div>
                <div>
                  <strong>Senha:</strong> {activatedNotice.password || '123456'}
                </div>
                <div>
                  <strong>Plano:</strong> {planLabel(activatedNotice.client.planId)} ({money(activatedNotice.client.monthlyAmount)}/mês)
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => handleCopyWhatsApp(activatedNotice.client, activatedNotice.password)}
                >
                  {copied ? '✓ Mensagem Copiada!' : '📲 Copiar Mensagem de Boas-Vindas para WhatsApp'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setActivatedNotice(null)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
