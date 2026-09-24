import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPicker } from './AdminPicker';
import {
  confirmDelete,
  CrudListBar,
  CrudNameButton,
  CrudRowActions,
  crudFormTitle,
  matchesQuery,
  matchesStatus,
  type CrudStatusFilter,
} from './CrudKit';
import {
  HeadingCancelButton,
  HeadingEditButton,
  HeadingNewButton,
  HeadingSaveButton,
  PageHeadingActions,
} from './PageHeadingActions';
import { useAuth } from '../contexts/AuthContext';
import { logAction } from '../data/auditLog';
import { ERP_BOOTSTRAP_EVENT } from '../data/erpBootstrap';
import {
  ACCESS_AREA_LABEL,
  ALL_ACCESS_AREAS,
  EMPLOYEE_ROLE_LABEL,
  listEmployees,
  listSellers,
  removeEmployee,
  upsertEmployee,
  type AccessArea,
  type Employee,
  type EmployeeRole,
} from '../data/erpRegistry';
import {
  getErpUserPasswordHint,
  setErpUserPassword,
  clearErpUserPassword,
} from '../data/erpUserPasswords';
import { hasModule } from '../data/storePlan';

export function areasAvailableOnPlan(): AccessArea[] {
  return ALL_ACCESS_AREAS.filter((area) => {
    switch (area) {
      case 'totem':
        return hasModule('totem');
      case 'os':
        return hasModule('os');
      case 'ecommerce':
        return hasModule('ecommerce');
      case 'erp_fiscal':
      case 'erp_invoices':
        return hasModule('fiscal');
      case 'pdv':
      case 'erp_customers':
      case 'erp_stock':
      case 'erp_attrs':
      case 'erp_prices':
      case 'erp_payments':
      case 'erp_finance':
      case 'erp_sellers':
      case 'erp_suppliers':
      case 'erp_employees':
      case 'erp_audit':
        return hasModule('erp');
      case 'erp_plan':
        return true;
      default:
        return true;
    }
  });
}

function defaultAccessForPlan(): AccessArea[] {
  const available = areasAvailableOnPlan();
  const preferred: AccessArea[] = [];
  if (available.includes('totem')) preferred.push('totem');
  if (available.includes('os')) preferred.push('os');
  if (available.includes('pdv')) preferred.push('pdv');
  return preferred.length ? preferred : available.filter((a) => a !== 'erp_plan').slice(0, 2);
}

const EMPTY = {
  name: '',
  phone: '',
  email: '',
  document: '',
  role: 'operator' as EmployeeRole,
  isSystemUser: true,
  userEmail: '',
  accessAreas: [] as AccessArea[],
  active: true,
  sellerId: '',
  accessPassword: '',
};

type Mode = 'new' | 'edit' | 'view';

type Props = {
  variant: 'operations' | 'full';
  id?: string;
};

/** Cadastro de funcionários / usuários do sistema (compartilhado entre Operações e ERP). */
export function TeamUsersSection({ variant, id }: Props) {
  const { user } = useAuth();
  const planAreas = useMemo(() => areasAvailableOnPlan(), []);
  const showSellerLink = variant === 'full' && hasModule('erp');
  const areaOptions = variant === 'operations' ? planAreas : ALL_ACCESS_AREAS;

  const [items, setItems] = useState(() => listEmployees());
  const [sellers] = useState(() => (showSellerLink ? listSellers(true) : []));
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [form, setForm] = useState({ ...EMPTY, accessAreas: defaultAccessForPlan() });
  const [mode, setMode] = useState<Mode>('new');
  const [formVisible, setFormVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [passwordHint, setPasswordHint] = useState('Sem senha local');

  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          matchesStatus(item.active, status) &&
          matchesQuery(
            `${item.name} ${item.email} ${item.userEmail} ${item.role} ${item.document}`,
            query,
          ),
      ),
    [items, query, status],
  );

  useEffect(() => {
    function refresh() {
      setItems(listEmployees());
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, refresh);
    window.addEventListener('marthi-erp-registry-updated', refresh);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, refresh);
      window.removeEventListener('marthi-erp-registry-updated', refresh);
    };
  }, []);

  const readOnly = mode === 'view';
  const loginEmail = (form.userEmail || form.email).trim().toLowerCase();

  useEffect(() => {
    if (!form.isSystemUser || !loginEmail) {
      setPasswordHint('Sem senha local');
      return;
    }
    setPasswordHint(getErpUserPasswordHint(loginEmail) ?? 'Sem senha local');
  }, [form.isSystemUser, loginEmail, formVisible, selectedId]);

  function resetForm() {
    setForm({ ...EMPTY, accessAreas: defaultAccessForPlan() });
    setSelectedId(undefined);
    setMode('new');
    setError('');
  }

  function closeForm() {
    resetForm();
    setFormVisible(false);
  }

  function startNew() {
    resetForm();
    setFormVisible(true);
  }

  function loadItem(item: Employee, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);
    setError('');
    setForm({
      name: item.name,
      phone: item.phone,
      email: item.email,
      document: item.document,
      role: item.role,
      isSystemUser: item.isSystemUser,
      userEmail: item.userEmail,
      accessAreas: item.accessAreas.filter((area) => areaOptions.includes(area)),
      active: item.active,
      sellerId: item.sellerId ?? '',
      accessPassword: '',
    });
  }

  function toggleArea(area: AccessArea) {
    if (readOnly) return;
    setForm((current) => {
      const has = current.accessAreas.includes(area);
      return {
        ...current,
        accessAreas: has
          ? current.accessAreas.filter((item) => item !== area)
          : [...current.accessAreas, area],
      };
    });
  }

  async function submit() {
    if (readOnly || !form.name.trim()) return;
    setError('');
    const accessAreas = form.accessAreas.filter((area) => areaOptions.includes(area));
    const result = await upsertEmployee({
      name: form.name,
      phone: form.phone,
      email: form.email,
      document: form.document,
      role: form.role,
      isSystemUser: form.isSystemUser,
      userEmail: form.isSystemUser ? form.userEmail || form.email : '',
      accessAreas,
      active: form.active,
      sellerId: form.sellerId || undefined,
      id: mode === 'edit' ? selectedId : undefined,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const email = (result.employee.userEmail || result.employee.email).trim().toLowerCase();
    if (form.isSystemUser && email && form.accessPassword.trim()) {
      try {
        setErpUserPassword(email, form.accessPassword);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar senha de acesso.');
        setItems(result.state.employees);
        return;
      }
    }

    setItems(result.state.employees);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: mode === 'edit' ? 'funcionario.atualizar' : 'funcionario.criar',
      detail: `${form.name} · usuário=${form.isSystemUser ? 'sim' : 'não'}`,
    });
    closeForm();
  }

  async function remove(item: Employee) {
    if (!confirmDelete(`o funcionário ${item.name}`)) return;
    const email = (item.userEmail || item.email).trim().toLowerCase();
    if (email) clearErpUserPassword(email);
    const state = await removeEmployee(item.id);
    setItems(state.employees);
    logAction({
      actorName: user?.name ?? 'Operador',
      actorEmail: user?.email ?? '',
      action: 'funcionario.excluir',
      detail: item.name,
    });
    if (selectedId === item.id) closeForm();
  }

  useEffect(() => {
    if (!formVisible || readOnly) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const headingActions = (
    <PageHeadingActions>
      {!formVisible ? (
        <HeadingNewButton
          onClick={startNew}
          label={variant === 'operations' ? 'Novo usuário' : 'Novo funcionário'}
        />
      ) : readOnly ? (
        <>
          <HeadingCancelButton onClick={closeForm} label="Fechar" />
          <HeadingEditButton onClick={() => setMode('edit')} />
        </>
      ) : (
        <>
          <HeadingCancelButton onClick={closeForm} />
          <HeadingSaveButton onClick={() => submit()} />
        </>
      )}
    </PageHeadingActions>
  );

  return (
    <div className={`ops-users ${variant === 'operations' ? 'ops-users--ops' : ''}`} id={id}>
      {headingActions}

      {!formVisible ? (
        <>
          <article className="admin-card">
            <h2>{variant === 'operations' ? 'Usuários da loja' : 'Funcionários'}</h2>
            {variant === 'operations' ? (
              <p>
                Cadastre quem pode entrar no sistema sem depender do ERP: e-mail de login, função e
                áreas liberadas conforme o plano.
              </p>
            ) : (
              <p>
                Cadastre o time, marque quem é usuário do sistema e defina as áreas liberadas. A{' '}
                <strong>senha de acesso local</strong> do ERP também fica neste cadastro (ou em
                Permissões).
              </p>
            )}
            <p className="empty" style={{ marginTop: 8 }}>
              A conta (Google/senha do backend) precisa existir; vincule o mesmo e-mail aqui.{' '}
              {variant === 'operations' && hasModule('erp') ? (
                <>
                  RH completo em <Link to="/erp/funcionarios">ERP → Funcionários</Link>. Áreas em{' '}
                  <Link to="/erp/permissoes">Permissões</Link>.
                </>
              ) : hasModule('erp') ? (
                <>
                  Ajuste rápido de áreas em <Link to="/erp/permissoes">Permissões</Link>.
                </>
              ) : null}
            </p>
          </article>

          <article className="admin-card">
            <CrudListBar
              query={query}
              onQueryChange={setQuery}
              placeholder="Buscar por nome ou e-mail…"
              status={status}
              onStatusChange={setStatus}
            />
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cargo</th>
                  <th>Usuário?</th>
                  <th>Login</th>
                  <th>Senha</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      Nenhum funcionário encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const email = (item.userEmail || item.email).trim().toLowerCase();
                    return (
                      <tr key={item.id}>
                        <td>
                          <CrudNameButton onClick={() => loadItem(item, 'view')}>
                            {item.name}
                          </CrudNameButton>
                        </td>
                        <td>{EMPLOYEE_ROLE_LABEL[item.role]}</td>
                        <td>{item.isSystemUser ? 'Sim' : 'Não'}</td>
                        <td>{item.isSystemUser ? item.userEmail || item.email || '—' : '—'}</td>
                        <td>
                          {item.isSystemUser && email
                            ? getErpUserPasswordHint(email)
                            : '—'}
                        </td>
                        <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                        <td className="admin-table__actions">
                          <CrudRowActions
                            onView={() => loadItem(item, 'view')}
                            onEdit={() => loadItem(item, 'edit')}
                            onDelete={() => remove(item)}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </article>
        </>
      ) : null}

      {formVisible ? (
        <article className="admin-card">
          <h2>
            {crudFormTitle(
              mode,
              variant === 'operations' ? 'usuário' : 'funcionário',
            )}
          </h2>
          <p>
            Marque <strong>É usuário do sistema</strong> para liberar login. O e-mail de login precisa
            ser o mesmo da conta Google/senha.
          </p>
          <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
            <label>
              Nome
              <input
                value={form.name}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Telefone
              <input
                value={form.phone}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              E-mail de contato
              <input
                value={form.email}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            {variant === 'full' ? (
              <label>
                CPF
                <input
                  value={form.document}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                />
              </label>
            ) : null}
            <AdminPicker
              label="Cargo"
              value={form.role}
              disabled={readOnly}
              options={(Object.keys(EMPLOYEE_ROLE_LABEL) as EmployeeRole[]).map((role) => ({
                value: role,
                label: EMPLOYEE_ROLE_LABEL[role],
              }))}
              onChange={(value) =>
                setForm({
                  ...form,
                  role: value as EmployeeRole,
                  accessAreas:
                    value === 'admin' ? [...ALL_ACCESS_AREAS] : form.accessAreas,
                })
              }
            />
            {showSellerLink ? (
              <AdminPicker
                label="Vendedor vinculado"
                value={form.sellerId}
                disabled={readOnly}
                placeholder="Nenhum"
                options={sellers.map((item) => ({ value: item.id, label: item.name }))}
                onChange={(value) => setForm({ ...form, sellerId: value })}
              />
            ) : null}
            <AdminPicker
              label="É usuário do sistema?"
              value={form.isSystemUser ? '1' : '0'}
              disabled={readOnly}
              options={[
                { value: '1', label: 'Sim — pode entrar no painel / apps' },
                { value: '0', label: 'Não — só registro interno' },
              ]}
              onChange={(value) =>
                setForm({
                  ...form,
                  isSystemUser: value === '1',
                  userEmail: value === '1' ? form.userEmail || form.email : '',
                })
              }
            />
            <AdminPicker
              label="Situação"
              value={form.active ? '1' : '0'}
              disabled={readOnly}
              options={[
                { value: '1', label: 'Ativo' },
                { value: '0', label: 'Inativo' },
              ]}
              onChange={(value) => setForm({ ...form, active: value === '1' })}
            />
            {form.isSystemUser ? (
              <label className="span-2">
                E-mail de login (deve bater com o usuário)
                <input
                  value={form.userEmail}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, userEmail: e.target.value })}
                  placeholder={user?.email ? `ex.: ${user.email}` : 'email@loja.com'}
                />
              </label>
            ) : null}
            {form.isSystemUser ? (
              <label className="span-2">
                Senha de acesso ERP (local)
                <input
                  type="password"
                  value={form.accessPassword}
                  disabled={readOnly}
                  autoComplete="new-password"
                  placeholder={
                    readOnly
                      ? passwordHint
                      : passwordHint === 'Definida'
                        ? 'Deixe em branco para manter · ou digite nova'
                        : 'Mínimo 4 caracteres'
                  }
                  onChange={(e) => setForm({ ...form, accessPassword: e.target.value })}
                />
              </label>
            ) : null}
          </div>

          {form.isSystemUser && form.role !== 'admin' ? (
            <div className="erp-access" style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.82rem', color: 'var(--mute)' }}>
                Áreas liberadas
                {variant === 'operations' ? ' (conforme seu plano)' : null}
              </h3>
              <div className="erp-access__grid">
                {areaOptions.map((area) => (
                  <label key={area} className="erp-access__item">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={form.accessAreas.includes(area)}
                      onChange={() => toggleArea(area)}
                    />
                    {ACCESS_AREA_LABEL[area]}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {form.role === 'admin' ? (
            <p className="empty" style={{ marginTop: 12 }}>
              Administrador tem acesso a todas as áreas do plano.
            </p>
          ) : null}

          {form.isSystemUser ? (
            <p className="empty" style={{ marginTop: 12 }}>
              Status da senha local: {passwordHint}. Também gerenciável em Painel ERP → Senhas de
              usuário.
            </p>
          ) : null}

          {error ? <p className="qty-low">{error}</p> : null}
        </article>
      ) : null}
    </div>
  );
}
