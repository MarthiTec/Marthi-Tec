import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AdminPicker } from '../../components/AdminPicker';
import {
  CrudListBar,
  CrudNameButton,
  CrudRowActions,
  matchesQuery,
  matchesStatus,
  type CrudStatusFilter,
} from '../../components/CrudKit';
import {
  HeadingCancelButton,
  HeadingEditButton,
  HeadingNewButton,
  HeadingSaveButton,
  PageHeadingActions,
} from '../../components/PageHeadingActions';
import { areasAvailableOnPlan } from '../../components/TeamUsersSection';
import { useAuth } from '../../contexts/AuthContext';
import { logAction } from '../../data/auditLog';
import { ERP_BOOTSTRAP_EVENT } from '../../data/erpBootstrap';
import {
  ACCESS_AREA_LABEL,
  ALL_ACCESS_AREAS,
  EMPLOYEE_ROLE_LABEL,
  findEmployeeByUserEmail,
  listEmployees,
  upsertEmployee,
  userIsStoreAdmin,
  type AccessArea,
  type Employee,
  type EmployeeRole,
} from '../../data/erpRegistry';
import {
  getErpUserPasswordHint,
  setErpUserPassword,
  clearErpUserPassword,
} from '../../data/erpUserPasswords';

type Mode = 'new' | 'edit' | 'view';

type FormState = {
  employeeId: string;
  role: EmployeeRole;
  userEmail: string;
  accessAreas: AccessArea[];
  accessPassword: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  employeeId: '',
  role: 'operator',
  userEmail: '',
  accessAreas: [],
  accessPassword: '',
  active: true,
};

function defaultAreas(): AccessArea[] {
  const available = areasAvailableOnPlan();
  const preferred: AccessArea[] = [];
  if (available.includes('pdv')) preferred.push('pdv');
  if (available.includes('os')) preferred.push('os');
  if (available.includes('totem')) preferred.push('totem');
  return preferred.length ? preferred : available.filter((a) => a !== 'erp_plan').slice(0, 3);
}

function areasSummary(item: Employee) {
  if (item.role === 'admin') return 'Acesso total';
  if (!item.accessAreas.length) return 'Nenhuma área';
  return item.accessAreas
    .slice(0, 3)
    .map((area) => ACCESS_AREA_LABEL[area])
    .join(', ')
    .concat(item.accessAreas.length > 3 ? ` +${item.accessAreas.length - 3}` : '');
}

export function PermissionsPage() {
  const { user } = useAuth();
  const isAdmin = userIsStoreAdmin(user?.email);
  const [tick, setTick] = useState(0);
  const employees = useMemo(() => listEmployees(), [tick]);
  const systemUsers = useMemo(
    () => employees.filter((item) => item.isSystemUser),
    [employees],
  );

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<CrudStatusFilter>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [mode, setMode] = useState<Mode>('new');
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, accessAreas: defaultAreas() });
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const me = findEmployeeByUserEmail(user?.email);
  const readOnly = mode === 'view';
  const loginEmail = form.userEmail.trim().toLowerCase();
  const passwordHint =
    formVisible && loginEmail ? getErpUserPasswordHint(loginEmail) ?? 'Sem senha local' : '—';

  const filtered = useMemo(
    () =>
      systemUsers.filter(
        (item) =>
          matchesStatus(item.active, status) &&
          matchesQuery(
            `${item.name} ${item.userEmail} ${item.email} ${item.role} ${item.accessAreas.join(' ')}`,
            query,
          ),
      ),
    [systemUsers, query, status],
  );

  /** Pessoas ainda sem acesso de sistema — para atrelar permissão. */
  const linkablePeople = useMemo(() => {
    if (mode === 'new') {
      return employees.filter((item) => item.active && !item.isSystemUser);
    }
    return employees.filter(
      (item) => item.id === selectedId || (item.active && !item.isSystemUser),
    );
  }, [employees, mode, selectedId]);

  useEffect(() => {
    function onRegistryUpdate() {
      refresh();
    }
    window.addEventListener(ERP_BOOTSTRAP_EVENT, onRegistryUpdate);
    window.addEventListener('marthi-erp-registry-updated', onRegistryUpdate);
    return () => {
      window.removeEventListener(ERP_BOOTSTRAP_EVENT, onRegistryUpdate);
      window.removeEventListener('marthi-erp-registry-updated', onRegistryUpdate);
    };
  }, []);

  useEffect(() => {
    if (!formVisible || readOnly || !isAdmin) return;
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        submit();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function refresh() {
    setTick((value) => value + 1);
  }

  function resetForm() {
    setForm({ ...EMPTY_FORM, accessAreas: defaultAreas() });
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
    setMessage('');
    setFormVisible(true);
  }

  function loadItem(item: Employee, nextMode: Mode) {
    setSelectedId(item.id);
    setMode(nextMode);
    setFormVisible(true);
    setMessage('');
    setError('');
    setForm({
      employeeId: item.id,
      role: item.role,
      userEmail: item.userEmail || item.email,
      accessAreas: item.role === 'admin' ? [...ALL_ACCESS_AREAS] : [...item.accessAreas],
      accessPassword: '',
      active: item.active,
    });
  }

  function pickPerson(employeeId: string) {
    const person = employees.find((item) => item.id === employeeId);
    if (!person) {
      setForm((current) => ({ ...current, employeeId }));
      return;
    }
    setForm((current) => ({
      ...current,
      employeeId,
      role: person.role,
      userEmail: person.userEmail || person.email || current.userEmail,
      accessAreas:
        person.role === 'admin'
          ? [...ALL_ACCESS_AREAS]
          : person.accessAreas.length
            ? [...person.accessAreas]
            : current.accessAreas.length
              ? current.accessAreas
              : defaultAreas(),
      active: person.active,
    }));
  }

  function toggleArea(area: AccessArea) {
    if (readOnly || form.role === 'admin') return;
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
    if (readOnly) return;
    setError('');
    setMessage('');

    const person =
      mode === 'new'
        ? employees.find((item) => item.id === form.employeeId)
        : employees.find((item) => item.id === selectedId);

    if (!person) {
      setError('Selecione a pessoa para atrelar o acesso.');
      return;
    }
    if (!form.userEmail.trim()) {
      setError('Informe o e-mail de login.');
      return;
    }

    const result = await upsertEmployee({
      id: person.id,
      name: person.name,
      phone: person.phone,
      email: person.email,
      document: person.document,
      role: form.role,
      isSystemUser: true,
      userEmail: form.userEmail,
      accessAreas: form.role === 'admin' ? [...ALL_ACCESS_AREAS] : form.accessAreas,
      active: form.active,
      sellerId: person.sellerId,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const email = (result.employee.userEmail || result.employee.email).trim().toLowerCase();
    if (form.accessPassword.trim()) {
      try {
        setErpUserPassword(email, form.accessPassword);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar senha de acesso.');
        refresh();
        return;
      }
    }

    logAction({
      actorName: user?.name ?? 'Admin',
      actorEmail: user?.email ?? '',
      action: mode === 'new' ? 'permissoes.vincular' : 'permissoes.atualizar',
      detail: `${result.employee.name} · ${email}`,
    });

    refresh();
    setMessage(
      mode === 'new'
        ? `Acesso vinculado a ${result.employee.name}.`
        : `Permissões de ${result.employee.name} atualizadas.`,
    );
    closeForm();
  }

  async function revoke(item: Employee) {
    if (
      !window.confirm(
        `Remover o acesso de sistema de ${item.name}? O cadastro de funcionário permanece.`,
      )
    ) {
      return;
    }
    const email = (item.userEmail || item.email).trim().toLowerCase();
    const result = await upsertEmployee({
      id: item.id,
      name: item.name,
      phone: item.phone,
      email: item.email,
      document: item.document,
      role: item.role,
      isSystemUser: false,
      userEmail: '',
      accessAreas: [],
      active: item.active,
      sellerId: item.sellerId,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (email) clearErpUserPassword(email);
    logAction({
      actorName: user?.name ?? 'Admin',
      actorEmail: user?.email ?? '',
      action: 'permissoes.revogar',
      detail: item.name,
    });
    refresh();
    setMessage(`Acesso removido de ${item.name}.`);
    if (selectedId === item.id) closeForm();
  }

  if (!isAdmin) {
    return <Navigate to="/painel" replace />;
  }

  return (
    <section className="admin-page">
      <PageHeadingActions>
        {!formVisible ? (
          <HeadingNewButton onClick={startNew} label="Novo vínculo" />
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

      {!formVisible ? (
        <>
          <article className="admin-card">
            <h2>Permissões de acesso</h2>
            <p>
              Atrele áreas e senha de acesso ERP a uma pessoa já cadastrada em{' '}
              <Link to="/erp/funcionarios">Funcionários</Link>. Use <strong>Novo vínculo</strong> para
              liberar login a quem ainda não é usuário do sistema.
            </p>
            {me ? (
              <p className="empty" style={{ marginTop: 8 }}>
                Seu vínculo: {me.name} · {EMPLOYEE_ROLE_LABEL[me.role]} · {me.userEmail || me.email}
              </p>
            ) : (
              <p className="empty" style={{ marginTop: 8 }}>
                Nenhum funcionário vinculado ao seu login — vincule o e-mail em Funcionários ou aqui.
              </p>
            )}
          </article>

          {message ? <p className="empty">{message}</p> : null}
          {error ? <p className="qty-low">{error}</p> : null}

          <article className="admin-card">
            <CrudListBar
              query={query}
              onQueryChange={setQuery}
              placeholder="Buscar usuário ou área…"
              status={status}
              onStatusChange={setStatus}
            />
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Login</th>
                  <th>Cargo</th>
                  <th>Áreas</th>
                  <th>Senha ERP</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="empty">
                      Nenhum usuário com acesso. Cadastre o funcionário e use Novo vínculo.
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
                        <td>{item.userEmail || item.email || '—'}</td>
                        <td>{EMPLOYEE_ROLE_LABEL[item.role]}</td>
                        <td>{areasSummary(item)}</td>
                        <td>{email ? getErpUserPasswordHint(email) : '—'}</td>
                        <td>{item.active ? 'Ativo' : 'Inativo'}</td>
                        <td className="admin-table__actions">
                          <CrudRowActions
                            onView={() => loadItem(item, 'view')}
                            onEdit={() => loadItem(item, 'edit')}
                            onDelete={() => revoke(item)}
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
            {mode === 'new'
              ? 'Novo vínculo de acesso'
              : mode === 'view'
                ? 'Consultar permissão'
                : 'Editar permissão'}
          </h2>
          <p>
            Escolha a pessoa, o e-mail de login, as áreas liberadas e (opcional) a senha local de
            retaguarda do ERP.
          </p>

          <div className={`admin-form ${readOnly ? 'is-readonly' : ''}`}>
            {mode === 'new' ? (
              <AdminPicker
                label="Pessoa (funcionário)"
                value={form.employeeId}
                disabled={readOnly}
                placeholder={
                  linkablePeople.length
                    ? 'Selecione quem receberá o acesso'
                    : 'Nenhum funcionário sem acesso — cadastre em Funcionários'
                }
                options={linkablePeople.map((item) => ({
                  value: item.id,
                  label: `${item.name}${item.email ? ` · ${item.email}` : ''}`,
                }))}
                onChange={pickPerson}
              />
            ) : (
              <label>
                Pessoa
                <input
                  value={employees.find((item) => item.id === selectedId)?.name ?? ''}
                  disabled
                  readOnly
                />
              </label>
            )}

            <label>
              E-mail de login
              <input
                value={form.userEmail}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, userEmail: e.target.value })}
                placeholder="mesmo e-mail da conta Google/senha"
              />
            </label>

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
          </div>

          {form.role === 'admin' ? (
            <p className="empty" style={{ marginTop: 12 }}>
              Administrador tem acesso total, incluindo plano da loja.
            </p>
          ) : (
            <div className="erp-access" style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.82rem', color: 'var(--mute)' }}>
                Áreas liberadas
              </h3>
              <div className="erp-access__grid">
                {ALL_ACCESS_AREAS.map((area) => (
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
          )}

          <p className="empty" style={{ marginTop: 12 }}>
            Status da senha local: {passwordHint}. Também disponível em Painel ERP → Senhas de
            usuário.
          </p>

          {mode === 'new' && linkablePeople.length === 0 ? (
            <p className="qty-low">
              Cadastre a pessoa em <Link to="/erp/funcionarios">Funcionários</Link> (sem marcar
              usuário do sistema) e volte aqui para atrelar o acesso — ou marque usuário já no
              cadastro do funcionário.
            </p>
          ) : null}

          {error ? <p className="qty-low">{error}</p> : null}
        </article>
      ) : null}
    </section>
  );
}
