import { useEffect, useMemo, useState } from 'react';
import { AdminPicker } from '../../components/AdminPicker';
import { CrudNameButton, CrudRowActions } from '../../components/CrudKit';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import { PARTNER_MODULES, type PartnerModuleId, type PlanId } from '../../data/catalog';
import { money } from '../../data/financeBook';
import {
  CLIENT_STATUS_LABEL,
  CONTRACTING_STATUS_LABEL,
  clientPresenceLabel,
  createMarthiClientWithSecureActivation,
  deleteMarthiClient,
  forceClientPasswordReset,
  generateClientAccessToken,
  getClientBranches,
  getClientMatrix,
  getMarthiClient,
  hydrateMarthiClientsFromApi,
  identifyClientPaymentAndActivate,
  listMarthiClients,
  listPotentialMatrixClients,
  MARTHI_CLIENTS_EVENT,
  planLabel,
  planMonthlyAmount,
  regenerateClientAccessToken,
  resendClientActivationEmail,
  sendClientPhoneVerification,
  setMarthiClientPaymentOk,
  setMarthiClientStatus,
  upsertMarthiClient,
  type MarthiClient,
  type MarthiClientStatus,
} from '../../data/marthiClientsStore';
import { PRESENCE_EVENT } from '../../data/presenceStore';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { lookupCnpjData } from '../../services/cnpj';

function formatDateTime(iso: string | null | undefined) {
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
  | { type: 'payment'; client: MarthiClient; paymentOk: boolean }
  | { type: 'resend_activation'; client: MarthiClient }
  | { type: 'force_reset'; client: MarthiClient }
  | { type: 'send_otp'; client: MarthiClient };

type EditForm = {
  clientId: string;
  tradeName: string;
  email: string;
  phone: string;
  planId: PlanId;
  monthlyAmount: string;
  status: MarthiClientStatus;
  paymentOk: boolean;
  notes: string;
  modules: PartnerModuleId[];
  parentClientId: string;
  branchName: string;
  accessToken?: string;
};

type NewClientForm = {
  tradeName: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  planId: PlanId;
  monthlyAmount: string;
  status: MarthiClientStatus;
  paymentOk: boolean;
  notes: string;
  modules: PartnerModuleId[];
  parentClientId: string;
  branchName: string;
};

function toEditForm(client: MarthiClient): EditForm {
  return {
    clientId: client.clientId,
    tradeName: client.tradeName,
    email: client.email,
    phone: client.phone || '',
    planId: client.planId,
    monthlyAmount: String(client.monthlyAmount),
    status: client.status,
    paymentOk: client.paymentOk,
    notes: client.notes,
    modules: [...client.modules],
    parentClientId: client.parentClientId || '',
    branchName: client.branchName || '',
    accessToken: client.accessToken,
  };
}

export function MarthiClientsPage() {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirmDialog();
  const [clients, setClients] = useState<MarthiClient[]>(() => listMarthiClients());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MarthiClientStatus>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [structureFilter, setStructureFilter] = useState<'all' | 'independent' | 'matrix' | 'branch'>('all');
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [auditClient, setAuditClient] = useState<MarthiClient | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // New Client Creation Modal
  const [isCreating, setIsCreating] = useState(false);
  const [modalCnpjLoading, setModalCnpjLoading] = useState(false);
  const [modalCnpjStatus, setModalCnpjStatus] = useState<string | null>(null);
  const [newForm, setNewForm] = useState<NewClientForm>({
    tradeName: '',
    legalName: '',
    document: '',
    email: '',
    phone: '',
    planId: 'silver',
    monthlyAmount: '497',
    status: 'active',
    paymentOk: true, // Default active + paid to immediately trigger secure activation
    notes: '',
    modules: ['totem', 'erp'],
    parentClientId: '',
    branchName: '',
  });

  async function handleModalCnpjLookup(raw: string) {
    const clean = raw.replace(/\D/g, '');
    if (clean.length !== 14) return;
    setModalCnpjLoading(true);
    setModalCnpjStatus('Consultando dados na Receita Federal e SEFAZ…');
    try {
      const data = await lookupCnpjData(clean);
      setNewForm((prev) => ({
        ...prev,
        document: data.cnpj,
        tradeName: prev.tradeName || data.tradeName,
        legalName: prev.legalName || data.legalName,
        phone: prev.phone || data.phone,
        email: prev.email || data.email,
        notes: [
          prev.notes,
          data.stateRegistration ? `IE: ${data.stateRegistration}` : '',
          data.street
            ? `${data.street}, ${data.number || 'S/N'} - ${data.district}, ${data.city}/${data.state} (CEP: ${data.zipCode})`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      }));
      setModalCnpjStatus(
        data.stateRegistration
          ? `✓ Dados, IE (${data.stateRegistration}) e endereço preenchidos!`
          : '✓ Dados da empresa e endereço preenchidos!',
      );
    } catch (err) {
      setModalCnpjStatus(err instanceof Error ? err.message : 'Falha ao consultar CNPJ.');
    } finally {
      setModalCnpjLoading(false);
    }
  }

  // Manual Payment Activation Modal
  const [paymentModalClient, setPaymentModalClient] = useState<MarthiClient | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Activation / Credentials Success Dialog
  const [activatedNotice, setActivatedNotice] = useState<{
    client: MarthiClient;
    isNew?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  function refresh() {
    setClients(listMarthiClients());
  }

  useEffect(() => {
    refresh();
    hydrateMarthiClientsFromApi().then(() => refresh()).catch(() => {});
    window.addEventListener(MARTHI_CLIENTS_EVENT, refresh);
    window.addEventListener(PRESENCE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(MARTHI_CLIENTS_EVENT, refresh);
      window.removeEventListener(PRESENCE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const potentialMatrixClients = useMemo(() => {
    return listPotentialMatrixClients(editing ? editing.clientId : undefined);
  }, [clients, editing]);

  const matrixPickerOptions = useMemo(() => {
    return [
      { value: '', label: '🏢 Empresa Independente (Padrão)' },
      ...potentialMatrixClients.map((mat) => ({
        value: mat.clientId,
        label: `↳ Filial de: ${mat.tradeName} (${mat.document || mat.email})`,
      })),
    ];
  }, [potentialMatrixClients]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (statusFilter !== 'all' && client.status !== statusFilter) return false;
      if (paymentFilter === 'paid' && (!client.paymentOk || client.status !== 'active')) return false;
      if (paymentFilter === 'pending' && client.paymentOk && client.status === 'active') return false;
      if (structureFilter === 'independent' && (client.parentClientId || client.companyType === 'matrix')) return false;
      if (structureFilter === 'matrix' && client.companyType !== 'matrix') return false;
      if (structureFilter === 'branch' && (!client.parentClientId && client.companyType !== 'branch')) return false;
      if (!needle) return true;
      return `${client.tradeName} ${client.email} ${client.planId} ${client.notes} ${client.document || ''} ${client.phone || ''} ${client.branchName || ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [clients, query, statusFilter, paymentFilter, structureFilter]);

  function openEdit(client: MarthiClient) {
    setFormError(null);
    setEditing(toEditForm(client));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleOpenCreate() {
    setFormError(null);
    setModalCnpjStatus(null);
    setNewForm({
      tradeName: '',
      legalName: '',
      document: '',
      email: '',
      phone: '',
      planId: 'silver',
      monthlyAmount: '497',
      status: 'active',
      paymentOk: true,
      notes: '',
      modules: ['totem', 'erp'],
      parentClientId: '',
      branchName: '',
    });
    setIsCreating(true);
  }

  async function handleSaveNewClient(e: React.FormEvent) {
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

    const parentClientId = newForm.parentClientId.trim() || undefined;
    const branchName = parentClientId ? (newForm.branchName.trim() || `${tradeName} (Filial)`) : undefined;

    const client = await createMarthiClientWithSecureActivation({
      tradeName,
      legalName: newForm.legalName.trim() || undefined,
      document: newForm.document.trim() || undefined,
      email,
      phone: newForm.phone.trim() || undefined,
      planId: newForm.planId,
      modules: newForm.modules,
      monthlyAmount: amount,
      status: newForm.status,
      paymentOk: newForm.paymentOk,
      notes: newForm.notes.trim(),
      actorName: user?.name || 'Administrador Marthi',
      parentClientId,
      branchName,
    });

    logAction({
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? 'admin@marthi.com.br',
      action: 'marthi.cliente.criar',
      detail: `Novo cliente cadastrado: ${client.tradeName} (${client.email}) · ${planLabel(client.planId)}${parentClientId ? ' [Filial Unificada]' : ''}. Link de ativação despachado.`,
    });

    setIsCreating(false);
    refresh();
    setFlash(`Cliente ${client.tradeName} cadastrado! Link de ativação enviado para ${client.email}.`);
    setActivatedNotice({
      client,
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

  function toggleNewModule(moduleId: PartnerModuleId) {
    setNewForm((prev) => ({
      ...prev,
      modules: prev.modules.includes(moduleId)
        ? prev.modules.filter((id) => id !== moduleId)
        : [...prev.modules, moduleId],
    }));
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

    const parentClientId = editing.parentClientId.trim() || undefined;
    const branchName = parentClientId ? (editing.branchName.trim() || `${tradeName} (Filial)`) : undefined;

    const saved = upsertMarthiClient({
      clientId: editing.clientId,
      tradeName,
      email,
      phone: editing.phone.trim() || undefined,
      planId: editing.planId,
      monthlyAmount: amount,
      status: editing.status,
      paymentOk: editing.paymentOk,
      notes: editing.notes.trim(),
      modules: editing.modules,
      parentClientId: parentClientId || null,
      branchName,
      accessToken: editing.accessToken,
    });

    logAction({
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? '',
      action: 'marthi.cliente.editar',
      detail: `${saved.tradeName} (${saved.clientId}) · ${planLabel(saved.planId)}${parentClientId ? ' [Filial Unificada]' : ''}`,
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

  async function handleConfirmManualPayment() {
    if (!paymentModalClient) return;
    const client = paymentModalClient;

    const res = await identifyClientPaymentAndActivate(client.clientId, {
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
        detail: `Pagamento identificado manualmente para ${client.tradeName} via ${paymentMethod} (${paymentRef || 'Sem comprovante'}). Token seguro gerado e e-mail de ativação enviado.`,
      });

      setPaymentModalClient(null);
      refresh();
      if (auditClient && auditClient.clientId === client.clientId) {
        setAuditClient(res.client);
      }
      setFlash(res.message);
      setActivatedNotice({
        client: res.client,
        isNew: false,
      });
    } else {
      setFlash(res.message || 'Falha ao confirmar pagamento.');
      alert(res.message || 'Falha ao confirmar pagamento. Verifique os dados ou tente novamente.');
    }
  }

  async function runAction(action: PendingAction) {
    const { client } = action;
    const actorName = user?.name ?? 'Administrador Marthi';
    const actorEmail = user?.email ?? 'admin@marthi.com.br';

    if (action.type === 'resend_activation') {
      const ok = await confirm({
        title: 'Reenviar Link de Ativação',
        message: `Deseja gerar um novo token seguro e reenviar o e-mail de ativação para ${client.email}?`,
        confirmLabel: 'Reenviar E-mail',
      });
      if (!ok) return;

      const res = await resendClientActivationEmail(client, actorName);
      logAction({
        actorName,
        actorEmail,
        action: 'marthi.cliente.reenviar_ativacao',
        detail: `Reenviado link de ativação para ${client.tradeName} (${client.email})`,
      });
      setFlash(res.message);
      refresh();
      return;
    }

    if (action.type === 'force_reset') {
      const ok = await confirm({
        title: 'Solicitar Redefinição de Senha',
        message: `Deseja enviar um link seguro de recuperação de senha para ${client.email}? Por segurança, o sistema nunca visualiza a senha do usuário.`,
        confirmLabel: 'Enviar Link',
      });
      if (!ok) return;

      const res = await forceClientPasswordReset(client, actorName);
      logAction({
        actorName,
        actorEmail,
        action: 'marthi.cliente.forcar_redefinicao_senha',
        detail: `Solicitado redefinição de senha para ${client.tradeName} (${client.email})`,
      });
      setFlash(res.message);
      refresh();
      return;
    }

    if (action.type === 'send_otp') {
      if (!client.phone) {
        setFlash('Este cliente não possui celular cadastrado.');
        return;
      }
      const ok = await confirm({
        title: 'Enviar Código de Confirmação (OTP)',
        message: `Enviar código temporário de verificação para o WhatsApp ${client.phone}?`,
        confirmLabel: 'Enviar Código',
      });
      if (!ok) return;

      const res = await sendClientPhoneVerification(client);
      logAction({
        actorName,
        actorEmail,
        action: 'marthi.cliente.enviar_otp_celular',
        detail: `Código OTP de celular enviado para ${client.tradeName} (${client.phone})`,
      });
      setFlash(res.message);
      refresh();
      return;
    }

    let message = '';
    let confirmLabel = 'Confirmar';

    if (action.type === 'block') {
      message = `Tem certeza que deseja bloquear “${client.tradeName}”? O acesso ao sistema será suspenso.`;
      confirmLabel = 'Bloquear';
    } else if (action.type === 'inactive') {
      message = `Tem certeza que deseja inativar “${client.tradeName}”?`;
      confirmLabel = 'Inativar';
    } else if (action.type === 'reactivate') {
      message = `Deseja reativar o acesso de “${client.tradeName}”?`;
      confirmLabel = 'Reativar';
    } else {
      message = action.paymentOk
        ? `Confirmar que o pagamento de “${client.tradeName}” está em dia?`
        : `Marcar pagamento de “${client.tradeName}” como pendente/atrasado?`;
      confirmLabel = 'Atualizar';
    }

    const ok = await confirm({
      title: 'Confirmação',
      message,
      confirmLabel,
      danger: action.type === 'block' || action.type === 'inactive',
    });
    if (!ok) return;

    if (action.type === 'block') {
      setMarthiClientStatus(client.clientId, 'blocked');
      logAction({
        actorName,
        actorEmail,
        action: 'marthi.cliente.bloquear',
        detail: `${client.tradeName} (${client.clientId}) · bloqueio de acesso`,
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
        detail: `${client.tradeName} (${client.clientId}) · reativação de acesso`,
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

  function handleCopyWhatsApp(client: MarthiClient) {
    const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://marthi-totem.discloud.dev';
    const text = `🚀 *Seu acesso ao Sistema Marthi está liberado!*\n\nOlá! Confirmamos o pagamento da sua assinatura para a empresa *${client.tradeName}* (${planLabel(client.planId)}).\n\n📧 Enviamos um e-mail para *${client.email}* com seu link seguro para definição da sua senha de acesso pessoal.\n\n🔗 *Link de Acesso:* ${origin}/login\n\nQualquer dúvida, nossa equipe de suporte está à sua disposição!`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  function handleDuplicate(client: MarthiClient) {
    setFormError(null);
    setModalCnpjStatus(null);
    setNewForm({
      tradeName: `${client.tradeName} (Cópia)`,
      legalName: client.legalName || '',
      document: '',
      email: '',
      phone: client.phone || '',
      planId: client.planId,
      monthlyAmount: String(client.monthlyAmount),
      status: 'active',
      paymentOk: client.paymentOk,
      notes: client.notes ? `[Cópia de ${client.tradeName}]\n${client.notes}` : `[Cópia de ${client.tradeName}]`,
      modules: [...client.modules],
      parentClientId: client.parentClientId || (client.companyType === 'matrix' ? client.clientId : ''),
      branchName: client.companyType === 'matrix' ? 'Nova Filial' : '',
    });
    setIsCreating(true);
  }

  async function handleDelete(client: MarthiClient) {
    const ok = await confirm({
      title: 'Excluir Cliente',
      message: `Tem certeza que deseja excluir o cliente “${client.tradeName}” (${client.email})? Esta operação é irreversível.`,
      confirmLabel: 'Excluir Cliente',
      danger: true,
    });
    if (!ok) return;

    deleteMarthiClient(client.clientId);
    logAction({
      actorName: user?.name ?? 'Admin Marthi',
      actorEmail: user?.email ?? 'admin@marthi.com.br',
      action: 'marthi.cliente.excluir',
      detail: `Cliente excluído: ${client.tradeName} (${client.clientId} - ${client.email})`,
    });
    setFlash(`Cliente “${client.tradeName}” excluído.`);
    refresh();
    if (auditClient?.clientId === client.clientId) {
      setAuditClient(null);
    }
    if (editing?.clientId === client.clientId) {
      setEditing(null);
    }
  }

  return (
    <section className="admin-page">
      {dialog}

      <div className="dash-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <p className="empty" style={{ margin: 0 }}>
            Parceiros contratados · ativação automática, controle de acesso e auditoria
          </p>
          <h1 className="dash-hero__title" style={{ margin: '4px 0 0' }}>Clientes Ativos &amp; Licenciamento</h1>
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
              E-mail de acesso do responsável
              <input
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </label>
            <label>
              Telefone / WhatsApp
              <input
                type="tel"
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </label>
            <AdminPicker
              label="Plano comercial"
              value={editing.planId}
              options={[
                { value: 'bronze', label: 'Bronze' },
                { value: 'silver', label: 'Silver' },
                { value: 'golden', label: 'Golden' },
              ]}
              onChange={(value) =>
                setEditing({ ...editing, planId: value as PlanId })
              }
            />
            <label>
              Mensalidade (R$)
              <input
                value={editing.monthlyAmount}
                onChange={(e) => setEditing({ ...editing, monthlyAmount: e.target.value })}
              />
            </label>
            <AdminPicker
              label="Status da Conta"
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

            {/* Estrutura Corporativa / Matriz e Filial */}
            <div className="span-2" style={{ borderTop: '1px solid var(--line)', paddingTop: '16px', marginTop: '8px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem', color: 'var(--ink)' }}>
                🏢 Estrutura Corporativa &amp; Vínculo Multi-Loja
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: editing.parentClientId ? '1fr 1fr' : '1fr', gap: '12px' }}>
                <AdminPicker
                  label="Vínculo da Empresa (Matriz / Filial)"
                  value={editing.parentClientId}
                  options={matrixPickerOptions}
                  onChange={(val) => setEditing({ ...editing, parentClientId: val })}
                />
                {editing.parentClientId ? (
                  <label>
                    Identificador / Nome da Filial
                    <input
                      value={editing.branchName}
                      onChange={(e) => setEditing({ ...editing, branchName: e.target.value })}
                      placeholder="Ex: Filial 02 - Shopping, Loja Centro…"
                    />
                  </label>
                ) : null}
              </div>
              {editing.parentClientId ? (
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--accent)' }}>
                  ✓ Esta empresa está unificada sob a matriz selecionada. O acesso aos estoques e faturamento de lojas do grupo são sincronizados no módulo multi-loja.
                </p>
              ) : (
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--mute)' }}>
                  Empresa independente. Se não houver vínculo selecionado, a empresa opera de forma totalmente autônoma.
                </p>
              )}
            </div>

            {/* Token de Acesso da Loja / API */}
            <div
              className="span-2"
              style={{
                background: 'var(--card-2, #f8fafc)',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--line, #e2e8f0)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--ink)' }}>
                  🔑 Token de Acesso da Loja / Terminais (API)
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: '3px 8px', fontSize: '0.74rem' }}
                    onClick={() => {
                      if (editing.accessToken) {
                        navigator.clipboard.writeText(editing.accessToken);
                        setFlash('Token de acesso copiado!');
                      }
                    }}
                  >
                    📋 Copiar Token
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: '3px 8px', fontSize: '0.74rem', color: 'var(--accent)' }}
                    onClick={() => {
                      const client = getMarthiClient(editing.clientId);
                      const newToken = generateClientAccessToken(client?.document, editing.email, editing.clientId);
                      setEditing({ ...editing, accessToken: newToken });
                      setFlash('Novo token gerado! Clique em "Salvar alterações" para registrar no banco.');
                    }}
                  >
                    🔄 Renovar Token
                  </button>
                </div>
              </div>
              <input
                type="text"
                readOnly
                value={editing.accessToken || 'Gerado automaticamente ao salvar'}
                className="marthi-token-code"
                style={{
                  width: '100%',
                  fontSize: '0.85rem',
                  letterSpacing: '0.5px',
                  padding: '8px 12px',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--mute)' }}>
                Identificador criptográfico único registrado por usuário, CNPJ e e-mail. Permite autenticar terminais, totens e filiais remotas.
              </span>
            </div>

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
            <div className="span-2 admin-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => {
                    const client = getMarthiClient(editing.clientId);
                    if (client) void runAction({ type: 'resend_activation', client });
                  }}
                  title="Reenviar e-mail de ativação"
                >
                  📧 Reenviar Ativação
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => {
                    const client = getMarthiClient(editing.clientId);
                    if (client) void runAction({ type: 'force_reset', client });
                  }}
                  title="Enviar link seguro de redefinição de senha"
                >
                  🔑 Redefinir Senha
                </button>
              </div>
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
            placeholder="Nome da empresa, e-mail, celular, CNPJ…"
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
              { value: 'pending', label: 'Aguardando Pagamento' },
            ]}
            onChange={(value) => setPaymentFilter(value as typeof paymentFilter)}
          />
        </div>
        <div className="marthi-toolbar__field">
          <AdminPicker
            label="Estrutura Corporativa"
            value={structureFilter}
            options={[
              { value: 'all', label: 'Todas as Estruturas' },
              { value: 'independent', label: 'Empresas Independentes' },
              { value: 'matrix', label: 'Matrizes (Grupos)' },
              { value: 'branch', label: 'Filiais Vinculadas' },
            ]}
            onChange={(value) => setStructureFilter(value as typeof structureFilter)}
          />
        </div>
      </div>

      {/* Tabela de Clientes */}
      <article className="admin-card" style={{ marginTop: '16px' }}>
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cliente / Responsável</th>
                <th>Token de Acesso / API</th>
                <th>Plano &amp; Módulos</th>
                <th>Pagamento</th>
                <th>Status da Conta</th>
                <th>Acesso / Senha</th>
                <th>Celular / OTP</th>
                <th>Último Acesso</th>
                <th className="admin-table__actions" style={{ textAlign: 'center', width: '130px' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px' }}>
                    <p className="empty">Nenhum cliente encontrado com os filtros atuais.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((client) => {
                  const presence = clientPresenceLabel(client);
                  const branches = client.companyType === 'matrix' ? getClientBranches(client.clientId) : [];
                  const matrix = client.parentClientId ? getClientMatrix(client.clientId) : null;
                  return (
                    <tr
                      key={client.clientId}
                      className="marthi-row"
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <CrudNameButton onClick={() => setAuditClient(client)}>
                            <strong>{client.tradeName}</strong>
                          </CrudNameButton>
                          {client.companyType === 'matrix' ? (
                            <span className="marthi-pill marthi-pill--matrix">
                              🏢 Matriz ({branches.length} filial{branches.length === 1 ? '' : 'is'})
                            </span>
                          ) : client.parentClientId ? (
                            <span className="marthi-pill marthi-pill--branch">
                              ↳ Filial de {matrix?.tradeName || client.parentClientId}
                            </span>
                          ) : (
                            <span className="marthi-pill marthi-pill--independent">Independente</span>
                          )}
                        </div>
                        {client.branchName ? (
                          <div style={{ fontSize: '0.76rem', color: 'var(--accent)', fontWeight: 500 }}>
                            {client.branchName}
                          </div>
                        ) : null}
                        {client.legalName && client.legalName !== client.tradeName ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--mute)' }}>{client.legalName}</div>
                        ) : null}
                        <div style={{ fontSize: '0.82rem', color: 'var(--mute)' }}>{client.email}</div>
                        {client.phone ? (
                          <div style={{ fontSize: '0.78rem', color: 'var(--mute)' }}>📞 {client.phone}</div>
                        ) : null}
                        {client.document ? (
                          <span style={{ fontSize: '0.74rem', color: 'var(--mute)' }}>Doc: {client.document}</span>
                        ) : null}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code className="marthi-token-code">
                              {client.accessToken || '—'}
                            </code>
                            {client.accessToken ? (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                style={{ padding: '2px 6px', fontSize: '0.74rem' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(client.accessToken!);
                                  setFlash(`Token de ${client.tradeName} copiado!`);
                                }}
                                title="Copiar Token de Acesso"
                              >
                                📋
                              </button>
                            ) : null}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--mute)' }}>
                            Usuário, CNPJ &amp; E-mail
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>{planLabel(client.planId)}</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>
                          {money(client.monthlyAmount)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--mute)', marginTop: '2px' }}>
                          {client.modules.length} módulo(s)
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                          <span
                            className={
                              client.paymentOk ? 'marthi-pill marthi-pill--ok' : 'marthi-pill marthi-pill--late'
                            }
                          >
                            {client.paymentOk ? '✓ Em dia' : '⏳ Pendente'}
                          </span>
                          {!client.paymentOk ? (
                            <button
                              type="button"
                              className="btn btn--ghost"
                              style={{
                                padding: '2px 8px',
                                fontSize: '0.72rem',
                                color: '#059669',
                                borderColor: '#059669',
                                fontWeight: 600,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPaymentModal(client);
                              }}
                              title="Confirmar pagamento e liberar acesso do cliente"
                            >
                              ✓ Liberar Acesso
                            </button>
                          ) : null}
                        </div>
                        {client.paymentDetails?.method ? (
                          <div style={{ fontSize: '0.72rem', color: 'var(--mute)', marginTop: '2px' }}>
                            via {client.paymentDetails.method.toUpperCase()}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`marthi-pill ${
                            client.status === 'active'
                              ? 'marthi-pill--ok'
                              : client.status === 'blocked'
                              ? 'marthi-pill--late'
                              : 'marthi-pill--offline'
                          }`}
                        >
                          {CLIENT_STATUS_LABEL[client.status]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`marthi-pill ${
                            client.passwordConfigured
                              ? 'marthi-pill--ok'
                              : client.activationTokenSentAt
                              ? 'marthi-pill--online'
                              : 'marthi-pill--late'
                          }`}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {client.passwordConfigured
                            ? '✓ Senha Criada'
                            : client.activationTokenSentAt
                            ? '⏳ Link Enviado'
                            : 'Acesso Pendente'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`marthi-pill ${
                            client.phoneVerified ? 'marthi-pill--ok' : 'marthi-pill--offline'
                          }`}
                          style={{ fontSize: '0.72rem' }}
                        >
                          {client.phoneVerified ? '✓ Verificado' : 'Não verificado'}
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
                        <div style={{ fontSize: '0.74rem', color: 'var(--mute)', marginTop: '2px' }}>
                          {formatDateTime(client.lastSeenAt)}
                        </div>
                      </td>
                      <td className="admin-table__actions" onClick={(e) => e.stopPropagation()}>
                        <CrudRowActions
                          onView={() => setAuditClient(client)}
                          onEdit={() => openEdit(client)}
                          onDuplicate={() => handleDuplicate(client)}
                          onDelete={() => void handleDelete(client)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Modal Cadastro de Novo Cliente (Seguro - Sem Senha em Texto Puro) */}
      {isCreating && (
        <div className="marthi-modal-backdrop" onClick={() => setIsCreating(false)}>
          <div
            className="marthi-modal-card"
            style={{ maxWidth: 660 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head">
              <div>
                <span className="marthi-modal-kicker">Novo Cliente Marthi</span>
                <h2>Cadastrar Parceiro Comercial</h2>
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
              {formError && <p className="qty-low">{formError}</p>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="marthi-form-field">
                  <span>Nome Fantasia / Loja *</span>
                  <input
                    type="text"
                    required
                    value={newForm.tradeName}
                    onChange={(e) => setNewForm({ ...newForm, tradeName: e.target.value })}
                    placeholder="Ex: Smart Tech Assistência"
                  />
                </label>

                <label className="marthi-form-field">
                  <span>Razão Social</span>
                  <input
                    type="text"
                    value={newForm.legalName}
                    onChange={(e) => setNewForm({ ...newForm, legalName: e.target.value })}
                    placeholder="Nome empresarial completo"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="marthi-form-field">
                  <span>CNPJ da Empresa</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      value={newForm.document}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setNewForm({ ...newForm, document: raw });
                        const digits = raw.replace(/\D/g, '');
                        if (digits.length === 14) {
                          void handleModalCnpjLookup(digits);
                        }
                      }}
                      onBlur={() => {
                        const digits = newForm.document.replace(/\D/g, '');
                        if (digits.length === 14) {
                          void handleModalCnpjLookup(digits);
                        }
                      }}
                      placeholder="00.000.000/0001-00"
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '0 10px', fontSize: '0.78rem' }}
                      disabled={modalCnpjLoading || newForm.document.replace(/\D/g, '').length !== 14}
                      onClick={() => void handleModalCnpjLookup(newForm.document)}
                      title="Consultar CNPJ na Receita Federal e SEFAZ"
                    >
                      {modalCnpjLoading ? '…' : 'Buscar'}
                    </button>
                  </div>
                  {modalCnpjStatus && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: modalCnpjStatus.startsWith('✓')
                          ? '#059669'
                          : modalCnpjStatus.includes('Falha') || modalCnpjStatus.includes('inválido')
                          ? '#dc2626'
                          : '#0284c7',
                      }}
                    >
                      {modalCnpjStatus}
                    </span>
                  )}
                </label>

                <label className="marthi-form-field">
                  <span>Telefone / Celular (WhatsApp)</span>
                  <input
                    type="tel"
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    placeholder="(21) 99999-9999"
                  />
                </label>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label className="marthi-form-field">
                  <span>E-mail do Responsável *</span>
                  <input
                    type="email"
                    required
                    value={newForm.email}
                    onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                    placeholder="responsavel@loja.com.br"
                  />
                </label>

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
              </div>

              <div
                style={{
                  background: 'rgba(45, 212, 191, 0.08)',
                  border: '1px solid rgba(45, 212, 191, 0.25)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '0.82rem',
                  color: '#cbd5e1',
                  lineHeight: 1.5,
                }}
              >
                🔒 <strong>Ativação Segura por Link</strong>: O Marthi não utiliza senhas em texto puro. Ao salvar, o sistema dispara automaticamente um e-mail de boas-vindas com um link seguro de uso único para o responsável configurar sua senha pessoal.
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
                    label="Status do Pagamento"
                    value={newForm.paymentOk ? '1' : '0'}
                    options={[
                      { value: '1', label: '✓ Confirmado (Ativar agora)' },
                      { value: '0', label: '⏳ Aguardando Pagamento' },
                    ]}
                    onChange={(val) => setNewForm({ ...newForm, paymentOk: val === '1' })}
                  />
                </div>
              </div>

              {/* Estrutura Corporativa: Filial ou Loja Independente */}
              <div
                style={{
                  background: 'var(--card-2, #f8fafc)',
                  border: '1px solid var(--line, #e2e8f0)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  marginTop: '4px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--ink)', marginBottom: '8px' }}>
                  🏢 Vínculo Empresarial / Grupo Multi-Loja
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: newForm.parentClientId ? '1fr 1fr' : '1fr', gap: '12px' }}>
                  <div className="marthi-form-field">
                    <AdminPicker
                      label="Vínculo da Loja (Matriz / Filial)"
                      value={newForm.parentClientId}
                      options={[
                        { value: '', label: '🏢 Empresa Independente (Padrão)' },
                        ...listPotentialMatrixClients().map((mat) => ({
                          value: mat.clientId,
                          label: `↳ Filial de: ${mat.tradeName} (${mat.document || mat.email})`,
                        })),
                      ]}
                      onChange={(val) => setNewForm({ ...newForm, parentClientId: val })}
                    />
                  </div>
                  {newForm.parentClientId ? (
                    <label className="marthi-form-field">
                      <span>Identificador da Filial</span>
                      <input
                        type="text"
                        value={newForm.branchName}
                        onChange={(e) => setNewForm({ ...newForm, branchName: e.target.value })}
                        placeholder="Ex: Filial 02 - Shopping, Loja Centro…"
                      />
                    </label>
                  ) : null}
                </div>
                {newForm.parentClientId ? (
                  <p style={{ margin: '8px 0 0', fontSize: '0.78rem', color: 'var(--accent)' }}>
                    ✓ Esta empresa será unificada como filial da matriz escolhida, integrando relatórios e descontos multi-loja.
                  </p>
                ) : (
                  <p style={{ margin: '8px 0 0', fontSize: '0.76rem', color: 'var(--mute)' }}>
                    Sem vínculo selecionado: loja cadastrada como <strong>empresa independente</strong>.
                  </p>
                )}
              </div>

              <label className="marthi-form-field">
                <span>Observações Internas</span>
                <textarea
                  rows={2}
                  value={newForm.notes}
                  onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                  placeholder="Informações contratuais, detalhes de contato, etc."
                />
              </label>

              <div className="marthi-modal-foot">
                <button type="button" className="btn btn--ghost" onClick={() => setIsCreating(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn--primary">
                  Cadastrar e Enviar Link de Ativação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Identificação Manual de Pagamento */}
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
                <span className="marthi-modal-kicker">Identificação de Pagamento</span>
                <h2>Ativar Acesso do Cliente</h2>
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
              <div className="marthi-summary-box">
                <div>
                  <strong>Cliente:</strong> {paymentModalClient.tradeName} ({paymentModalClient.email})
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
                  placeholder="Ex: Pagamento confirmado via extrato às 14h30."
                />
              </label>

              <div
                style={{
                  fontSize: '0.82rem',
                  color: 'var(--ink, #0f172a)',
                  lineHeight: 1.45,
                  background: 'rgba(15, 118, 110, 0.08)',
                  border: '1px solid rgba(15, 118, 110, 0.25)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                }}
              >
                ℹ️ Ao confirmar, o sistema marca o pagamento como <strong>Confirmado</strong>, gera um <strong>token seguro de uso único</strong> e envia automaticamente o e-mail oficial com as instruções para o responsável criar sua senha.
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

      {/* Modal Detalhes & Auditoria */}
      {auditClient && (
        <div className="marthi-modal-backdrop" onClick={() => setAuditClient(null)}>
          <div
            className="marthi-modal-card"
            style={{ maxWidth: 680 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head">
              <div>
                <span className="marthi-modal-kicker">Auditoria &amp; Detalhes da Conta</span>
                <h2>{auditClient.tradeName}</h2>
              </div>
              <button
                type="button"
                className="marthi-modal-close"
                onClick={() => setAuditClient(null)}
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <div className="marthi-modal-form">
              {/* Painel de Funções e Ações do Registro */}
              <div className="marthi-client-actions-panel">
                <div className="marthi-client-actions-panel__title">
                  <span>⚡ Funções da Conta &amp; Segurança</span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span
                      className={`marthi-pill ${
                        auditClient.status === 'active'
                          ? 'marthi-pill--ok'
                          : auditClient.status === 'blocked'
                          ? 'marthi-pill--late'
                          : 'marthi-pill--offline'
                      }`}
                    >
                      {CLIENT_STATUS_LABEL[auditClient.status]}
                    </span>
                    <span
                      className={`marthi-pill ${
                        auditClient.paymentOk ? 'marthi-pill--ok' : 'marthi-pill--late'
                      }`}
                    >
                      {auditClient.paymentOk ? '✓ Em dia' : '⏳ Pagamento Pendente'}
                    </span>
                  </div>
                </div>

                <div className="marthi-client-actions-panel__grid">
                  {!auditClient.paymentOk || auditClient.status !== 'active' ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#059669', borderColor: '#059669' }}
                      onClick={() => handleOpenPaymentModal(auditClient)}
                      title="Identificar pagamento manual e disparar ativação"
                    >
                      💰 Confirmar Pagamento &amp; Liberar Acesso
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={async () => {
                        await runAction({ type: 'payment', client: auditClient, paymentOk: false });
                        const updated = getMarthiClient(auditClient.clientId);
                        if (updated) setAuditClient(updated);
                      }}
                      title="Marcar pagamento como pendente"
                    >
                      ⏳ Marcar Pagamento Pendente
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={async () => {
                      await runAction({ type: 'resend_activation', client: auditClient });
                      const updated = getMarthiClient(auditClient.clientId);
                      if (updated) setAuditClient(updated);
                    }}
                    title="Reenviar e-mail seguro com link de criação de senha"
                  >
                    📧 Reenviar Link de Ativação
                  </button>

                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => void runAction({ type: 'force_reset', client: auditClient })}
                    title="Enviar link seguro de redefinição de senha para o e-mail do cliente"
                  >
                    🔑 Redefinir Senha
                  </button>

                  {auditClient.phone ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => void runAction({ type: 'send_otp', client: auditClient })}
                      title="Enviar código de validação OTP para o celular do cliente"
                    >
                      📱 Enviar OTP (WhatsApp)
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => {
                      const newToken = regenerateClientAccessToken(auditClient.clientId);
                      if (newToken) {
                        refresh();
                        const updated = getMarthiClient(auditClient.clientId);
                        if (updated) setAuditClient(updated);
                        setFlash(`Novo Token gerado para ${auditClient.tradeName}: ${newToken}`);
                      }
                    }}
                    title="Gerar ou renovar Token de Acesso da loja"
                  >
                    🔄 Renovar Token API
                  </button>

                  <button
                    type="button"
                    className="btn btn--ghost"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                    onClick={() => handleCopyWhatsApp(auditClient)}
                    title="Copiar mensagem formatada para WhatsApp"
                  >
                    {copied ? '✓ Mensagem Copiada!' : '📲 Notificação WhatsApp'}
                  </button>

                  {auditClient.status !== 'blocked' ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                      onClick={async () => {
                        await runAction({ type: 'block', client: auditClient });
                        const updated = getMarthiClient(auditClient.clientId);
                        if (updated) setAuditClient(updated);
                      }}
                      title="Suspender acesso do cliente"
                    >
                      🚫 Bloquear Acesso
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#4ade80', borderColor: 'rgba(74, 222, 128, 0.3)' }}
                      onClick={async () => {
                        await runAction({ type: 'reactivate', client: auditClient });
                        const updated = getMarthiClient(auditClient.clientId);
                        if (updated) setAuditClient(updated);
                      }}
                      title="Liberar acesso do cliente"
                    >
                      ✅ Reativar Acesso
                    </button>
                  )}
                </div>
              </div>

              <table className="admin-table" style={{ fontSize: '0.85rem' }}>
                <tbody>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Identificador:</td>
                    <td><code>{auditClient.clientId}</code></td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Razão Social / Nome:</td>
                    <td>{auditClient.legalName || '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Documento (CNPJ/CPF):</td>
                    <td>{auditClient.document || '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Token de Acesso (API):</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code className="marthi-token-code" style={{ fontSize: '0.82rem' }}>
                          {auditClient.accessToken || '—'}
                        </code>
                        {auditClient.accessToken ? (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                            onClick={() => {
                              navigator.clipboard.writeText(auditClient.accessToken!);
                              setFlash('Token copiado!');
                            }}
                          >
                            📋 Copiar
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>E-mail:</td>
                    <td>{auditClient.email}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Telefone / Celular:</td>
                    <td>{auditClient.phone || '—'} ({auditClient.phoneVerified ? '✓ Verificado' : 'Pendente'})</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Plano Contratado:</td>
                    <td><strong>{planLabel(auditClient.planId)}</strong> · {money(auditClient.monthlyAmount)}/mês</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Status da Contratação:</td>
                    <td>{CONTRACTING_STATUS_LABEL[auditClient.contractingStatus] || auditClient.contractingStatus}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Data da Contratação:</td>
                    <td>{formatDateTime(auditClient.contractedAt)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Data de Ativação:</td>
                    <td>{formatDateTime(auditClient.activatedAt)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Primeiro Acesso:</td>
                    <td>{formatDateTime(auditClient.firstAccessAt)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Último Acesso:</td>
                    <td>{formatDateTime(auditClient.lastSeenAt)}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Status da Senha:</td>
                    <td>{auditClient.passwordConfigured ? '✓ Configurada pelo Usuário' : '⏳ Aguardando Definição via Link Seguro'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--mute)' }}>Estrutura Corporativa:</td>
                    <td>
                      {auditClient.companyType === 'matrix' ? (
                        <div>
                          <span className="marthi-pill marthi-pill--matrix">🏢 Matriz de Grupo Empresarial</span>
                          <div style={{ marginTop: '4px', fontSize: '0.8rem' }}>
                            Filiais vinculadas ({getClientBranches(auditClient.clientId).length}):
                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                              {getClientBranches(auditClient.clientId).map((branch) => (
                                <li key={branch.clientId}>
                                  {branch.tradeName} {branch.branchName ? `(${branch.branchName})` : ''} · {branch.document || branch.email}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ) : auditClient.parentClientId ? (
                        <div>
                          <span className="marthi-pill marthi-pill--branch">↳ Filial Unificada</span>
                          <div style={{ marginTop: '2px', fontSize: '0.8rem' }}>
                            Matriz vinculada: <strong>{getClientMatrix(auditClient.clientId)?.tradeName || auditClient.parentClientId}</strong>
                            {auditClient.branchName ? <div>Identificador: {auditClient.branchName}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <span className="marthi-pill marthi-pill--independent">Empresa Independente (Sem grupo multi-loja vinculado)</span>
                      )}
                    </td>
                  </tr>
                  {auditClient.paymentDetails && (
                    <tr>
                      <td style={{ color: 'var(--mute)' }}>Comprovante Pagamento:</td>
                      <td>
                        {auditClient.paymentDetails.method.toUpperCase()}
                        {auditClient.paymentDetails.transactionRef ? ` · Ref: ${auditClient.paymentDetails.transactionRef}` : ''}
                        {auditClient.paymentDetails.identifiedBy ? ` · Por: ${auditClient.paymentDetails.identifiedBy}` : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="marthi-modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  onClick={() => handleDelete(auditClient)}
                >
                  🗑️ Excluir Cliente
                </button>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => {
                      const client = auditClient;
                      setAuditClient(null);
                      handleDuplicate(client);
                    }}
                  >
                    📋 Duplicar
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      const client = auditClient;
                      setAuditClient(null);
                      openEdit(client);
                    }}
                  >
                    ✏️ Editar Cadastro
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setAuditClient(null)}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sucesso / E-mail de Boas-Vindas Disparado */}
      {activatedNotice && (
        <div className="marthi-modal-backdrop" onClick={() => setActivatedNotice(null)}>
          <div
            className="marthi-modal-card"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <header className="marthi-modal-head" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <div>
                <span className="marthi-modal-kicker" style={{ color: '#10b981' }}>
                  Ativação Segura Concluída
                </span>
                <h2 style={{ color: '#34d399' }}>
                  {activatedNotice.isNew ? 'Cliente Cadastrado com Sucesso!' : 'Pagamento Confirmado & Acesso Ativado!'}
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
                O e-mail oficial com o <strong>link seguro para criação de senha</strong> foi despachado para o responsável:
              </p>

              <div className="marthi-summary-box" style={{ borderRadius: '12px', padding: '16px', gap: '8px', fontSize: '0.88rem' }}>
                <div><strong>Empresa:</strong> {activatedNotice.client.tradeName}</div>
                <div><strong>E-mail:</strong> {activatedNotice.client.email}</div>
                <div><strong>Plano:</strong> {planLabel(activatedNotice.client.planId)} ({money(activatedNotice.client.monthlyAmount)}/mês)</div>
                {activatedNotice.client.accessToken ? (
                  <div>
                    <strong>Token de Acesso:</strong>{' '}
                    <code style={{ fontSize: '0.84rem', color: 'var(--accent, #38bdf8)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px' }}>
                      {activatedNotice.client.accessToken}
                    </code>
                  </div>
                ) : null}
                <div style={{ color: '#10b981', fontWeight: 600 }}>
                  ✓ Link de ativação de uso único enviado para o e-mail do cliente
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => handleCopyWhatsApp(activatedNotice.client)}
                >
                  {copied ? '✓ Mensagem Copiada!' : '📲 Copiar Notificação de Boas-Vindas para WhatsApp'}
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
